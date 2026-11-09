// ==UserScript==
// @name         股市爆料同學會-輔助工具
// @namespace    http://tampermonkey.net/
// @version      3.9.0
// @description  架構躍進版：智慧零點擊Profile路由、Google試算表雲端同步、雙欄拓寬佈局、失焦複製防禦與批次防踩踏
// @author       AI Helper & Architect
// @match        *://www.cmoney.tw/forum/watchlist*
// @match        *://www.cmoney.tw/forum/stock/*
// @match        *://www.cmoney.tw/forum/market*
// @icon         https://pic.imgdd.cc/item/698340fcd9c88c98816d3f74.png
// @homepage     https://greasyfork.org/zh-TW/scripts/570486
// @updateURL    https://update.greasyfork.org/scripts/570486/%E8%82%A1%E5%B8%82%E7%88%86%E6%96%99%E5%90%8C%E5%AD%B8%E6%9C%83-%E8%BC%94%E5%8A%A9%E5%B7%A5%E5%85%B7.meta.js
// @downloadURL  https://update.greasyfork.org/scripts/570486/%E8%82%A1%E5%B8%82%E7%88%86%E6%96%99%E5%90%8C%E5%AD%B8%E6%9C%83-%E8%BC%94%E5%8A%A9%E5%B7%A5%E5%85%B7.user.js
// @license      MIT
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_setClipboard
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      docs.google.com
// @connect      googleusercontent.com
// @connect      google.com
// @run-at       document-start
// ==/UserScript==


// --- 0. 資料攔截層 (XHR & Fetch 雙軌攔截器) ---
window.__cm_kline_data_cache = null; 
(function setupNetworkInterceptor() {
    const targetWindow = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
    
    // [1] XHR 攔截 (相容舊版與部分框架)
    const origOpen = targetWindow.XMLHttpRequest.prototype.open;
    const origSend = targetWindow.XMLHttpRequest.prototype.send;
    
    targetWindow.XMLHttpRequest.prototype.open = function(method, url) {
        this._reqUrl = url;
        const targetUrl = String(url || "");
        if (targetUrl.includes('GetDtnoData.ashx') || targetUrl.includes('/dtno/JsonCsv')) {
            window.__cm_kline_data_cache = null;
        }
        return origOpen.apply(this, arguments);
    };
    
    targetWindow.XMLHttpRequest.prototype.send = function() {
        this.addEventListener('load', function() {
            const targetUrl = String(this._reqUrl || "");
            if ((targetUrl.includes('GetDtnoData.ashx') || targetUrl.includes('/dtno/JsonCsv')) && this.status === 200) {
                try {
                    let res = null;
                    if (this.responseType === 'json') {
                        res = this.response;
                    } else if (this.responseType === '' || this.responseType === 'text') {
                        const text = this.responseText;
                        if (text && typeof text === 'string') { res = JSON.parse(text); }
                    }
                    processInterceptedData(res);
                } catch (e) {
                    console.warn('CM Scraper XHR Parse Error:', e);
                }
            }
        });
        return origSend.apply(this, arguments);
    };


    // [2] Fetch 攔截 (防禦框架現代化轉移)
    const origFetch = targetWindow.fetch;
    if (origFetch) {
        targetWindow.fetch = async function() {
            let requestUrl = "";
            if (typeof arguments[0] === "string" || arguments[0] instanceof URL) {
                requestUrl = String(arguments[0]);
            } else if (arguments[0] && typeof arguments[0].url === "string") {
                requestUrl = arguments[0].url;
            }
            
            if (requestUrl.includes('GetDtnoData.ashx') || requestUrl.includes('/dtno/JsonCsv')) {
                window.__cm_kline_data_cache = null;
            }
            
            const response = await origFetch.apply(this, arguments);
            const clone = response.clone();
            
            if (requestUrl.includes('GetDtnoData.ashx') || requestUrl.includes('/dtno/JsonCsv')) {
                clone.text().then(text => {
                    try {
                        const res = JSON.parse(text);
                        processInterceptedData(res);
                    } catch(e) {}
                });
            }
            return response;
        };
    }


    // [3] 資料降級轉換引擎 (自動適配新舊版 API 給底層 Parser)
    function processInterceptedData(res) {
        if (!res) return;
        
        // 舊版格式 (純陣列)
        if (Array.isArray(res.Data) && Array.isArray(res.Title)) {
            window.__cm_kline_data_cache = res;
        } 
        // 新版格式 (JsonCsv)
        else if (res.columns && res.rows && Array.isArray(res.rows)) {
            const titleKeys = Object.keys(res.columns);
            const dateIdx = titleKeys.findIndex(k => k.includes("日期"));
            window.__cm_kline_data_cache = {
                Title: titleKeys,
                Data: res.rows.map(row => {
                    let newRow = [...row];
                    if (dateIdx !== -1 && newRow[dateIdx] != null) {
                        let dStr = String(newRow[dateIdx]);
                        // 將 20260611 自動補上斜線變為 2026/06/11
                        if (dStr.length === 8 && !dStr.includes('/') && !dStr.includes('-')) {
                            newRow[dateIdx] = dStr.substring(0,4) + '/' + dStr.substring(4,6) + '/' + dStr.substring(6,8);
                        } else if (dStr.length === 7 && !dStr.includes('/') && !dStr.includes('-')) {
                            newRow[dateIdx] = dStr.substring(0,3) + '/' + dStr.substring(3,5) + '/' + dStr.substring(5,7);
                        }
                    }
                    return newRow;
                })
            };
        }
    }
})();


// --- 主程式封裝 ---
function initMainApp() {
    'use strict';


    function safeInt(val, fallback) {
        const parsed = parseInt(val, 10);
        return isNaN(parsed) ? fallback : parsed;
    }


    function escapeHtml(str) {
        if (str == null) return "";
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }


    const DEFAULT_SHEET_URL = "https://docs.google.com/spreadsheets/d/1UzJHDONTLNPJiH2nQ_Wau50hLQSf2jV6Fe_RexTWU_I/edit?usp=sharing";


    const CONFIG = {
        eps: safeInt(GM_getValue("limit_eps", 12), 12),
        revenue: safeInt(GM_getValue("limit_rev", 12), 12),
        income: safeInt(GM_getValue("limit_income", 8), 8),
        balance: safeInt(GM_getValue("limit_balance", 8), 8),
        cashflow: safeInt(GM_getValue("limit_cashflow", 12), 12),
        div_stock: safeInt(GM_getValue("limit_div_stock", 7), 7),
        div_etf: safeInt(GM_getValue("limit_div_etf", 24), 24),
        pepb: safeInt(GM_getValue("limit_pepb", 60), 60),
        constituents: safeInt(GM_getValue("limit_const", 10), 10),
        discount: safeInt(GM_getValue("limit_discount", 10), 10),
        drawdown: safeInt(GM_getValue("limit_drawdown", 10), 10),
        shareholding: safeInt(GM_getValue("limit_share", 20), 20),
        stockfindetail: safeInt(GM_getValue("limit_fin", 12), 12),
        div_comp: safeInt(GM_getValue("limit_divcomp", 12), 12),
        kline_days: safeInt(GM_getValue("limit_kline", 60), 60),
        market_kline_days: safeInt(GM_getValue("limit_market_kline", 60), 60),
        kline_type: GM_getValue("cm_kline_type", "week"),
        kline_sort: GM_getValue("cm_kline_sort", "desc"),
        white_list: GM_getValue("white_list", "2330,2317"),
        black_list: GM_getValue("black_list", "0050,006208"),
        font_offset: safeInt(GM_getValue("font_offset", 0), 0),
        drawer_top: safeInt(GM_getValue("drawer_top", 200), 200),
        drawer_side: GM_getValue("cm_drawer_side", "right"),
        panel_pos: GM_getValue("panel_pos", {top: 150, left: 200}),
        is_panel_open: GM_getValue("is_panel_open", false),
        left_open: GM_getValue("cm_left_open", false),
        right_open: GM_getValue("cm_right_open", false),
        current_cat_id: safeInt(GM_getValue("cm_current_cat_id", 0), 0),
        current_profile_id: safeInt(GM_getValue("cm_current_profile_id", 4), 4),
        hotkey_single: GM_getValue("cm_hk_single", "F7"),
        hotkey_batch: GM_getValue("cm_hk_batch", "F8"),
        hotkey_recopy: GM_getValue("cm_hk_recopy", "F9"),
        sync_sheet_url: GM_getValue("cm_sync_sheet_url", DEFAULT_SHEET_URL),
        default_stock_prof: safeInt(GM_getValue("cm_default_stock_prof", 4), 4),
        default_etf_prof: safeInt(GM_getValue("cm_default_etf_prof", 10), 10)
    };


    const DEFAULT_ACC_STATE = {
        'acc-basic': true, 'acc-finance': true, 'acc-chip': true, 'acc-etf': true, 'acc-tech': true,
        'acc-cfg-fin': true, 'acc-cfg-etf': true, 'acc-cfg-chip': true
    };
    const ACC_STATE = GM_getValue("cm_acc_state", DEFAULT_ACC_STATE);


    // 出廠真理源定錨：v3.9.0 配置
    const DEFAULT_CATEGORIES = [
        {
            catId: 0,
            catName: "存股",
            profiles: [
                {
                    id: 4,
                    name: "全方位財報掃描",
                    modules: ["profile", "realtime", "kline", "market_kline", "eps", "revenue", "income-statement", "balance-sheet", "stockfindetail", "revenue-source", "cash-flow", "financial-ratio", "pe", "pb", "dividend", "shareholding", "institutional-target"],
                    kline_cfg: { stock_type: "week", stock_limit: 60, market_type: "week", market_limit: 60 }
                },
                {
                    id: 0,
                    name: "營收成長健檢",
                    modules: ["profile", "realtime", "kline", "market_kline", "eps", "revenue", "income-statement", "stockfindetail", "revenue-source", "dividend", "pe", "institutional-target"],
                    kline_cfg: { stock_type: "week", stock_limit: 24, market_type: "week", market_limit: 24 }
                },
                {
                    id: 1,
                    name: "存股領息防護網",
                    modules: ["profile", "realtime", "kline", "market_kline", "dividend", "eps", "balance-sheet", "cash-flow", "financial-ratio", "pb", "revenue-source"],
                    kline_cfg: { stock_type: "week", stock_limit: 52, market_type: "week", market_limit: 52 }
                },
                {
                    id: 2,
                    name: "高股息/REITs專用",
                    modules: ["profile", "realtime", "kline", "market_kline", "dividend", "pb", "balance-sheet", "cash-flow", "financial-ratio", "revenue-source"],
                    kline_cfg: { stock_type: "month", stock_limit: 36, market_type: "week", market_limit: 52 }
                },
                {
                    id: 3,
                    name: "睡夢狙擊/底部尋寶",
                    modules: ["realtime", "kline", "market_kline", "pb", "pe", "balance-sheet", "stockfindetail", "cash-flow", "revenue-source", "shareholding", "institutional-target"],
                    kline_cfg: { stock_type: "month", stock_limit: 60, market_type: "week", market_limit: 60 }
                }
            ]
        },
        {
            catId: 1,
            catName: "衛星",
            profiles: [
                { "id": 5, "name": "波段群組 1 (動能突破)", "modules": ["realtime", "kline", "market_kline", "revenue", "eps", "stockfindetail", "shareholding", "pe", "revenue-source"], "kline_cfg": { "stock_type": "day", "stock_limit": 60, "market_type": "day", "market_limit": 60 } },
                { "id": 6, "name": "波段群組 2 (籌碼狙擊)", "modules": ["realtime", "kline", "market_kline", "shareholding", "revenue", "eps"], "kline_cfg": { "stock_type": "day", "stock_limit": 40, "market_type": "day", "market_limit": 40 } },
                { "id": 7, "name": "波段群組 3", "modules": ["realtime", "kline", "market_kline", "revenue", "eps", "stockfindetail", "shareholding", "revenue-source"], "kline_cfg": { "stock_type": "day", "stock_limit": 60, "market_type": "day", "market_limit": 60 } },
                { "id": 8, "name": "波段群組 4", "modules": ["realtime", "kline", "market_kline", "revenue", "eps", "stockfindetail", "shareholding", "revenue-source"], "kline_cfg": { "stock_type": "day", "stock_limit": 60, "market_type": "day", "market_limit": 60 } },
                { "id": 9, "name": "波段群組 5", "modules": ["realtime", "kline", "market_kline", "revenue", "eps", "stockfindetail", "shareholding", "revenue-source"], "kline_cfg": { "stock_type": "day", "stock_limit": 60, "market_type": "day", "market_limit": 60 } }
            ]
        },
        {
            catId: 2,
            catName: "ETF專區",
            profiles: [
                { "id": 10, "name": "市值型 ETF 分析", "modules": ["profile", "realtime", "kline", "market_kline", "constituent", "discount", "trading-fee", "risk", "drawdown", "dividend"], "kline_cfg": { "stock_type": "week", "stock_limit": 52, "market_type": "week", "market_limit": 52 } },
                { "id": 11, "name": "高股息 ETF 分析", "modules": ["profile", "realtime", "kline", "market_kline", "constituent", "discount", "div_comp", "trading-fee", "risk", "drawdown", "dividend"], "kline_cfg": { "stock_type": "week", "stock_limit": 52, "market_type": "week", "market_limit": 52 } },
                { "id": 12, "name": "債券型 ETF 分析", "modules": ["profile", "realtime", "kline", "market_kline", "constituent", "discount", "div_comp", "trading-fee", "risk", "drawdown", "dividend"], "kline_cfg": { "stock_type": "week", "stock_limit": 52, "market_type": "week", "market_limit": 52 } },
                { "id": 13, "name": "主動式 / 產業 ETF", "modules": ["profile", "realtime", "kline", "market_kline", "constituent", "discount", "trading-fee", "risk", "drawdown", "dividend"], "kline_cfg": { "stock_type": "week", "stock_limit": 52, "market_type": "week", "market_limit": 52 } },
                { "id": 14, "name": "自訂 ETF 組合", "modules": ["profile", "realtime", "kline", "market_kline", "constituent", "discount", "div_comp", "trading-fee", "risk", "drawdown", "dividend"], "kline_cfg": { "stock_type": "week", "stock_limit": 52, "market_type": "week", "market_limit": 52 } }
            ]
        }
    ];


    let CATEGORIES = GM_getValue("cm_scrape_categories", DEFAULT_CATEGORIES);
    if (!Array.isArray(CATEGORIES) || CATEGORIES.length === 0 || !CATEGORIES.every(c => Array.isArray(c.profiles))) {
        CATEGORIES = DEFAULT_CATEGORIES;
    }


    // 原子化儲存 CATEGORIES 守衛函式 (FIX-03)
    function saveCategories(mutatorFn) {
        let currentCats = GM_getValue("cm_scrape_categories", DEFAULT_CATEGORIES);
        if (!Array.isArray(currentCats) || currentCats.length === 0 || !currentCats.every(c => Array.isArray(c.profiles))) {
            currentCats = JSON.parse(JSON.stringify(DEFAULT_CATEGORIES));
        }
        if (typeof mutatorFn === 'function') {
            mutatorFn(currentCats);
        }
        CATEGORIES = currentCats;
        GM_setValue("cm_scrape_categories", currentCats);
    }


    let isExpanded = GM_getValue("isExpanded", true);
    let lastUrl = location.href;
    let batchMonitorTimer = null;
    let singleScrapePoller = null; 
    let lastSniffedStockId = "";
    let userManuallySelectedProfile = false;


    GM_registerMenuCommand("🔄 重置面板位置 (尋回 UI)", function() {
        const defaultPos = { top: 150, left: 200 };
        GM_setValue("panel_pos", defaultPos);
        GM_setValue("drawer_top", 200);


        const panel = document.getElementById('cm-main-panel');
        if (panel) {
            panel.style.top = defaultPos.top + 'px';
            panel.style.left = defaultPos.left + 'px';
        }
        const btn = document.getElementById('cm-drawer-btn');
        if (btn) btn.style.top = '200px';
        showToast("✅ 面板位置已重置為預設座標");
    });


    function getDynamicUIParams() {
        const off = CONFIG.font_offset;
        return {
            f11: 11 + 2 + off,
            f12: 12 + 2 + off,
            f13: 13 + 2 + off,
            f14: 14 + 2 + off,
            f18: 18 + 2 + off,
            f24: 24 + 2 + off,
            centerW: 460 + (off * 16),
            drawerW: 260 + (off * 12),
            cbSize: 14 + off
        };
    }


    function injectStyles() {
        const ui = getDynamicUIParams();
        const drawerPosCss = CONFIG.drawer_side === 'left' ? 'left: 0; border-radius: 0 12px 12px 0;' : 'right: 0; border-radius: 12px 0 0 12px;';


        GM_addStyle(`
            :root { --cm-fs: ${ui.f14}px; --cm-hfs: ${ui.f18}px; }
            .selectBar__options, .selectBar__menu { z-index: 999999 !important; }
            body.cm-liberator-active #StockRevPanel { max-width: none !important; width: 100% !important; }
            body.cm-liberator-active main > div > div:nth-child(2) { max-width: 96vw !important; width: auto !important; flex: 1 0 auto !important; }
            body.cm-liberator-active .dividend__wrapper--table, body.cm-liberator-active .reinvestment__table, body.cm-liberator-active .legalPerson__table, body.cm-liberator-active .revenueSource__table, body.cm-liberator-active #StockRevPanel section > div > section, body.cm-liberator-active .stockPanel__view section, body.cm-liberator-active .stockPanel__view section > div > section { overflow-x: visible !important; overflow-y: visible !important; max-width: none !important; display: block !important; position: relative !important; width: auto !important; }
            body.cm-liberator-active thead { position: sticky !important; top: 0 !important; z-index: 110 !important; transform: none !important; background-color: #1a1a1a !important; }
            body.cm-liberator-active thead th, body.cm-liberator-active thead tr { background-color: #262626 !important; color: #fff !important; transform: none !important; border-bottom: 2px solid #444 !important; }
            body.cm-liberator-active table { width: max-content !important; min-width: 100% !important; border-collapse: separate !important; }

            #cm-drawer-btn { position: fixed; ${drawerPosCss} top: ${CONFIG.drawer_top}px; width: 45px; height: 55px; background: #fcc111; color: #000; display: ${CONFIG.is_panel_open ? 'none' : 'flex'}; align-items: center; justify-content: center; cursor: move; z-index: 999999; user-select: none; font-size: ${ui.f24}px; box-shadow: -2px 0 10px rgba(0,0,0,0.5); }

            #cm-main-panel { position: fixed; top: ${CONFIG.panel_pos.top}px; left: ${CONFIG.panel_pos.left}px; background: #262626; color: #fcc111; border: 2px solid #fcc111; z-index: 999998; border-radius: 12px; box-shadow: 0 8px 30px rgba(0,0,0,0.7); display: ${CONFIG.is_panel_open ? 'flex' : 'none'}; flex-direction: column; overflow: hidden; }
            #cm-panel-head { background: #333; padding: 10px 15px; cursor: move; display: flex; justify-content: space-between; align-items: center; font-size: var(--cm-hfs); font-weight: bold; border-bottom: 1px solid #444; flex-shrink: 0 !important; }

            .cc-drawer-row { display: flex; align-items: flex-start; justify-content: center; background: #262626; }
            .cc-center-stage { 
                flex-shrink: 0; 
                width: ${ui.centerW}px; 
                display: flex; 
                flex-direction: column; 
                padding: 12px; 
                max-height: 85vh !important; 
                overflow-y: auto !important; 
                overflow-x: hidden !important; 
                box-sizing: border-box !important; 
            }
            .cc-center-stage::-webkit-scrollbar { width: 6px; }
            .cc-center-stage::-webkit-scrollbar-track { background: #262626; }
            .cc-center-stage::-webkit-scrollbar-thumb { background: #555; border-radius: 3px; }
            .cc-center-stage::-webkit-scrollbar-thumb:hover { background: #777; }

            .cc-drawer { width: 0px; opacity: 0; overflow: hidden; transition: width 0.3s ease, opacity 0.2s ease, margin 0.3s ease; background: #1f1f1f; }
            .cc-drawer.open { width: ${ui.drawerW}px; opacity: 1; border-left: 1px solid #444; border-right: 1px solid #444; }
            .cc-drawer-content { width: ${ui.drawerW}px; box-sizing: border-box; padding: 12px; max-height: 80vh; overflow-y: auto; overflow-x: hidden; }

            .cm-conf-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; color: #aaa; font-size: ${ui.f13}px; }
            .cm-conf-input { width: 45px; background: #444; color: #fff; border: 1px solid #666; text-align: center; border-radius: 4px; font-size: ${ui.f13}px; padding: 2px; }
            .cm-conf-select { flex:1; background: #444; color: #fff; border: 1px solid #666; border-radius: 4px; font-size: ${ui.f13}px; padding: 2px; max-width: 130px; text-align:right;}
            .cm-list-area { width: 100%; min-height: 40px; background: #333; color: #ccc; border: 1px solid #555; font-size: ${ui.f12}px; margin-top: 3px; resize: vertical; padding: 5px; border-radius: 4px; box-sizing: border-box; font-family: monospace; }

            .cm-json-title { font-size: ${ui.f14}px; font-weight:bold; color:#fcc111; margin-top:12px; border-bottom:1px solid #444; padding-bottom:3px; }

            .cm-profile-area { background: #333; padding: 10px; border-radius: 8px; border: 1px solid #555; margin-bottom: 10px; flex-shrink: 0 !important; }

            .cm-profile-header { display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px; }
            .cm-header-row { display: flex; gap: 6px; align-items: center; height: 30px; }
            .cm-header-row select { flex: 1; background: #444; color: #fff; border: 1px solid #666; border-radius: 4px; font-size: ${ui.f13}px; padding: 0 6px; box-sizing: border-box; height: 100%; min-width: 0; }
            .cm-btn-rename { background: #444; color: #fcc111; border: 1px solid #666; border-radius: 4px; font-size: ${ui.f12}px; cursor: pointer; height: 100%; padding: 0 8px; box-sizing: border-box; transition: 0.2s; display: flex; align-items: center; justify-content: center; font-weight: bold; white-space: nowrap; flex-shrink: 0; }
            .cm-btn-rename:hover { background: #555; color: #fff; }

            /* 雙欄 Grid 佈局 */
            .cm-checkbox-area-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
            .cm-grid-full { grid-column: span 2; }
            .cm-grid-left { grid-column: 1; }
            .cm-grid-right { grid-column: 2; }

            .cm-checkbox-grid { display: grid; grid-template-columns: 1fr; gap: 6px; }
            .cm-cb-label { font-size: ${ui.f13}px; color: #ddd; display: flex; align-items: center; gap: 4px; cursor: pointer; user-select: none; }
            .cm-cb-input { accent-color: #fcc111; width: ${ui.cbSize}px; height: ${ui.cbSize}px; cursor: pointer; }

            .cm-btn { width: 100%; padding: 8px; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: ${ui.f14}px; margin-bottom: 8px; transition: filter 0.2s; flex-shrink: 0 !important; }
            .cm-btn:hover { filter: brightness(1.1); }
            .cm-btn:disabled { filter: grayscale(0.8); cursor: not-allowed; }
            .cm-btn-save { background: #28a745; color: #fff; font-size: ${ui.f13}px; }
            .cm-btn-batch { background: #007bff; color: #fff; font-size: ${ui.f14}px; }
            .cm-btn-single { background: #fcc111; color: #000; }

            .cm-json-btn-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin-top: 5px; }
            .cm-json-btn { padding: 4px 0; background: #555; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: ${ui.f12}px; font-weight: bold; }
            .cm-json-btn:hover { background: #777; }

            .cm-toggle-btn { background: transparent; border: 1px solid #fcc111; color: #fcc111; border-radius: 4px; cursor: pointer; padding: 2px 8px; font-size: ${ui.f12}px; font-weight: bold; transition: 0.2s; }
            .cm-toggle-btn:hover { background: #fcc111; color: #000; }

            .cm-toast { position: fixed; bottom: 50px; left: 50%; transform: translateX(-50%); background: rgba(0, 180, 0, 0.9); color: white; padding: 12px 24px; border-radius: 50px; z-index: 1000000; font-weight: bold; box-shadow: 0 4px 15px rgba(0,0,0,0.5); transition: opacity 0.5s; font-size: ${ui.f14}px;}
            #cm-status-bar { font-size: ${ui.f13}px; color: #fcc111; text-align: center; font-weight: bold; margin-top: 5px; flex-shrink: 0 !important; }

            #cm-single-wrapper { flex-shrink: 0 !important; }

            #cm-worker-overlay { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.8); z-index: 9999999; display: flex; align-items: center; justify-content: center; flex-direction: column; color: #fff; font-size: ${ui.f14}px;}
            .cm-spinner { border: 8px solid #333; border-top: 8px solid #fcc111; border-radius: 50%; width: 60px; height: 60px; animation: cm-spin 1s linear infinite; margin-bottom: 20px; }
            @keyframes cm-spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }

            /* 呼吸燈動畫 */
            @keyframes cm-flash-pulse {
                0% { transform: scale(1); box-shadow: 0 0 0 rgba(23, 162, 184, 0); }
                50% { transform: scale(1.03); box-shadow: 0 0 12px rgba(23, 162, 184, 0.8); }
                100% { transform: scale(1); box-shadow: 0 0 0 rgba(23, 162, 184, 0); }
            }
            .cm-btn-pulse {
                animation: cm-flash-pulse 1.2s infinite ease-in-out !important;
                border: 2px solid #fff !important;
            }

            /* HTML5 Accordion UI Specs */
            details { background: #333; margin-bottom: 5px; border-radius: 6px; border: 1px solid #555; }
            summary { padding: 8px; cursor: pointer; font-weight: bold; color: #fcc111; user-select: none; outline: none; list-style: none; }
            summary::-webkit-details-marker { display: none; }
            summary::before { content: '▶ '; font-size: 12px; display: inline-block; transition: 0.3s; }
            details[open] summary::before { transform: rotate(90deg); }
            details > div { padding: 8px; border-top: 1px solid #555; background: #262626; border-radius: 0 0 6px 6px; }
        `);
    }


    function showToast(msg, type = "success") {
        const t = document.createElement('div'); t.className = 'cm-toast';
        if (msg.includes('⚠️') || type === 'error') t.style.background = 'rgba(220, 53, 69, 0.9)';
        t.innerText = msg;
        document.body.appendChild(t);
        setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 2500); }, 2500);
    }


    function getMetaHeader(doc, reportName) {
        let name = doc.querySelector('.stockData__name')?.innerText.trim();
        if (!name) name = window.location.pathname.includes('/market') ? "加權指數" : "未知名稱";
        const id = doc.querySelector('.stockData__id')?.innerText.trim() || (window.location.pathname.includes('/market') ? "TAIEX" : "");
        const time = doc.querySelector('.stockData__update span')?.innerText.trim() || "未知";
        return `【${name} (${id}) | ${reportName} | ${time}】`;
    }


    function getAutoLimit(moduleKey, forceCode = null, ignoreOverride = false) {
        if (!ignoreOverride) {
            const overrideInput = document.getElementById('cm-override-limit');
            if (overrideInput && overrideInput.value) {
                const overrideValue = parseInt(overrideInput.value, 10);
                if (!isNaN(overrideValue) && overrideValue > 0) {
                    return overrideValue;
                }
            }
        }


        if (moduleKey === "market_kline") {
            const mkEl = document.getElementById('cfg-prof-market-kdays');
            return mkEl ? safeInt(mkEl.value, CONFIG.market_kline_days) : CONFIG.market_kline_days;
        }


        if (moduleKey === "kline") {
            const skEl = document.getElementById('cfg-prof-stock-kdays');
            return skEl ? safeInt(skEl.value, CONFIG.kline_days) : CONFIG.kline_days;
        }


        const code = forceCode || (window.location.pathname.match(/\/stock\/(\w+)/) || [])[1] || "";
        if (moduleKey === "eps") return CONFIG.eps;
        if (moduleKey === "revenue") return CONFIG.revenue;
        if (moduleKey === "income-statement") return CONFIG.income;
        if (moduleKey === "balance-sheet") return CONFIG.balance;
        if (moduleKey === "cash-flow") return CONFIG.cashflow;
        if (moduleKey === "pe" || moduleKey === "pb") return CONFIG.pepb;
        if (moduleKey === "discount") return CONFIG.discount;
        if (moduleKey === "drawdown") return CONFIG.drawdown;
        if (moduleKey === "constituent") return CONFIG.constituents;
        if (moduleKey === "shareholding") return CONFIG.shareholding;
        if (moduleKey === "stockfindetail") return CONFIG.stockfindetail;
        if (moduleKey === "div_comp") return CONFIG.div_comp;
        if (moduleKey === "dividend") {
            const wList = CONFIG.white_list.split(',').map(s=>s.trim()).filter(Boolean);
            const bList = CONFIG.black_list.split(',').map(s=>s.trim()).filter(Boolean);
            const isETF = code.startsWith('00') || wList.includes(code);
            const isAnnual = bList.includes(code);
            return (isETF && !isAnnual) ? CONFIG.div_etf : CONFIG.div_stock;
        }
        return 12;
    }


    function getCurrentPageModule() {
        const path = window.location.pathname;
        const s = new URLSearchParams(window.location.search).get('s');
        if (path.includes('watchlist')) return "watchlist";
        if (path.includes('/market') && s === 'technical-analysis') return "market_kline"; 
        if (s === 'constituent') return "constituent";
        if (s === 'discount-premium') return "discount";
        if (s === 'trading-fee') return "trading-fee";
        if (s === 'risk') return "risk";
        if (s === 'drawdown') return "drawdown";
        if (s === 'dividend') return "dividend";
        if (s === 'eps') return "eps";
        if (s === 'revenue') return "revenue";
        if (s === 'profile') return "profile";
        if (s === 'income-statement') return "income-statement";
        if (s === 'balance-sheet') return "balance-sheet";
        if (s === 'shareholding-distribution') return "shareholding";
        if (s === 'stockfindetail') return "stockfindetail";
        if (s === 'dividend-composition') return "div_comp";
        if (s === 'revenue-source') return "revenue-source";
        if (s === 'cash-flow') return "cash-flow";
        if (s === 'financial-ratio') return "financial-ratio";
        if (s === 'technical-analysis') return "kline";
        if (s === 'institutional-target') return "institutional-target";
        if (s && s.startsWith('pe')) return "pe";
        if (s && s.startsWith('pb')) return "pb";
        if (/\/stock\/\w+\/?$/.test(path) && !s) return "realtime";
        return null;
    }


    function finishScrape(resArray, successMsg) {
        const statusBar = document.getElementById('cm-status-bar');
        const recopyBtn = document.getElementById('cm-btn-recopy');
        const currentStockMatch = window.location.pathname.match(/\/stock\/([A-Za-z0-9]+)(?:[\/\?#]|$)/);
        const currentStockId = currentStockMatch ? currentStockMatch[1].toUpperCase() : "";


        if (resArray && resArray.length > 1) {
            const finalString = resArray.join('\n');
            GM_setValue("cm_last_scraped_data", finalString);
            if (currentStockId) {
                GM_setValue("cm_last_scraped_stock_id", currentStockId);
            }


            try { window.focus(); } catch (e) {}
            GM_setClipboard(finalString);
            if (navigator.clipboard?.writeText) {
                navigator.clipboard.writeText(finalString).catch(() => {});
            }
            
            const isErrorSpoof = finalString.includes("【抓取失敗】");
            let msg = isErrorSpoof ? "⚠️ 抓取中斷：詳情請見剪貼簿內容" : (successMsg || `✅ 數據已複製`);
            
            if (!document.hasFocus()) {
                msg = "✅ 批次已完成！視窗未聚焦，請按 F9 或點擊按鈕複製";
                if (recopyBtn) recopyBtn.classList.add('cm-btn-pulse');
            } else {
                if (recopyBtn) recopyBtn.classList.remove('cm-btn-pulse');
            }


            showToast(msg);
            if (statusBar) statusBar.innerText = isErrorSpoof ? "⚠️ 抓取中斷" : msg;
        } else {
            showToast("⚠️ 抓取失敗或無數據", "error");
            if (statusBar) statusBar.innerText = "⚠️ 抓取失敗";
        }
    }


    function clickShowMoreAndExecute(callback, delayMs, requireExpand = true) {
        const actualDelay = delayMs || 1000;
        if (!requireExpand) {
            setTimeout(callback, actualDelay);
            return;
        }
        const targetBtn = Array.from(document.querySelectorAll('.showMore__text, .showMore__button, .table__unfold')).find(el => el.innerText && el.innerText.includes("查看更多") && el.offsetParent !== null);
        if (targetBtn) {
            showToast(`⏳ 正在強制展開表格...`);
            targetBtn.click();
            setTimeout(callback, actualDelay);
        } else {
            setTimeout(callback, actualDelay);
        }
    }


    // --- 核心 K 線解析引擎 ---
    function parseKlineDataEngine(doc, limit, isMarket = false) {
        const cache = window.__cm_kline_data_cache;
        if (!cache || !cache.Data || cache.Data.length === 0) {
            showToast("⚠️ 請先在網頁上等待 K 線資料載入");
            return ["【抓取失敗】", "(無K線資料)", "請手動點擊網頁 K 線圖區域，載入完成後再重新抓取"];
        }


        const kTypeEl = isMarket ? document.getElementById('cfg-prof-market-ktype') : document.getElementById('cfg-prof-stock-ktype');
        const kType = kTypeEl ? kTypeEl.value : (CONFIG.kline_type || "week");
        const kSortEl = document.getElementById('cfg-kline-sort');
        const kSort = kSortEl ? kSortEl.value : CONFIG.kline_sort;


        const title = cache.Title;
        const data = cache.Data;


        const getIdx = (name) => title.findIndex(t => t.includes(name));
        const idxDate = getIdx("日期");
        const idxOpen = getIdx("開盤");
        const idxHigh = getIdx("最高");
        const idxLow = getIdx("最低");
        const idxClose = getIdx("收盤");
        
        let idxVol = isMarket ? getIdx("成交金額") : getIdx("成交量");
        if (idxVol === -1) idxVol = isMarket ? getIdx("成交量") : getIdx("成交金額");


        const idxBias20 = getIdx("乖離率(20");
        const idxBias60 = getIdx("乖離率(60");


        if (idxDate === -1 || idxClose === -1) return ["【抓取失敗】", "(K線資料格式解析失敗，欄位不符)", ""];


        let fullDataChronological = [...data];
        if (fullDataChronological.length > 1) {
            let firstDate = fullDataChronological[0][idxDate] || "";
            let lastDate = fullDataChronological[fullDataChronological.length - 1][idxDate] || "";
            if (firstDate && lastDate) {
                let d1 = parseInt(firstDate.replace(/[\/\-]/g, ''), 10);
                let d2 = parseInt(lastDate.replace(/[\/\-]/g, ''), 10);
                if (d1 > d2) {
                    fullDataChronological.reverse();
                }
            }
        }


        let aggregatedData = [];


        if (kType === "day") {
            aggregatedData = fullDataChronological.map(row => {
                const tClose = parseFloat(row[idxClose]);
                const tOpenRaw = parseFloat(row[idxOpen]);
                const tHighRaw = parseFloat(row[idxHigh]);
                const tLowRaw = parseFloat(row[idxLow]);
                const tVolRaw = parseFloat(row[idxVol]);
                
                return {
                    date: row[idxDate],
                    open: isNaN(tOpenRaw) ? tClose : tOpenRaw,
                    high: isNaN(tHighRaw) ? tClose : tHighRaw,
                    low: isNaN(tLowRaw) ? tClose : tLowRaw,
                    close: tClose,
                    vol: isNaN(tVolRaw) ? 0 : tVolRaw,
                    b20: row[idxBias20] || "-",
                    b60: row[idxBias60] || "-"
                };
            });
        } else {
            let currentPeriodKey = null;
            let periodData = null;


            for (let i = 0; i < fullDataChronological.length; i++) {
                const row = fullDataChronological[i];
                let rawDateStr = row[idxDate] || "";
                
                let y, m, d;
                let cleanDate = rawDateStr.replace(/[\/\-]/g, '');
                if (cleanDate.length === 7) { 
                    y = parseInt(cleanDate.substring(0, 3), 10) + 1911;
                    m = parseInt(cleanDate.substring(3, 5), 10) - 1;
                    d = parseInt(cleanDate.substring(5, 7), 10);
                } else if (cleanDate.length === 8) { 
                    y = parseInt(cleanDate.substring(0, 4), 10);
                    m = parseInt(cleanDate.substring(4, 6), 10) - 1;
                    d = parseInt(cleanDate.substring(6, 8), 10);
                } else {
                    continue;
                }
                
                const dObj = new Date(y, m, d);
                if (isNaN(dObj.getTime())) continue;


                let pKey = "";
                if (kType === "month") {
                    pKey = `M_${y}_${String(m+1).padStart(2, '0')}`;
                } else if (kType === "week") {
                    let dow = dObj.getDay();
                    let diffToMonday = dow === 0 ? -6 : 1 - dow;
                    let monday = new Date(dObj);
                    monday.setDate(dObj.getDate() + diffToMonday);
                    pKey = `W_${monday.getFullYear()}_${String(monday.getMonth()+1).padStart(2,'0')}_${String(monday.getDate()).padStart(2,'0')}`;
                }


                const tClose = parseFloat(row[idxClose]);
                const tOpenRaw = parseFloat(row[idxOpen]);
                const tHighRaw = parseFloat(row[idxHigh]);
                const tLowRaw = parseFloat(row[idxLow]);
                const tVolRaw = parseFloat(row[idxVol]);
                
                const tOpen = isNaN(tOpenRaw) ? tClose : tOpenRaw;
                const tHigh = isNaN(tHighRaw) ? tClose : tHighRaw;
                const tLow = isNaN(tLowRaw) ? tClose : tLowRaw;
                const tVol = isNaN(tVolRaw) ? 0 : tVolRaw;


                if (currentPeriodKey !== pKey) {
                    if (periodData) aggregatedData.push(periodData);
                    currentPeriodKey = pKey;
                    periodData = { 
                        date: row[idxDate], 
                        open: tOpen, 
                        high: tHigh, 
                        low: tLow, 
                        close: tClose, 
                        vol: tVol, 
                        b20: row[idxBias20] || "-", b60: row[idxBias60] || "-" 
                    };
                } else {
                    periodData.date = row[idxDate];
                    periodData.high = Math.max(periodData.high, tHigh);
                    periodData.low = Math.min(periodData.low, tLow);
                    periodData.close = tClose;
                    periodData.vol = Math.round((periodData.vol + tVol) * 100) / 100;
                }
            }
            if (periodData) aggregatedData.push(periodData);
        }


        let targetData = aggregatedData.slice(-limit);
        if (targetData.length === 0) return ["【抓取失敗】", "(無足夠K線資料)", ""];


        let maxHigh = -Infinity, maxDate = "";
        let minLow = Infinity, minDate = "";
        targetData.forEach(p => {
            if (!isNaN(p.high) && p.high !== -Infinity && p.high >= maxHigh) { maxHigh = p.high; maxDate = p.date; }
            if (!isNaN(p.low) && p.low !== Infinity && p.low <= minLow) { minLow = p.low; minDate = p.date; }
        });


        const latestBar = targetData[targetData.length - 1];
        const startDate = targetData[0].date || "未知";
        const endDate = targetData[targetData.length - 1].date || "未知";
        const typeLabel = kType === 'day' ? "日K" : (kType === 'week' ? "週K" : "月K");
        const reportTitle = isMarket ? `技術分析(大盤${typeLabel})` : `技術分析(${typeLabel})`;


        const fmtNum = (num) => {
            if (num === Infinity || num === -Infinity || isNaN(num)) return "-";
            return Number.isInteger(num) ? num.toString() : parseFloat(num.toFixed(2)).toString();
        };


        let out = [];
        out.push(getMetaHeader(doc, reportTitle));
        out.push(`【深海狙擊雷達】(基準：近 ${targetData.length} 個交易${typeLabel.replace('K','')})`);
        out.push(`📊 統計期間：${startDate} ~ ${endDate}`);
        out.push(`🚨 區間最高點：${fmtNum(maxHigh)} (發生於 ${maxDate || "未知"})`);
        out.push(`🚨 區間最低點：${fmtNum(minLow)} (發生於 ${minDate || "未知"})`);
        out.push(`📍 最新收盤：${fmtNum(latestBar.close)} | 月乖離(20)：${latestBar.b20} | 季乖離(60)：${latestBar.b60}`);


        // 大盤輸出精簡：直接回傳雷達摘要，不輸出流水帳
        if (isMarket) {
            return out;
        }


        if (kSort === "desc") {
            targetData.reverse();
        }


        const rows = [];
        const volLabel = "成交量";


        targetData.forEach(p => {
            if (kType === "day") {
                rows.push(`${p.date},${fmtNum(p.open)},${fmtNum(p.high)},${fmtNum(p.low)},${fmtNum(p.close)},${fmtNum(p.vol)},${p.b20},${p.b60}`);
            } else {
                rows.push(`${p.date},${fmtNum(p.open)},${fmtNum(p.high)},${fmtNum(p.low)},${fmtNum(p.close)},${fmtNum(p.vol)}`);
            }
        });


        out.push("");
        out.push(`--- 原始 ${typeLabel} 數據 ---`);
        if (kType === "day") {
            out.push(`日期,開盤,最高,最低,收盤,${volLabel},月乖離(20),季乖離(60)`);
        } else {
            out.push(`最後交易日,開盤,最高,最低,收盤,區間累計${volLabel}`);
        }
        out.push(...rows);


        return out;
    }


    // --- 模組化註冊表 (Module Registry - 24 項獨立解析器) ---
    const MODULE_REGISTRY = {
        watchlist: { label: "自選股", urlSuffix: null, requiresExpand: true, delay: 600, domParserFn: (doc, limit) => {
            let res = [];
            const groupName = doc.querySelector('nav.groupTabs__nav button[class*="active"] .groupTabs__name')?.innerText.trim() 
                || doc.querySelector('.selectBar__desc')?.innerText.trim() 
                || "自選股名單";
            const timeBox = doc.querySelector('.selectBar__lastUpdateTime');
            let timeText = (timeBox && timeBox.querySelectorAll('span').length >= 3) 
                ? `${timeBox.querySelectorAll('span')[0].innerText} ${timeBox.querySelectorAll('span')[2].innerText}` 
                : "時間未知";


            res.push(`【${groupName} | ${timeText}】`);
            res.push("個股名稱\t股價(元)\t漲跌(元)\t漲跌幅(%)\t成交張數\t本益比(倍)");


            const rows = doc.querySelectorAll('tr.watchlistTable__row, tbody .watchlistTable__row, .table__body .table__row');
            rows.forEach(row => {
                if (row.style.display === 'none' || row.classList.contains('table__row--disable')) return;


                const nameEl = row.querySelector('.stockTitle__name, .stockTitle, td:nth-child(1)');
                const idEl = row.querySelector('.stockTitle__id');
                let stockTitle = nameEl ? nameEl.innerText.replace(/\n/g, ' ').trim() : "";
                if (idEl && !stockTitle.includes(idEl.innerText.trim())) {
                    stockTitle += ` (${idEl.innerText.trim()})`;
                }


                const priceEl = row.querySelector('.textQuote__value, td.watchlistTable__quote, td:nth-child(2)');
                const price = priceEl ? priceEl.innerText.trim() : "-";


                let diffPrice = "-", diffRate = "-";
                const quotePriceEl = row.querySelector('.watchlistTable__quotePrice');
                const quoteRateEl = row.querySelector('.watchlistTable__quoteRate');
                if (quotePriceEl && quoteRateEl) {
                    diffPrice = quotePriceEl.innerText.trim();
                    diffRate = quoteRateEl.innerText.trim();
                } else {
                    const combinedQuote = row.querySelector('td.watchlistTable__quote--up, td.watchlistTable__quote--down, td:nth-child(3)');
                    if (combinedQuote) {
                        const parts = combinedQuote.innerText.trim().split(/[\s\n\r]+/);
                        diffPrice = parts[0] || "-";
                        diffRate = parts[1] || "-";
                    }
                }


                const cols = row.querySelectorAll('td, .table__col');
                let vol = "-", pe = "-";
                if (cols.length >= 6) {
                    vol = cols[cols.length - 2]?.innerText.trim() || "-";
                    pe = cols[cols.length - 1]?.innerText.trim() || "-";
                }


                if (stockTitle && price !== "-") {
                    res.push(`${stockTitle}\t${price}\t${diffPrice}\t${diffRate}\t${vol}\t${pe}`);
                }
            });
            return res;
        }},
        realtime: { label: "即時五檔", urlSuffix: '', requiresExpand: false, delay: 800, domParserFn: (doc, limit) => {
            let out = []; out.push(getMetaHeader(doc, "即時報價"));
            const price = doc.querySelector('.stockData__price')?.innerText.trim() || ""; const quotePrice = doc.querySelector('.stockData__quotePrice')?.innerText.trim() || ""; const quotePercent = doc.querySelector('.stockData__quote')?.innerText.trim() || "";
            out.push(`現價: ${price} | 漲跌: ${quotePrice} ${quotePercent}`); out.push("---------------------------------------");
            const gridRows = doc.querySelectorAll('.immediate__data .wrapper .row'); let grid =[]; gridRows.forEach(r => { const k = r.querySelector('.row__key')?.innerText.trim() || ""; const v = r.querySelector('.row__value')?.innerText.trim() || ""; if (k) grid.push(`${k}: ${v}`); });
            for (let i = 0; i < grid.length; i += 2) out.push(`${grid[i]}\t${grid[i+1] || ""}`);
            out.push(`內盤比: ${doc.querySelector('.cm-askPriceChart__innerPercentage-inner')?.innerText.trim() || ""}\t外盤比: ${doc.querySelector('.cm-askPriceChart__innerPercentage-foreign')?.innerText.trim() || ""}`); out.push("---------------------------------------");
            const chartArea = doc.querySelector('.cm-askPriceChart');
            if (!chartArea) out.push("【無即時五檔數據 (可能為盤後或暫停交易)】");
            else {
                out.push(`【五檔委託】 總買量: ${doc.querySelector('.cm-askPriceChart__info-buy .cm-askPriceChart__infoTotal')?.innerText.trim() || "0"}\t總賣量: ${doc.querySelector('.cm-askPriceChart__info-sell .cm-askPriceChart__infoTotal')?.innerText.trim() || "0"}\n委買量\t買價\t賣價\t委賣量`);
                const bItems = doc.querySelectorAll('.cm-askPriceChart__volume-buy .cm-askPriceChart__volumeItem'), sItems = doc.querySelectorAll('.cm-askPriceChart__volume-sell .cm-askPriceChart__volumeItem');
                for (let i = 0; i < 5; i++) { 
                    const bVol = bItems[i]?.querySelector('.cm-askPriceChart__volumeCount')?.innerText.trim() || "-";
                    const bPrice = bItems[i]?.querySelector('.cm-askPriceChart__volumePrice')?.innerText.trim() || "-";
                    const sPrice = sItems[i]?.querySelector('.cm-askPriceChart__volumePrice')?.innerText.trim() || "-";
                    const sVol = sItems[i]?.querySelector('.cm-askPriceChart__volumeCount')?.innerText.trim() || "-";
                    out.push(`${bVol}\t${bPrice}\t${sPrice}\t${sVol}`); 
                }
            }
            return out;
        }},
        kline: { label: "K線狙擊", urlSuffix: '?s=technical-analysis', requiresExpand: false, delay: 1000, domParserFn: (doc, limit) => {
            return parseKlineDataEngine(doc, limit, false);
        }},
        market_kline: { label: "大盤 K 線", urlSuffix: null, absoluteUrl: 'https://www.cmoney.tw/forum/market?s=technical-analysis', requiresExpand: false, delay: 1000, domParserFn: (doc, limit) => {
            return parseKlineDataEngine(doc, limit, true);
        }},
        profile: {
            label: "基本資料",
            urlSuffix: '?s=profile',
            requiresExpand: false,
            delay: 600,
            domParserFn: (doc, limit) => {
                let res = [getMetaHeader(doc, "基本資料")];
                const items = doc.querySelectorAll('.profile__item');
                let map = {};
                items.forEach(it => {
                    const titleEl = it.querySelector('.profile__itemTitle');
                    if (titleEl) {
                        const key = titleEl.innerText.replace(/[\s\t\n]+/g, '').trim();
                        const val = it.innerText.replace(titleEl.innerText, '').replace(/[\s\t\n]+/g, ' ').trim();
                        if (key) map[key] = val;
                    }
                });


                const isETF = !!map['基金名稱'];
                if (isETF) {
                    res.push(`基金名稱\t${map['基金名稱'] || "-"}`);
                    res.push(`發行公司\t${map['發行公司'] || "-"}`);
                    res.push(`類型\t${map['類型'] || "-"}`);
                    res.push(`成立日期\t${map['成立日期'] || "-"}`);
                    res.push(`資產規模(億)\t${map['資產規模(億)'] || "-"}`);
                    res.push(`追蹤指數\t${map['追蹤指數'] || "-"}`);
                    res.push(`配息頻率\t${map['配息頻率'] || "-"}`);
                    res.push(`追蹤方式\t${map['追蹤方式'] || "-"}`);
                } else {
                    res.push(`上市日期\t${map['上市日期'] || map['上櫃日期'] || "-"}`);
                    res.push(`掛牌年數\t${map['掛牌年數'] || "-"}`);
                    res.push(`市場類別\t${map['上市上櫃'] || "-"}`);
                    res.push(`成立日期\t${map['成立日期'] || "-"}`);
                    res.push(`產業類別\t${map['產業'] || "-"}`);
                    res.push(`細產業別\t${map['細產業別'] || "-"}`);
                    res.push(`資本額(億)\t${map['資本額(億)'] || "-"}`);
                    res.push(`股本(億)\t${map['股本(億)'] || "-"}`);
                    res.push(`經營項目\t${map['經營項目'] || "-"}`);
                }
                return res;
            }
        },
        'institutional-target': {
            label: "法人目標",
            urlSuffix: '?s=institutional-target',
            requiresExpand: false,
            delay: 1000,
            domParserFn: (doc, limit) => {
                const stockName = doc.querySelector('.stockData__name')?.innerText.trim() || "未知名稱";
                const stockId = doc.querySelector('.stockData__id')?.innerText.trim() || "";
                
                const bodyText = doc.body.innerText || "";
                const explicitTimeEl = doc.querySelector('.institutionalTarget__updateTime, .reportSummary__time, .institutionalTarget__header .time');
                let updateTime = explicitTimeEl ? explicitTimeEl.innerText.trim() : "";
                if (!updateTime) {
                    const reportDateMatch = bodyText.match(/更新時間\s*(\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})/);
                    updateTime = reportDateMatch ? reportDateMatch[1] : (doc.querySelector('.stockData__update span')?.innerText.trim() || "-");
                }
                
                const hasTargetKeyword = bodyText.includes('法人目標') || bodyText.includes('法人共識');
                const targetTable = doc.querySelector('.institutionalTarget__targetTable');
                const summaryTable = doc.querySelector('.institutionalTarget__reportSummaryTable, [class*="reportSummaryTable"], .institutionalTarget table') || 
                                     Array.from(doc.querySelectorAll('.stockPanel__view table')).find(tbl => !tbl.classList.contains('institutionalTarget__targetTable'));


                if (!hasTargetKeyword && !targetTable && !summaryTable) {
                    return [
                        `【${stockName} (${stockId}) | 法人目標價 | -】`,
                        "(該標的尚無法人券商目標價報告或覆蓋)"
                    ];
                }


                let summaryContent = "";
                let brokers = "-";
                let returnPotential = "-";
                let epsEstimate = "-";


                if (summaryTable) {
                    const rows = summaryTable.querySelectorAll('tr, .row');
                    rows.forEach(r => {
                        const cells = r.querySelectorAll('th, td, .col, .cell');
                        if (cells.length >= 2) {
                            const keyEl = cells[0].cloneNode(true);
                            keyEl.querySelectorAll('.badge, .tag, svg, i, button, span.icon').forEach(el => el.remove());
                            const keyText = keyEl.innerText.replace(/[\s\t\u00A0]+/g, '').trim();


                            const valEl = cells[1].cloneNode(true);
                            valEl.querySelectorAll('.badge, .tag, svg, i, button, span.icon').forEach(el => el.remove());


                            if (keyText.includes("總評")) {
                                let rawHtml = valEl.innerHTML || "";
                                rawHtml = rawHtml.replace(/<\/(p|div)>/gi, '\n\n')
                                                 .replace(/<br\s*[\/]?>/gi, '\n')
                                                 .replace(/<[^>]+>/g, '');
                                let cleaned = rawHtml.replace(/(?:※|注意|免責聲明|本資料僅供參考)[^\n\r]*/g, '')
                                                     .replace(/[^\S\r\n]+/g, ' ')
                                                     .replace(/\n{3,}/g, '\n\n')
                                                     .trim();
                                summaryContent = cleaned;
                            } else if (keyText.includes("法人") && !keyText.includes("目標價")) {
                                brokers = valEl.innerText.replace(/[\n\r]+/g, ' ').replace(/[^\S\r\n]+/g, ' ').trim();
                            } else if (keyText.includes("潛在報酬")) {
                                returnPotential = valEl.innerText.replace(/[\n\r]+/g, ' ').replace(/[^\S\r\n]+/g, ' ').trim();
                            } else if (keyText.includes("預估EPS") || keyText.includes("每股盈餘")) {
                                epsEstimate = valEl.innerText.replace(/[\n\r]+/g, ' ').replace(/[^\S\r\n]+/g, ' ').trim();
                            }
                        }
                    });
                }


                if (brokers === "-") {
                    const bMatch = bodyText.match(/(?:覆蓋法人|納入機構|研究機構)[：:\s]*([^\n\r]+)/i);
                    if (bMatch) brokers = bMatch[1].replace(/[\s\t\u00A0]+/g, ' ').trim();
                }
                if (returnPotential === "-") {
                    const rMatch = bodyText.match(/(?:潛在報酬|報酬空間)[：:\s]*([^\n\r]+)/i);
                    if (rMatch) returnPotential = rMatch[1].replace(/[\s\t\u00A0]+/g, ' ').trim();
                }
                if (epsEstimate === "-") {
                    const eMatch = bodyText.match(/(?:預估\s*EPS|每股盈餘預估)[：:\s]*([^\n\r]+)/i);
                    if (eMatch) epsEstimate = eMatch[1].replace(/[\s\t\u00A0]+/g, ' ').trim();
                }


                if (summaryContent === "" && brokers === "-" && returnPotential === "-" && !targetTable) {
                    return [
                        `【${stockName} (${stockId}) | 法人目標價 | -】`,
                        "(該標的尚無法人券商目標價報告或覆蓋)"
                    ];
                }


                let consensusMain = "看多";
                const cMainMatch = bodyText.match(/(?:法人共識|整體共識)[：:\s]*(看多|中立|看空)/i);
                if (cMainMatch) {
                    consensusMain = cMainMatch[1];
                }


                let consensusRatio = "";
                const cRatioMatch = bodyText.match(/(?:看多|中立|看空)\s*\d+(?:\.\d+)?%\s*｜[^\n\r]+/);
                if (cRatioMatch) {
                    consensusRatio = cRatioMatch[0].replace(/[\s\t\u00A0]+/g, ' ').trim();
                }
                const consensusStr = consensusRatio ? `${consensusMain} (${consensusRatio})` : consensusMain;


                let maxTarget = "-";
                let midTarget = "-";
                let minTarget = "-";


                if (targetTable) {
                    const tText = targetTable.innerText || "";
                    
                    const maxMatch = tText.match(/最高目標價[\s\n\r]*([0-9.,]+)(?:[\s\n\r]*(\([+-]?[0-9.]+%\)|[+-]?[0-9.]+%))?/);
                    if (maxMatch) {
                        maxTarget = maxMatch[2] ? `${maxMatch[1]} (${maxMatch[2].replace(/[()]/g, '')})` : maxMatch[1];
                    }


                    const midMatch = tText.match(/中位目標價[\s\n\r]*([0-9.,]+)(?:[\s\n\r]*(\([+-]?[0-9.]+%\)|[+-]?[0-9.]+%))?/);
                    if (midMatch) {
                        midTarget = midMatch[2] ? `${midMatch[1]} (${midMatch[2].replace(/[()]/g, '')})` : midMatch[1];
                    }


                    const minMatch = tText.match(/最低目標價[\s\n\r]*([0-9.,]+)(?:[\s\n\r]*(\([+-]?[0-9.]+%\)|[+-]?[0-9.]+%))?/);
                    if (minMatch) {
                        minTarget = minMatch[2] ? `${minMatch[1]} (${minMatch[2].replace(/[()]/g, '')})` : minMatch[1];
                    }
                }


                let out = [];
                out.push(`【${stockName} (${stockId}) | 法人目標價 | ${updateTime}】`);
                out.push(`法人共識: ${consensusStr}`);
                out.push("---------------------------------------");
                out.push(`最高目標價: ${maxTarget}`);
                out.push(`中位目標價: ${midTarget}`);
                out.push(`最低目標價: ${minTarget}`);
                out.push("---------------------------------------");
                out.push(`潛在報酬: ${returnPotential}`);
                out.push(`預估EPS: ${epsEstimate}`);
                out.push(`覆蓋法人: ${brokers}`);
                
                if (summaryContent) {
                    out.push("---------------------------------------");
                    out.push("【法人總評】");
                    out.push(summaryContent);
                }


                return out;
            }
        },
        constituent: { 
            label: "ETF 成分股", 
            urlSuffix: '?s=constituent', 
            requiresExpand: true, 
            delay: 3000, 
            domParserFn: (doc, limit) => {
                let res = [getMetaHeader(doc, "成分股權重明細")];
                
                const industryRows = doc.querySelectorAll('.table-industry tbody tr, .industryDistribution__wrapper--table table tbody tr');
                if (industryRows.length > 0) { 
                    let added = false; 
                    industryRows.forEach(row => { 
                        const indName = row.querySelector('.table__industry, td:nth-child(2)')?.innerText.replace(/[\s\t\u00A0]+/g, ' ').trim() || ""; 
                        if (indName) { 
                            if (!added) { res.push("\n[產業分布]\n排名\t產業\t佔比"); added = true; } 
                            const rank = row.querySelector('.table__rank, td:nth-child(1)')?.innerText.trim() || "";
                            const pct = row.querySelector('.table__percentage, td:nth-child(3)')?.innerText.trim() || "";
                            res.push(`${rank}\t${indName}\t${pct}`); 
                        } 
                    }); 
                }


                const assetSection = doc.querySelector('.assetDistribution, [class*="assetDistribution"]');
                if (assetSection) { 
                    res.push("\n[資產配置]\n資產種類\t權重"); 
                    assetSection.querySelectorAll('.assetDistribution__item, [class*="assetItem"]').forEach(item => { 
                        const type = item.querySelector('.assetDistribution__text--assetType, [class*="assetType"]')?.innerText.trim() || ""; 
                        const weight = item.querySelector('.assetDistribution__text--assetWeight, [class*="assetWeight"]')?.innerText.trim() || "";
                        if (type) res.push(`${type}\t${weight}`); 
                    }); 
                }


                const holdingTable = doc.querySelector('.stockHolding__wrapper--table table, table.table-stockHolding');
                if (holdingTable) {
                    const theads = Array.from(holdingTable.querySelectorAll('thead th, thead td')).map(th => th.innerText.replace(/[\n\r\t]+/g, ' ').replace(/[\s\t\u00A0]+/g, ' ').trim()).filter(Boolean);
                    const headerStr = theads.length >= 4 
                        ? theads.slice(0, 4).join('\t') 
                        : "標的\t持股規模 (市值) 與前日變動 (張數)\t權重 與前日變動\t季權重增減";


                    let spotHoldings = [];
                    let derivativeHoldings = [];


                    Array.from(holdingTable.querySelectorAll('tbody tr')).forEach(row => {
                        const cols = Array.from(row.querySelectorAll('td, th'));
                        if (cols.length >= 3) {
                            const nameNode = cols[0].cloneNode(true);
                            nameNode.querySelectorAll('.badge, .tag, [class*="tag"], [class*="badge"], [class*="status"], i, svg').forEach(el => el.remove());
                            const attrTitle = cols[0].querySelector('a, span, div')?.getAttribute('title') || cols[0].getAttribute('title') || cols[0].getAttribute('data-name');
                            let hName = attrTitle ? attrTitle.trim() : nameNode.innerText.replace(/[\n\r\t]+/g, ' ').trim();
                            hName = hName.replace(/[\s\t\u00A0]+/g, ' ');


                            const hScale = cols[1] ? cols[1].innerText.replace(/[\n\r\t]+/g, ' ').replace(/[\s\t\u00A0]+/g, ' ').trim() : "-";
                            const hWeight = cols[2] ? cols[2].innerText.replace(/[\n\r\t]+/g, ' ').replace(/[\s\t\u00A0]+/g, ' ').trim() : "-";
                            const hChange = cols[3] ? cols[3].innerText.replace(/[\n\r\t]+/g, ' ').replace(/[\s\t\u00A0]+/g, ' ').trim() : "-";


                            const weightMatch = hWeight.match(/^(\d+(\.\d+)?)/);
                            const weightVal = weightMatch ? parseFloat(weightMatch[1]) : 0;


                            if (hName) {
                                const isDerivative = /(?:期貨|指數期|ETF期|FUT|NOTE|BOND\s*\(CBT\)|TREASURY\s*FUT|SWAP|SGX|E-MINI|MINI-SP|小.*指數)/i.test(hName);
                                const itemObj = { hName, hScale, hWeight, hChange, weightVal };


                                if (isDerivative) {
                                    derivativeHoldings.push(itemObj);
                                } else {
                                    spotHoldings.push(itemObj);
                                }
                            }
                        }
                    });


                    spotHoldings.sort((a, b) => b.weightVal - a.weightVal);


                    res.push(`\n[持股明細 (Top ${limit})]\n${headerStr}`);
                    spotHoldings.slice(0, limit).forEach(item => {
                        res.push(`${item.hName}\t${item.hScale}\t${item.hWeight}\t${item.hChange}`);
                    });


                    if (derivativeHoldings.length > 0) {
                        res.push(`\n[衍生品/避險部位]\n${headerStr}`);
                        derivativeHoldings.forEach(item => {
                            res.push(`${item.hName}\t${item.hScale}\t${item.hWeight}\t${item.hChange}`);
                        });
                    }
                }
                return res;
            }
        },
        dividend: { 
            label: "股利政策", 
            urlSuffix: '?s=dividend', 
            requiresExpand: true, 
            delay: 1500, 
            domParserFn: (doc, limit) => {
                let res = [getMetaHeader(doc, "股利政策")];
                const descEl = doc.querySelector('.dividend__text--infoDesc');
                const dataRows = Array.from(doc.querySelectorAll('.dividend__wrapper--table tbody tr, .stockPanel__view table tbody tr'));


                if (descEl) {
                    res.push(`${descEl.innerText.trim()} (共${dataRows.length}筆數據)`);
                }


                res.push("除權息年度\t現金-股利\t現金-除息日\t現金-發放日\t現金-除息前股價\t現金-填息天數\t股票-股利\t股票-除權日\t股票-除權前股價\t股票-填權天數\t股利合計\t殖利率(%)\t盈餘分配-配息\t盈餘分配-配股\t盈餘分配-合計");
                dataRows.slice(0, limit).forEach(r => {
                    res.push(Array.from(r.querySelectorAll('td')).map(td => td.innerText.trim()).join('\t'));
                });
                return res;
            }
        },
        eps: { label: "歷年 EPS", urlSuffix: '?s=eps', requiresExpand: true, delay: 800, domParserFn: (doc, limit) => {
            let res = [getMetaHeader(doc, "歷年 EPS"), "年度/季別\t每股盈餘(EPS)\t季增率\t年增率"];
            Array.from(doc.querySelectorAll('.eps__table tbody tr, .stockPanel__view table tbody tr')).slice(0, limit).forEach(r => { const c = Array.from(r.querySelectorAll('td')).map(td => td.innerText.trim()); if(c.length>=2) res.push(c.join('\t')); });
            return res;
        }},
        revenue: { label: "月營收", urlSuffix: '?s=revenue', requiresExpand: true, delay: 800, domParserFn: (doc, limit) => {
            let res = [getMetaHeader(doc, "營收數據")];
            const targetTable = doc.querySelector('.revenue__table table, .stockPanel__view table'); if (!targetTable) return res;
            const theads = Array.from(targetTable.querySelectorAll('thead th')).map(th => th.innerText.trim()); if (theads.length > 0) res.push(theads.join('\t'));
            Array.from(targetTable.querySelectorAll('tbody tr')).slice(0, limit).forEach(r => { const c = Array.from(r.querySelectorAll('td')).map(td => td.innerText.trim()); if(c.length>=2) res.push(c.join('\t')); });
            return res;
        }},
        'income-statement': {
            label: "損益表",
            urlSuffix: '?s=income-statement',
            requiresExpand: true,
            delay: 800,
            domParserFn: (doc, limit) => {
                let res = [getMetaHeader(doc, "損益表(季表) | 單位: 仟元")];
                const targetTable = doc.querySelector('.stockPanel__view table, .incomeStatement__table table');
                if (!targetTable) return res;


                const theadCols = Array.from(targetTable.querySelectorAll('thead th, thead td')).map(th => th.innerText.replace(/[\n\r\t]+/g, ' ').trim());
                
                let dateIdx = theadCols.findIndex(t => t.includes("日期") || t.includes("季度") || t.includes("年度"));
                if (dateIdx === -1) dateIdx = 0;


                const getColIdx = (keywords) => theadCols.findIndex(t => keywords.some(k => t.includes(k)));
                const idxRev = getColIdx(["營業收入", "營收"]);
                const idxGross = getColIdx(["營業毛利", "毛利"]);
                const idxExp = getColIdx(["營業費用", "費用"]);
                const idxOpInc = getColIdx(["營業利益", "營業淨利"]);
                const idxPreTax = getColIdx(["稅前淨利", "稅前盈餘", "稅前利益"]);
                const idxNetInc = getColIdx(["稅後淨利", "本期淨利", "稅後盈餘"]);


                res.push("日期\t營業收入\t營業毛利\t營業費用\t營業利益\t稅前淨利\t稅後淨利");


                const rows = Array.from(targetTable.querySelectorAll('tbody tr'));
                rows.slice(0, limit).forEach(r => {
                    const cells = Array.from(r.querySelectorAll('td, th')).map(c => c.innerText.replace(/[\n\r\t]+/g, ' ').trim());
                    if (cells.length >= 2) {
                        const dateStr = cells[dateIdx] || "-";
                        const cRev = idxRev !== -1 && cells[idxRev] !== undefined ? cells[idxRev] : "-";
                        const cGross = idxGross !== -1 && cells[idxGross] !== undefined ? cells[idxGross] : "-";
                        const cExp = idxExp !== -1 && cells[idxExp] !== undefined ? cells[idxExp] : "-";
                        const cOpInc = idxOpInc !== -1 && cells[idxOpInc] !== undefined ? cells[idxOpInc] : "-";
                        const cPreTax = idxPreTax !== -1 && cells[idxPreTax] !== undefined ? cells[idxPreTax] : "-";
                        const cNetInc = idxNetInc !== -1 && cells[idxNetInc] !== undefined ? cells[idxNetInc] : "-";


                        res.push(`${dateStr}\t${cRev}\t${cGross}\t${cExp}\t${cOpInc}\t${cPreTax}\t${cNetInc}`);
                    }
                });
                return res;
            }
        },
        'balance-sheet': {
            label: "資產負債",
            urlSuffix: '?s=balance-sheet',
            requiresExpand: false,
            delay: 1000,
            domParserFn: async (doc, limit) => {
                let res = [getMetaHeader(doc, "資產負債表(季表) | 單位: 仟元")];
                res.push("日期\t現金及約當現金\t應收帳款及票據\t存貨\t流動資產\t固定資產\t總資產\t總負債\t股東權益總額");


                const radioGroup = doc.querySelector('.balanceSheet__nav .cm-radioGroup__wrapper');
                const items = radioGroup ? Array.from(radioGroup.querySelectorAll('label, div, span, button')) : [];


                const getTableSnapshot = () => {
                    // 🛡️ 收斂至父容器，杜絕裸露全域 table 誤抓 (FIX-04)
                    const tbl = doc.querySelector('.balanceSheet__table table, .stockPanel__view table');
                    if (!tbl) return { headers: [], rows: [] };
                    const headers = Array.from(tbl.querySelectorAll('th, thead td')).map(c => c.innerText.replace(/[\n\r\t]+/g, ' ').trim()).filter(Boolean);
                    const rows = Array.from(tbl.querySelectorAll('tbody tr')).slice(0, limit || 8).map(r => {
                        return Array.from(r.querySelectorAll('td')).map(c => c.innerText.replace(/[\n\r\t]+/g, ' ').trim());
                    });
                    return { headers, rows };
                };


                const clickTab = async (name) => {
                    const target = items.find(el => el.innerText?.trim() === name);
                    if (target) {
                        target.click();
                        await new Promise(r => setTimeout(r, 600));
                    }
                };


                await clickTab('資產');
                const assetData = getTableSnapshot();


                await clickTab('負債');
                const debtData = getTableSnapshot();


                await clickTab('股東權益');
                const equityData = getTableSnapshot();


                await clickTab('資產');


                const mergedMap = new Map();


                const aHeaders = assetData.headers;
                const aDateIdx = aHeaders.findIndex(t => t.includes("日期") || t.includes("季度") || t.includes("年度"));
                const aCashIdx = aHeaders.findIndex(t => t.includes("現金"));
                const aRecIdx = aHeaders.findIndex(t => t.includes("應收"));
                const aInvIdx = aHeaders.findIndex(t => t.includes("存貨"));


                let aCurIdx = aHeaders.findIndex(t => t === "流動資產");
                if (aCurIdx === -1) aCurIdx = aHeaders.findIndex(t => t.includes("流動資產") && !t.includes("其他"));


                const aFixIdx = aHeaders.findIndex(t => t.includes("固定資產") || t.includes("不動產"));
                const aTotalIdx = aHeaders.findIndex(t => t.includes("總資產") || t.includes("資產總計"));


                assetData.rows.forEach(r => {
                    const date = r[aDateIdx !== -1 ? aDateIdx : 0];
                    if (date) {
                        mergedMap.set(date, {
                            date,
                            cash: (aCashIdx !== -1 && r[aCashIdx]) ? r[aCashIdx] : "-",
                            rec: (aRecIdx !== -1 && r[aRecIdx]) ? r[aRecIdx] : "-",
                            inv: (aInvIdx !== -1 && r[aInvIdx]) ? r[aInvIdx] : "-",
                            curAsset: (aCurIdx !== -1 && r[aCurIdx]) ? r[aCurIdx] : "-",
                            fixAsset: (aFixIdx !== -1 && r[aFixIdx]) ? r[aFixIdx] : "-",
                            totalAsset: (aTotalIdx !== -1 && r[aTotalIdx]) ? r[aTotalIdx] : "-",
                            totalDebt: "-",
                            equity: "-"
                        });
                    }
                });


                const dHeaders = debtData.headers;
                const dDateIdx = dHeaders.findIndex(t => t.includes("日期") || t.includes("季度"));
                const dTotalIdx = dHeaders.findIndex(t => t.includes("總負債") || t.includes("負債總計"));
                debtData.rows.forEach(r => {
                    const date = r[dDateIdx !== -1 ? dDateIdx : 0];
                    if (mergedMap.has(date)) {
                        mergedMap.get(date).totalDebt = (dTotalIdx !== -1 && r[dTotalIdx]) ? r[dTotalIdx] : "-";
                    }
                });


                const eHeaders = equityData.headers;
                const eDateIdx = eHeaders.findIndex(t => t.includes("日期") || t.includes("季度"));
                const eTotalIdx = eHeaders.findIndex(t => t.includes("股東權益") || t.includes("權益總計"));
                equityData.rows.forEach(r => {
                    const date = r[eDateIdx !== -1 ? eDateIdx : 0];
                    if (mergedMap.has(date)) {
                        mergedMap.get(date).equity = (eTotalIdx !== -1 && r[eTotalIdx]) ? r[eTotalIdx] : "-";
                    }
                });


                mergedMap.forEach(v => {
                    res.push(`${v.date}\t${v.cash}\t${v.rec}\t${v.inv}\t${v.curAsset}\t${v.fixAsset}\t${v.totalAsset}\t${v.totalDebt}\t${v.equity}`);
                });


                return res;
            }
        },
        discount: { label: "折溢價", urlSuffix: '?s=discount-premium', requiresExpand: true, delay: 1000, domParserFn: (doc, limit) => {
            let out = [getMetaHeader(doc, "折溢價紀錄"), "日期\t市價\t淨值\t折溢價\t折溢價%"];
            Array.from(doc.querySelectorAll('.discountPremium__wrapper--table table tbody tr, .stockPanel__view table tbody tr')).slice(0, limit).forEach(r => out.push(Array.from(r.querySelectorAll('td')).map(td => td.innerText.trim()).join('\t')));
            return out;
        }},
        'trading-fee': { 
            label: "ETF 交易費用", 
            urlSuffix: '?s=trading-fee', 
            requiresExpand: false, 
            delay: 1000, 
            domParserFn: (doc, limit) => {
                let res = [getMetaHeader(doc, "ETF 交易費用與股務資訊")];
                const stockId = (window.location.pathname.match(/\/stock\/(\w+)/) || [])[1] || "";
                const stockName = doc.querySelector('.stockData__name')?.innerText || "";
                
                const isBondETF = stockId.toUpperCase().endsWith('B') || 
                                  stockId.toUpperCase().endsWith('D') || 
                                  /債|非投等|公債|公司債|複合收益/i.test(stockName);


                const targetSection = Array.from(doc.querySelectorAll('.stockPanel__section, .stockPanel__view section')).find(sec => {
                    const txt = sec.innerText || "";
                    return txt.includes("管理費") || txt.includes("交易費用") || txt.includes("保管費");
                });


                if (targetSection) {
                    let rawText = targetSection.innerText || "";
                    
                    const mgmtMatch = rawText.match(/管理費[\s\n\r]*([\s\S]*?)(?=保管費|交易手續費|證券交易稅|$)/i);
                    const custMatch = rawText.match(/保管費[\s\n\r]*([\s\S]*?)(?=交易手續費|證券交易稅|股務資訊|$)/i);
                    const feeMatch = rawText.match(/交易手續費[\s\n\r]*([\s\S]*?)(?=證券交易稅|股務資訊|$)/i);
                    const bankMatch = rawText.match(/保管銀行[\s\n\r]*([\s\S]*?)(?=配息頻率|$)/i);
                    const freqMatch = rawText.match(/配息頻率[\s\n\r]*([\s\S]*?)$/i);


                    const cleanStr = (s) => (s || "")
                        .replace(/[\/]+/g, ' ')
                        .replace(/%(\s*)(?=(?:規模|淨資產|逾|超過|新臺幣|\d+億))/g, '%; ')
                        .replace(/;+/g, ';')
                        .replace(/[\n\r]+/g, ' ')
                        .replace(/[\s\t\u00A0]+/g, ' ')
                        .trim();


                    res.push(`管理費: ${cleanStr(mgmtMatch?.[1]) || "詳見公開說明書"}`);
                    res.push(`保管費: ${cleanStr(custMatch?.[1]) || "詳見公開說明書"}`);
                    res.push(`交易手續費: ${cleanStr(feeMatch?.[1]) || "依券商規定 (買賣時收取)"}`);
                    
                    if (isBondETF) {
                        res.push("證券交易稅: 0% (停徵/免徵)");
                    } else {
                        res.push("證券交易稅: 1‰ (賣出時由券商代扣)");
                    }


                    if (bankMatch || freqMatch) {
                        res.push("---------------------------------------");
                        if (bankMatch) res.push(`保管銀行: ${cleanStr(bankMatch[1])}`);
                        if (freqMatch) res.push(`配息頻率: ${cleanStr(freqMatch[1])}`);
                    }
                } else {
                    res.push("(未找到交易費用與股務資訊區塊)");
                }
                return res;
            }
        },
        risk: { label: "ETF 風險指標", urlSuffix: '?s=risk', requiresExpand: false, delay: 800, domParserFn: (doc, limit) => {
            let res = [getMetaHeader(doc, "ETF 風險指標")];
            const table = doc.querySelector('.risk__table table, .stockPanel__view table');
            if (!table) return res;
            const theads = Array.from(table.querySelectorAll('thead th')).map(th => th.innerText.trim());
            if (theads.length > 0) res.push(theads.join('\t'));
            else res.push("指標\t近一個月\t近三個月\t近一年");
            Array.from(table.querySelectorAll('tbody tr')).slice(0, limit).forEach(r => {
                const c = Array.from(r.querySelectorAll('td, th')).map(td => td.innerText.trim());
                if (c.length >= 2) res.push(c.join('\t'));
            });
            return res;
        }},
        drawdown: { label: "ETF 歷史回撤", urlSuffix: '?s=drawdown', requiresExpand: false, delay: 800, domParserFn: (doc, limit) => {
            let res = [getMetaHeader(doc, "ETF 歷史回撤")];
            const table = doc.querySelector('.drawdown__table table, .stockPanel__view table');
            if (!table) return res;
            const theads = Array.from(table.querySelectorAll('thead th')).map(th => th.innerText.trim());
            if (theads.length > 0) res.push(theads.join('\t'));
            else res.push("日期\t市價\t回撤率%");
            Array.from(table.querySelectorAll('tbody tr')).slice(0, limit).forEach(r => {
                const c = Array.from(r.querySelectorAll('td, th')).map(td => td.innerText.trim());
                if (c.length >= 2) res.push(c.join('\t'));
            });
            return res;
        }},
        pe: { label: "PE 河流圖", urlSuffix: '?s=pe', requiresExpand: true, delay: 1000, domParserFn: (doc, limit) => {
            let res = [getMetaHeader(doc, "本益比(PE)數據")];
            const table = doc.querySelector('.stockPanel__view table'); if (!table) return res;
            const theads = Array.from(table.querySelectorAll('thead th')).map(th => th.innerText.trim()); if (theads.length > 0) res.push(theads.join('\t'));
            Array.from(table.querySelectorAll('tbody tr')).slice(0, limit).forEach(r => { const c = Array.from(r.querySelectorAll('td')).map(td => td.innerText.trim()); if(c.length>=2) res.push(c.join('\t')); });
            return res;
        }},
        pb: { label: "PB 河流圖", urlSuffix: '?s=pb', requiresExpand: true, delay: 1000, domParserFn: (doc, limit) => {
            let res = [getMetaHeader(doc, "股價淨值比(PB)數據")];
            const table = doc.querySelector('.stockPanel__view table'); if (!table) return res;
            const theads = Array.from(table.querySelectorAll('thead th')).map(th => th.innerText.trim()); if (theads.length > 0) res.push(theads.join('\t'));
            Array.from(table.querySelectorAll('tbody tr')).slice(0, limit).forEach(r => { const c = Array.from(r.querySelectorAll('td')).map(td => td.innerText.trim()); if(c.length>=2) res.push(c.join('\t')); });
            return res;
        }},
        shareholding: { label: "大戶散戶", urlSuffix: '?s=shareholding-distribution', requiresExpand: true, delay: 1000, domParserFn: (doc, limit) => {
            let res = [getMetaHeader(doc, "大戶散戶持股增減")];
            const table = doc.querySelector('.stockPanel__view table, .shareholdingDistribution__table table'); if (!table) return res;
            const theads = Array.from(table.querySelectorAll('thead th')).map(th => th.innerText.trim()); if (theads.length > 0) res.push(theads.join('\t'));
            Array.from(table.querySelectorAll('tbody tr')).slice(0, limit).forEach(r => { const c = Array.from(r.querySelectorAll('td')).map(td => td.innerText.trim()); if(c.length>=2) res.push(c.join('\t')); });
            return res;
        }},
        stockfindetail: { label: "三率趨勢", urlSuffix: '?s=stockfindetail', requiresExpand: true, delay: 1000, domParserFn: (doc, limit) => {
            let res = [getMetaHeader(doc, "三率趨勢(毛利/營益/淨利)")];
            const table = doc.querySelector('.stockPanel__view table'); if (!table) return res;
            const theads = Array.from(table.querySelectorAll('thead th')).map(th => th.innerText.trim()); if (theads.length > 0) res.push(theads.join('\t'));
            Array.from(table.querySelectorAll('tbody tr')).slice(0, limit).forEach(r => { const c = Array.from(r.querySelectorAll('td')).map(td => td.innerText.trim()); if(c.length>=2) res.push(c.join('\t')); });
            return res;
        }},
        div_comp: { label: "股利組成", urlSuffix: '?s=dividend-composition', requiresExpand: true, delay: 1000, domParserFn: (doc, limit) => {
            let res = [getMetaHeader(doc, "ETF 股利組成")];
            const table = doc.querySelector('.dividendComposition__wrapper--table table, .stockPanel__view table'); 
            if (!table) return res;
            
            const theadRows = Array.from(table.querySelectorAll('thead tr'));
            let headerLine = "";
            if (theadRows.length > 0) {
                const lastThead = theadRows[theadRows.length - 1];
                const ths = Array.from(lastThead.querySelectorAll('th, td')).map(th => th.innerText.replace(/[\n\r\t]+/g, ' ').trim()).filter(Boolean);
                headerLine = ths.join('\t');
            }
            if (headerLine) {
                res.push(headerLine);
            }


            Array.from(table.querySelectorAll('tbody tr')).slice(0, limit).forEach(r => { 
                const c = Array.from(r.querySelectorAll('td, th')).map(td => td.innerText.replace(/[\n\r\t]+/g, ' ').trim()); 
                if(c.length >= 2) res.push(c.join('\t')); 
            });
            return res;
        }},
        'revenue-source': { label: "營收組成", urlSuffix: '?s=revenue-source', requiresExpand: false, delay: 800, domParserFn: (doc, limit) => {
            let res = [getMetaHeader(doc, "營收組成")];
            const tables = doc.querySelectorAll('.revenueSource__table table, .stockPanel__view table');
            if(tables.length === 0) return res;
            tables.forEach((tbl, idx) => {
                if(idx > 0) res.push("-----------------");
                const theads = Array.from(tbl.querySelectorAll('thead th')).map(th => th.innerText.trim());
                if (theads.length > 0) res.push(theads.join('\t'));
                Array.from(tbl.querySelectorAll('tbody tr')).forEach(r => {
                    const c = Array.from(r.querySelectorAll('td')).map(td => td.innerText.trim());
                    if(c.length >= 2) res.push(c.join('\t'));
                });
            });
            return res;
        }},
        'cash-flow': { label: "現金流量表", urlSuffix: '?s=cash-flow', requiresExpand: true, delay: 800, domParserFn: (doc, limit) => {
            let res = [getMetaHeader(doc, "現金流量表")];
            const table = doc.querySelector('.stockPanel__view table');
            if(!table) return res;
            const theads = Array.from(table.querySelectorAll('thead th')).map(th => th.innerText.trim());
            if (theads.length > 0) res.push(theads.join('\t'));
            Array.from(table.querySelectorAll('tbody tr')).slice(0, limit).forEach(r => {
                const c = Array.from(r.querySelectorAll('td')).map(td => td.innerText.trim());
                if(c.length >= 2) res.push(c.join('\t'));
            });
            return res;
        }},
        'financial-ratio': { label: "財務比率", urlSuffix: '?s=financial-ratio', requiresExpand: true, delay: 800, domParserFn: (doc, limit) => {
            let res = [getMetaHeader(doc, "財務比率")];
            const tables = doc.querySelectorAll('.stockPanel__view table');
            if(tables.length === 0) return res;
            tables.forEach((tbl, idx) => {
                if(idx > 0) res.push("-----------------");
                const theads = Array.from(tbl.querySelectorAll('thead th')).map(th => th.innerText.trim());
                if (theads.length > 0) res.push(theads.join('\t'));
                Array.from(tbl.querySelectorAll('tbody tr')).forEach(r => {
                    const c = Array.from(r.querySelectorAll('td')).map(td => td.innerText.trim());
                    if(c.length >= 2) res.push(c.join('\t'));
                });
            });
            return res;
        }}
    };


    function executeSinglePageScrape(moduleKey) {
        const mod = MODULE_REGISTRY[moduleKey];
        if (!mod) return;
        
        const isKlineModule = (moduleKey === "kline" || moduleKey === "market_kline");


        const executeAction = () => {
            clickShowMoreAndExecute(async () => {
                let res = null;
                try {
                    res = await mod.domParserFn(document, getAutoLimit(moduleKey, null, false));
                } catch (err) {
                    console.error("Single Scrape Error:", err);
                    res = ["【抓取失敗】", `(解析異常: ${err.message})`, ""];
                }
                finishScrape(res, `✅ 單頁抓取成功：${mod.label}`);
            }, mod.delay, mod.requiresExpand);
        };


        if (isKlineModule) {
            const originalScrollY = window.scrollY;
            window.scrollTo({ top: document.body.scrollHeight / 2, behavior: 'smooth' });
            showToast("⏳ 等待 K 線資料載入中...");
            
            if (singleScrapePoller) clearInterval(singleScrapePoller);
            
            let checkCount = 0;
            singleScrapePoller = setInterval(() => {
                if (window.__cm_kline_data_cache || checkCount >= 40) {
                    clearInterval(singleScrapePoller);
                    singleScrapePoller = null; 
                    window.scrollTo({ top: originalScrollY, behavior: 'smooth' });
                    executeAction();
                }
                checkCount++;
            }, 500);
        } else {
            executeAction();
        }
    }


    function startRelayBatchScrape() {
        const match = location.pathname.match(/\/stock\/([A-Za-z0-9]+)(?:[\/\?#]|$)/);
        if (!match) { showToast("⚠️ 批量抓取僅支援個股/ETF頁面發起"); return; }
        const stockId = match[1].toUpperCase();


        const modulesToFetch = Array.from(document.querySelectorAll('.cm-module-cb:checked')).map(cb => cb.value).filter(k => MODULE_REGISTRY[k] && (MODULE_REGISTRY[k].urlSuffix !== null || MODULE_REGISTRY[k].absoluteUrl));
        if (modulesToFetch.length === 0) { showToast("⚠️ 未勾選任何支援批次的模組"); return; }


        document.getElementById('cm-btn-batch-exec').innerText = "⏳ 開啟分頁彙整中...";
        document.getElementById('cm-btn-batch-exec').disabled = true;


        // FIX-01: 注入任務指紋與啟動時間戳記
        const taskId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        GM_setValue("cm_batch_task", { 
            id: taskId, 
            active: true, 
            stockId: stockId, 
            queue: modulesToFetch, 
            total: modulesToFetch.length, 
            results: {}, 
            lastProgressTime: Date.now() 
        });
        
        const firstMod = MODULE_REGISTRY[modulesToFetch[0]];
        const targetUrl = firstMod.absoluteUrl ? firstMod.absoluteUrl : `https://www.cmoney.tw/forum/stock/${stockId}${firstMod.urlSuffix}`;
        window.open(targetUrl, "CMScrapeWorker");


        if (batchMonitorTimer) clearInterval(batchMonitorTimer);
        let lastQueueLen = modulesToFetch.length;


        batchMonitorTimer = setInterval(() => {
            const task = GM_getValue("cm_batch_task");
            const btn = document.getElementById('cm-btn-batch-exec');
            const sb = document.getElementById('cm-status-bar');


            if (!task || !task.active || task.id !== taskId) {
                if (btn) { btn.innerText = "⚡ 自動開頁彙整勾選資料"; btn.disabled = false; }
                clearInterval(batchMonitorTimer);
                return;
            }


            // 停滯偵測：若超過 180,000ms (3分鐘) 無任何進度，強制釋放
            if (task.queue.length !== lastQueueLen) {
                lastQueueLen = task.queue.length;
                task.lastProgressTime = Date.now();
                GM_setValue("cm_batch_task", task);
            } else if (Date.now() - (task.lastProgressTime || Date.now()) > 180000) {
                clearInterval(batchMonitorTimer);
                if (btn) { btn.innerText = "⚡ 自動開頁彙整勾選資料"; btn.disabled = false; }
                task.active = false;
                GM_setValue("cm_batch_task", task);
                showToast("⚠️ 批次任務進度超時停滯 (3分鐘)，已自動中斷並解鎖！", "error");
                if (sb) sb.innerText = "⚠️ 任務超時中斷";
                return;
            }


            if (!task.active || task.queue.length === 0) {
                clearInterval(batchMonitorTimer);
                if (btn) { btn.innerText = "⚡ 自動開頁彙整勾選資料"; btn.disabled = false; }
                let finalOut = [];
                for (let k in task.results) {
                    let data = task.results[k];
                    if (data && data.length > 1) finalOut.push(`\n\n=== 【${MODULE_REGISTRY[k].label}】 ===\n\n` + data.join('\n'));
                    else finalOut.push(`\n\n=== 【${MODULE_REGISTRY[k].label}】 ===\n\n${data?.[0] || "(無數據或抓取失敗)"}`);
                }
                if (finalOut.length > 0) {
                    const finalString = finalOut.join('').trim();
                    GM_setValue("cm_last_scraped_data", finalString);
                    GM_setValue("cm_last_scraped_stock_id", task.stockId);


                    try { window.focus(); } catch (e) {}
                    GM_setClipboard(finalString);
                    if (navigator.clipboard?.writeText) {
                        navigator.clipboard.writeText(finalString).catch(() => {});
                    }


                    const recopyBtn = document.getElementById('cm-btn-recopy');
                    const hasError = finalString.includes("【抓取失敗】");
                    let toastMsg = hasError ? `⚠️ ${task.total} 個模組已彙整，但部分抓取失敗！` : `✅ ${task.total} 個模組彙整完成！`;


                    if (!document.hasFocus()) {
                        toastMsg = "✅ 批次已完成！視窗未聚焦，請按 F9 或點擊按鈕複製";
                        if (recopyBtn) recopyBtn.classList.add('cm-btn-pulse');
                    } else {
                        if (recopyBtn) recopyBtn.classList.remove('cm-btn-pulse');
                    }
                    
                    showToast(toastMsg);
                    if (sb) sb.innerText = hasError ? "⚠️ 批次彙整 (部分失敗)" : "✅ 批次彙整已複製";
                }
                GM_setValue("cm_batch_task", null);
            } else {
                let done = task.total - task.queue.length;
                if (btn) btn.innerText = `⏳ 彙整中 (${done}/${task.total})...`;
            }
        }, 1000);
    }


    function checkAndExecuteWorkerTask() {
        // FIX-01: 限制僅在名為 CMScrapeWorker 的視窗內執行 Worker 任務
        if (window.name !== 'CMScrapeWorker') return;


        const task = GM_getValue("cm_batch_task");
        if (!task || !task.active) return;


        const currentModKey = getCurrentPageModule(); 
        const match = location.pathname.match(/\/stock\/([A-Za-z0-9]+)(?:[\/\?#]|$)/); 
        const currentStockId = match ? match[1].toUpperCase() : "";


        const isTargetModule = task.queue.length > 0 && task.queue[0] === currentModKey;
        const isTargetStock = currentModKey === "market_kline" || task.stockId === currentStockId;


        if (isTargetModule && isTargetStock) {
            document.getElementById('cm-worker-overlay')?.remove();
            
            const overlay = document.createElement('div'); overlay.id = 'cm-worker-overlay';
            overlay.innerHTML = `<div class="cm-spinner"></div><h2>自動彙整系統運作中 (${task.total - task.queue.length + 1}/${task.total})</h2><p>正在抓取：${MODULE_REGISTRY[currentModKey].label}...</p><p style="color:#aaa; font-size:14px; margin-top:10px;">請勿操作此視窗，完成後將自動關閉或跳轉</p>`;
            document.body.appendChild(overlay);


            let isWatchdogFired = false;
            // FIX-04: Watchdog 延長至 25,000ms (25 秒)
            const watchdogTimer = setTimeout(() => {
                isWatchdogFired = true; 
                let currentTask = GM_getValue("cm_batch_task");
                if (currentTask && currentTask.active && currentTask.id === task.id && currentTask.queue[0] === currentModKey) {
                    currentTask.results[currentModKey] = ["【抓取失敗】", "(網路超時或頁面卡死，自動略過)", ""];
                    currentTask.queue.shift();
                    currentTask.lastProgressTime = Date.now();
                    GM_setValue("cm_batch_task", currentTask);
                    if (currentTask.queue.length > 0) {
                        const nextMod = MODULE_REGISTRY[currentTask.queue[0]];
                        const nextUrl = nextMod.absoluteUrl ? nextMod.absoluteUrl : `https://www.cmoney.tw/forum/stock/${currentTask.stockId}${nextMod.urlSuffix}`;
                        window.location.href = nextUrl;
                    } else {
                        currentTask.active = false; GM_setValue("cm_batch_task", currentTask); window.close();
                    }
                }
            }, 25000);


            setTimeout(() => {
                const mod = MODULE_REGISTRY[currentModKey];
                const isKlineModule = (currentModKey === "kline" || currentModKey === "market_kline");


                function executeScrapeAndJump() {
                    if (isWatchdogFired) return;
                    clickShowMoreAndExecute(async () => {
                        if (isWatchdogFired) return; 
                        let res = null;
                        try {
                            res = await mod.domParserFn(document, getAutoLimit(currentModKey, task.stockId, true));
                        } catch (err) {
                            console.error("Scrape Error at module:", currentModKey, err);
                            res = ["【抓取失敗】", `(解析異常: ${err.message})`, ""];
                        }
                        clearTimeout(watchdogTimer);


                        let latestTask = GM_getValue("cm_batch_task");
                        // FIX-01: 移轉前驗證任務指紋與佇列頭部
                        if (!latestTask || latestTask.id !== task.id || latestTask.queue[0] !== currentModKey) return;


                        latestTask.results[currentModKey] = res; 
                        latestTask.queue.shift();
                        latestTask.lastProgressTime = Date.now();
                        GM_setValue("cm_batch_task", latestTask);


                        if (latestTask.queue.length > 0) {
                            const nextMod = MODULE_REGISTRY[latestTask.queue[0]];
                            const nextUrl = nextMod.absoluteUrl ? nextMod.absoluteUrl : `https://www.cmoney.tw/forum/stock/${latestTask.stockId}${nextMod.urlSuffix}`;
                            window.location.href = nextUrl;
                        } else {
                            latestTask.active = false; 
                            GM_setValue("cm_batch_task", latestTask); 
                            window.close();
                        }
                    }, mod.delay, mod.requiresExpand);
                }


                if (isKlineModule) {
                    const originalScrollY = window.scrollY;
                    window.scrollTo({ top: document.body.scrollHeight / 2, behavior: 'smooth' });
                    let checkCount = 0;
                    const poller = setInterval(() => {
                        if (window.__cm_kline_data_cache || checkCount >= 50) {
                            clearInterval(poller);
                            window.scrollTo({ top: originalScrollY, behavior: 'smooth' });
                            executeScrapeAndJump();
                        }
                        checkCount++;
                    }, 500);
                } else {
                    executeScrapeAndJump();
                }


            }, 1500);
        }
    }


    function toggleSideDrawer(side) {
        const drawer = document.getElementById(`drawer-${side}`);
        const btn = document.getElementById(`cm-toggle-${side}`);
        const panel = document.getElementById('cm-main-panel');
        if (!drawer || !btn || !panel) return;


        const isOpen = drawer.classList.contains('open');
        const drawerWidth = getDynamicUIParams().drawerW;


        let rawLeft = parseFloat(panel.style.left);
        let currentLeft = Number.isFinite(rawLeft) ? rawLeft : 200;


        if (!isOpen) {
            if (side === 'left') {
                const newLeft = Math.max(0, currentLeft - drawerWidth);
                panel.style.left = newLeft + 'px';
            }
            drawer.classList.add('open');
            btn.innerText = side === 'left' ? '▶ 收合' : '收合 ◀';
            GM_setValue(`cm_${side}_open`, true);
        } else {
            if (side === 'left') {
                const newLeft = currentLeft + drawerWidth;
                panel.style.left = newLeft + 'px';
            }
            drawer.classList.remove('open');
            btn.innerText = side === 'left' ? '◀ 設定' : '參數 ▶';
            GM_setValue(`cm_${side}_open`, false);
        }


        // FIX-02: 夾緊與 NaN 防禦
        const finalTop = Number.isFinite(parseFloat(panel.style.top)) ? parseFloat(panel.style.top) : 150;
        const finalLeft = Number.isFinite(parseFloat(panel.style.left)) ? parseFloat(panel.style.left) : 200;
        GM_setValue("panel_pos", { top: finalTop, left: finalLeft });
    }


    // [SYNC-01] Google 試算表 CSV URL 轉譯與 HTML 防禦
    function getGoogleSheetsCsvUrl(url) {
        if (!url) return '';
        const idMatch = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
        if (idMatch && idMatch[1]) {
            const spreadsheetId = idMatch[1];
            const gidMatch = url.match(/[#&?]gid=([0-9]+)/);
            const gid = (gidMatch && gidMatch[1]) ? gidMatch[1] : '0';
            return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid}`;
        }
        return url;
    }


    function isHtmlResponse(text) {
        if (!text) return false;
        const lower = text.toLowerCase();
        return lower.includes('<!doctype html>') || lower.includes('<html') || lower.includes('accounts.google.com');
    }


    function syncGoogleSheetLists(targetUrl) {
        const url = getGoogleSheetsCsvUrl(targetUrl || CONFIG.sync_sheet_url);
        if (!url) {
            showToast("⚠️ 試算表網址為空，無法同步！", "error");
            return;
        }


        showToast("⏳ 正在同步 Google 試算表名單...");


        GM_xmlhttpRequest({
            method: "GET",
            url: url,
            timeout: 10000,
            onload: function(response) {
                if (response.status !== 200) {
                    showToast(`⚠️ 雲端名單拉取失敗 (狀態碼 ${response.status})，已保留本機現有名單！`, "error");
                    return;
                }


                const text = response.responseText || "";
                if (isHtmlResponse(text)) {
                    showToast("⚠️ 雲端名單拉取失敗 (需公開檢視權限或遇到登入頁)，已保留本機現有名單！", "error");
                    return;
                }


                const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
                if (lines.length === 0) {
                    showToast("⚠️ 雲端名單為空，已啟動防空熔斷保留現有名單！", "error");
                    return;
                }


                let marketCapList = [];
                let highDivList = [];
                let divWhiteList = [];


                lines.forEach((line, idx) => {
                    const cols = line.split(',').map(c => c.replace(/^["']|["']$/g, '').trim());
                    if (idx === 0) {
                        const headerStr = cols.join('');
                        if (headerStr.includes("市值") || headerStr.includes("高股息") || headerStr.includes("白名單")) {
                            return;
                        }
                    }


                    // A 欄：市值型 ETF (萬能補零)
                    if (cols[0]) {
                        let c0 = cols[0].toUpperCase();
                        if (/^[0-9]+[A-Z]?$/.test(c0) && !c0.startsWith('00')) {
                            c0 = '00' + c0;
                        }
                        if (c0) marketCapList.push(c0);
                    }


                    // B 欄：高股息 ETF (萬能補零)
                    if (cols[1]) {
                        let c1 = cols[1].toUpperCase();
                        if (/^[0-9]+[A-Z]?$/.test(c1) && !c1.startsWith('00')) {
                            c1 = '00' + c1;
                        }
                        if (c1) highDivList.push(c1);
                    }


                    // C 欄：個股白名單 (僅 trim 與大寫，嚴禁補 00)
                    if (cols[2]) {
                        let c2 = cols[2].toUpperCase();
                        if (c2) divWhiteList.push(c2);
                    }
                });


                marketCapList = Array.from(new Set(marketCapList)).filter(Boolean);
                highDivList = Array.from(new Set(highDivList)).filter(Boolean);
                divWhiteList = Array.from(new Set(divWhiteList)).filter(Boolean);


                if (marketCapList.length === 0 && highDivList.length === 0 && divWhiteList.length === 0) {
                    showToast("⚠️ 雲端名單為空，已啟動防空熔斷保留現有名單！", "error");
                    return;
                }


                GM_setValue("cm_etf_market_cap_list", marketCapList);
                GM_setValue("cm_etf_high_dividend_list", highDivList);
                GM_setValue("cm_div_whitelist", divWhiteList);
                GM_setValue("white_list", divWhiteList.join(','));


                const whiteArea = document.getElementById('cfg-white');
                if (whiteArea) whiteArea.value = divWhiteList.join(',');


                showToast(`✅ 雲端名單同步完成！(市值 ${marketCapList.length} / 高股息 ${highDivList.length} / 個股 ${divWhiteList.length})`);
            },
            ontimeout: function() {
                showToast("⚠️ 雲端名單拉取超時，已保留本機現有名單！", "error");
            },
            onerror: function() {
                showToast("⚠️ 雲端名單拉取失敗，已保留本機現有名單！", "error");
            }
        });
    }


    function createUI() {
        if (document.getElementById('cm-drawer-btn')) return;


        const ui = getDynamicUIParams();
        const btnFloat = document.createElement('div'); btnFloat.id = 'cm-drawer-btn'; btnFloat.innerHTML = '⚡'; document.body.appendChild(btnFloat);
        const panel = document.createElement('div'); panel.id = 'cm-main-panel';


        // 雙欄排版 Accordion 結構
        const cbHtml = `
            <div class="cm-checkbox-area-grid">
                <!-- 頂部通欄 -->
                <div class="cm-grid-full">
                    <div class="cm-cb-group" style="padding: 6px 8px; margin-bottom: 2px; background: #333; border-radius: 6px; border: 1px solid #555;">
                        <label class="cm-cb-label"><input type="checkbox" class="cm-cb-input cm-module-cb" value="realtime"> 即時五檔</label>
                    </div>
                </div>

                <!-- 左欄：技術分析 + 財務分析 -->
                <div class="cm-grid-left">
                    <details id="acc-tech" ${ACC_STATE['acc-tech'] ? 'open' : ''}>
                        <summary>技術分析</summary>
                        <div style="padding: 6px; display: flex; flex-direction: column; gap: 6px;">
                            <!-- 個股 K 線 -->
                            <div style="background: #2b2b2b; padding: 5px; border-radius: 4px; border: 1px solid #444;">
                                <label class="cm-cb-label" style="cursor:pointer; margin-bottom: 3px;">
                                    <input type="checkbox" class="cm-cb-input cm-module-cb" value="kline"> 個股 K 線狙擊
                                </label>
                                <div style="display: flex; align-items: center; justify-content: flex-end; gap: 4px;">
                                    <select id="cfg-prof-stock-ktype" class="cm-conf-select" style="max-width: 65px; text-align: left;">
                                        <option value="day">日K</option>
                                        <option value="week">週K</option>
                                        <option value="month">月K</option>
                                    </select>
                                    <input type="number" id="cfg-prof-stock-kdays" class="cm-conf-input" style="width: 42px;" value="60">
                                    <span style="font-size: 11px; color: #aaa;">筆</span>
                                </div>
                            </div>
                            <!-- 大盤 K 線 -->
                            <div style="background: #2b2b2b; padding: 5px; border-radius: 4px; border: 1px solid #444;">
                                <label class="cm-cb-label" style="cursor:pointer; color:#5cb85c; margin-bottom: 3px;">
                                    <input type="checkbox" class="cm-cb-input cm-module-cb" value="market_kline"> 大盤加權指數 K 線
                                </label>
                                <div style="display: flex; align-items: center; justify-content: flex-end; gap: 4px;">
                                    <select id="cfg-prof-market-ktype" class="cm-conf-select" style="max-width: 65px; text-align: left;">
                                        <option value="day">日K</option>
                                        <option value="week">週K</option>
                                        <option value="month">月K</option>
                                    </select>
                                    <input type="number" id="cfg-prof-market-kdays" class="cm-conf-input" style="width: 42px;" value="60">
                                    <span style="font-size: 11px; color: #aaa;">筆</span>
                                </div>
                            </div>
                        </div>
                    </details>

                    <details id="acc-finance" ${ACC_STATE['acc-finance'] ? 'open' : ''}>
                        <summary>財務分析</summary>
                        <div class="cm-checkbox-grid">
                            <label class="cm-cb-label"><input type="checkbox" class="cm-cb-input cm-module-cb" value="eps"> 歷年 EPS</label>
                            <label class="cm-cb-label"><input type="checkbox" class="cm-cb-input cm-module-cb" value="revenue"> 月營收</label>
                            <label class="cm-cb-label"><input type="checkbox" class="cm-cb-input cm-module-cb" value="income-statement"> 損益表</label>
                            <label class="cm-cb-label"><input type="checkbox" class="cm-cb-input cm-module-cb" value="balance-sheet"> 資產負債</label>
                            <label class="cm-cb-label"><input type="checkbox" class="cm-cb-input cm-module-cb" value="stockfindetail"> 三率趨勢</label>
                            <label class="cm-cb-label"><input type="checkbox" class="cm-cb-input cm-module-cb" value="revenue-source"> 營收組成</label>
                            <label class="cm-cb-label"><input type="checkbox" class="cm-cb-input cm-module-cb" value="cash-flow"> 現金流量表</label>
                            <label class="cm-cb-label"><input type="checkbox" class="cm-cb-input cm-module-cb" value="financial-ratio"> 財務比率</label>
                        </div>
                    </details>
                </div>

                <!-- 右欄：基本分析 + 籌碼分析 + ETF專區 -->
                <div class="cm-grid-right">
                    <details id="acc-basic" ${ACC_STATE['acc-basic'] ? 'open' : ''}>
                        <summary>基本分析</summary>
                        <div class="cm-checkbox-grid">
                            <label class="cm-cb-label"><input type="checkbox" class="cm-cb-input cm-module-cb" value="profile"> 基本資料</label>
                            <label class="cm-cb-label cm-stock-only-cb"><input type="checkbox" class="cm-cb-input cm-module-cb" value="institutional-target"> 法人目標</label>
                            <label class="cm-cb-label cm-stock-only-cb"><input type="checkbox" class="cm-cb-input cm-module-cb" value="pe"> PE 河流圖</label>
                            <label class="cm-cb-label cm-stock-only-cb"><input type="checkbox" class="cm-cb-input cm-module-cb" value="pb"> PB 河流圖</label>
                            <label class="cm-cb-label"><input type="checkbox" class="cm-cb-input cm-module-cb" value="dividend"> 股利政策</label>
                        </div>
                    </details>

                    <details id="acc-chip" ${ACC_STATE['acc-chip'] ? 'open' : ''}>
                        <summary>籌碼分析</summary>
                        <div class="cm-checkbox-grid">
                            <label class="cm-cb-label"><input type="checkbox" class="cm-cb-input cm-module-cb" value="shareholding"> 大戶散戶</label>
                        </div>
                    </details>

                    <details id="acc-etf" ${ACC_STATE['acc-etf'] ? 'open' : ''}>
                        <summary>ETF 專區</summary>
                        <div class="cm-checkbox-grid">
                            <label class="cm-cb-label"><input type="checkbox" class="cm-cb-input cm-module-cb" value="constituent"> ETF 成分股</label>
                            <label class="cm-cb-label"><input type="checkbox" class="cm-cb-input cm-module-cb" value="discount"> 折溢價</label>
                            <label class="cm-cb-label"><input type="checkbox" class="cm-cb-input cm-module-cb" value="div_comp"> 股利組成</label>
                            <label class="cm-cb-label"><input type="checkbox" class="cm-cb-input cm-module-cb" value="trading-fee"> 交易費用</label>
                            <label class="cm-cb-label"><input type="checkbox" class="cm-cb-input cm-module-cb" value="risk"> 風險指標</label>
                            <label class="cm-cb-label"><input type="checkbox" class="cm-cb-input cm-module-cb" value="drawdown"> 歷史回撤</label>
                        </div>
                    </details>
                </div>
            </div>
        `;


        panel.innerHTML = `
            <div id="cm-panel-head">
                <button id="cm-toggle-left" class="cm-toggle-btn">◀ 設定</button>
                <span>數據助手 v3.9.0</span>
                <button id="cm-toggle-right" class="cm-toggle-btn">參數 ▶</button>
            </div>

            <div class="cc-drawer-row">
                <!-- 左抽屜：系統與全域設定 -->
                <div id="drawer-left" class="cc-drawer">
                    <div class="cc-drawer-content">
                        <div class="cm-json-title" style="margin-top:0;">⚙️ 系統設定</div>
                        <div class="cm-conf-row">字體縮放偏移: <input type="number" id="cfg-font" class="cm-conf-input" value="${CONFIG.font_offset}"></div>
                        <div class="cm-conf-row">表格強制展開: <select id="cfg-expanded" class="cm-conf-select"><option value="true" ${isExpanded ? 'selected' : ''}>ON</option><option value="false" ${!isExpanded ? 'selected' : ''}>OFF</option></select></div>
                        <div class="cm-conf-row">側邊吸附位置: <select id="cfg-drawer-side" class="cm-conf-select"><option value="left" ${CONFIG.drawer_side === 'left' ? 'selected' : ''}>左側</option><option value="right" ${CONFIG.drawer_side === 'right' ? 'selected' : ''}>右側</option></select></div>
                        <div class="cm-conf-row">K線數據排序: <select id="cfg-kline-sort" class="cm-conf-select"><option value="desc" ${CONFIG.kline_sort === 'desc' ? 'selected' : ''}>倒序(新➔舊)</option><option value="asc" ${CONFIG.kline_sort === 'asc' ? 'selected' : ''}>正序(舊➔新)</option></select></div>

                        <div class="cm-json-title">🎯 智慧路由預設組合</div>
                        <div class="cm-conf-row">個股預設組合: <select id="cfg-def-stock-prof" class="cm-conf-select"></select></div>
                        <div class="cm-conf-row">ETF 預設組合: <select id="cfg-def-etf-prof" class="cm-conf-select"></select></div>

                        <div class="cm-json-title">☁️ 雲端名單同步</div>
                        <div style="font-size: ${ui.f12}px; color: #aaa;">Google 試算表位址 (CSV):</div>
                        <input type="text" id="cfg-sync-sheet-url" class="cm-conf-input" style="width: 100%; text-align: left; margin-top: 3px; box-sizing: border-box;" value="${escapeHtml(CONFIG.sync_sheet_url)}">
                        <button id="cm-btn-sync-sheet" class="cm-btn" style="background: #17a2b8; color: #fff; margin-top: 6px;">🔄 立即同步雲端名單</button>

                        <div style="font-size: ${ui.f12}px; color: #aaa; margin: 12px 0 2px 0;">熱鍵組合：^=Ctrl, +=Shift, !=Alt</div>
                        <div class="cm-conf-row">單頁抓取熱鍵: <input type="text" id="cfg-hk-single" class="cm-conf-input" style="width: 80px;" value="${escapeHtml(CONFIG.hotkey_single)}"></div>
                        <div class="cm-conf-row">批量彙整熱鍵: <input type="text" id="cfg-hk-batch" class="cm-conf-input" style="width: 80px;" value="${escapeHtml(CONFIG.hotkey_batch)}"></div>
                        <div class="cm-conf-row">重新複製熱鍵: <input type="text" id="cfg-hk-recopy" class="cm-conf-input" style="width: 80px;" value="${escapeHtml(CONFIG.hotkey_recopy)}"></div>

                        <button id="cm-cfg-save-sys" class="cm-btn cm-btn-save" style="margin-top: 12px;">💾 儲存系統設定並重整</button>

                        <div class="cm-json-title">🔄 雙腳本共用互通</div>
                        <textarea id="cm-json-io-shared" class="cm-list-area" placeholder="貼上共用 JSON..."></textarea>
                        <div class="cm-json-btn-grid">
                            <button id="cm-btn-exp-sh" class="cm-json-btn">匯出</button>
                            <button id="cm-btn-imp-sh" class="cm-json-btn">匯入</button>
                            <button id="cm-btn-exp-cp-sh" class="cm-json-btn">匯出並複製</button>
                            <button id="cm-btn-imp-ap-sh" class="cm-json-btn">匯入並重整</button>
                        </div>

                        <div class="cm-json-title">💾 數據助手全設定備份</div>
                        <textarea id="cm-json-io-full" class="cm-list-area" placeholder="貼上完整備份 JSON..."></textarea>
                        <div class="cm-json-btn-grid">
                            <button id="cm-btn-exp-fl" class="cm-json-btn">匯出完整</button>
                            <button id="cm-btn-imp-fl" class="cm-json-btn">匯入</button>
                            <button id="cm-btn-exp-cp-fl" class="cm-json-btn">匯出並複製</button>
                            <button id="cm-btn-imp-ap-fl" class="cm-json-btn">匯入並重整</button>
                        </div>
                    </div>
                </div>

                <!-- 中央舞台 -->
                <div class="cc-center-stage">
                    <div class="cm-profile-area">
                        <div class="cm-profile-header">
                            <div class="cm-header-row">
                                <select id="cm-cat-select"></select>
                                <button id="cm-btn-rename-cat" class="cm-btn-rename">✏️ 重新命名</button>
                            </div>
                            <div class="cm-header-row">
                                <select id="cm-profile-select"></select>
                                <button id="cm-btn-rename-prof" class="cm-btn-rename">✏️ 重新命名</button>
                            </div>
                        </div>
                        <div class="cm-checkbox-area" style="margin-bottom: 10px;">${cbHtml}</div>
                        <button id="cm-btn-save-profile" class="cm-btn cm-btn-save" style="margin-bottom:0;">💾 儲存組合勾選狀態</button>
                    </div>

                    <button id="cm-btn-batch-exec" class="cm-btn cm-btn-batch">⚡ 自動開頁彙整勾選資料</button>
                    <button id="cm-btn-recopy" class="cm-btn" style="background: #17a2b8; color: #fff; margin-bottom: 8px;">📋 重新複製上次數據</button>

                    <hr style="border: 0.5px solid #444; margin: 5px 0 10px 0; width:100%;">
                    <div id="cm-smart-info" style="color: #00ff00; font-size: ${ui.f12}px; text-align: center; margin-bottom: 8px;"></div>

                    <div id="cm-single-wrapper" style="display: flex; gap: 8px; margin-bottom: 8px;">
                        <input type="number" id="cm-override-limit" placeholder="自訂筆數" style="width: 80px; background:#444; color:#fff; border:1px solid #666; border-radius:4px; text-align:center; font-size: ${ui.f13}px;">
                        <button id="cm-btn-single-exec" class="cm-btn cm-btn-single" style="margin-bottom:0; flex:1;">🎯 抓取當前單一頁面</button>
                    </div>

                    <button id="cm-panel-close-btn" class="cm-btn" style="background:#444; color:#fff;">✖ 隱藏助手面板</button>
                    <div id="cm-status-bar">Ready</div>
                </div>

                <!-- 右抽屜：抓取筆數與名單參數 (徹底解耦左抽屜 Storage Key) -->
                <div id="drawer-right" class="cc-drawer">
                    <div class="cc-drawer-content">
                        <div class="cm-json-title" style="margin-top:0;">📊 抓取筆數限制</div>
                        <details id="acc-cfg-fin" ${ACC_STATE['acc-cfg-fin'] ? 'open' : ''}>
                            <summary>財報與營收限制</summary>
                            <div>
                                <div class="cm-conf-row">EPS 季/年: <input type="number" id="cfg-eps" class="cm-conf-input" value="${CONFIG.eps}"></div>
                                <div class="cm-conf-row">營收月數: <input type="number" id="cfg-rev" class="cm-conf-input" value="${CONFIG.revenue}"></div>
                                <div class="cm-conf-row">損益表季數: <input type="number" id="cfg-income" class="cm-conf-input" value="${CONFIG.income}"></div>
                                <div class="cm-conf-row">資產負債季數: <input type="number" id="cfg-balance" class="cm-conf-input" value="${CONFIG.balance}"></div>
                                <div class="cm-conf-row">現金流季數: <input type="number" id="cfg-cashflow" class="cm-conf-input" value="${CONFIG.cashflow}"></div>
                                <div class="cm-conf-row">三率趨勢: <input type="number" id="cfg-fin" class="cm-conf-input" value="${CONFIG.stockfindetail}"></div>
                            </div>
                        </details>
                        <details id="acc-cfg-etf" ${ACC_STATE['acc-cfg-etf'] ? 'open' : ''}>
                            <summary>股利與 ETF 限制</summary>
                            <div>
                                <div class="cm-conf-row">股利(年配): <input type="number" id="cfg-div-s" class="cm-conf-input" value="${CONFIG.div_stock}"></div>
                                <div class="cm-conf-row">股利(季月): <input type="number" id="cfg-div-e" class="cm-conf-input" value="${CONFIG.div_etf}"></div>
                                <div class="cm-conf-row">ETF持股(Top): <input type="number" id="cfg-const" class="cm-conf-input" value="${CONFIG.constituents}"></div>
                                <div class="cm-conf-row">股利組成: <input type="number" id="cfg-divcomp" class="cm-conf-input" value="${CONFIG.div_comp}"></div>
                                <div class="cm-conf-row">折溢價天數: <input type="number" id="cfg-disc" class="cm-conf-input" value="${CONFIG.discount}"></div>
                                <div class="cm-conf-row">回撤天數: <input type="number" id="cfg-drawdown" class="cm-conf-input" value="${CONFIG.drawdown}"></div>
                            </div>
                        </details>
                        <details id="acc-cfg-chip" ${ACC_STATE['acc-cfg-chip'] ? 'open' : ''}>
                            <summary>籌碼與評價限制</summary>
                            <div>
                                <div class="cm-conf-row">PE/PB 河流圖: <input type="number" id="cfg-pepb" class="cm-conf-input" value="${CONFIG.pepb}"></div>
                                <div class="cm-conf-row">大戶散戶: <input type="number" id="cfg-share" class="cm-conf-input" value="${CONFIG.shareholding}"></div>
                            </div>
                        </details>

                        <div class="cm-json-title">📋 股利頻率名單</div>
                        <div style="font-size: ${ui.f12}px; color: #aaa;">季/月配白名單 (ETF預設為此):</div><textarea id="cfg-white" class="cm-list-area">${escapeHtml(CONFIG.white_list)}</textarea>
                        <div style="font-size: ${ui.f12}px; color: #aaa; margin-top: 5px;">年配黑名單:</div><textarea id="cfg-black" class="cm-list-area">${escapeHtml(CONFIG.black_list)}</textarea>

                        <button id="cm-cfg-save" class="cm-btn cm-btn-save" style="margin-top: 12px;">💾 儲存抓取參數並重整</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(panel);


        document.getElementById('cm-toggle-left').onclick = () => toggleSideDrawer('left');
        document.getElementById('cm-toggle-right').onclick = () => toggleSideDrawer('right');


        if(CONFIG.left_open) toggleSideDrawer('left');
        if(CONFIG.right_open) toggleSideDrawer('right');


        setupDrawerLogic(btnFloat, panel);
        makeDraggable(panel, document.getElementById('cm-panel-head'));


        document.getElementById('cm-panel-close-btn').onclick = () => { panel.style.display = 'none'; btnFloat.style.display = 'flex'; GM_setValue("is_panel_open", false); };


        const selCat = document.getElementById('cm-cat-select');
        const selProf = document.getElementById('cm-profile-select');
        const checkboxes = document.querySelectorAll('.cm-module-cb');
        const defStockProfEl = document.getElementById('cfg-def-stock-prof');
        const defEtfProfEl = document.getElementById('cfg-def-etf-prof');


        function populateDefaultProfileOptions() {
            if (defStockProfEl) {
                const stockCat = CATEGORIES.find(c => c.catId === 0) || CATEGORIES[0];
                defStockProfEl.innerHTML = stockCat.profiles.map(p => `<option value="${p.id}" ${p.id === CONFIG.default_stock_prof ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('');
            }
            if (defEtfProfEl) {
                const etfCat = CATEGORIES.find(c => c.catId === 2) || CATEGORIES[CATEGORIES.length - 1];
                defEtfProfEl.innerHTML = etfCat.profiles.map(p => `<option value="${p.id}" ${p.id === CONFIG.default_etf_prof ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('');
            }
        }


        function loadCategories() {
            selCat.innerHTML = CATEGORIES.map(c => `<option value="${c.catId}">${escapeHtml(c.catName)}</option>`).join('');
            const validCat = CATEGORIES.find(c => c.catId === CONFIG.current_cat_id) ? CONFIG.current_cat_id : CATEGORIES[0].catId;
            selCat.value = validCat;
            loadProfilesList(validCat, CONFIG.current_profile_id);
            populateDefaultProfileOptions();
        }


        function loadProfilesList(catId, profIdToSelect) {
            const targetCatId = safeInt(catId, 0);
            const cat = CATEGORIES.find(c => c.catId === targetCatId) || CATEGORIES[0];
            selProf.innerHTML = cat.profiles.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
            
            const profExists = cat.profiles.find(p => p.id === profIdToSelect);
            const activeProfId = profExists ? profIdToSelect : cat.profiles[0].id;
            selProf.value = activeProfId;
            
            loadProfileData(cat.catId, activeProfId);
        }


        function loadProfileData(catId, profId) {
            const cId = safeInt(catId, 0);
            const pId = safeInt(profId, 0);
            const cat = CATEGORIES.find(c => c.catId === cId) || CATEGORIES[0];
            const prof = cat.profiles.find(p => p.id === pId) || cat.profiles[0];
            
            checkboxes.forEach(cb => { cb.checked = (prof.modules || []).includes(cb.value); });
            
            const kcfg = prof.kline_cfg || { stock_type: "week", stock_limit: 60, market_type: "week", market_limit: 60 };
            const sType = document.getElementById('cfg-prof-stock-ktype');
            const sDays = document.getElementById('cfg-prof-stock-kdays');
            const mType = document.getElementById('cfg-prof-market-ktype');
            const mDays = document.getElementById('cfg-prof-market-kdays');


            if (sType) sType.value = kcfg.stock_type || "week";
            if (sDays) sDays.value = kcfg.stock_limit || 60;
            if (mType) mType.value = kcfg.market_type || "week";
            if (mDays) mDays.value = kcfg.market_limit || 60;


            // UI-02: 個股 / ETF 情境感知互斥動態遮罩
            const accEtf = document.getElementById('acc-etf');
            const accFinance = document.getElementById('acc-finance');
            const stockOnlyLabels = document.querySelectorAll('.cm-stock-only-cb');


            if (cId === 2) {
                // ETF 情境
                if (accEtf) accEtf.style.display = 'block';
                if (accFinance) accFinance.style.display = 'none';
                stockOnlyLabels.forEach(el => el.style.display = 'none');
            } else {
                // 個股情境
                if (accEtf) accEtf.style.display = 'none';
                if (accFinance) accFinance.style.display = 'block';
                stockOnlyLabels.forEach(el => el.style.display = 'flex');
            }


            CONFIG.current_cat_id = cat.catId; 
            CONFIG.current_profile_id = prof.id;
            GM_setValue("cm_current_cat_id", cat.catId); 
            GM_setValue("cm_current_profile_id", prof.id);
        }


        selCat.onchange = (e) => {
            userManuallySelectedProfile = true;
            const nextCatId = safeInt(e.target.value, 0);
            loadProfilesList(nextCatId, -1);
        };
        selProf.onchange = (e) => {
            userManuallySelectedProfile = true;
            const cId = safeInt(selCat.value, 0);
            const pId = safeInt(e.target.value, 0);
            loadProfileData(cId, pId);
        };


        document.getElementById('cm-btn-rename-cat').onclick = () => {
            const catId = parseInt(selCat.value, 10);
            const cat = CATEGORIES.find(c => c.catId === catId);
            if (cat) {
                const newName = prompt("請輸入新的大分類名稱：", cat.catName);
                if (newName && newName.trim() !== "") {
                    saveCategories((cats) => {
                        const target = cats.find(c => c.catId === catId);
                        if (target) target.catName = newName.trim();
                    });
                    selCat.options[selCat.selectedIndex].text = newName.trim();
                    showToast("✅ 名稱已修改");
                }
            }
        };


        document.getElementById('cm-btn-rename-prof').onclick = () => {
            const catId = parseInt(selCat.value, 10);
            const profId = parseInt(selProf.value, 10);
            const cat = CATEGORIES.find(c => c.catId === catId);
            if (cat) {
                const p = cat.profiles.find(x => x.id === profId);
                if (p) {
                    const newName = prompt("請輸入新的群組名稱：", p.name);
                    if (newName && newName.trim() !== "") {
                        saveCategories((cats) => {
                            const c = cats.find(x => x.catId === catId);
                            const item = c ? c.profiles.find(x => x.id === profId) : null;
                            if (item) item.name = newName.trim();
                        });
                        selProf.options[selProf.selectedIndex].text = newName.trim();
                        populateDefaultProfileOptions();
                        showToast("✅ 名稱已修改");
                    }
                }
            }
        };


        document.getElementById('cm-btn-save-profile').onclick = () => {
            const catId = parseInt(selCat.value, 10); 
            const profId = parseInt(selProf.value, 10);
            
            saveCategories((cats) => {
                const cat = cats.find(c => c.catId === catId);
                if (cat) {
                    const p = cat.profiles.find(x => x.id === profId);
                    if (p) {
                        const visibleChecked = Array.from(document.querySelectorAll('.cm-module-cb'))
                            .filter(cb => cb.offsetParent !== null && cb.checked)
                            .map(cb => cb.value);


                        // 防抹殺規範：保留被遮罩隱藏的原生記憶 (聯集合併)
                        const hiddenExisting = (p.modules || []).filter(modKey => {
                            const cb = document.querySelector(`.cm-module-cb[value="${modKey}"]`);
                            return cb && cb.offsetParent === null;
                        });


                        p.modules = Array.from(new Set([...visibleChecked, ...hiddenExisting]));
                        p.kline_cfg = {
                            stock_type: document.getElementById('cfg-prof-stock-ktype')?.value || "week",
                            stock_limit: safeInt(document.getElementById('cfg-prof-stock-kdays')?.value, 60),
                            market_type: document.getElementById('cfg-prof-market-ktype')?.value || "week",
                            market_limit: safeInt(document.getElementById('cfg-prof-market-kdays')?.value, 60)
                        };
                    }
                }
            });
            showToast("✅ 組合設定與 K 線配置已儲存");
        };


        loadCategories();


        document.querySelectorAll('details[id^="acc-"]').forEach(det => {
            det.addEventListener('toggle', (e) => {
                const currentState = GM_getValue("cm_acc_state", DEFAULT_ACC_STATE);
                currentState[e.target.id] = e.target.open;
                GM_setValue("cm_acc_state", currentState);
            });
        });


        const overrideInput = document.getElementById('cm-override-limit');
        if (overrideInput) {
            overrideInput.addEventListener('input', updateVisibility);
        }


        document.getElementById('cm-btn-batch-exec').onclick = startRelayBatchScrape;
        document.getElementById('cm-btn-single-exec').onclick = () => {
            const modKey = getCurrentPageModule();
            if (modKey) executeSinglePageScrape(modKey); else showToast("⚠️ 此頁面目前不支援單頁抓取");
        };


        document.getElementById('cm-btn-recopy').onclick = () => {
            const recopyBtn = document.getElementById('cm-btn-recopy');
            if (recopyBtn) recopyBtn.classList.remove('cm-btn-pulse');


            const lastData = GM_getValue("cm_last_scraped_data", "");
            if (!lastData) {
                showToast("⚠️ 尚無暫存的歷史數據");
                return;
            }


            const lastStockId = GM_getValue("cm_last_scraped_stock_id", "");
            const currentStockMatch = window.location.pathname.match(/\/stock\/([A-Za-z0-9]+)(?:[\/\?#]|$)/);
            const currentStockId = currentStockMatch ? currentStockMatch[1].toUpperCase() : "";


            GM_setClipboard(lastData);
            if (navigator.clipboard?.writeText) {
                navigator.clipboard.writeText(lastData).catch(() => {});
            }


            if (currentStockId && lastStockId && currentStockId !== lastStockId) {
                showToast(`⚠️ 注意：正在重新複製不同標的 (${lastStockId}) 之數據`);
            } else {
                showToast("✅ 已重新複製上次數據");
            }
        };


        document.getElementById('cm-btn-sync-sheet').onclick = () => {
            const urlInput = document.getElementById('cfg-sync-sheet-url');
            const targetUrl = urlInput ? urlInput.value.trim() : CONFIG.sync_sheet_url;
            if (targetUrl) {
                GM_setValue("cm_sync_sheet_url", targetUrl);
                CONFIG.sync_sheet_url = targetUrl;
            }
            syncGoogleSheetLists(targetUrl);
        };


        // 左抽屜獨立系統設定儲存入口 (儲存全域外觀、熱鍵、預設組合與試算表網址)
        document.getElementById('cm-cfg-save-sys').onclick = () => {
            GM_setValue("font_offset", safeInt(document.getElementById('cfg-font').value, 0));
            GM_setValue("isExpanded", document.getElementById('cfg-expanded').value === 'true');
            GM_setValue("cm_drawer_side", document.getElementById('cfg-drawer-side').value);
            GM_setValue("cm_kline_sort", document.getElementById('cfg-kline-sort').value);
            GM_setValue("cm_hk_single", document.getElementById('cfg-hk-single').value.trim());
            GM_setValue("cm_hk_batch", document.getElementById('cfg-hk-batch').value.trim());
            GM_setValue("cm_hk_recopy", document.getElementById('cfg-hk-recopy').value.trim());
            
            const sheetUrlVal = document.getElementById('cfg-sync-sheet-url')?.value.trim() || DEFAULT_SHEET_URL;
            GM_setValue("cm_sync_sheet_url", sheetUrlVal);


            const defStockVal = safeInt(document.getElementById('cfg-def-stock-prof')?.value, 4);
            const defEtfVal = safeInt(document.getElementById('cfg-def-etf-prof')?.value, 10);
            GM_setValue("cm_default_stock_prof", defStockVal);
            GM_setValue("cm_default_etf_prof", defEtfVal);


            GM_setValue("is_panel_open", true);
            location.reload();
        };


        // 右抽屜抓取筆數與名單儲存 (徹底解耦，絕不覆蓋左抽屜鍵值)
        document.getElementById('cm-cfg-save').onclick = () => {
            GM_setValue("limit_eps", safeInt(document.getElementById('cfg-eps').value, 12));
            GM_setValue("limit_rev", safeInt(document.getElementById('cfg-rev').value, 12));
            GM_setValue("limit_income", safeInt(document.getElementById('cfg-income').value, 8));
            GM_setValue("limit_balance", safeInt(document.getElementById('cfg-balance').value, 8));
            GM_setValue("limit_cashflow", safeInt(document.getElementById('cfg-cashflow').value, 12));
            GM_setValue("limit_div_stock", safeInt(document.getElementById('cfg-div-s').value, 7));
            GM_setValue("limit_div_etf", safeInt(document.getElementById('cfg-div-e').value, 24));
            GM_setValue("limit_pepb", safeInt(document.getElementById('cfg-pepb').value, 60));
            GM_setValue("limit_share", safeInt(document.getElementById('cfg-share').value, 20));
            GM_setValue("limit_fin", safeInt(document.getElementById('cfg-fin').value, 12));
            GM_setValue("limit_divcomp", safeInt(document.getElementById('cfg-divcomp').value, 12));
            GM_setValue("limit_const", safeInt(document.getElementById('cfg-const').value, 10));
            GM_setValue("limit_discount", safeInt(document.getElementById('cfg-disc').value, 10));
            GM_setValue("limit_drawdown", safeInt(document.getElementById('cfg-drawdown').value, 10));
            GM_setValue("white_list", document.getElementById('cfg-white').value.trim());
            GM_setValue("black_list", document.getElementById('cfg-black').value.trim());


            GM_setValue("is_panel_open", true);
            location.reload();
        };


        const getSharedJson = () => ({
            limit_div_stock: safeInt(document.getElementById('cfg-div-s').value, 7),
            limit_div_etf: safeInt(document.getElementById('cfg-div-e').value, 24),
            white_list: document.getElementById('cfg-white').value.trim(),
            black_list: document.getElementById('cfg-black').value.trim()
        });


        const getFullJson = () => ({
            font_offset: safeInt(document.getElementById('cfg-font').value, 0),
            kline_sort: document.getElementById('cfg-kline-sort').value,
            sync_sheet_url: document.getElementById('cfg-sync-sheet-url')?.value.trim() || CONFIG.sync_sheet_url,
            default_stock_prof: safeInt(document.getElementById('cfg-def-stock-prof')?.value, 4),
            default_etf_prof: safeInt(document.getElementById('cfg-def-etf-prof')?.value, 10),
            limit_eps: safeInt(document.getElementById('cfg-eps').value, 12),
            limit_rev: safeInt(document.getElementById('cfg-rev').value, 12),
            limit_income: safeInt(document.getElementById('cfg-income').value, 8),
            limit_balance: safeInt(document.getElementById('cfg-balance').value, 8),
            limit_cashflow: safeInt(document.getElementById('cfg-cashflow').value, 12),
            limit_div_stock: safeInt(document.getElementById('cfg-div-s').value, 7),
            limit_div_etf: safeInt(document.getElementById('cfg-div-e').value, 24),
            limit_pepb: safeInt(document.getElementById('cfg-pepb').value, 60),
            limit_share: safeInt(document.getElementById('cfg-share').value, 20),
            limit_fin: safeInt(document.getElementById('cfg-fin').value, 12),
            limit_divcomp: safeInt(document.getElementById('cfg-divcomp').value, 12),
            limit_const: safeInt(document.getElementById('cfg-const').value, 10),
            limit_discount: safeInt(document.getElementById('cfg-disc').value, 10),
            limit_drawdown: safeInt(document.getElementById('cfg-drawdown').value, 10),
            white_list: document.getElementById('cfg-white').value.trim(),
            black_list: document.getElementById('cfg-black').value.trim(),
            hotkey_single: document.getElementById('cfg-hk-single').value.trim(),
            hotkey_batch: document.getElementById('cfg-hk-batch').value.trim(),
            hotkey_recopy: document.getElementById('cfg-hk-recopy').value.trim(),
            categories: CATEGORIES
        });


        const applyJsonData = (data, isFull = false) => {
            if (data.limit_div_stock !== undefined) { const val = safeInt(data.limit_div_stock, 7); GM_setValue("limit_div_stock", val); document.getElementById('cfg-div-s').value = val; }
            if (data.limit_div_etf !== undefined) { const val = safeInt(data.limit_div_etf, 24); GM_setValue("limit_div_etf", val); document.getElementById('cfg-div-e').value = val; }
            if (data.white_list !== undefined) { const val = data.white_list.trim(); GM_setValue("white_list", val); document.getElementById('cfg-white').value = val; }
            if (data.black_list !== undefined) { const val = data.black_list.trim(); GM_setValue("black_list", val); document.getElementById('cfg-black').value = val; }


            if (isFull) {
                if (data.font_offset !== undefined) { const val = safeInt(data.font_offset, 0); GM_setValue("font_offset", val); document.getElementById('cfg-font').value = val; }
                if (data.kline_sort !== undefined) { GM_setValue("cm_kline_sort", data.kline_sort); document.getElementById('cfg-kline-sort').value = data.kline_sort; }
                if (data.sync_sheet_url !== undefined) { GM_setValue("cm_sync_sheet_url", data.sync_sheet_url); if (document.getElementById('cfg-sync-sheet-url')) document.getElementById('cfg-sync-sheet-url').value = data.sync_sheet_url; }
                if (data.default_stock_prof !== undefined) { GM_setValue("cm_default_stock_prof", safeInt(data.default_stock_prof, 4)); if (document.getElementById('cfg-def-stock-prof')) document.getElementById('cfg-def-stock-prof').value = data.default_stock_prof; }
                if (data.default_etf_prof !== undefined) { GM_setValue("cm_default_etf_prof", safeInt(data.default_etf_prof, 10)); if (document.getElementById('cfg-def-etf-prof')) document.getElementById('cfg-def-etf-prof').value = data.default_etf_prof; }
                if (data.limit_eps !== undefined) { const val = safeInt(data.limit_eps, 12); GM_setValue("limit_eps", val); document.getElementById('cfg-eps').value = val; }
                if (data.limit_rev !== undefined) { const val = safeInt(data.limit_rev, 12); GM_setValue("limit_rev", val); document.getElementById('cfg-rev').value = val; }
                if (data.limit_income !== undefined) { const val = safeInt(data.limit_income, 8); GM_setValue("limit_income", val); if (document.getElementById('cfg-income')) document.getElementById('cfg-income').value = val; }
                if (data.limit_balance !== undefined) { const val = safeInt(data.limit_balance, 8); GM_setValue("limit_balance", val); if (document.getElementById('cfg-balance')) document.getElementById('cfg-balance').value = val; }
                if (data.limit_cashflow !== undefined) { const val = safeInt(data.limit_cashflow, 12); GM_setValue("limit_cashflow", val); document.getElementById('cfg-cashflow').value = val; }
                if (data.limit_pepb !== undefined) { const val = safeInt(data.limit_pepb, 60); GM_setValue("limit_pepb", val); document.getElementById('cfg-pepb').value = val; }
                if (data.limit_share !== undefined) { const val = safeInt(data.limit_share, 20); GM_setValue("limit_share", val); document.getElementById('cfg-share').value = val; }
                if (data.limit_fin !== undefined) { const val = safeInt(data.limit_fin, 12); GM_setValue("limit_fin", val); document.getElementById('cfg-fin').value = val; }
                if (data.limit_divcomp !== undefined) { const val = safeInt(data.limit_divcomp, 12); GM_setValue("limit_divcomp", val); document.getElementById('cfg-divcomp').value = val; }
                if (data.limit_const !== undefined) { const val = safeInt(data.limit_const, 10); GM_setValue("limit_const", val); document.getElementById('cfg-const').value = val; }
                if (data.limit_discount !== undefined) { const val = safeInt(data.limit_discount, 10); GM_setValue("limit_discount", val); document.getElementById('cfg-disc').value = val; }
                if (data.limit_drawdown !== undefined) { const val = safeInt(data.limit_drawdown, 10); GM_setValue("limit_drawdown", val); if (document.getElementById('cfg-drawdown')) document.getElementById('cfg-drawdown').value = val; }
                if (data.hotkey_single !== undefined) { const val = data.hotkey_single.trim(); GM_setValue("cm_hk_single", val); document.getElementById('cfg-hk-single').value = val; }
                if (data.hotkey_batch !== undefined) { const val = data.hotkey_batch.trim(); GM_setValue("cm_hk_batch", val); document.getElementById('cfg-hk-batch').value = val; }
                if (data.hotkey_recopy !== undefined) { const val = data.hotkey_recopy.trim(); GM_setValue("cm_hk_recopy", val); document.getElementById('cfg-hk-recopy').value = val; }


                if (data.categories !== undefined && Array.isArray(data.categories)) { 
                    // 🛡️ 增加 categories 陣列深度校驗，防止殘缺 JSON 注入引發 AST 拋錯
                    const isValidStructure = data.categories.length > 0 && data.categories.every(c => c && Array.isArray(c.profiles));
                    if (isValidStructure) {
                        saveCategories((cats) => {
                            // 就地替換 currentCats 內容，確保寫回 Storage 的是新資料
                            cats.length = 0;
                            cats.push(...JSON.parse(JSON.stringify(data.categories)));
                        });
                        loadCategories(); 
                    } else {
                        console.warn("CM Scraper: 匯入之 categories 結構異常，已略過分類還原");
                    }
                }
            }
        };


        document.getElementById('cm-btn-exp-sh').onclick = () => { const str = JSON.stringify(getSharedJson(), null, 2); document.getElementById('cm-json-io-shared').value = str; showToast("✅ 共用設定已匯出"); };
        document.getElementById('cm-btn-exp-cp-sh').onclick = () => { const str = JSON.stringify(getSharedJson(), null, 2); document.getElementById('cm-json-io-shared').value = str; GM_setClipboard(str); showToast("✅ 共用設定已匯出並複製"); };
        document.getElementById('cm-btn-imp-sh').onclick = () => { try { const str = document.getElementById('cm-json-io-shared').value; if(!str) return showToast("⚠️ 請先貼上 JSON"); applyJsonData(JSON.parse(str), false); showToast("✅ 匯入成功"); } catch(e) { showToast("⚠️ 格式錯誤"); } };
        document.getElementById('cm-btn-imp-ap-sh').onclick = () => { try { const str = document.getElementById('cm-json-io-shared').value; if(!str) return showToast("⚠️ 請先貼上 JSON"); applyJsonData(JSON.parse(str), false); setTimeout(()=>location.reload(), 500); } catch(e) { showToast("⚠️ 格式錯誤"); } };


        document.getElementById('cm-btn-exp-fl').onclick = () => { const str = JSON.stringify(getFullJson(), null, 2); document.getElementById('cm-json-io-full').value = str; showToast("✅ 完整設定已匯出"); };
        document.getElementById('cm-btn-exp-cp-fl').onclick = () => { const str = JSON.stringify(getFullJson(), null, 2); document.getElementById('cm-json-io-full').value = str; GM_setClipboard(str); showToast("✅ 完整設定已匯出並複製"); };
        document.getElementById('cm-btn-imp-fl').onclick = () => { try { const str = document.getElementById('cm-json-io-full').value; if(!str) return showToast("⚠️ 請先貼上 JSON"); applyJsonData(JSON.parse(str), true); showToast("✅ 匯入成功"); } catch(e) { showToast("⚠️ 格式錯誤"); } };
        document.getElementById('cm-btn-imp-ap-fl').onclick = () => { try { const str = document.getElementById('cm-json-io-full').value; if(!str) return showToast("⚠️ 請先貼上 JSON"); applyJsonData(JSON.parse(str), true); setTimeout(()=>location.reload(), 500); } catch(e) { showToast("⚠️ 格式錯誤"); } };
    }


    function setupDrawerLogic(btn, panel) {
        let startY = 0, startTop = 0, hasMoved = false;
        btn.onmousedown = (e) => { e.preventDefault(); hasMoved = false; startY = e.clientY; startTop = btn.offsetTop; document.onmousemove = (ev) => { hasMoved = true; btn.style.top = Math.max(0, Math.min(startTop + (ev.clientY - startY), window.innerHeight - 55)) + 'px'; }; document.onmouseup = () => { document.onmousemove = null; document.onmouseup = null; GM_setValue("drawer_top", btn.offsetTop); }; };
        btn.onclick = () => { if (!hasMoved) { btn.style.display = 'none'; panel.style.display = 'flex'; GM_setValue("is_panel_open", true); } };
    }


    function makeDraggable(element, handle) {
        let p1=0, p2=0, p3=0, p4=0;
        handle.onmousedown = (e) => {
            if(e.target.tagName.toLowerCase() === 'button') return;
            e.preventDefault(); p3 = e.clientX; p4 = e.clientY;
            document.onmouseup = () => { 
                document.onmousemove = null; 
                document.onmouseup = null; 
                // FIX-02: 嚴格數值兜底
                const curTop = Number.isFinite(parseFloat(element.style.top)) ? parseFloat(element.style.top) : 150;
                const curLeft = Number.isFinite(parseFloat(element.style.left)) ? parseFloat(element.style.left) : 200;
                GM_setValue("panel_pos", {top: curTop, left: curLeft}); 
            };
            document.onmousemove = (ev) => {
                p1 = p3 - ev.clientX; p2 = p4 - ev.clientY; p3 = ev.clientX; p4 = ev.clientY;
                let newTop = element.offsetTop - p2;
                let newLeft = element.offsetLeft - p1;
                
                // 限制 Y 軸與 X 軸夾緊防禦
                const maxTop = window.innerHeight - 40;
                const maxLeft = window.innerWidth - element.offsetWidth;
                element.style.top = Math.max(0, Math.min(newTop, maxTop)) + "px";
                element.style.left = Math.max(0, Math.min(newLeft, Math.max(0, maxLeft))) + "px";
            };
        };
    }


    // [ROUTE-01] URL 智慧嗅探與零點擊自動路由
    function applyAutoRoute() {
        const pathname = window.location.pathname;
        if (pathname.includes('/watchlist') || pathname.includes('/market')) return;


        const stockMatch = pathname.match(/\/stock\/([A-Za-z0-9]+)(?:[\/\?#]|$)/);
        const stockId = stockMatch ? stockMatch[1].toUpperCase() : "";
        if (!stockId) return;


        // 若使用者在同頁面手動點選 Profile 下拉選單，手動優先
        if (stockId === lastSniffedStockId && userManuallySelectedProfile) return;


        if (stockId !== lastSniffedStockId) {
            lastSniffedStockId = stockId;
            userManuallySelectedProfile = false;


            let targetCatId = 0;
            let targetProfId = safeInt(GM_getValue("cm_default_stock_prof", 4), 4);


            if (stockId.startsWith("00")) {
                targetCatId = 2; // ETF專區
                const defaultEtfProf = safeInt(GM_getValue("cm_default_etf_prof", 10), 10);


                if (stockId.endsWith('B') || stockId.endsWith('D') || stockId.endsWith('T')) {
                    targetProfId = 12; // 債券型 ETF 分析
                } else if (stockId.endsWith('A')) {
                    targetProfId = 13; // 主動式 / 產業 ETF
                } else {
                    const highDivList = GM_getValue("cm_etf_high_dividend_list", ["0056", "00878", "00919"]);
                    const marketCapList = GM_getValue("cm_etf_market_cap_list", ["0050", "006208", "009810"]);


                    if (Array.isArray(highDivList) && highDivList.includes(stockId)) {
                        targetProfId = 11; // 高股息 ETF 分析
                    } else if (Array.isArray(marketCapList) && marketCapList.includes(stockId)) {
                        targetProfId = 10; // 市值型 ETF 分析
                    } else {
                        targetProfId = defaultEtfProf;
                    }
                }
            } else {
                targetCatId = 0; // 存股
                targetProfId = safeInt(GM_getValue("cm_default_stock_prof", 4), 4);
            }


            const selCat = document.getElementById('cm-cat-select');
            if (selCat) {
                selCat.value = targetCatId;
                const cat = CATEGORIES.find(c => c.catId === targetCatId) || CATEGORIES[0];
                const selProf = document.getElementById('cm-profile-select');
                if (selProf) {
                    selProf.innerHTML = cat.profiles.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
                    const profExists = cat.profiles.find(p => p.id === targetProfId);
                    const activeProfId = profExists ? targetProfId : cat.profiles[0].id;
                    selProf.value = activeProfId;
                    
                    // 執行切換並同步遮罩
                    const checkboxes = document.querySelectorAll('.cm-module-cb');
                    const prof = cat.profiles.find(p => p.id === activeProfId) || cat.profiles[0];
                    checkboxes.forEach(cb => { cb.checked = (prof.modules || []).includes(cb.value); });
                    
                    const kcfg = prof.kline_cfg || { stock_type: "week", stock_limit: 60, market_type: "week", market_limit: 60 };
                    const sType = document.getElementById('cfg-prof-stock-ktype');
                    const sDays = document.getElementById('cfg-prof-stock-kdays');
                    const mType = document.getElementById('cfg-prof-market-ktype');
                    const mDays = document.getElementById('cfg-prof-market-kdays');


                    if (sType) sType.value = kcfg.stock_type || "week";
                    if (sDays) sDays.value = kcfg.stock_limit || 60;
                    if (mType) mType.value = kcfg.market_type || "week";
                    if (mDays) mDays.value = kcfg.market_limit || 60;


                    const accEtf = document.getElementById('acc-etf');
                    const accFinance = document.getElementById('acc-finance');
                    const stockOnlyLabels = document.querySelectorAll('.cm-stock-only-cb');


                    if (targetCatId === 2) {
                        if (accEtf) accEtf.style.display = 'block';
                        if (accFinance) accFinance.style.display = 'none';
                        stockOnlyLabels.forEach(el => el.style.display = 'none');
                    } else {
                        if (accEtf) accEtf.style.display = 'none';
                        if (accFinance) accFinance.style.display = 'block';
                        stockOnlyLabels.forEach(el => el.style.display = 'flex');
                    }


                    CONFIG.current_cat_id = cat.catId; 
                    CONFIG.current_profile_id = prof.id;
                    GM_setValue("cm_current_cat_id", cat.catId); 
                    GM_setValue("cm_current_profile_id", prof.id);
                }
            }
        }
    }


    function updateVisibility() {
        const modKey = getCurrentPageModule();
        const singleWrapper = document.getElementById('cm-single-wrapper');
        const singleBtn = document.getElementById('cm-btn-single-exec');
        const batchBtn = document.getElementById('cm-btn-batch-exec');
        const info = document.getElementById('cm-smart-info');


        applyAutoRoute();


        if (singleWrapper && singleBtn) {
            if (modKey) {
                singleWrapper.style.display = 'flex';
                singleBtn.innerText = `🎯 抓取單頁：${MODULE_REGISTRY[modKey].label}`;


                if (info && MODULE_REGISTRY[modKey].requiresExpand) {
                    const overrideInput = document.getElementById('cm-override-limit');
                    if (overrideInput && overrideInput.value && parseInt(overrideInput.value, 10) > 0) {
                        info.innerText = `(自訂覆蓋) 單頁將展開抓取：${getAutoLimit(modKey)} 筆`;
                        info.style.color = '#fcc111';
                    } else {
                        info.innerText = `單頁預計展開抓取：${getAutoLimit(modKey)} 筆`;
                        info.style.color = '#00ff00';
                    }
                } else if (info) {
                    info.innerText = "";
                }
            } else {
                singleWrapper.style.display = 'none';
                if (info) info.innerText = "";
            }
        }


        if (batchBtn && !GM_getValue("cm_batch_task")?.active) { batchBtn.disabled = (!location.pathname.includes('/stock/')); }


        if (isExpanded && window.location.href.includes('/stock/') && modKey !== "realtime" && modKey !== null) {
            document.body.classList.add('cm-liberator-active');
            document.querySelectorAll('thead').forEach(h => { if (h.style.transform !== 'none') { h.style.transform = 'none'; h.style.top = '0'; } });
        } else {
            document.body.classList.remove('cm-liberator-active');
        }
    }


    function setupHotkeySystem() {
        document.addEventListener('keydown', function(e) {
            const tag = e.target.tagName.toLowerCase();
            if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable) {
                return;
            }


            const matchHotkey = (hkString, ev) => {
                if (!hkString) return false;
                const s = hkString.toUpperCase();
                const requireCtrl = s.includes('^');
                const requireShift = s.includes('+');
                const requireAlt = s.includes('!');
                const targetKey = s.replace(/[\^\+\!]/g, '');


                return (ev.ctrlKey === requireCtrl) && (ev.shiftKey === requireShift) && (ev.altKey === requireAlt) && (!ev.metaKey) && (ev.key.toUpperCase() === targetKey);
            };


            if (matchHotkey(CONFIG.hotkey_single, e)) {
                e.preventDefault();
                const modKey = getCurrentPageModule();
                if (modKey) executeSinglePageScrape(modKey);
                else showToast("⚠️ 此頁面目前不支援單頁抓取");
            } else if (matchHotkey(CONFIG.hotkey_batch, e)) {
                e.preventDefault();
                const btn = document.getElementById('cm-btn-batch-exec');
                if(btn && !btn.disabled) btn.click();
            } else if (matchHotkey(CONFIG.hotkey_recopy, e)) {
                e.preventDefault();
                document.getElementById('cm-btn-recopy')?.click();
            }
        });
    }


    checkAndExecuteWorkerTask();
    injectStyles();
    createUI();
    setupHotkeySystem();


    let timer = null;
    const observer = new MutationObserver(() => { if (timer) clearTimeout(timer); timer = setTimeout(updateVisibility, 600); });
    observer.observe(document.body, { childList: true, subtree: true });
    
    setInterval(() => { 
        if (lastUrl !== location.href) { 
            lastUrl = location.href; 
            updateVisibility(); 
        } 
    }, 1000);
    setTimeout(updateVisibility, 1500);
}


if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMainApp);
} else {
    initMainApp();
}
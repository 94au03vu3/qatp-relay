// ==UserScript==
// @name         GitHub Gist 一鍵 QATP 工具
// @namespace    https://gist.github.com/
// @description  GitHub Gist 智能裝配、任務書提取、技術交接加檔與語意槽位防撞名自動化工具 (BN Pattern 雲端多態特徵加固版)
// @version      1.1.1
// @license      MIT
// @icon         https://www.google.com/s2/favicons?sz=64&domain=github.com
// @match        https://gist.github.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setClipboard
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_registerMenuCommand
// @grant        unsafeWindow
// @connect      docs.google.com
// @connect      googleusercontent.com
// @connect      api.github.com
// @description:zh-TW
// @downloadURL https://update.greasyfork.org/scripts/601102/GitHub%20Gist%20%E4%B8%80%E9%8D%B5%20QATP%20%E5%B7%A5%E5%85%B7.user.js
// @updateURL https://update.greasyfork.org/scripts/601102/GitHub%20Gist%20%E4%B8%80%E9%8D%B5%20QATP%20%E5%B7%A5%E5%85%B7.meta.js
// ==/UserScript==


(function () {
  'use strict';


  // ==========================================
  // 常數與設定宣告 (M01 / M04 / v1.1.1 Project Bridge-Drop)
  // ==========================================
  const SESSION_KEY_QATP = 'gas_pending_qatp';
  const SESSION_KEY_HANDOFF = 'gist_qatp_pending_handoff';
  const SESSION_KEY_SMART = 'gist_qatp_pending_smart';
  const SESSION_KEY_RELAY = 'gist_qatp_pending_relay';


  const STORAGE_POS_KEY = 'gist_qatp_toolbar_pos_v1';
  const STORAGE_BOARD_POS_KEY = 'gist_qatp_board_pos_v1';
  const STORAGE_ORB_KEY = 'gist_qatp_dock_orb_pos_v1';
  const STORAGE_CONFIG_KEY_V2 = 'gist_qatp_config_v2';
  const STORAGE_CONFIG_KEY_V1 = 'gist_qatp_config_v1';


  const VIEWPORT_MARGIN = 8;


  const DEFAULT_POSITION = {
    top: 72,
    right: 24
  };


  const DEFAULT_BOARD_POSITION = {
    top: 72,
    right: 320
  };


  const DEFAULT_ORB_POSITION = {
    side: 'left',
    topPercent: 40
  };


  // v1.1.1 預設設定物件 (Deep Fallback 基線)
  const DEFAULT_CONFIG_V2_1_1 = {
    layoutMode: 'single', // 'single' | 'double' | 'horizontal'
    orbSide: 'left',      // 'left' | 'right'
    showFileBoard: true,
    fileBoardMaxWidth: 380,
    buttonFontSize: 15,
    buttonVisibility: {
      smart: true,
      handoff: true,
      saveCopy: true,
      relayClaude: true,
      extractOnly: true
    },
    codeNamingMode: 'infer_code', // 'infer_code' | 'infer_name' | 'custom'
    customCodeFileName: 'code',
    qatpFileName: 'QATP.md',
    defaultFileName: 'note',
    autoNewGistOnFinished: true,
    autoSubmitDualReady: true,
    enableMiddleClick: true,
    smartAssemblyHotkey: 'F4',
    codeRegex: '/(?:==UserScript==|#Requires\\s+AutoHotkey|__version__|def\\s+|import\\s+)/i',
    qatpPrimaryToken: 'QATP',
    qatpSecondaryPattern: '/(?:QA\\s*獨立覆核任務|QA\\s*測試驗證任務書|QATP\\s*驗收任務書|四大維度測試案例清單|人類實機操作核對專區)/i',
    qatpRegex: '/(?:QA\\s*獨立覆核任務|QA\\s*測試驗證任務書|##?\\s*【?貳[、\\s]+QA|QATP)/i', // 歷史保留相容
    filterRegex: '/(?:#[^\\S\\r\\n]*舊版內容對照清單|技術交接|反向驗證清單|歷史技術債客觀勘誤表|Bottom-Up Settlement|技術交接與維護規格書)/i',
    noteKeywords: [
      '舊版內容對照清單',
      '技術交接',
      '反向驗證清單',
      '歷史技術債客觀勘誤表',
      'Bottom-Up Settlement',
      '函式計數驗證痕跡',
      '技術交接與維護規格書',
      '交接文檔',
      '交接檔',
      '初版交接',
      '無歷史交接文檔'
    ],
    jsonSyncUrl: 'https://docs.google.com/document/d/1tUcuaMXKYGSzfxknXGPOq-cB8KxTOQBxBliUVT8Saf4/edit?usp=sharing',
    cloudEndpointPrimary: 'https://docs.google.com/spreadsheets/d/1GTZ0ZpDy9D39MHE-SikJhakCxYOlPUgEljrVJMzYe8c/export?format=csv&gid=0',
    cloudEndpointSecondary: 'https://docs.google.com/spreadsheets/d/1GTZ0ZpDy9D39MHE-SikJhakCxYOlPUgEljrVJMzYe8c/gviz/tq?tqx=out:csv&gid=0',
    cloudKeyword: 'repo & grep',


    // --- Project Bridge-Drop 欄位 ---
    relayRepoName: 'qatp-relay',
    relayRepoBranch: 'main',
    relaySlots: [
      { account: '', token: '' }, // 插槽 1
      { account: '', token: '' }, // 插槽 2
      { account: '', token: '' }  // 插槽 3
    ]
  };


  // 全域統一檔名合法性正則 (P3-02: OBS-A 純點號防禦加固)
  const safeFileRegex = /^(?!\.+$)[a-zA-Z0-9_\-\.]+$/;


  // ==========================================
  // 正則字串解析器 (支援 /pattern/flags 格式)
  // ==========================================
  function parseRegexPattern(patternStr) {
    if (!patternStr || typeof patternStr !== 'string') return null;
    const trimmed = patternStr.trim();
    const slashMatch = trimmed.match(/^\/(.*)\/([gimsuy]*)$/);
    try {
      if (slashMatch) {
        return new RegExp(slashMatch[1], slashMatch[2]);
      }
      return new RegExp(trimmed, 'i');
    } catch (e) {
      console.warn('[QATP] 正則表示式語法無效:', patternStr, e);
      return null;
    }
  }


  // ==========================================
  // 配置管理器模組 (Config Manager)
  // ==========================================
  function loadConfig() {
    let raw = null;
    try {
      raw = GM_getValue(STORAGE_CONFIG_KEY_V2, null);
      if (!raw) {
        raw = GM_getValue(STORAGE_CONFIG_KEY_V1, null);
      }
    } catch (e) {
      console.warn('[QATP] 無法讀取 GM 設定，使用基線設定', e);
    }


    if (!raw || typeof raw !== 'object') {
      return JSON.parse(JSON.stringify(DEFAULT_CONFIG_V2_1_1));
    }


    const config = JSON.parse(JSON.stringify(DEFAULT_CONFIG_V2_1_1));


    config.layoutMode = ['single', 'double', 'horizontal'].includes(raw.layoutMode) ? raw.layoutMode : DEFAULT_CONFIG_V2_1_1.layoutMode;
    config.orbSide = (raw.orbSide === 'left' || raw.orbSide === 'right') ? raw.orbSide : DEFAULT_CONFIG_V2_1_1.orbSide;
    config.showFileBoard = typeof raw.showFileBoard === 'boolean' ? raw.showFileBoard : DEFAULT_CONFIG_V2_1_1.showFileBoard;


    const boardW = Number(raw.fileBoardMaxWidth);
    config.fileBoardMaxWidth = (!isNaN(boardW) && boardW >= 240 && boardW <= 600) ? boardW : DEFAULT_CONFIG_V2_1_1.fileBoardMaxWidth;


    const fs = Number(raw.buttonFontSize);
    config.buttonFontSize = (!isNaN(fs) && fs >= 12 && fs <= 20) ? fs : DEFAULT_CONFIG_V2_1_1.buttonFontSize;


    // 按鈕顯隱配置
    if (raw.buttonVisibility && typeof raw.buttonVisibility === 'object') {
      config.buttonVisibility.smart = typeof raw.buttonVisibility.smart === 'boolean' ? raw.buttonVisibility.smart : DEFAULT_CONFIG_V2_1_1.buttonVisibility.smart;
      config.buttonVisibility.handoff = typeof raw.buttonVisibility.handoff === 'boolean' ? raw.buttonVisibility.handoff : DEFAULT_CONFIG_V2_1_1.buttonVisibility.handoff;
      config.buttonVisibility.saveCopy = typeof raw.buttonVisibility.saveCopy === 'boolean' ? raw.buttonVisibility.saveCopy : DEFAULT_CONFIG_V2_1_1.buttonVisibility.saveCopy;
      config.buttonVisibility.relayClaude = typeof raw.buttonVisibility.relayClaude === 'boolean' ? raw.buttonVisibility.relayClaude : DEFAULT_CONFIG_V2_1_1.buttonVisibility.relayClaude;
      config.buttonVisibility.extractOnly = typeof raw.buttonVisibility.extractOnly === 'boolean' ? raw.buttonVisibility.extractOnly : DEFAULT_CONFIG_V2_1_1.buttonVisibility.extractOnly;
    }


    config.codeNamingMode = ['infer_code', 'infer_name', 'custom'].includes(raw.codeNamingMode) ? raw.codeNamingMode : DEFAULT_CONFIG_V2_1_1.codeNamingMode;


    if (typeof raw.customCodeFileName === 'string' && safeFileRegex.test(raw.customCodeFileName.trim())) {
      config.customCodeFileName = raw.customCodeFileName.trim();
    }
    if (typeof raw.qatpFileName === 'string' && safeFileRegex.test(raw.qatpFileName.trim())) {
      config.qatpFileName = raw.qatpFileName.trim();
    }
    if (typeof raw.defaultFileName === 'string' && safeFileRegex.test(raw.defaultFileName.trim())) {
      config.defaultFileName = raw.defaultFileName.trim();
    }


    config.autoNewGistOnFinished = typeof raw.autoNewGistOnFinished === 'boolean' ? raw.autoNewGistOnFinished : DEFAULT_CONFIG_V2_1_1.autoNewGistOnFinished;
    config.autoSubmitDualReady = typeof raw.autoSubmitDualReady === 'boolean' ? raw.autoSubmitDualReady : DEFAULT_CONFIG_V2_1_1.autoSubmitDualReady;


    config.enableMiddleClick = typeof raw.enableMiddleClick === 'boolean' ? raw.enableMiddleClick : DEFAULT_CONFIG_V2_1_1.enableMiddleClick;
    if (typeof raw.smartAssemblyHotkey === 'string' && raw.smartAssemblyHotkey.trim()) {
      config.smartAssemblyHotkey = raw.smartAssemblyHotkey.trim();
    } else {
      config.smartAssemblyHotkey = DEFAULT_CONFIG_V2_1_1.smartAssemblyHotkey;
    }


    config.codeRegex = typeof raw.codeRegex === 'string' && raw.codeRegex.trim() ? raw.codeRegex.trim() : DEFAULT_CONFIG_V2_1_1.codeRegex;
    config.qatpPrimaryToken = typeof raw.qatpPrimaryToken === 'string' && raw.qatpPrimaryToken.trim() ? raw.qatpPrimaryToken.trim() : DEFAULT_CONFIG_V2_1_1.qatpPrimaryToken;
    config.qatpSecondaryPattern = typeof raw.qatpSecondaryPattern === 'string' && raw.qatpSecondaryPattern.trim() ? raw.qatpSecondaryPattern.trim() : DEFAULT_CONFIG_V2_1_1.qatpSecondaryPattern;
    config.qatpRegex = typeof raw.qatpRegex === 'string' && raw.qatpRegex.trim() ? raw.qatpRegex.trim() : DEFAULT_CONFIG_V2_1_1.qatpRegex;
    config.filterRegex = typeof raw.filterRegex === 'string' && raw.filterRegex.trim() ? raw.filterRegex.trim() : DEFAULT_CONFIG_V2_1_1.filterRegex;


    if (Array.isArray(raw.noteKeywords) && raw.noteKeywords.length > 0) {
      config.noteKeywords = raw.noteKeywords.map((k) => String(k).trim()).filter(Boolean);
    }
    if (typeof raw.jsonSyncUrl === 'string' && /^https?:\/\//i.test(raw.jsonSyncUrl.trim())) {
      config.jsonSyncUrl = raw.jsonSyncUrl.trim();
    }


    if (typeof raw.cloudEndpointPrimary === 'string' && /^https?:\/\//i.test(raw.cloudEndpointPrimary.trim())) {
      config.cloudEndpointPrimary = raw.cloudEndpointPrimary.trim();
    }
    if (typeof raw.cloudEndpointSecondary === 'string' && /^https?:\/\//i.test(raw.cloudEndpointSecondary.trim())) {
      config.cloudEndpointSecondary = raw.cloudEndpointSecondary.trim();
    }
    if (typeof raw.cloudKeyword === 'string' && raw.cloudKeyword.trim()) {
      config.cloudKeyword = raw.cloudKeyword.trim();
    }


    // Bridge-Drop 欄位回退防護 (P3-05: 分支名稱合法字元守衛)
    if (typeof raw.relayRepoName === 'string' && safeFileRegex.test(raw.relayRepoName.trim())) {
      config.relayRepoName = raw.relayRepoName.trim();
    }
    if (typeof raw.relayRepoBranch === 'string' && /^[a-zA-Z0-9_\-\.\/]+$/.test(raw.relayRepoBranch.trim())) {
      config.relayRepoBranch = raw.relayRepoBranch.trim();
    }
    if (Array.isArray(raw.relaySlots)) {
      config.relaySlots = [0, 1, 2].map((idx) => {
        const item = raw.relaySlots[idx] || {};
        return {
          account: typeof item.account === 'string' ? item.account.trim() : '',
          token: typeof item.token === 'string' ? item.token.trim() : ''
        };
      });
    }


    return config;
  }


  function saveConfig(newConfig) {
    try {
      GM_setValue(STORAGE_CONFIG_KEY_V2, newConfig);
      return true;
    } catch (e) {
      console.error('[QATP] 保存配置失敗', e);
      return false;
    }
  }


  // ==========================================
  // 樣式動態注入模組 (BN Pattern / 雙實體拓撲 / 頁籤 Modal / 聚光燈契約)
  // ==========================================
  function injectStyles() {
    let styleEl = document.getElementById('gist-qatp-injected-style');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'gist-qatp-injected-style';
      document.head.appendChild(styleEl);
    }


    const config = loadConfig();
    const fs = config.buttonFontSize || 15;
    const lh = fs + 6;
    const maxBW = config.fileBoardMaxWidth || 380;


    styleEl.textContent = `
      /* 實體 A：操作工具列 */
      #gist-qatp-toolbar {
        position: fixed;
        z-index: 99999;
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding: 6px 8px;
        width: fit-content;
        background: rgba(22, 27, 34, 0.94);
        border: 1px solid rgba(240, 246, 252, 0.18);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        border-radius: 8px;
        box-shadow: 0 6px 20px rgba(0, 0, 0, 0.45);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
        user-select: none;
        cursor: grab;
        box-sizing: border-box;
        pointer-events: auto;
      }
      #gist-qatp-toolbar:active {
        cursor: grabbing;
      }
      .gist-qatp-topbar {
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding-bottom: 4px;
        border-bottom: 1px solid rgba(240, 246, 252, 0.1);
      }
      .gist-qatp-topbar-row1 {
        display: flex;
        align-items: center;
        justify-content: space-between;
        width: 100%;
        gap: 8px;
      }
      .gist-qatp-topbar-row2 {
        display: flex;
        align-items: center;
        gap: 4px;
        width: 100%;
      }
      .gist-qatp-title-brand {
        font-size: ${fs}px;
        line-height: ${lh}px;
        font-weight: 600;
        color: #8b949e;
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .gist-qatp-pill-label {
        flex: 1;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 3px;
        cursor: pointer;
        user-select: none;
        padding: 2px 4px;
        border-radius: 4px;
        border: 1px solid rgba(240, 246, 252, 0.15);
        background: rgba(13, 17, 23, 0.6);
        transition: background-color 0.15s, border-color 0.15s;
        box-sizing: border-box;
      }
      .gist-qatp-pill-label:hover {
        background: rgba(33, 38, 45, 0.9);
        border-color: #58a6ff;
      }
      .gist-qatp-pill-cb {
        cursor: pointer;
        margin: 0;
        width: 13px;
        height: 13px;
        flex-shrink: 0;
      }
      .gist-qatp-pill-cb.cb-green {
        accent-color: #238636;
      }
      .gist-qatp-pill-cb.cb-blue {
        accent-color: #1f6feb;
      }
      .gist-qatp-pill-text {
        font-size: 11px;
        font-weight: 600;
        color: #8b949e;
        line-height: 1;
        white-space: nowrap;
      }
      .gist-qatp-btn-gear {
        background: transparent;
        border: none;
        color: #8b949e;
        cursor: pointer;
        padding: 2px 4px;
        font-size: ${fs}px;
        line-height: 1;
        border-radius: 4px;
        transition: color 0.15s, background-color 0.15s;
        display: flex;
        align-items: center;
        justify-content: center;
        pointer-events: auto;
      }
      .gist-qatp-btn-gear:hover {
        color: #f0f6fc;
        background-color: #30363d;
      }

      /* 佈局容器 */
      .gist-qatp-button-container {
        display: flex;
        gap: 6px;
      }
      .gist-qatp-layout-single {
        flex-direction: column;
        width: 100%;
      }
      .gist-qatp-layout-single .gist-qatp-btn {
        width: 100%;
        justify-content: flex-start;
      }
      .gist-qatp-layout-double {
        display: grid;
        grid-template-columns: 1fr 1fr;
        width: 100%;
      }
      .gist-qatp-layout-double .gist-qatp-btn {
        width: 100%;
      }
      .gist-qatp-layout-horizontal {
        flex-direction: row;
        align-items: center;
      }

      .gist-qatp-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: ${fs}px;
        font-weight: 600;
        line-height: ${lh}px;
        padding: 6px 12px;
        border-radius: 6px;
        cursor: pointer;
        user-select: none;
        transition: background-color 0.2s cubic-bezier(0.3, 0, 0.5, 1), border-color 0.2s cubic-bezier(0.3, 0, 0.5, 1);
        text-decoration: none;
        box-sizing: border-box;
        white-space: nowrap;
        pointer-events: auto;
        flex-shrink: 0;
      }
      .gist-qatp-btn-smart {
        background-color: #238636;
        color: #ffffff;
        border: 1px solid rgba(240, 246, 252, 0.1);
      }
      .gist-qatp-btn-smart:hover {
        background-color: #2ea043;
      }
      .gist-qatp-btn-warm {
        background-color: #b08800;
        color: #ffffff;
        border: 1px solid rgba(240, 246, 252, 0.1);
      }
      .gist-qatp-btn-warm:hover {
        background-color: #c69026;
      }
      .gist-qatp-btn-primary {
        background-color: #0969da;
        color: #ffffff;
        border: 1px solid rgba(255, 255, 255, 0.1);
      }
      .gist-qatp-btn-primary:hover {
        background-color: #0858b9;
      }
      .gist-qatp-btn-emerald {
        background-color: #0f766e;
        color: #ffffff;
        border: 1px solid rgba(45, 212, 191, 0.3);
      }
      .gist-qatp-btn-emerald:hover {
        background-color: #115e59;
      }
      .gist-qatp-btn-secondary {
        background-color: #21262d;
        color: #c9d1d9;
        border: 1px solid rgba(240, 246, 252, 0.1);
      }
      .gist-qatp-btn-secondary:hover {
        background-color: #30363d;
        color: #f0f6fc;
      }

      /* 實體 B：檔案狀態看板 */
      #gist-qatp-file-board {
        position: fixed;
        z-index: 99998;
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding: 8px 10px;
        min-width: 220px;
        max-width: ${maxBW}px;
        width: fit-content;
        background: rgba(22, 27, 34, 0.94);
        border: 1px solid rgba(240, 246, 252, 0.18);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        border-radius: 8px;
        box-shadow: 0 6px 20px rgba(0, 0, 0, 0.45);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
        user-select: none;
        cursor: grab;
        box-sizing: border-box;
        pointer-events: auto;
      }
      #gist-qatp-file-board:active {
        cursor: grabbing;
      }
      .gist-qatp-board-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding-bottom: 4px;
        border-bottom: 1px solid rgba(240, 246, 252, 0.1);
        font-size: ${fs}px;
        line-height: ${lh}px;
        font-weight: 600;
        color: #8b949e;
      }
      .gist-qatp-board-copy,
      .gist-qatp-board-close {
        background: transparent;
        border: none;
        color: #8b949e;
        cursor: pointer;
        padding: 0 4px;
        font-size: ${fs}px;
        line-height: 1;
        border-radius: 4px;
        transition: color 0.15s, background-color 0.15s;
        flex-shrink: 0;
        box-sizing: border-box;
      }
      .gist-qatp-board-copy {
        margin-left: auto;
        margin-right: 2px;
      }
      .gist-qatp-board-copy:hover {
        color: #58a6ff;
        background-color: #30363d;
      }
      .gist-qatp-board-close:hover {
        color: #f0f6fc;
        background-color: #30363d;
      }
      .gist-qatp-board-list {
        display: flex;
        flex-direction: column;
        gap: 4px;
        margin: 0;
        padding: 0;
        list-style: none;
      }
      .gist-qatp-board-item {
        font-size: ${fs}px;
        line-height: ${lh}px;
        color: #c9d1d9;
        word-break: break-all;
        white-space: normal;
        display: flex;
        align-items: flex-start;
        gap: 6px;
      }
      .gist-qatp-board-bullet {
        color: #58a6ff;
        flex-shrink: 0;
      }
      .gist-qatp-board-link {
        color: #58a6ff;
        text-decoration: none;
        cursor: pointer;
        word-break: break-all;
        transition: color 0.15s, text-decoration 0.15s;
      }
      .gist-qatp-board-link:hover {
        color: #79c0ff;
        text-decoration: underline;
      }

      /* 聚光燈閃爍動畫契約 */
      .gist-qatp-spotlight {
        box-shadow: 0 0 0 4px #58a6ff !important;
        transition: box-shadow 0.3s ease !important;
      }

      /* Toast 反饋提示 */
      .gist-qatp-toast {
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 100000;
        padding: 10px 16px;
        border-radius: 6px;
        font-size: 13px;
        font-weight: 600;
        color: #ffffff;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
        opacity: 0;
        transform: translateY(12px);
        transition: opacity 300ms ease, transform 300ms ease;
        pointer-events: none;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
        white-space: pre-wrap;
        max-width: 480px;
      }
      .gist-qatp-toast.show {
        opacity: 1;
        transform: translateY(0);
      }
      .gist-qatp-toast.success { background-color: #2da44e; }
      .gist-qatp-toast.danger { background-color: #cf222e; }
      .gist-qatp-toast.warning { background-color: #a07500; color: #ffffff; }
      .gist-qatp-toast.info { background-color: #1f6feb; }

      /* 側邊吸附手柄 */
      #gist-qatp-dock-orb {
        position: fixed;
        z-index: 99998;
        width: 32px;
        height: 38px;
        background: rgba(22, 27, 34, 0.88);
        border: 1px solid rgba(240, 246, 252, 0.2);
        backdrop-filter: blur(4px);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.35);
        transition: background-color 0.2s;
        user-select: none;
        pointer-events: auto;
      }
      #gist-qatp-dock-orb:hover {
        background: rgba(33, 38, 45, 0.95);
      }
      .gist-qatp-dock-left {
        left: 0;
        right: auto !important;
        border-radius: 0 8px 8px 0;
        border-left: none;
      }
      .gist-qatp-dock-right {
        right: 0;
        left: auto !important;
        border-radius: 8px 0 0 8px;
        border-right: none;
      }
      .gist-qatp-dock-icon {
        font-size: 16px;
      }

      /* 頁籤化 Safe DOM 設定面板 */
      #gist-qatp-config-modal-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.65);
        z-index: 100001;
        display: flex;
        justify-content: center;
        align-items: flex-start;
        padding-top: 40px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
        pointer-events: auto;
      }
      #gist-qatp-config-modal {
        background: #161b22;
        border: 1px solid #30363d;
        border-radius: 8px;
        width: 660px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
        color: #c9d1d9;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      .gist-qatp-modal-header {
        padding: 12px 16px;
        border-bottom: 1px solid #30363d;
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 14px;
        font-weight: 600;
        color: #f0f6fc;
      }
      .gist-qatp-modal-main {
        display: flex;
        flex: 1;
        min-height: 440px;
        max-height: 80vh;
      }
      .gist-qatp-modal-sidebar {
        width: 140px;
        background: #0d1117;
        border-right: 1px solid #30363d;
        display: flex;
        flex-direction: column;
        padding: 8px 0;
        gap: 2px;
        flex-shrink: 0;
      }
      .gist-qatp-tab-btn {
        background: transparent;
        border: none;
        color: #8b949e;
        padding: 10px 14px;
        text-align: left;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition: background-color 0.15s, color 0.15s;
        border-left: 2px solid transparent;
      }
      .gist-qatp-tab-btn:hover {
        background: #161b22;
        color: #c9d1d9;
      }
      .gist-qatp-tab-btn.active {
        background: #21262d;
        color: #58a6ff;
        border-left: 2px solid #1f6feb;
      }
      .gist-qatp-modal-content {
        padding: 16px;
        flex: 1;
        overflow-y: auto;
      }
      .gist-qatp-tab-pane {
        display: none;
      }
      .gist-qatp-tab-pane.active {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .gist-qatp-field-row {
        display: flex;
        flex-direction: column;
        gap: 5px;
      }
      .gist-qatp-field-header-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }
      .gist-qatp-field-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
      }
      .gist-qatp-field-checkbox {
        display: flex;
        align-items: center;
        gap: 8px;
        cursor: pointer;
      }
      .gist-qatp-field-label {
        font-weight: 500;
        color: #8b949e;
        font-size: 12px;
      }
      .gist-qatp-link-btn {
        font-size: 12px;
        color: #58a6ff;
        text-decoration: none;
        display: inline-flex;
        align-items: center;
        gap: 3px;
        transition: color 0.15s;
      }
      .gist-qatp-link-btn:hover {
        color: #79c0ff;
        text-decoration: underline;
      }
      .gist-qatp-field-hint {
        color: #8b949e;
        font-size: 11px;
        line-height: 1.4;
      }
      .gist-qatp-input, .gist-qatp-select, .gist-qatp-textarea {
        background-color: #0d1117;
        border: 1px solid #30363d;
        color: #c9d1d9;
        padding: 6px 10px;
        border-radius: 6px;
        font-size: 13px;
        outline: none;
      }
      .gist-qatp-textarea {
        resize: vertical;
        font-family: inherit;
        line-height: 1.4;
      }
      .gist-qatp-input:focus, .gist-qatp-select:focus, .gist-qatp-textarea:focus {
        border-color: #58a6ff;
      }
      .gist-qatp-action-row {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-top: 4px;
        flex-wrap: wrap;
      }
      .gist-qatp-modal-footer {
        padding: 12px 16px;
        border-top: 1px solid #30363d;
        display: flex;
        justify-content: space-between;
        background: #0d1117;
      }

      /* 插槽卡片樣式 (Slot Card) */
      .gist-qatp-slot-card {
        background: #0d1117;
        border: 1px solid #30363d;
        border-radius: 6px;
        padding: 10px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .gist-qatp-slot-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 12px;
        font-weight: 600;
        color: #8b949e;
      }
      .gist-qatp-slot-inputs {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .gist-qatp-input-group {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .gist-qatp-input-group .gist-qatp-input {
        flex: 1;
      }
      .gist-qatp-icon-btn {
        background: #21262d;
        border: 1px solid #30363d;
        color: #c9d1d9;
        border-radius: 6px;
        padding: 5px 8px;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 12px;
        transition: background-color 0.15s, color 0.15s;
        flex-shrink: 0;
      }
      .gist-qatp-icon-btn:hover {
        background: #30363d;
        color: #f0f6fc;
      }
    `;
  }


  // ==========================================
  // Toast 反饋模組
  // ==========================================
  function showToast(message, type = 'success', duration = 3000) {
    let toast = document.getElementById('gist-qatp-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'gist-qatp-toast';
      toast.className = 'gist-qatp-toast';
      document.body.appendChild(toast);
    }


    toast.className = `gist-qatp-toast ${type}`;
    toast.textContent = message;


    void toast.offsetWidth;
    toast.classList.add('show');


    if (toast._timer) clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
      toast.classList.remove('show');
    }, duration);
  }


  // ==========================================
  // 網址正規化與帳號動態解析演算法 (加固編輯環境探針)
  // ==========================================
  function getCanonicalGistUrl() {
    const rawHref = window.location.href;
    const cleanUrl = rawHref.split('#')[0].split('?')[0];
    const targetGistUrl = cleanUrl.replace(/\/edit\/?$/, '');


    const gistRegex = /^https:\/\/gist\.github\.com\/[^\/\s]+\/[a-f0-9]+$/;
    if (!gistRegex.test(targetGistUrl)) {
      throw new Error('當前非有效 Gist 永久檢視頁面，無法提取網址');
    }


    return targetGistUrl;
  }


  function extractGistOwner() {
    const path = window.location.pathname;
    const parts = path.split('/').filter(Boolean);
    const reservedWords = ['forked', 'stars', 'discover', 'mine'];
    if (parts.length >= 1 && !reservedWords.includes(parts[0].toLowerCase())) {
      return parts[0];
    }
    return '';
  }


  function isEditPage() {
    const cleanUrl = window.location.href.split('#')[0].split('?')[0];
    return /\/edit\/?$/.test(cleanUrl);
  }


  function isNewPage() {
    const path = window.location.pathname;
    return path === '/' || path === '' || path === '/forked';
  }


  function isEditorEnvironment() {
    // 嚴格判定：依 URL 路由或頁面內存在實體可編輯之輸入元件，杜絕檢視態 .file.js-gist-file 干擾
    return isEditPage() || isNewPage() || !!document.querySelector('input.js-gist-filename, textarea.file-editor-textarea');
  }


  // ==========================================
  // 動態檔案枚舉模組
  // ==========================================
  function inspectGistFiles() {
    const isEdit = isEditorEnvironment();
    let filenames = [];


    if (isEdit) {
      const inputs = document.querySelectorAll('input.js-gist-filename, input.form-control.js-gist-filename');
      inputs.forEach((input) => {
        const val = input.value.trim();
        if (val) filenames.push(val);
      });
    } else {
      const nodes = document.querySelectorAll('.gist-blob-name, strong.gist-blob-name, .file-header .Link--primary');
      const set = new Set();
      nodes.forEach((node) => {
        const text = node.textContent.trim();
        if (text && !set.has(text)) {
          set.add(text);
          filenames.push(text);
        }
      });
    }


    return filenames;
  }


  // ==========================================
  // 看板平滑導航與聚光燈定位 (ITEM-01)
  // ==========================================
  function navigateToFileCard(targetName) {
    if (!targetName) return;
    const cleanTarget = targetName.trim();
    let targetEl = null;


    if (isEditorEnvironment()) {
      const fileContainers = document.querySelectorAll('.js-gist-file');
      for (const container of fileContainers) {
        const input = container.querySelector('input.js-gist-filename, input.form-control.js-gist-filename');
        if (input && input.value.trim() === cleanTarget) {
          targetEl = container;
          break;
        }
      }
    } else {
      const sanitized = cleanTarget.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
      const directIdEl = document.getElementById(`file-${sanitized}`);
      if (directIdEl) {
        targetEl = directIdEl;
      } else {
        const fileContainers = document.querySelectorAll('.file.js-gist-file, div[id^="file-"]');
        for (const container of fileContainers) {
          const nameEl = container.querySelector('.gist-blob-name, strong.gist-blob-name, .file-header .Link--primary');
          if (nameEl && nameEl.textContent.trim() === cleanTarget) {
            targetEl = container;
            break;
          }
        }
      }
    }


    if (targetEl) {
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      targetEl.classList.add('gist-qatp-spotlight');
      setTimeout(() => {
        targetEl.classList.remove('gist-qatp-spotlight');
      }, 1500);
    } else {
      showToast('未在當前頁面找到對應檔案卡片', 'warning');
    }
  }


  // ==========================================
  // 結案偵測演算法 (M04)
  // ==========================================
  function isGistArchived() {
    const files = inspectGistFiles();
    const config = loadConfig();
    const defaultName = (config.defaultFileName || 'note').toLowerCase();


    for (const name of files) {
      const lower = name.toLowerCase();
      if (lower === defaultName || lower === `${defaultName}.md` || lower.startsWith(`${defaultName}.`)) {
        return true;
      }
    }


    if (isEditorEnvironment()) {
      const handoffRegex = parseRegexPattern(config.filterRegex) || /(?:#[^\S\r\n]*舊版內容對照清單|技術交接|反向驗證清單|歷史技術債客觀勘誤表|Bottom-Up Settlement|技術交接與維護規格書)/i;
      const fileContainers = document.querySelectorAll('.js-gist-file');
      for (const slot of fileContainers) {
        const content = getSlotContent(slot);
        if (content) {
          const topLines = content.split(/\r?\n/).slice(0, 15).join('\n');
          if (handoffRegex.test(topLines)) {
            return true;
          }
        }
      }
    }


    return false;
  }


  // ==========================================
  // 檔案狀態看板渲染與更新 (實體 B / ITEM-01 超連結與滑軌 / FEAT-01 一鍵複製)
  // ==========================================
  function updateFileBoard() {
    const config = loadConfig();
    let board = document.getElementById('gist-qatp-file-board');


    if (!config.showFileBoard) {
      if (board) board.remove();
      return;
    }


    const files = inspectGistFiles();


    if (!board) {
      board = document.createElement('div');
      board.id = 'gist-qatp-file-board';


      const header = document.createElement('div');
      header.className = 'gist-qatp-board-header';


      const title = document.createElement('span');
      title.id = 'gist-qatp-board-title';
      title.textContent = `📁 ${files.length} 個檔案`;


      // 一鍵複製檔案清單按鈕 (FEAT-01 / 妥協案 12)
      const copyBtn = document.createElement('button');
      copyBtn.id = 'gist-qatp-board-copy-btn';
      copyBtn.className = 'gist-qatp-board-copy';
      copyBtn.textContent = '📋';
      copyBtn.title = '一鍵複製所有檔案名稱清單';
      copyBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();


        const currentFiles = inspectGistFiles();
        if (currentFiles.length === 0) {
          showToast('⚠️ 看板尚無可複製的檔案', 'warning');
          return;
        }


        try {
          const textToCopy = currentFiles.join('\n');
          await writeToClipboard(textToCopy);
          copyBtn.textContent = '✅';
          showToast(`📋 已複製 ${currentFiles.length} 個檔名至剪貼簿！`, 'success');
          setTimeout(() => {
            copyBtn.textContent = '📋';
          }, 1200);
        } catch (err) {
          console.error('[QATP Copy Board Files Error]', err);
          showToast(err.message || '複製檔案清單失敗', 'danger');
        }
      });


      const closeBtn = document.createElement('button');
      closeBtn.className = 'gist-qatp-board-close';
      closeBtn.textContent = '✕';
      closeBtn.title = '關閉看板 (可至設定中重新啟用)';
      closeBtn.addEventListener('click', () => {
        board.remove();
      });


      header.appendChild(title);
      header.appendChild(copyBtn);
      header.appendChild(closeBtn);
      board.appendChild(header);


      const list = document.createElement('ul');
      list.id = 'gist-qatp-board-list';
      list.className = 'gist-qatp-board-list';
      board.appendChild(list);


      document.body.appendChild(board);


      let savedPos = null;
      try {
        savedPos = GM_getValue(STORAGE_BOARD_POS_KEY, null);
      } catch (e) {}


      applyBoardPosition(board, savedPos);
      bindBoardDrag(board);
    }


    const titleEl = document.getElementById('gist-qatp-board-title');
    if (titleEl) {
      titleEl.textContent = `📁 ${files.length} 個檔案`;
    }


    const listEl = document.getElementById('gist-qatp-board-list');
    if (listEl) {
      listEl.textContent = '';
      if (files.length === 0) {
        const emptyItem = document.createElement('li');
        emptyItem.className = 'gist-qatp-board-item';
        emptyItem.style.color = '#8b949e';
        emptyItem.textContent = '(尚無檔案)';
        listEl.appendChild(emptyItem);
      } else {
        files.forEach((name) => {
          const li = document.createElement('li');
          li.className = 'gist-qatp-board-item';


          const bullet = document.createElement('span');
          bullet.className = 'gist-qatp-board-bullet';
          bullet.textContent = '•';


          const link = document.createElement('a');
          link.className = 'gist-qatp-board-link';
          link.setAttribute('role', 'button');
          link.textContent = name;
          link.title = `點擊平滑導航至 ${name}`;
          link.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            navigateToFileCard(name);
          });


          li.appendChild(bullet);
          li.appendChild(link);
          listEl.appendChild(li);
        });
      }
    }
  }


  // ==========================================
  // RFC 4180 CSV 狀態機解析規格 (防迴歸 INV-01)
  // ==========================================
  function parseRFC4180CSV(csvText) {
    let inQuotes = false;
    let fieldBuffer = '';
    let rowBuffer = [];
    const grid = [];


    const len = csvText.length;
    for (let i = 0; i < len; i++) {
      const char = csvText[i];


      if (char === '"') {
        if (inQuotes && csvText[i + 1] === '"') {
          fieldBuffer += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        rowBuffer.push(fieldBuffer);
        fieldBuffer = '';
      } else if ((char === '\r' || char === '\n') && !inQuotes) {
        if (char === '\r' && csvText[i + 1] === '\n') {
          i++;
        }
        rowBuffer.push(fieldBuffer);
        grid.push(rowBuffer);
        fieldBuffer = '';
        rowBuffer = [];
      } else {
        fieldBuffer += char;
      }
    }


    if (fieldBuffer.length > 0 || rowBuffer.length > 0) {
      rowBuffer.push(fieldBuffer);
      grid.push(rowBuffer);
    }


    return grid;
  }


  // ==========================================
  // 雲端特權拉取模組 (防迴歸 INV-01)
  // ==========================================
  function requestSingleUrl(url) {
    return new Promise((resolve, reject) => {
      if (typeof GM_xmlhttpRequest === 'function') {
        GM_xmlhttpRequest({
          method: 'GET',
          url: url,
          headers: {
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
          },
          timeout: 15000,
          onload: (response) => {
            if (response.status >= 200 && response.status < 300) {
              resolve(response.responseText);
            } else {
              reject(new Error(`HTTP ${response.status}`));
            }
          },
          onerror: () => reject(new Error('Network Error / CSP Blocked')),
          ontimeout: () => reject(new Error('Request Timeout'))
        });
      } else {
        fetch(url, { cache: 'no-cache', credentials: 'omit' })
          .then((res) => {
            if (!res.ok) throw new Error(`Fetch HTTP ${res.status}`);
            return res.text();
          })
          .then(resolve)
          .catch(reject);
      }
    });
  }


  async function fetchCloudCSV() {
    const config = loadConfig();
    const endpoints = [config.cloudEndpointPrimary, config.cloudEndpointSecondary].filter(Boolean);


    let lastErr = null;
    for (const url of endpoints) {
      try {
        const text = await requestSingleUrl(url);
        if (text && text.trim().length > 0) {
          return text;
        }
      } catch (err) {
        console.warn(`[QATP] 端點連線失敗: ${url}`, err);
        lastErr = err;
      }
    }
    throw new Error(`無法拉取雲端試算表模板 (${lastErr ? lastErr.message : '所有通道皆失敗'})`);
  }


  // ==========================================
  // Google Docs 特徵 JSON 雲端同步演算法 (Safe DOM 防偽)
  // OBS-B: 主機白名單正則驗證與 ID 萃取
  // ==========================================
  function getGoogleDocRawUrl(url) {
    if (!url || typeof url !== 'string') return '';
    const match = url.match(/https:\/\/docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/i);
    if (match && match[1]) {
      return `https://docs.google.com/document/d/${match[1]}/export?format=txt`;
    }
    return '';
  }


  function getGoogleDocEditUrl(url) {
    if (!url || typeof url !== 'string') return '';
    const match = url.match(/https:\/\/docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/i);
    if (match && match[1]) {
      return `https://docs.google.com/document/d/${match[1]}/edit`;
    }
    return '';
  }


  function getGoogleSheetEditUrl(url) {
    if (!url || typeof url !== 'string') return '';
    const match = url.match(/https:\/\/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/i);
    if (match && match[1]) {
      const gidMatch = url.match(/[?&#]gid=([0-9]+)/i);
      const gid = gidMatch && gidMatch[1] ? `#gid=${gidMatch[1]}` : '';
      return `https://docs.google.com/spreadsheets/d/${match[1]}/edit${gid}`;
    }
    return '';
  }


  function isHtmlResponse(text) {
    if (!text || typeof text !== 'string') return false;
    const lower = text.trim().toLowerCase();
    return lower.startsWith('<!doctype html') || lower.startsWith('<html') || lower.includes('<head>') || lower.includes('accounts.google.com');
  }


  async function fetchCloudFeatureJSON(docUrl) {
    const rawUrl = getGoogleDocRawUrl(docUrl);
    if (!rawUrl) throw new Error('雲端 Docs 網址格式無效');


    const rawText = await requestSingleUrl(rawUrl);
    if (isHtmlResponse(rawText)) {
      throw new Error('Google Docs 回傳了 HTML 頁面，請確認文件公開共享權限已設為「知道連結的人皆可查看」');
    }


    // 文字淨化：去 BOM、標準引號與破折號還原
    let cleaned = rawText.replace(/^\uFEFF/, '').trim();
    cleaned = cleaned.replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'");
    cleaned = cleaned.replace(/[\u2013\u2014]/g, '-');


    // P3-12/13: 精準括號平衡邊界截取
    const startIdx = cleaned.indexOf('{');
    const endIdx = cleaned.lastIndexOf('}');
    if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
      throw new Error('未在雲端文件中檢索到有效的 JSON 根物件');
    }
    const targetJsonStr = cleaned.slice(startIdx, endIdx + 1);


    try {
      return JSON.parse(targetJsonStr);
    } catch (err) {
      throw new Error(`雲端特徵 JSON 解析失敗: ${err.message}`);
    }
  }


  async function syncFromDocJson(docUrl) {
    showToast('⏳ 正在從 Google Docs 同步特徵庫...', 'warning', 2000);
    const featureData = await fetchCloudFeatureJSON(docUrl);


    const config = loadConfig();


    // P3-09: 正則字串長度上限 500 防禦 ReDoS
    if (typeof featureData.qatpPrimaryToken === 'string' && featureData.qatpPrimaryToken.trim()) {
      config.qatpPrimaryToken = featureData.qatpPrimaryToken.trim();
    }
    if (typeof featureData.qatpSecondaryPattern === 'string' && featureData.qatpSecondaryPattern.trim() && featureData.qatpSecondaryPattern.trim().length <= 500) {
      config.qatpSecondaryPattern = featureData.qatpSecondaryPattern.trim();
    }
    if (typeof featureData.filterRegex === 'string' && featureData.filterRegex.trim() && featureData.filterRegex.trim().length <= 500) {
      config.filterRegex = featureData.filterRegex.trim();
    }
    if (typeof featureData.codeRegex === 'string' && featureData.codeRegex.trim() && featureData.codeRegex.trim().length <= 500) {
      config.codeRegex = featureData.codeRegex.trim();
    }
    if (Array.isArray(featureData.noteKeywords) && featureData.noteKeywords.length > 0) {
      config.noteKeywords = featureData.noteKeywords.map((k) => String(k).trim()).filter(Boolean);
    }


    config.jsonSyncUrl = docUrl.trim();


    saveConfig(config);
    showToast('🎉 特徵庫已成功從雲端同步並持久化保存！', 'success', 3000);
    return config;
  }


  // ==========================================
  // 提示詞組裝模組 (容錯拼接加固，保留後續文案)
  // ==========================================
  function assemblePrompt(grid, targetGistUrl) {
    const config = loadConfig();
    const targetKw = (config.cloudKeyword || 'repo & grep').trim().toLowerCase();
    let templateText = null;


    for (const row of grid) {
      if (row && row[0]) {
        const colHeader = row[0].trim().toLowerCase();
        if (colHeader === targetKw) {
          templateText = row[1] || '';
          break;
        }
      }
    }


    if (templateText === null) {
      // 容錯降級嘗試舊版關鍵字
      for (const row of grid) {
        if (row && row[0] && row[0].trim().toLowerCase() === 'gist & grep') {
          templateText = row[1] || '';
          break;
        }
      }
    }


    if (templateText === null) {
      throw new Error(`試算表中未定義 '${config.cloudKeyword}' 模板`);
    }


    let result = templateText
      .replace(/\[目標網址\]/g, targetGistUrl)
      .replace(/\{target_url\}/g, targetGistUrl)
      .replace(/\{target_gist_url\}/g, targetGistUrl);


    const targetPattern = /目標\s*Gist\s*網址\s*[:：]/i;
    const match = result.match(targetPattern);


    if (match) {
      const matchIndex = match.index;
      const matchLength = match[0].length;
      const beforeMatch = result.slice(0, matchIndex + matchLength);
      const afterMatch = result.slice(matchIndex + matchLength);


      if (!afterMatch.includes(targetGistUrl)) {
        result = `${beforeMatch}\n${targetGistUrl}\n${afterMatch.trimStart()}`;
      }
    } else {
      result = `${result.trimEnd()}\n\n目標 Gist 網址：\n${targetGistUrl}`;
    }


    return result;
  }


  // ==========================================
  // 特權剪貼簿模組 (讀與寫)
  // ==========================================
  async function writeToClipboard(text) {
    try {
      if (typeof GM_setClipboard === 'function') {
        GM_setClipboard(text, 'text');
        return true;
      }
    } catch (e) {
      console.warn('[QATP] GM_setClipboard 失敗，嘗試降級: ', e);
    }


    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (e) {
      console.warn('[QATP] navigator.clipboard 失敗，嘗試 textarea 降級: ', e);
    }


    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      textarea.style.top = '-9999px';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const success = document.execCommand('copy');
      document.body.removeChild(textarea);
      if (success) return true;
    } catch (e) {
      console.error('[QATP] 剪貼簿寫入受阻: ', e);
    }


    throw new Error('剪貼簿存取受阻，請手動複製');
  }


  async function readClipboardText() {
    if (!navigator.clipboard || !navigator.clipboard.readText) {
      throw new Error('瀏覽器環境不支援非同步剪貼簿讀取 API');
    }
    try {
      const text = await navigator.clipboard.readText();
      return text;
    } catch (err) {
      throw new Error(`無法讀取剪貼簿 (權限不足或非焦點狀態): ${err.message}`);
    }
  }


  // ==========================================
  // Code 首尾雙向錨定探針 (Head-Tail Invariants)
  // ==========================================
  function probeStrongCodeFeatures(unwrappedText) {
    if (!unwrappedText || typeof unwrappedText !== 'string') {
      return { isStrongCode: false, ext: '.txt', description: '' };
    }


    const lines = unwrappedText.split(/\r?\n/);
    const topTenLines = lines.slice(0, 10).join('\n');
    const tailTenLines = lines.slice(-10).join('\n');


    // 1. Userscript / JS 首尾雙向錨定
    const jsHeaderRegex = /^\/\/\s*==UserScript==/m;
    const jsTailRegex = /(?:\)\(\);\s*$|window\.[a-zA-Z0-9_$]+|export\s+default)/m;
    if (jsHeaderRegex.test(topTenLines) && jsTailRegex.test(tailTenLines)) {
      let desc = '';
      const descMatch = unwrappedText.match(/^\/\/\s*@name\s+([^\r\n]+)/m);
      if (descMatch && descMatch[1]) desc = descMatch[1].trim();
      return { isStrongCode: true, ext: '.user.js', description: desc };
    }


    // 2. Python 首尾雙向錨定
    const pyHeaderRegex = /(?:^#\s*-\*-\s*coding:|^#!\/usr\/bin\/env\s+python|^import\s+[a-zA-Z0-9_]+|^from\s+[a-zA-Z0-9_]+\s+import)/m;
    const pyTailRegex = /(?:if\s+__name__\s*==\s*['"]__main__['"]|root\..*?\(\)|sys\.exit\(|def\s+[a-zA-Z0-9_]+\()/m;
    if (pyHeaderRegex.test(topTenLines) && pyTailRegex.test(tailTenLines)) {
      let desc = '';
      const descMatch = unwrappedText.match(/^(?:#\s*([^\r\n]+)|"""([^\r\n]+)""")/m);
      if (descMatch) desc = (descMatch[1] || descMatch[2] || '').trim();
      return { isStrongCode: true, ext: '.py', description: desc };
    }


    // 3. AutoHotkey v2 首尾雙向錨定
    const ahkHeaderRegex = /(?:^#Requires\s+AutoHotkey|^;[^\r\n]*AHK\s*v2)/im;
    const ahkTailRegex = /(?:::|return|\})/m;
    if (ahkHeaderRegex.test(topTenLines) && ahkTailRegex.test(tailTenLines)) {
      let desc = '';
      const descMatch = unwrappedText.match(/^;\s*([^\r\n]+)/m);
      if (descMatch && descMatch[1]) desc = descMatch[1].trim();
      return { isStrongCode: true, ext: '.ahk', description: desc };
    }


    // 4. Shell / Bash 首尾雙向錨定
    const shHeaderRegex = /^#!\/bin\/(?:bash|sh)/m;
    if (shHeaderRegex.test(topTenLines)) {
      let desc = '';
      const descMatch = unwrappedText.match(/^#\s*([^\r\n]+)/m);
      if (descMatch && descMatch[1]) desc = descMatch[1].trim();
      return { isStrongCode: true, ext: '.sh', description: desc };
    }


    return { isStrongCode: false, ext: '.txt', description: '' };
  }


  // ==========================================
  // 多語言特徵探針與副檔名推斷 (弱特徵兜底)
  // ==========================================
  function probeLanguageAndMeta(unwrappedText) {
    const topTenLines = unwrappedText.split(/\r?\n/).slice(0, 10).join('\n');


    // 1. AutoHotkey v2 探針
    const ahkRegex = /(?:^#Requires\s+AutoHotkey\s+v2|;[^\r\n]*AHK\s*v2|SetTitleMatchMode\(?\s*2\s*\)?|#SingleInstance\s+force)/im;
    if (ahkRegex.test(topTenLines)) {
      let desc = '';
      const descMatch = unwrappedText.match(/^;\s*([^\r\n]+)/m);
      if (descMatch && descMatch[1]) desc = descMatch[1].trim();
      return { ext: '.ahk', description: desc, isCode: true };
    }


    // 2. Userscript / JavaScript 探針
    const jsHeaderRegex = /(?:^\/\/\s*==UserScript==|^\/\*![\s\S]*?\*\/|^\s*\(function\s*\()/m;
    if (jsHeaderRegex.test(topTenLines) || jsHeaderRegex.test(unwrappedText)) {
      const isUserscript = /==UserScript==/.test(topTenLines);
      let desc = '';
      const descMatch = unwrappedText.match(/^\/\/\s*@name\s+([^\r\n]+)/m);
      if (descMatch && descMatch[1]) desc = descMatch[1].trim();
      return { ext: isUserscript ? '.user.js' : '.js', description: desc, isCode: true };
    }


    // 3. Python 探針
    const pyRegex = /(?:^#\s*-\*-\s*coding:|^#!\/usr\/bin\/env\s+python|^import\s+[a-zA-Z0-9_]+|^from\s+[a-zA-Z0-9_]+\s+import|^\s*def\s+[a-zA-Z0-9_]+\s*\(|^\s*class\s+[a-zA-Z0-9_]+)/m;
    if (pyRegex.test(topTenLines) || pyRegex.test(unwrappedText)) {
      let desc = '';
      const descMatch = unwrappedText.match(/^(?:#\s*([^\r\n]+)|"""([^\r\n]+)""")/m);
      if (descMatch) desc = (descMatch[1] || descMatch[2] || '').trim();
      return { ext: '.py', description: desc, isCode: true };
    }


    // 4. Shell / Bash 探針
    const shRegex = /(?:^#!\/bin\/(?:bash|sh)|^\s*(?:set\s+-[eou]|export\s+[A-Z_]+=))/m;
    if (shRegex.test(topTenLines)) {
      let desc = '';
      const descMatch = unwrappedText.match(/^#\s*([^\r\n]+)/m);
      if (descMatch && descMatch[1]) desc = descMatch[1].trim();
      return { ext: '.sh', description: desc, isCode: true };
    }


    return { ext: '.txt', description: '', isCode: false };
  }


  // ==========================================
  // 三階剪貼簿多態智能辨識引擎 (INV-03 時序與門禁)
  // ==========================================
  function classifyClipboardText(rawText) {
    if (!rawText || typeof rawText !== 'string' || !rawText.trim()) {
      return { type: 'TYPE_UNKNOWN', content: '', meta: {} };
    }


    let text = rawText.trim();
    const config = loadConfig();


    // 0. Markdown 代碼區塊去殼
    const mdCodeBlockMatch = text.match(/^```(?:javascript|js|typescript|ts|python|py|json|html|css|ahk|autohotkey|sh|bash)?\r?\n([\s\S]+?)\r?\n```$/);
    let unwrappedText = text;
    if (mdCodeBlockMatch && mdCodeBlockMatch[1]) {
      unwrappedText = mdCodeBlockMatch[1].trim();
    }


    const lines = unwrappedText.split(/\r?\n/);
    const topThreeLines = lines.slice(0, 3).join('\n');
    const topFifteenLines = lines.slice(0, 15).join('\n');
    const topTwentyLines = lines.slice(0, 20).join('\n');
    const head500Chars = unwrappedText.slice(0, 500);


    const isStandaloneCodeHeader = /^(?:\/\/\s*==UserScript==|#Requires\s+AutoHotkey|coding:\s*utf-8|#!\/bin\/)/m.test(topThreeLines);


    // ========================================================
    // 【第 1 階：QATP 任務書精確門禁】(優先判定，防截胡)
    // ========================================================
    if (!isStandaloneCodeHeader) {
      const primaryToken = (config.qatpPrimaryToken || 'QATP').trim();
      const secondaryRegex = parseRegexPattern(config.qatpSecondaryPattern) || /(?:QA\\s*獨立覆核任務|QA\\s*測試驗證任務書|QATP\\s*驗收任務書|四大維度測試案例清單|人類實機操作核對專區)/i;


      const hasPrimary = topTwentyLines.includes(primaryToken);
      const hasSecondary = secondaryRegex.test(topTwentyLines);


      if (hasPrimary && hasSecondary) {
        return {
          type: 'TYPE_QATP',
          content: rawText,
          meta: { fileName: config.qatpFileName || 'QATP.md' }
        };
      }
    }


    // ========================================================
    // 【第 2 階：交接檔 (Handoff / note) 精確語意門禁】
    // ========================================================
    const noteKeywords = Array.isArray(config.noteKeywords) ? config.noteKeywords : DEFAULT_CONFIG_V2_1_1.noteKeywords;
    const filterRegex = parseRegexPattern(config.filterRegex) || /(?:#[^\S\r\n]*舊版內容對照清單|技術交接|反向驗證清單|歷史技術債客觀勘誤表|Bottom-Up Settlement|技術交接與維護規格書)/i;


    const hitHandoffKeyword = noteKeywords.some((kw) => topFifteenLines.includes(kw) || head500Chars.includes(kw)) || filterRegex.test(topFifteenLines) || filterRegex.test(head500Chars);


    if (!isStandaloneCodeHeader && hitHandoffKeyword) {
      return {
        type: 'TYPE_HANDOFF',
        content: rawText,
        meta: { fileName: config.defaultFileName || 'note' }
      };
    }


    // ========================================================
    // 【第 3 階：生產代碼 (Code) 首尾雙向錨定與 Markdown 表格排他門禁】
    // ========================================================
    const hasMdTable = /\|[ \t]*:?[-]+:?[ \t]*\|/.test(unwrappedText);
    const mdHeaderMatches = (topTwentyLines.match(/^#{1,3}[ \t]+[^\r\n]+/gm) || []).length;
    const isMarkdownDocument = hasMdTable && mdHeaderMatches >= 2;


    if (!isMarkdownDocument) {
      const strongCode = probeStrongCodeFeatures(unwrappedText);
      if (strongCode.isStrongCode) {
        let finalFileName = 'code' + strongCode.ext;
        if (config.codeNamingMode === 'custom') {
          finalFileName = config.customCodeFileName || 'code';
        } else if (config.codeNamingMode === 'infer_name') {
          if (strongCode.description) {
            const cleanName = strongCode.description.replace(/[\/\\:*?"<>|]/g, '').trim();
            finalFileName = cleanName ? `${cleanName}${strongCode.ext}` : ('code' + strongCode.ext);
          } else {
            finalFileName = 'code' + strongCode.ext;
          }
        }


        return {
          type: 'TYPE_CODE',
          content: unwrappedText,
          meta: {
            fileName: finalFileName,
            description: strongCode.description
          }
        };
      }


      // ========================================================
      // 【第 4 階：弱代碼特徵探針兜底】
      // ========================================================
      const probe = probeLanguageAndMeta(unwrappedText);
      const configCodeRegex = parseRegexPattern(config.codeRegex);
      const isCode = probe.isCode || !!mdCodeBlockMatch || (configCodeRegex && configCodeRegex.test(unwrappedText));


      if (isCode) {
        let finalFileName = 'code' + probe.ext;
        if (config.codeNamingMode === 'custom') {
          finalFileName = config.customCodeFileName || 'code';
        } else if (config.codeNamingMode === 'infer_name') {
          if (probe.description) {
            const cleanName = probe.description.replace(/[\/\\:*?"<>|]/g, '').trim();
            finalFileName = cleanName ? `${cleanName}${probe.ext}` : ('code' + probe.ext);
          } else {
            finalFileName = 'code' + probe.ext;
          }
        }


        return {
          type: 'TYPE_CODE',
          content: unwrappedText,
          meta: {
            fileName: finalFileName,
            description: probe.description
          }
        };
      }
    }


    // ========================================================
    // 【第 5 階：未知內容】
    // ========================================================
    return { type: 'TYPE_UNKNOWN', content: rawText, meta: {} };
  }


  // ==========================================
  // 空槽位自動垃圾桶清理協議 (ITEM-03 / purgeEmptySlots)
  // ==========================================
  function purgeEmptySlots() {
    const slots = document.querySelectorAll('.js-gist-file');
    if (slots.length <= 1) return;


    for (let i = slots.length - 1; i >= 0; i--) {
      const remainingSlots = document.querySelectorAll('.js-gist-file');
      if (remainingSlots.length <= 1) break;


      const slot = slots[i];
      const content = getSlotContent(slot);
      if (content.length === 0) {
        const removeBtn = slot.querySelector('button.js-remove-gist-file, .js-remove-gist-file');
        if (removeBtn) {
          removeBtn.click();
        }
      }
    }
  }


  // ==========================================
  // 表單保存觸發器強健定位邏輯 (INV-02 / 剪貼簿防污染協議 / 清理防禦)
  // ==========================================
  function triggerSaveAction(shouldCopyQatp = true) {
    if (shouldCopyQatp) {
      try {
        sessionStorage.setItem(SESSION_KEY_QATP, '1');
      } catch (e) {
        console.warn('[QATP] 無法寫入 sessionStorage', e);
      }
    } else {
      try {
        sessionStorage.removeItem(SESSION_KEY_QATP);
      } catch (e) {
        console.warn('[QATP] 無法清除 sessionStorage', e);
      }
    }


    purgeEmptySlots();


    const selectors = [
      'button.hx_create-pr-button.btn-primary',
      'button[type="submit"].btn-primary',
      '.form-actions button[type="submit"].btn-primary',
      'form.js-blob-form button[type="submit"]',
      'form[action^="/gists"] button[type="submit"]'
    ];


    setTimeout(() => {
      let retryCount = 0;
      const findAndSubmit = () => {
        let submitBtn = null;
        for (const sel of selectors) {
          const els = document.querySelectorAll(sel);
          for (const el of els) {
            if (el.offsetParent !== null && !el.classList.contains('Button--danger') && !el.disabled) {
              submitBtn = el;
              break;
            }
          }
          if (submitBtn) break;
        }


        if (submitBtn) {
          submitBtn.click();
        } else if (retryCount < 3) {
          retryCount++;
          setTimeout(findAndSubmit, 300);
        } else {
          showToast('⚠️ 未能自動定位儲存按鈕，請手動點擊儲存', 'warning');
        }
      };


      findAndSubmit();
    }, 100);
  }


  // ==========================================
  // 核心水合函式：注入內容至單一檔案槽 (INV-02 / 超時 5000ms / 等冪檢查)
  // ==========================================
  async function hydrateSlot(slotContainer, fileName, content) {
    if (!slotContainer) throw new Error('槽位容器無效');


    // 1. 設定檔名
    if (fileName) {
      const nameInput = slotContainer.querySelector('input.js-gist-filename, input.form-control.js-gist-filename');
      if (nameInput) {
        nameInput.value = fileName;
        nameInput.dispatchEvent(new Event('input', { bubbles: true }));
        nameInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }


    // 2. 等冪檢查：若內容已完全相同則直接跳過寫入
    const currentContent = getSlotContent(slotContainer);
    if (currentContent === content.trim()) {
      return { modified: false };
    }


    // 3. 注入內容 (CodeMirror / Textarea 雙軌階梯輪詢，加固至 5000ms)
    let injected = false;
    const startTime = Date.now();
    while (Date.now() - startTime < 5000) {
      const cmEl = slotContainer.querySelector('.CodeMirror');
      let cmInstance = cmEl ? (cmEl.CodeMirror || (typeof unsafeWindow !== 'undefined' && unsafeWindow.CodeMirror)) : null;


      if (cmInstance && typeof cmInstance.setValue === 'function') {
        cmInstance.setValue(content);
        if (typeof cmInstance.refresh === 'function') cmInstance.refresh();
        injected = true;
        break;
      }


      const ta = slotContainer.querySelector('textarea.file-editor-textarea, textarea');
      if (ta) {
        ta.value = content;
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        ta.dispatchEvent(new Event('change', { bubbles: true }));
        ta.dispatchEvent(new Event('blur', { bubbles: true }));
        injected = true;
        break;
      }


      await new Promise((r) => setTimeout(r, 100));
    }


    if (!injected) {
      throw new Error('❌ 未能探測到可用的 CodeMirror 或 Textarea 編輯實例');
    }


    return { modified: true };
  }


  function getSlotContent(slotContainer) {
    if (!slotContainer) return '';
    const cmEl = slotContainer.querySelector('.CodeMirror');
    let cmInstance = cmEl ? (cmEl.CodeMirror || (typeof unsafeWindow !== 'undefined' && unsafeWindow.CodeMirror)) : null;
    if (cmInstance && typeof cmInstance.getValue === 'function') {
      return cmInstance.getValue().trim();
    }
    const ta = slotContainer.querySelector('textarea.file-editor-textarea, textarea');
    if (ta) {
      return ta.value.trim();
    }
    return '';
  }


  async function addNewFileSlot(expectedCount) {
    const addBtn = document.querySelector('button.js-add-gist-file, .js-add-gist-file');
    if (!addBtn) throw new Error('❌ 水合逾時：無法定位加檔按鈕');


    addBtn.click();


    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const timer = setInterval(() => {
        const containers = document.querySelectorAll('.js-gist-file');
        if (containers.length >= expectedCount) {
          clearInterval(timer);
          resolve(containers[containers.length - 1]);
        } else if (Date.now() - startTime > 5000) {
          clearInterval(timer);
          reject(new Error('❌ 水合逾時：新檔案容器未能如期掛載'));
        }
      }, 100);
    });
  }


  // ==========================================
  // 空槽位智慧認領核心 (ITEM-03 / claimOrCreateSlot)
  // ==========================================
  async function claimOrCreateSlot(targetFileName) {
    const containers = document.querySelectorAll('.js-gist-file');
    for (const slot of containers) {
      const content = getSlotContent(slot);
      if (content.length === 0) {
        const nameInput = slot.querySelector('input.js-gist-filename, input.form-control.js-gist-filename');
        const currentName = nameInput ? nameInput.value.trim() : '';
        if (!currentName || currentName === targetFileName) {
          return slot;
        }
      }
    }
    return await addNewFileSlot(containers.length + 1);
  }


  // ==========================================
  // 語意槽位動態解析器 (OBS-04 對稱支援 note.*)
  // ==========================================
  async function resolveSemanticSlot(targetType, config) {
    const qatpName = (config.qatpFileName || 'QATP.md').trim().toLowerCase();
    const handoffName = (config.defaultFileName || 'note').trim().toLowerCase();


    let containers = Array.from(document.querySelectorAll('.js-gist-file'));


    // 1. 注入代碼槽 (TYPE_CODE)
    if (targetType === 'TYPE_CODE') {
      for (const slot of containers) {
        const nameInput = slot.querySelector('input.js-gist-filename, input.form-control.js-gist-filename');
        const name = nameInput ? nameInput.value.trim().toLowerCase() : '';
        if (name && name !== qatpName && name !== handoffName && !name.startsWith(handoffName + '.')) {
          return slot;
        }
      }
      for (const slot of containers) {
        const nameInput = slot.querySelector('input.js-gist-filename, input.form-control.js-gist-filename');
        const name = nameInput ? nameInput.value.trim() : '';
        const content = getSlotContent(slot);
        if (!name && content.length === 0) {
          return slot;
        }
      }
      return await addNewFileSlot(containers.length + 1);
    }


    // 2. 注入 QATP 任務書槽 (TYPE_QATP)
    if (targetType === 'TYPE_QATP') {
      for (const slot of containers) {
        const nameInput = slot.querySelector('input.js-gist-filename, input.form-control.js-gist-filename');
        const name = nameInput ? nameInput.value.trim().toLowerCase() : '';
        if (name === qatpName) {
          return slot;
        }
      }
      for (const slot of containers) {
        const nameInput = slot.querySelector('input.js-gist-filename, input.form-control.js-gist-filename');
        const name = nameInput ? nameInput.value.trim() : '';
        const content = getSlotContent(slot);
        if (!name && content.length === 0) {
          return slot;
        }
      }
      return await addNewFileSlot(containers.length + 1);
    }


    // 3. 注入交接檔槽 (TYPE_HANDOFF / OBS-04 對稱支援 note.*)
    if (targetType === 'TYPE_HANDOFF') {
      for (const slot of containers) {
        const nameInput = slot.querySelector('input.js-gist-filename, input.form-control.js-gist-filename');
        const name = nameInput ? nameInput.value.trim().toLowerCase() : '';
        if (name === handoffName || name.startsWith(handoffName + '.')) {
          return slot;
        }
      }
      for (const slot of containers) {
        const nameInput = slot.querySelector('input.js-gist-filename, input.form-control.js-gist-filename');
        const name = nameInput ? nameInput.value.trim() : '';
        const content = getSlotContent(slot);
        if (!name && content.length === 0) {
          return slot;
        }
      }
      return await addNewFileSlot(Math.max(containers.length + 1, 3));
    }


    return containers[0] || (await addNewFileSlot(1));
  }


  // ==========================================
  // 三合一智能裝配決策狀態機 (雙槽滿載智慧避讓防沖刷版)
  // OBS-D: 智能裝配採就地水合更新；一鍵加交接檔採 claimOrCreateSlot 空槽認領
  // ==========================================
  async function runSmartAssemblyPipeline() {
    try {
      // 0. 單次強制換新開關狀態機 (One-Shot Force New Gist)
      const forceNewCb = document.getElementById('gist-qatp-force-new-cb');
      if (forceNewCb && forceNewCb.checked) {
        forceNewCb.checked = false;
        try {
          sessionStorage.setItem(SESSION_KEY_SMART, '1');
        } catch (e) {
          console.warn('[QATP] 無法寫入 sessionStorage', e);
        }
        showToast('🧭 強制換新模式已觸發，正在開啟全新 Gist...', 'warning', 1500);
        window.location.href = 'https://gist.github.com/';
        return;
      }


      // 1. 頁面態偵測：檢視態跳轉編輯態端點精準校正
      if (!isEditorEnvironment()) {
        try {
          sessionStorage.setItem(SESSION_KEY_SMART, '1');
        } catch (e) {
          console.warn('[QATP] 無法寫入 sessionStorage', e);
        }


        if (isNewPage()) {
          showToast('🧭 正在跳轉至 Gist 新增頁面...', 'warning', 1500);
          window.location.href = 'https://gist.github.com/';
        } else {
          try {
            const canonicalUrl = getCanonicalGistUrl();
            showToast('🧭 正在跳轉至 Gist 編輯頁面...', 'warning', 1500);
            window.location.href = `${canonicalUrl}/edit`;
          } catch (e) {
            showToast('🧭 正在跳轉至 Gist 新增頁面...', 'warning', 1500);
            window.location.href = 'https://gist.github.com/';
          }
        }
        return;
      }


      const config = loadConfig();


      // 2. 結案開新判斷
      if (isGistArchived() && config.autoNewGistOnFinished) {
        const rawClip = await readClipboardText();
        const classifiedEarly = classifyClipboardText(rawClip);
        if (classifiedEarly.type === 'TYPE_CODE') {
          showToast('📦 當前 Gist 已結案，正在自動開啟新 Gist 建立任務...', 'warning', 1500);
          try {
            sessionStorage.setItem(SESSION_KEY_SMART, '1');
          } catch (e) {
            console.warn('[QATP] 無法寫入 sessionStorage', e);
          }
          window.location.href = 'https://gist.github.com/';
          return;
        }
      }


      // 3. 預建雙槽解耦與實體等待防線
      let files = document.querySelectorAll('.js-gist-file');
      if (files.length === 0) {
        throw new Error('找不到可編輯的 Gist 檔案卡片容器');
      }


      if (files.length < 2) {
        await addNewFileSlot(2);
        files = document.querySelectorAll('.js-gist-file');
      }


      // 4. 讀取剪貼簿並進行多態辨識
      const rawText = await readClipboardText();
      const classified = classifyClipboardText(rawText);


      if (classified.type === 'TYPE_UNKNOWN') {
        showToast('⚠️ 剪貼簿未辨識出有效代碼、QATP 或交接檔特徵', 'warning', 3500);
        updateFileBoard();
        return;
      }


      const getCardName = (slot) => {
        const input = slot.querySelector('input.js-gist-filename, input.form-control.js-gist-filename');
        return input ? input.value.trim().toLowerCase() : '';
      };


      // 5. 雙槽滿載智慧避讓防線 (INV-04)
      const currentSlots = document.querySelectorAll('.js-gist-file');
      const qatpFileNameLower = (config.qatpFileName || 'QATP.md').toLowerCase();
      const handoffFileNameLower = (config.defaultFileName || 'note').toLowerCase();


      let existingCodeHasContent = false;
      let existingQatpHasContent = false;


      for (const slot of currentSlots) {
        const cName = getCardName(slot);
        const cLen = getSlotContent(slot).length;
        if (cName === qatpFileNameLower && cLen > 0) {
          existingQatpHasContent = true;
        } else if (cName && cName !== qatpFileNameLower && cName !== handoffFileNameLower && !cName.startsWith(handoffFileNameLower + '.') && cLen > 0) {
          existingCodeHasContent = true;
        }
      }


      if (existingCodeHasContent && existingQatpHasContent && classified.type === 'TYPE_CODE') {
        showToast('⚠️ 當前 Gist 代碼與 QATP 已就緒。若欲更新交接檔請複製交接檔；若欲開立全新任務請勾選頂部『開新Gist』開關！', 'warning', 5000);
        updateFileBoard();
        return;
      }


      // 分支 A: 生產代碼
      if (classified.type === 'TYPE_CODE') {
        showToast('⏳ 正在裝配生產代碼至代碼槽...', 'warning', 1500);


        if (classified.meta.description) {
          const descInput = document.querySelector('input[name="gist[description]"], input.js-quick-title');
          if (descInput) {
            descInput.value = classified.meta.description;
            descInput.dispatchEvent(new Event('input', { bubbles: true }));
            descInput.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }


        const targetCodeSlot = await resolveSemanticSlot('TYPE_CODE', config);
        await hydrateSlot(targetCodeSlot, classified.meta.fileName, classified.content);


        const latestFiles = document.querySelectorAll('.js-gist-file');
        const qatpName = (config.qatpFileName || 'QATP.md').toLowerCase();
        let qatpHasContent = false;


        for (const slot of latestFiles) {
          if (getCardName(slot) === qatpName && getSlotContent(slot).length > 0) {
            qatpHasContent = true;
            break;
          }
        }


        if (qatpHasContent) {
          // 演算法 4：雙槽存檔自動連動中繼時序 (AC-3)
          if (config.autoSubmitDualReady) {
            try {
              sessionStorage.setItem(SESSION_KEY_RELAY, '1');
            } catch (e) {
              console.warn('[QATP] 無法寫入 sessionStorage', e);
            }
            showToast('🎉 代碼注入成功！兩槽齊全，正在自動存檔並連動投送...', 'success', 2000);
            setTimeout(() => triggerSaveAction(false), 400);
          } else {
            showToast('🎉 代碼注入成功！兩槽齊全，請手動提交儲存', 'success', 3000);
          }
        } else {
          showToast('✅ 代碼已填入，已預建 QATP 槽位！請複製 QATP 後再次點擊本按鈕', 'success', 4000);
        }
      }
      // 分支 B: QATP 任務書
      else if (classified.type === 'TYPE_QATP') {
        showToast('⏳ 正在裝配任務書至 QATP 槽...', 'warning', 1500);


        const targetQatpSlot = await resolveSemanticSlot('TYPE_QATP', config);
        const targetFileName = config.qatpFileName || 'QATP.md';
        await hydrateSlot(targetQatpSlot, targetFileName, classified.content);


        const latestFiles = document.querySelectorAll('.js-gist-file');
        const qatpName = (config.qatpFileName || 'QATP.md').toLowerCase();
        const handoffName = (config.defaultFileName || 'note').toLowerCase();
        let codeHasContent = false;


        for (const slot of latestFiles) {
          const name = getCardName(slot);
          if (name && name !== qatpName && name !== handoffName && !name.startsWith(handoffName + '.')) {
            if (getSlotContent(slot).length > 0) {
              codeHasContent = true;
              break;
            }
          }
        }


        if (codeHasContent) {
          // 演算法 4：雙槽存檔自動連動中繼時序 (AC-3)
          if (config.autoSubmitDualReady) {
            try {
              sessionStorage.setItem(SESSION_KEY_RELAY, '1');
            } catch (e) {
              console.warn('[QATP] 無法寫入 sessionStorage', e);
            }
            showToast('🎉 任務書注入成功！兩槽齊全，正在自動存檔並連動投送...', 'success', 2000);
            setTimeout(() => triggerSaveAction(false), 400);
          } else {
            showToast('🎉 任務書注入成功！兩槽齊全，請手動提交儲存', 'success', 3000);
          }
        } else {
          showToast('✅ QATP 已填入槽位，已保留代碼槽！請複製代碼後再次點擊本按鈕', 'success', 4000);
        }
      }
      // 分支 C: Handoff 交接檔
      else if (classified.type === 'TYPE_HANDOFF') {
        showToast('⏳ 正在裝配交接檔...', 'warning', 1500);


        const targetHandoffSlot = await resolveSemanticSlot('TYPE_HANDOFF', config);
        const targetFileName = config.defaultFileName || 'note';


        await hydrateSlot(targetHandoffSlot, targetFileName, classified.content);
        updateFileBoard();


        const allSlots = document.querySelectorAll('.js-gist-file');
        const qatpName = (config.qatpFileName || 'QATP.md').toLowerCase();
        const handoffName = (config.defaultFileName || 'note').toLowerCase();


        let hasCode = false;
        let hasQatp = false;


        for (const slot of allSlots) {
          const name = getCardName(slot);
          const hasContent = getSlotContent(slot).length > 0;
          if (name === qatpName && hasContent) hasQatp = true;
          if (name && name !== qatpName && name !== handoffName && !name.startsWith(handoffName + '.') && hasContent) hasCode = true;
        }


        if (hasCode && hasQatp) {
          showToast('🎉 三槽內容全數齊全！正在提交儲存...', 'success', 2000);
          setTimeout(() => {
            triggerSaveAction(false);
          }, 500);
        } else {
          showToast('✅ 交接檔已填入！代碼或 QATP 尚未就緒，請補齊後手動儲存', 'warning', 4500);
        }
      }


      updateFileBoard();


    } catch (err) {
      console.error('[Smart Assembly Error]', err);
      showToast(err.message || '智能裝配流水線異常', 'danger');
    }
  }


  // ==========================================
  // 核心流水線：提取與寫入 QATP 指令 (Btn 4)
  // ==========================================
  async function runExtractAndCopyPipeline() {
    try {
      const canonicalUrl = getCanonicalGistUrl();
      const csvData = await fetchCloudCSV();


      const grid = parseRFC4180CSV(csvData);
      const finalText = assemblePrompt(grid, canonicalUrl);


      await writeToClipboard(finalText);
      showToast('🎉 QATP 引導指令已成功複製！', 'success');
    } catch (err) {
      console.error('[QATP Pipeline Error]', err);
      showToast(`❌ ${err.message || '執行失敗'}`, 'danger');
    }
  }


  // ==========================================
  // 一鍵加交接檔流水線 (Btn 2 / ITEM-03 智慧認領優先)
  // ==========================================
  async function executeHandoffPipeline(rawText = null) {
    try {
      let content = rawText;
      if (!content) {
        content = await readClipboardText();
        const classified = classifyClipboardText(content);
        if (classified.type !== 'TYPE_HANDOFF' && classified.type !== 'TYPE_QATP') {
          showToast('⚠️ 剪貼簿內容未符合交接檔或任務書特徵', 'warning');
          return;
        }
      }


      showToast('⏳ 正在執行自動加檔與注入...', 'warning', 2000);


      const config = loadConfig();
      const targetFileName = config.defaultFileName || 'note';
      const targetSlot = await claimOrCreateSlot(targetFileName);


      await hydrateSlot(targetSlot, targetFileName, content);


      updateFileBoard();
      showToast('💾 交接檔內容已注入，正在提交儲存...', 'success', 2000);
      setTimeout(() => {
        triggerSaveAction(false);
      }, 500);


    } catch (err) {
      console.error('[Handoff Pipeline Error]', err);
      showToast(err.message || '加檔流水線異常', 'danger');
    }
  }


  async function startHandoffProcess() {
    try {
      const text = await readClipboardText();
      const classified = classifyClipboardText(text);
      if (classified.type !== 'TYPE_HANDOFF' && classified.type !== 'TYPE_QATP') {
        showToast('⚠️ 剪貼簿內容未符合交接檔或任務書特徵', 'warning');
        return;
      }


      if (isEditorEnvironment()) {
        await executeHandoffPipeline(text);
      } else {
        const canonicalUrl = getCanonicalGistUrl();
        try {
          sessionStorage.setItem(SESSION_KEY_HANDOFF, '1');
        } catch (e) {
          console.warn('[QATP] 無法寫入 sessionStorage', e);
        }
        window.location.href = `${canonicalUrl}/edit`;
      }
    } catch (err) {
      showToast(err.message || '讀取剪貼簿失敗', 'danger');
    }
  }


  // ==========================================
  // GitHub REST API 跨網域請求包裝器 (附帶退避重試矩陣)
  // P3-01: fetch 降級時剝除 User-Agent 防警告
  // P3-03/04: 5xx 伺服器錯誤範圍擴大至 599
  // ==========================================
  function githubApiRequest(method, url, token, body = null, retryCount = 0) {
    return new Promise((resolve, reject) => {
      const headers = {
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': `token ${token}`
      };
      if (body) {
        headers['Content-Type'] = 'application/json';
      }


      if (typeof GM_xmlhttpRequest === 'function') {
        headers['User-Agent'] = 'Gist-QATP-Tool';


        const reqDetails = {
          method: method,
          url: url,
          headers: headers,
          timeout: 15000,
          onload: (res) => {
            if (res.status >= 200 && res.status < 300) {
              try {
                const parsed = JSON.parse(res.responseText || '{}');
                resolve(parsed);
              } catch (e) {
                resolve({});
              }
            } else if (res.status === 401 || res.status === 403) {
              reject({ status: res.status, message: `❌ GitHub Token 無效或無寫入權限 (HTTP ${res.status})`, fatal: true });
            } else if (res.status === 404) {
              reject({ status: res.status, message: `❌ 找不到倉庫或分支，請確認目標倉庫已手動建立且具備存取權限 (HTTP 404)`, fatal: true });
            } else if ((res.status >= 500 && res.status <= 599) && retryCount < 2) {
              setTimeout(() => {
                githubApiRequest(method, url, token, body, retryCount + 1).then(resolve).catch(reject);
              }, 1000);
            } else {
              reject({ status: res.status, message: `❌ 跨倉投送失敗: 網路異常或 GitHub 服務暫時不可用 (HTTP ${res.status})` });
            }
          },
          onerror: () => {
            if (retryCount < 2) {
              setTimeout(() => {
                githubApiRequest(method, url, token, body, retryCount + 1).then(resolve).catch(reject);
              }, 1000);
            } else {
              reject({ status: 0, message: '❌ 跨倉投送失敗: 網路異常或 GitHub 服務暫時不可用' });
            }
          },
          ontimeout: () => {
            if (retryCount < 2) {
              setTimeout(() => {
                githubApiRequest(method, url, token, body, retryCount + 1).then(resolve).catch(reject);
              }, 1000);
            } else {
              reject({ status: 0, message: '❌ 跨倉投送失敗: 請求逾時' });
            }
          }
        };


        if (body) {
          reqDetails.data = JSON.stringify(body);
        }


        GM_xmlhttpRequest(reqDetails);
      } else {
        // fetch 降級路徑：深拷貝標頭並排除 User-Agent 防瀏覽器報錯 (P3-01)
        const fetchHeaders = Object.assign({}, headers);
        delete fetchHeaders['User-Agent'];


        const fetchOptions = {
          method: method,
          headers: fetchHeaders,
          body: body ? JSON.stringify(body) : undefined
        };


        fetch(url, fetchOptions)
          .then(async (res) => {
            if (res.ok) return res.json();
            if (res.status === 401 || res.status === 403) throw { status: res.status, message: `❌ GitHub Token 無效或無寫入權限 (HTTP ${res.status})`, fatal: true };
            if (res.status === 404) throw { status: res.status, message: `❌ 找不到倉庫或分支 (HTTP 404)`, fatal: true };
            if (res.status >= 500 && res.status <= 599) throw { status: res.status, message: `HTTP ${res.status}`, is5xx: true };
            throw { status: res.status, message: `HTTP ${res.status}` };
          })
          .then(resolve)
          .catch((err) => {
            if (err.fatal) {
              reject(err);
            } else if (retryCount < 2) {
              setTimeout(() => {
                githubApiRequest(method, url, token, body, retryCount + 1).then(resolve).catch(reject);
              }, 1000);
            } else {
              reject(err.message ? err : { status: 0, message: '❌ 跨倉投送失敗: 網路異常或 GitHub 服務暫時不可用' });
            }
          });
      }
    });
  }


  // ==========================================
  // 全量乾淨鏡像樹清場時序 (Git Trees Commit Pipeline / 妥協案 13, 14, 15)
  // P2-02: 編輯態安全攔截防自殺時序
  // P3-10: 檢視態 .blob-code-inner 純代碼萃取與路徑穿越防禦
  // AC-3: 雲端動態大一統提示詞組裝
  // ==========================================
  async function mirrorToGitHubRelay() {
    try {
      // 0. 演算法 1：編輯態時序解耦防自殺 (妥協案 15 / P2-02 / AC-2)
      if (isEditorEnvironment()) {
        try {
          sessionStorage.setItem(SESSION_KEY_RELAY, '1');
        } catch (e) {
          console.warn('[QATP] 無法寫入 sessionStorage', e);
        }
        showToast('💾 正在儲存 Gist，跳轉後將自動完成跨倉鏡像...', 'warning', 2000);
        triggerSaveAction(false);
        return; // 立即中斷，交棒給跳轉後檢視態
      }


      // 1. 動態路由與 Fail-Fast 阻斷
      const currentOwner = extractGistOwner();
      if (!currentOwner) {
        showToast('⚠️ 無法辨識當前 Gist 擁有者，請確認處於有效 Gist 頁面', 'warning');
        return;
      }


      const config = loadConfig();
      const slots = Array.isArray(config.relaySlots) ? config.relaySlots : [];
      const matchedSlot = slots.find(
        (s) => s && typeof s.account === 'string' && s.account.trim().toLowerCase() === currentOwner.toLowerCase()
      );


      if (!matchedSlot || !matchedSlot.token || !matchedSlot.token.trim()) {
        showToast(`⚠️ 未找到帳號 [${currentOwner}] 的對應 Token！已阻斷投送以防誤染倉庫`, 'warning', 4500);
        return;
      }


      const activeToken = matchedSlot.token.trim();
      const repo = (config.relayRepoName || 'qatp-relay').trim();
      const branch = (config.relayRepoBranch || 'main').trim();


      // 2. 演算法 2：提取檢視態純代碼與路徑穿越防禦 (P3-10 / AC-4)
      const treeItems = [];
      const fileContainers = document.querySelectorAll('.file.js-gist-file, div[id^="file-"]');
      for (const container of fileContainers) {
        const nameEl = container.querySelector('.gist-blob-name, strong.gist-blob-name, .file-header .Link--primary');
        const fileName = nameEl ? nameEl.textContent.trim() : '';


        // P3-10: 檔名路徑穿越防禦
        if (!fileName || fileName.includes('..') || fileName.startsWith('/')) {
          continue;
        }


        let content = '';
        // 優先讀取行節點 .blob-code-inner 拼接換行，徹底消除 .blob-num 行號污染 (AC-4)
        const lineNodes = container.querySelectorAll('.blob-code-inner');
        if (lineNodes && lineNodes.length > 0) {
          content = Array.from(lineNodes).map((l) => l.innerText).join('\n').trim();
        } else {
          const ta = container.querySelector('textarea, .blob-wrapper');
          if (ta && ta.value) {
            content = ta.value.trim();
          } else {
            const table = container.querySelector('.js-file-line-container, table');
            content = table ? table.innerText.trim() : (container.innerText || '').trim();
          }
        }


        if (content.length > 0) {
          treeItems.push({
            path: fileName,
            mode: '100644',
            type: 'blob',
            content: content
          });
        }
      }


      if (treeItems.length === 0) {
        showToast('⚠️ 看板無有效檔案內容，阻斷投送', 'warning');
        return;
      }


      showToast(`⏳ 正在鏡像至 ${currentOwner}/${repo} (全量清場)...`, 'info', 3000);


      // 3. 取得分支最新 Commit SHA
      let parentCommitSha = '';
      try {
        const refData = await githubApiRequest('GET', `https://api.github.com/repos/${currentOwner}/${repo}/git/ref/heads/${branch}`, activeToken);
        parentCommitSha = refData.object ? refData.object.sha : '';
      } catch (err) {
        if (err.status === 404) {
          const refDataFallback = await githubApiRequest('GET', `https://api.github.com/repos/${currentOwner}/${repo}/git/refs/heads/${branch}`, activeToken);
          parentCommitSha = refDataFallback.object ? refDataFallback.object.sha : '';
        } else {
          throw err;
        }
      }


      if (!parentCommitSha) {
        throw new Error(`無法取得分支 ${branch} 的最新 Commit SHA`);
      }


      // 4. 建立全新獨立 Git Tree (妥協案 13：強制不帶 base_tree 達成原子清場)
      const newTreeData = await githubApiRequest(
        'POST',
        `https://api.github.com/repos/${currentOwner}/${repo}/git/trees`,
        activeToken,
        { tree: treeItems }
      );
      const newTreeSha = newTreeData.sha;


      // 5. 建立新 Commit 物件
      let gistId = '';
      try {
        const canonical = getCanonicalGistUrl();
        gistId = canonical.split('/').pop();
      } catch (e) {
        gistId = window.location.pathname.split('/').filter(Boolean).pop() || 'unknown';
      }


      const commitMessage = `[QATP Relay] Mirror from Gist: ${gistId} (${treeItems.length} files)`;
      const newCommitData = await githubApiRequest(
        'POST',
        `https://api.github.com/repos/${currentOwner}/${repo}/git/commits`,
        activeToken,
        {
          message: commitMessage,
          tree: newTreeSha,
          parents: [parentCommitSha]
        }
      );
      const newCommitSha = newCommitData.sha;


      // 6. 原子更新分支引用 (Update Ref)
      await githubApiRequest(
        'PATCH',
        `https://api.github.com/repos/${currentOwner}/${repo}/git/refs/heads/${branch}`,
        activeToken,
        {
          sha: newCommitSha,
          force: true
        }
      );


      // 7. 演算法 3：雲端大一統提示詞組裝與三變數置換 (AC-3)
      const targetGistUrl = getCanonicalGistUrl();
      const targetRepoUrl = `https://github.com/${currentOwner}/${repo}.git`;
      const shortSha = newCommitSha.slice(0, 7);


      let finalPromptText = '';
      try {
        const csvData = await fetchCloudCSV();
        const grid = parseRFC4180CSV(csvData);
        const targetKw = (config.cloudKeyword || 'repo & grep').trim().toLowerCase();
        let cloudTemplate = null;


        for (const row of grid) {
          if (row && row[0] && row[0].trim().toLowerCase() === targetKw) {
            cloudTemplate = row[1] || '';
            break;
          }
        }


        if (cloudTemplate) {
          finalPromptText = cloudTemplate
            .replace(/\{target_repo_url\}/g, targetRepoUrl)
            .replace(/\{commit_sha\}/g, shortSha)
            .replace(/\{target_gist_url\}/g, targetGistUrl)
            .replace(/\{target_url\}/g, targetGistUrl);
        }
      } catch (templateErr) {
        console.warn('[QATP] 無法取得雲端大一統模板，啟用保底防爆規約:', templateErr);
      }


      // 保底大一統防爆規約
      if (!finalPromptText) {
        finalPromptText = `請依據以下倉庫代碼執行 QATP 白箱測試與獨立覆核驗收任務：

\`git -c http.sslVerify=false clone ${targetRepoUrl}\`
\`cd ${repo} && git checkout ${shortSha}\`
（最新提交：${shortSha}，來源 Gist：${targetGistUrl}）

請嚴格遵循工程規範完成四大維度獨立驗證，驗收結果請落盤至：
\`/workspace/output/QA驗收報告-QATP白箱審查.md\`

交付格式採雙軌自適應：
1. 支援資源交付：使用 <deliver-assets> 區塊封裝。
2. 純文字交付：直接以 Markdown 報告交付驗證矩陣與核對清單。`;
      }


      await writeToClipboard(finalPromptText);
      showToast(`🚀 已鏡像至 ${currentOwner}/${repo}！Claude 引導詞已複製`, 'success', 4000);


    } catch (err) {
      console.error('[Mirror Relay Error]', err);
      showToast(err.message || '跨倉鏡像投送失敗', 'danger', 5000);
    }
  }


  // ==========================================
  // 插槽 Ping 測試演算法
  // ==========================================
  async function pingGitHubSlot(account, token, repo) {
    if (!account || !token) {
      showToast('⚠️ 帳號或 Token 不得為空', 'warning');
      return;
    }
    showToast(`⏳ 正在測試連線 ${account}/${repo}...`, 'info', 2000);
    try {
      const res = await githubApiRequest('GET', `https://api.github.com/repos/${account}/${repo}`, token);
      if (res && (res.permissions ? res.permissions.push : true)) {
        showToast('✅ 插槽連線正常，具備倉庫寫入權限！', 'success', 3500);
      } else {
        showToast('⚠️ 連線成功但無倉庫 Push 權限，請確認 Token Scope', 'warning', 3500);
      }
    } catch (err) {
      console.error('[Ping Error]', err);
      showToast(`❌ 插槽連線失敗: ${err.message}`, 'danger', 4000);
    }
  }


  // ==========================================
  // AHK 風格鍵盤熱鍵解析器與調度器
  // OBS-C: 移除未使用的 raw 屬性
  // ==========================================
  function parseAhkHotkey(hotkeyStr) {
    if (!hotkeyStr || typeof hotkeyStr !== 'string') return [];
    const tokens = hotkeyStr.split(',').map((s) => s.trim()).filter(Boolean);
    return tokens.map((token) => {
      let reqCtrl = false;
      let reqShift = false;
      let reqAlt = false;
      let clean = token;
      while (clean.length > 0) {
        if (clean.startsWith('^')) {
          reqCtrl = true;
          clean = clean.slice(1);
        } else if (clean.startsWith('+')) {
          reqShift = true;
          clean = clean.slice(1);
        } else if (clean.startsWith('!')) {
          reqAlt = true;
          clean = clean.slice(1);
        } else {
          break;
        }
      }
      return {
        key: clean.toLowerCase(),
        ctrl: reqCtrl,
        shift: reqShift,
        alt: reqAlt
      };
    });
  }


  function setupKeyboardDispatcher() {
    if (window._qatpKeyboardAttached) return;
    window._qatpKeyboardAttached = true;


    window.addEventListener(
      'keydown',
      (e) => {
        const config = loadConfig();
        const parsedList = parseAhkHotkey(config.smartAssemblyHotkey);
        if (!parsedList || parsedList.length === 0) return;


        const eventKey = e.key.toLowerCase();
        const isMatched = parsedList.some((rule) => {
          return (
            rule.key === eventKey &&
            rule.ctrl === e.ctrlKey &&
            rule.shift === e.shiftKey &&
            rule.alt === e.altKey
          );
        });


        if (!isMatched) return;


        const target = e.target;
        const isEditable =
          target &&
          (target.matches('input, textarea, select') ||
            target.isContentEditable ||
            !!target.closest('.CodeMirror'));


        const isFunctionKey = /^f[1-9][0-2]?$/i.test(e.key);
        const hasModifier = e.ctrlKey || e.altKey;


        if (isEditable && !isFunctionKey && !hasModifier) {
          return;
        }


        e.preventDefault();
        e.stopPropagation();
        runSmartAssemblyPipeline();
      },
      { capture: true }
    );
  }


  // ==========================================
  // 滑鼠中鍵上下文感知熱鍵引擎 (INV-06 嚴格型別守衛)
  // ==========================================
  function setupMiddleClickDispatcher() {
    if (window._qatpMiddleClickAttached) return;
    window._qatpMiddleClickAttached = true;


    const handleMiddleEvent = (e) => {
      if (e.button !== 1) return;


      if (!e.target || !(e.target instanceof Element)) return;


      const config = loadConfig();
      if (!config.enableMiddleClick) return;


      if (e.target.closest('a[href]')) return;


      if (
        e.target.closest(
          'button, input, textarea, select, #gist-qatp-toolbar, #gist-qatp-file-board, #gist-qatp-dock-orb, #gist-qatp-config-modal-overlay'
        )
      ) {
        return;
      }


      e.preventDefault();
      e.stopImmediatePropagation();


      if (e.type === 'auxclick') {
        const cardContainer = e.target.closest('.js-gist-file, .file.js-gist-file, div[id^="file-"]');
        if (cardContainer) {
          cardContainer.classList.add('gist-qatp-spotlight');
          setTimeout(() => {
            cardContainer.classList.remove('gist-qatp-spotlight');
          }, 1500);
        }
        runSmartAssemblyPipeline();
      }
    };


    window.addEventListener('mousedown', handleMiddleEvent, { capture: true });
    window.addEventListener('auxclick', handleMiddleEvent, { capture: true });
  }


  // ==========================================
  // Safe DOM 設定面板 (M04 / v1.1.1 語意特徵與雲端同步 / OBS-A 純點號防禦)
  // ==========================================
  function openConfigModal() {
    if (document.getElementById('gist-qatp-config-modal-overlay')) return;


    const currentConfig = loadConfig();
    const currentGistOwner = extractGistOwner();


    const overlay = document.createElement('div');
    overlay.id = 'gist-qatp-config-modal-overlay';


    const modal = document.createElement('div');
    modal.id = 'gist-qatp-config-modal';


    // 1. Header
    const header = document.createElement('div');
    header.className = 'gist-qatp-modal-header';


    const title = document.createElement('span');
    title.textContent = '⚙️ GitHub Gist 一鍵 QATP 工具設定 (v1.1.1)';


    const closeBtn = document.createElement('button');
    closeBtn.className = 'gist-qatp-btn gist-qatp-btn-secondary';
    closeBtn.style.padding = '2px 8px';
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', () => document.body.removeChild(overlay));


    header.appendChild(title);
    header.appendChild(closeBtn);


    // 2. Main (Sidebar + Content)
    const main = document.createElement('div');
    main.className = 'gist-qatp-modal-main';


    const sidebar = document.createElement('div');
    sidebar.className = 'gist-qatp-modal-sidebar';


    const content = document.createElement('div');
    content.className = 'gist-qatp-modal-content';


    const tabDefinitions = [
      { id: 'pane-appearance', label: '📑 排版外觀' },
      { id: 'pane-strategy', label: '⚡ 裝配策略' },
      { id: 'pane-regex', label: '🎯 語意特徵' },
      { id: 'pane-cloud', label: '🌐 雲端中繼' }
    ];


    const tabButtons = [];
    const tabPanes = [];


    // --- Tab 1: 排版外觀 ---
    const paneAppearance = document.createElement('div');
    paneAppearance.id = 'pane-appearance';
    paneAppearance.className = 'gist-qatp-tab-pane';


    const rowGrid1 = document.createElement('div');
    rowGrid1.className = 'gist-qatp-field-grid';


    const colLayout = document.createElement('div');
    colLayout.className = 'gist-qatp-field-row';
    const lblLayout = document.createElement('span');
    lblLayout.className = 'gist-qatp-field-label';
    lblLayout.textContent = '按鈕排列佈局：';
    const selectLayout = document.createElement('select');
    selectLayout.className = 'gist-qatp-select';
    [
      { val: 'single', txt: '直排單排 (預設推薦)' },
      { val: 'double', txt: '雙排雙欄網格' },
      { val: 'horizontal', txt: '橫向單排展開' }
    ].forEach((opt) => {
      const o = document.createElement('option');
      o.value = opt.val;
      o.textContent = opt.txt;
      selectLayout.appendChild(o);
    });
    selectLayout.value = currentConfig.layoutMode;
    colLayout.appendChild(lblLayout);
    colLayout.appendChild(selectLayout);


    const colSide = document.createElement('div');
    colSide.className = 'gist-qatp-field-row';
    const lblSide = document.createElement('span');
    lblSide.className = 'gist-qatp-field-label';
    lblSide.textContent = '手柄吸附側：';
    const selectSide = document.createElement('select');
    selectSide.className = 'gist-qatp-select';
    [
      { val: 'left', txt: '靠左側 (預設推薦)' },
      { val: 'right', txt: '靠右側' }
    ].forEach((opt) => {
      const o = document.createElement('option');
      o.value = opt.val;
      o.textContent = opt.txt;
      selectSide.appendChild(o);
    });
    selectSide.value = currentConfig.orbSide;
    colSide.appendChild(lblSide);
    colSide.appendChild(selectSide);


    rowGrid1.appendChild(colLayout);
    rowGrid1.appendChild(colSide);
    paneAppearance.appendChild(rowGrid1);


    const rowGrid2 = document.createElement('div');
    rowGrid2.className = 'gist-qatp-field-grid';


    const colBoardEnable = document.createElement('div');
    colBoardEnable.className = 'gist-qatp-field-row';
    const cbBoardLabel = document.createElement('label');
    cbBoardLabel.className = 'gist-qatp-field-checkbox';
    cbBoardLabel.style.marginTop = '22px';
    const cbBoard = document.createElement('input');
    cbBoard.type = 'checkbox';
    cbBoard.checked = currentConfig.showFileBoard;
    const txtBoard = document.createElement('span');
    txtBoard.textContent = '啟用獨立檔案狀態看板';
    cbBoardLabel.appendChild(cbBoard);
    cbBoardLabel.appendChild(txtBoard);
    colBoardEnable.appendChild(cbBoardLabel);


    const colBoardWidth = document.createElement('div');
    colBoardWidth.className = 'gist-qatp-field-row';
    const lblBoardWidth = document.createElement('span');
    lblBoardWidth.className = 'gist-qatp-field-label';
    lblBoardWidth.textContent = '看板最大寬度 (240 ~ 600 px)：';
    const inputBoardWidth = document.createElement('input');
    inputBoardWidth.className = 'gist-qatp-input';
    inputBoardWidth.type = 'number';
    inputBoardWidth.min = '240';
    inputBoardWidth.max = '600';
    inputBoardWidth.value = currentConfig.fileBoardMaxWidth;
    colBoardWidth.appendChild(lblBoardWidth);
    colBoardWidth.appendChild(inputBoardWidth);


    rowGrid2.appendChild(colBoardEnable);
    rowGrid2.appendChild(colBoardWidth);
    paneAppearance.appendChild(rowGrid2);


    const rowFs = document.createElement('div');
    rowFs.className = 'gist-qatp-field-row';
    const lblFs = document.createElement('span');
    lblFs.className = 'gist-qatp-field-label';
    lblFs.textContent = '全域字型大小 (12 ~ 20 px)：';
    const inputFs = document.createElement('input');
    inputFs.className = 'gist-qatp-input';
    inputFs.type = 'number';
    inputFs.min = '12';
    inputFs.max = '20';
    inputFs.value = currentConfig.buttonFontSize;
    rowFs.appendChild(lblFs);
    rowFs.appendChild(inputFs);
    paneAppearance.appendChild(rowFs);


    const rowBtnVis = document.createElement('div');
    rowBtnVis.className = 'gist-qatp-field-row';
    const lblBtnVis = document.createElement('span');
    lblBtnVis.className = 'gist-qatp-field-label';
    lblBtnVis.textContent = '快捷按鈕顯隱設定：';
    rowBtnVis.appendChild(lblBtnVis);


    const gridVis = document.createElement('div');
    gridVis.className = 'gist-qatp-field-grid';


    const makeVisCb = (labelText, checked) => {
      const lbl = document.createElement('label');
      lbl.className = 'gist-qatp-field-checkbox';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = checked;
      const sp = document.createElement('span');
      sp.textContent = labelText;
      lbl.appendChild(cb);
      lbl.appendChild(sp);
      return { container: lbl, checkbox: cb };
    };


    const visSmart = makeVisCb('顯示 ⚡ 智能裝配', currentConfig.buttonVisibility.smart);
    const visHandoff = makeVisCb('顯示 📝 一鍵加交接檔', currentConfig.buttonVisibility.handoff);
    const visSaveCopy = makeVisCb('顯示 🚀 儲存並複製 QATP', currentConfig.buttonVisibility.saveCopy);
    const visRelayClaude = makeVisCb('顯示 🌐 投送 Claude (Repo)', currentConfig.buttonVisibility.relayClaude);
    const visExtract = makeVisCb('顯示 📋 僅提取 QATP', currentConfig.buttonVisibility.extractOnly);


    gridVis.appendChild(visSmart.container);
    gridVis.appendChild(visHandoff.container);
    gridVis.appendChild(visSaveCopy.container);
    gridVis.appendChild(visRelayClaude.container);
    gridVis.appendChild(visExtract.container);
    rowBtnVis.appendChild(gridVis);
    paneAppearance.appendChild(rowBtnVis);


    // --- Tab 2: 裝配策略 ---
    const paneStrategy = document.createElement('div');
    paneStrategy.id = 'pane-strategy';
    paneStrategy.className = 'gist-qatp-tab-pane';


    const rowGridStrat1 = document.createElement('div');
    rowGridStrat1.className = 'gist-qatp-field-grid';


    const colNamingMode = document.createElement('div');
    colNamingMode.className = 'gist-qatp-field-row';
    const lblNamingMode = document.createElement('span');
    lblNamingMode.className = 'gist-qatp-field-label';
    lblNamingMode.textContent = '代碼槽命名策略：';
    const selectNamingMode = document.createElement('select');
    selectNamingMode.className = 'gist-qatp-select';
    [
      { val: 'infer_code', txt: '智能前綴 code.<ext> (推薦)' },
      { val: 'infer_name', txt: '萃取名稱 {Name}.<ext>' },
      { val: 'custom', txt: '完全自訂檔名' }
    ].forEach((opt) => {
      const o = document.createElement('option');
      o.value = opt.val;
      o.textContent = opt.txt;
      selectNamingMode.appendChild(o);
    });
    selectNamingMode.value = currentConfig.codeNamingMode;
    colNamingMode.appendChild(lblNamingMode);
    colNamingMode.appendChild(selectNamingMode);


    const colCustomName = document.createElement('div');
    colCustomName.className = 'gist-qatp-field-row';
    const lblCustomName = document.createElement('span');
    lblCustomName.className = 'gist-qatp-field-label';
    lblCustomName.textContent = '代碼槽自訂檔名：';
    const inputCustomName = document.createElement('input');
    inputCustomName.className = 'gist-qatp-input';
    inputCustomName.type = 'text';
    inputCustomName.value = currentConfig.customCodeFileName;
    colCustomName.appendChild(lblCustomName);
    colCustomName.appendChild(inputCustomName);


    rowGridStrat1.appendChild(colNamingMode);
    rowGridStrat1.appendChild(colCustomName);
    paneStrategy.appendChild(rowGridStrat1);


    const rowGridStrat2 = document.createElement('div');
    rowGridStrat2.className = 'gist-qatp-field-grid';


    const colQatpFile = document.createElement('div');
    colQatpFile.className = 'gist-qatp-field-row';
    const lblQatpFile = document.createElement('span');
    lblQatpFile.className = 'gist-qatp-field-label';
    lblQatpFile.textContent = 'QATP 槽固定檔名：';
    const inputQatpFile = document.createElement('input');
    inputQatpFile.className = 'gist-qatp-input';
    inputQatpFile.type = 'text';
    inputQatpFile.value = currentConfig.qatpFileName;
    colQatpFile.appendChild(lblQatpFile);
    colQatpFile.appendChild(inputQatpFile);


    const colHandoffFile = document.createElement('div');
    colHandoffFile.className = 'gist-qatp-field-row';
    const lblHandoffFile = document.createElement('span');
    lblHandoffFile.className = 'gist-qatp-field-label';
    lblHandoffFile.textContent = '一鍵加交接檔預設檔名 (法定 note)：';
    const inputHandoffFile = document.createElement('input');
    inputHandoffFile.className = 'gist-qatp-input';
    inputHandoffFile.type = 'text';
    inputHandoffFile.value = currentConfig.defaultFileName;
    colHandoffFile.appendChild(lblHandoffFile);
    colHandoffFile.appendChild(inputHandoffFile);


    rowGridStrat2.appendChild(colQatpFile);
    rowGridStrat2.appendChild(colHandoffFile);
    paneStrategy.appendChild(rowGridStrat2);


    const rowGridStrat3 = document.createElement('div');
    rowGridStrat3.className = 'gist-qatp-field-grid';


    const colAutoSubmit = document.createElement('div');
    colAutoSubmit.className = 'gist-qatp-field-row';
    const cbAutoSubmitLabel = document.createElement('label');
    cbAutoSubmitLabel.className = 'gist-qatp-field-checkbox';
    cbAutoSubmitLabel.style.marginTop = '12px';
    const cbAutoSubmit = document.createElement('input');
    cbAutoSubmit.type = 'checkbox';
    cbAutoSubmit.checked = currentConfig.autoSubmitDualReady;
    const txtAutoSubmit = document.createElement('span');
    txtAutoSubmit.textContent = '雙槽齊全時自動儲存';
    cbAutoSubmitLabel.appendChild(cbAutoSubmit);
    cbAutoSubmitLabel.appendChild(txtAutoSubmit);
    colAutoSubmit.appendChild(cbAutoSubmitLabel);


    const colArchivedNew = document.createElement('div');
    colArchivedNew.className = 'gist-qatp-field-row';
    const cbArchivedNewLabel = document.createElement('label');
    cbArchivedNewLabel.className = 'gist-qatp-field-checkbox';
    cbArchivedNewLabel.style.marginTop = '12px';
    const cbArchivedNew = document.createElement('input');
    cbArchivedNew.type = 'checkbox';
    cbArchivedNew.checked = currentConfig.autoNewGistOnFinished;
    const txtArchivedNew = document.createElement('span');
    txtArchivedNew.textContent = '已結案 Gist 自動開啟新 Gist';
    cbArchivedNewLabel.appendChild(cbArchivedNew);
    cbArchivedNewLabel.appendChild(txtArchivedNew);
    colArchivedNew.appendChild(cbArchivedNewLabel);


    rowGridStrat3.appendChild(colAutoSubmit);
    rowGridStrat3.appendChild(colArchivedNew);
    paneStrategy.appendChild(rowGridStrat3);


    const rowGridStrat4 = document.createElement('div');
    rowGridStrat4.className = 'gist-qatp-field-grid';


    const colMiddleClick = document.createElement('div');
    colMiddleClick.className = 'gist-qatp-field-row';
    const cbMiddleClickLabel = document.createElement('label');
    cbMiddleClickLabel.className = 'gist-qatp-field-checkbox';
    cbMiddleClickLabel.style.marginTop = '12px';
    const cbMiddleClick = document.createElement('input');
    cbMiddleClick.type = 'checkbox';
    cbMiddleClick.checked = currentConfig.enableMiddleClick;
    const txtMiddleClick = document.createElement('span');
    txtMiddleClick.textContent = '啟用滑鼠中鍵觸發智能裝配';
    cbMiddleClickLabel.appendChild(cbMiddleClick);
    cbMiddleClickLabel.appendChild(txtMiddleClick);
    colMiddleClick.appendChild(cbMiddleClickLabel);


    const colHotkey = document.createElement('div');
    colHotkey.className = 'gist-qatp-field-row';
    const lblHotkey = document.createElement('span');
    lblHotkey.className = 'gist-qatp-field-label';
    lblHotkey.textContent = '智能裝配熱鍵 (AHK 風格)：';
    const inputHotkey = document.createElement('input');
    inputHotkey.className = 'gist-qatp-input';
    inputHotkey.type = 'text';
    inputHotkey.value = currentConfig.smartAssemblyHotkey || 'F4';
    colHotkey.appendChild(lblHotkey);
    colHotkey.appendChild(inputHotkey);


    rowGridStrat4.appendChild(colMiddleClick);
    rowGridStrat4.appendChild(colHotkey);
    paneStrategy.appendChild(rowGridStrat4);


    const hintHotkey = document.createElement('span');
    hintHotkey.className = 'gist-qatp-field-hint';
    hintHotkey.textContent = '熱鍵支援多組逗號分隔 (例: F4, ^F4, !F4)；修飾前綴：^ 代表 Ctrl，+ 代表 Shift，! 代表 Alt；# (Win 鍵) 豁免不支援。輸入框打字自動放行。';
    paneStrategy.appendChild(hintHotkey);


    // --- Tab 3: 🎯 語意特徵 ---
    const paneRegex = document.createElement('div');
    paneRegex.id = 'pane-regex';
    paneRegex.className = 'gist-qatp-tab-pane';


    const rowCodeRegex = document.createElement('div');
    rowCodeRegex.className = 'gist-qatp-field-row';
    const lblCodeRegex = document.createElement('span');
    lblCodeRegex.className = 'gist-qatp-field-label';
    lblCodeRegex.textContent = '生產代碼特徵辨識正則 (codeRegex)：';
    const inputCodeRegex = document.createElement('input');
    inputCodeRegex.className = 'gist-qatp-input';
    inputCodeRegex.type = 'text';
    inputCodeRegex.value = currentConfig.codeRegex;
    rowCodeRegex.appendChild(lblCodeRegex);
    rowCodeRegex.appendChild(inputCodeRegex);
    paneRegex.appendChild(rowCodeRegex);


    const rowQatpPrimary = document.createElement('div');
    rowQatpPrimary.className = 'gist-qatp-field-row';
    const lblQatpPrimary = document.createElement('span');
    lblQatpPrimary.className = 'gist-qatp-field-label';
    lblQatpPrimary.textContent = 'QATP 第一核心特徵標記 (qatpPrimaryToken)：';
    const inputQatpPrimary = document.createElement('input');
    inputQatpPrimary.className = 'gist-qatp-input';
    inputQatpPrimary.type = 'text';
    inputQatpPrimary.value = currentConfig.qatpPrimaryToken || 'QATP';
    rowQatpPrimary.appendChild(lblQatpPrimary);
    rowQatpPrimary.appendChild(inputQatpPrimary);
    paneRegex.appendChild(rowQatpPrimary);


    const rowQatpSecondary = document.createElement('div');
    rowQatpSecondary.className = 'gist-qatp-field-row';
    const lblQatpSecondary = document.createElement('span');
    lblQatpSecondary.className = 'gist-qatp-field-label';
    lblQatpSecondary.textContent = 'QATP 第二上下文特徵正則 (qatpSecondaryPattern)：';
    const inputQatpSecondary = document.createElement('input');
    inputQatpSecondary.className = 'gist-qatp-input';
    inputQatpSecondary.type = 'text';
    inputQatpSecondary.value = currentConfig.qatpSecondaryPattern || DEFAULT_CONFIG_V2_1_1.qatpSecondaryPattern;
    rowQatpSecondary.appendChild(lblQatpSecondary);
    rowQatpSecondary.appendChild(inputQatpSecondary);


    const hintQatp = document.createElement('span');
    hintQatp.className = 'gist-qatp-field-hint';
    hintQatp.textContent = 'QATP 判定採雙特徵交集門禁：前 20 行內必須同時包含特徵一與符合特徵二，且排除代碼宣告。';
    rowQatpSecondary.appendChild(hintQatp);
    paneRegex.appendChild(rowQatpSecondary);


    const rowFilterRegex = document.createElement('div');
    rowFilterRegex.className = 'gist-qatp-field-row';
    const lblFilterRegex = document.createElement('span');
    lblFilterRegex.className = 'gist-qatp-field-label';
    lblFilterRegex.textContent = '交接檔特徵辨識正則 (filterRegex)：';
    const inputFilterRegex = document.createElement('input');
    inputFilterRegex.className = 'gist-qatp-input';
    inputFilterRegex.type = 'text';
    inputFilterRegex.value = currentConfig.filterRegex;
    rowFilterRegex.appendChild(lblFilterRegex);
    rowFilterRegex.appendChild(inputFilterRegex);
    paneRegex.appendChild(rowFilterRegex);


    const rowKeywords = document.createElement('div');
    rowKeywords.className = 'gist-qatp-field-row';
    const lblKeywords = document.createElement('span');
    lblKeywords.className = 'gist-qatp-field-label';
    lblKeywords.textContent = '交接檔強關鍵字清單 (noteKeywords，每行或以逗號分隔)：';
    const inputKeywords = document.createElement('textarea');
    inputKeywords.className = 'gist-qatp-textarea';
    inputKeywords.rows = 4;
    inputKeywords.value = (currentConfig.noteKeywords || DEFAULT_CONFIG_V2_1_1.noteKeywords).join('\n');
    rowKeywords.appendChild(lblKeywords);
    rowKeywords.appendChild(inputKeywords);
    paneRegex.appendChild(rowKeywords);


    // --- Tab 4: 🌐 雲端中繼 ---
    const paneCloud = document.createElement('div');
    paneCloud.id = 'pane-cloud';
    paneCloud.className = 'gist-qatp-tab-pane';


    // 區塊 A：Claude 中繼倉與多帳號插槽設定
    const secRelay = document.createElement('div');
    secRelay.className = 'gist-qatp-field-row';


    const lblRelayTitle = document.createElement('span');
    lblRelayTitle.className = 'gist-qatp-field-label';
    lblRelayTitle.style.color = '#58a6ff';
    lblRelayTitle.textContent = '【Project Bridge-Drop：Claude 中繼倉與多帳號插槽】';
    secRelay.appendChild(lblRelayTitle);


    const rowRelayRepoGrid = document.createElement('div');
    rowRelayRepoGrid.className = 'gist-qatp-field-grid';


    const colRelayRepo = document.createElement('div');
    colRelayRepo.className = 'gist-qatp-field-row';
    const lblRelayRepo = document.createElement('span');
    lblRelayRepo.className = 'gist-qatp-field-label';
    lblRelayRepo.textContent = '中繼目標倉庫名：';
    const inputRelayRepo = document.createElement('input');
    inputRelayRepo.className = 'gist-qatp-input';
    inputRelayRepo.type = 'text';
    inputRelayRepo.value = currentConfig.relayRepoName || 'qatp-relay';
    colRelayRepo.appendChild(lblRelayRepo);
    colRelayRepo.appendChild(inputRelayRepo);


    const colRelayBranch = document.createElement('div');
    colRelayBranch.className = 'gist-qatp-field-row';
    const lblRelayBranch = document.createElement('span');
    lblRelayBranch.className = 'gist-qatp-field-label';
    lblRelayBranch.textContent = '中繼目標分支名：';
    const inputRelayBranch = document.createElement('input');
    inputRelayBranch.className = 'gist-qatp-input';
    inputRelayBranch.type = 'text';
    inputRelayBranch.value = currentConfig.relayRepoBranch || 'main';
    colRelayBranch.appendChild(lblRelayBranch);
    colRelayBranch.appendChild(inputRelayBranch);


    rowRelayRepoGrid.appendChild(colRelayRepo);
    rowRelayRepoGrid.appendChild(colRelayBranch);
    secRelay.appendChild(rowRelayRepoGrid);


    const ownerHint = document.createElement('div');
    ownerHint.style.fontSize = '12px';
    ownerHint.style.color = '#58a6ff';
    ownerHint.style.margin = '4px 0';
    ownerHint.textContent = `目前 Gist 帳號：${currentGistOwner || '(未進入 Gist 專案頁面)'}`;
    secRelay.appendChild(ownerHint);


    const slotInputs = [];
    const savedSlots = Array.isArray(currentConfig.relaySlots) ? currentConfig.relaySlots : [];


    for (let i = 0; i < 3; i++) {
      const slotVal = savedSlots[i] || { account: '', token: '' };


      const slotCard = document.createElement('div');
      slotCard.className = 'gist-qatp-slot-card';


      const slotHeader = document.createElement('div');
      slotHeader.className = 'gist-qatp-slot-header';
      slotHeader.textContent = `插槽 ${i + 1}`;


      const slotInputsContainer = document.createElement('div');
      slotInputsContainer.className = 'gist-qatp-slot-inputs';


      const grpAccount = document.createElement('div');
      grpAccount.className = 'gist-qatp-input-group';


      const inputAcc = document.createElement('input');
      inputAcc.className = 'gist-qatp-input';
      inputAcc.type = 'text';
      inputAcc.placeholder = 'GitHub 帳號，例如 wei9133';
      inputAcc.value = slotVal.account || '';


      const btnFillCurrent = document.createElement('button');
      btnFillCurrent.className = 'gist-qatp-icon-btn';
      btnFillCurrent.textContent = '填入當前';
      btnFillCurrent.title = '帶入當前 Gist 擁有者帳號';
      btnFillCurrent.addEventListener('click', () => {
        if (currentGistOwner) {
          inputAcc.value = currentGistOwner;
          showToast(`已帶入帳號：${currentGistOwner}`, 'info', 1500);
        } else {
          showToast('當前非 Gist 頁面，無法提取帳號', 'warning', 1500);
        }
      });


      grpAccount.appendChild(inputAcc);
      grpAccount.appendChild(btnFillCurrent);
      slotInputsContainer.appendChild(grpAccount);


      const grpToken = document.createElement('div');
      grpToken.className = 'gist-qatp-input-group';


      const inputTok = document.createElement('input');
      inputTok.className = 'gist-qatp-input';
      inputTok.type = 'password';
      inputTok.placeholder = 'GitHub Token (ghp_... 或 github_pat_...)';
      inputTok.value = slotVal.token || '';


      const btnEye = document.createElement('button');
      btnEye.className = 'gist-qatp-icon-btn';
      btnEye.textContent = '👁️';
      btnEye.title = '顯示 / 隱藏 Token';
      btnEye.addEventListener('click', () => {
        inputTok.type = inputTok.type === 'password' ? 'text' : 'password';
      });


      const btnPing = document.createElement('button');
      btnPing.className = 'gist-qatp-btn gist-qatp-btn-primary';
      btnPing.style.padding = '4px 8px';
      btnPing.style.fontSize = '12px';
      btnPing.textContent = '🔍 測試 (Ping)';
      btnPing.addEventListener('click', () => {
        const repoName = inputRelayRepo.value.trim() || 'qatp-relay';
        pingGitHubSlot(inputAcc.value.trim(), inputTok.value.trim(), repoName);
      });


      grpToken.appendChild(inputTok);
      grpToken.appendChild(btnEye);
      grpToken.appendChild(btnPing);
      slotInputsContainer.appendChild(grpToken);


      slotCard.appendChild(slotHeader);
      slotCard.appendChild(slotInputsContainer);
      secRelay.appendChild(slotCard);


      slotInputs.push({ accountEl: inputAcc, tokenEl: inputTok });
    }


    paneCloud.appendChild(secRelay);


    // 區塊 B：設定檔備份與跨瀏覽器遷移 (JSON 匯出 / 匯入)
    const secBackup = document.createElement('div');
    secBackup.className = 'gist-qatp-field-row';
    secBackup.style.marginTop = '10px';


    const lblBackupTitle = document.createElement('span');
    lblBackupTitle.className = 'gist-qatp-field-label';
    lblBackupTitle.style.color = '#58a6ff';
    lblBackupTitle.textContent = '【設定檔備份與跨瀏覽器遷移】';
    secBackup.appendChild(lblBackupTitle);


    const rowBackupBtns = document.createElement('div');
    rowBackupBtns.className = 'gist-qatp-action-row';


    const btnExportConfig = document.createElement('button');
    btnExportConfig.className = 'gist-qatp-btn gist-qatp-btn-secondary';
    btnExportConfig.textContent = '📋 匯出設定 (複製 JSON)';
    btnExportConfig.title = '複製當前所有設定至剪貼簿';
    btnExportConfig.addEventListener('click', async () => {
      const liveCfg = loadConfig();
      liveCfg.relayRepoName = inputRelayRepo.value.trim() || 'qatp-relay';
      liveCfg.relayRepoBranch = inputRelayBranch.value.trim() || 'main';
      liveCfg.relaySlots = slotInputs.map((s) => ({
        account: s.accountEl.value.trim(),
        token: s.tokenEl.value.trim()
      }));
      const jsonStr = JSON.stringify(liveCfg, null, 2);
      await writeToClipboard(jsonStr);
      showToast('✅ 設定已複製！(⚠️ 內含 Token，僅供個人瀏覽器遷移，請勿外流)', 'warning', 4500);
    });


    const btnImportConfig = document.createElement('button');
    btnImportConfig.className = 'gist-qatp-btn gist-qatp-btn-warm';
    btnImportConfig.textContent = '📥 匯入設定 (貼上 JSON)';
    btnImportConfig.title = '自剪貼簿貼入 JSON 還原組態';
    btnImportConfig.addEventListener('click', () => {
      const importOverlay = document.createElement('div');
      importOverlay.style.position = 'fixed';
      importOverlay.style.inset = '0';
      importOverlay.style.background = 'rgba(0,0,0,0.7)';
      importOverlay.style.zIndex = '100002';
      importOverlay.style.display = 'flex';
      importOverlay.style.alignItems = 'center';
      importOverlay.style.justifyContent = 'center';


      const importBox = document.createElement('div');
      importBox.style.background = '#161b22';
      importBox.style.border = '1px solid #30363d';
      importBox.style.borderRadius = '8px';
      importBox.style.padding = '16px';
      importBox.style.width = '480px';
      importBox.style.display = 'flex';
      importBox.style.flexDirection = 'column';
      importBox.style.gap = '10px';


      const importTitle = document.createElement('span');
      importTitle.style.fontWeight = '600';
      importTitle.style.color = '#f0f6fc';
      importTitle.textContent = '📥 貼上設定檔 JSON';


      const importTa = document.createElement('textarea');
      importTa.className = 'gist-qatp-textarea';
      importTa.rows = 8;
      importTa.placeholder = '在此處貼上導出的完整設定 JSON...';


      const importActions = document.createElement('div');
      importActions.className = 'gist-qatp-action-row';
      importActions.style.justifyContent = 'flex-end';


      const btnCancel = document.createElement('button');
      btnCancel.className = 'gist-qatp-btn gist-qatp-btn-secondary';
      btnCancel.textContent = '取消';
      btnCancel.addEventListener('click', () => {
        document.body.removeChild(importOverlay);
      });


      const btnConfirmImport = document.createElement('button');
      btnConfirmImport.className = 'gist-qatp-btn gist-qatp-btn-smart';
      btnConfirmImport.textContent = '確認匯入';
      btnConfirmImport.addEventListener('click', () => {
        const raw = importTa.value.trim();
        try {
          const parsed = JSON.parse(raw);
          if (!parsed || typeof parsed !== 'object') {
            throw new Error('解析結果非物件');
          }
          if (!Array.isArray(parsed.relaySlots) || parsed.relaySlots.length === 0) {
            throw new Error('缺少必要 relaySlots 欄位');
          }


          // P3-07: 強制截斷至 3 組插槽防溢出
          const boundedSlots = parsed.relaySlots.slice(0, 3).map((s) => ({
            account: (s && typeof s.account === 'string') ? s.account.trim() : '',
            token: (s && typeof s.token === 'string') ? s.token.trim() : ''
          }));
          while (boundedSlots.length < 3) {
            boundedSlots.push({ account: '', token: '' });
          }
          parsed.relaySlots = boundedSlots;


          const merged = Object.assign({}, DEFAULT_CONFIG_V2_1_1, parsed);
          saveConfig(merged);
          injectStyles();


          const existingToolbar = document.getElementById('gist-qatp-toolbar');
          if (existingToolbar) existingToolbar.remove();
          mountToolbar();


          document.body.removeChild(importOverlay);
          document.body.removeChild(overlay);
          showToast('🎉 匯入成功！3 組帳號設定已就緒！', 'success', 3500);
          openConfigModal();
        } catch (err) {
          console.error('[Import Error]', err);
          showToast('❌ 匯入失敗：設定 JSON 格式無效或缺少必要插槽欄位', 'danger', 4000);
        }
      });


      importActions.appendChild(btnCancel);
      importActions.appendChild(btnConfirmImport);
      importBox.appendChild(importTitle);
      importBox.appendChild(importTa);
      importBox.appendChild(importActions);
      importOverlay.appendChild(importBox);
      document.body.appendChild(importOverlay);
    });


    rowBackupBtns.appendChild(btnExportConfig);
    rowBackupBtns.appendChild(btnImportConfig);
    secBackup.appendChild(rowBackupBtns);
    paneCloud.appendChild(secBackup);


    // Google Docs 特徵 JSON 同步區
    const rowSyncSection = document.createElement('div');
    rowSyncSection.className = 'gist-qatp-field-row';
    rowSyncSection.style.marginTop = '12px';


    const headerDocsSection = document.createElement('div');
    headerDocsSection.className = 'gist-qatp-field-header-row';


    const lblSyncSection = document.createElement('span');
    lblSyncSection.className = 'gist-qatp-field-label';
    lblSyncSection.style.color = '#58a6ff';
    lblSyncSection.textContent = '【Google Docs 特徵庫雲端動態同步】';


    const linkDocsEdit = document.createElement('a');
    linkDocsEdit.className = 'gist-qatp-link-btn';
    linkDocsEdit.href = getGoogleDocEditUrl(currentConfig.jsonSyncUrl || DEFAULT_CONFIG_V2_1_1.jsonSyncUrl);
    linkDocsEdit.target = '_blank';
    linkDocsEdit.rel = 'noopener noreferrer';
    linkDocsEdit.textContent = '🔗 文件編輯 ↗';


    headerDocsSection.appendChild(lblSyncSection);
    headerDocsSection.appendChild(linkDocsEdit);
    rowSyncSection.appendChild(headerDocsSection);


    const lblSyncUrl = document.createElement('span');
    lblSyncUrl.className = 'gist-qatp-field-label';
    lblSyncUrl.textContent = 'Google Docs 共享連結 (含純文字 export 轉換)：';
    const inputSyncUrl = document.createElement('input');
    inputSyncUrl.className = 'gist-qatp-input';
    inputSyncUrl.type = 'text';
    inputSyncUrl.value = currentConfig.jsonSyncUrl || DEFAULT_CONFIG_V2_1_1.jsonSyncUrl;
    inputSyncUrl.addEventListener('input', () => {
      linkDocsEdit.href = getGoogleDocEditUrl(inputSyncUrl.value.trim());
    });
    rowSyncSection.appendChild(lblSyncUrl);
    rowSyncSection.appendChild(inputSyncUrl);


    const actionRow = document.createElement('div');
    actionRow.className = 'gist-qatp-action-row';


    const btnCloudSync = document.createElement('button');
    btnCloudSync.className = 'gist-qatp-btn gist-qatp-btn-smart';
    btnCloudSync.textContent = '🔄 從雲端同步特徵';
    btnCloudSync.addEventListener('click', async () => {
      const url = inputSyncUrl.value.trim();
      if (!url) {
        showToast('請先輸入有效的 Google Docs 連結', 'warning');
        return;
      }
      try {
        const updated = await syncFromDocJson(url);
        inputCodeRegex.value = updated.codeRegex;
        inputQatpPrimary.value = updated.qatpPrimaryToken;
        inputQatpSecondary.value = updated.qatpSecondaryPattern;
        inputFilterRegex.value = updated.filterRegex;
        inputKeywords.value = updated.noteKeywords.join('\n');
      } catch (err) {
        console.error('[Sync Error]', err);
        showToast(err.message || '同步失敗', 'danger');
      }
    });


    const btnExportJson = document.createElement('button');
    btnExportJson.className = 'gist-qatp-btn gist-qatp-btn-secondary';
    btnExportJson.textContent = '📋 複製特徵 JSON 範本';
    btnExportJson.title = '複製標準脫敏 JSON 格式，可直接貼至 Google Docs 供團隊共享';
    btnExportJson.addEventListener('click', async () => {
      const sample = {
        version: '1.1.1',
        qatpPrimaryToken: inputQatpPrimary.value.trim() || 'QATP',
        qatpSecondaryPattern: inputQatpSecondary.value.trim() || DEFAULT_CONFIG_V2_1_1.qatpSecondaryPattern,
        filterRegex: inputFilterRegex.value.trim() || DEFAULT_CONFIG_V2_1_1.filterRegex,
        noteKeywords: inputKeywords.value.split(/[\r\n,]+/).map((k) => k.trim()).filter(Boolean),
        codeRegex: inputCodeRegex.value.trim() || DEFAULT_CONFIG_V2_1_1.codeRegex
      };
      await writeToClipboard(JSON.stringify(sample, null, 2));
      showToast('🎉 標準特徵 JSON 已複製至剪貼簿！', 'success');
    });


    actionRow.appendChild(btnCloudSync);
    actionRow.appendChild(btnExportJson);
    rowSyncSection.appendChild(actionRow);
    paneCloud.appendChild(rowSyncSection);


    // QATP 試算表 CSV 端點
    const rowCsvSection = document.createElement('div');
    rowCsvSection.className = 'gist-qatp-field-row';
    rowCsvSection.style.marginTop = '12px';


    const headerCsvSection = document.createElement('div');
    headerCsvSection.className = 'gist-qatp-field-header-row';


    const lblCsvSection = document.createElement('span');
    lblCsvSection.className = 'gist-qatp-field-label';
    lblCsvSection.style.color = '#58a6ff';
    lblCsvSection.textContent = '【QATP 提示詞試算表端點 (INV-01)】';


    headerCsvSection.appendChild(lblCsvSection);
    rowCsvSection.appendChild(headerCsvSection);


    const headerPrimary = document.createElement('div');
    headerPrimary.className = 'gist-qatp-field-header-row';


    const lblCloudPrimary = document.createElement('span');
    lblCloudPrimary.className = 'gist-qatp-field-label';
    lblCloudPrimary.textContent = '主雲端試算表 CSV 下載端點：';


    const linkPrimaryEdit = document.createElement('a');
    linkPrimaryEdit.className = 'gist-qatp-link-btn';
    linkPrimaryEdit.href = getGoogleSheetEditUrl(currentConfig.cloudEndpointPrimary || DEFAULT_CONFIG_V2_1_1.cloudEndpointPrimary);
    linkPrimaryEdit.target = '_blank';
    linkPrimaryEdit.rel = 'noopener noreferrer';
    linkPrimaryEdit.textContent = '🔗 開啟主表 ↗';


    headerPrimary.appendChild(lblCloudPrimary);
    headerPrimary.appendChild(linkPrimaryEdit);
    rowCsvSection.appendChild(headerPrimary);


    const inputCloudPrimary = document.createElement('input');
    inputCloudPrimary.className = 'gist-qatp-input';
    inputCloudPrimary.type = 'text';
    inputCloudPrimary.value = currentConfig.cloudEndpointPrimary;
    inputCloudPrimary.addEventListener('input', () => {
      linkPrimaryEdit.href = getGoogleSheetEditUrl(inputCloudPrimary.value.trim());
    });
    rowCsvSection.appendChild(inputCloudPrimary);


    const headerSecondary = document.createElement('div');
    headerSecondary.className = 'gist-qatp-field-header-row';


    const lblCloudSecondary = document.createElement('span');
    lblCloudSecondary.className = 'gist-qatp-field-label';
    lblCloudSecondary.textContent = '備援雲端試算表 CSV 下載端點：';


    const linkSecondaryEdit = document.createElement('a');
    linkSecondaryEdit.className = 'gist-qatp-link-btn';
    linkSecondaryEdit.href = getGoogleSheetEditUrl(currentConfig.cloudEndpointSecondary || DEFAULT_CONFIG_V2_1_1.cloudEndpointSecondary);
    linkSecondaryEdit.target = '_blank';
    linkSecondaryEdit.rel = 'noopener noreferrer';
    linkSecondaryEdit.textContent = '🔗 開啟備援表 ↗';


    headerSecondary.appendChild(lblCloudSecondary);
    headerSecondary.appendChild(linkSecondaryEdit);
    rowCsvSection.appendChild(headerSecondary);


    const inputCloudSecondary = document.createElement('input');
    inputCloudSecondary.className = 'gist-qatp-input';
    inputCloudSecondary.type = 'text';
    inputCloudSecondary.value = currentConfig.cloudEndpointSecondary;
    inputCloudSecondary.addEventListener('input', () => {
      linkSecondaryEdit.href = getGoogleSheetEditUrl(inputCloudSecondary.value.trim());
    });
    rowCsvSection.appendChild(inputCloudSecondary);


    const lblCloudKw = document.createElement('span');
    lblCloudKw.className = 'gist-qatp-field-label';
    lblCloudKw.textContent = '試算表檢索關鍵字：';
    const inputCloudKw = document.createElement('input');
    inputCloudKw.className = 'gist-qatp-input';
    inputCloudKw.type = 'text';
    inputCloudKw.value = currentConfig.cloudKeyword || 'repo & grep';
    rowCsvSection.appendChild(lblCloudKw);
    rowCsvSection.appendChild(inputCloudKw);


    paneCloud.appendChild(rowCsvSection);


    tabPanes.push(paneAppearance, paneStrategy, paneRegex, paneCloud);
    tabPanes.forEach((p) => content.appendChild(p));


    tabDefinitions.forEach((def, index) => {
      const tabBtn = document.createElement('button');
      tabBtn.className = 'gist-qatp-tab-btn' + (index === 0 ? ' active' : '');
      tabBtn.textContent = def.label;
      tabBtn.addEventListener('click', () => {
        tabButtons.forEach((b) => b.classList.remove('active'));
        tabPanes.forEach((p) => p.classList.remove('active'));
        tabBtn.classList.add('active');
        tabPanes[index].classList.add('active');
      });
      tabButtons.push(tabBtn);
      sidebar.appendChild(tabBtn);
    });


    paneAppearance.classList.add('active');


    main.appendChild(sidebar);
    main.appendChild(content);


    // 3. Footer
    const footer = document.createElement('div');
    footer.className = 'gist-qatp-modal-footer';


    const btnResetPos = document.createElement('button');
    btnResetPos.className = 'gist-qatp-btn gist-qatp-btn-secondary';
    btnResetPos.textContent = '🪞 重置所有浮動位置';
    btnResetPos.addEventListener('click', () => {
      resetToolbarPosition();
      resetBoardPosition();
      resetOrbPosition();
      showToast('工具列、看板與手柄位置已全數歸位', 'success');
    });


    const btnSave = document.createElement('button');
    btnSave.className = 'gist-qatp-btn gist-qatp-btn-primary';
    btnSave.textContent = '💾 儲存設定';
    btnSave.addEventListener('click', () => {
      const parsedKeywords = inputKeywords.value
        .split(/[\r\n,]+/)
        .map((k) => k.trim())
        .filter(Boolean);


      const nextSlots = slotInputs.map((s) => ({
        account: s.accountEl.value.trim(),
        token: s.tokenEl.value.trim()
      }));


      const nextConfig = {
        layoutMode: selectLayout.value,
        orbSide: selectSide.value,
        showFileBoard: cbBoard.checked,
        fileBoardMaxWidth: parseInt(inputBoardWidth.value, 10) || 380,
        buttonFontSize: parseInt(inputFs.value, 10) || 15,
        buttonVisibility: {
          smart: visSmart.checkbox.checked,
          handoff: visHandoff.checkbox.checked,
          saveCopy: visSaveCopy.checkbox.checked,
          relayClaude: visRelayClaude.checkbox.checked,
          extractOnly: visExtract.checkbox.checked
        },
        codeNamingMode: selectNamingMode.value,
        customCodeFileName: inputCustomName.value.trim() || 'code',
        qatpFileName: inputQatpFile.value.trim() || 'QATP.md',
        defaultFileName: inputHandoffFile.value.trim() || 'note',
        autoNewGistOnFinished: cbArchivedNew.checked,
        autoSubmitDualReady: cbAutoSubmit.checked,
        enableMiddleClick: cbMiddleClick.checked,
        smartAssemblyHotkey: inputHotkey.value.trim() || 'F4',
        codeRegex: inputCodeRegex.value.trim() || DEFAULT_CONFIG_V2_1_1.codeRegex,
        qatpPrimaryToken: inputQatpPrimary.value.trim() || DEFAULT_CONFIG_V2_1_1.qatpPrimaryToken,
        qatpSecondaryPattern: inputQatpSecondary.value.trim() || DEFAULT_CONFIG_V2_1_1.qatpSecondaryPattern,
        qatpRegex: currentConfig.qatpRegex || DEFAULT_CONFIG_V2_1_1.qatpRegex,
        filterRegex: inputFilterRegex.value.trim() || DEFAULT_CONFIG_V2_1_1.filterRegex,
        noteKeywords: parsedKeywords.length > 0 ? parsedKeywords : DEFAULT_CONFIG_V2_1_1.noteKeywords,
        jsonSyncUrl: inputSyncUrl.value.trim() || DEFAULT_CONFIG_V2_1_1.jsonSyncUrl,
        cloudEndpointPrimary: inputCloudPrimary.value.trim() || DEFAULT_CONFIG_V2_1_1.cloudEndpointPrimary,
        cloudEndpointSecondary: inputCloudSecondary.value.trim() || DEFAULT_CONFIG_V2_1_1.cloudEndpointSecondary,
        cloudKeyword: inputCloudKw.value.trim() || DEFAULT_CONFIG_V2_1_1.cloudKeyword,
        relayRepoName: inputRelayRepo.value.trim() || 'qatp-relay',
        relayRepoBranch: inputRelayBranch.value.trim() || 'main',
        relaySlots: nextSlots
      };


      if (!safeFileRegex.test(nextConfig.defaultFileName) || !safeFileRegex.test(nextConfig.customCodeFileName) || !safeFileRegex.test(nextConfig.qatpFileName) || !safeFileRegex.test(nextConfig.relayRepoName)) {
        showToast('檔名或倉庫名格式不正確，僅支援英數、底線、破折號與點 (嚴禁全點號)', 'danger');
        return;
      }


      if (!/^[a-zA-Z0-9_\-\.\/]+$/.test(nextConfig.relayRepoBranch)) {
        showToast('分支名稱格式不正確，僅支援英數、底線、破折號、點與斜線', 'danger');
        return;
      }


      saveConfig(nextConfig);
      injectStyles();


      const existingToolbar = document.getElementById('gist-qatp-toolbar');
      if (existingToolbar) existingToolbar.remove();
      mountToolbar();


      const existingBoard = document.getElementById('gist-qatp-file-board');
      if (existingBoard) existingBoard.remove();
      updateFileBoard();


      // P3-06: 換邊記憶百分比，樣式防殘影
      const orb = document.getElementById('gist-qatp-dock-orb');
      if (orb) {
        let currentPos = null;
        try {
          currentPos = GM_getValue(STORAGE_ORB_KEY, null);
        } catch (e) {}
        const topPct = currentPos && typeof currentPos.topPercent === 'number' ? currentPos.topPercent : DEFAULT_ORB_POSITION.topPercent;
        const updatedOrbPos = { side: nextConfig.orbSide, topPercent: topPct };
        try {
          GM_setValue(STORAGE_ORB_KEY, updatedOrbPos);
        } catch (e) {}
        applyOrbPosition(orb, updatedOrbPos);
      }


      document.body.removeChild(overlay);
      showToast('⚙️ 設定已成功儲存並生效！', 'success');
    });


    footer.appendChild(btnResetPos);
    footer.appendChild(btnSave);


    modal.appendChild(header);
    modal.appendChild(main);
    modal.appendChild(footer);
    overlay.appendChild(modal);


    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) document.body.removeChild(overlay);
    });


    document.body.appendChild(overlay);
  }


  // ==========================================
  // 位置管理與動態視窗出界防呆 (VIEWPORT_MARGIN = 8)
  // ==========================================
  function applyPosition(elem, pos, fallback) {
    if (!elem) return;
    const margin = VIEWPORT_MARGIN;
    const winWidth = window.innerWidth;
    const winHeight = window.innerHeight;
    const elWidth = elem.offsetWidth || 220;
    const elHeight = elem.offsetHeight || 100;


    let targetLeft, targetTop;


    if (pos && typeof pos.left === 'number' && typeof pos.top === 'number') {
      targetLeft = Math.max(margin, Math.min(pos.left, winWidth - elWidth - margin));
      targetTop = Math.max(margin, Math.min(pos.top, winHeight - elHeight - margin));
    } else {
      targetLeft = Math.max(margin, winWidth - elWidth - (fallback ? fallback.right : 24));
      targetTop = fallback ? fallback.top : 72;
    }


    elem.style.left = `${targetLeft}px`;
    elem.style.top = `${targetTop}px`;
    elem.style.right = 'auto';
    elem.style.bottom = 'auto';
  }


  function applyBoardPosition(board, pos) {
    applyPosition(board, pos, DEFAULT_BOARD_POSITION);
  }


  function resetToolbarPosition() {
    try {
      GM_deleteValue(STORAGE_POS_KEY);
    } catch (e) {}


    const toolbar = document.getElementById('gist-qatp-toolbar');
    if (toolbar) {
      applyPosition(toolbar, null, DEFAULT_POSITION);
    }
  }


  function resetBoardPosition() {
    try {
      GM_deleteValue(STORAGE_BOARD_POS_KEY);
    } catch (e) {}


    const board = document.getElementById('gist-qatp-file-board');
    if (board) {
      applyBoardPosition(board, null);
    }
  }


  function applyOrbPosition(orb, pos) {
    const config = loadConfig();
    const side = (pos && (pos.side === 'left' || pos.side === 'right')) ? pos.side : config.orbSide;
    const topPercent = (pos && typeof pos.topPercent === 'number') ? Math.max(5, Math.min(95, pos.topPercent)) : DEFAULT_ORB_POSITION.topPercent;


    orb.className = side === 'left' ? 'gist-qatp-dock-left' : 'gist-qatp-dock-right';
    orb.style.top = `${topPercent}%`;
  }


  function resetOrbPosition() {
    try {
      GM_deleteValue(STORAGE_ORB_KEY);
    } catch (e) {}


    const orb = document.getElementById('gist-qatp-dock-orb');
    if (orb) {
      applyOrbPosition(orb, null);
    }
  }


  // ==========================================
  // 框體拖曳邏輯通用綁定 (INV-06 Resize 單例化加固)
  // P3-08: 滑鼠移出視窗失焦防禦
  // ==========================================
  function bindElementDrag(elem, storageKey) {
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let initialLeft = 0;
    let initialTop = 0;


    const onMouseMove = (e) => {
      if (!isDragging) return;
      e.preventDefault();


      const dx = e.clientX - startX;
      const dy = e.clientY - startY;


      const elWidth = elem.offsetWidth;
      const elHeight = elem.offsetHeight;
      const margin = VIEWPORT_MARGIN;


      const newLeft = Math.max(margin, Math.min(initialLeft + dx, window.innerWidth - elWidth - margin));
      const newTop = Math.max(margin, Math.min(initialTop + dy, window.innerHeight - elHeight - margin));


      elem.style.left = `${newLeft}px`;
      elem.style.top = `${newTop}px`;
      elem.style.right = 'auto';
      elem.style.bottom = 'auto';
    };


    const onMouseUp = () => {
      if (!isDragging) return;
      isDragging = false;


      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);


      const currentPos = {
        left: parseInt(elem.style.left, 10),
        top: parseInt(elem.style.top, 10)
      };


      try {
        GM_setValue(storageKey, currentPos);
      } catch (e) {
        console.warn('[QATP] 無法保存元素位置', e);
      }
    };


    elem.addEventListener('mousedown', (e) => {
      if (e.target.closest('button, input, select, textarea, a, label')) {
        return;
      }


      if (e.button !== 0) return;
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;


      const rect = elem.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;


      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);


      // P3-08: 視窗失焦或移出視窗邊緣時自動釋放拖曳
      window.addEventListener('blur', onMouseUp, { once: true });
      document.addEventListener('mouseleave', onMouseUp, { once: true });
    });


    if (!window._qatpResizeAttached) {
      window._qatpResizeAttached = true;
      window.addEventListener('resize', () => {
        const toolbar = document.getElementById('gist-qatp-toolbar');
        if (toolbar) {
          const rect = toolbar.getBoundingClientRect();
          applyPosition(toolbar, { left: rect.left, top: rect.top }, DEFAULT_POSITION);
        }
        const board = document.getElementById('gist-qatp-file-board');
        if (board) {
          const rect = board.getBoundingClientRect();
          applyBoardPosition(board, { left: rect.left, top: rect.top });
        }
      });
    }
  }


  function bindToolbarDrag(toolbar) {
    bindElementDrag(toolbar, STORAGE_POS_KEY);
  }


  function bindBoardDrag(board) {
    bindElementDrag(board, STORAGE_BOARD_POS_KEY);
  }


  // ==========================================
  // 側邊吸附手柄與手勢引擎
  // ==========================================
  function mountDockOrb() {
    if (document.getElementById('gist-qatp-dock-orb')) return;


    const orb = document.createElement('div');
    orb.id = 'gist-qatp-dock-orb';
    orb.title = '點擊：開啟設定 ｜ 垂直拖動：滑動 ｜ 向內滑：一鍵智能裝配';


    const icon = document.createElement('span');
    icon.className = 'gist-qatp-dock-icon';
    icon.textContent = '📑';
    orb.appendChild(icon);


    let savedPos = null;
    try {
      savedPos = GM_getValue(STORAGE_ORB_KEY, null);
    } catch (e) {}


    applyOrbPosition(orb, savedPos);
    document.body.appendChild(orb);


    let isInteracting = false;
    let startX = 0;
    let startY = 0;
    let startTime = 0;


    const onMouseMove = (e) => {
      if (!isInteracting) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;


      const newTopPx = Math.max(20, Math.min(window.innerHeight - 50, e.clientY - 19));
      orb.style.top = `${newTopPx}px`;


      const isLeft = orb.classList.contains('gist-qatp-dock-left');
      const isInward = isLeft ? dx > 50 : dx < -50;


      if (Math.abs(dx) > 50 && isInward) {
        isInteracting = false;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        showToast('⚡ 偵測到向內滑動手勢，正在發起智能裝配...', 'success', 1500);
        runSmartAssemblyPipeline();
      }
    };


    const onMouseUp = (e) => {
      if (!isInteracting) return;
      isInteracting = false;


      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);


      const dist = Math.hypot(e.clientX - startX, e.clientY - startY);
      const elapsed = Date.now() - startTime;


      if (dist < 5 && elapsed < 250) {
        openConfigModal();
        return;
      }


      const finalSide = e.clientX < window.innerWidth / 2 ? 'left' : 'right';
      const topPercent = Math.round((parseInt(orb.style.top, 10) / window.innerHeight) * 100);


      const newPos = { side: finalSide, topPercent };
      applyOrbPosition(orb, newPos);


      try {
        GM_setValue(STORAGE_ORB_KEY, newPos);
      } catch (err) {
        console.warn('[QATP] 無法保存吸附手柄位置', err);
      }
    };


    orb.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      isInteracting = true;
      startX = e.clientX;
      startY = e.clientY;
      startTime = Date.now();


      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);


      window.addEventListener('blur', onMouseUp, { once: true });
      document.addEventListener('mouseleave', onMouseUp, { once: true });
    });
  }


  // ==========================================
  // 工具列渲染與掛載 (實體 A / 按鈕顯隱過濾 / 頂部雙層自適應膠囊佈局)
  // ==========================================
  function mountToolbar() {
    let toolbar = document.getElementById('gist-qatp-toolbar');


    if (!toolbar) {
      const config = loadConfig();


      toolbar = document.createElement('div');
      toolbar.id = 'gist-qatp-toolbar';


      const topBar = document.createElement('div');
      topBar.className = 'gist-qatp-topbar';


      const topbarRow1 = document.createElement('div');
      topbarRow1.className = 'gist-qatp-topbar-row1';


      const brandTitle = document.createElement('span');
      brandTitle.className = 'gist-qatp-title-brand';
      brandTitle.textContent = '⚡ Gist QATP';


      const btnGear = document.createElement('button');
      btnGear.className = 'gist-qatp-btn-gear';
      btnGear.textContent = '⚙️';
      btnGear.title = '打開設定管理器';
      btnGear.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openConfigModal();
      });


      topbarRow1.appendChild(brandTitle);
      topbarRow1.appendChild(btnGear);
      topBar.appendChild(topbarRow1);


      const topbarRow2 = document.createElement('div');
      topbarRow2.className = 'gist-qatp-topbar-row2';


      const pillForceNew = document.createElement('label');
      pillForceNew.className = 'gist-qatp-pill-label';
      pillForceNew.title = '強制換新 Gist (勾選後點擊裝配將直接另開全新 Gist，生效一次後自動取消)';


      const cbForceNew = document.createElement('input');
      cbForceNew.type = 'checkbox';
      cbForceNew.id = 'gist-qatp-force-new-cb';
      cbForceNew.className = 'gist-qatp-pill-cb cb-green';


      const txtForceNew = document.createElement('span');
      txtForceNew.className = 'gist-qatp-pill-text';
      txtForceNew.textContent = '開新Gist';


      pillForceNew.appendChild(cbForceNew);
      pillForceNew.appendChild(txtForceNew);


      const pillMiddleClick = document.createElement('label');
      pillMiddleClick.className = 'gist-qatp-pill-label';
      pillMiddleClick.title = '滑鼠中鍵智能裝配 (點擊空白處或檔案卡片直接裝配)';


      const cbMiddleClick = document.createElement('input');
      cbMiddleClick.type = 'checkbox';
      cbMiddleClick.id = 'gist-qatp-middle-click-cb';
      cbMiddleClick.className = 'gist-qatp-pill-cb cb-blue';
      cbMiddleClick.checked = !!config.enableMiddleClick;
      cbMiddleClick.addEventListener('change', () => {
        const latestConfig = loadConfig();
        latestConfig.enableMiddleClick = cbMiddleClick.checked;
        saveConfig(latestConfig);
        showToast(latestConfig.enableMiddleClick ? '🖱️ 已啟用滑鼠中鍵智能裝配' : '🖱️ 已停用滑鼠中鍵智能裝配', 'info', 1500);
      });


      const txtMiddleClick = document.createElement('span');
      txtMiddleClick.className = 'gist-qatp-pill-text';
      txtMiddleClick.textContent = '接管中鍵';


      pillMiddleClick.appendChild(cbMiddleClick);
      pillMiddleClick.appendChild(txtMiddleClick);


      topbarRow2.appendChild(pillForceNew);
      topbarRow2.appendChild(pillMiddleClick);
      topBar.appendChild(topbarRow2);


      toolbar.appendChild(topBar);


      const btnContainer = document.createElement('div');
      btnContainer.className = `gist-qatp-button-container gist-qatp-layout-${config.layoutMode}`;


      // 按鈕 1: ⚡ 智能裝配
      const btnSmart = document.createElement('button');
      btnSmart.className = 'gist-qatp-btn gist-qatp-btn-smart';
      btnSmart.textContent = '⚡ 智能裝配';
      btnSmart.title = '首動預建雙槽位，多語言特徵探針智能吃單';
      if (config.buttonVisibility && !config.buttonVisibility.smart) {
        btnSmart.style.display = 'none';
      }
      btnSmart.addEventListener('click', (e) => {
        e.preventDefault();
        runSmartAssemblyPipeline();
      });


      // 按鈕 2: 📝 一鍵加交接檔
      const btnHandoff = document.createElement('button');
      btnHandoff.className = 'gist-qatp-btn gist-qatp-btn-warm';
      btnHandoff.textContent = '📝 一鍵加交接檔';
      btnHandoff.title = '讀取剪貼簿，正則檢核前三行後自動追加檔案並儲存';
      if (config.buttonVisibility && !config.buttonVisibility.handoff) {
        btnHandoff.style.display = 'none';
      }
      btnHandoff.addEventListener('click', (e) => {
        e.preventDefault();
        startHandoffProcess();
      });


      // 按鈕 3: 🚀 儲存並複製 QATP
      const btnSave = document.createElement('button');
      btnSave.className = 'gist-qatp-btn gist-qatp-btn-primary';
      btnSave.textContent = '🚀 儲存並複製 QATP';
      btnSave.title = '提交保存當前 Gist，跳轉後自動複製提示詞';
      if (config.buttonVisibility && !config.buttonVisibility.saveCopy) {
        btnSave.style.display = 'none';
      }
      btnSave.addEventListener('click', (e) => {
        e.preventDefault();
        triggerSaveAction(true);
      });


      // 按鈕 4: 🌐 投送 Claude (Repo)
      const btnRelay = document.createElement('button');
      btnRelay.className = 'gist-qatp-btn gist-qatp-btn-emerald';
      btnRelay.textContent = '🌐 投送 Claude (Repo)';
      btnRelay.title = '跨倉鏡像至 GitHub Relay 倉庫並複製 Claude 沙盒引導指令';
      if (config.buttonVisibility && !config.buttonVisibility.relayClaude) {
        btnRelay.style.display = 'none';
      }
      btnRelay.addEventListener('click', (e) => {
        e.preventDefault();
        mirrorToGitHubRelay();
      });


      // 按鈕 5: 📋 僅提取 QATP
      const btnExtract = document.createElement('button');
      btnExtract.className = 'gist-qatp-btn gist-qatp-btn-secondary';
      btnExtract.textContent = '📋 僅提取 QATP';
      btnExtract.title = '直接提取當前 Gist 網址並組裝複製提示詞';
      if (config.buttonVisibility && !config.buttonVisibility.extractOnly) {
        btnExtract.style.display = 'none';
      }
      btnExtract.addEventListener('click', (e) => {
        e.preventDefault();
        runExtractAndCopyPipeline();
      });


      btnContainer.appendChild(btnSmart);
      btnContainer.appendChild(btnHandoff);
      btnContainer.appendChild(btnSave);
      btnContainer.appendChild(btnRelay);
      btnContainer.appendChild(btnExtract);
      toolbar.appendChild(btnContainer);


      document.body.appendChild(toolbar);


      let savedPos = null;
      try {
        savedPos = GM_getValue(STORAGE_POS_KEY, null);
      } catch (e) {}


      applyPosition(toolbar, savedPos, DEFAULT_POSITION);
      bindToolbarDrag(toolbar);
    }


    updateFileBoard();
  }


  // ==========================================
  // 跨頁換頁哨兵監聽器 (加固延遲 600ms / 容器探針 / 剪貼簿防污染)
  // AC-2, AC-3: 中繼投送哨兵喚醒
  // ==========================================
  function checkSessionGuards() {
    // 哨兵 0: 跨倉中繼投送哨兵 (最高優先級，編輯態 ➔ 檢視態自動投送)
    let pendingRelay = null;
    try {
      pendingRelay = sessionStorage.getItem(SESSION_KEY_RELAY);
    } catch (e) {}


    if (pendingRelay === '1' && !isEditPage() && !isNewPage()) {
      const currentHref = window.location.href.split('#')[0].split('?')[0];
      const gistRegex = /^https:\/\/gist\.github\.com\/[^\/\s]+\/[a-f0-9]+$/;
      if (gistRegex.test(currentHref)) {
        try {
          sessionStorage.removeItem(SESSION_KEY_RELAY);
        } catch (e) {}


        setTimeout(() => {
          mirrorToGitHubRelay();
        }, 300);
        return;
      }
    }


    // 哨兵 1: 跨頁智能裝配流程 (非編輯態 ➔ 編輯/新建態)
    let pendingSmart = null;
    try {
      pendingSmart = sessionStorage.getItem(SESSION_KEY_SMART);
    } catch (e) {}


    if (pendingSmart === '1' && isEditorEnvironment()) {
      try {
        sessionStorage.removeItem(SESSION_KEY_SMART);
      } catch (e) {}
      setTimeout(() => {
        runSmartAssemblyPipeline();
      }, 400);
      return;
    }


    // 哨兵 2: 跨頁加檔流水線 (檢視態 ➔ 編輯態)
    let pendingHandoff = null;
    try {
      pendingHandoff = sessionStorage.getItem(SESSION_KEY_HANDOFF);
    } catch (e) {}


    if (pendingHandoff === '1' && isEditPage()) {
      try {
        sessionStorage.removeItem(SESSION_KEY_HANDOFF);
      } catch (e) {}


      setTimeout(() => {
        const startTime = Date.now();
        const probeTimer = setInterval(() => {
          const files = document.querySelectorAll('.js-gist-file');
          if (files.length > 0) {
            clearInterval(probeTimer);
            executeHandoffPipeline();
          } else if (Date.now() - startTime > 3000) {
            clearInterval(probeTimer);
            executeHandoffPipeline();
          }
        }, 100);
      }, 600);
      return;
    }


    // 哨兵 3: 既有 QATP 複製哨兵 (編輯態 ➔ 檢視態)
    let pendingQatp = null;
    try {
      pendingQatp = sessionStorage.getItem(SESSION_KEY_QATP);
    } catch (e) {}


    if (pendingQatp === '1' && !isEditPage() && !isNewPage()) {
      const currentHref = window.location.href.split('#')[0].split('?')[0];
      const gistRegex = /^https:\/\/gist\.github\.com\/[^\/\s]+\/[a-f0-9]+$/;
      if (gistRegex.test(currentHref)) {
        try {
          sessionStorage.removeItem(SESSION_KEY_QATP);
        } catch (e) {}


        setTimeout(() => {
          runExtractAndCopyPipeline();
        }, 300);
      }
    }
  }


  // ==========================================
  // 油猴選單註冊
  // ==========================================
  if (typeof GM_registerMenuCommand === 'function') {
    GM_registerMenuCommand('⚡ 執行智能裝配', () => {
      runSmartAssemblyPipeline();
    });
    GM_registerMenuCommand('🌐 投送 Claude (Repo)', () => {
      mirrorToGitHubRelay();
    });
    GM_registerMenuCommand('⚙️ 打開設定管理器', () => {
      openConfigModal();
    });
    GM_registerMenuCommand('🪞 一鍵重置所有懸浮位置', () => {
      resetToolbarPosition();
      resetBoardPosition();
      resetOrbPosition();
      showToast('所有介面位置已重置歸位', 'success');
    });
  }


  // ==========================================
  // 初始化與 Turbo / PJAX 掛載 (P3-11: 子模組隔離執行)
  // ==========================================
  function safeExec(fn, moduleName) {
    try {
      fn();
    } catch (err) {
      console.error(`[QATP Init Error] ${moduleName} 載入失敗:`, err);
    }
  }


  function init() {
    safeExec(injectStyles, 'injectStyles');
    safeExec(mountToolbar, 'mountToolbar');
    safeExec(mountDockOrb, 'mountDockOrb');
    safeExec(setupMiddleClickDispatcher, 'setupMiddleClickDispatcher');
    safeExec(setupKeyboardDispatcher, 'setupKeyboardDispatcher');
    safeExec(checkSessionGuards, 'checkSessionGuards');
  }


  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }


  document.addEventListener('turbo:load', init);
  document.addEventListener('pjax:end', init);
})();
// ==UserScript==
// @name         AI 雙模式乾淨複製器
// @namespace    https://github.com/
// @version      4.3.4
// @description  精準過濾 AI 思考過程與工具欄雜訊，一鍵複製 Markdown。支援 ChatGPT、Claude、DeepSeek、通義千問、Kimi、Google AI Studio、智譜 AI、Mistral AI Playground、Perplexity AI、Z.AI 及 MiniMax Agent 旗艦 11 合 1。v4.3.4 實裝 Claude 雙軌 Artifacts 抽屜擴充、資料生命週期對稱治理與動態水合煞車。
// @author       Frontend Integration Engineering Team
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @match        https://claude.ai/*
// @match        https://chat.deepseek.com/*
// @match        https://chat.qwen.ai/*
// @match        https://tongyi.aliyun.com/*
// @match        https://kimi.ai/*
// @match        https://*.kimi.ai/*
// @match        https://kimi.moonshot.cn/*
// @match        https://*.moonshot.cn/*
// @match        https://www.kimi.com/chat/*
// @match        https://aistudio.google.com/*
// @match        https://chatglm.cn/*
// @match        https://*.bigmodel.cn/*
// @match        https://console.mistral.ai/*
// @match        https://www.perplexity.ai/*
// @match        https://perplexity.ai/*
// @match        https://chat.z.ai/*
// @match        https://agent.minimax.io/*
// @match        https://*.minimax.io/*
// @grant        GM_setClipboard
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @icon         https://pic.imgdd.cc/i/034KFA32qXGmXFBp3GGyNP.png
// @connect      docs.google.com
// @connect      googleusercontent.com
// @noframes
// @run-at       document-idle
// @license      MIT
// ==/UserScript==


(function () {
    'use strict';


    // ==========================================
    // 0. 全局常數與預設資料結構 (Global Config v4.3.4 定稿)
    // ==========================================
    const CONFIG_KEY = 'ai_copy_global_config_v3';
    const QA_QUEUE_KEY = 'ai_copy_qa_queue_v1';
    const UI_CONTAINER_ID = 'ai-universal-copy-container';
    const FLOATING_ORB_ID = 'ai-copy-floating-orb';
    const MODAL_OVERLAY_ID = 'ai-copy-modal-overlay';


    const ALL_SITE_DEFS = {
        aistudio:   { id: 'aistudio',   label: 'Gemini' },
        deepseek:   { id: 'deepseek',   label: 'DeepSeek' },
        qwen:       { id: 'qwen',       label: '千問' },
        kimi:       { id: 'kimi',       label: 'Kimi' },
        chatgpt:    { id: 'chatgpt',    label: 'ChatGPT' },
        claude:     { id: 'claude',     label: 'Claude' },
        perplexity: { id: 'perplexity', label: 'Perplexity' },
        zhipu:      { id: 'zhipu',      label: '智譜' },
        zai:        { id: 'zai',        label: 'Z.AI' },
        mistral:    { id: 'mistral',    label: 'Mistral' },
        minimax:    { id: 'minimax',    label: 'MiniMax' }
    };


    const DEFAULT_CONFIG = {
        activeProfileId: 'profile_1',
        uiPosition: null,   // 主卡片螢幕座標 { left, top }
        orbPosition: null,  // 小光球螢幕座標 { left, top }
        toastPosition: null,// Toast 獨立本機座標 { left, top }
        isCollapsed: false, // 是否處於小光球收納狀態
        siteTabOrder: ['aistudio', 'deepseek', 'qwen', 'kimi', 'chatgpt', 'claude', 'perplexity', 'zhipu', 'zai', 'mistral', 'minimax'],
        jsonSyncUrl: 'https://docs.google.com/document/d/1csaLbqi49GJhWLutrhkMdTwy4eOuXgmK29zS6arHCTI/edit?usp=sharing',
        exportScope: {
            content: true,
            coords: false,
            layout: false
        },
        toastSettings: {
            fontSize: 18,
            background: 'linear-gradient(135deg, rgba(88, 28, 135, 0.95), rgba(124, 58, 237, 0.92))'
        },
        qaQueueSettings: {
            captureHotkey: 'F4',
            summaryHotkey: 'F7',
            ttlHours: 2,
            targetCount: 6,               // 滿額站點數閾值 (0 為停用)
            keepQueueOnAutoSummary: true, // 滿額自動總結後是否保留佇列 (滾動更新模式)
            siteActions: {
                aistudio: 'SINGLE',
                deepseek: 'SINGLE',
                qwen: 'SINGLE',
                kimi: 'SINGLE',
                chatgpt: 'SINGLE',
                claude: 'SINGLE',
                perplexity: 'SINGLE',
                zhipu: 'SINGLE',
                zai: 'PREVIEW',
                mistral: 'SINGLE',
                minimax: 'PREVIEW'
            }
        },
        noiseSettings: {
            pipelineOrder: 'string_first',
            customNoiseStrings:
                '# 每行一條免轉義純字串，精確消除 (支援 # 註解)\n' +
                '\n' +
                '\n' +
                '\n' +
                '\n',
            customNoiseRegexes:
                '# 每行一條正則表達式 (/pattern/flags)\n' +
                '/[^\\n]*尖峰時段使用量較高[，,][^\\n]*(?:升級即可使用|思考|快速|請稍後再試)[^\\n]*\\n?/gi\n' +
                '/[^\\n]*(?:當前使用人數較多|当前使用人数较多|高峰時段使用量較高|高峰期使用量較高)[，,][^\\n]*\\n?/gi\n' +
                '/(?:試算表|表格)\\s*(?:複製|复制|下载|下載)/gi\n'
        },
        uiSettings: {
            showCleanSingle: true,
            showFullThread: true,
            purplePosition: 'bottom'
        },
        aiStudioSettings: {
            primaryEngine: 'native_menu',
            sliceLayout: 'staircase',
            purplePosition: 'inherit',
            wheelSwitchScope: 'capsule_only', // 'capsule_only' | 'control_group' | 'entire_toolbar'
            activeModuleId: 'module_1',
            fallbackAction: 'warn_block',     // 'warn_block' | 'lenient_full' | 'custom_string'
            fallbackCustomText: '[ERROR: 錨點切片未命中]',
            modules: {
                module_1: {
                    id: 'module_1',
                    name: '專案發包組',
                    badgeText: '發包',
                    badgeColor: '#1E88E5',
                    buttons: [
                        {
                            id: 'm1_btn_1',
                            name: '✂️ 截取 QATP',
                            mode: 'match',
                            enabled: true,
                            pattern: '/(?:##?\\s*【?貳[、\\s]+QA\\s*測試驗證任務書[\\s\\S]*)$/i',
                            fallbackPattern: '/(?:##?\\s*.*(?:QA|測試驗證任務書)[\\s\\S]*)$/i',
                            replaceValue: '',
                            isCodeBlockTarget: false,
                            prefix: 'https://docs.google.com/document/d/1TDprIAm5WMbVc0k6Nv-DmS89RVOnx1BRYM13EcqjNSQ/edit?usp=sharing',
                            suffix: '',
                            autoDivider: true
                        },
                        {
                            id: 'm1_btn_2',
                            name: '📑 截取純 PRD',
                            mode: 'match',
                            enabled: true,
                            pattern: '/(#\\s*📑[\\s\\S]*?)(?:\\n=== 複製結束線|\\n=== TARGET_CODE_START ===|$)/i',
                            fallbackPattern: '/((?:#\\s*【?PRD|##?\\s*模組一)[\\s\\S]*?)(?:\\n=== 複製結束線|\\n=== TARGET_CODE_START ===|$)/i',
                            replaceValue: '',
                            isCodeBlockTarget: false,
                            prefix: '',
                            suffix: '',
                            autoDivider: false
                        },
                        {
                            id: 'm1_btn_3',
                            name: '📝 截取迭代需求',
                            mode: 'match',
                            enabled: true,
                            pattern: '/<<< BACKLOG_START >>>[^\\S\\r\\n]*\\r?\\n?([\\s\\S]*?)\\r?\\n?[^\\S\\r\\n]*<<< BACKLOG_END >>>/i',
                            fallbackPattern: '/(?:^|\\n)[ \\t]*(?:>+[ \\t]*)?(#{1,4}\\s*.*?(?:PM\\s*迭代|未來需求|Backlog\\s*Notes)[\\s\\S]*?)(?=\\r?\\n[ \\t]*(?:---[ \\t]*\\r?\\n|#{1,2}\\s+[^#\\n]|===|<<<)|$)/i',
                            replaceValue: '',
                            isCodeBlockTarget: false,
                            prefix: '',
                            suffix: '\n\n',
                            autoDivider: false
                        },
                        {
                            id: 'm1_btn_4',
                            name: '📦 截取開工全包',
                            mode: 'match',
                            enabled: true,
                            pattern: '/(=== 複製起始線[\\s\\S]*?=== 複製結束線 ===)/i',
                            fallbackPattern: '/(=== 複製起始線[\\s\\S]*?=== 複製結束線)/i',
                            replaceValue: '',
                            isCodeBlockTarget: false,
                            prefix: '',
                            suffix: '',
                            autoDivider: false
                        },
                        {
                            id: 'm1_btn_5',
                            name: '💻 截取生產代碼',
                            mode: 'match',
                            enabled: true,
                            pattern: '/```(?:javascript|js|typescript|ts|python|py|ini|autohotkey|ahk2)?[^\\S\\r\\n]*[^\\r\\n]*\\r?\\n([\\s\\S]*)\\r?\\n```/i',
                            fallbackPattern: '/```([\\s\\S]*)```/i',
                            replaceValue: '',
                            isCodeBlockTarget: true,
                            prefix: '',
                            suffix: '',
                            autoDivider: false
                        }
                    ]
                },
                module_2: {
                    id: 'module_2',
                    name: '代碼測試組',
                    badgeText: '代碼',
                    badgeColor: '#43A047',
                    buttons: [
                        { id: 'm2_btn_1', name: '📜 截取交接檔', mode: 'match', enabled: true, pattern: '/((?:#\\s*📜|#\\s*【|#\\s*《)[^#\\n]*交接[\\s\\S]*)$/i', fallbackPattern: '', replaceValue: '', isCodeBlockTarget: false, prefix: '', suffix: '', autoDivider: false },
                        { id: 'm2_btn_2', name: '🧪 截取測試例句', mode: 'match', enabled: true, pattern: '/(?:##?\\s*【?[第二三].*測試[\\s\\S]*?)(?:\\n##?|=== 字典全檔|$)/i', fallbackPattern: '', replaceValue: '', isCodeBlockTarget: false, prefix: '', suffix: '', autoDivider: false },
                        { id: 'm2_btn_3', name: '🔍 截取審查報告', mode: 'match', enabled: true, pattern: '/(?:##?\\s*【?[第一].*報告[\\s\\S]*?)(?:\\n##?|=== 以下為|$)/i', fallbackPattern: '', replaceValue: '', isCodeBlockTarget: false, prefix: '', suffix: '', autoDivider: false },
                        { id: 'm2_btn_4', name: '🧹 挖除思考過程', mode: 'replace', enabled: true, pattern: '/<think>[\\s\\S]*?<\\/think>\\r?\\n?/gi', fallbackPattern: '', replaceValue: '', isCodeBlockTarget: false, prefix: '', suffix: '', autoDivider: false },
                        { id: 'm2_btn_5', name: '💻 截取純 JS/TS', mode: 'match', enabled: true, pattern: '/(?:\\/\\/\\s*==UserScript==[\\s\\S]*?\\n\\s*\\(\\)\\s*;\\s*)/i', fallbackPattern: '', replaceValue: '', isCodeBlockTarget: false, prefix: '', suffix: '', autoDivider: false }
                    ]
                },
                module_3: {
                    id: 'module_3',
                    name: '日常備用組',
                    badgeText: '日常',
                    badgeColor: '#FB8C00',
                    buttons: [
                        {
                            id: 'm3_btn_1',
                            name: '📌 建議買進價格',
                            mode: 'match',
                            enabled: true,
                            pattern: '/(?:^|\\n)\\s*📌\\s*(?:\\*\\*)?標的確認[\\s\\S]*$/',
                            fallbackPattern: '',
                            replaceValue: '',
                            isCodeBlockTarget: false,
                            prefix: '',
                            suffix: '',
                            autoDivider: false
                        },
                        {
                            id: 'm3_btn_2',
                            name: '🎯 建議買進價格',
                            mode: 'match',
                            enabled: true,
                            pattern: '/((?:#{1,4}|[*+-])?\\s*🎯\\s*\\*{0,2}第[一1]階[\\s\\S]*)$/',
                            fallbackPattern: '',
                            replaceValue: '',
                            isCodeBlockTarget: false,
                            prefix: '',
                            suffix: '',
                            autoDivider: false
                        },
                        { id: 'm3_btn_3', name: '📌 自訂按鈕 3', mode: 'match', enabled: false, pattern: '', fallbackPattern: '', replaceValue: '', isCodeBlockTarget: false, prefix: '', suffix: '', autoDivider: false },
                        { id: 'm3_btn_4', name: '📌 自訂按鈕 4', mode: 'match', enabled: false, pattern: '', fallbackPattern: '', replaceValue: '', isCodeBlockTarget: false, prefix: '', suffix: '', autoDivider: false },
                        { id: 'm3_btn_5', name: '📌 自訂按鈕 5', mode: 'match', enabled: false, pattern: '', fallbackPattern: '', replaceValue: '', isCodeBlockTarget: false, prefix: '', suffix: '', autoDivider: false }
                    ]
                }
            }
        },
        profiles: {
            profile_1: {
                id: 'profile_1',
                name: '模式 1 (標準 QA)',
                enabled: true,
                enablePrefix: true,
                enableSuffix: true,
                prefixes: {
                    aistudio: '1st',
                    deepseek: '2nd',
                    qwen: '3rd',
                    kimi: '4th',
                    chatgpt: '5th',
                    claude: '5th',
                    perplexity: '5th',
                    zhipu: '6th',
                    zai: '6th',
                    mistral: '7th',
                    minimax: '8th'
                },
                suffixes: {
                    aistudio: '\n\n',
                    deepseek: '\n\n',
                    qwen: '\n\n',
                    kimi: '\n\n',
                    chatgpt: '\n\n',
                    claude: '\n\n',
                    perplexity: '\n\n',
                    zhipu: '\n\n',
                    zai: '\n\n',
                    mistral: '\n\n',
                    minimax: '\n\n'
                }
            },
            profile_2: {
                id: 'profile_2',
                name: '模式 2 (特化標籤)',
                enabled: true,
                enablePrefix: true,
                enableSuffix: true,
                prefixes: {
                    aistudio: 'gemini 3.7回覆',
                    deepseek: '',
                    qwen: '',
                    kimi: '',
                    chatgpt: '',
                    claude: '',
                    perplexity: '',
                    zhipu: '',
                    zai: '',
                    mistral: '',
                    minimax: ''
                },
                suffixes: {
                    aistudio: '\n\n',
                    deepseek: '\n\n',
                    qwen: '\n\n',
                    kimi: '\n\n',
                    chatgpt: '\n\n',
                    claude: '\n\n',
                    perplexity: '\n\n',
                    zhipu: '\n\n',
                    zai: '\n\n',
                    mistral: '\n\n',
                    minimax: '\n\n'
                }
            },
            profile_3: {
                id: 'profile_3',
                name: '模式 3 (自訂預備)',
                enabled: false,
                enablePrefix: true,
                enableSuffix: true,
                prefixes: {
                    aistudio: '',
                    deepseek: '',
                    qwen: '',
                    kimi: '',
                    chatgpt: '',
                    claude: '',
                    perplexity: '',
                    zhipu: '',
                    zai: '',
                    mistral: '',
                    minimax: ''
                },
                suffixes: {
                    aistudio: '\n\n',
                    deepseek: '\n\n',
                    qwen: '\n\n',
                    kimi: '\n\n',
                    chatgpt: '\n\n',
                    claude: '\n\n',
                    perplexity: '\n\n',
                    zhipu: '\n\n',
                    zai: '\n\n',
                    mistral: '\n\n',
                    minimax: '\n\n'
                }
            }
        }
    };


    // 【雙層覆寫隔離演算法 (applyLocalOnlyOverrides)】
    function applyLocalOnlyOverrides(targetConfig, sourceConfig) {
        if (!targetConfig || !sourceConfig) return;
        targetConfig.uiPosition = sourceConfig.uiPosition ?? null;
        targetConfig.orbPosition = sourceConfig.orbPosition ?? null;
        targetConfig.toastPosition = sourceConfig.toastPosition ?? null;
        targetConfig.isCollapsed = Boolean(sourceConfig.isCollapsed);
        if (sourceConfig.aiStudioSettings && targetConfig.aiStudioSettings) {
            targetConfig.aiStudioSettings.sliceLayout = sourceConfig.aiStudioSettings.sliceLayout;
            targetConfig.aiStudioSettings.purplePosition = sourceConfig.aiStudioSettings.purplePosition;
            targetConfig.aiStudioSettings.activeModuleId = sourceConfig.aiStudioSettings.activeModuleId;
        }
    }


    // 【遷移合約與結構深層補齊】
    function sanitizeConfig(data) {
        if (!data || typeof data !== 'object') return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
        if (!data.profiles || typeof data.profiles !== 'object') data.profiles = JSON.parse(JSON.stringify(DEFAULT_CONFIG.profiles));
        if (!data.activeProfileId || !data.profiles[data.activeProfileId]) data.activeProfileId = 'profile_1';


        // 1. 補齊 11 站點排序矩陣
        const defaultSites = ['aistudio', 'deepseek', 'qwen', 'kimi', 'chatgpt', 'claude', 'perplexity', 'zhipu', 'zai', 'mistral', 'minimax'];
        if (!Array.isArray(data.siteTabOrder)) {
            data.siteTabOrder = [...defaultSites];
        } else {
            defaultSites.forEach(s => {
                if (!data.siteTabOrder.includes(s)) data.siteTabOrder.push(s);
            });
        }


        // 2. 補齊雲端同步設定、Toast 座標與收納狀態
        if (typeof data.jsonSyncUrl !== 'string') data.jsonSyncUrl = DEFAULT_CONFIG.jsonSyncUrl;
        if (typeof data.isCollapsed !== 'boolean') data.isCollapsed = false;
        if (typeof data.uiPosition !== 'object') data.uiPosition = null;
        if (typeof data.orbPosition !== 'object') data.orbPosition = null;
        if (typeof data.toastPosition !== 'object') data.toastPosition = null;


        // 補齊 exportScope
        if (!data.exportScope || typeof data.exportScope !== 'object') {
            data.exportScope = JSON.parse(JSON.stringify(DEFAULT_CONFIG.exportScope));
        } else {
            if (typeof data.exportScope.content !== 'boolean') data.exportScope.content = true;
            if (typeof data.exportScope.coords !== 'boolean') data.exportScope.coords = false;
            if (typeof data.exportScope.layout !== 'boolean') data.exportScope.layout = false;
        }


        // 補齊 toastSettings (幽靈欄位 anchor 徹底拔除)
        if (!data.toastSettings || typeof data.toastSettings !== 'object') {
            data.toastSettings = JSON.parse(JSON.stringify(DEFAULT_CONFIG.toastSettings));
        } else {
            const ts = data.toastSettings;
            delete ts.anchor;
            if (typeof ts.fontSize !== 'number' || ts.fontSize <= 0) ts.fontSize = 18;
            if (typeof ts.background !== 'string' || !ts.background.trim()) {
                ts.background = DEFAULT_CONFIG.toastSettings.background;
            }
        }


        // 補齊 qaQueueSettings 暫存池、滿額自動總結與熱鍵設定 (4 態白名單)
        if (!data.qaQueueSettings || typeof data.qaQueueSettings !== 'object') {
            data.qaQueueSettings = JSON.parse(JSON.stringify(DEFAULT_CONFIG.qaQueueSettings));
        } else {
            const qs = data.qaQueueSettings;
            if (typeof qs.captureHotkey !== 'string') qs.captureHotkey = 'F4';
            if (typeof qs.summaryHotkey !== 'string') qs.summaryHotkey = 'F7';
            if (typeof qs.ttlHours !== 'number' || qs.ttlHours < 0) qs.ttlHours = 2;
            if (typeof qs.targetCount !== 'number' || qs.targetCount < 0) qs.targetCount = 6;
            if (typeof qs.keepQueueOnAutoSummary !== 'boolean') qs.keepQueueOnAutoSummary = true;


            const validActions = ['SINGLE', 'SINGLE_CLEAN', 'PREVIEW', 'PREVIEW_CLEAN'];
            if (!qs.siteActions || typeof qs.siteActions !== 'object') {
                qs.siteActions = JSON.parse(JSON.stringify(DEFAULT_CONFIG.qaQueueSettings.siteActions));
            } else {
                defaultSites.forEach(s => {
                    if (!validActions.includes(qs.siteActions[s])) {
                        qs.siteActions[s] = (s === 'minimax' || s === 'zai') ? 'PREVIEW' : 'SINGLE';
                    }
                });
            }
        }


        // 3. 補齊雙軌雜訊清洗引擎
        if (!data.noiseSettings || typeof data.noiseSettings !== 'object') {
            data.noiseSettings = JSON.parse(JSON.stringify(DEFAULT_CONFIG.noiseSettings));
        } else {
            if (!['string_first', 'regex_first'].includes(data.noiseSettings.pipelineOrder)) {
                data.noiseSettings.pipelineOrder = DEFAULT_CONFIG.noiseSettings.pipelineOrder;
            }


            const badRegexPattern = /\/\S*?\.\*\?\[(?:\\n|\n)\]\?\/\S*s\S*|\/\.\*\?\[(?:\\n|\n)\]\?\/gis/;
            if (typeof data.noiseSettings.customNoiseRegexes !== 'string' || !data.noiseSettings.customNoiseRegexes.trim() || badRegexPattern.test(data.noiseSettings.customNoiseRegexes)) {
                data.noiseSettings.customNoiseRegexes = DEFAULT_CONFIG.noiseSettings.customNoiseRegexes;
            } else if (!data.noiseSettings.customNoiseRegexes.includes('請稍後再試')) {
                data.noiseSettings.customNoiseRegexes = data.noiseSettings.customNoiseRegexes.replace(
                    /(?:思考\|快速)/g,
                    '思考|快速|請稍後再試'
                );
            }


            if (typeof data.noiseSettings.customNoiseStrings === 'string') {
                if (data.noiseSettings.customNoiseStrings.includes('K2.6')) {
                    data.noiseSettings.customNoiseStrings = data.noiseSettings.customNoiseStrings
                        .split('\n')
                        .filter(l => !l.includes('K2.6'))
                        .join('\n');
                }
            } else {
                data.noiseSettings.customNoiseStrings = DEFAULT_CONFIG.noiseSettings.customNoiseStrings;
            }


            const nonCommentStrings = (data.noiseSettings.customNoiseStrings || '')
                .split('\n')
                .map(l => l.trim())
                .filter(l => l && !l.startsWith('#') && !l.startsWith('//'));
            if (nonCommentStrings.length === 0) {
                data.noiseSettings.customNoiseStrings = DEFAULT_CONFIG.noiseSettings.customNoiseStrings;
            }
        }


        // 4. 補齊 uiSettings
        if (!data.uiSettings || typeof data.uiSettings !== 'object') {
            data.uiSettings = JSON.parse(JSON.stringify(DEFAULT_CONFIG.uiSettings));
        } else {
            if (typeof data.uiSettings.showCleanSingle !== 'boolean') data.uiSettings.showCleanSingle = true;
            if (typeof data.uiSettings.showFullThread !== 'boolean') data.uiSettings.showFullThread = true;
            if (!['right', 'bottom'].includes(data.uiSettings.purplePosition)) data.uiSettings.purplePosition = 'bottom';
        }


        // 5. 補齊 aiStudioSettings 與 3 模組按鈕
        if (!data.aiStudioSettings || typeof data.aiStudioSettings !== 'object') {
            data.aiStudioSettings = JSON.parse(JSON.stringify(DEFAULT_CONFIG.aiStudioSettings));
        } else {
            const as = data.aiStudioSettings;
            if (!['native_menu', 'pencil_edit', 'dom_parser'].includes(as.primaryEngine)) as.primaryEngine = 'native_menu';
            if (!['grid_3_2', 'staircase', 'single_row'].includes(as.sliceLayout)) as.sliceLayout = 'staircase';
            if (!['right', 'bottom', 'inherit'].includes(as.purplePosition)) as.purplePosition = 'inherit';
            if (!['capsule_only', 'control_group', 'entire_toolbar'].includes(as.wheelSwitchScope)) as.wheelSwitchScope = 'capsule_only';
            if (!['module_1', 'module_2', 'module_3'].includes(as.activeModuleId)) as.activeModuleId = 'module_1';
            if (!['warn_block', 'lenient_full', 'custom_string'].includes(as.fallbackAction)) as.fallbackAction = 'warn_block';
            if (typeof as.fallbackCustomText !== 'string') as.fallbackCustomText = '[ERROR: 錨點切片未命中]';


            if (!as.modules || typeof as.modules !== 'object') {
                as.modules = JSON.parse(JSON.stringify(DEFAULT_CONFIG.aiStudioSettings.modules));
            } else {
                ['module_1', 'module_2', 'module_3'].forEach(mKey => {
                    const defMod = DEFAULT_CONFIG.aiStudioSettings.modules[mKey];
                    if (!as.modules[mKey]) {
                        as.modules[mKey] = JSON.parse(JSON.stringify(defMod));
                    } else {
                        const m = as.modules[mKey];
                        if (typeof m.name !== 'string') m.name = defMod.name;
                        if (typeof m.badgeText !== 'string') m.badgeText = defMod.badgeText;
                        if (typeof m.badgeColor !== 'string') m.badgeColor = defMod.badgeColor;
                        if (!Array.isArray(m.buttons)) {
                            m.buttons = JSON.parse(JSON.stringify(defMod.buttons));
                        } else {
                            defMod.buttons.forEach((defBtn, bIdx) => {
                                if (!m.buttons[bIdx]) {
                                    m.buttons[bIdx] = JSON.parse(JSON.stringify(defBtn));
                                } else {
                                    const b = m.buttons[bIdx];
                                    if (typeof b.name !== 'string') b.name = defBtn.name;
                                    if (!['match', 'replace'].includes(b.mode)) b.mode = defBtn.mode || 'match';
                                    if (typeof b.enabled !== 'boolean') b.enabled = defBtn.enabled;


                                    if (b.id === 'm1_btn_3') {
                                        b.name = defBtn.name;
                                        b.pattern = defBtn.pattern;
                                        b.fallbackPattern = defBtn.fallbackPattern;
                                        b.suffix = '\n\n';
                                    }
                                    if (b.id === 'm1_btn_5') {
                                        if (!b.pattern || b.pattern.includes('*?') || b.pattern.endsWith('/ig')) {
                                            b.pattern = defBtn.pattern;
                                            b.fallbackPattern = defBtn.fallbackPattern;
                                        }
                                    }


                                    if (typeof b.pattern !== 'string') b.pattern = defBtn.pattern;
                                    if (typeof b.fallbackPattern !== 'string') b.fallbackPattern = defBtn.fallbackPattern || '';
                                    if (typeof b.replaceValue !== 'string') b.replaceValue = '';
                                    if (typeof b.isCodeBlockTarget !== 'boolean') b.isCodeBlockTarget = false;
                                    if (typeof b.prefix !== 'string') b.prefix = defBtn.prefix || '';
                                    if (typeof b.suffix !== 'string') b.suffix = defBtn.suffix || '';
                                    if (typeof b.autoDivider !== 'boolean') b.autoDivider = (defBtn.autoDivider === true);


                                    if (b.id === 'm1_btn_1') {
                                        if (typeof b.prefix !== 'string' || b.prefix.trim() === '') {
                                            b.prefix = 'https://docs.google.com/document/d/1TDprIAm5WMbVc0k6Nv-DmS89RVOnx1BRYM13EcqjNSQ/edit?usp=sharing';
                                        }
                                    }
                                }
                            });
                        }
                    }
                });
            }
            delete as.anchorButtons;
        }


        // 6. 補齊 profiles 各站點前綴與後綴
        Object.keys(DEFAULT_CONFIG.profiles).forEach(key => {
            if (!data.profiles[key]) {
                data.profiles[key] = JSON.parse(JSON.stringify(DEFAULT_CONFIG.profiles[key]));
            } else {
                const p = data.profiles[key];
                if (typeof p.enabled !== 'boolean') {
                    p.enabled = DEFAULT_CONFIG.profiles[key]?.enabled ?? true;
                }
                if (typeof p.enablePrefix !== 'boolean') p.enablePrefix = true;
                if (typeof p.enableSuffix !== 'boolean') p.enableSuffix = true;
                if (!p.prefixes || typeof p.prefixes !== 'object') p.prefixes = {};
                if (!p.suffixes || typeof p.suffixes !== 'object') p.suffixes = {};


                defaultSites.forEach(siteKey => {
                    if (typeof p.prefixes[siteKey] === 'undefined') {
                        p.prefixes[siteKey] = DEFAULT_CONFIG.profiles[key].prefixes[siteKey] ?? '';
                    }
                    if (typeof p.suffixes[siteKey] === 'undefined') {
                        p.suffixes[siteKey] = '\n\n';
                    }
                });
            }
        });
        return data;
    }


    const Storage = {
        get() {
            let data = null;
            try {
                if (typeof GM_getValue !== 'undefined') {
                    data = GM_getValue(CONFIG_KEY, null);
                } else {
                    const val = localStorage.getItem(CONFIG_KEY);
                    data = val ? JSON.parse(val) : null;
                }
            } catch (e) {
                console.error('⚠️ [AI Copy] Storage 讀取失敗，恢復預設值:', e);
            }
            return sanitizeConfig(data);
        },
        set(data) {
            try {
                if (typeof GM_setValue !== 'undefined') {
                    GM_setValue(CONFIG_KEY, data);
                } else {
                    localStorage.setItem(CONFIG_KEY, JSON.stringify(data));
                }
            } catch (e) {
                console.error('⚠️ [AI Copy] Storage 寫入失敗:', e);
                showToast('❌ 設定儲存失敗！可能是儲存空間已滿或被隱私模式阻擋。', true, 4000);
            }
        }
    };


    let globalConfig = Storage.get();


    // ==========================================
    // 0.1 跨站點 QA 採集暫存池資料結構與 TTL 防線
    // ==========================================
    function getQaQueue() {
        let raw = null;
        try {
            if (typeof GM_getValue !== 'undefined') {
                raw = GM_getValue(QA_QUEUE_KEY, null);
            } else {
                const val = localStorage.getItem(QA_QUEUE_KEY);
                raw = val ? JSON.parse(val) : null;
            }
        } catch (e) {
            console.error('⚠️ [AI Copy] QA Queue 讀取失敗:', e);
        }


        if (!raw || typeof raw !== 'object' || !raw.items) {
            raw = { lastUpdated: Date.now(), items: {} };
        }


        // TTL 逾時自滅檢查 (0 為永不過期)
        const ttlHours = globalConfig.qaQueueSettings?.ttlHours ?? 2;
        if (ttlHours > 0) {
            const ttlMs = ttlHours * 60 * 60 * 1000;
            if (Date.now() - (raw.lastUpdated || 0) > ttlMs) {
                raw = { lastUpdated: Date.now(), items: {} };
                setQaQueue(raw);
            }
        }
        return raw;
    }


    function setQaQueue(queueData) {
        try {
            if (typeof GM_setValue !== 'undefined') {
                GM_setValue(QA_QUEUE_KEY, queueData);
            } else {
                localStorage.setItem(QA_QUEUE_KEY, JSON.stringify(queueData));
            }
        } catch (e) {
            console.error('⚠️ [AI Copy] QA Queue 寫入失敗:', e);
            showToast('❌ 設定儲存失敗！可能是儲存空間已滿或被隱私模式阻擋。', true, 4000);
        }
    }


    function clearQaQueue() {
        const emptyQueue = { lastUpdated: Date.now(), items: {} };
        setQaQueue(emptyQueue);
        updateGearIndicator();
    }


    function updateGearIndicator() {
        const queue = getQaQueue();
        const count = Object.keys(queue.items || {}).length;
        const gearBtns = document.querySelectorAll('.ai-copy-gear-btn');
        const summaryKey = globalConfig.qaQueueSettings?.summaryHotkey || 'F7';


        gearBtns.forEach(btn => {
            if (count > 0) {
                btn.classList.add('ai-copy-gear-active');
                btn.title = `【QA 採集中：已暫存 ${count} 站】點擊開啟管理器，右鍵強制清空佇列 (按 ${summaryKey} 總結匯出)`;
            } else {
                btn.classList.remove('ai-copy-gear-active');
                btn.title = '開啟參數設定管理器 (右鍵可清空 QA 採集佇列)';
            }
        });
    }


    // ==========================================
    // 1. Toast 幾何定位與雙態切換工具
    // ==========================================
    let isToastPositioningMode = false;


    function applyToastPosition(toast) {
        const pos = globalConfig.toastPosition;
        if (pos && pos.left && pos.top) {
            toast.style.left = pos.left;
            toast.style.top = pos.top;
            toast.style.bottom = 'auto';
            toast.style.right = 'auto';
            toast.dataset.hasCustomPos = 'true';
        } else {
            toast.style.bottom = '80px';
            toast.style.right = '24px';
            toast.style.left = 'auto';
            toast.style.top = 'auto';
            toast.dataset.hasCustomPos = 'false';
        }
    }


    function showToast(message, isError = false, duration = 2200) {
        if (isToastPositioningMode) return; // 處於拖曳定位模式時不被覆蓋


        let toast = document.getElementById('ai-copy-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'ai-copy-toast';
            toast.className = 'ai-copy-toast-node';
            document.body.appendChild(toast);
        }


        applyToastPosition(toast);
        const customBg = globalConfig.toastSettings?.background || DEFAULT_CONFIG.toastSettings.background;
        const customFontSize = globalConfig.toastSettings?.fontSize || 18;


        toast.textContent = message;
        toast.style.fontSize = `${customFontSize}px`;
        toast.style.setProperty('background', isError ? 'rgba(220, 38, 38, 0.95)' : customBg, 'important');
        toast.style.pointerEvents = 'none'; // 平時點擊強制穿透
        toast.style.opacity = '1';
        toast.style.transform = 'none';


        if (toast._timer) clearTimeout(toast._timer);
        toast._timer = setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(10px)';
        }, duration);
    }


    function toggleToastPositioningMode() {
        let toast = document.getElementById('ai-copy-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'ai-copy-toast';
            toast.className = 'ai-copy-toast-node';
            document.body.appendChild(toast);
        }


        const toastBtns = document.querySelectorAll('.ai-copy-toast-btn');


        if (!isToastPositioningMode) {
            // 進入長亮拖曳定位模式
            isToastPositioningMode = true;
            toastBtns.forEach(b => b.classList.add('ai-copy-toast-btn-active'));


            if (toast._timer) clearTimeout(toast._timer);


            applyToastPosition(toast);
            const customBg = globalConfig.toastSettings?.background || DEFAULT_CONFIG.toastSettings.background;
            const customFontSize = globalConfig.toastSettings?.fontSize || 18;


            toast.textContent = '🍞 [Toast 預覽] 按住本框可自由拖曳定位，完成後再次點擊 🍞 鎖定';
            toast.style.fontSize = `${customFontSize}px`;
            toast.style.setProperty('background', customBg, 'important');


            // 實體解鎖：強制關閉過渡與清除 transform，杜絕平移死鎖與每按一次就位移
            toast.classList.add('ai-copy-toast-active');
            toast.classList.add('ai-copy-is-dragging');
            toast.style.setProperty('pointer-events', 'auto', 'important');
            toast.style.opacity = '1';
            toast.style.transform = 'none';


            // 視窗絕對座標原位鎖定（杜絕 auto 與累加偏誤）
            const curRect = toast.getBoundingClientRect();
            toast.style.left = `${Math.round(curRect.left)}px`;
            toast.style.top = `${Math.round(curRect.top)}px`;
            toast.style.right = 'auto';
            toast.style.bottom = 'auto';


            setupDraggableUI(toast, toast, false, null, true);
        } else {
            // 退出並物理鎖定座標
            isToastPositioningMode = false;
            toastBtns.forEach(b => b.classList.remove('ai-copy-toast-btn-active'));
            toast.classList.remove('ai-copy-toast-active');
            toast.classList.remove('ai-copy-is-dragging');
            toast.style.setProperty('pointer-events', 'none', 'important');


            // 100% 物理左上角真理座標記錄
            const rect = toast.getBoundingClientRect();
            globalConfig.toastPosition = {
                left: `${Math.round(rect.left)}px`,
                top: `${Math.round(rect.top)}px`
            };
            Storage.set(globalConfig);


            toast.style.opacity = '0';
            toast.style.transform = 'translateY(10px)';


            setTimeout(() => {
                showToast('📍 Toast 提示位置已成功鎖定！');
            }, 80);
        }
    }


    function copyToClipboard(text) {
        if (typeof GM_setClipboard !== 'undefined') {
            GM_setClipboard(text, 'text');
        } else if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text);
        } else {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
        }
    }


    // ==========================================
    // 2. 雲端 JSON 同步引擎 (Google Docs 純內容覆蓋，座標絕對隔離)
    // ==========================================
    function getGoogleDocRawUrl(url) {
        if (!url) return '';
        const docMatch = url.match(/\/document\/d\/([a-zA-Z0-9-_]+)/);
        if (docMatch && docMatch[1]) {
            return `https://docs.google.com/document/d/${docMatch[1]}/export?format=txt`;
        }
        return url;
    }


    function getSafeDocLinkUrl(rawUrl) {
        if (!rawUrl) return '#';
        const trimmed = rawUrl.trim();
        if (trimmed.startsWith('https://') || trimmed.startsWith('http://')) {
            return trimmed;
        }
        return '#';
    }


    function isHtmlResponse(text) {
        if (!text) return false;
        const lower = text.toLowerCase();
        return lower.includes('<!doctype html>') || lower.includes('<html') || lower.includes('accounts.google.com');
    }


    function sanitizeJsonString(text) {
        if (!text) return '';
        return text
            .trim()
            .replace(/^\uFEFF/, '')
            .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"')
            .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'")
            .replace(/\u00a0/g, ' ');
    }


    function fetchCloudData(url) {
        return fetch(url, { credentials: 'omit' })
            .then(res => {
                if (!res.ok) throw new Error("HTTP 狀態碼: " + res.status);
                return res.text();
            })
            .catch(err => {
                return new Promise((resolve, reject) => {
                    if (typeof GM_xmlhttpRequest !== 'undefined') {
                        GM_xmlhttpRequest({
                            method: "GET",
                            url: url,
                            anonymous: true,
                            onload: (res) => {
                                if (res.status >= 200 && res.status < 300) resolve(res.responseText);
                                else reject(new Error("備用連線狀態碼: " + res.status));
                            },
                            onerror: () => reject(new Error("雲端連線失敗，請檢查網址與共享權限。"))
                        });
                    } else {
                        reject(err);
                    }
                });
            });
    }


    async function syncFromJsonDoc(onSuccessCallback) {
        const url = globalConfig.jsonSyncUrl;
        if (!url || !url.trim()) {
            showToast('⚠️ 請先填入 Google Doc 雲端同步連結！', true);
            return;
        }


        showToast('⏳ 正在從 Google Docs 同步配置...');
        try {
            const rawUrl = getGoogleDocRawUrl(url.trim());
            const rawText = await fetchCloudData(rawUrl);


            if (isHtmlResponse(rawText)) {
                alert('⚠️ 同步失敗！\n此 Google Doc 處於非共享狀態，請至雲端將共用權限設為「知道連結的任何人均可檢視」。');
                showToast('❌ 雲端檔案非共享狀態！', true);
                return;
            }


            const cleanedText = sanitizeJsonString(rawText);
            const parsed = JSON.parse(cleanedText);


            if (!parsed || typeof parsed !== 'object') {
                throw new Error('解析結果非合法 JSON 物件');
            }


            if (confirm('確定使用此雲端配置「覆蓋」純內容設定嗎？\n(為防止按鈕跑位，本機懸浮卡片、小光球、Toast 座標與自訂熱鍵將 100% 嚴格保留)')) {
                const preservedLocal = JSON.parse(JSON.stringify(globalConfig));
                const preservedHotkeys = {
                    captureHotkey: globalConfig.qaQueueSettings?.captureHotkey,
                    summaryHotkey: globalConfig.qaQueueSettings?.summaryHotkey
                };


                globalConfig = sanitizeConfig(parsed);
                applyLocalOnlyOverrides(globalConfig, preservedLocal);


                // 【Hotfix-02】：由 truthy 檢查改為 !== undefined 嚴格型別校驗
                if (typeof preservedHotkeys.captureHotkey !== 'undefined' && globalConfig.qaQueueSettings) {
                    globalConfig.qaQueueSettings.captureHotkey = preservedHotkeys.captureHotkey;
                }
                if (typeof preservedHotkeys.summaryHotkey !== 'undefined' && globalConfig.qaQueueSettings) {
                    globalConfig.qaQueueSettings.summaryHotkey = preservedHotkeys.summaryHotkey;
                }


                Storage.set(globalConfig);
                if (typeof onSuccessCallback === 'function') onSuccessCallback();
                showToast('🎉 雲端內容配置已成功同步覆蓋 (本機座標與熱鍵完好保留)！');
            }
        } catch (err) {
            console.error('❌ [AI Copy] 雲端 JSON 同步失敗:', err);
            alert(`❌ 雲端 JSON 同步失敗：\n${err.message}\n\n可能原因：\n1. Google Doc 內容非合法 JSON 格式。\n2. 檔案未開啟公開檢視權限。`);
            showToast('❌ JSON 解析或同步失敗！', true);
        }
    }


    // ==========================================
    // 3. 全域 DOM 雜訊與雙軌開放式清洗管線
    // ==========================================
    const UNIVERSAL_NOISE_SELECTORS = [
        '.katex-mathml', '.MathJax_Preview',
        '.line-numbers', '.line-numbers-rows', '.gutter', '.linenumber', '[class*="line-number"]',
        'button', 'svg', 'mat-icon', 'span.material-symbols-outlined',
        '.copy-code-button', '.table-action-btn', '.action-btn', '[class*="action-bar"]',
        '[class*="toolbar"]', '[class*="feedback"]', '.actions-container', 'ms-turn-actions',
        '[data-testid*="copy"]', '[aria-label*="複製"]', '[aria-label*="朗讀"]',
        '[aria-label*="好"]', '[aria-label*="不好"]', '[aria-label*="Read Aloud"]',
        '[aria-label*="Copy"]', '[aria-label*="Copy code"]', '.text-xs.text-gray-500', '.text-gray-400',
        '[class*="table-tool"]', '[class*="table-header"]', '[class*="sheet-copy"]',
        '.ds-greeting', '.welcome-card', '.suggest-box', '.chat-recommend-prompt',
        '.thinking-box', '.think-container', '.tool-call-wrap', '.answer-info-right',
        '[data-testid*="citation"]', '.citation', '[class*="citation"]', '.group-hover\\:visible',
        `#${UI_CONTAINER_ID}`, `#${FLOATING_ORB_ID}`, '#ai-copy-toast', `#${MODAL_OVERLAY_ID}`, '.ai-copy-toast-node'
    ];


    function cleanUniversalNoise(node) {
        if (!node || node.nodeType !== Node.ELEMENT_NODE) return node;
        UNIVERSAL_NOISE_SELECTORS.forEach(sel => {
            node.querySelectorAll(sel).forEach(el => el.remove());
        });
        return node;
    }


    function applyNoiseStrings(text, rawStrings) {
        if (!text || !rawStrings || !rawStrings.trim()) return text;
        let result = text;
        const lines = rawStrings.split('\n');
        lines.forEach(line => {
            const rule = line.trim();
            if (!rule || rule.startsWith('#') || rule.startsWith('//')) return;
            result = result.replaceAll(rule, '');
        });
        return result;
    }


    function findRegexClosingSlash(rule) {
        if (!rule || rule.length <= 1 || !rule.startsWith('/')) return -1;
        for (let i = rule.length - 1; i >= 1; i--) {
            if (rule[i] === '/') {
                let slashCount = 0;
                for (let j = i - 1; j >= 0; j--) {
                    if (rule[j] === '\\') {
                        slashCount++;
                    } else {
                        break;
                    }
                }
                if (slashCount % 2 === 0) {
                    return i;
                }
            }
        }
        return -1;
    }


    function applyNoiseRegexes(text, rawRegexes) {
        if (!text || !rawRegexes || !rawRegexes.trim()) return text;
        let result = text;
        const lines = rawRegexes.split('\n');
        lines.forEach(line => {
            const rule = line.trim();
            if (!rule || rule.startsWith('#') || rule.startsWith('//')) return;


            try {
                if (rule.startsWith('/') && rule.length > 1) {
                    const lastSlashIndex = findRegexClosingSlash(rule);


                    if (lastSlashIndex > 0) {
                        const patternStr = rule.substring(1, lastSlashIndex);
                        const flagsStr = rule.substring(lastSlashIndex + 1) || 'g';
                        const regex = new RegExp(patternStr, flagsStr);
                        result = result.replace(regex, '');
                    } else {
                        result = result.replaceAll(rule, '');
                    }
                } else {
                    result = result.replaceAll(rule, '');
                }
            } catch (regexErr) {
                console.warn('⚠️ [AI Copy] 自訂正則規則語法無效，已自動跳過:', rule, regexErr);
            }
        });
        return result;
    }


    function sanitizeMarkdownArtifacts(text) {
        if (!text) return '';
        let result = text;
        const settings = globalConfig.noiseSettings || DEFAULT_CONFIG.noiseSettings;
        const order = settings.pipelineOrder || 'string_first';


        if (order === 'string_first') {
            result = applyNoiseStrings(result, settings.customNoiseStrings);
            result = applyNoiseRegexes(result, settings.customNoiseRegexes);
        } else {
            result = applyNoiseRegexes(result, settings.customNoiseRegexes);
            result = applyNoiseStrings(result, settings.customNoiseStrings);
        }


        return result.replace(/\n{3,}/g, '\n\n').trim();
    }


    // ==========================================
    // 4. AI Studio 多引擎降級容錯提取 (Multi-Engine Chain)
    // ==========================================
    async function tryAiStudioNativeMenuCopy() {
        try {
            const buttons = Array.from(document.querySelectorAll('button[aria-label="View more actions"], button[mattooltip="View more actions"], button.mat-mdc-menu-trigger'));
            const validButtons = buttons.filter(b => {
                if (b.closest('ms-playground-toolbar') || b.closest(`#${UI_CONTAINER_ID}`) || b.closest(`#${FLOATING_ORB_ID}`)) return false;
                const turn = b.closest('ms-chat-turn, [data-turn-role="Model"]');
                return !!turn;
            });


            if (validButtons.length === 0) return null;
            const targetMoreBtn = validButtons[validButtons.length - 1];


            targetMoreBtn.click();


            let targetMenuItem = null;
            for (let i = 0; i < 15; i++) {
                await new Promise(r => setTimeout(r, 30));
                const overlay = document.querySelector('.cdk-overlay-container');
                if (overlay) {
                    const menuItems = Array.from(overlay.querySelectorAll('button[role="menuitem"], .mat-mdc-menu-item'));
                    targetMenuItem = menuItems.find(item => {
                        const txt = item.textContent || '';
                        return txt.includes('Copy as markdown') || txt.includes('複製為 Markdown') || txt.includes('Markdown');
                    });
                    if (targetMenuItem) break;
                }
            }


            if (!targetMenuItem) {
                document.body.click();
                return null;
            }


            targetMenuItem.click();
            await new Promise(r => setTimeout(r, 120));


            if (navigator.clipboard && navigator.clipboard.readText) {
                const readMd = await navigator.clipboard.readText();
                if (readMd && readMd.trim().length > 0) {
                    return readMd.trim();
                }
            }
            return null;
        } catch (e) {
            console.warn('⚠️ [AI Copy] AI Studio 原生選單提取異常:', e);
            try { document.body.click(); } catch (_) {}
            return null;
        }
    }


    async function getAiStudioLastTurnMarkdown() {
        try {
            const allTurns = Array.from(document.querySelectorAll('ms-chat-turn'));
            const modelTurns = allTurns.filter(turn => {
                if (turn.closest(`#${UI_CONTAINER_ID}`) || turn.closest(`#${FLOATING_ORB_ID}`) || turn.id === UI_CONTAINER_ID) return false;
                const role = turn.getAttribute('data-turn-role') || turn.getAttribute('data-role');
                if (role && role.toLowerCase() === 'model') return true;
                const isModel = turn.querySelector('[data-turn-role="Model"], [data-role="model"], .model-turn-container');
                const isUser = turn.querySelector('[data-turn-role="User"], [data-role="user"]');
                return !!isModel && !isUser;
            });


            if (modelTurns.length === 0) return null;
            const lastTurn = modelTurns[modelTurns.length - 1];


            let textarea = lastTurn.querySelector('textarea');
            if (textarea && textarea.value) {
                return textarea.value;
            }


            let editBtn = lastTurn.querySelector('button[aria-label*="Edit"], button[aria-label*="edit"], button[mattooltip*="Edit"], button[mattooltip*="edit"]');
            if (!editBtn) {
                const buttons = Array.from(lastTurn.querySelectorAll('button'));
                editBtn = buttons.find(b => {
                    const txt = b.innerText || b.getAttribute('aria-label') || '';
                    return txt.includes('Edit') || txt.includes('編輯') || txt.includes('edit');
                });
            }


            if (!editBtn) return null;


            editBtn.click();


            for (let i = 0; i < 15; i++) {
                await new Promise(r => setTimeout(r, 20));
                textarea = lastTurn.querySelector('textarea');
                if (textarea && typeof textarea.value === 'string' && textarea.value.length > 0) {
                    break;
                }
            }


            let resultText = '';
            if (textarea && textarea.value) {
                resultText = textarea.value;
            }


            const allTurnButtons = Array.from(lastTurn.querySelectorAll('button'));
            const cancelBtn = allTurnButtons.find(b => {
                const txt = (b.innerText || b.getAttribute('aria-label') || '').toLowerCase();
                return txt.includes('cancel') || txt.includes('取消') || txt.includes('close');
            });


            if (cancelBtn) {
                cancelBtn.click();
            } else {
                editBtn.click();
            }


            return resultText || null;
        } catch (e) {
            console.warn('⚠️ [AI Copy] 模擬編輯提取異常:', e);
            return null;
        }
    }


    // ==========================================
    // 5. DOM 轉 Markdown 核心引擎
    // ==========================================
    function parseTableToMarkdown(tableEl) {
        const tableClone = tableEl.cloneNode(true);
        cleanUniversalNoise(tableClone);


        const rows = Array.from(tableClone.querySelectorAll('tr'));
        if (rows.length === 0) return '';


        let md = '\n\n';
        const headers = [];
        const headerCells = rows[0].querySelectorAll('th, td');


        headerCells.forEach(cell => {
            const cellText = cell.textContent.replace(/[\r\n]+/g, ' ').replace(/\|/g, '\\|').trim();
            headers.push(cellText || ' ');
        });


        md += '| ' + headers.join(' | ') + ' |\n';
        md += '| ' + headers.map(() => '---').join(' | ') + ' |\n';


        for (let i = 1; i < rows.length; i++) {
            const cells = Array.from(rows[i].querySelectorAll('td, th'));
            if (cells.length > 0) {
                const rowData = cells.map(c => {
                    return c.textContent
                        .replace(/[\r\n]+/g, '<br>')
                        .replace(/\|/g, '\\|')
                        .trim() || ' ';
                });
                md += '| ' + rowData.join(' | ') + ' |\n';
            }
        }
        return md + '\n\n';
    }


    function parseCodeBlock(codeContainer) {
        let language = codeContainer.getAttribute('data-language') || codeContainer.getAttribute('data-lang') || codeContainer.getAttribute('language') || codeContainer.getAttribute('lang') || '';


        if (!language) {
            const shell = codeContainer.closest('.codeblock-shell') || codeContainer.querySelector('.codeblock-shell');
            if (shell) language = shell.getAttribute('data-lang') || '';
        }


        const langSpan = codeContainer.querySelector('.segment-code-lang, [class*="code-lang"], [class*="lang"]');
        if (langSpan && langSpan.textContent && !language) {
            language = langSpan.textContent.trim();
        }


        const headerEl = codeContainer.querySelector('[class*="header"], [class*="title"], [class*="code-nav"], [class*="tools"]');
        if (headerEl && !language) {
            language = headerEl.textContent
                .replace(/(複製|下载|下載|copy|download|text|code)/gi, '')
                .replace(/[\r\n\t]+/g, '')
                .trim();
        }


        const preEl = codeContainer.tagName.toLowerCase() === 'pre' ? codeContainer : codeContainer.querySelector('pre');
        const codeEl = preEl ? (preEl.querySelector('code') || preEl) : (codeContainer.querySelector('code') || codeContainer);


        if (!language && preEl) {
            const match = (preEl.className || '').match(/(?:language-|lang-)([a-zA-Z0-9_+-]+)/);
            if (match) language = match[1];
        }
        if (!language && codeEl) {
            const match = (codeEl.className || '').match(/(?:language-|lang-)([a-zA-Z0-9_+-]+)/);
            if (match) language = match[1];
        }


        let rawCodeText = '';
        const cmLines = Array.from(codeContainer.querySelectorAll('.cm-line'));
        const standardLines = Array.from((codeEl || codeContainer).querySelectorAll('.code-line, [class*="line-content"], .view-line'));


        if (cmLines.length > 0) {
            rawCodeText = cmLines.map(ln => ln.textContent || '').join('\n');
        } else if (standardLines.length > 0) {
            rawCodeText = standardLines.map(ln => ln.textContent || ln.innerText || '').join('\n');
        } else {
            rawCodeText = (codeEl || codeContainer).textContent || '';
        }


        const cleanCodeText = rawCodeText
            .replace(/^content_expand_less/g, '')
            .replace(/^content_copy/g, '')
            .replace(/\r\n/g, '\n')
            .trim();


        return `\n\n\`\`\`${language}\n${cleanCodeText}\n\`\`\`\n\n`;
    }


    function convertNodeToMarkdown(node) {
        if (!node) return '';
        if (node.nodeType === Node.TEXT_NODE) return node.textContent;
        if (node.nodeType !== Node.ELEMENT_NODE) return '';


        const tagName = node.tagName.toLowerCase();
        const className = typeof node.className === 'string' ? node.className : '';


        const isCodeBlock = (tagName === 'div' && (className.includes('segment-code') || className.includes('code-block') || className.includes('codeContainer') || className.includes('syntax-highlighter') || className.includes('monaco-editor') || className.includes('cm-editor') || className.includes('cm-content') || className.includes('codeblock-shell')) && !className.includes('inline') && !className.includes('codespan')) ||
                            (tagName === 'ms-code-block') ||
                            (tagName === 'pre' && (className.includes('shiki') || (!node.closest('.segment-code') && !node.closest('[class*="code-block"]'))));


        if (isCodeBlock) {
            if (node.dataset.processedByAiCopy) return '';
            node.dataset.processedByAiCopy = 'true';
            return parseCodeBlock(node);
        }


        if (tagName === 'code' || className.includes('segment-code-inline') || className.includes('qwen-markdown-codespan') || className.includes('codespan')) {
            if (!node.closest('.segment-code') && !node.closest('pre') && !node.closest('[class*="code-block"]') && !node.closest('.monaco-editor') && !node.closest('.cm-editor') && !node.closest('.codeblock-shell')) {
                return ` \`${node.textContent.trim()}\` `;
            }
        }


        if (tagName === 'table') {
            return parseTableToMarkdown(node);
        }


        if (/^h[1-6]$/.test(tagName)) {
            const level = parseInt(tagName[1], 10);
            return `\n\n${'#'.repeat(level)} ${getChildMarkdown(node).trim()}\n\n`;
        }


        if (tagName === 'ul' || tagName === 'ol') {
            const isOrdered = tagName === 'ol';
            let itemsMd = '';
            let index = 1;
            Array.from(node.children).forEach(child => {
                if (child.tagName.toLowerCase() === 'li') {
                    itemsMd += `${isOrdered ? `${index++}. ` : '* '}${getChildMarkdown(child).trim()}\n`;
                }
            });
            return `\n\n${itemsMd}\n\n`;
        }


        if (tagName === 'strong' || tagName === 'b') return `**${getChildMarkdown(node)}**`;
        if (tagName === 'em' || tagName === 'i') return `*${getChildMarkdown(node)}*`;
        if (tagName === 'del' || tagName === 's') return `~~${getChildMarkdown(node)}~~`;
        if (tagName === 'a') return `[${getChildMarkdown(node)}](${node.getAttribute('href') || '#'})`;
        if (tagName === 'p') return `\n\n${getChildMarkdown(node)}\n\n`;
        if (tagName === 'blockquote') {
            const content = getChildMarkdown(node).trim();
            return '\n\n' + content.split('\n').map(l => `> ${l}`).join('\n') + '\n\n';
        }
        if (tagName === 'br') return '\n';


        return getChildMarkdown(node);
    }


    function getChildMarkdown(node) {
        let result = '';
        node.childNodes.forEach(child => {
            result += convertNodeToMarkdown(child);
        });
        return result;
    }


    function domToMarkdown(element, cleanNodeFn) {
        if (!element) return '';
        const cleaned = cleanNodeFn ? cleanNodeFn(element) : element.cloneNode(true);
        cleanUniversalNoise(cleaned);


        const md = convertNodeToMarkdown(cleaned);
        cleaned.querySelectorAll('[data-processed-by-ai-copy]').forEach(el => delete el.dataset.processedByAiCopy);
        return sanitizeMarkdownArtifacts(md);
    }


    // ==========================================
    // 5.1 Z.AI Live DOM 結構化 Markdown 轉譯器
    // ==========================================
    function parseZaiProseToMarkdown(node) {
        if (!node) return '';
        if (node.nodeType === Node.TEXT_NODE) return node.textContent;
        if (node.nodeType !== Node.ELEMENT_NODE) return '';


        const tag = node.tagName.toLowerCase();
        const className = typeof node.className === 'string' ? node.className : '';


        // 1. 雜訊過濾
        if (tag === 'button' || tag === 'svg' || className.includes('copy-code-button')) {
            return '';
        }


        // 2. 表格轉譯
        if (tag === 'table') {
            const rows = Array.from(node.querySelectorAll('tr'));
            if (rows.length === 0) return '';
            let md = '\n\n';
            const headers = [];
            const headerCells = rows[0].querySelectorAll('th, td');
            headerCells.forEach(cell => {
                const cellText = cell.textContent.replace(/[\r\n]+/g, ' ').replace(/\|/g, '\\|').trim();
                headers.push(cellText || ' ');
            });
            md += '| ' + headers.join(' | ') + ' |\n';
            md += '| ' + headers.map(() => '---').join(' | ') + ' |\n';
            for (let i = 1; i < rows.length; i++) {
                const cells = Array.from(rows[i].querySelectorAll('td, th'));
                if (cells.length > 0) {
                    const rowData = cells.map(c => {
                        return c.textContent
                            .replace(/[\r\n]+/g, '<br>')
                            .replace(/\|/g, '\\|')
                            .trim() || ' ';
                    });
                    md += '| ' + rowData.join(' | ') + ' |\n';
                }
            }
            return md + '\n\n';
        }


        // 3. 標題轉譯
        if (/^h[1-6]$/.test(tag)) {
            const level = parseInt(tag[1], 10);
            return `\n\n${'#'.repeat(level)} ${walkZaiChildren(node).trim()}\n\n`;
        }


        // 4. 代碼區塊 (pre)
        if (tag === 'pre') {
            const codeEl = node.querySelector('code') || node;
            let lang = '';
            const match = (codeEl.className || node.className || '').match(/(?:language-|lang-)(\w+)/);
            if (match) lang = match[1];
            return `\n\n\`\`\`${lang}\n${codeEl.textContent.trim()}\n\`\`\`\n\n`;
        }


        // 5. 行內代碼
        if (tag === 'code' && !node.closest('pre')) {
            return ` \`${node.textContent.trim()}\` `;
        }


        // 6. 段落與容器
        if (tag === 'p' || tag === 'div') {
            const text = walkZaiChildren(node).trim();
            return text ? `\n\n${text}\n\n` : '';
        }


        // 7. 區塊引用
        if (tag === 'blockquote') {
            const text = walkZaiChildren(node).trim();
            return '\n\n' + text.split('\n').map(l => `> ${l}`).join('\n') + '\n\n';
        }


        // 8. 清單
        if (tag === 'ul' || tag === 'ol') {
            const isOrdered = tag === 'ol';
            let itemsMd = '';
            let index = 1;
            Array.from(node.children).forEach(child => {
                if (child.tagName.toLowerCase() === 'li') {
                    itemsMd += `${isOrdered ? `${index++}. ` : '* '}${walkZaiChildren(child).trim()}\n`;
                }
            });
            return `\n\n${itemsMd}\n\n`;
        }


        // 9. 行內強調與折行
        if (tag === 'strong' || tag === 'b') return `**${walkZaiChildren(node)}**`;
        if (tag === 'em' || tag === 'i') return `*${walkZaiChildren(node)}*`;
        if (tag === 'del' || tag === 's') return `~~${walkZaiChildren(node)}~~`;
        if (tag === 'a') return `[${walkZaiChildren(node)}](${node.getAttribute('href') || '#'})`;
        if (tag === 'br') return '\n';


        // 10. 平滑透傳
        return walkZaiChildren(node);
    }


    function walkZaiChildren(node) {
        let res = '';
        node.childNodes.forEach(c => {
            res += parseZaiProseToMarkdown(c);
        });
        return res;
    }


    // ==========================================
    // 6. 平台適配器 (Adapters Pattern - 11 大站點陣容)
    // ==========================================
    const Adapters = {
        ChatGPT: {
            id: 'chatgpt',
            name: 'ChatGPT',
            isMatch: () => location.hostname.includes('chatgpt.com') || location.hostname.includes('openai.com'),
            getAiNodes: () => {
                const rawAssistantNodes = Array.from(document.querySelectorAll('[data-message-author-role="assistant"]'));
                return rawAssistantNodes.filter(node => {
                    return node.innerText && node.innerText.trim().length > 0;
                }).map(node => {
                    return node.querySelector('.markdown') || node;
                });
            },
            getUserNodes: () => {
                const rawUserNodes = Array.from(document.querySelectorAll('[data-message-author-role="user"]'));
                return rawUserNodes.filter(node => node.innerText && node.innerText.trim().length > 0);
            },
            cleanNode: (node) => {
                const clone = node.cloneNode(true);
                clone.querySelectorAll('.katex').forEach(katexEl => {
                    const texAnno = katexEl.querySelector('annotation[encoding="application/x-tex"]');
                    if (texAnno) {
                        const isDisplay = katexEl.classList.contains('katex-display') || katexEl.parentElement?.classList.contains('katex-display');
                        const tex = texAnno.textContent.trim();
                        const textNode = document.createTextNode(isDisplay ? `\n$$\n${tex}\n$$\n` : ` $${tex}$ `);
                        const target = (katexEl.parentElement && katexEl.parentElement.classList.contains('katex-display')) ? katexEl.parentElement : katexEl;
                        target.parentNode.replaceChild(textNode, target);
                    }
                });


                clone.querySelectorAll('[data-testid*="attachment"], [class*="attachment"]').forEach(attEl => {
                    const title = attEl.innerText.trim();
                    const textNode = document.createTextNode(`\n[📎 附加檔案: ${title || '文字附件'}]\n`);
                    attEl.parentNode.replaceChild(textNode, attEl);
                });


                cleanUniversalNoise(clone);
                return clone;
            }
        },
        Claude: {
            id: 'claude',
            name: 'Claude',
            isMatch: () => location.hostname.includes('claude.ai'),
            getAiNodes: () => {
                const candidates = Array.from(document.querySelectorAll('.standard-markdown, [class*="font-claude-message"]'));
                return candidates.filter(node => {
                    if (node.closest(`#${UI_CONTAINER_ID}`) || node.closest(`#${FLOATING_ORB_ID}`)) return false;
                    const isUser = node.closest('[data-testid="user-message"], [class*="user-message"]');
                    const text = node.innerText ? node.innerText.trim() : '';
                    return !isUser && text.length > 0;
                });
            },
            getUserNodes: () => {
                const nodes = Array.from(document.querySelectorAll('[data-testid="user-message"], [class*="user-message"]'));
                return nodes.filter(n => n.innerText && n.innerText.trim().length > 0);
            },
            cleanNode: (node) => {
                const clone = node.cloneNode(true);
                cleanUniversalNoise(clone);
                return clone;
            }
        },
        DeepSeek: {
            id: 'deepseek',
            name: 'DeepSeek',
            isMatch: () => location.hostname.includes('deepseek.com'),
            getAiNodes: () => {
                const candidates = Array.from(document.querySelectorAll('.ds-markdown, .ds-assistant-message-main-content'));
                return candidates.filter(node => {
                    const isGreeting = node.closest('.ds-greeting') || node.classList.contains('ds-greeting');
                    const hasText = node.innerText && node.innerText.trim().length > 0;
                    return !isGreeting && hasText;
                });
            },
            getUserNodes: () => {
                const nodes = Array.from(document.querySelectorAll('.ds-user-message, [class*="user-message"], [class*="user-content"]'));
                return nodes.filter(n => n.innerText && n.innerText.trim().length > 0);
            },
            cleanNode: (node) => {
                const clone = node.cloneNode(true);
                cleanUniversalNoise(clone);
                clone.querySelectorAll('button, svg, .ds-icon').forEach(el => el.remove());
                return clone;
            }
        },
        Qwen: {
            id: 'qwen',
            name: '通義千問',
            isMatch: () => location.hostname.includes('qwen.ai') || location.hostname.includes('aliyun.com'),
            getAiNodes: () => {
                const rawNodes = Array.from(document.querySelectorAll('.response-message-content, [class*="response-message-content"], .markdown-body'));
                return rawNodes.filter(node => {
                    const isUserChild = node.closest('.user-message-content, [class*="user-message"]');
                    const isWelcome = node.closest('.welcome-card, [class*="welcome"]');
                    const isActionBar = node.closest('[class*="action"], [class*="toolbar"], [class*="footer"]');
                    const hasText = node.innerText && node.innerText.trim().length > 0;
                    return !isUserChild && !isWelcome && !isActionBar && hasText;
                });
            },
            getUserNodes: () => {
                const rawNodes = Array.from(document.querySelectorAll('.user-message-content, [class*="user-message-content"]'));
                return rawNodes.filter(node => node.innerText && node.innerText.trim().length > 0);
            },
            cleanNode: (node) => {
                const clone = node.cloneNode(true);
                cleanUniversalNoise(clone);
                const unwantedSelectors = [
                    '.think', '.reasoning', '[class*="think"]', '[class*="reasoning"]'
                ];
                unwantedSelectors.forEach(sel => {
                    clone.querySelectorAll(sel).forEach(el => el.remove());
                });
                return clone;
            }
        },
        Kimi: {
            id: 'kimi',
            name: 'Kimi',
            isMatch: () => location.hostname.includes('kimi.ai') || location.hostname.includes('moonshot.cn') || location.hostname.includes('kimi.com'),
            getAiNodes: () => {
                const rawSegments = Array.from(document.querySelectorAll('.segment-assistant'));
                const validNodes = [];
                rawSegments.forEach(s => {
                    const isRecommend = s.closest('.chat-recommend-prompt') || s.querySelector('.chat-recommend-prompt');
                    if (isRecommend) return;


                    const content = s.querySelector('.segment-content') || s;
                    const text = content.innerText ? content.innerText.trim() : '';
                    if (text.length > 0) {
                        validNodes.push(content);
                    }
                });
                return validNodes;
            },
            getUserNodes: () => {
                const rawNodes = Array.from(document.querySelectorAll('.segment-user'));
                return rawNodes.map(s => s.querySelector('.segment-content') || s).filter(n => n.innerText && n.innerText.trim().length > 0);
            },
            cleanNode: (node) => {
                const clone = node.cloneNode(true);
                cleanUniversalNoise(clone);
                const unwantedSelectors = [
                    '.toolcall-container', '.thinking-container', '.block-container',
                    '.segment-assistant-actions-content', '.table-action-btn',
                    '[class*="table-tool"]', '[class*="table-header"]'
                ];
                unwantedSelectors.forEach(sel => {
                    clone.querySelectorAll(sel).forEach(el => el.remove());
                });
                return clone;
            }
        },
        Zhipu: {
            id: 'zhipu',
            name: '智譜',
            isMatch: () => location.hostname.includes('chatglm.cn') || location.hostname.includes('bigmodel.cn'),
            getAiNodes: () => {
                const items = Array.from(document.querySelectorAll('.chat-content .chat-item, .chat-item, [class*="chat-item"]'));
                const aiItems = items.filter(it => {
                    if (it.closest(`#${UI_CONTAINER_ID}`) || it.closest(`#${FLOATING_ORB_ID}`)) return false;
                    const isUser = it.classList.contains('user') || it.querySelector('.user-msg, [class*="user-icon"]');
                    return !isUser;
                });


                const nodes = [];
                aiItems.forEach(it => {
                    const content = it.querySelector('.content-wrap, .markdown-body, [class*="content"]') || it;
                    if (content.innerText && content.innerText.trim().length > 0) {
                        nodes.push(content);
                    }
                });
                return nodes;
            },
            getUserNodes: () => {
                const items = Array.from(document.querySelectorAll('.chat-content .chat-item, .chat-item, [class*="chat-item"]'));
                const userItems = items.filter(it => {
                    return it.classList.contains('user') || it.querySelector('.user-msg, [class*="user-icon"]');
                });
                return userItems.filter(n => n.innerText && n.innerText.trim().length > 0);
            },
            getMarkdownAsync: async (node) => {
                try {
                    const copyBtns = Array.from(document.querySelectorAll('.chat-content .chat-item:last-child .answer-info-right span[name*="复制"], .answer-info-right .icon-copy, .chat-item:last-child [class*="copy"]'));
                    if (copyBtns.length > 0) {
                        const targetBtn = copyBtns[copyBtns.length - 1];
                        targetBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
                        await new Promise(r => setTimeout(r, 150));
                        if (navigator.clipboard && navigator.clipboard.readText) {
                            const clipText = await navigator.clipboard.readText();
                            if (clipText && clipText.trim().length > 0) {
                                return sanitizeMarkdownArtifacts(clipText);
                            }
                        }
                    }
                } catch (err) {
                    console.warn('⚠️ [AI Copy] 智譜原生代理複製異常，降級至 DOM 轉譯:', err);
                }
                return domToMarkdown(node, Adapters.Zhipu.cleanNode);
            },
            cleanNode: (node) => {
                const clone = node.cloneNode(true);
                cleanUniversalNoise(clone);
                const unwanted = [
                    '.thinking-box', '.think-container', '.tool-call-wrap',
                    '.answer-info-right', '.code-lang-label', '.copy-btn'
                ];
                unwanted.forEach(sel => clone.querySelectorAll(sel).forEach(el => el.remove()));
                return clone;
            }
        },
        AiStudio: {
            id: 'aistudio',
            name: 'Gemini',
            isMatch: () => location.hostname.includes('aistudio.google.com'),
            getAiNodes: () => {
                const candidates = Array.from(document.querySelectorAll('ms-chat-turn, [data-turn-role="Model"], ms-prompt-renderer ms-chat-turn'));
                const modelNodes = [];


                candidates.forEach(el => {
                    if (el.closest(`#${UI_CONTAINER_ID}`) || el.closest(`#${FLOATING_ORB_ID}`) || el.id === UI_CONTAINER_ID) return;


                    const parentTurn = el.closest('ms-chat-turn') || el.closest('[data-turn-role="Model"]') || el;
                    const role = parentTurn.getAttribute('data-turn-role') || parentTurn.getAttribute('data-role');
                    if (role && role.toLowerCase() === 'user') return;


                    if (!modelNodes.includes(parentTurn) && parentTurn.innerText && parentTurn.innerText.trim().length > 0) {
                        modelNodes.push(parentTurn);
                    }
                });


                return modelNodes;
            },
            getUserNodes: () => [],
            getMarkdownAsync: async (node) => {
                const settings = globalConfig.aiStudioSettings || DEFAULT_CONFIG.aiStudioSettings;
                const engine = settings.primaryEngine || 'native_menu';


                if (engine === 'native_menu') {
                    const menuMd = await tryAiStudioNativeMenuCopy();
                    if (menuMd && menuMd.trim().length > 0) return sanitizeMarkdownArtifacts(menuMd);
                    console.warn('⚠️ [AI Copy] 原生選單代理失敗，降級至模擬編輯...');
                }


                if (engine === 'pencil_edit' || engine === 'native_menu') {
                    const editMd = await getAiStudioLastTurnMarkdown();
                    if (editMd && editMd.trim().length > 0) return sanitizeMarkdownArtifacts(editMd);
                    console.warn('⚠️ [AI Copy] 模擬編輯提取失敗，降級至 DOM 轉譯...');
                }


                return domToMarkdown(node, Adapters.AiStudio.cleanNode);
            },
            cleanNode: (node) => {
                const clone = node.cloneNode(true);
                cleanUniversalNoise(clone);
                const unwantedSelectors = [
                    'ms-turn-actions', '.turn-actions', '.run-button', 'ms-chat-turn-options',
                    '[data-turn-role="User"]', '.user-turn-header', '.thumb-container'
                ];
                unwantedSelectors.forEach(sel => {
                    clone.querySelectorAll(sel).forEach(el => el.remove());
                });
                return clone;
            }
        },
        Mistral: {
            id: 'mistral',
            name: 'Mistral',
            isMatch: () => location.hostname.includes('console.mistral.ai'),
            getAiNodes: () => {
                const proseCandidates = Array.from(document.querySelectorAll('[role="article"] .prose, div.prose.max-w-none, .prose'));
                const validNodes = proseCandidates.filter(el => {
                    if (el.closest(`#${UI_CONTAINER_ID}`) || el.closest(`#${FLOATING_ORB_ID}`)) return false;
                    const text = el.innerText ? el.innerText.trim() : '';
                    return text.length > 0;
                });
                return validNodes;
            },
            getUserNodes: () => [],
            cleanNode: (node) => {
                const clone = node.cloneNode(true);
                cleanUniversalNoise(clone);
                clone.querySelectorAll('button[aria-label*="Copy code"], button[aria-label="Copy code to clipboard"]').forEach(b => b.remove());
                clone.querySelectorAll('div, span, p').forEach(el => {
                    if (el.children.length === 0 && (el.innerText || '').trim() === 'Assistant') {
                        el.remove();
                    }
                });
                return clone;
            }
        },
        Perplexity: {
            id: 'perplexity',
            name: 'Perplexity',
            isMatch: () => location.hostname.includes('perplexity.ai'),
            getAiNodes: () => {
                const candidates = Array.from(document.querySelectorAll('div.prose[data-renderer="lm"], .prose.dark\\:prose-invert, [data-testid*="answer"], div.prose'));
                return candidates.filter(el => {
                    if (el.closest(`#${UI_CONTAINER_ID}`) || el.closest(`#${FLOATING_ORB_ID}`)) return false;
                    const isUser = el.closest('[class*="user-bubble"], [class*="query"], .group\\/user-bubble');
                    const text = el.innerText ? el.innerText.trim() : '';
                    return !isUser && text.length > 0;
                });
            },
            getUserNodes: () => {
                const nodes = Array.from(document.querySelectorAll('[class*="user-bubble"], div.group\\/user-bubble, div[class*="query"]'));
                return nodes.filter(n => n.innerText && n.innerText.trim().length > 0);
            },
            cleanNode: (node) => {
                const clone = node.cloneNode(true);
                cleanUniversalNoise(clone);
                clone.querySelectorAll('[data-testid*="citation"], .citation, [class*="citation"]').forEach(el => el.remove());
                return clone;
            }
        },
        Zai: {
            id: 'zai',
            name: 'Z.AI',
            isMatch: () => location.hostname.includes('chat.z.ai'),
            getAiNodes: () => {
                const candidates = Array.from(document.querySelectorAll('.chat-assistant .markdown-prose, #response-content-container, div.chat-assistant, .chat-assistant'));
                return candidates.filter(el => {
                    if (el.closest(`#${UI_CONTAINER_ID}`) || el.closest(`#${FLOATING_ORB_ID}`)) return false;
                    const isUser = el.closest('.chat-user, .user-message') || el.classList.contains('chat-user');
                    const text = el.innerText ? el.innerText.trim() : '';
                    return !isUser && text.length > 0;
                });
            },
            getUserNodes: () => {
                const nodes = Array.from(document.querySelectorAll('div.user-message .chat-user.markdown-prose, div.user-message, .chat-user'));
                return nodes.filter(n => n.innerText && n.innerText.trim().length > 0);
            },
            getMarkdownAsync: async (node) => {
                try {
                    const allButtons = Array.from(node.querySelectorAll('button'));
                    const validButtons = allButtons.filter(b => {
                        if (b.closest('pre')) return false;
                        const cName = b.className || '';
                        if (typeof cName === 'string' && (cName.includes('copy-code') || cName.includes('absolute'))) return false;


                        const pathEl = b.querySelector('svg path');
                        if (!pathEl) return false;
                        const d = pathEl.getAttribute('d') || '';
                        return d.startsWith('M12.668');
                    });


                    if (validButtons.length > 0) {
                        const targetBtn = validButtons[validButtons.length - 1];
                        targetBtn.click();
                        await new Promise(r => setTimeout(r, 200));


                        if (navigator.clipboard && navigator.clipboard.readText) {
                            const clipText = await navigator.clipboard.readText();
                            if (clipText && clipText.trim().length > 0) {
                                return sanitizeMarkdownArtifacts(clipText);
                            }
                        }
                    }
                } catch (err) {
                    console.warn('⚠️ [AI Copy] Z.AI 原生代理複製失敗，降級至 DOM 轉譯:', err);
                }
                return domToMarkdown(node, Adapters.Zai.cleanNode);
            },
            cleanNode: (node) => {
                const clone = node.cloneNode(true);
                cleanUniversalNoise(clone);
                clone.querySelectorAll('.copy-code-button, button.invisible, button.group-hover\\:visible').forEach(el => el.remove());
                return clone;
            }
        },
        MiniMax: {
            id: 'minimax',
            name: 'MiniMax',
            isMatch: () => location.hostname.includes('agent.minimax.io') || location.hostname.includes('minimax.io'),
            getAiNodes: () => {
                const rawNodes = Array.from(document.querySelectorAll('[data-role="assistant"] .mavis-chat-markdown-flow, [data-testid="message-item"][data-role="assistant"] .mavis-chat-markdown-flow, .mavis-chat-markdown-flow'));
                return rawNodes.filter(node => {
                    if (node.closest(`#${UI_CONTAINER_ID}`) || node.closest(`#${FLOATING_ORB_ID}`)) return false;
                    return node.innerText && node.innerText.trim().length > 0;
                });
            },
            getUserNodes: () => {
                const rawNodes = Array.from(document.querySelectorAll('.message-container-user-text, [data-role="user"] .message-container-user-text'));
                return rawNodes.filter(node => node.innerText && node.innerText.trim().length > 0);
            },
            cleanNode: (node) => {
                const clone = node.cloneNode(true);
                cleanUniversalNoise(clone);
                clone.querySelectorAll('button, svg, .ant-dropdown, [class*="action-bar"]').forEach(el => el.remove());
                return clone;
            }
        }
    };


    function getCurrentAdapter() {
        if (Adapters.ChatGPT.isMatch()) return Adapters.ChatGPT;
        if (Adapters.Claude.isMatch()) return Adapters.Claude;
        if (Adapters.DeepSeek.isMatch()) return Adapters.DeepSeek;
        if (Adapters.Qwen.isMatch()) return Adapters.Qwen;
        if (Adapters.Kimi.isMatch()) return Adapters.Kimi;
        if (Adapters.Zhipu.isMatch()) return Adapters.Zhipu;
        if (Adapters.AiStudio.isMatch()) return Adapters.AiStudio;
        if (Adapters.Mistral.isMatch()) return Adapters.Mistral;
        if (Adapters.Perplexity.isMatch()) return Adapters.Perplexity;
        if (Adapters.Zai.isMatch()) return Adapters.Zai;
        if (Adapters.MiniMax.isMatch()) return Adapters.MiniMax;
        return null;
    }


    // ==========================================
    // 7. 切片雙引擎、Claude、Z.AI 與 MiniMax 預覽提取管線
    // ==========================================
    function isClaudeArtifactActive() {
        const candidates = Array.from(document.querySelectorAll('[data-testid*="artifact"], [class*="artifact"], .font-mono, [role="region"], [aria-label*="Artifact"]'));
        for (const el of candidates) {
            const rect = el.getBoundingClientRect();
            if (rect.left > window.innerWidth * 0.4 && rect.width > 200 && rect.height > 100) {
                return true;
            }
        }
        return false;
    }


    function isZaiPreviewActive() {
        // 1. Z.AI 右側抽屜 Markdown Prose
        const proseViewers = Array.from(document.querySelectorAll('.markdown-prose, [class*="markdown-prose"]'));
        for (const p of proseViewers) {
            const rect = p.getBoundingClientRect();
            if (rect.left > window.innerWidth * 0.35 && rect.width > 200) {
                const txt = (p.innerText || p.textContent || '').trim();
                if (txt.length > 50) return true;
            }
        }


        // 2. DOCX Viewer
        const docxViewer = document.querySelector('.DocxViewer, div.docx-wrapper, section.docx');
        if (docxViewer) {
            const rect = docxViewer.getBoundingClientRect();
            if (rect.width > 100 && rect.height > 100) return true;
        }


        // 3. CodeMirror 6
        const cmViewers = Array.from(document.querySelectorAll('.cm-editor, .cm-content'));
        for (const cm of cmViewers) {
            const rect = cm.getBoundingClientRect();
            if (rect.width > 200 && rect.height > 200 && rect.right > window.innerWidth * 0.5) {
                return true;
            }
        }
        return false;
    }


    function isMiniMaxPreviewActive() {
        const previewers = Array.from(document.querySelectorAll('div[data-testid="previewer-content"], div[data-testid="markdown-view"]'));
        for (const p of previewers) {
            const rect = p.getBoundingClientRect();
            if (rect.width > 200 && rect.height > 200) return true;
        }
        return false;
    }


    function parseDocxToMarkdown(viewerEl) {
        if (!viewerEl) return '';
        const clone = viewerEl.cloneNode(true);
        cleanUniversalNoise(clone);


        function walkDocxNode(node) {
            if (!node) return '';
            if (node.nodeType === Node.TEXT_NODE) return node.textContent;
            if (node.nodeType !== Node.ELEMENT_NODE) return '';


            const tag = node.tagName.toLowerCase();
            if (tag === 'table') {
                return parseTableToMarkdown(node);
            }
            if (/^h[1-6]$/.test(tag)) {
                const level = parseInt(tag[1], 10);
                return `\n\n${'#'.repeat(level)} ${walkDocxChildren(node).trim()}\n\n`;
            }
            if (tag === 'p' || tag === 'div') {
                const text = walkDocxChildren(node).trim();
                return text ? `\n\n${text}\n\n` : '';
            }
            if (tag === 'br') return '\n';
            if (tag === 'ul' || tag === 'ol') {
                const isOrdered = tag === 'ol';
                let itemsMd = '';
                let index = 1;
                Array.from(node.children).forEach(child => {
                    if (child.tagName.toLowerCase() === 'li') {
                        itemsMd += `${isOrdered ? `${index++}. ` : '* '}${walkDocxChildren(child).trim()}\n`;
                    }
                });
                return `\n\n${itemsMd}\n\n`;
            }
            if (tag === 'strong' || tag === 'b') return `**${walkDocxChildren(node)}**`;
            if (tag === 'em' || tag === 'i') return `*${walkDocxChildren(node)}*`;
            return walkDocxChildren(node);
        }


        function walkDocxChildren(node) {
            let res = '';
            node.childNodes.forEach(c => { res += walkDocxNode(c); });
            return res;
        }


        const rawMd = walkDocxNode(clone);
        return rawMd.replace(/\n{3,}/g, '\n\n').trim();
    }


    function getZaiPreviewText() {
        // 1. 優先檢索右側抽屜 Markdown Prose
        const proseViewers = Array.from(document.querySelectorAll('.markdown-prose, [class*="markdown-prose"]'));
        for (const p of proseViewers) {
            const rect = p.getBoundingClientRect();
            if (rect.left > window.innerWidth * 0.35 && rect.width > 200) {
                const md = parseZaiProseToMarkdown(p).replace(/\n{3,}/g, '\n\n').trim();
                if (md && md.length > 30) return md;
            }
        }


        // 2. DOCX Viewer
        const docxViewer = document.querySelector('.DocxViewer, div.docx-wrapper, section.docx');
        if (docxViewer) {
            const rect = docxViewer.getBoundingClientRect();
            if (rect.width > 100 && rect.height > 100) {
                const mdText = parseDocxToMarkdown(docxViewer);
                return mdText ? mdText.trim() : '';
            }
        }


        // 3. CodeMirror 6
        const cmViewers = Array.from(document.querySelectorAll('.cm-editor, .cm-content'));
        for (const cm of cmViewers) {
            const rect = cm.getBoundingClientRect();
            if (rect.width > 200 && rect.height > 200 && rect.right > window.innerWidth * 0.5) {
                const cmLines = Array.from(cm.querySelectorAll('.cm-line'));
                let codeText = '';
                if (cmLines.length > 0) {
                    codeText = cmLines.map(ln => ln.textContent || '').join('\n');
                } else {
                    codeText = cm.innerText || cm.textContent || '';
                }
                return codeText ? codeText.trim() : '';
            }
        }
        return '';
    }


    function closeZaiPreviewDrawer() {
        const candidates = Array.from(document.querySelectorAll('button, [role="button"]'));
        const closeBtn = candidates.find(btn => {
            const rect = btn.getBoundingClientRect();
            if (rect.left <= window.innerWidth * 0.5 || rect.top > 120) return false;
            const txt = (btn.textContent || btn.getAttribute('aria-label') || btn.getAttribute('title') || '').trim();
            if (/close|關閉|关闭|exit/i.test(txt)) return true;
            const svgPath = btn.querySelector('svg path');
            if (svgPath) {
                const d = svgPath.getAttribute('d') || '';
                if (d.includes('M6 18') || d.includes('M18 6') || d.includes('19 6.41') || d.includes('6.41 19')) {
                    return true;
                }
            }
            return false;
        });
        if (closeBtn) {
            closeBtn.click();
            return true;
        }
        return false;
    }


    async function getClaudeDeliverableText() {
        if (!isClaudeArtifactActive()) return null;


        const allButtons = Array.from(document.querySelectorAll('button'));
        const copyBtns = allButtons.filter(b => {
            const rect = b.getBoundingClientRect();
            if (rect.top >= 80 || rect.left <= window.innerWidth * 0.5 || rect.width <= 20) return false;
            const txt = (b.textContent || b.getAttribute('aria-label') || '').trim();
            return /^(複製|Copy)$/i.test(txt);
        });


        if (copyBtns.length === 0) {
            // 嘗試檢索 Artifacts 容器內的 DOM 轉譯
            const artifactRegion = document.querySelector('[data-testid*="artifact"], [class*="artifact"], [role="region"]');
            if (artifactRegion) {
                return domToMarkdown(artifactRegion, Adapters.Claude.cleanNode);
            }
            return null;
        }


        const targetBtn = copyBtns[copyBtns.length - 1];
        targetBtn.click();
        await new Promise(r => setTimeout(r, 200));


        // 【Hotfix-01】：以 try-catch 包覆讀取並於異常時平滑降級至 DOM 轉譯
        if (navigator.clipboard && navigator.clipboard.readText) {
            try {
                const clipText = await navigator.clipboard.readText();
                if (clipText && clipText.trim().length > 0) {
                    return clipText.trim();
                }
            } catch (clipErr) {
                console.warn('⚠️ [AI Copy] Claude 剪貼簿讀取受阻，降級至 DOM 轉譯:', clipErr);
            }
        }


        // 若剪貼簿讀取失敗或拒絕，自動降級嘗試 DOM 轉譯提取
        const artifactRegion = document.querySelector('[data-testid*="artifact"], [class*="artifact"], [role="region"]');
        if (artifactRegion) {
            return domToMarkdown(artifactRegion, Adapters.Claude.cleanNode);
        }
        return null;
    }


    async function handleClaudePreviewAction() {
        const text = await getClaudeDeliverableText();
        if (!text || !text.trim()) {
            showToast('⚠️ 右側無 Artifacts 成果物，已為您複製最後對話內容！', false, 2600);
            await handleCopyAction('SINGLE_CLEAN');
            return;
        }
        copyToClipboard(text);
        showToast(`✅ 已複製右側 Artifacts 成果物 (共 ${text.length} 字)！`);
    }


    async function getZaiDeliverableText() {
        const isDrawerOpen = isZaiPreviewActive();


        // 1. 定位最新回覆輪次 (Last AI Turn)
        const aiNodes = Adapters.Zai.getAiNodes();
        let lastTurnContainer = null;
        if (aiNodes.length > 0) {
            const lastAiNode = aiNodes[aiNodes.length - 1];
            lastTurnContainer = lastAiNode.closest('.chat-assistant, [class*="chat-assistant"]') || lastAiNode.parentElement;
        }


        // 2. 檢索最新一輪內部是否具備預覽按鈕
        let targetBtn = null;
        if (lastTurnContainer) {
            const allButtons = Array.from(lastTurnContainer.querySelectorAll('button, [role="button"]'));
            const previewButtons = allButtons.filter(b => {
                const txt = (b.textContent || '').trim();
                const aria = b.getAttribute('aria-label') || '';
                const title = b.getAttribute('title') || '';
                return /^(预览|預覽)$/i.test(txt) || title.includes('预览') || title.includes('預覽') || aria.includes('预览') || aria.includes('預覽');
            });
            if (previewButtons.length > 0) {
                targetBtn = previewButtons[previewButtons.length - 1];
            }
        }


        // 3. 判定無成果物出口：若無按鈕且抽屜未開，判定此輪為純文字對話，返回 null
        if (!targetBtn && !isDrawerOpen) {
            return null;
        }


        // 4. 舊抽屜銷毀清場：若抽屜開啟且有新預覽按鈕，先關閉並讓步 250ms
        if (isDrawerOpen && targetBtn) {
            closeZaiPreviewDrawer();
            await new Promise(r => setTimeout(r, 250));
        }


        // 5. 抽屜已開啟且無新按鈕：直接提取當前抽屜內容
        if (!targetBtn && isDrawerOpen) {
            const currentText = getZaiPreviewText();
            return (currentText && currentText.trim()) ? currentText : null;
        }


        // 6. 觸發開門與水合煞車輪詢
        showToast('⏳ 正在自動開啟 Z.AI 成果物抽屜...');
        targetBtn.click();


        const startTime = Date.now();
        let text = '';
        let lastObservedText = '';
        let stableRounds = 0;


        while (Date.now() - startTime < 10000) {
            await new Promise(r => setTimeout(r, 200));
            text = getZaiPreviewText();
            if (text && text.length > 30) {
                if (text === lastObservedText) {
                    stableRounds++;
                    if (stableRounds >= 2) break; // 連續 400ms 水合沈澱煞車
                } else {
                    lastObservedText = text;
                    stableRounds = 0;
                }
            }
        }


        await new Promise(r => setTimeout(r, 150));
        const finalText = text || getZaiPreviewText();
        return (finalText && finalText.trim()) ? finalText : null;
    }


    async function handleZaiPreviewAction() {
        const text = await getZaiDeliverableText();
        if (!text || !text.trim()) {
            showToast('⚠️ 右側無檔案預覽，已為您複製最後對話內容！', false, 2600);
            await handleCopyAction('SINGLE_CLEAN');
            return;
        }
        copyToClipboard(text);
        showToast(`✅ 已複製右側預覽 (共 ${text.length} 字)！`);
    }


    function injectMiniMaxFiberBridge() {
        if (document.getElementById('minimax-fiber-bridge')) return;
        const script = document.createElement('script');
        script.id = 'minimax-fiber-bridge';
        script.textContent = `(${function () {
            window.addEventListener('__MINIMAX_EXTRACT_REQUEST__', () => {
                const root = document.querySelector('div[data-testid="markdown-view"]') || document.querySelector('div[data-testid="previewer-content"]');
                if (!root) {
                    window.dispatchEvent(new CustomEvent('__MINIMAX_EXTRACT_RESPONSE__', {
                        detail: { success: false, markdown: '', fromFiber: false, msg: '未偵測到成果物容器' }
                    }));
                    return;
                }

                let rawMarkdown = '';
                let fromFiber = false;

                try {
                    const fiberKey = Object.keys(root).find(k => k.startsWith('__reactFiber$'));
                    if (fiberKey) {
                        let current = root[fiberKey];
                        let depth = 0;
                        while (current && depth < 30) {
                            if (current.memoizedProps) {
                                for (const key of Object.keys(current.memoizedProps)) {
                                    const val = current.memoizedProps[key];
                                    if (typeof val === 'string' && val.length > 100 && /(^#|\n#|\*\*|> )/.test(val)) {
                                        rawMarkdown = val;
                                        fromFiber = true;
                                        break;
                                    }
                                }
                            }
                            if (fromFiber) break;

                            if (current.memoizedState) {
                                let s = current.memoizedState;
                                while (s) {
                                    if (typeof s.memoizedState === 'string' && s.memoizedState.length > 100 && /(^#|\n#|\*\*|> )/.test(s.memoizedState)) {
                                        rawMarkdown = s.memoizedState;
                                        fromFiber = true;
                                        break;
                                    }
                                    s = s.next;
                                }
                            }
                            if (fromFiber) break;

                            current = current.return;
                            depth++;
                        }
                    }
                } catch (err) {
                    console.warn('[AI Copy] Fiber 提取異常:', err);
                }

                if (!rawMarkdown) {
                    rawMarkdown = (root.innerText || root.textContent || '').trim();
                }

                window.dispatchEvent(new CustomEvent('__MINIMAX_EXTRACT_RESPONSE__', {
                    detail: { success: true, markdown: rawMarkdown, fromFiber: fromFiber, msg: '' }
                }));
            });
        }.toString()})();`;
        (document.head || document.documentElement).appendChild(script);
    }


    async function getMiniMaxDeliverableText() {
        injectMiniMaxFiberBridge();
        const isDrawerOpen = isMiniMaxPreviewActive();


        if (isDrawerOpen) {
            const closeBtn = document.querySelector('button[data-testid="file-tab-close"], div[data-testid="file-panel-close-button"]');
            if (closeBtn) {
                closeBtn.click();
                await new Promise(r => setTimeout(r, 200));
            }
        }


        const allButtons = Array.from(document.querySelectorAll('button'));
        const openButtons = allButtons.filter(b => (b.textContent || '').includes('Open file'));


        if (openButtons.length === 0) return null;


        const matchedBtn = openButtons.slice().reverse().find(b => {
            const card = b.closest('[class*="card"], [class*="message"], [data-role="assistant"]') || b.parentElement;
            const txt = card ? card.textContent : '';
            return /QA|審查|驗收|報告|MD|Artifact/i.test(txt);
        });


        const targetBtn = matchedBtn || openButtons[openButtons.length - 1];
        showToast('⏳ 正在自動開啟成果物抽屜...');
        targetBtn.click();


        const startTime = Date.now();
        let isReady = false;
        let lastObservedText = '';
        let stableRounds = 0;


        // 【Hotfix-03】：下放文字長度門檻至 > 0，並增加逾時非空兜底
        while (Date.now() - startTime < 10000) {
            const drawer = document.querySelector('div[data-testid="markdown-view"], div[data-testid="previewer-content"]');
            if (drawer) {
                const txt = (drawer.innerText || drawer.textContent || '').trim();
                if (txt.length > 0) {
                    if (txt === lastObservedText) {
                        stableRounds++;
                        if (stableRounds >= 2) {
                            isReady = true;
                            break; // 連續 400ms 水合煞車
                        }
                    } else {
                        lastObservedText = txt;
                        stableRounds = 0;
                    }
                }
            }
            await new Promise(r => setTimeout(r, 200));
        }


        // 兜底保底：若因極端延遲未達煞車，只要內容非空仍判定就緒
        if (!isReady && lastObservedText.length > 0) {
            isReady = true;
        }


        if (!isReady) return null;


        let extractResult = null;
        try {
            extractResult = await new Promise((resolve) => {
                const timer = setTimeout(() => {
                    window.removeEventListener('__MINIMAX_EXTRACT_RESPONSE__', onResponse);
                    resolve({ success: false, markdown: '', fromFiber: false, msg: '提取超時' });
                }, 3000);


                function onResponse(e) {
                    clearTimeout(timer);
                    window.removeEventListener('__MINIMAX_EXTRACT_RESPONSE__', onResponse);
                    resolve(e.detail || { success: false, markdown: '', fromFiber: false });
                }


                window.addEventListener('__MINIMAX_EXTRACT_RESPONSE__', onResponse);
                window.dispatchEvent(new CustomEvent('__MINIMAX_EXTRACT_REQUEST__'));
            });
        } catch (e) {
            console.warn('⚠️ [AI Copy] Fiber 橋接通訊異常:', e);
        }


        let contentText = '';
        let fromFiber = false;


        if (extractResult && extractResult.success && extractResult.markdown) {
            contentText = extractResult.markdown;
            fromFiber = !!extractResult.fromFiber;
        } else {
            const fallbackEl = document.querySelector('div[data-testid="markdown-view"], div[data-testid="previewer-content"]');
            contentText = fallbackEl ? (fallbackEl.innerText || fallbackEl.textContent || '').trim() : '';
        }


        // 僅保留 150ms 微任務延遲
        await new Promise(r => setTimeout(r, 150));


        return { contentText, fromFiber };
    }


    async function handleMiniMaxDeliverableCopyAction() {
        const result = await getMiniMaxDeliverableText();
        if (!result || !result.contentText || !result.contentText.trim()) {
            showToast('⚠️ 未能提取到有效的成果物內容！', true, 3000);
            return;
        }


        const { contentText, fromFiber } = result;
        copyToClipboard(contentText.trim());
        showToast(`✅ 已成功複製成果物 (${fromFiber ? '無損 Raw MD' : '降級文本'}，共 ${contentText.length} 字)！`);
    }


    async function getAssistantMarkdownText(adapter) {
        const aiNodes = adapter.getAiNodes();
        if (aiNodes.length === 0) return '';
        const lastAi = aiNodes[aiNodes.length - 1];


        let markdownText = '';
        if (typeof adapter.getMarkdownAsync === 'function') {
            markdownText = await adapter.getMarkdownAsync(lastAi);
        } else {
            markdownText = domToMarkdown(lastAi, adapter.cleanNode);
        }


        if (!markdownText || !markdownText.trim()) {
            markdownText = adapter.cleanNode(lastAi).innerText.trim();
        }
        return markdownText;
    }


    function executeSingleMatchSlice(fullText, singlePattern, isCodeBlockTarget) {
        if (!singlePattern || !singlePattern.trim()) return null;
        try {
            let patternStr = singlePattern.trim();
            let flagsStr = 'i';


            if (patternStr.startsWith('/') && patternStr.length > 1) {
                const lastSlashIndex = findRegexClosingSlash(patternStr);
                if (lastSlashIndex > 0) {
                    flagsStr = patternStr.substring(lastSlashIndex + 1);
                    patternStr = patternStr.substring(1, lastSlashIndex);
                }
            }


            // 代碼塊目標解耦 i 旗標，強制補齊 g
            if (isCodeBlockTarget && !flagsStr.includes('g')) {
                flagsStr += 'g';
            }


            let regex = new RegExp(patternStr, flagsStr);


            if (isCodeBlockTarget && regex.global) {
                const matches = Array.from(fullText.matchAll(regex));
                if (matches.length > 0) {
                    let maxLen = -1;
                    let bestMatch = '';
                    matches.forEach(m => {
                        const candidate = (typeof m[1] !== 'undefined') ? m[1] : m[0];
                        if (candidate && candidate.length > maxLen) {
                            maxLen = candidate.length;
                            bestMatch = candidate;
                        }
                    });
                    if (maxLen >= 0) return bestMatch;
                }
            } else {
                const match = fullText.match(regex);
                if (match) {
                    return (typeof match[1] !== 'undefined') ? match[1] : match[0];
                }
            }
        } catch (err) {
            console.warn('⚠️ [AI Copy] 切片正則解析異常:', err, singlePattern);
        }
        return null;
    }


    function executeMatchSlice(fullText, rawPattern, isCodeBlockTarget) {
        if (!rawPattern || !rawPattern.trim()) return null;
        if (rawPattern.includes('\n')) {
            const lines = rawPattern.split('\n');
            for (let line of lines) {
                line = line.trim();
                if (!line || line.startsWith('#') || line.startsWith('//')) continue;
                const res = executeSingleMatchSlice(fullText, line, isCodeBlockTarget);
                if (res !== null) return res;
            }
            return null;
        }
        return executeSingleMatchSlice(fullText, rawPattern, isCodeBlockTarget);
    }


    function sanitizeAffixText(text) {
        if (!text) return '';
        let result = text
            .replace(/^\uFEFF/, '')
            .replace(/\r\n/g, '\n')
            .replace(/\r/g, '\n')
            .replace(/\u00a0/g, ' ');


        result = result.replace(/^[ \t]*[—―─_–-]{2,}[ \t]*$/gm, '---');
        result = result.trimEnd();
        result = result.replace(/[—―─]{1,2}-?$/g, '---');


        if (result.length > 0) {
            result += '\n\n';
        }
        return result;
    }


    async function resolveAffixContent(rawAffixStr, affixType = '前綴') {
        if (typeof rawAffixStr !== 'string' || !rawAffixStr) return { content: '', isDegraded: false };
        const trimmed = rawAffixStr.trim();
        if (!trimmed) return { content: '', isDegraded: false };


        const isUrl = /^[^\S\r\n]*https?:\/\/[^\s]+[^\S\r\n]*$/i.test(rawAffixStr);
        if (!isUrl) {
            return { content: rawAffixStr, isDegraded: false };
        }


        showToast(`⏳ 正在從雲端載入${affixType}...`);
        try {
            const rawUrl = getGoogleDocRawUrl(trimmed);
            const rawText = await fetchCloudData(rawUrl);


            if (isHtmlResponse(rawText)) {
                return { content: '', isDegraded: true };
            }
            return { content: sanitizeAffixText(rawText), isDegraded: false };
        } catch (err) {
            console.warn(`⚠️ [AI Copy] 雲端${affixType}載入失敗:`, err);
            return { content: '', isDegraded: true };
        }
    }


    // 【切片酬載組合演算法 (composeSlicePayload)】
    function composeSlicePayload(prefix, body, rawSuffix) {
        const p = prefix ?? '';
        const b = (body ?? '').trim();
        const s = rawSuffix ?? '';
        let tail = '\n\n';
        if (s.endsWith('\n\n')) {
            tail = s;
        } else if (s.endsWith('\n')) {
            tail = s + '\n';
        } else if (s.length > 0) {
            tail = s + '\n\n';
        }
        return `${p}${b}${tail}`;
    }


    async function handleSliceCopyAction(btnDef) {
        const adapter = getCurrentAdapter();
        if (!adapter) {
            showToast('⚠️ 未辨識出目前運行的 AI 平台！', true);
            return;
        }


        if (!btnDef || !btnDef.enabled) {
            showToast('⚠️ 切片規則不存在或未啟用！', true);
            return;
        }


        const fullText = await getAssistantMarkdownText(adapter);
        if (!fullText || !fullText.trim()) {
            showToast('⚠️ 未找到回覆內容！', true);
            return;
        }


        const rawPattern = (btnDef.pattern || '').trim();
        const rawPrefix = (typeof btnDef.prefix === 'string') ? btnDef.prefix : '';
        const rawSuffix = (typeof btnDef.suffix === 'string') ? btnDef.suffix : '';


        const prefixRes = await resolveAffixContent(rawPrefix, '前綴');
        let safePrefix = prefixRes.content;
        const prefixDegraded = prefixRes.isDegraded;


        if (safePrefix && safePrefix.trim().length > 0 && !safePrefix.endsWith('\n')) {
            safePrefix += '\n\n';
        }


        if (btnDef.autoDivider === true && safePrefix && safePrefix.trim().length > 0) {
            const trimmedPrefix = safePrefix.trimEnd();
            const prefixLines = trimmedPrefix.split('\n').filter(l => l.trim().length > 0);
            const lastLine = prefixLines.length > 0 ? prefixLines[prefixLines.length - 1].trim() : '';
            const dividerRegex = /^(?:[-=*_~—–─]{2,}|[-=*_~—–─]{2,}.+[-=*_~—–─]{2,})$/;


            if (!dividerRegex.test(lastLine)) {
                safePrefix = safePrefix.trimEnd() + '\n\n---\n\n';
            }
        }


        let safeSuffix = rawSuffix;
        if (safeSuffix === '\n' || safeSuffix === '\n\n') {
            // 原樣保留純換行
        } else if (safeSuffix) {
            const suffixRes = await resolveAffixContent(safeSuffix, '後綴');
            safeSuffix = suffixRes.content;
            if (safeSuffix && safeSuffix.trim().length > 0 && !safeSuffix.startsWith('\n')) {
                safeSuffix = '\n\n' + safeSuffix;
            }
        }


        let finalSuffix = safeSuffix;
        if (btnDef.id === 'm1_btn_3' && !finalSuffix) {
            finalSuffix = '\n\n';
        }


        if (btnDef.mode === 'replace') {
            let targetText = fullText;
            if (rawPattern) {
                try {
                    let regex = null;
                    if (rawPattern.startsWith('/') && rawPattern.length > 1) {
                        const lastSlashIndex = findRegexClosingSlash(rawPattern);
                        if (lastSlashIndex > 0) {
                            const p = rawPattern.substring(1, lastSlashIndex);
                            const f = rawPattern.substring(lastSlashIndex + 1);
                            regex = new RegExp(p, f);
                        } else {
                            regex = new RegExp(rawPattern, 'gi');
                        }
                    } else {
                        regex = new RegExp(rawPattern, 'gi');
                    }
                    targetText = fullText.replace(regex, btnDef.replaceValue || '');
                } catch (e) {
                    console.warn('⚠️ [AI Copy] 替換正則語法無效:', e);
                    showToast('❌ 替換正則語法無效，操作已中止！', true, 4000);
                    return;
                }
            }
            const finalPayload = composeSlicePayload(safePrefix, targetText, finalSuffix);
            copyToClipboard(finalPayload);
            if (prefixDegraded) {
                showToast(`⚠️ 雲端前綴載入失敗，本次複製已自動省略前綴！ (已局部清洗：「${btnDef.name}」)`);
            } else {
                showToast(`🧹 已局部清洗：「${btnDef.name}」！`);
            }
            return;
        }


        let targetText = null;
        let usedFallback = false;


        if (rawPattern) {
            targetText = executeMatchSlice(fullText, rawPattern, !!btnDef.isCodeBlockTarget);
        }


        if (targetText === null && btnDef.fallbackPattern && btnDef.fallbackPattern.trim()) {
            targetText = executeMatchSlice(fullText, btnDef.fallbackPattern.trim(), !!btnDef.isCodeBlockTarget);
            if (targetText !== null) {
                usedFallback = true;
            }
        }


        if (targetText !== null) {
            const finalPayload = composeSlicePayload(safePrefix, targetText, finalSuffix);
            copyToClipboard(finalPayload);


            if (prefixDegraded) {
                showToast(`⚠️ 雲端前綴載入失敗，本次複製已自動省略前綴！ (已截取：「${btnDef.name}」)`);
            } else if (safePrefix && safePrefix.trim()) {
                showToast(`✂️ 已截取 (含專屬前綴)：「${btnDef.name}」！`);
            } else if (usedFallback) {
                showToast(`🛟 已由備援正則截取：「${btnDef.name}」！`);
            } else {
                showToast(`✂️ 已精準截取：「${btnDef.name}」！`);
            }
        } else {
            const fallbackAction = globalConfig.aiStudioSettings?.fallbackAction || 'warn_block';
            if (fallbackAction === 'warn_block') {
                showToast(`🛑 截取失敗：未找到「${btnDef.name}」目標錨點！`, true, 4000);
            } else if (fallbackAction === 'lenient_full') {
                const finalPayload = composeSlicePayload(safePrefix, fullText, finalSuffix);
                copyToClipboard(finalPayload);
                showToast(`⚠️ 未在回覆中找到目標錨點，已複製全量文本！`);
            } else if (fallbackAction === 'custom_string') {
                const placeholder = globalConfig.aiStudioSettings?.fallbackCustomText || '[ERROR: 錨點切片未命中]';
                const finalPayload = composeSlicePayload(safePrefix, placeholder, safeSuffix);
                copyToClipboard(finalPayload);
                showToast(`⚠️ 未命中目標錨點，已複製失敗佔位字串！`);
            }
        }
    }


    // ==========================================
    // 7.1 跨站點採集多態提取 (Claude / Z.AI 智能階梯降級支援)
    // ==========================================
    async function extractSiteTextByAction(adapter, action) {
        let rawText = null;


        if (action === 'PREVIEW' || action === 'PREVIEW_CLEAN') {
            if (adapter.id === 'claude') {
                const deliverableText = await getClaudeDeliverableText();
                if (deliverableText && deliverableText.trim()) {
                    rawText = deliverableText;
                } else {
                    rawText = await getAssistantMarkdownText(adapter);
                }
            } else if (adapter.id === 'zai') {
                const deliverableText = await getZaiDeliverableText();
                if (deliverableText && deliverableText.trim()) {
                    rawText = deliverableText;
                } else {
                    rawText = await getAssistantMarkdownText(adapter);
                }
            } else if (adapter.id === 'minimax') {
                const res = await getMiniMaxDeliverableText();
                if (!res || !res.contentText || !res.contentText.trim()) {
                    showToast('⚠️ MiniMax 成果物抽屜未開啟或加載逾時！', true);
                    return null;
                }
                rawText = res.contentText.trim();
            } else {
                rawText = await getAssistantMarkdownText(adapter);
            }
        } else {
            rawText = await getAssistantMarkdownText(adapter);
        }


        if (!rawText || !rawText.trim()) return null;


        // 純淨模式：絕不附加前後綴
        if (action === 'SINGLE_CLEAN' || action === 'PREVIEW_CLEAN') {
            return rawText.trim();
        }


        // 一般模式 (SINGLE / PREVIEW)：裝配 Profile 前後綴
        const activeProfile = globalConfig.profiles?.[globalConfig.activeProfileId];
        let prefix = '';
        let suffix = '\n\n';


        if (activeProfile && activeProfile.enabled) {
            if (activeProfile.enablePrefix !== false) {
                const pText = (activeProfile.prefixes && activeProfile.prefixes[adapter.id]) || '';
                prefix = pText ? (pText.endsWith('\n') ? pText : pText + '\n') : '';
            }
            if (activeProfile.enableSuffix !== false) {
                suffix = (activeProfile.suffixes && activeProfile.suffixes[adapter.id]) ?? '\n\n';
            }
        }


        return `${prefix}${rawText.trim()}${suffix}`;
    }


    async function handleCopyAction(mode) {
        const adapter = getCurrentAdapter();
        if (!adapter) {
            showToast('⚠️ 未辨識出目前運行的 AI 平台！', true);
            return;
        }


        const activeProfile = globalConfig.profiles?.[globalConfig.activeProfileId];
        let prefix = '';
        let suffix = '';


        if (mode === 'SINGLE' || mode === 'FULL_THREAD') {
            if (activeProfile && activeProfile.enabled) {
                if (activeProfile.enablePrefix !== false) {
                    const pText = (activeProfile.prefixes && activeProfile.prefixes[adapter.id]) || '';
                    prefix = pText ? (pText.endsWith('\n') ? pText : pText + '\n') : '';
                }
                if (activeProfile.enableSuffix !== false) {
                    suffix = (activeProfile.suffixes && activeProfile.suffixes[adapter.id]);
                    if (typeof suffix === 'undefined') suffix = '\n\n';
                }
            }
        }


        if (mode === 'SINGLE' || mode === 'SINGLE_CLEAN') {
            const markdownText = await getAssistantMarkdownText(adapter);
            if (!markdownText || !markdownText.trim()) {
                showToast(`⚠️ 未找到 ${adapter.name} 的回覆內容！`, true);
                return;
            }


            let finalText = '';
            if (mode === 'SINGLE_CLEAN') {
                finalText = markdownText;
            } else {
                finalText = `${prefix}${markdownText}${suffix}`;
            }


            copyToClipboard(finalText);
            const isClean = mode === 'SINGLE_CLEAN';
            showToast(`✅ 已複製 ${adapter.name} ${isClean ? '乾淨回覆 (無前後綴)' : '最後回覆'}！${(!isClean && (prefix || suffix)) ? ' (含自訂格式)' : ''}`);


        } else if (mode === 'FULL_THREAD') {
            if (adapter.id === 'aistudio' || adapter.id === 'mistral') {
                showToast(`⚠️ ${adapter.name} 專用模式僅支援複製最後回覆！`, true);
                return;
            }


            const aiNodes = adapter.getAiNodes();
            const userNodes = adapter.getUserNodes();


            const allMessages = [];
            userNodes.forEach(node => allMessages.push({ node, isUser: true }));
            aiNodes.forEach(node => allMessages.push({ node, isUser: false }));


            allMessages.sort((a, b) => (a.node.compareDocumentPosition(b.node) & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1);


            if (allMessages.length === 0) {
                showToast('⚠️ 未找到對話內容！', true);
                return;
            }


            let fullText = '';
            for (const msg of allMessages) {
                if (msg.isUser) {
                    fullText += `### 👤 User:\n${msg.node.innerText.trim()}\n\n---\n\n`;
                } else {
                    let text = domToMarkdown(msg.node, adapter.cleanNode);
                    if (!text || !text.trim()) text = adapter.cleanNode(msg.node).innerText.trim();
                    fullText += `### 🤖 ${adapter.name}:\n${text}\n\n========================================\n\n`;
                }
            }


            const body = fullText.trim();
            const finalText = `${prefix}${body}${suffix}`;
            copyToClipboard(finalText);
            showToast(`✅ 已複製 ${adapter.name} 全對話歷史！${(prefix || suffix) ? ' (含自訂格式)' : ''}`);
        }
    }


    // ==========================================
    // 7.2 跨站點採集入庫、滿額自動總結與滾動更新管線
    // ==========================================
    async function handleCaptureAction() {
        const adapter = getCurrentAdapter();
        if (!adapter) {
            showToast('⚠️ 未辨識出目前運行的 AI 平台！', true);
            return;
        }


        const siteId = adapter.id;
        const siteLabel = ALL_SITE_DEFS[siteId]?.label || adapter.name;
        const action = globalConfig.qaQueueSettings?.siteActions?.[siteId] || 'SINGLE';


        showToast(`⏳ 正在採集 ${siteLabel}...`);
        const extractedText = await extractSiteTextByAction(adapter, action);


        if (!extractedText || !extractedText.trim()) {
            showToast(`⚠️ ${siteLabel} 提取內容為空！`, true);
            return;
        }


        const activeProfile = globalConfig.profiles?.[globalConfig.activeProfileId];
        const affixTag = (activeProfile && activeProfile.enabled && activeProfile.prefixes?.[siteId]) ? activeProfile.prefixes[siteId].trim() : action;


        const queue = getQaQueue();
        queue.items[siteId] = {
            siteId: siteId,
            siteLabel: siteLabel,
            action: action,
            affixTag: affixTag,
            content: extractedText.trim() + '\n\n',
            timestamp: Date.now()
        };
        queue.lastUpdated = Date.now();
        setQaQueue(queue);


        updateGearIndicator();


        const count = Object.keys(queue.items).length;
        const targetCount = globalConfig.qaQueueSettings?.targetCount ?? 6;
        const keepQueue = globalConfig.qaQueueSettings?.keepQueueOnAutoSummary ?? true;


        // 滿額 N 站自動總結 / 滾動更新管線
        if (targetCount > 0 && count >= targetCount) {
            const items = Object.values(queue.items || {});
            const siteOrder = globalConfig.siteTabOrder || ['aistudio', 'deepseek', 'qwen', 'kimi', 'chatgpt', 'claude', 'perplexity', 'zhipu', 'zai', 'mistral', 'minimax'];
            items.sort((a, b) => {
                let idxA = siteOrder.indexOf(a.siteId);
                let idxB = siteOrder.indexOf(b.siteId);
                if (idxA === -1) idxA = 999;
                if (idxB === -1) idxB = 999;
                return idxA - idxB;
            });


            const mergedText = items.map(it => it.content.trim()).join('\n\n===\n\n') + '\n\n';
            copyToClipboard(mergedText);


            if (keepQueue) {
                showToast(`🎉 [滿額滾動更新] 已將 ${count} 站總結寫入剪貼簿！(佇列已保留，後續採集將自動追加)`, false, 3500);
            } else {
                clearQaQueue();
                showToast(`🎉 [滿額自動總結] 已合併複製 ${count} 站總結至剪貼簿！佇列已清空。`, false, 3500);
            }
            return;
        }


        const summaryKey = globalConfig.qaQueueSettings?.summaryHotkey || 'F7';
        showToast(`📥 [佇列已採集 ${count} 站] ${siteLabel} (${affixTag}) 已暫存！ (按 ${summaryKey} 總結複製)`, false, 2800);
    }


    function handleSummaryAction() {
        const queue = getQaQueue();
        const items = Object.values(queue.items || {});
        const count = items.length;


        if (count === 0) {
            showToast('ℹ️ 採集佇列目前為空，請先在 AI 頁面按採集熱鍵！', true, 2500);
            return;
        }


        const siteOrder = globalConfig.siteTabOrder || ['aistudio', 'deepseek', 'qwen', 'kimi', 'chatgpt', 'claude', 'perplexity', 'zhipu', 'zai', 'mistral', 'minimax'];
        items.sort((a, b) => {
            let idxA = siteOrder.indexOf(a.siteId);
            let idxB = siteOrder.indexOf(b.siteId);
            if (idxA === -1) idxA = 999;
            if (idxB === -1) idxB = 999;
            return idxA - idxB;
        });


        const mergedText = items.map(it => it.content.trim()).join('\n\n===\n\n') + '\n\n';
        copyToClipboard(mergedText);


        clearQaQueue();
        showToast(`🎉 已合併複製 ${count} 站 QA 總結至剪貼簿！佇列已清空。`, false, 3200);
    }


    // ==========================================
    // 8. 模組雙向輪播與膠囊調度體系 (Carousel & Capsule)
    // ==========================================
    const MODULE_SEQUENCE = ['module_1', 'module_2', 'module_3'];
    let lastWheelTimestamp = 0;


    function switchModule(direction = 'next') {
        const curMod = globalConfig.aiStudioSettings?.activeModuleId || 'module_1';
        let idx = MODULE_SEQUENCE.indexOf(curMod);
        if (idx === -1) idx = 0;


        if (direction === 'next') {
            idx = (idx + 1) % MODULE_SEQUENCE.length;
        } else {
            idx = (idx - 1 + MODULE_SEQUENCE.length) % MODULE_SEQUENCE.length;
        }


        const targetModId = MODULE_SEQUENCE[idx];
        globalConfig.aiStudioSettings.activeModuleId = targetModId;
        Storage.set(globalConfig);


        const modDef = globalConfig.aiStudioSettings.modules[targetModId];
        showToast(`🔄 已切換至：【${modDef.badgeText}】${modDef.name}`, false, 1800);
        mountUI(true);
    }


    // ==========================================
    // 9. UI 樣式注入 (含 Toast 定位、狀態燈號、穿透契約、微光虛線輪廓與綠鍵永駐)
    // ==========================================
    function injectStyles() {
        const css = `
            #${UI_CONTAINER_ID} {
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                font-size: 13px;
                color: #f3f4f6;
                z-index: 2147483640;
                position: fixed;
            }

            /* UX 穿透契約：消除空氣牆 */
            #${UI_CONTAINER_ID},
            .ai-copy-btn-bar,
            .ai-copy-btn-bar-staircase,
            .ai-copy-left-col,
            .ai-copy-right-col,
            .ai-copy-main-row,
            .ai-copy-sub-row,
            .ai-copy-sub-row-single,
            .ai-copy-sub-row-grid,
            .ai-copy-grid-row {
                pointer-events: none !important;
            }
            .ai-copy-btn,
            .ai-copy-btn-docx,
            .ai-copy-btn-purple,
            .ai-copy-capsule-btn,
            .ai-copy-icon-btn,
            .ai-copy-btn-slice,
            .ai-copy-drag-handle,
            #${FLOATING_ORB_ID} {
                pointer-events: auto !important;
            }

            /* 拖曳中微光輪廓樣式 */
            .ai-copy-is-dragging {
                outline: 1.5px dashed rgba(138, 180, 248, 0.7) !important;
                outline-offset: 3px;
                background: rgba(15, 23, 42, 0.25) !important;
                border-radius: 8px;
                box-shadow: 0 0 16px rgba(138, 180, 248, 0.15) !important;
            }

            /* 齒輪佇列動態活躍燈號 */
            .ai-copy-gear-active {
                background: #f59e0b !important;
                color: #ffffff !important;
                border: 1px solid rgba(255, 255, 255, 0.4) !important;
                box-shadow: 0 0 10px rgba(245, 158, 11, 0.7), 0 4px 12px rgba(0,0,0,0.4) !important;
                animation: ai-copy-pulse 2s infinite ease-in-out;
            }
            @keyframes ai-copy-pulse {
                0%, 100% { filter: brightness(1); }
                50% { filter: brightness(1.2); }
            }

            /* Toast 定位按鈕長亮活躍外發光 */
            .ai-copy-toast-btn-active {
                background: #6b21a8 !important;
                color: #ffffff !important;
                border: 1px solid rgba(255, 255, 255, 0.5) !important;
                box-shadow: 0 0 10px rgba(168, 85, 247, 0.8), 0 4px 12px rgba(0,0,0,0.4) !important;
            }

            #${FLOATING_ORB_ID} {
                width: 36px;
                height: 36px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: grab;
                user-select: none;
                z-index: 2147483640;
                position: fixed;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                font-size: 11px;
                font-weight: bold;
                color: #ffffff;
                text-shadow: 0 1px 2px rgba(0,0,0,0.8);
                border: 1.5px solid rgba(255, 255, 255, 0.8);
                transition: transform 0.2s ease, box-shadow 0.2s ease;
            }
            #${FLOATING_ORB_ID}:hover {
                transform: scale(1.08);
            }
            #${FLOATING_ORB_ID}:active {
                cursor: grabbing;
            }

            .ai-copy-btn-bar {
                display: flex;
                flex-direction: column;
                align-items: flex-end;
                gap: 6px;
            }

            .ai-copy-btn-bar-staircase {
                display: flex;
                flex-direction: row;
                align-items: flex-start;
                gap: 8px;
            }

            .ai-copy-drag-handle {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                width: 18px;
                height: 26px;
                color: #9ca3af;
                font-size: 14px;
                cursor: grab;
                user-select: none;
                transition: color 0.15s ease;
            }
            .ai-copy-drag-handle:hover {
                color: #f3f4f6;
            }
            .ai-copy-drag-handle:active {
                cursor: grabbing;
            }

            .ai-copy-left-col {
                display: flex;
                flex-direction: column;
                gap: 6px;
                align-items: flex-end;
            }
            .ai-copy-right-col {
                display: flex;
                flex-direction: column;
                gap: 6px;
                align-items: flex-start;
            }

            .ai-copy-main-row {
                display: flex;
                gap: 8px;
                align-items: center;
            }

            .ai-copy-sub-row {
                display: flex;
                flex-wrap: wrap;
                justify-content: flex-end;
                gap: 6px;
                max-width: 420px;
            }
            .ai-copy-sub-row-single {
                display: flex;
                flex-direction: row;
                flex-wrap: nowrap;
                justify-content: flex-end;
                gap: 6px;
            }
            .ai-copy-sub-row-grid {
                display: flex;
                flex-direction: column;
                align-items: flex-end;
                gap: 6px;
            }
            .ai-copy-grid-row {
                display: flex;
                flex-direction: row;
                gap: 6px;
                justify-content: flex-end;
            }

            .ai-copy-btn {
                background: #2563eb;
                color: #ffffff;
                border: none;
                padding: 8px 14px;
                border-radius: 20px;
                font-size: 13px;
                font-weight: 600;
                cursor: pointer;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                transition: background 0.2s ease, opacity 0.2s ease, filter 0.2s ease;
                user-select: none;
                white-space: nowrap;
            }
            .ai-copy-btn:hover { background: #1d4ed8; }

            .ai-copy-btn-docx {
                background: #10b981 !important;
                color: #ffffff !important;
                border: none;
                padding: 8px 14px;
                border-radius: 20px;
                font-size: 13px;
                font-weight: 600;
                cursor: pointer;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                transition: background 0.2s ease, opacity 0.2s ease, filter 0.2s ease;
                user-select: none;
                white-space: nowrap;
                opacity: 1 !important;
                filter: none !important;
            }
            .ai-copy-btn-docx:hover { background: #059669 !important; }
            .ai-copy-btn-docx:active { background: #047857 !important; }

            .ai-copy-btn-purple {
                background: #7c3aed;
                color: #ffffff;
                border: none;
                padding: 7px 13px;
                border-radius: 20px;
                font-size: 12px;
                font-weight: 600;
                cursor: pointer;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                transition: background 0.2s ease;
                user-select: none;
                white-space: nowrap;
            }
            .ai-copy-btn-purple:hover { background: #6d28d9; }

            .ai-copy-capsule-btn {
                border: 1px solid rgba(255,255,255,0.3);
                padding: 4px 10px;
                height: 26px;
                border-radius: 13px;
                font-size: 12px;
                font-weight: bold;
                color: #ffffff;
                cursor: pointer;
                box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                transition: transform 0.15s ease, filter 0.15s ease;
                user-select: none;
                white-space: nowrap;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .ai-copy-capsule-btn:hover {
                filter: brightness(1.15);
                transform: translateY(-1px);
            }

            .ai-copy-icon-btn {
                background: #374151;
                color: #ffffff;
                border: none;
                height: 28px;
                padding: 0 9px;
                border-radius: 14px;
                font-size: 13px;
                cursor: pointer;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                transition: background 0.2s ease, box-shadow 0.2s ease;
                user-select: none;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .ai-copy-icon-btn:hover { background: #4b5563; }

            .ai-copy-btn-slice {
                border: none;
                padding: 7px 12px;
                border-radius: 20px;
                font-size: 12px;
                font-weight: 600;
                color: #ffffff;
                cursor: pointer;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                transition: background 0.2s ease;
                user-select: none;
                white-space: nowrap;
            }
            .ai-copy-slice-0 { background: #059669; }
            .ai-copy-slice-0:hover { background: #047857; }
            .ai-copy-slice-1 { background: #d97706; }
            .ai-copy-slice-1:hover { background: #b45309; }
            .ai-copy-slice-2 { background: #0891b2; }
            .ai-copy-slice-2:hover { background: #0e7490; }
            .ai-copy-slice-3 { background: #e11d48; }
            .ai-copy-slice-3:hover { background: #be123c; }
            .ai-copy-slice-4 { background: #4f46e5; }
            .ai-copy-slice-4:hover { background: #4338ca; }

            .ai-copy-toast-node {
                position: fixed;
                bottom: 80px;
                right: 24px;
                background: linear-gradient(135deg, rgba(88, 28, 135, 0.95), rgba(124, 58, 237, 0.92));
                color: #ffffff !important;
                padding: 10px 18px;
                border-radius: 8px;
                box-shadow: 0 6px 20px rgba(0, 0, 0, 0.4), 0 0 12px rgba(124, 58, 237, 0.3) !important;
                font-size: 18px;
                font-weight: 600;
                z-index: 2147483647;
                opacity: 0;
                transition: opacity 0.3s ease, transform 0.3s ease;
                transform: translate(-50%, 10px);
                pointer-events: none;
                user-select: none;
                white-space: nowrap;
            }

            .ai-copy-toast-node.ai-copy-toast-active {
                pointer-events: auto !important;
                cursor: grab !important;
                transition: none !important;
            }
            .ai-copy-toast-node.ai-copy-toast-active:active {
                cursor: grabbing !important;
            }

            /* Modal 彈窗樣式 */
            #${MODAL_OVERLAY_ID} {
                position: fixed;
                top: 0;
                left: 0;
                width: 100vw;
                height: 100vh;
                background: rgba(0, 0, 0, 0.75);
                z-index: 2147483647;
                display: flex;
                justify-content: center;
                align-items: center;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            }

            #ai-copy-modal {
                width: 820px;
                max-width: 95vw;
                height: 620px;
                max-height: 90vh;
                background: #202124;
                color: #e8eaed;
                border: 1px solid #5f6368;
                border-radius: 8px;
                display: flex;
                flex-direction: column;
                box-shadow: 0 12px 24px rgba(0,0,0,0.6);
                overflow: hidden;
            }

            .ai-copy-modal-header {
                padding: 14px 16px;
                border-bottom: 1px solid #5f6368;
                font-size: 15px;
                font-weight: bold;
                display: flex;
                justify-content: space-between;
                align-items: center;
                background: #1e1f20;
            }
            .ai-copy-close-x {
                background: none;
                border: none;
                color: #9aa0a6;
                font-size: 20px;
                cursor: pointer;
                line-height: 1;
            }
            .ai-copy-close-x:hover { color: #fff; }

            .ai-copy-modal-body {
                display: flex;
                flex: 1;
                overflow: hidden;
            }

            .ai-copy-modal-sidebar-tabs {
                width: 165px;
                min-width: 155px;
                background: #1e1f20;
                border-right: 1px solid #5f6368;
                display: flex;
                flex-direction: column;
                gap: 4px;
                padding: 10px 0;
                flex-shrink: 0;
            }
            .ai-copy-side-tab {
                background: transparent;
                border: none;
                color: #9aa0a6;
                text-align: left;
                padding: 11px 16px;
                font-size: 13px;
                cursor: pointer;
                border-left: 3px solid transparent;
                transition: all 0.2s;
                font-weight: bold;
                outline: none;
                white-space: nowrap;
            }
            .ai-copy-side-tab:hover {
                background: rgba(255, 255, 255, 0.04);
                color: #fff;
            }
            .ai-copy-side-tab.active {
                color: #8ab4f8;
                background: rgba(138, 180, 248, 0.08);
                border-left-color: #8ab4f8;
            }

            .ai-copy-modal-content-pane {
                flex: 1;
                padding: 16px;
                overflow-y: auto;
                background: #202124;
                color: #e8eaed;
                display: flex;
                flex-direction: column;
                gap: 12px;
                box-sizing: border-box;
            }
            .ai-copy-modal-content-pane::-webkit-scrollbar { width: 6px; }
            .ai-copy-modal-content-pane::-webkit-scrollbar-thumb {
                background: #4b5563;
                border-radius: 3px;
            }

            .ai-copy-modal-footer {
                padding: 10px 16px;
                border-top: 1px solid #5f6368;
                display: flex;
                justify-content: flex-end;
                background: #1e1f20;
            }

            .ai-copy-btn-primary {
                background: #8ab4f8;
                color: #202124;
                border: none;
                padding: 6px 16px;
                border-radius: 4px;
                font-weight: bold;
                font-size: 13px;
                cursor: pointer;
                transition: background 0.2s;
            }
            .ai-copy-btn-primary:hover { background: #aecbfa; }

            .ai-copy-btn-secondary {
                background: #3c4043;
                color: #e8eaed;
                border: 1px solid #5f6368;
                padding: 6px 12px;
                border-radius: 4px;
                font-size: 12px;
                cursor: pointer;
                transition: background 0.2s;
            }
            .ai-copy-btn-secondary:hover { background: #4b5563; }

            .ai-copy-card-subtabs {
                display: flex;
                gap: 4px;
                align-items: center;
            }
            .ai-copy-card-subtab-btn {
                height: 24px;
                border-radius: 4px;
                font-size: 11px;
                font-weight: bold;
                padding: 0 8px;
                cursor: pointer;
                transition: all 0.2s;
                white-space: nowrap;
                user-select: none;
                background: transparent;
                color: #9aa0a6;
                border: 1px solid #5f6368;
            }
            .ai-copy-card-subtab-btn:hover {
                color: #ffffff;
                background: rgba(255, 255, 255, 0.05);
            }
            .ai-copy-card-subtab-btn.active {
                background: rgba(138, 180, 248, 0.15);
                color: #8ab4f8;
                border-color: #8ab4f8;
            }
        `;


        if (typeof GM_addStyle !== 'undefined') {
            GM_addStyle(css);
        } else {
            const style = document.createElement('style');
            style.textContent = css;
            (document.head || document.documentElement).appendChild(style);
        }
    }


    // ==========================================
    // 10. 座標管理、視窗邊界限制與 5px 動靜分離
    // ==========================================
    function clampContainerToViewport(container) {
        if (!container) return;
        const rect = container.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;


        let currentLeft = rect.left;
        let currentTop = rect.top;


        if (rect.bottom > vh - 10) {
            currentTop = Math.max(10, vh - rect.height - 10);
        }
        if (currentTop < 10) {
            currentTop = 10;
        }
        if (rect.right > vw - 10) {
            currentLeft = Math.max(10, vw - rect.width - 10);
        }
        if (currentLeft < 10) {
            currentLeft = 10;
        }


        container.style.left = `${currentLeft}px`;
        container.style.top = `${currentTop}px`;
        container.style.right = 'auto';
        container.style.bottom = 'auto';
    }


    function applySavedPosition(container, adapter, isOrb = false) {
        const savedPos = isOrb ? globalConfig.orbPosition : globalConfig.uiPosition;
        if (savedPos && savedPos.left && savedPos.top) {
            Object.assign(container.style, {
                position: 'fixed',
                left: savedPos.left,
                top: savedPos.top,
                right: 'auto',
                bottom: 'auto'
            });
            requestAnimationFrame(() => clampContainerToViewport(container));
        } else {
            const isAiStudio = adapter && adapter.id === 'aistudio';
            const isMistral = adapter && adapter.id === 'mistral';


            let defaultBottom = '24px';
            let defaultRight = '24px';


            if (isAiStudio) {
                defaultBottom = '80px';
                defaultRight = '24px';
            } else if (isMistral) {
                defaultBottom = '90px';
                defaultRight = '28px';
            }


            Object.assign(container.style, {
                position: 'fixed',
                bottom: defaultBottom,
                right: defaultRight,
                left: 'auto',
                top: 'auto'
            });
        }
    }


    function resetUiPosition() {
        delete globalConfig.uiPosition;
        delete globalConfig.orbPosition;
        delete globalConfig.toastPosition;
        Storage.set(globalConfig);


        const container = document.getElementById(UI_CONTAINER_ID);
        const orb = document.getElementById(FLOATING_ORB_ID);
        const toast = document.getElementById('ai-copy-toast');
        const adapter = getCurrentAdapter();


        if (container) applySavedPosition(container, adapter, false);
        if (orb) applySavedPosition(orb, adapter, true);
        if (toast) {
            applyToastPosition(toast);
            toast.style.transform = 'none';
        }


        showToast('📍 浮動列、小光球與 Toast 位置已完全重置！');
    }


    let isPointerDragging = false;


    function setupDraggableUI(container, dragHandle, isOrb = false, onClickCallback = null, isToast = false) {
        let isMoving = false;
        let startX = 0, startY = 0;
        let initialLeft = 0, initialTop = 0;


        function onMouseMove(moveEvent) {
            const dx = moveEvent.clientX - startX;
            const dy = moveEvent.clientY - startY;


            if (!isMoving && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
                isMoving = true;
                isPointerDragging = true;
                container.classList.add('ai-copy-is-dragging');
            }


            if (isMoving) {
                let newLeft = initialLeft + dx;
                let newTop = initialTop + dy;


                container.style.left = `${newLeft}px`;
                container.style.top = `${newTop}px`;
                container.style.right = 'auto';
                container.style.bottom = 'auto';


                clampContainerToViewport(container);
            }
        }


        function onMouseUp() {
            if (!isToast) {
                container.classList.remove('ai-copy-is-dragging');
            }


            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);


            setTimeout(() => { isPointerDragging = false; }, 50);


            if (isMoving) {
                const preventClickOnce = (clickEvent) => {
                    clickEvent.stopPropagation();
                    clickEvent.preventDefault();
                };
                window.addEventListener('click', preventClickOnce, { capture: true, once: true });


                clampContainerToViewport(container);


                const finalRect = container.getBoundingClientRect();
                const newPos = {
                    left: `${finalRect.left}px`,
                    top: `${finalRect.top}px`
                };


                if (isOrb) {
                    globalConfig.orbPosition = newPos;
                } else if (isToast) {
                    globalConfig.toastPosition = newPos;
                } else {
                    globalConfig.uiPosition = newPos;
                }
                Storage.set(globalConfig);
                if (!isToast) showToast('📍 位置已儲存！');
            } else {
                if (typeof onClickCallback === 'function' && isOrb) {
                    onClickCallback();
                }
            }
        }


        dragHandle.addEventListener('mousedown', (e) => {
            if (['INPUT', 'TEXTAREA', 'SELECT', 'OPTION'].includes(e.target.tagName)) return;
            if (e.button !== 0) return;


            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);


            isMoving = false;
            isPointerDragging = false;
            startX = e.clientX;
            startY = e.clientY;


            // 若為 Toast 拖曳，前置清除 transform 避免與 left/top 雙重疊加卡死
            if (isToast) {
                container.style.transform = 'none';
            }


            const rect = container.getBoundingClientRect();
            initialLeft = rect.left;
            initialTop = rect.top;


            container.style.left = `${initialLeft}px`;
            container.style.top = `${initialTop}px`;
            container.style.right = 'auto';
            container.style.bottom = 'auto';


            window.addEventListener('mousemove', onMouseMove);
            window.addEventListener('mouseup', onMouseUp);
        });
    }


    // ==========================================
    // 11. 自包含居中 7 分頁雙欄 Modal 管理器
    // ==========================================
    let currentPrefixTab = 'aistudio';
    let currentSuffixTab = 'aistudio';
    let currentModuleTab = 'module_1';


    function openManager() {
        if (document.getElementById(MODAL_OVERLAY_ID)) return;


        const overlay = document.createElement('div');
        overlay.id = MODAL_OVERLAY_ID;


        const modal = document.createElement('div');
        modal.id = 'ai-copy-modal';


        // 1. Header
        const header = document.createElement('div');
        header.className = 'ai-copy-modal-header';


        const title = document.createElement('span');
        title.textContent = '⚙️ AI 雙模式乾淨複製器 - 參數設定管理器 v4.3.4';


        const btnCloseX = document.createElement('button');
        btnCloseX.className = 'ai-copy-close-x';
        btnCloseX.textContent = '✕';
        btnCloseX.title = '關閉';
        btnCloseX.onclick = () => overlay.remove();


        header.appendChild(title);
        header.appendChild(btnCloseX);


        // 2. Body (雙欄)
        const body = document.createElement('div');
        body.className = 'ai-copy-modal-body';


        const sidebar = document.createElement('div');
        sidebar.className = 'ai-copy-modal-sidebar-tabs';


        const contentPane = document.createElement('div');
        contentPane.className = 'ai-copy-modal-content-pane';


        const menuTabs = [
            { id: 'pane_prefix', label: '🏷️ 前綴設定' },
            { id: 'pane_suffix', label: '🔚 後綴封尾' },
            { id: 'pane_reorder', label: '🔢 站點排序' },
            { id: 'pane_rules', label: '🧹 排除規則' },
            { id: 'pane_ui', label: '🎨 介面排版' },
            { id: 'pane_aistudio', label: '⚡ AI Studio 專用' },
            { id: 'pane_cloud', label: '🌐 雲端匯出' }
        ];


        let activePaneId = 'pane_prefix';
        const sideTabBtns = {};


        function renderActivePane() {
            menuTabs.forEach(t => {
                if (sideTabBtns[t.id]) {
                    if (t.id === activePaneId) sideTabBtns[t.id].classList.add('active');
                    else sideTabBtns[t.id].classList.remove('active');
                }
            });


            while (contentPane.firstChild) contentPane.removeChild(contentPane.firstChild);


            if (activePaneId === 'pane_prefix') renderPanePrefix(contentPane);
            else if (activePaneId === 'pane_suffix') renderPaneSuffix(contentPane);
            else if (activePaneId === 'pane_reorder') renderPaneReorder(contentPane);
            else if (activePaneId === 'pane_rules') renderPaneRules(contentPane);
            else if (activePaneId === 'pane_ui') renderPaneUI(contentPane);
            else if (activePaneId === 'pane_aistudio') renderPaneAiStudio(contentPane);
            else if (activePaneId === 'pane_cloud') renderPaneCloud(contentPane);
        }


        menuTabs.forEach(t => {
            const btn = document.createElement('button');
            btn.className = 'ai-copy-side-tab';
            btn.textContent = t.label;
            btn.onclick = () => {
                activePaneId = t.id;
                renderActivePane();
            };
            sideTabBtns[t.id] = btn;
            sidebar.appendChild(btn);
        });


        // 3. Footer
        const footer = document.createElement('div');
        footer.className = 'ai-copy-modal-footer';


        const btnDone = document.createElement('button');
        btnDone.className = 'ai-copy-btn-primary';
        btnDone.textContent = '完成並關閉';
        btnDone.onclick = () => overlay.remove();


        footer.appendChild(btnDone);


        body.appendChild(sidebar);
        body.appendChild(contentPane);
        modal.appendChild(header);
        modal.appendChild(body);
        modal.appendChild(footer);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);


        overlay.onclick = (e) => {
            if (e.target === overlay) overlay.remove();
        };


        renderActivePane();
    }


    function createProfileSelectorRow(onProfileChangeCallback) {
        const row = document.createElement('div');
        row.style.cssText = 'display: flex; gap: 8px; align-items: center; justify-content: space-between;';


        const select = document.createElement('select');
        Object.assign(select.style, {
            flex: '1',
            backgroundColor: '#2d2f31',
            color: '#8ab4f8',
            border: '1px solid #5f6368',
            borderRadius: '4px',
            padding: '6px 8px',
            fontSize: '13px',
            fontWeight: '600',
            cursor: 'pointer'
        });


        function populateOptions() {
            while (select.firstChild) select.removeChild(select.firstChild);
            Object.values(globalConfig.profiles || {}).forEach(p => {
                if (!p) return;
                const opt = document.createElement('option');
                opt.value = p.id;
                opt.textContent = p.name || p.id;
                if (p.id === globalConfig.activeProfileId) opt.selected = true;
                select.appendChild(opt);
            });
        }
        populateOptions();


        select.onchange = () => {
            globalConfig.activeProfileId = select.value;
            Storage.set(globalConfig);
            if (typeof onProfileChangeCallback === 'function') onProfileChangeCallback();
        };


        const btnRename = document.createElement('button');
        btnRename.textContent = '✏️ 重命名';
        btnRename.className = 'ai-copy-btn-secondary';
        btnRename.onclick = () => {
            const activeP = globalConfig.profiles?.[globalConfig.activeProfileId];
            if (!activeP) return;
            const newName = prompt('請輸入此模式的新名稱：', activeP.name);
            if (newName && newName.trim()) {
                activeP.name = newName.trim();
                Storage.set(globalConfig);
                populateOptions();
                showToast('✅ 模式名稱已更新！');
            }
        };


        row.appendChild(select);
        row.appendChild(btnRename);
        return row;
    }


    function renderPanePrefix(container) {
        const profileRow = createProfileSelectorRow(() => renderPanePrefix(container));
        container.appendChild(profileRow);


        const curP = globalConfig.profiles[globalConfig.activeProfileId];


        const enableLabel = document.createElement('label');
        enableLabel.style.cssText = 'display: flex; align-items: center; gap: 8px; cursor: pointer; user-select: none; font-size: 13px; color: #e8eaed;';
        const enableCheck = document.createElement('input');
        enableCheck.type = 'checkbox';
        enableCheck.checked = curP.enablePrefix !== false;
        enableCheck.onchange = () => {
            curP.enablePrefix = enableCheck.checked;
            Storage.set(globalConfig);
            showToast(enableCheck.checked ? '✅ 已啟用前綴功能' : '⏸️ 已停用前綴功能');
        };
        const enableTxt = document.createElement('span');
        enableTxt.textContent = '啟用此模式之前綴 (Prefix)';
        enableLabel.appendChild(enableCheck);
        enableLabel.appendChild(enableTxt);
        container.appendChild(enableLabel);


        const tabsRow = document.createElement('div');
        tabsRow.style.cssText = 'display: flex; flex-wrap: wrap; gap: 4px; background: #1e1f20; padding: 6px; border-radius: 6px; border: 1px solid #5f6368; box-sizing: border-box;';


        const tabBtns = {};
        const siteOrder = globalConfig.siteTabOrder || ['aistudio', 'deepseek', 'qwen', 'kimi', 'chatgpt', 'claude', 'perplexity', 'zhipu', 'zai', 'mistral', 'minimax'];
        if (!siteOrder.includes(currentPrefixTab)) currentPrefixTab = siteOrder[0];


        const textarea = document.createElement('textarea');
        textarea.rows = 4;
        textarea.placeholder = '請輸入前綴字串，支援換行 (如: 1st)';
        Object.assign(textarea.style, {
            width: '100%',
            backgroundColor: '#2d2f31',
            color: '#f9fafb',
            border: '1px solid #5f6368',
            borderRadius: '4px',
            padding: '8px',
            fontSize: '12px',
            resize: 'vertical',
            boxSizing: 'border-box',
            fontFamily: 'monospace'
        });


        function refreshActiveSiteData() {
            textarea.value = (curP.prefixes && curP.prefixes[currentPrefixTab]) || '';
            siteOrder.forEach(siteId => {
                const btn = tabBtns[siteId];
                if (btn) {
                    if (siteId === currentPrefixTab) {
                        btn.style.background = '#8ab4f8';
                        btn.style.color = '#202124';
                    } else {
                        btn.style.background = 'transparent';
                        btn.style.color = '#9aa0a6';
                    }
                }
            });
        }


        siteOrder.forEach(siteId => {
            const def = ALL_SITE_DEFS[siteId] || { id: siteId, label: siteId };
            const btn = document.createElement('button');
            btn.textContent = def.label;
            btn.style.cssText = 'flex: 1 1 calc(20% - 4px); min-width: 68px; height: 28px; border: none; padding: 0 4px; font-size: 11px; font-weight: bold; border-radius: 4px; cursor: pointer; transition: all 0.2s; white-space: nowrap; text-align: center;';
            btn.onclick = () => {
                currentPrefixTab = siteId;
                refreshActiveSiteData();
            };
            tabBtns[siteId] = btn;
            tabsRow.appendChild(btn);
        });


        textarea.oninput = () => {
            if (!curP.prefixes) curP.prefixes = {};
            curP.prefixes[currentPrefixTab] = textarea.value;
            Storage.set(globalConfig);
        };


        refreshActiveSiteData();
        container.appendChild(tabsRow);
        container.appendChild(textarea);
    }


    function renderPaneSuffix(container) {
        const profileRow = createProfileSelectorRow(() => renderPaneSuffix(container));
        container.appendChild(profileRow);


        const curP = globalConfig.profiles[globalConfig.activeProfileId];


        const enableLabel = document.createElement('label');
        enableLabel.style.cssText = 'display: flex; align-items: center; gap: 8px; cursor: pointer; user-select: none; font-size: 13px; color: #e8eaed;';
        const enableCheck = document.createElement('input');
        enableCheck.type = 'checkbox';
        enableCheck.checked = curP.enableSuffix !== false;
        enableCheck.onchange = () => {
            curP.enableSuffix = enableCheck.checked;
            Storage.set(globalConfig);
            showToast(enableCheck.checked ? '✅ 已啟用後綴功能' : '⏸️ 已停用後綴功能');
        };
        const enableTxt = document.createElement('span');
        enableTxt.textContent = '啟用此模式之後綴 (Suffix - 預設雙換行防粘黏)';
        enableLabel.appendChild(enableCheck);
        enableLabel.appendChild(enableTxt);
        container.appendChild(enableLabel);


        const tabsRow = document.createElement('div');
        tabsRow.style.cssText = 'display: flex; flex-wrap: wrap; gap: 4px; background: #1e1f20; padding: 6px; border-radius: 6px; border: 1px solid #5f6368; box-sizing: border-box;';


        const tabBtns = {};
        const siteOrder = globalConfig.siteTabOrder || ['aistudio', 'deepseek', 'qwen', 'kimi', 'chatgpt', 'claude', 'perplexity', 'zhipu', 'zai', 'mistral', 'minimax'];
        if (!siteOrder.includes(currentSuffixTab)) currentSuffixTab = siteOrder[0];


        const textarea = document.createElement('textarea');
        textarea.rows = 4;
        textarea.placeholder = '請輸入後綴字串，支援換行 (預設為 \\n\\n)';
        Object.assign(textarea.style, {
            width: '100%',
            backgroundColor: '#2d2f31',
            color: '#f9fafb',
            border: '1px solid #5f6368',
            borderRadius: '4px',
            padding: '8px',
            fontSize: '12px',
            resize: 'vertical',
            boxSizing: 'border-box',
            fontFamily: 'monospace'
        });


        function refreshActiveSiteData() {
            textarea.value = (curP.suffixes && curP.suffixes[currentSuffixTab]) ?? '\n\n';
            siteOrder.forEach(siteId => {
                const btn = tabBtns[siteId];
                if (btn) {
                    if (siteId === currentSuffixTab) {
                        btn.style.background = '#8ab4f8';
                        btn.style.color = '#202124';
                    } else {
                        btn.style.background = 'transparent';
                        btn.style.color = '#9aa0a6';
                    }
                }
            });
        }


        siteOrder.forEach(siteId => {
            const def = ALL_SITE_DEFS[siteId] || { id: siteId, label: siteId };
            const btn = document.createElement('button');
            btn.textContent = def.label;
            btn.style.cssText = 'flex: 1 1 calc(20% - 4px); min-width: 68px; height: 28px; border: none; padding: 0 4px; font-size: 11px; font-weight: bold; border-radius: 4px; cursor: pointer; transition: all 0.2s; white-space: nowrap; text-align: center;';
            btn.onclick = () => {
                currentSuffixTab = siteId;
                refreshActiveSiteData();
            };
            tabBtns[siteId] = btn;
            tabsRow.appendChild(btn);
        });


        textarea.oninput = () => {
            if (!curP.suffixes) curP.suffixes = {};
            curP.suffixes[currentSuffixTab] = textarea.value;
            Storage.set(globalConfig);
        };


        refreshActiveSiteData();
        container.appendChild(tabsRow);
        container.appendChild(textarea);
    }


    function renderPaneReorder(container) {
        const desc = document.createElement('div');
        desc.style.cssText = 'font-size: 12px; color: #9aa0a6; line-height: 1.4;';
        const capKey = globalConfig.qaQueueSettings?.captureHotkey || 'F4';
        desc.textContent = `請設定 11 大站點之權重序號與【${capKey} 快捷採集模式】。點擊下方按鈕後，前後綴與總結匯出順序將依序號嚴格排列：`;
        container.appendChild(desc);


        const listContainer = document.createElement('div');
        listContainer.style.cssText = 'display: flex; flex-direction: column; gap: 8px; margin-top: 4px;';


        const inputsMap = [];
        const siteOrder = globalConfig.siteTabOrder || ['aistudio', 'deepseek', 'qwen', 'kimi', 'chatgpt', 'claude', 'perplexity', 'zhipu', 'zai', 'mistral', 'minimax'];
        const siteActions = globalConfig.qaQueueSettings?.siteActions || {};


        siteOrder.forEach((siteId, index) => {
            const def = ALL_SITE_DEFS[siteId] || { id: siteId, label: siteId };
            const row = document.createElement('div');
            row.style.cssText = 'display: flex; align-items: center; justify-content: space-between; background: #1e1f20; padding: 6px 12px; border-radius: 6px; border: 1px solid #3c4043; gap: 8px;';


            const label = document.createElement('span');
            label.style.cssText = 'font-weight: 600; font-size: 13px; min-width: 110px;';
            label.textContent = `${def.label} (${siteId})`;


            // 4 態採集動作下拉選單
            const actionSelect = document.createElement('select');
            actionSelect.style.cssText = 'height: 26px; font-size: 11px; background: #2d2f31; color: #8ab4f8; border: 1px solid #5f6368; border-radius: 4px; padding: 2px 6px; cursor: pointer; flex: 1;';


            const optSingle = document.createElement('option');
            optSingle.value = 'SINGLE';
            optSingle.textContent = '📋 複製最後回覆 (含前後綴)';
            const optClean = document.createElement('option');
            optClean.value = 'SINGLE_CLEAN';
            optClean.textContent = '🧹 乾淨最後回覆 (無前後綴)';
            const optPreview = document.createElement('option');
            optPreview.value = 'PREVIEW';
            optPreview.textContent = '📄 複製右側預覽 (含前後綴)';
            const optPreviewClean = document.createElement('option');
            optPreviewClean.value = 'PREVIEW_CLEAN';
            optPreviewClean.textContent = '📄 乾淨右側預覽 (無前後綴)';


            actionSelect.appendChild(optSingle);
            actionSelect.appendChild(optClean);
            actionSelect.appendChild(optPreview);
            actionSelect.appendChild(optPreviewClean);


            const curAct = siteActions[siteId] || 'SINGLE';
            actionSelect.value = curAct;


            actionSelect.onchange = () => {
                if (!globalConfig.qaQueueSettings) globalConfig.qaQueueSettings = JSON.parse(JSON.stringify(DEFAULT_CONFIG.qaQueueSettings));
                if (!globalConfig.qaQueueSettings.siteActions) globalConfig.qaQueueSettings.siteActions = {};
                globalConfig.qaQueueSettings.siteActions[siteId] = actionSelect.value;
                Storage.set(globalConfig);
            };


            const input = document.createElement('input');
            input.type = 'number';
            input.value = index + 1;
            input.min = '1';
            input.max = '99';
            Object.assign(input.style, {
                width: '50px',
                backgroundColor: '#2d2f31',
                color: '#8ab4f8',
                border: '1px solid #5f6368',
                borderRadius: '4px',
                padding: '4px 6px',
                textAlign: 'center',
                fontWeight: 'bold'
            });


            inputsMap.push({ siteId, inputEl: input, originalIndex: index });


            row.appendChild(label);
            row.appendChild(actionSelect);
            row.appendChild(input);
            listContainer.appendChild(row);
        });


        container.appendChild(listContainer);


        const btnReorder = document.createElement('button');
        btnReorder.className = 'ai-copy-btn-primary';
        btnReorder.textContent = '🔢 依照數值重排';
        btnReorder.style.cssText = 'margin-top: 8px; padding: 8px; width: 100%;';
        btnReorder.onclick = () => {
            const sortedData = inputsMap.map(item => {
                const valStr = item.inputEl.value.trim();
                let parsedVal = parseInt(valStr, 10);
                if (isNaN(parsedVal)) parsedVal = 999;
                return {
                    siteId: item.siteId,
                    typedValue: parsedVal,
                    originalIndex: item.originalIndex
                };
            });


            sortedData.sort((a, b) => {
                if (a.typedValue !== b.typedValue) return a.typedValue - b.typedValue;
                return a.originalIndex - b.originalIndex;
            });


            globalConfig.siteTabOrder = sortedData.map(d => d.siteId);
            Storage.set(globalConfig);
            renderPaneReorder(container);
            showToast('🔢 站點頁籤與總結匯出順序已成功重排！');
        };


        container.appendChild(btnReorder);
    }


    function renderPaneRules(container) {
        if (!globalConfig.noiseSettings) {
            globalConfig.noiseSettings = JSON.parse(JSON.stringify(DEFAULT_CONFIG.noiseSettings));
        }


        const orderRow = document.createElement('div');
        orderRow.style.cssText = 'display: flex; align-items: center; justify-content: space-between; gap: 8px; background: #1e1f20; padding: 8px 12px; border-radius: 6px; border: 1px solid #3c4043;';


        const orderLabel = document.createElement('span');
        orderLabel.style.cssText = 'font-weight: 600; font-size: 13px; color: #8ab4f8;';
        orderLabel.textContent = '⚙️ 清洗執行順序：';


        const orderSelect = document.createElement('select');
        Object.assign(orderSelect.style, {
            backgroundColor: '#2d2f31',
            color: '#e8eaed',
            border: '1px solid #5f6368',
            borderRadius: '4px',
            padding: '4px 8px',
            fontSize: '12px',
            fontWeight: '600',
            cursor: 'pointer'
        });


        const optStrFirst = document.createElement('option');
        optStrFirst.value = 'string_first';
        optStrFirst.textContent = '字串清洗優先 ➔ 正則清洗 (預設推薦)';
        if (globalConfig.noiseSettings.pipelineOrder === 'string_first') optStrFirst.selected = true;


        const optRegFirst = document.createElement('option');
        optRegFirst.value = 'regex_first';
        optRegFirst.textContent = '正則清洗優先 ➔ 字串清洗';
        if (globalConfig.noiseSettings.pipelineOrder === 'regex_first') optRegFirst.selected = true;


        orderSelect.appendChild(optStrFirst);
        orderSelect.appendChild(optRegFirst);


        orderSelect.onchange = () => {
            globalConfig.noiseSettings.pipelineOrder = orderSelect.value;
            Storage.set(globalConfig);
            showToast('⚙️ 已更新清洗執行順序！');
        };


        orderRow.appendChild(orderLabel);
        orderRow.appendChild(orderSelect);
        container.appendChild(orderRow);


        const strTitle = document.createElement('div');
        strTitle.style.cssText = 'font-weight: 600; color: #9aa0a6; font-size: 12px; margin-top: 4px;';
        strTitle.textContent = '🔤 免轉義純字串排除清單 (每行一條，精確消除)：';


        const strTextarea = document.createElement('textarea');
        strTextarea.rows = 5;
        strTextarea.placeholder = '\n# 支援 # 與 // 註解';
        strTextarea.value = globalConfig.noiseSettings.customNoiseStrings || '';
        Object.assign(strTextarea.style, {
            width: '100%',
            backgroundColor: '#2d2f31',
            color: '#f9fafb',
            border: '1px solid #5f6368',
            borderRadius: '4px',
            padding: '8px',
            fontSize: '12px',
            resize: 'vertical',
            boxSizing: 'border-box',
            fontFamily: 'monospace'
        });


        strTextarea.oninput = () => {
            globalConfig.noiseSettings.customNoiseStrings = strTextarea.value;
            Storage.set(globalConfig);
        };


        container.appendChild(strTitle);
        container.appendChild(strTextarea);


        const regTitle = document.createElement('div');
        regTitle.style.cssText = 'font-weight: 600; color: #9aa0a6; font-size: 12px; margin-top: 4px;';
        regTitle.textContent = '⚡ 高階正則表達式清單 (每行一條 /pattern/flags)：';


        const regTextarea = document.createElement('textarea');
        regTextarea.rows = 5;
        regTextarea.placeholder = '/[^\\n]*尖峰時段使用量較高[，,][^\\n]*(?:升級即可使用|思考|快速|請稍後再試)[^\\n]*\\n?/gi\n/(?:試算表|表格)\\s*(?:複製|下載)/gi\n# 支援 # 與 // 註解';
        regTextarea.value = globalConfig.noiseSettings.customNoiseRegexes || '';
        Object.assign(regTextarea.style, {
            width: '100%',
            backgroundColor: '#2d2f31',
            color: '#f9fafb',
            border: '1px solid #5f6368',
            borderRadius: '4px',
            padding: '8px',
            fontSize: '12px',
            resize: 'vertical',
            boxSizing: 'border-box',
            fontFamily: 'monospace'
        });


        regTextarea.oninput = () => {
            globalConfig.noiseSettings.customNoiseRegexes = regTextarea.value;
            Storage.set(globalConfig);
        };


        container.appendChild(regTitle);
        container.appendChild(regTextarea);
    }


    function renderPaneUI(container) {
        const title = document.createElement('div');
        title.style.cssText = 'font-weight: 600; color: #9aa0a6; font-size: 12px;';
        title.textContent = '按鈕顯示與佈局設定 (全域)：';


        const showCleanLabel = document.createElement('label');
        showCleanLabel.style.cssText = 'display: flex; align-items: center; gap: 8px; cursor: pointer; user-select: none; font-size: 13px;';
        const showCleanCheck = document.createElement('input');
        showCleanCheck.type = 'checkbox';
        showCleanCheck.checked = globalConfig.uiSettings.showCleanSingle;
        showCleanCheck.onchange = () => {
            globalConfig.uiSettings.showCleanSingle = showCleanCheck.checked;
            Storage.set(globalConfig);
            mountUI(true);
        };
        const showCleanText = document.createElement('span');
        showCleanText.textContent = '顯示「乾淨最後回覆 (紫)」';
        showCleanLabel.appendChild(showCleanCheck);
        showCleanLabel.appendChild(showCleanText);


        const showFullLabel = document.createElement('label');
        showFullLabel.style.cssText = 'display: flex; align-items: center; gap: 8px; cursor: pointer; user-select: none; font-size: 13px;';
        const showFullCheck = document.createElement('input');
        showFullCheck.type = 'checkbox';
        showFullCheck.checked = globalConfig.uiSettings.showFullThread;
        showFullCheck.onchange = () => {
            globalConfig.uiSettings.showFullThread = showFullCheck.checked;
            Storage.set(globalConfig);
            mountUI(true);
        };
        const showFullText = document.createElement('span');
        showFullText.textContent = '顯示「複製全對話串 (藍)」';
        showFullLabel.appendChild(showFullCheck);
        showFullLabel.appendChild(showFullText);


        const purplePosRow = document.createElement('div');
        purplePosRow.style.cssText = 'display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 4px;';
        const purplePosLabel = document.createElement('span');
        purplePosLabel.textContent = '全域紫鍵排列位置：';
        purplePosLabel.style.fontSize = '13px';
        const purplePosSelect = document.createElement('select');
        Object.assign(purplePosSelect.style, {
            backgroundColor: '#2d2f31',
            color: '#e8eaed',
            border: '1px solid #5f6368',
            borderRadius: '4px',
            padding: '4px 8px',
            fontSize: '12px',
            cursor: 'pointer'
        });


        const optBottom = document.createElement('option');
        optBottom.value = 'bottom';
        optBottom.textContent = '置底換行 (2行 - 預設推薦)';
        if (globalConfig.uiSettings.purplePosition === 'bottom') optBottom.selected = true;


        const optRight = document.createElement('option');
        optRight.value = 'right';
        optRight.textContent = '靠右橫排 (1行)';
        if (globalConfig.uiSettings.purplePosition === 'right') optRight.selected = true;


        purplePosSelect.appendChild(optBottom);
        purplePosSelect.appendChild(optRight);


        purplePosSelect.onchange = () => {
            globalConfig.uiSettings.purplePosition = purplePosSelect.value;
            Storage.set(globalConfig);
            mountUI(true);
        };


        purplePosRow.appendChild(purplePosLabel);
        purplePosRow.appendChild(purplePosSelect);


        container.appendChild(title);
        container.appendChild(showCleanLabel);
        container.appendChild(showFullLabel);
        container.appendChild(purplePosRow);


        // Toast 提示外觀設定 GroupBox
        const toastGroup = document.createElement('div');
        toastGroup.style.cssText = 'background: #1e1f20; padding: 10px 12px; border-radius: 6px; border: 1px solid #3c4043; display: flex; flex-direction: column; gap: 8px; margin-top: 6px;';


        const toastTitle = document.createElement('div');
        toastTitle.style.cssText = 'font-weight: 600; font-size: 13px; color: #c084fc;';
        toastTitle.textContent = '🍞 Toast 提示通知外觀與位置設定：';


        const toastSettingRow = document.createElement('div');
        toastSettingRow.style.cssText = 'display: flex; gap: 12px; align-items: center; justify-content: space-between;';


        // 1. 背景顏色自訂與原生拾色器
        const colorBox = document.createElement('div');
        colorBox.style.cssText = 'display: flex; align-items: center; gap: 8px;';


        const colorLbl = document.createElement('span');
        colorLbl.style.cssText = 'font-size: 12px; color: #e8eaed;';
        colorLbl.textContent = '🎨 提示背景色：';


        const colorPick = document.createElement('input');
        colorPick.type = 'color';
        const curBg = globalConfig.toastSettings?.background || '#7c3aed';
        const hexMatch = curBg.match(/#([0-9a-f]{6}|[0-9a-f]{3})/i);
        colorPick.value = hexMatch ? hexMatch[0] : '#7c3aed';
        colorPick.style.cssText = 'width: 26px; height: 26px; border: none; padding: 0; background: transparent; cursor: pointer; border-radius: 4px;';
        colorPick.title = '點擊選擇 Toast 背景色';


        const btnDefaultGrad = document.createElement('button');
        btnDefaultGrad.textContent = '經典淡紫';
        btnDefaultGrad.className = 'ai-copy-btn-secondary';
        btnDefaultGrad.style.cssText = 'padding: 2px 6px; font-size: 11px;';
        btnDefaultGrad.onclick = () => {
            if (!globalConfig.toastSettings) globalConfig.toastSettings = JSON.parse(JSON.stringify(DEFAULT_CONFIG.toastSettings));
            globalConfig.toastSettings.background = 'linear-gradient(135deg, rgba(88, 28, 135, 0.95), rgba(124, 58, 237, 0.92))';
            Storage.set(globalConfig);
            showToast('🎨 已恢復為經典淡紫漸變色！');
        };


        colorPick.onchange = (e) => {
            if (!globalConfig.toastSettings) globalConfig.toastSettings = JSON.parse(JSON.stringify(DEFAULT_CONFIG.toastSettings));
            globalConfig.toastSettings.background = e.target.value;
            Storage.set(globalConfig);
            showToast('🎨 已更新 Toast 背景顏色！');
        };


        colorBox.appendChild(colorLbl);
        colorBox.appendChild(colorPick);
        colorBox.appendChild(btnDefaultGrad);


        // 2. 字體大小
        const fontBox = document.createElement('div');
        fontBox.style.cssText = 'display: flex; align-items: center; gap: 6px;';
        const fontLbl = document.createElement('span');
        fontLbl.style.cssText = 'font-size: 12px; color: #e8eaed;';
        fontLbl.textContent = '字體大小 (px)：';
        const fontInput = document.createElement('input');
        fontInput.type = 'number';
        fontInput.min = '12';
        fontInput.max = '24';
        fontInput.value = globalConfig.toastSettings?.fontSize || 18;
        fontInput.style.cssText = 'width: 48px; background: #2d2f31; color: #c084fc; border: 1px solid #5f6368; border-radius: 4px; padding: 3px 6px; font-size: 12px; text-align: center; font-weight: bold;';
        fontInput.oninput = () => {
            if (!globalConfig.toastSettings) globalConfig.toastSettings = JSON.parse(JSON.stringify(DEFAULT_CONFIG.toastSettings));
            const val = parseInt(fontInput.value, 10);
            globalConfig.toastSettings.fontSize = isNaN(val) ? 18 : val;
            Storage.set(globalConfig);
        };
        fontBox.appendChild(fontLbl);
        fontBox.appendChild(fontInput);


        toastSettingRow.appendChild(colorBox);
        toastSettingRow.appendChild(fontBox);


        const toastDragHint = document.createElement('div');
        toastDragHint.style.cssText = 'font-size: 11px; color: #9aa0a6; line-height: 1.4;';
        toastDragHint.textContent = '💡 提示：點擊主懸浮列工具列的 🍞 按鈕可進入自由拖曳模式，長亮調整視窗定位座標！';


        toastGroup.appendChild(toastTitle);
        toastGroup.appendChild(toastSettingRow);
        toastGroup.appendChild(toastDragHint);
        container.appendChild(toastGroup);


        // QA 採集暫存雙熱鍵與滿額總結設定 GroupBox
        const hotkeyGroup = document.createElement('div');
        hotkeyGroup.style.cssText = 'background: #1e1f20; padding: 10px 12px; border-radius: 6px; border: 1px solid #3c4043; display: flex; flex-direction: column; gap: 8px; margin-top: 6px;';


        const hotkeyTitle = document.createElement('div');
        hotkeyTitle.style.cssText = 'font-weight: 600; font-size: 13px; color: #8ab4f8;';
        hotkeyTitle.textContent = '⌨️ 跨站點 QA 採集、滿額自動總結與雙熱鍵：';


        const hotkeysRow = document.createElement('div');
        hotkeysRow.style.cssText = 'display: flex; gap: 12px; align-items: center; justify-content: space-between;';


        // 採集熱鍵
        const capBox = document.createElement('div');
        capBox.style.cssText = 'display: flex; align-items: center; gap: 6px;';
        const capLbl = document.createElement('span');
        capLbl.style.cssText = 'font-size: 12px; color: #e8eaed;';
        capLbl.textContent = '📥 採集熱鍵：';
        const capInput = document.createElement('input');
        capInput.type = 'text';
        capInput.placeholder = '留空停用';
        capInput.value = globalConfig.qaQueueSettings?.captureHotkey ?? 'F4';
        capInput.style.cssText = 'width: 100px; background: #2d2f31; color: #8ab4f8; border: 1px solid #5f6368; border-radius: 4px; padding: 3px 6px; font-size: 12px; text-align: center; font-weight: bold;';


        // 總結熱鍵
        const sumBox = document.createElement('div');
        sumBox.style.cssText = 'display: flex; align-items: center; gap: 6px;';
        const sumLbl = document.createElement('span');
        sumLbl.style.cssText = 'font-size: 12px; color: #e8eaed;';
        sumLbl.textContent = '🎉 總結熱鍵：';
        const sumInput = document.createElement('input');
        sumInput.type = 'text';
        sumInput.placeholder = '留空停用';
        sumInput.value = globalConfig.qaQueueSettings?.summaryHotkey ?? 'F7';
        sumInput.style.cssText = 'width: 100px; background: #2d2f31; color: #8ab4f8; border: 1px solid #5f6368; border-radius: 4px; padding: 3px 6px; font-size: 12px; text-align: center; font-weight: bold;';


        function validateAndSaveHotkeys() {
            const capVal = capInput.value.trim();
            const sumVal = sumInput.value.trim();


            if (capVal && sumVal && capVal.toUpperCase() === sumVal.toUpperCase()) {
                capInput.style.borderColor = '#ef4444';
                sumInput.style.borderColor = '#ef4444';
                showToast('⚠️ 採集熱鍵與總結熱鍵不能相同！', true, 3000);
                return;
            }


            capInput.style.borderColor = '#5f6368';
            sumInput.style.borderColor = '#5f6368';


            if (!globalConfig.qaQueueSettings) globalConfig.qaQueueSettings = JSON.parse(JSON.stringify(DEFAULT_CONFIG.qaQueueSettings));
            globalConfig.qaQueueSettings.captureHotkey = capVal;
            globalConfig.qaQueueSettings.summaryHotkey = sumVal;
            Storage.set(globalConfig);
        }


        capInput.oninput = validateAndSaveHotkeys;
        sumInput.oninput = validateAndSaveHotkeys;


        capBox.appendChild(capLbl);
        capBox.appendChild(capInput);
        sumBox.appendChild(sumLbl);
        sumBox.appendChild(sumInput);


        hotkeysRow.appendChild(capBox);
        hotkeysRow.appendChild(sumBox);


        // 滿額站點與滾動更新設定
        const autoSummaryRow = document.createElement('div');
        autoSummaryRow.style.cssText = 'display: flex; gap: 12px; align-items: center; justify-content: space-between; border-top: 1px dashed #3c4043; padding-top: 6px;';


        const targetBox = document.createElement('div');
        targetBox.style.cssText = 'display: flex; align-items: center; gap: 6px;';
        const targetLbl = document.createElement('span');
        targetLbl.style.cssText = 'font-size: 12px; color: #e8eaed;';
        targetLbl.textContent = '滿額自動總結站數：';
        const targetInput = document.createElement('input');
        targetInput.type = 'number';
        targetInput.min = '0';
        targetInput.max = '11';
        targetInput.value = globalConfig.qaQueueSettings?.targetCount ?? 6;
        targetInput.style.cssText = 'width: 48px; background: #2d2f31; color: #8ab4f8; border: 1px solid #5f6368; border-radius: 4px; padding: 3px 6px; font-size: 12px; text-align: center; font-weight: bold;';
        targetInput.oninput = () => {
            if (!globalConfig.qaQueueSettings) globalConfig.qaQueueSettings = JSON.parse(JSON.stringify(DEFAULT_CONFIG.qaQueueSettings));
            const val = parseInt(targetInput.value, 10);
            globalConfig.qaQueueSettings.targetCount = isNaN(val) ? 0 : val;
            Storage.set(globalConfig);
        };
        targetBox.appendChild(targetLbl);
        targetBox.appendChild(targetInput);


        const keepQueueLabel = document.createElement('label');
        keepQueueLabel.style.cssText = 'display: flex; align-items: center; gap: 6px; cursor: pointer; user-select: none; font-size: 12px; color: #e8eaed;';
        const keepQueueCheck = document.createElement('input');
        keepQueueCheck.type = 'checkbox';
        keepQueueCheck.checked = globalConfig.qaQueueSettings?.keepQueueOnAutoSummary ?? true;
        keepQueueCheck.onchange = () => {
            if (!globalConfig.qaQueueSettings) globalConfig.qaQueueSettings = JSON.parse(JSON.stringify(DEFAULT_CONFIG.qaQueueSettings));
            globalConfig.qaQueueSettings.keepQueueOnAutoSummary = keepQueueCheck.checked;
            Storage.set(globalConfig);
            showToast(keepQueueCheck.checked ? '✅ 已啟用滿額滾動更新模式 (保留佇列)' : '⏸️ 已切換為滿額放出即焚模式');
        };
        keepQueueLabel.appendChild(keepQueueCheck);
        keepQueueLabel.appendChild(document.createTextNode('達標總結後保留佇列 (滾動更新)'));


        autoSummaryRow.appendChild(targetBox);
        autoSummaryRow.appendChild(keepQueueLabel);


        // TTL 時長設定行
        const ttlRow = document.createElement('div');
        ttlRow.style.cssText = 'display: flex; gap: 12px; align-items: center; justify-content: space-between; border-top: 1px dashed #3c4043; padding-top: 6px;';
        const ttlBox = document.createElement('div');
        ttlBox.style.cssText = 'display: flex; align-items: center; gap: 6px;';
        const ttlLbl = document.createElement('span');
        ttlLbl.style.cssText = 'font-size: 12px; color: #e8eaed;';
        ttlLbl.textContent = '⏳ 暫存池過期時長 (小時，0為永不)：';
        const ttlInput = document.createElement('input');
        ttlInput.type = 'number';
        ttlInput.min = '0';
        ttlInput.max = '72';
        ttlInput.value = globalConfig.qaQueueSettings?.ttlHours ?? 2;
        ttlInput.style.cssText = 'width: 48px; background: #2d2f31; color: #8ab4f8; border: 1px solid #5f6368; border-radius: 4px; padding: 3px 6px; font-size: 12px; text-align: center; font-weight: bold;';
        ttlInput.oninput = () => {
            if (!globalConfig.qaQueueSettings) globalConfig.qaQueueSettings = JSON.parse(JSON.stringify(DEFAULT_CONFIG.qaQueueSettings));
            const val = parseInt(ttlInput.value, 10);
            globalConfig.qaQueueSettings.ttlHours = (isNaN(val) || val < 0) ? 2 : val;
            Storage.set(globalConfig);
        };
        ttlBox.appendChild(ttlLbl);
        ttlBox.appendChild(ttlInput);
        ttlRow.appendChild(ttlBox);


        const hotkeyHint = document.createElement('div');
        hotkeyHint.style.cssText = 'font-size: 11px; color: #9aa0a6; line-height: 1.4;';
        hotkeyHint.textContent = '💡 支援逗號分隔多熱鍵 (如: F4, ^F4)；支援輸入框全域穿透；若留空欄位則 100% 釋放攔截，交由桌面 AHK。';


        hotkeyGroup.appendChild(hotkeyTitle);
        hotkeyGroup.appendChild(hotkeysRow);
        hotkeyGroup.appendChild(autoSummaryRow);
        hotkeyGroup.appendChild(ttlRow);
        hotkeyGroup.appendChild(hotkeyHint);


        container.appendChild(hotkeyGroup);
    }


    function renderPaneAiStudio(container) {
        while (container.firstChild) {
            container.removeChild(container.firstChild);
        }


        if (!globalConfig.aiStudioSettings) {
            globalConfig.aiStudioSettings = JSON.parse(JSON.stringify(DEFAULT_CONFIG.aiStudioSettings));
        }
        const settings = globalConfig.aiStudioSettings;


        // 1. 首選引擎
        const engineRow = document.createElement('div');
        engineRow.style.cssText = 'display: flex; align-items: center; justify-content: space-between; gap: 8px; background: #1e1f20; padding: 8px 12px; border-radius: 6px; border: 1px solid #3c4043;';
        const engineLabel = document.createElement('span');
        engineLabel.style.cssText = 'font-weight: 600; font-size: 13px; color: #8ab4f8;';
        engineLabel.textContent = '⚡ 首選提取引擎：';
        const engineSelect = document.createElement('select');
        Object.assign(engineSelect.style, {
            backgroundColor: '#2d2f31', color: '#e8eaed', border: '1px solid #5f6368', borderRadius: '4px', padding: '4px 8px', fontSize: '12px', fontWeight: '600', cursor: 'pointer'
        });
        [
            { id: 'native_menu', txt: '原生選單代理 (Copy as md ➔ 鉛筆 ➔ DOM)' },
            { id: 'pencil_edit', txt: '鉛筆編輯模擬 (Pencil ➔ DOM)' },
            { id: 'dom_parser', txt: '純 DOM 解析清洗' }
        ].forEach(e => {
            const opt = document.createElement('option');
            opt.value = e.id;
            opt.textContent = e.txt;
            if (settings.primaryEngine === e.id) opt.selected = true;
            engineSelect.appendChild(opt);
        });
        engineSelect.onchange = () => {
            settings.primaryEngine = engineSelect.value;
            Storage.set(globalConfig);
            showToast('⚡ 已更新 AI Studio 首選引擎！');
        };
        engineRow.appendChild(engineLabel);
        engineRow.appendChild(engineSelect);
        container.appendChild(engineRow);


        // 2. 佈局與排列
        const layoutRow = document.createElement('div');
        layoutRow.style.cssText = 'display: flex; align-items: center; justify-content: space-between; gap: 8px; background: #1e1f20; padding: 8px 12px; border-radius: 6px; border: 1px solid #3c4043;';
        const layoutLabel = document.createElement('span');
        layoutLabel.style.cssText = 'font-weight: 600; font-size: 13px; color: #8ab4f8;';
        layoutLabel.textContent = '🎨 按鈕排列佈局：';
        const layoutSelect = document.createElement('select');
        Object.assign(layoutSelect.style, {
            backgroundColor: '#2d2f31', color: '#e8eaed', border: '1px solid #5f6368', borderRadius: '4px', padding: '4px 8px', fontSize: '12px', fontWeight: '600', cursor: 'pointer'
        });
        [
            { id: 'staircase', txt: '直排階梯雙欄 (預設推薦，適合寬螢幕)' },
            { id: 'grid_3_2', txt: '3+2 雙排網格' },
            { id: 'single_row', txt: '橫向單排展開 (緊湊單排)' }
        ].forEach(l => {
            const opt = document.createElement('option');
            opt.value = l.id;
            opt.textContent = l.txt;
            if (settings.sliceLayout === l.id) opt.selected = true;
            layoutSelect.appendChild(opt);
        });
        layoutSelect.onchange = () => {
            settings.sliceLayout = layoutSelect.value;
            Storage.set(globalConfig);
            mountUI(true);
            showToast('🎨 已更新排版佈局！');
        };
        layoutRow.appendChild(layoutLabel);
        layoutRow.appendChild(layoutSelect);
        container.appendChild(layoutRow);


        // 2.1 紫鍵排列位置覆寫
        const purplePosRow = document.createElement('div');
        purplePosRow.style.cssText = 'display: flex; align-items: center; justify-content: space-between; gap: 8px; background: #1e1f20; padding: 8px 12px; border-radius: 6px; border: 1px solid #3c4043;';
        const purplePosLabel = document.createElement('span');
        purplePosLabel.style.cssText = 'font-weight: 600; font-size: 13px; color: #8ab4f8;';
        purplePosLabel.textContent = '🟣 AI Studio 紫鍵位置覆寫：';
        const purplePosSelect = document.createElement('select');
        Object.assign(purplePosSelect.style, {
            backgroundColor: '#2d2f31', color: '#e8eaed', border: '1px solid #5f6368', borderRadius: '4px', padding: '4px 8px', fontSize: '12px', fontWeight: '600', cursor: 'pointer'
        });
        [
            { id: 'inherit', txt: '繼承全域設定 (預設推薦)' },
            { id: 'bottom', txt: '置底換行 (2行)' },
            { id: 'right', txt: '靠右橫排 (1行)' }
        ].forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = p.txt;
            if (settings.purplePosition === p.id) opt.selected = true;
            purplePosSelect.appendChild(opt);
        });
        purplePosSelect.onchange = () => {
            settings.purplePosition = purplePosSelect.value;
            Storage.set(globalConfig);
            mountUI(true);
            showToast('🟣 已更新 AI Studio 紫鍵位置！');
        };
        purplePosRow.appendChild(purplePosLabel);
        purplePosRow.appendChild(purplePosSelect);
        container.appendChild(purplePosRow);


        // 3. 滾輪範圍與失敗處置
        const controlRow = document.createElement('div');
        controlRow.style.cssText = 'display: flex; gap: 12px;';


        const wheelCol = document.createElement('div');
        wheelCol.style.cssText = 'flex: 1; display: flex; flex-direction: column; gap: 4px; background: #1e1f20; padding: 8px 10px; border-radius: 6px; border: 1px solid #3c4043;';
        const wheelLabel = document.createElement('span');
        wheelLabel.style.cssText = 'font-size: 12px; color: #8ab4f8; font-weight: bold;';
        wheelLabel.textContent = '🎡 滾輪切換區域：';
        const wheelSelect = document.createElement('select');
        Object.assign(wheelSelect.style, {
            backgroundColor: '#2d2f31', color: '#e8eaed', border: '1px solid #5f6368', borderRadius: '4px', padding: '4px', fontSize: '11px'
        });
        [
            { id: 'capsule_only', txt: '僅限模組色標膠囊 (預設推薦)' },
            { id: 'control_group', txt: '控制群組 (齒輪+膠囊)' },
            { id: 'entire_toolbar', txt: '整個懸浮工具列' }
        ].forEach(w => {
            const opt = document.createElement('option');
            opt.value = w.id;
            opt.textContent = w.txt;
            if (settings.wheelSwitchScope === w.id) opt.selected = true;
            wheelSelect.appendChild(opt);
        });
        wheelSelect.onchange = () => {
            settings.wheelSwitchScope = wheelSelect.value;
            Storage.set(globalConfig);
            showToast('🎡 已更新滾輪觸發範圍！');
        };
        wheelCol.appendChild(wheelLabel);
        wheelCol.appendChild(wheelSelect);


        const fbCol = document.createElement('div');
        fbCol.style.cssText = 'flex: 1; display: flex; flex-direction: column; gap: 4px; background: #1e1f20; padding: 8px 10px; border-radius: 6px; border: 1px solid #3c4043;';
        const fbLabel = document.createElement('span');
        fbLabel.style.cssText = 'font-size: 12px; color: #8ab4f8; font-weight: bold;';
        fbLabel.textContent = '🛡️ 切片未命中處置：';
        const fbSelect = document.createElement('select');
        Object.assign(fbSelect.style, {
            backgroundColor: '#2d2f31', color: '#e8eaed', border: '1px solid #5f6368', borderRadius: '4px', padding: '4px', fontSize: '11px'
        });
        [
            { id: 'warn_block', txt: '🛑 嚴格阻斷並警報 (預設推薦)' },
            { id: 'lenient_full', txt: '⚠️ 寬容降級複製全量' },
            { id: 'custom_string', txt: '📝 填入自訂佔位字串' }
        ].forEach(f => {
            const opt = document.createElement('option');
            opt.value = f.id;
            opt.textContent = f.txt;
            if (settings.fallbackAction === f.id) opt.selected = true;
            fbSelect.appendChild(opt);
        });
        fbSelect.onchange = () => {
            settings.fallbackAction = fbSelect.value;
            Storage.set(globalConfig);
            showToast('🛡️ 已更新切片未命中策略！');
            renderPaneAiStudio(container);
        };
        fbCol.appendChild(fbLabel);
        fbCol.appendChild(fbSelect);


        controlRow.appendChild(wheelCol);
        controlRow.appendChild(fbCol);
        container.appendChild(controlRow);


        if (settings.fallbackAction === 'custom_string') {
            const customInput = document.createElement('input');
            customInput.type = 'text';
            customInput.placeholder = '自訂未命中時寫入剪貼簿之預覽字串';
            customInput.value = settings.fallbackCustomText || '';
            Object.assign(customInput.style, {
                width: '100%', backgroundColor: '#2d2f31', color: '#f9fafb', border: '1px solid #5f6368', borderRadius: '4px', padding: '4px 8px', fontSize: '11px', boxSizing: 'border-box'
            });
            customInput.oninput = () => {
                settings.fallbackCustomText = customInput.value;
                Storage.set(globalConfig);
            };
            container.appendChild(customInput);
        }


        // 4. 中層：3 模組切換導覽條
        const modNav = document.createElement('div');
        modNav.style.cssText = 'display: flex; gap: 8px; margin-top: 4px;';


        ['module_1', 'module_2', 'module_3'].forEach(mKey => {
            const m = settings.modules[mKey];
            const modCard = document.createElement('div');
            modCard.style.cssText = `flex: 1; background: #1e1f20; border: 2px solid ${mKey === currentModuleTab ? '#8ab4f8' : '#3c4043'}; border-radius: 6px; padding: 6px 8px; cursor: pointer; display: flex; flex-direction: column; gap: 4px;`;


            const headRow = document.createElement('div');
            headRow.style.cssText = 'display: flex; align-items: center; justify-content: space-between;';


            const nameTxt = document.createElement('span');
            nameTxt.style.cssText = 'font-size: 12px; font-weight: bold; color: #fff;';
            nameTxt.textContent = m.name;


            const colorPick = document.createElement('input');
            colorPick.type = 'color';
            colorPick.value = m.badgeColor;
            colorPick.style.cssText = 'width: 22px; height: 22px; border: none; padding: 0; background: transparent; cursor: pointer;';
            colorPick.onchange = (e) => {
                m.badgeColor = e.target.value;
                Storage.set(globalConfig);
                mountUI(true);
            };


            headRow.appendChild(nameTxt);
            headRow.appendChild(colorPick);


            const subRow = document.createElement('div');
            subRow.style.cssText = 'display: flex; align-items: center; gap: 6px;';


            const badgeInput = document.createElement('input');
            badgeInput.type = 'text';
            badgeInput.maxLength = 4;
            badgeInput.value = m.badgeText;
            badgeInput.placeholder = '標籤';
            badgeInput.style.cssText = 'width: 48px; background: #2d2f31; color: #8ab4f8; border: 1px solid #5f6368; border-radius: 4px; padding: 2px 4px; font-size: 11px; text-align: center; font-weight: bold;';
            badgeInput.oninput = () => {
                m.badgeText = badgeInput.value.trim() || '標籤';
                Storage.set(globalConfig);
                mountUI(true);
            };


            const hint = document.createElement('span');
            hint.style.cssText = 'font-size: 11px; color: #9aa0a6;';
            hint.textContent = (mKey === settings.activeModuleId) ? '🟢 當前啟用' : '點擊編輯';


            subRow.appendChild(badgeInput);
            subRow.appendChild(hint);


            modCard.appendChild(headRow);
            modCard.appendChild(subRow);


            modCard.onclick = (e) => {
                if (['INPUT', 'SELECT'].includes(e.target.tagName)) return;
                currentModuleTab = mKey;
                renderPaneAiStudio(container);
            };


            modNav.appendChild(modCard);
        });
        container.appendChild(modNav);


        // 5. 下層：當前選取模組按鈕清單
        const curModDef = settings.modules[currentModuleTab];
        const btnListContainer = document.createElement('div');
        btnListContainer.style.cssText = 'display: flex; flex-direction: column; gap: 8px; margin-top: 4px;';


        curModDef.buttons.forEach((btnDef) => {
            const card = document.createElement('div');
            card.style.cssText = 'background: #1e1f20; border: 1px solid #3c4043; border-radius: 6px; padding: 8px 10px; display: flex; flex-direction: column; gap: 6px;';


            const headRow = document.createElement('div');
            headRow.style.cssText = 'display: flex; align-items: center; justify-content: space-between; gap: 8px;';


            const leftGroup = document.createElement('div');
            leftGroup.style.cssText = 'display: flex; align-items: center; gap: 6px; flex: 1;';


            const chk = document.createElement('input');
            chk.type = 'checkbox';
            chk.checked = btnDef.enabled;
            chk.onchange = () => {
                btnDef.enabled = chk.checked;
                Storage.set(globalConfig);
                mountUI(true);
            };


            const nameInput = document.createElement('input');
            nameInput.type = 'text';
            nameInput.value = btnDef.name;
            nameInput.style.cssText = 'flex: 1; background: #2d2f31; color: #8ab4f8; border: 1px solid #5f6368; border-radius: 4px; padding: 3px 6px; font-size: 12px; font-weight: bold;';
            nameInput.oninput = () => {
                btnDef.name = nameInput.value.trim();
                Storage.set(globalConfig);
                mountUI(true);
            };


            const modeSel = document.createElement('select');
            modeSel.style.cssText = 'background: #2d2f31; color: #e8eaed; border: 1px solid #5f6368; border-radius: 4px; padding: 2px 4px; font-size: 11px;';
            const optMatch = document.createElement('option');
            optMatch.value = 'match';
            optMatch.textContent = '截取 (Match)';
            if (btnDef.mode === 'match') optMatch.selected = true;
            const optReplace = document.createElement('option');
            optReplace.value = 'replace';
            optReplace.textContent = '挖除 (Replace)';
            if (btnDef.mode === 'replace') optReplace.selected = true;
            modeSel.appendChild(optMatch);
            modeSel.appendChild(optReplace);
            modeSel.onchange = () => {
                btnDef.mode = modeSel.value;
                Storage.set(globalConfig);
                renderPaneAiStudio(container);
            };


            leftGroup.appendChild(chk);
            leftGroup.appendChild(nameInput);
            leftGroup.appendChild(modeSel);


            const rightTabsGroup = document.createElement('div');
            rightTabsGroup.className = 'ai-copy-card-subtabs';


            const subtabBtnRule = document.createElement('button');
            subtabBtnRule.className = 'ai-copy-card-subtab-btn active';
            subtabBtnRule.textContent = '🎯 正則規則';


            const subtabBtnAffix = document.createElement('button');
            subtabBtnAffix.className = 'ai-copy-card-subtab-btn';


            function updateAffixTabHighlight() {
                const hasAffix = Boolean((btnDef.prefix && btnDef.prefix.trim()) || (btnDef.suffix && btnDef.suffix.trim()));
                subtabBtnAffix.textContent = hasAffix ? '🏷️ 專屬前後綴 (已設定)' : '🏷️ 專屬前後綴';
                if (hasAffix && !subtabBtnAffix.classList.contains('active')) {
                    subtabBtnAffix.style.borderColor = '#8ab4f8';
                    subtabBtnAffix.style.color = '#8ab4f8';
                    subtabBtnAffix.style.background = 'rgba(138, 180, 248, 0.08)';
                } else if (!subtabBtnAffix.classList.contains('active')) {
                    subtabBtnAffix.style.borderColor = '#5f6368';
                    subtabBtnAffix.style.color = '#9aa0a6';
                    subtabBtnAffix.style.background = 'transparent';
                }
            }
            updateAffixTabHighlight();


            rightTabsGroup.appendChild(subtabBtnRule);
            rightTabsGroup.appendChild(subtabBtnAffix);


            headRow.appendChild(leftGroup);
            headRow.appendChild(rightTabsGroup);
            card.appendChild(headRow);


            // 子面板 1：正則規則
            const paneViewRule = document.createElement('div');
            paneViewRule.style.cssText = 'display: flex; flex-direction: column; gap: 6px;';


            const patInput = document.createElement('input');
            patInput.type = 'text';
            patInput.value = btnDef.pattern || '';
            patInput.placeholder = '正則表示式 (如: /pattern/flags)';
            patInput.style.cssText = 'width: 100%; background: #2d2f31; color: #f9fafb; border: 1px solid #5f6368; border-radius: 4px; padding: 4px 6px; font-size: 11px; font-family: monospace; box-sizing: border-box;';
            patInput.oninput = () => {
                btnDef.pattern = patInput.value.trim();
                Storage.set(globalConfig);
            };
            paneViewRule.appendChild(patInput);


            if (btnDef.mode === 'match') {
                const optionsRow = document.createElement('div');
                optionsRow.style.cssText = 'display: flex; align-items: center; justify-content: space-between; gap: 8px;';


                const leftOptionsGroup = document.createElement('div');
                leftOptionsGroup.style.cssText = 'display: flex; align-items: center; gap: 12px;';


                const maxBlockLabel = document.createElement('label');
                maxBlockLabel.style.cssText = 'display: flex; align-items: center; gap: 4px; font-size: 11px; color: #9aa0a6; cursor: pointer; user-select: none;';
                const maxBlockChk = document.createElement('input');
                maxBlockChk.type = 'checkbox';
                maxBlockChk.checked = !!btnDef.isCodeBlockTarget;
                maxBlockChk.onchange = () => {
                    btnDef.isCodeBlockTarget = maxBlockChk.checked;
                    Storage.set(globalConfig);
                };
                maxBlockLabel.appendChild(maxBlockChk);
                maxBlockLabel.appendChild(document.createTextNode('最長代碼塊最優'));
                leftOptionsGroup.appendChild(maxBlockLabel);


                optionsRow.appendChild(leftOptionsGroup);


                const fallbackAccordionBox = document.createElement('div');
                const hasFallbackValue = Boolean(btnDef.fallbackPattern && btnDef.fallbackPattern.trim());
                fallbackAccordionBox.style.cssText = `display: ${hasFallbackValue ? 'flex' : 'none'}; flex-direction: column; gap: 4px; padding: 6px 8px; background: rgba(192, 132, 252, 0.05); border: 1px dashed rgba(192, 132, 252, 0.4); border-radius: 4px;`;


                const fallbackTitle = document.createElement('div');
                fallbackTitle.style.cssText = 'font-size: 11px; color: #c084fc; font-weight: bold;';
                fallbackTitle.textContent = '🛟 備援正則 (支援換行多條探測，支援 # 與 // 註解行)：';


                const fallbackPatTextarea = document.createElement('textarea');
                fallbackPatTextarea.rows = 2;
                fallbackPatTextarea.value = btnDef.fallbackPattern || '';
                fallbackPatTextarea.placeholder = '備援正則 (支援換行多條探測，如: /```([\\s\\S]*)```/i)';
                fallbackPatTextarea.style.cssText = 'width: 100%; background: #2d2f31; color: #c084fc; border: 1px solid #5f6368; border-radius: 4px; padding: 4px 6px; font-size: 11px; font-family: monospace; box-sizing: border-box; resize: vertical;';


                const btnToggleFallback = document.createElement('button');
                function refreshToggleGhostStyle() {
                    const active = Boolean(btnDef.fallbackPattern && btnDef.fallbackPattern.trim());
                    btnToggleFallback.textContent = active ? '🛟 備用 (已設定)' : '🛟 +備用';
                    btnToggleFallback.style.cssText = `background: ${active ? 'rgba(138, 180, 248, 0.12)' : 'transparent'}; border: 1px solid ${active ? '#8ab4f8' : '#5f6368'}; color: ${active ? '#8ab4f8' : '#9aa0a6'}; padding: 2px 6px; font-size: 11px; border-radius: 4px; cursor: pointer; transition: all 0.2s; white-space: nowrap;`;
                }
                refreshToggleGhostStyle();


                btnToggleFallback.onclick = () => {
                    if (fallbackAccordionBox.style.display === 'none') {
                        fallbackAccordionBox.style.display = 'flex';
                        fallbackPatTextarea.focus();
                    } else {
                        fallbackAccordionBox.style.display = 'none';
                    }
                };


                fallbackPatTextarea.oninput = () => {
                    btnDef.fallbackPattern = fallbackPatTextarea.value.trim();
                    Storage.set(globalConfig);
                    refreshToggleGhostStyle();
                };


                fallbackAccordionBox.appendChild(fallbackTitle);
                fallbackAccordionBox.appendChild(fallbackPatTextarea);


                optionsRow.appendChild(btnToggleFallback);
                paneViewRule.appendChild(optionsRow);
                paneViewRule.appendChild(fallbackAccordionBox);
            }


            if (btnDef.mode === 'replace') {
                const repInput = document.createElement('input');
                repInput.type = 'text';
                repInput.value = btnDef.replaceValue || '';
                repInput.placeholder = '替換字串 (留空即完全挖除)';
                repInput.style.cssText = 'width: 100%; background: #2d2f31; color: #a7f3d0; border: 1px solid #5f6368; border-radius: 4px; padding: 3px 6px; font-size: 11px; font-family: monospace; box-sizing: border-box;';
                repInput.oninput = () => {
                    btnDef.replaceValue = repInput.value;
                    Storage.set(globalConfig);
                };
                paneViewRule.appendChild(repInput);
            }
            card.appendChild(paneViewRule);


            // 子面板 2：專屬前後綴 (實裝 🔗 雲端直達 ↗ 動態跳轉按鈕)
            const paneViewAffix = document.createElement('div');
            paneViewAffix.style.cssText = 'display: none; flex-direction: column; gap: 6px;';


            const prefixGroup = document.createElement('div');
            prefixGroup.style.cssText = 'display: flex; flex-direction: column; gap: 4px;';


            const prefixHeadRow = document.createElement('div');
            prefixHeadRow.style.cssText = 'display: flex; justify-content: space-between; align-items: center;';


            const prefixLeftBox = document.createElement('div');
            prefixLeftBox.style.cssText = 'display: flex; align-items: center; gap: 8px;';


            const prefixLbl = document.createElement('span');
            prefixLbl.style.cssText = 'font-size: 11px; color: #8ab4f8; font-weight: bold;';
            prefixLbl.textContent = '前綴 (支援字串文字或 Google Docs 雲端 URL)：';


            const prefixDocLink = document.createElement('a');
            prefixDocLink.textContent = '🔗 雲端直達 ↗';
            prefixDocLink.target = '_blank';
            prefixDocLink.rel = 'noopener noreferrer';
            prefixDocLink.title = '點擊在新分頁開啟此前綴雲端文件';
            prefixDocLink.style.cssText = 'color: #8ab4f8; text-decoration: none; font-size: 11px; font-weight: bold; background: #2d2f31; border: 1px solid #5f6368; padding: 1px 6px; border-radius: 4px; display: none; align-items: center; transition: all 0.2s;';
            prefixDocLink.onmouseover = () => { prefixDocLink.style.borderColor = '#8ab4f8'; prefixDocLink.style.color = '#fff'; prefixDocLink.style.background = '#3c4043'; };
            prefixDocLink.onmouseout = () => { prefixDocLink.style.borderColor = '#5f6368'; prefixDocLink.style.color = '#8ab4f8'; prefixDocLink.style.background = '#2d2f31'; };


            prefixLeftBox.appendChild(prefixLbl);
            prefixLeftBox.appendChild(prefixDocLink);


            const autoDividerLabel = document.createElement('label');
            autoDividerLabel.style.cssText = 'font-size: 11px; color: #9aa0a6; cursor: pointer; user-select: none; display: flex; align-items: center; gap: 4px;';
            const autoDividerChk = document.createElement('input');
            autoDividerChk.type = 'checkbox';
            autoDividerChk.checked = btnDef.autoDivider === true;
            autoDividerChk.onchange = () => {
                btnDef.autoDivider = autoDividerChk.checked;
                Storage.set(globalConfig);
            };
            autoDividerLabel.appendChild(autoDividerChk);
            autoDividerLabel.appendChild(document.createTextNode('補齊 --- 分割線'));


            prefixHeadRow.appendChild(prefixLeftBox);
            prefixHeadRow.appendChild(autoDividerLabel);


            const prefixTextarea = document.createElement('textarea');
            prefixTextarea.rows = 3;
            prefixTextarea.value = btnDef.prefix || '';
            prefixTextarea.placeholder = '自訂純文字前綴，或填入 Google Doc 網址實現動態拉取';
            prefixTextarea.style.cssText = 'width: 100%; height: 80px; background: #2d2f31; color: #f9fafb; border: 1px solid #5f6368; border-radius: 4px; padding: 4px 6px; font-size: 11px; font-family: monospace; box-sizing: border-box; resize: vertical;';


            function updatePrefixDocLink() {
                const safeUrl = getSafeDocLinkUrl(prefixTextarea.value);
                if (safeUrl !== '#') {
                    prefixDocLink.href = safeUrl;
                    prefixDocLink.style.display = 'inline-flex';
                } else {
                    prefixDocLink.style.display = 'none';
                }
            }
            updatePrefixDocLink();


            prefixTextarea.oninput = () => {
                btnDef.prefix = prefixTextarea.value;
                Storage.set(globalConfig);
                updateAffixTabHighlight();
                updatePrefixDocLink();
            };
            prefixGroup.appendChild(prefixHeadRow);
            prefixGroup.appendChild(prefixTextarea);


            const suffixGroup = document.createElement('div');
            suffixGroup.style.cssText = 'display: flex; flex-direction: column; gap: 2px;';


            const suffixHeadRow = document.createElement('div');
            suffixHeadRow.style.cssText = 'display: flex; align-items: center; gap: 8px;';


            const suffixLbl = document.createElement('span');
            suffixLbl.style.cssText = 'font-size: 11px; color: #8ab4f8; font-weight: bold;';
            suffixLbl.textContent = '後綴 (支援字串文字或 Google Docs 雲端 URL)：';


            const suffixDocLink = document.createElement('a');
            suffixDocLink.textContent = '🔗 雲端直達 ↗';
            suffixDocLink.target = '_blank';
            suffixDocLink.rel = 'noopener noreferrer';
            suffixDocLink.title = '點擊在新分頁開啟此後綴雲端文件';
            suffixDocLink.style.cssText = 'color: #8ab4f8; text-decoration: none; font-size: 11px; font-weight: bold; background: #2d2f31; border: 1px solid #5f6368; padding: 1px 6px; border-radius: 4px; display: none; align-items: center; transition: all 0.2s;';
            suffixDocLink.onmouseover = () => { suffixDocLink.style.borderColor = '#8ab4f8'; suffixDocLink.style.color = '#fff'; suffixDocLink.style.background = '#3c4043'; };
            suffixDocLink.onmouseout = () => { suffixDocLink.style.borderColor = '#5f6368'; suffixDocLink.style.color = '#8ab4f8'; suffixDocLink.style.background = '#2d2f31'; };


            suffixHeadRow.appendChild(suffixLbl);
            suffixHeadRow.appendChild(suffixDocLink);


            const suffixTextarea = document.createElement('textarea');
            suffixTextarea.rows = 2;
            suffixTextarea.value = btnDef.suffix || '';
            suffixTextarea.placeholder = '自訂純文字後綴，或填入 Google Doc 網址實現動態拉取';
            suffixTextarea.style.cssText = 'width: 100%; height: 45px; background: #2d2f31; color: #f9fafb; border: 1px solid #5f6368; border-radius: 4px; padding: 4px 6px; font-size: 11px; font-family: monospace; box-sizing: border-box; resize: vertical;';


            function updateSuffixDocLink() {
                const safeUrl = getSafeDocLinkUrl(suffixTextarea.value);
                if (safeUrl !== '#') {
                    suffixDocLink.href = safeUrl;
                    suffixDocLink.style.display = 'inline-flex';
                } else {
                    suffixDocLink.style.display = 'none';
                }
            }
            updateSuffixDocLink();


            suffixTextarea.oninput = () => {
                btnDef.suffix = suffixTextarea.value;
                Storage.set(globalConfig);
                updateAffixTabHighlight();
                updateSuffixDocLink();
            };
            suffixGroup.appendChild(suffixHeadRow);
            suffixGroup.appendChild(suffixTextarea);


            paneViewAffix.appendChild(prefixGroup);
            paneViewAffix.appendChild(suffixGroup);
            card.appendChild(paneViewAffix);


            subtabBtnRule.onclick = () => {
                subtabBtnRule.classList.add('active');
                subtabBtnAffix.classList.remove('active');
                paneViewRule.style.display = 'flex';
                paneViewAffix.style.display = 'none';
                updateAffixTabHighlight();
            };


            subtabBtnAffix.onclick = () => {
                subtabBtnAffix.classList.add('active');
                subtabBtnRule.classList.remove('active');
                paneViewRule.style.display = 'none';
                paneViewAffix.style.display = 'flex';
                subtabBtnAffix.style.borderColor = '#8ab4f8';
                subtabBtnAffix.style.color = '#8ab4f8';
                subtabBtnAffix.style.background = 'rgba(138, 180, 248, 0.15)';
            };


            btnListContainer.appendChild(card);
        });


        container.appendChild(btnListContainer);
    }


    function renderPaneCloud(container) {
        while (container.firstChild) container.removeChild(container.firstChild);


        // 1. Google Docs 同步區
        const cloudHeader = document.createElement('div');
        cloudHeader.style.cssText = 'display: flex; justify-content: space-between; align-items: center; font-weight: 600; color: #9aa0a6; font-size: 12px;';
        const cloudTitle = document.createElement('span');
        cloudTitle.textContent = '🌐 雲端 JSON 配置同步 (Google Docs 純內容覆蓋)';
        const cloudDocLink = document.createElement('a');
        cloudDocLink.textContent = '🔗 開啟雲端文件↗';
        cloudDocLink.href = getSafeDocLinkUrl(globalConfig.jsonSyncUrl);
        cloudDocLink.target = '_blank';
        cloudDocLink.rel = 'noopener noreferrer';
        cloudDocLink.style.cssText = 'color: #8ab4f8; text-decoration: none; font-size: 12px;';


        cloudHeader.appendChild(cloudTitle);
        cloudHeader.appendChild(cloudDocLink);


        const inputSyncUrl = document.createElement('input');
        inputSyncUrl.type = 'text';
        inputSyncUrl.placeholder = 'https://docs.google.com/document/d/.../edit';
        inputSyncUrl.value = globalConfig.jsonSyncUrl || '';
        Object.assign(inputSyncUrl.style, {
            width: '100%', backgroundColor: '#2d2f31', color: '#f9fafb', border: '1px solid #5f6368', borderRadius: '4px', padding: '6px 8px', fontSize: '12px', boxSizing: 'border-box'
        });


        inputSyncUrl.oninput = () => {
            globalConfig.jsonSyncUrl = inputSyncUrl.value.trim();
            cloudDocLink.href = getSafeDocLinkUrl(globalConfig.jsonSyncUrl);
            Storage.set(globalConfig);
        };


        const btnCloudSync = document.createElement('button');
        btnCloudSync.textContent = '🔄 一鍵從雲端同步配置 (純內容覆蓋，隔離本機座標與熱鍵)';
        btnCloudSync.className = 'ai-copy-btn-primary';
        btnCloudSync.style.cssText = 'background: #047857; color: #ffffff; width: 100%; padding: 8px;';
        btnCloudSync.onmouseover = () => btnCloudSync.style.background = '#059669';
        btnCloudSync.onmouseout = () => btnCloudSync.style.background = '#047857';


        btnCloudSync.onclick = () => {
            syncFromJsonDoc(() => {
                mountUI(true);
                renderPaneCloud(container);
            });
        };


        container.appendChild(cloudHeader);
        container.appendChild(inputSyncUrl);
        container.appendChild(btnCloudSync);


        const divider = document.createElement('div');
        divider.style.cssText = 'height: 1px; background: #3c4043; margin: 8px 0;';
        container.appendChild(divider);


        // 2. 模組化備份精靈 (接線持久化 exportScope)
        const wizTitle = document.createElement('div');
        wizTitle.style.cssText = 'font-weight: 600; color: #9aa0a6; font-size: 12px;';
        wizTitle.textContent = '📦 模組化配置匯出精靈 (可自選導出範疇)：';
        container.appendChild(wizTitle);


        const wizBox = document.createElement('div');
        wizBox.style.cssText = 'background: #1e1f20; border: 1px solid #3c4043; border-radius: 6px; padding: 8px; display: flex; flex-direction: column; gap: 6px;';


        const exportScope = globalConfig.exportScope || { content: true, coords: false, layout: false };


        const chkMod1 = document.createElement('input'); chkMod1.type = 'checkbox'; chkMod1.checked = exportScope.content !== false;
        const lblMod1 = document.createElement('label'); lblMod1.style.cssText = 'font-size: 12px; cursor: pointer; display: flex; align-items: center; gap: 6px;';
        lblMod1.appendChild(chkMod1); lblMod1.appendChild(document.createTextNode('模組一：前後綴、站點排序與採集動作、雜訊規則、15組切片正則及熱鍵偏好 (內容設定)'));


        const chkMod2 = document.createElement('input'); chkMod2.type = 'checkbox'; chkMod2.checked = exportScope.coords === true;
        const lblMod2 = document.createElement('label'); lblMod2.style.cssText = 'font-size: 12px; cursor: pointer; display: flex; align-items: center; gap: 6px;';
        lblMod2.appendChild(chkMod2); lblMod2.appendChild(document.createTextNode('模組二：主卡片懸浮座標、小光球座標、Toast座標與收折狀態 (螢幕位置，遷移整機可選)'));


        const chkMod3 = document.createElement('input'); chkMod3.type = 'checkbox'; chkMod3.checked = exportScope.layout === true;
        const lblMod3 = document.createElement('label'); lblMod3.style.cssText = 'font-size: 12px; cursor: pointer; display: flex; align-items: center; gap: 6px;';
        lblMod3.appendChild(chkMod3); lblMod3.appendChild(document.createTextNode('模組三：AI Studio 排版佈局 (3+2/階梯/單排) 與紫鍵獨立設定'));


        function saveExportScope() {
            if (!globalConfig.exportScope) globalConfig.exportScope = {};
            globalConfig.exportScope.content = chkMod1.checked;
            globalConfig.exportScope.coords = chkMod2.checked;
            globalConfig.exportScope.layout = chkMod3.checked;
            Storage.set(globalConfig);
        }


        chkMod1.onchange = saveExportScope;
        chkMod2.onchange = saveExportScope;
        chkMod3.onchange = saveExportScope;


        wizBox.appendChild(lblMod1);
        wizBox.appendChild(lblMod2);
        wizBox.appendChild(lblMod3);
        container.appendChild(wizBox);


        function generateExportPayload() {
            const payload = JSON.parse(JSON.stringify(globalConfig));
            if (!chkMod1.checked) {
                delete payload.profiles;
                delete payload.siteTabOrder;
                delete payload.qaQueueSettings;
                delete payload.noiseSettings;
                if (payload.aiStudioSettings && payload.aiStudioSettings.modules) {
                    delete payload.aiStudioSettings.modules;
                }
            }
            if (!chkMod2.checked) {
                delete payload.uiPosition;
                delete payload.orbPosition;
                delete payload.toastPosition;
                delete payload.isCollapsed;
            }
            if (!chkMod3.checked) {
                if (payload.aiStudioSettings) {
                    delete payload.aiStudioSettings.sliceLayout;
                    delete payload.aiStudioSettings.purplePosition;
                    delete payload.aiStudioSettings.activeModuleId;
                }
            }
            return payload;
        }


        const ioRow = document.createElement('div');
        ioRow.style.cssText = 'display: flex; gap: 8px;';


        const btnCopyJson = document.createElement('button');
        btnCopyJson.textContent = '📋 複製自訂 JSON';
        btnCopyJson.className = 'ai-copy-btn-secondary';
        btnCopyJson.style.flex = '1';
        btnCopyJson.onclick = () => {
            const data = generateExportPayload();
            copyToClipboard(JSON.stringify(data, null, 2));
            showToast('✅ JSON 設定檔已複製至剪貼簿！');
        };


        const btnExport = document.createElement('button');
        btnExport.textContent = '💾 下載自訂 JSON';
        btnExport.className = 'ai-copy-btn-secondary';
        btnExport.style.flex = '1';
        btnExport.onclick = () => {
            const data = generateExportPayload();
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data, null, 2));
            const dlAnchor = document.createElement('a');
            dlAnchor.setAttribute('href', dataStr);
            dlAnchor.setAttribute('download', 'ai_copy_config.json');
            document.body.appendChild(dlAnchor);
            dlAnchor.click();
            dlAnchor.remove();
            showToast('✅ JSON 配置文件已下載！');
        };


        ioRow.appendChild(btnCopyJson);
        ioRow.appendChild(btnExport);
        container.appendChild(ioRow);


        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.json';
        fileInput.style.display = 'none';


        fileInput.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (evt) => {
                try {
                    const parsed = JSON.parse(evt.target.result);
                    if (parsed && typeof parsed === 'object') {
                        const newConfig = sanitizeConfig(parsed);
                        applyLocalOnlyOverrides(newConfig, globalConfig);
                        globalConfig = newConfig;
                        Storage.set(globalConfig);
                        mountUI(true);
                        renderPaneCloud(container);
                        showToast('✅ JSON 設定檔匯入成功 (本機座標與排版已完好保全)！');
                    } else {
                        showToast('❌ JSON 格式不符合規範！', true);
                    }
                } catch (err) {
                    showToast('❌ JSON 解析失敗！', true);
                }
            };
            reader.readAsText(file, 'UTF-8');
        };


        const btnImport = document.createElement('button');
        btnImport.textContent = '📤 匯入 JSON 檔案並自癒覆蓋';
        btnImport.className = 'ai-copy-btn-secondary';
        btnImport.style.width = '100%';
        btnImport.onclick = () => fileInput.click();


        container.appendChild(btnImport);
        container.appendChild(fileInput);
    }


    // ==========================================
    // 12. 懸浮按鈕列、小光球與滾輪雙向調度
    // ==========================================
    function resolvePurplePosition(adapter) {
        if (adapter && adapter.id === 'aistudio') {
            const aiSetting = globalConfig.aiStudioSettings?.purplePosition;
            if (aiSetting === 'right' || aiSetting === 'bottom') return aiSetting;
        }
        return globalConfig.uiSettings?.purplePosition || 'bottom';
    }


    function createOrbElement(adapter) {
        const orb = document.createElement('div');
        orb.id = FLOATING_ORB_ID;


        const curModId = globalConfig.aiStudioSettings?.activeModuleId || 'module_1';
        const modDef = globalConfig.aiStudioSettings?.modules?.[curModId] || DEFAULT_CONFIG.aiStudioSettings.modules.module_1;


        orb.style.backgroundColor = modDef.badgeColor || '#1E88E5';
        orb.style.boxShadow = `0 0 12px ${modDef.badgeColor || '#1E88E5'}, 0 4px 10px rgba(0,0,0,0.5)`;
        orb.textContent = modDef.badgeText || '發包';
        orb.title = `【${modDef.badgeText}】${modDef.name} (單擊展開，按住可拖曳)`;


        setupDraggableUI(orb, orb, true, () => {
            globalConfig.isCollapsed = false;
            Storage.set(globalConfig);
            mountUI(true);
        });


        return orb;
    }


    function attachWheelSwitch(targetEl) {
        if (!targetEl) return;
        targetEl.addEventListener('wheel', (e) => {
            if ((e.buttons & 1) || isPointerDragging) {
                e.preventDefault();
                return;
            }


            const now = Date.now();
            if (now - lastWheelTimestamp < 150) {
                e.preventDefault();
                return;
            }
            lastWheelTimestamp = now;


            e.preventDefault();
            e.stopPropagation();


            if (e.deltaY > 0) {
                switchModule('next');
            } else if (e.deltaY < 0) {
                switchModule('prev');
            }
        }, { passive: false });
    }


    function createUIElement(adapter) {
        const container = document.createElement('div');
        container.id = UI_CONTAINER_ID;


        const isAiStudio = adapter.id === 'aistudio';
        const isMistral = adapter.id === 'mistral';
        const isZai = adapter.id === 'zai';
        const isMiniMax = adapter.id === 'minimax';
        const isClaude = adapter.id === 'claude';
        const settings = globalConfig.aiStudioSettings || DEFAULT_CONFIG.aiStudioSettings;
        const curModId = settings.activeModuleId || 'module_1';
        const curMod = settings.modules?.[curModId] || DEFAULT_CONFIG.aiStudioSettings.modules.module_1;
        const layoutMode = (isAiStudio && settings.sliceLayout) ? settings.sliceLayout : 'staircase';


        const showFull = globalConfig.uiSettings.showFullThread && !isAiStudio && !isMistral;
        const showPurple = globalConfig.uiSettings.showCleanSingle;
        const effectivePurplePos = resolvePurplePosition(adapter);
        const isStacked = effectivePurplePos === 'bottom';


        // 收集切片按鈕實體
        const sliceButtonNodes = [];
        if (isAiStudio && curMod.buttons && Array.isArray(curMod.buttons)) {
            curMod.buttons.forEach((btnDef, idx) => {
                if (btnDef.enabled && btnDef.name) {
                    const sliceBtn = document.createElement('button');
                    sliceBtn.textContent = btnDef.name;
                    sliceBtn.className = `ai-copy-btn-slice ai-copy-slice-${idx % 5}`;
                    const fbTip = btnDef.fallbackPattern ? ` | 備援: ${btnDef.fallbackPattern}` : '';
                    const affixTip = (btnDef.prefix || btnDef.suffix) ? ` | 前後綴: 已裝備` : '';
                    const divTip = btnDef.autoDivider ? ` | 分割線: 自動` : '';
                    sliceBtn.title = `[模式: ${btnDef.mode === 'replace' ? '挖除' : '截取'}] 正則：${btnDef.pattern || '無'}${fbTip}${affixTip}${divTip}`;
                    sliceBtn.onclick = () => handleSliceCopyAction(btnDef);
                    sliceButtonNodes.push(sliceBtn);
                }
            });
        }


        // 控制按鈕群組
        const dragHandle = document.createElement('span');
        dragHandle.className = 'ai-copy-drag-handle';
        dragHandle.textContent = '⠿';
        dragHandle.title = '按住拖曳移動工具列';


        const btnGear = document.createElement('button');
        btnGear.textContent = '⚙️';
        btnGear.className = 'ai-copy-icon-btn ai-copy-gear-btn';
        btnGear.title = '開啟參數設定管理器 (右鍵可清空 QA 採集佇列)';
        btnGear.onclick = () => openManager();
        btnGear.oncontextmenu = (e) => {
            e.preventDefault();
            e.stopPropagation();
            const queue = getQaQueue();
            const count = Object.keys(queue.items || {}).length;
            if (count === 0) {
                showToast('ℹ️ QA 採集佇列目前為空。');
            } else {
                clearQaQueue();
                showToast(`🗑️ QA 採集佇列已手動清空 (釋放 ${count} 筆暫存)！`);
            }
        };


        const btnCollapse = document.createElement('button');
        btnCollapse.textContent = '🗕';
        btnCollapse.className = 'ai-copy-icon-btn';
        btnCollapse.style.cssText = 'height: 18px; padding: 0 6px; font-size: 11px; line-height: 1;';
        btnCollapse.title = '收折為動態小光球';
        btnCollapse.onclick = () => {
            globalConfig.isCollapsed = true;
            Storage.set(globalConfig);
            mountUI(true);
        };


        const btnToastPos = document.createElement('button');
        btnToastPos.textContent = '🍞';
        btnToastPos.className = 'ai-copy-icon-btn ai-copy-toast-btn';
        btnToastPos.style.cssText = 'height: 18px; padding: 0 5px; font-size: 11px; line-height: 1;';
        if (isToastPositioningMode) btnToastPos.classList.add('ai-copy-toast-btn-active');
        btnToastPos.title = 'Toast 提示位置設定 (點擊進入/退出拖曳定位模式)';
        btnToastPos.onclick = () => toggleToastPositioningMode();


        const collapseAndToastCol = document.createElement('div');
        collapseAndToastCol.style.cssText = 'display: flex; flex-direction: column; gap: 2px; align-items: center; justify-content: center;';
        collapseAndToastCol.appendChild(btnCollapse);
        collapseAndToastCol.appendChild(btnToastPos);


        const btnCapsule = document.createElement('button');
        btnCapsule.className = 'ai-copy-capsule-btn';
        btnCapsule.textContent = curMod.badgeText;
        btnCapsule.style.backgroundColor = curMod.badgeColor;
        btnCapsule.title = `當前武裝：【${curMod.badgeText}】${curMod.name}\n(左鍵順向輪播，右鍵反向回退，滾輪切換)`;


        btnCapsule.onclick = () => switchModule('next');
        btnCapsule.oncontextmenu = (e) => {
            e.preventDefault();
            switchModule('prev');
        };


        const controlGroup = document.createElement('div');
        controlGroup.style.cssText = 'display: flex; align-items: center; gap: 4px;';
        controlGroup.appendChild(dragHandle);
        controlGroup.appendChild(btnGear);
        controlGroup.appendChild(collapseAndToastCol);
        if (isAiStudio) controlGroup.appendChild(btnCapsule);


        if (isAiStudio) {
            const scope = settings.wheelSwitchScope || 'capsule_only';
            if (scope === 'capsule_only') {
                attachWheelSwitch(btnCapsule);
            } else if (scope === 'control_group') {
                attachWheelSwitch(controlGroup);
            } else if (scope === 'entire_toolbar') {
                attachWheelSwitch(container);
            }
        }


        // 藍鍵 / 雙軌按鈕分裂機制 (納入 Claude)
        let btnSingleBlue = null;
        let btnPreviewGreen = null;


        if (isZai || isMiniMax || isClaude) {
            btnSingleBlue = document.createElement('button');
            btnSingleBlue.textContent = (isZai || isClaude) ? '📋 複製最後對話' : '📋 複製最後回覆';
            btnSingleBlue.className = 'ai-copy-btn';
            btnSingleBlue.title = `${(isZai || isClaude) ? '複製左側最後回覆對話' : '複製最後回覆'} (Alt + C，按住可拖曳)`;
            btnSingleBlue.onclick = () => handleCopyAction('SINGLE');


            btnPreviewGreen = document.createElement('button');
            btnPreviewGreen.textContent = '📄 複製右側預覽';
            btnPreviewGreen.className = 'ai-copy-btn-docx';
            btnPreviewGreen.title = isClaude ? '提取右側 Artifacts 成果物為 Markdown (按住可拖曳)' : (isZai ? '提取右側預覽內容為 Markdown (按住可拖曳)' : '提取右側成果物為 Markdown (按住可拖曳)');
            btnPreviewGreen.onclick = () => {
                if (isClaude) handleClaudePreviewAction();
                else if (isZai) handleZaiPreviewAction();
                else handleMiniMaxDeliverableCopyAction();
            };
        } else {
            btnSingleBlue = document.createElement('button');
            btnSingleBlue.textContent = '📋 複製最後回覆';
            btnSingleBlue.className = 'ai-copy-btn';
            btnSingleBlue.title = '快捷鍵：Alt + C (按住可拖曳)';
            btnSingleBlue.onclick = () => handleCopyAction('SINGLE');
        }


        let btnSinglePurple = null;
        if (showPurple) {
            btnSinglePurple = document.createElement('button');
            btnSinglePurple.textContent = '🧹 乾淨最後回覆';
            btnSinglePurple.className = 'ai-copy-btn-purple';
            btnSinglePurple.title = '100% 原始純淨 Markdown (無前後綴，按住可拖曳)';
            btnSinglePurple.onclick = () => handleCopyAction('SINGLE_CLEAN');
        }


        // 分流 1：AI Studio 直排階梯雙欄
        if (isAiStudio && layoutMode === 'staircase') {
            const btnBar = document.createElement('div');
            btnBar.className = 'ai-copy-btn-bar-staircase';


            const leftCol = document.createElement('div');
            leftCol.className = 'ai-copy-left-col';


            const gearRow = document.createElement('div');
            gearRow.style.cssText = 'display: flex; gap: 6px; align-items: center;';
            gearRow.appendChild(controlGroup);
            gearRow.appendChild(btnSingleBlue);


            leftCol.appendChild(gearRow);
            if (btnSinglePurple) leftCol.appendChild(btnSinglePurple);


            const rightCol = document.createElement('div');
            rightCol.className = 'ai-copy-right-col';
            sliceButtonNodes.forEach(b => rightCol.appendChild(b));


            btnBar.appendChild(leftCol);
            if (sliceButtonNodes.length > 0) btnBar.appendChild(rightCol);


            container.appendChild(btnBar);
            setupDraggableUI(container, container, false);
            updateGearIndicator();
            return container;
        }


        // 分流 2：標準橫排主列
        const btnBar = document.createElement('div');
        btnBar.className = 'ai-copy-btn-bar';


        const mainRow = document.createElement('div');
        mainRow.className = 'ai-copy-main-row';


        mainRow.appendChild(controlGroup);
        mainRow.appendChild(btnSingleBlue);
        if (btnPreviewGreen) mainRow.appendChild(btnPreviewGreen);


        if (showFull) {
            const btnFullBlue = document.createElement('button');
            btnFullBlue.textContent = '📚 複製全對話串';
            btnFullBlue.className = 'ai-copy-btn';
            btnFullBlue.title = '快捷鍵：Alt + Shift + C (按住可拖曳)';
            btnFullBlue.onclick = () => handleCopyAction('FULL_THREAD');
            mainRow.appendChild(btnFullBlue);
        }


        if (btnSinglePurple && !isStacked) {
            mainRow.appendChild(btnSinglePurple);
        }


        btnBar.appendChild(mainRow);


        // 分流 3：次級列按鈕分流
        if (isAiStudio && layoutMode === 'single_row') {
            const subRow = document.createElement('div');
            subRow.className = 'ai-copy-sub-row-single';


            if (btnSinglePurple && isStacked) subRow.appendChild(btnSinglePurple);
            sliceButtonNodes.forEach(b => subRow.appendChild(b));


            if (subRow.children.length > 0) btnBar.appendChild(subRow);
        } else if (isAiStudio && layoutMode === 'grid_3_2') {
            const subRowGrid = document.createElement('div');
            subRowGrid.className = 'ai-copy-sub-row-grid';


            const gridRow1 = document.createElement('div');
            gridRow1.className = 'ai-copy-grid-row';
            const gridRow2 = document.createElement('div');
            gridRow2.className = 'ai-copy-grid-row';


            let r1Limit = 3;
            if (btnSinglePurple && isStacked) {
                gridRow1.appendChild(btnSinglePurple);
                r1Limit = 2;
            }


            sliceButtonNodes.forEach((b, idx) => {
                if (idx < r1Limit) gridRow1.appendChild(b);
                else gridRow2.appendChild(b);
            });


            if (gridRow1.children.length > 0) subRowGrid.appendChild(gridRow1);
            if (gridRow2.children.length > 0) subRowGrid.appendChild(gridRow2);


            if (subRowGrid.children.length > 0) btnBar.appendChild(subRowGrid);
        } else {
            const subRow = document.createElement('div');
            subRow.className = 'ai-copy-sub-row';


            if (btnSinglePurple && isStacked) subRow.appendChild(btnSinglePurple);
            sliceButtonNodes.forEach(b => subRow.appendChild(b));


            if (subRow.children.length > 0) btnBar.appendChild(subRow);
        }


        container.appendChild(btnBar);
        setupDraggableUI(container, container, false);
        updateGearIndicator();
        return container;
    }


    function mountUI(forceRemount = false) {
        try {
            const adapter = getCurrentAdapter();
            if (!adapter) return;


            let container = document.getElementById(UI_CONTAINER_ID);
            let orb = document.getElementById(FLOATING_ORB_ID);


            if (forceRemount) {
                if (container) { container.remove(); container = null; }
                if (orb) { orb.remove(); orb = null; }
            }


            if (globalConfig.isCollapsed) {
                if (container) { container.remove(); container = null; }
                if (!orb || !orb.isConnected || orb.parentNode !== document.body) {
                    if (orb) { try { orb.remove(); } catch (e) {} }
                    orb = createOrbElement(adapter);
                    applySavedPosition(orb, adapter, true);
                    document.body.appendChild(orb);
                }
            } else {
                if (orb) { orb.remove(); orb = null; }
                if (!container || !container.isConnected || container.parentNode !== document.body) {
                    if (container) { try { container.remove(); } catch (e) {} }
                    container = createUIElement(adapter);
                    applySavedPosition(container, adapter, false);
                    document.body.appendChild(container);
                }
            }
            updateGearIndicator();
        } catch (err) {
            console.error('❌ [AI Copy] mountUI 掛載異常:', err);
        }
    }


    // ==========================================
    // 13. 熱鍵調度矩陣：多熱鍵別名陣列解析、輸入框全域穿透與 Caret 阻斷
    // ==========================================
    function isSingleHotkeyMatch(event, rawStr) {
        if (!rawStr) return false;
        let str = rawStr.trim().toUpperCase();
        if (!str) return false;


        let needCtrl = false;
        let needAlt = false;
        let needShift = false;


        // 1. AHK 符號前綴循環剝離 (^ = Ctrl, ! = Alt, + = Shift)
        let parsed = true;
        while (parsed && str.length > 1) {
            if (str.startsWith('^')) {
                needCtrl = true;
                str = str.substring(1).trim();
            } else if (str.startsWith('!')) {
                needAlt = true;
                str = str.substring(1).trim();
            } else if (str.startsWith('+')) {
                needShift = true;
                str = str.substring(1).trim();
            } else {
                parsed = false;
            }
        }


        // 2. 傳統文字組合鍵解析 (如 Ctrl+Alt+F4)
        const parts = str.split('+').map(p => p.trim());
        const targetKey = parts[parts.length - 1];


        if (parts.includes('CTRL')) needCtrl = true;
        if (parts.includes('ALT')) needAlt = true;
        if (parts.includes('SHIFT')) needShift = true;


        if (event.ctrlKey !== needCtrl) return false;
        if (event.altKey !== needAlt) return false;
        if (event.shiftKey !== needShift) return false;


        const currentKey = event.key.toUpperCase();
        return currentKey === targetKey || event.code.toUpperCase() === targetKey;
    }


    function isHotkeyMatch(event, hotkeyStr) {
        if (typeof hotkeyStr !== 'string' || !hotkeyStr.trim()) return false;
        const candidates = hotkeyStr.split(',').map(s => s.trim()).filter(Boolean);
        if (candidates.length === 0) return false;


        for (const cand of candidates) {
            if (isSingleHotkeyMatch(event, cand)) {
                return true;
            }
        }
        return false;
    }


    function setupHotkeys() {
        window.addEventListener('keydown', (e) => {
            const summaryKeyStr = globalConfig.qaQueueSettings?.summaryHotkey || '';
            const captureKeyStr = globalConfig.qaQueueSettings?.captureHotkey || '';


            // 1. 強制阻斷 Caret Browsing 原生彈窗 (在 Capture 階段最前端優先攔截)
            if (isHotkeyMatch(e, summaryKeyStr)) {
                e.preventDefault();
                e.stopPropagation();
            }


            // 2. 滿額/總結匯出熱鍵判定 (穿透豁免輸入框阻斷)
            if (isHotkeyMatch(e, summaryKeyStr)) {
                handleSummaryAction();
                return;
            }


            // 3. 採集暫存熱鍵判定 (穿透豁免輸入框阻斷)
            if (isHotkeyMatch(e, captureKeyStr)) {
                e.preventDefault();
                e.stopPropagation();
                handleCaptureAction();
                return;
            }


            // 4. 文字輸入性按鍵與 Alt+C 複製按鍵維持輸入框阻斷，防打字衝突
            if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;


            // 既有複製快捷鍵
            if (e.altKey && !e.shiftKey && (e.key === 'c' || e.key === 'C')) {
                e.preventDefault();
                handleCopyAction('SINGLE');
            } else if (e.altKey && e.shiftKey && (e.key === 'C' || e.key === 'c')) {
                e.preventDefault();
                handleCopyAction('FULL_THREAD');
            }
        }, true);
    }


    function setupMenuCommands() {
        if (typeof GM_registerMenuCommand !== 'undefined') {
            GM_registerMenuCommand('⚙️ 📍 僅重置浮動按鈕與小光球位置', resetUiPosition);
            GM_registerMenuCommand('⚙️ 🛠️ 開啟參數設定管理器', openManager);
            GM_registerMenuCommand('🗑️ 物理清空 QA 採集暫存池', () => {
                clearQaQueue();
                showToast('🗑️ QA 採集暫存佇列已清空！');
            });
        }
    }


    let mountDebounceTimer = null;


    function init() {
        injectStyles();
        mountUI();
        setupHotkeys();
        setupMenuCommands();


        setInterval(mountUI, 500);


        const observer = new MutationObserver(() => {
            if (mountDebounceTimer) clearTimeout(mountDebounceTimer);
            mountDebounceTimer = setTimeout(() => {
                mountUI();
            }, 200);
        });
        observer.observe(document.body, { childList: true, subtree: true });


        window.addEventListener('resize', () => {
            const container = document.getElementById(UI_CONTAINER_ID);
            if (container) clampContainerToViewport(container);
            const orb = document.getElementById(FLOATING_ORB_ID);
            if (orb) clampContainerToViewport(orb);
            const toast = document.getElementById('ai-copy-toast');
            if (toast && isToastPositioningMode) clampContainerToViewport(toast);
        });
    }


    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
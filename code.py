# -*- coding: utf-8 -*-
__version__ = "1.3.3"
"""
小說審核雷達正則維護工具 v1.3.3 (存檔組態閉環、可調請求逾時、模型調優與同源實戰加固版)
- 雙階正則優化流水線 (雷達工程師提案 ➔ 雷達 QA 複決審核)
- 具備指數退避重試 (Exponential Backoff + Full Jitter) 與多階模型備援
- 支援雙字典對照切換、時間戳自動 .bak 備份 (含同秒防撞) 與雙重原子替換 (os.replace + fsync)
- 支援日誌檔案拖曳載入 (TkinterDnD 平滑降級相容)
- 全線程安全 (Thread-Safe) 派發與空內容防清空寫入阻斷
- 🔑 v1.0.4 ~ v1.3.2 核心防迴歸繼承：錨點物理唯一性門禁 (count == 1)、SHA-256 數位印章防調包、
  第 0 秒本機極速硬阻斷 (0ms)、記憶體微創切片與原地縫合、固化告警橫幅、哨兵記憶體原子預檢門禁、
  微創縫合多區塊去重置換、頁籤 2 寬度動態貼合、全域滾輪穿透、路徑反斜線正規化、快速開啟檢驗、
  世代隔離碼錶、PCRE2 回溯控制動詞安全置換與致命黑名單、歷史看板滾輪隔離。
- 🌟 v1.3.3 重大升級與強化：
  1. 【BL-new-01 存檔重讀閉環與原子強化】：執行前零秒攔截空/缺目標字典；存檔前重讀 config.json
     選擇性同步 6 鍵、未儲存路徑差異警示、切片磁碟目標檢驗及失敗快照保留；雙重寫入補齊 flush/fsync。
  2. 【BL-new-02 可調逾時與 2026-11 模型階梯】：新增 request_timeout_seconds (預設 300s，10~600s)，
     共用 PRESET_MODELS 並汰除重路由模型、實作防反向升級過濾及執行期頂部選單連動鎖定。
  3. 【BL-new-03 同源實戰加固】：底欄雙層動態折行且耗時前置；碼錶/退避心跳互鎖；404/429 授權誤差隔離；
     零依賴 GBK/Big5 啟發式裁決；WM_DELETE_WINDOW 安全停機與剪貼簿/橫幅防護。
  4. 【BL-next-01~06 技術債收斂】：API Key 雜湊黑名單、測試帳號降級明示、主執行緒快照提交、
     歷史看板東亞字寬對齊、同秒備份防撞及 Toast 銷毀存在性檢查。
"""


import copy
import os
import sys


# 🛡️ 遞迴深度防護宣告 (防止 PyInstaller 打包深度溢出)
sys.setrecursionlimit(5000)


import hashlib
import json
import re
import shutil
import threading
import time
import random
import subprocess
import unicodedata
from datetime import datetime
import tkinter as tk
from tkinter import ttk, scrolledtext, filedialog


# ---------------------------------------------------------------------------
# 0. 執行路徑與備份目錄解析 (路徑一律 Windows 反斜線正規化)
# ---------------------------------------------------------------------------
if getattr(sys, 'frozen', False):
    SCRIPT_DIR = os.path.normpath(os.path.dirname(sys.executable))
else:
    SCRIPT_DIR = os.path.normpath(os.path.dirname(os.path.abspath(__file__)))


TOOL_BAK_DIR = os.path.normpath(os.path.join(SCRIPT_DIR, "bak"))


# ---------------------------------------------------------------------------
# 1. 動態相容載入：TkinterDnD 拖曳模組
# ---------------------------------------------------------------------------
HAS_DND = False
try:
    from tkinterdnd2 import TkinterDnD, DND_FILES
    HAS_DND = True
except ImportError:
    HAS_DND = False


# ---------------------------------------------------------------------------
# 2. 動態相容載入：Gemini 官方 SDK (優先 google.genai，降級相容 google.generativeai)
# ---------------------------------------------------------------------------
GENAI_MODE = None
try:
    from google import genai
    GENAI_MODE = "google.genai"
except ImportError:
    try:
        import google.generativeai as genai_legacy
        GENAI_MODE = "google.generativeai"
    except ImportError:
        GENAI_MODE = None


# ---------------------------------------------------------------------------
# 3. Toast 吐司通知元件 (無阻塞、置頂、自動銷毀浮圖)
# ---------------------------------------------------------------------------
class Toast:
    @staticmethod
    def show(root, message, duration=1800, bg="#1e1e2e", fg="#ffffff"):
        """在視窗下方中央彈出非阻塞 Toast 提示 (必須由主執行緒呼叫)"""
        try:
            top = tk.Toplevel(root)
            top.overrideredirect(True)
            top.attributes("-topmost", True)


            frame = tk.Frame(top, bg=bg, highlightbackground="#45475a", highlightthickness=1)
            frame.pack(fill=tk.BOTH, expand=True)


            lbl = tk.Label(
                frame,
                text=message,
                bg=bg,
                fg=fg,
                font=("Microsoft YaHei UI", 10, "bold"),
                padx=16,
                pady=8,
                justify=tk.CENTER
            )
            lbl.pack()


            root.update_idletasks()
            rx = root.winfo_rootx()
            ry = root.winfo_rooty()
            rw = root.winfo_width()
            rh = root.winfo_height()


            top.update_idletasks()
            tw = top.winfo_width()
            th = top.winfo_height()


            x = rx + (rw // 2) - (tw // 2)
            y = ry + rh - th - 60
            top.geometry(f"+{x}+{y}")


            def _safe_destroy():
                try:
                    if top.winfo_exists():
                        top.destroy()
                except Exception:
                    pass


            root.after(duration, _safe_destroy)
        except Exception:
            pass


# ---------------------------------------------------------------------------
# 4. 主應用程式類別 (Stage 3 雷達正則專用維護工具)
# ---------------------------------------------------------------------------
class RadarRegexToolApp:
    CONFIG_FILE = os.path.normpath(os.path.join(SCRIPT_DIR, "config.json"))
    ANCHOR_TEXT = "=== 以下為優化後之完整 PCRE 正則字典條目 ==="
    EOF_MARKER = "=== 字典全檔輸出結束 [EOF] ==="


    COLOR_SAVE_NORMAL = "#059669"   # 翡翠綠
    COLOR_SAVE_WARNING = "#dc2626"  # 告警紅


    ENTRY_BLOCK_REGEX = re.compile(r'(?ms)^;\s*\[(?:\d+[\.、\s]*)?([^\]\s\-]+)[^\]]*\].*?(?=(?:^;\s*\[|\Z))')


    PRESET_MODELS = [
        "gemini-4-hydrogen",
        "gemini-3.8-flash",
        "gemini-3.6-flash",
        "gemini-3.5-flash-lite",
        "gemini-3.1-flash-lite",
    ]


    RETIRED_MODEL_ALIAS = {
        "gemini-3.7-flash": "gemini-3.8-flash",
        "gemini-3.5-flash": "gemini-3.6-flash",
    }


    DEFAULT_PROFILES = [
        {"name": "帳號 1 (預設主帳)", "key": "", "note": "主金鑰"},
        {"name": "帳號 2 (備用帳號 1)", "key": "", "note": "備援金鑰 1"},
        {"name": "帳號 3 (備用帳號 2)", "key": "", "note": "備援金鑰 2"}
    ]


    DEFAULT_CONFIG = {
        "api_profiles": DEFAULT_PROFILES,
        "account_dispatch_mode": "random",        # "random", "round_robin", "locked"
        "retry_route_policy": "horizontal_first",  # "horizontal_first", "quality_locked", "vertical_first"
        "locked_account_index": 0,
        "gemini_model": "gemini-3.8-flash",
        "fallback_model_1": "gemini-3.6-flash",
        "fallback_model_2": "gemini-3.5-flash-lite",
        "max_retries": 3,
        "base_delay_seconds": 2.0,
        "request_timeout_seconds": 300.0,
        "enable_fallback": True,
        "swap_bottom_bar": False,
        "enable_click_to_copy": False,
        "enable_clear_and_paste": False,
        "dict_path_1": os.path.normpath(os.path.join(SCRIPT_DIR, "正則查找字典.txt")),
        "dict_path_2": os.path.normpath(os.path.join(SCRIPT_DIR, "正則查找字典2.txt")),
        "radar_engineer_prompt_path": os.path.normpath(os.path.join(SCRIPT_DIR, "階段三雷達工程師提示詞.txt")),
        "radar_qa_prompt_path": os.path.normpath(os.path.join(SCRIPT_DIR, "階段三雷達QA提示詞.txt")),
        "api_key": "",
        "enable_collision_sentinel": True,
        "sentinel_script_path": os.path.normpath(os.path.join(SCRIPT_DIR, "正則衝突檢測守衛.py"))
    }


    DISPATCH_DESCRIPTIONS = {
        "random": (
            "🎲【隨機均攤分流 (推薦)】\n"
            "• 調度邏輯：每次點擊任務時，從所有已填入 API Key 的有效帳號中，完全隨機挑選 1 組帳號起手。\n"
            "• 適用場景：擁有多組免費 Tier 帳號，能最大化分散請求並發，平攤每日配額消耗，極難觸發單一帳號 503/429 尖峰排隊。"
        ),
        "round_robin": (
            "🔄【依序輪動分流 (公平排程)】\n"
            "• 調度邏輯：內部維護循環計數器，任務 A 用帳號 1 ➔ 任務 B 用帳號 2 ➔ 任務 C 用帳號 3 ➔ 循環往復。\n"
            "• 適用場景：維護任務節奏密集、想要絕對平均耗盡各帳號每分鐘 RPM/TPM 配額的場景。"
        ),
        "locked": (
            "🔒【固定鎖定指定帳號】\n"
            "• 調度邏輯：始終優先以「帳號名稱」下拉選單目前選定的帳號起手發送。\n"
            "• 適用場景：擁有 1 組主要付費的高速 Tier 帳號，其餘帳號僅作為緊急保底備援時使用。"
        )
    }


    RETRY_ROUTE_DESCRIPTIONS = {
        "horizontal_first": (
            "⚡【橫向擴展優先：A主 ➔ B主 ➔ C主 ➔ 降階備援 (極限守護主模型品質)】\n"
            "• 流程：帳號1(3.8) 遇阻 ➔ 帳號2(3.8) 遇阻 ➔ 帳號3(3.8) 遇阻 ➔ 全員失敗始切換 帳號1(3.6) 降階。\n"
            "• 優勢：絕不輕易向降階模型妥協！只要任何一個備用帳號的主模型有空檔就立即完成，品質最高。"
        ),
        "quality_locked": (
            "🚀【品質優先不降：全帳號持續輪流重試主要模型 (嚴禁降階)】\n"
            "• 流程：帳號1(3.8) ➔ 帳號2(3.8) ➔ 帳號3(3.8) ➔ 退避重試輪動... (模型永遠鎖死 3.8，絕不切換 3.6/3.5-lite)。\n"
            "• 優勢：追求極致 PCRE 正則嚴密品質，寧可遭遇退避等待也絕不接受次級模型生成的正則條目。"
        ),
        "vertical_first": (
            "🛡️【帳號穿透優先：A主 ➔ A副1 ➔ A副2 ➔ B主 ➔ B副... (單帳號深度穿透)】\n"
            "• 流程：帳號1(3.8) 遇阻 ➔ 帳號1(3.6) 遇阻 ➔ 帳號1(3.5-lite) 耗盡 ➔ 始切換 帳號2(3.8) 重新來過。\n"
            "• 優勢：傳統保守策略，盡可能集中在單一帳號內完成模型階梯切換，適合主帳號配額充足但偶發特定模型 503 之場景。"
        )
    }


    def __init__(self, root):
        self.root = root
        dnd_title_suffix = " (支援拖曳)" if HAS_DND else " (未安裝拖曳庫)"
        self.root.title(
            f"小說審核雷達正則維護工具 v{__version__} - 階段三審核專用 "
            f"(碼錶隔離、請求逾時與雙階閉環加固版){dnd_title_suffix}"
        )
        self.root.geometry("1200x950")
        self.root.minsize(1000, 750)


        self.default_font = ("Microsoft YaHei UI", 9)
        self.bold_font = ("Microsoft YaHei UI", 9, "bold")
        self.code_font = ("Consolas", 9)


        # 狀態與選擇變數
        self.selected_dict_for_ai = tk.StringVar(value="dict1")


        # 載入與校正組態
        self.config = self.load_config()


        # 介面變數
        self.var_click_to_copy = tk.BooleanVar(value=bool(self.config.get("enable_click_to_copy", False)))
        self.var_clear_and_paste = tk.BooleanVar(value=bool(self.config.get("enable_clear_and_paste", False)))
        self.var_swap_bottom_bar = tk.BooleanVar(value=bool(self.config.get("swap_bottom_bar", False)))
        self.var_enable_fallback = tk.BooleanVar(value=bool(self.config.get("enable_fallback", True)))
        self.var_enable_sentinel = tk.BooleanVar(value=bool(self.config.get("enable_collision_sentinel", True)))


        # 多帳號內部計數器
        self.rr_counter = 0


        # 互斥鎖、任務快照與抗焦慮碼錶 / 心跳互鎖狀態
        self.is_running = False
        self.heartbeat_active = False
        self.stopwatch_running = False
        self.stopwatch_token = 0
        self.stopwatch_after_id = None
        self.last_task_snapshot = None
        self.history_logs = []


        # 控制項引用
        self.top_frame = None
        self.alert_banner = None
        self.lbl_alert_msg = None
        self.btn_sentinel_launch = None


        self.account_combo = None
        self.model_combo = None
        self.test_btn = None
        self.btn_auto = None
        self.btn_clear = None
        self.chk_clear_and_paste = None
        self.chk_click_to_copy = None
        self.btn_s1 = None
        self.btn_s2 = None
        self.btn_save = None
        self.btn_copy = None
        self.lbl_status = None
        self.action_bar = None
        self.action_btn_row = None
        self.action_status_row = None


        self.frame_s1 = None
        self.frame_s2 = None
        self.txt_history = None
        self.tab2_canvas = None
        self.tab2_scrollable_frame = None
        self.entry_request_timeout = None


        # 頁籤 2 畫布視窗參照
        self.canvas_window = None


        # 頁籤 2 多帳號輸入元件暫存清單
        self.profile_entries = []


        # 啟動時自動清理殘留暫存檔
        self.cleanup_orphan_tmp_files()


        # UI 建構
        self.build_top_bar()
        self.build_alert_banner()
        self.build_notebook()


        # 視窗安全關閉協議 (WM_DELETE_WINDOW)
        self.root.protocol("WM_DELETE_WINDOW", self._on_closing)


    def _on_closing(self):
        self.is_running = False
        self.heartbeat_active = False
        self._stop_stopwatch()
        try:
            self.root.destroy()
        except Exception:
            pass


    @staticmethod
    def _norm_path_or_empty(raw_path: str) -> str:
        """安全路徑正規化：空字串維持為空字串，非空則轉標準反斜線 (UX-02)"""
        s = str(raw_path or "").strip()
        return os.path.normpath(s) if s else ""


    @staticmethod
    def _pad_display_width(text: str, width: int) -> str:
        """依東亞字元寬度截斷並以半形空白補齊固定欄寬 (BL-next-04)"""
        s = str(text or "")
        out_chars = []
        cur_w = 0
        for ch in s:
            w = 2 if unicodedata.east_asian_width(ch) in ("W", "F") else 1
            if cur_w + w > width:
                break
            out_chars.append(ch)
            cur_w += w
        return "".join(out_chars) + (" " * max(0, width - cur_w))


    # -----------------------------------------------------------------------
    # 設定檔讀寫 (config.json) - 深拷貝、UTF-8-SIG 相容與雙重原子置換
    # -----------------------------------------------------------------------
    def load_config(self):
        cfg = copy.deepcopy(self.DEFAULT_CONFIG)
        if os.path.exists(self.CONFIG_FILE):
            try:
                with open(self.CONFIG_FILE, "r", encoding="utf-8-sig") as f:
                    disk_cfg = json.load(f)
                    if isinstance(disk_cfg, dict):
                        for key, val in disk_cfg.items():
                            cfg[key] = val
            except Exception:
                pass


        # 元素級深層驗證 api_profiles
        raw_profiles = cfg.get("api_profiles", [])
        if not isinstance(raw_profiles, list):
            raw_profiles = []


        normalized_profiles = []
        for i, p in enumerate(raw_profiles[:3]):
            if not isinstance(p, dict):
                p = {}
            normalized_profiles.append({
                "name": str(p.get("name") or f"帳號 {i+1}").strip(),
                "key": str(p.get("key") or "").strip(),
                "note": str(p.get("note") or "").strip()
            })


        while len(normalized_profiles) < 3:
            idx = len(normalized_profiles) + 1
            normalized_profiles.append({"name": f"帳號 {idx}", "key": "", "note": f"備用金鑰 {idx-1}"})


        legacy_key = str(cfg.get("api_key") or "").strip()
        if legacy_key and not normalized_profiles[0]["key"]:
            normalized_profiles[0]["key"] = legacy_key


        cfg["api_profiles"] = normalized_profiles
        cfg["api_key"] = normalized_profiles[0]["key"]


        # 舊重路由模型遷移
        if str(cfg.get("fallback_model_1", "")).strip() == "gemini-3.7-flash":
            cfg["fallback_model_1"] = "gemini-3.6-flash"
        if str(cfg.get("fallback_model_2", "")).strip() == "gemini-3.5-flash":
            cfg["fallback_model_2"] = "gemini-3.5-flash-lite"


        # 數值 Clamp 防護
        try:
            cfg["max_retries"] = max(1, min(10, int(cfg.get("max_retries", 3))))
        except Exception:
            cfg["max_retries"] = 3


        try:
            cfg["base_delay_seconds"] = max(0.1, min(30.0, float(cfg.get("base_delay_seconds", 2.0))))
        except Exception:
            cfg["base_delay_seconds"] = 2.0


        try:
            cfg["request_timeout_seconds"] = max(10.0, min(600.0, float(cfg.get("request_timeout_seconds", 300.0))))
        except Exception:
            cfg["request_timeout_seconds"] = 300.0


        try:
            cfg["locked_account_index"] = max(0, min(2, int(cfg.get("locked_account_index", 0))))
        except Exception:
            cfg["locked_account_index"] = 0


        # 枚舉防護
        if cfg.get("account_dispatch_mode") not in ["random", "round_robin", "locked"]:
            cfg["account_dispatch_mode"] = "random"
        if cfg.get("retry_route_policy") not in ["horizontal_first", "quality_locked", "vertical_first"]:
            cfg["retry_route_policy"] = "horizontal_first"


        # 5 大路徑安全正規化 (空路徑保持 ""，非空轉反斜線)
        for path_k in ["dict_path_1", "dict_path_2", "radar_engineer_prompt_path", "radar_qa_prompt_path", "sentinel_script_path"]:
            cfg[path_k] = self._norm_path_or_empty(cfg.get(path_k, ""))


        return cfg


    def save_config(self):
        tmp_cfg_path = self.CONFIG_FILE + ".tmp"
        try:
            with open(tmp_cfg_path, "w", encoding="utf-8") as f:
                json.dump(self.config, f, ensure_ascii=False, indent=2)
                f.flush()
                os.fsync(f.fileno())
            os.replace(tmp_cfg_path, self.CONFIG_FILE)
        except Exception as e:
            Toast.show(self.root, f"❌ 設定檔儲存失敗: {str(e)}", bg="#ef4444", fg="#ffffff")
        finally:
            if os.path.exists(tmp_cfg_path):
                try:
                    os.remove(tmp_cfg_path)
                except Exception:
                    pass


    def get_active_profiles(self) -> list[dict]:
        profiles = self.config.get("api_profiles", [])
        valid = [p for p in profiles if isinstance(p, dict) and p.get("key", "").strip()]
        return valid


    # -----------------------------------------------------------------------
    # 臨時檔清理器
    # -----------------------------------------------------------------------
    def cleanup_orphan_tmp_files(self):
        def _cleanup():
            now = time.time()
            target_dirs = {SCRIPT_DIR}
            for k in ["dict_path_1", "dict_path_2"]:
                p = self._norm_path_or_empty(self.config.get(k, ""))
                if p and os.path.exists(os.path.dirname(p)):
                    target_dirs.add(os.path.dirname(p))


            for d in target_dirs:
                if not os.path.exists(d):
                    continue
                try:
                    for f in os.listdir(d):
                        if f.endswith(".tmp") or ".sentinel_dryrun.tmp" in f or ".tmp_" in f:
                            fp = os.path.join(d, f)
                            if os.path.isfile(fp):
                                try:
                                    if now - os.path.getmtime(fp) > 600:
                                        os.remove(fp)
                                except Exception:
                                    pass
                except Exception:
                    pass


        threading.Thread(target=_cleanup, daemon=True).start()


    # -----------------------------------------------------------------------
    # 模組 1：頂部控制列
    # -----------------------------------------------------------------------
    def build_top_bar(self):
        self.top_frame = ttk.LabelFrame(self.root, text="🔑 Gemini API 帳號調度與模型設定", padding=10)
        self.top_frame.pack(fill=tk.X, padx=10, pady=5)


        ttk.Label(self.top_frame, text="作用帳號:").grid(row=0, column=0, sticky=tk.W, padx=5)
        self.account_combo = ttk.Combobox(self.top_frame, width=28, state="readonly")
        self.refresh_top_account_combo()
        self.account_combo.grid(row=0, column=1, padx=5, sticky=tk.W)
        self.account_combo.bind("<<ComboboxSelected>>", self.on_top_account_selected)


        ttk.Label(self.top_frame, text="主要模型:").grid(row=0, column=2, sticky=tk.W, padx=(10, 5))
        self.model_combo = ttk.Combobox(self.top_frame, values=self.PRESET_MODELS, width=22)
        current_model = self.config.get("gemini_model", "gemini-3.8-flash")
        self.model_combo.set(current_model)
        self.model_combo.grid(row=0, column=3, padx=5, sticky=tk.W)


        save_btn = ttk.Button(self.top_frame, text="💾 儲存頂部設定", command=self.save_top_config)
        save_btn.grid(row=0, column=4, padx=5)


        self.test_btn = ttk.Button(self.top_frame, text="⚡ 測試連通性", command=self.test_api_connection)
        self.test_btn.grid(row=0, column=5, padx=5)


        sdk_text = f"SDK: {GENAI_MODE}" if GENAI_MODE else "⚠️ 未偵測到 SDK"
        sdk_fg = "#2e7d32" if GENAI_MODE else "#c62828"
        sdk_lbl = tk.Label(self.top_frame, text=sdk_text, fg=sdk_fg, font=self.bold_font)
        sdk_lbl.grid(row=0, column=6, padx=10)


    def refresh_top_account_combo(self):
        profiles = self.config.get("api_profiles", [])
        mode = self.config.get("account_dispatch_mode", "random")


        mode_tags = {
            "random": "[🎲隨機起手]",
            "round_robin": "[🔄輪動起手]",
            "locked": "[🔒固定鎖定]"
        }
        tag = mode_tags.get(mode, "")


        items = []
        for i, p in enumerate(profiles):
            name = p.get("name", f"帳號 {i+1}").strip()
            key = p.get("key", "").strip()
            status_str = "已配鑰" if key else "未配鑰"
            items.append(f"{i+1}. {name} ({status_str}) {tag}")


        self.account_combo.config(values=items)
        locked_idx = self.config.get("locked_account_index", 0)
        if 0 <= locked_idx < len(items):
            self.account_combo.current(locked_idx)


    def on_top_account_selected(self, event=None):
        idx = self.account_combo.current()
        if idx >= 0:
            self.config["locked_account_index"] = idx
            self.save_config()


    def save_top_config(self):
        self.on_top_account_selected()
        self.config["gemini_model"] = self.model_combo.get().strip()
        self.save_config()
        Toast.show(self.root, f"✅ 頂部模型 [{self.config['gemini_model']}] 與帳號索引已儲存！")


    # -----------------------------------------------------------------------
    # 模組 1.5：固化常駐告警橫幅
    # -----------------------------------------------------------------------
    def build_alert_banner(self):
        self.alert_banner = tk.Frame(
            self.root,
            bg="#fef2f2",
            highlightbackground="#f87171",
            highlightthickness=1,
            padx=10,
            pady=6
        )


        lbl_icon = tk.Label(self.alert_banner, text="🚨", bg="#fef2f2", font=("Segoe UI Emoji", 12))
        lbl_icon.pack(side=tk.LEFT, padx=(4, 6))


        self.lbl_alert_msg = tk.Label(
            self.alert_banner,
            text="",
            bg="#fef2f2",
            fg="#b91c1c",
            font=self.bold_font,
            justify=tk.LEFT,
            wraplength=880
        )
        self.lbl_alert_msg.pack(side=tk.LEFT, fill=tk.X, expand=True)


        btn_close = tk.Button(
            self.alert_banner,
            text="✕",
            bg="#fef2f2",
            fg="#7f1d1d",
            font=("Microsoft YaHei UI", 10, "bold"),
            relief=tk.FLAT,
            bd=0,
            cursor="hand2",
            command=self._hide_alert_banner
        )
        btn_close.pack(side=tk.RIGHT, padx=4)


        self.btn_sentinel_launch = tk.Button(
            self.alert_banner,
            text="🛠️ 開啟哨兵搶救",
            bg="#dc2626",
            fg="#ffffff",
            font=self.bold_font,
            relief=tk.RAISED,
            padx=8,
            pady=2,
            command=self.launch_sentinel_gui
        )


    def _show_alert_banner(self, message: str, show_sentinel: bool = False):
        def _do():
            if self.alert_banner is None or self.lbl_alert_msg is None:
                return
            try:
                if not self.alert_banner.winfo_exists():
                    return
            except Exception:
                return


            self.lbl_alert_msg.config(text=message)
            if show_sentinel and self.btn_sentinel_launch is not None:
                self.btn_sentinel_launch.pack(side=tk.RIGHT, padx=6)
            elif self.btn_sentinel_launch is not None:
                self.btn_sentinel_launch.pack_forget()


            if self.top_frame is not None:
                try:
                    if self.top_frame.winfo_exists() and self.top_frame.winfo_manager():
                        self.alert_banner.pack(fill=tk.X, padx=10, pady=(0, 5), after=self.top_frame)
                        return
                except Exception:
                    pass
            self.alert_banner.pack(fill=tk.X, padx=10, pady=(0, 5))


        try:
            self.root.after(0, _do)
        except Exception:
            pass


    def _hide_alert_banner(self):
        def _do():
            if self.alert_banner is None:
                return
            try:
                if self.alert_banner.winfo_exists():
                    self.alert_banner.pack_forget()
            except Exception:
                pass


        try:
            self.root.after(0, _do)
        except Exception:
            pass


    def launch_sentinel_gui(self):
        sentinel_path = self._norm_path_or_empty(self.config.get("sentinel_script_path", ""))
        if sentinel_path and os.path.exists(sentinel_path):
            try:
                subprocess.Popen([sys.executable, sentinel_path])
                Toast.show(self.root, "🛠️ 已啟動正則衝突哨兵 GUI！", bg="#2563eb", fg="#ffffff")
            except Exception as e:
                Toast.show(self.root, f"❌ 無法啟動哨兵: {str(e)}", bg="#ef4444", fg="#ffffff")
        else:
            Toast.show(self.root, "⚠️ 找不到衝突哨兵腳本，請至設定頁確認路徑。", bg="#f59e0b", fg="#000000")


    # -----------------------------------------------------------------------
    # 模組 2：Notebook 主頁籤控制器
    # -----------------------------------------------------------------------
    def build_notebook(self):
        self.notebook = ttk.Notebook(self.root)
        self.notebook.pack(fill=tk.BOTH, expand=True, padx=10, pady=5)


        self.tab1 = ttk.Frame(self.notebook)
        self.notebook.add(self.tab1, text="📝 雙階雷達正則優化與一鍵覆蓋")
        self.build_tab1(self.tab1)


        self.tab2 = ttk.Frame(self.notebook)
        self.notebook.add(self.tab2, text="⚙️ 多帳號矩陣、調度重試與路徑設定")
        self.build_tab2(self.tab2)


        # 頁籤切換時主動綁定/解除全域滾輪事件
        self.notebook.bind("<<NotebookTabChanged>>", self._on_tab_changed)


    def _on_tab_changed(self, event=None):
        sel = self.notebook.select()
        idx = self.notebook.index(sel) if sel else -1
        if idx == 1:
            self._bind_global_mousewheel()
        else:
            self._unbind_global_mousewheel()


    # -----------------------------------------------------------------------
    # 模組 3：頁籤 1 (Stage 3 作業區)
    # -----------------------------------------------------------------------
    def build_tab1(self, parent):
        paned = ttk.PanedWindow(parent, orient=tk.VERTICAL)
        paned.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)


        top_box = ttk.Frame(paned)
        paned.add(top_box, weight=2)


        frame_dict_select = ttk.LabelFrame(
            top_box,
            text="1. 選擇搭配送給 AI 對照之原始字典檔 (任務開始時快照鎖定，支援局部微創切片對照)",
            padding=6
        )
        frame_dict_select.pack(fill=tk.X, pady=(0, 5))


        def on_dict_radio_change():
            self.set_save_btn_alert(False)


        ttk.Radiobutton(
            frame_dict_select,
            text="帶入【字典檔 1】對照",
            variable=self.selected_dict_for_ai,
            value="dict1",
            command=on_dict_radio_change
        ).pack(side=tk.LEFT, padx=15)


        ttk.Radiobutton(
            frame_dict_select,
            text="帶入【字典檔 2】對照",
            variable=self.selected_dict_for_ai,
            value="dict2",
            command=on_dict_radio_change
        ).pack(side=tk.LEFT, padx=15)


        ttk.Radiobutton(
            frame_dict_select,
            text="不附帶字典檔 (僅發送日誌)",
            variable=self.selected_dict_for_ai,
            value="none",
            command=on_dict_radio_change
        ).pack(side=tk.LEFT, padx=15)


        dnd_tip = "（可直接拖曳 .txt 日誌檔至下方文字框）" if HAS_DND else ""
        lbl_log = ttk.Label(
            top_box,
            text=f"2. 請貼上或拖曳「全局詳細正則搜尋結果」日誌或上下文錯字句子：{dnd_tip}",
            font=self.bold_font
        )
        lbl_log.pack(anchor=tk.W, pady=(2, 2))


        self.txt_log = scrolledtext.ScrolledText(top_box, height=7, font=self.code_font)
        self.txt_log.pack(fill=tk.BOTH, expand=True)


        if HAS_DND:
            self.txt_log.drop_target_register(DND_FILES)
            self.txt_log.dnd_bind('<<Drop>>', self.on_log_file_drop)


        btn_frame = ttk.Frame(top_box)
        btn_frame.pack(fill=tk.X, pady=5)


        self.btn_auto = tk.Button(
            btn_frame,
            text="🤖 一鍵雙階自動優化 (雷達ENG ➔ 雷達QA)",
            bg="#2563eb",
            fg="#ffffff",
            font=self.bold_font,
            relief=tk.RAISED,
            padx=10, pady=4,
            command=self.run_auto_pipeline
        )
        self.btn_auto.pack(side=tk.LEFT, padx=(5, 3))


        self.btn_clear = tk.Button(
            btn_frame,
            text="🗑️ 清空日誌",
            bg="#475569",
            fg="#ffffff",
            font=self.bold_font,
            relief=tk.RAISED,
            padx=8, pady=4,
            command=self.handle_clear_log_action
        )
        self.btn_clear.pack(side=tk.LEFT, padx=(3, 4))


        self.chk_clear_and_paste = ttk.Checkbutton(
            btn_frame,
            text="📋 清空即貼上",
            variable=self.var_clear_and_paste,
            command=self.on_clear_and_paste_toggled
        )
        self.chk_clear_and_paste.pack(side=tk.LEFT, padx=(2, 6))


        ttk.Separator(btn_frame, orient=tk.VERTICAL).pack(side=tk.LEFT, fill=tk.Y, padx=4, pady=2)


        self.btn_s1 = ttk.Button(btn_frame, text="1️⃣ 僅執行階段一 (雷達ENG提案)", command=self.run_stage1_thread)
        self.btn_s1.pack(side=tk.LEFT, padx=2)


        self.btn_s2 = ttk.Button(btn_frame, text="2️⃣ 僅執行階段二 (雷達QA審核)", command=lambda: self.run_stage2_thread())
        self.btn_s2.pack(side=tk.LEFT, padx=2)


        self.chk_click_to_copy = ttk.Checkbutton(
            btn_frame,
            text="📋 點擊預覽框即複製 (調試)",
            variable=self.var_click_to_copy,
            command=self.on_click_to_copy_toggled
        )
        self.chk_click_to_copy.pack(side=tk.RIGHT, padx=10)


        bottom_box = ttk.Frame(paned)
        paned.add(bottom_box, weight=3)


        preview_paned = ttk.PanedWindow(bottom_box, orient=tk.HORIZONTAL)
        preview_paned.pack(fill=tk.BOTH, expand=True)


        self.frame_s1 = ttk.LabelFrame(preview_paned, text="階段一：雷達工程師提案預覽 (Stage 1)")
        preview_paned.add(self.frame_s1, weight=1)


        self.txt_stage1 = scrolledtext.ScrolledText(self.frame_s1, font=self.code_font, wrap=tk.WORD)
        self.txt_stage1.pack(fill=tk.BOTH, expand=True, padx=2, pady=2)
        self.txt_stage1.bind("<ButtonRelease-1>", lambda event: self.on_preview_box_click(event, self.txt_stage1, "階段一工程師提案", "s1"))


        self.frame_s2 = ttk.LabelFrame(preview_paned, text="階段二：雷達 QA 審核與最終字典條目 (Stage 2 - 直通寫入來源)")
        preview_paned.add(self.frame_s2, weight=1)


        self.txt_stage2 = scrolledtext.ScrolledText(self.frame_s2, font=self.code_font, wrap=tk.WORD)
        self.txt_stage2.pack(fill=tk.BOTH, expand=True, padx=2, pady=2)
        self.txt_stage2.bind("<ButtonRelease-1>", lambda event: self.on_preview_box_click(event, self.txt_stage2, "階段二 QA 審核字典", "s2"))


        # 底欄雙層結構：上排按鈕列 + 下排全寬動態折行狀態列 (UX-bottom-01)
        self.action_bar = ttk.Frame(bottom_box)
        self.action_bar.pack(fill=tk.X, pady=5)


        self.action_btn_row = ttk.Frame(self.action_bar)
        self.action_btn_row.pack(fill=tk.X)


        self.btn_save = tk.Button(
            self.action_btn_row,
            text="💾 備份並更新至目標字典檔",
            bg=self.COLOR_SAVE_NORMAL,
            fg="#ffffff",
            font=self.bold_font,
            relief=tk.RAISED,
            padx=14, pady=5,
            command=self.save_and_backup_dict
        )


        self.btn_copy = ttk.Button(self.action_btn_row, text="📋 複製 QA 最終字典內容", command=self.copy_qa_result)


        self.action_status_row = ttk.Frame(self.action_bar)
        self.action_status_row.pack(fill=tk.X, pady=(4, 0))


        self.lbl_status = tk.Label(
            self.action_status_row,
            text="💡 就緒",
            font=("Microsoft YaHei UI", 10, "bold"),
            fg="#4b5563",
            anchor="w",
            justify=tk.LEFT,
            wraplength=1100
        )
        self.lbl_status.pack(fill=tk.X, expand=True)
        self.action_status_row.bind(
            "<Configure>",
            lambda e: self.lbl_status.config(wraplength=max(320, e.width - 24))
        )


        self.repack_bottom_bar()


    def repack_bottom_bar(self):
        for widget in [self.btn_save, self.btn_copy]:
            if widget is not None:
                widget.pack_forget()


        is_swapped = self.var_swap_bottom_bar.get()
        if not is_swapped:
            self.btn_save.pack(side=tk.RIGHT, padx=5)
            self.btn_copy.pack(side=tk.RIGHT, padx=5)
        else:
            self.btn_save.pack(side=tk.LEFT, padx=5)
            self.btn_copy.pack(side=tk.LEFT, padx=5)


    def handle_clear_log_action(self):
        self.txt_log.delete("1.0", tk.END)
        self.set_save_btn_alert(False)


        if self.var_clear_and_paste.get():
            try:
                raw_text = self.root.clipboard_get()
                clipboard_text = self.sanitize_invisible_chars(raw_text)
                if clipboard_text and clipboard_text.strip():
                    self.txt_log.insert("1.0", clipboard_text)
                    Toast.show(self.root, "📋 已清空並自動貼上剪貼簿內容！", duration=1200, bg="#2563eb", fg="#ffffff")
                else:
                    Toast.show(self.root, "🗑️ 已清空日誌 (剪貼簿無文字內容)", duration=1200)
            except Exception:
                Toast.show(self.root, "🗑️ 已清空日誌 (讀取剪貼簿失敗或無內容)", duration=1200)
        else:
            Toast.show(self.root, "🗑️ 已清空日誌內容", duration=1000)


    def on_clear_and_paste_toggled(self):
        self.config["enable_clear_and_paste"] = self.var_clear_and_paste.get()
        self.save_config()


    def on_click_to_copy_toggled(self):
        self.config["enable_click_to_copy"] = self.var_click_to_copy.get()
        self.save_config()


    def on_preview_box_click(self, event, widget: scrolledtext.ScrolledText, box_title: str, stage_key: str):
        try:
            if not self.var_click_to_copy.get():
                return
            content = widget.get("1.0", tk.END).strip()
            if not content or content.startswith("❌ 執行失敗"):
                return


            meta = {}
            active_targets = []
            if self.last_task_snapshot:
                meta_key = "s1_meta" if stage_key == "s1" else "s2_meta"
                meta = self.last_task_snapshot.get(meta_key, {})
                active_targets = self.last_task_snapshot.get("active_targets", [])


            actual_account = meta.get("actual_account", "未知帳號")
            actual_model = meta.get("actual_model", "未知模型")
            elapsed_time = meta.get("elapsed_time", "0.0")
            is_fallback = meta.get("is_fallback", False)
            fallback_str = "⚠️ 是 (觸發模型備援降階)" if is_fallback else "否 (主要模型直出)"
            active_targets_str = "、".join(active_targets) if active_targets else "無 / 全量"


            debug_header = (
                "================================================================================\n"
                "【調試排查資訊】\n"
                f"角色階段：{box_title}\n"
                f"執行帳號：{actual_account}\n"
                f"執行模型：{actual_model}\n"
                f"通訊耗時：{elapsed_time}s\n"
                f"備援降級：{fallback_str}\n"
                f"優化標的：{active_targets_str}\n"
                "================================================================================\n\n"
            )


            full_payload = debug_header + content
            self.root.clipboard_clear()
            self.root.clipboard_append(full_payload)
            Toast.show(self.root, f"📋 已自動複製【{box_title}】調試內容 (含 Meta 標頭)！", duration=1200, bg="#2563eb", fg="#ffffff")
        except Exception:
            pass


    def on_log_file_drop(self, event):
        try:
            files = self.root.tk.splitlist(event.data)
            if files:
                file_path = files[0].strip('{}')
                if os.path.isfile(file_path):
                    raw_content = self.read_file_text_multiformat(file_path)
                    content = self.sanitize_invisible_chars(raw_content)
                    self.txt_log.delete("1.0", tk.END)
                    self.txt_log.insert("1.0", content)
                    self.set_save_btn_alert(False)
                    Toast.show(self.root, f"✅ 已成功載入日誌檔：{os.path.basename(file_path)}")
                else:
                    Toast.show(self.root, "⚠️ 拖曳目標非有效文字檔案", bg="#f59e0b", fg="#000000")
        except Exception as e:
            Toast.show(self.root, f"❌ 讀取拖曳檔案失敗: {str(e)}", bg="#ef4444", fg="#ffffff")


    # -----------------------------------------------------------------------
    # 模組 4：頁籤 2 (多帳號矩陣、路徑、偏好、調試歷史看板與滾輪穿透)
    # -----------------------------------------------------------------------
    def build_tab2(self, parent):
        outer_container = ttk.Frame(parent, padding=8)
        outer_container.pack(fill=tk.BOTH, expand=True)


        self.tab2_canvas = tk.Canvas(outer_container, highlightthickness=0)
        scrollbar = ttk.Scrollbar(outer_container, orient="vertical", command=self.tab2_canvas.yview)
        self.tab2_scrollable_frame = ttk.Frame(self.tab2_canvas)


        self.tab2_scrollable_frame.bind(
            "<Configure>",
            lambda e: self.tab2_canvas.configure(scrollregion=self.tab2_canvas.bbox("all"))
        )


        # 🌟 內外寬度等齊契約
        self.canvas_window = self.tab2_canvas.create_window((0, 0), window=self.tab2_scrollable_frame, anchor="nw")
        self.tab2_canvas.bind("<Configure>", lambda event: self.tab2_canvas.itemconfig(self.canvas_window, width=event.width))


        self.tab2_canvas.configure(xscrollcommand=None, yscrollcommand=scrollbar.set)
        self.tab2_canvas.pack(side="left", fill="both", expand=True)
        scrollbar.pack(side="right", fill="y")


        # 🌟 滑鼠滾輪全域穿透：掛載邊界監聽
        outer_container.bind("<Enter>", lambda e: self._bind_global_mousewheel())
        outer_container.bind("<Leave>", lambda e: self._unbind_global_mousewheel())


        # 區塊 1: 3 組 API Key
        frame_accounts = ttk.LabelFrame(self.tab2_scrollable_frame, text="🔑 Gemini API 多組金鑰與帳號矩陣管理 (支援 3 組帳號輪動備援)", padding=10)
        frame_accounts.pack(fill=tk.X, padx=5, pady=4)


        ttk.Label(frame_accounts, text="序號 / 帳號暱稱", font=self.bold_font).grid(row=0, column=0, sticky=tk.W, padx=4, pady=2)
        ttk.Label(frame_accounts, text="Gemini API Key (金鑰遮罩)", font=self.bold_font).grid(row=0, column=1, sticky=tk.W, padx=4, pady=2)
        ttk.Label(frame_accounts, text="備註說明", font=self.bold_font).grid(row=0, column=2, sticky=tk.W, padx=4, pady=2)


        self.profile_entries = []
        profiles = self.config.get("api_profiles", self.DEFAULT_PROFILES)
        for i in range(3):
            p = profiles[i] if i < len(profiles) else {"name": f"帳號 {i+1}", "key": "", "note": ""}


            e_name = ttk.Entry(frame_accounts, width=18)
            e_name.insert(0, p.get("name", f"帳號 {i+1}"))
            e_name.grid(row=i+1, column=0, padx=4, pady=3, sticky=tk.W)


            e_key = ttk.Entry(frame_accounts, width=44, show="*")
            e_key.insert(0, p.get("key", ""))
            e_key.grid(row=i+1, column=1, padx=4, pady=3, sticky=tk.EW)


            e_note = ttk.Entry(frame_accounts, width=28)
            e_note.insert(0, p.get("note", ""))
            e_note.grid(row=i+1, column=2, padx=4, pady=3, sticky=tk.EW)


            self.profile_entries.append((e_name, e_key, e_note))


        frame_accounts.columnconfigure(1, weight=1)


        # 區塊 2: 檔案路徑設定
        frame_paths = ttk.LabelFrame(self.tab2_scrollable_frame, text="📂 字典、AI 提示詞與衝突哨兵路徑設定 (支援一鍵開啟檢驗)", padding=10)
        frame_paths.pack(fill=tk.X, padx=5, pady=4)


        # 1. 字典檔 1
        ttk.Label(frame_paths, text="1. 《正則查找字典.txt (字典檔 1)》路徑:", font=self.bold_font).grid(row=0, column=0, columnspan=3, sticky=tk.W, pady=2)
        self.entry_dict_1 = ttk.Entry(frame_paths)
        self.entry_dict_1.insert(0, self.config.get("dict_path_1", ""))
        self.entry_dict_1.grid(row=1, column=0, sticky=tk.EW, padx=(4, 2), pady=2)
        ttk.Button(frame_paths, text="瀏覽...", width=8, command=lambda: self.browse_file(self.entry_dict_1)).grid(row=1, column=1, padx=2)
        ttk.Button(frame_paths, text="📂 開啟", width=8, command=lambda: self.open_file_path(self.entry_dict_1, "字典檔 1")).grid(row=1, column=2, padx=2)


        # 2. 字典檔 2
        ttk.Label(frame_paths, text="2. 《正則查找字典2.txt (字典檔 2)》路徑:", font=self.bold_font).grid(row=2, column=0, columnspan=3, sticky=tk.W, pady=(6, 2))
        self.entry_dict_2 = ttk.Entry(frame_paths)
        self.entry_dict_2.insert(0, self.config.get("dict_path_2", ""))
        self.entry_dict_2.grid(row=3, column=0, sticky=tk.EW, padx=(4, 2), pady=2)
        ttk.Button(frame_paths, text="瀏覽...", width=8, command=lambda: self.browse_file(self.entry_dict_2)).grid(row=3, column=1, padx=2)
        ttk.Button(frame_paths, text="📂 開啟", width=8, command=lambda: self.open_file_path(self.entry_dict_2, "字典檔 2")).grid(row=3, column=2, padx=2)


        # 3. ENG 提示詞
        ttk.Label(frame_paths, text="3. 《階段三雷達工程師提示詞.txt》路徑:", font=self.bold_font).grid(row=4, column=0, columnspan=3, sticky=tk.W, pady=(6, 2))
        self.entry_eng_prompt = ttk.Entry(frame_paths)
        self.entry_eng_prompt.insert(0, self.config.get("radar_engineer_prompt_path", ""))
        self.entry_eng_prompt.grid(row=5, column=0, sticky=tk.EW, padx=(4, 2), pady=2)
        ttk.Button(frame_paths, text="瀏覽...", width=8, command=lambda: self.browse_file(self.entry_eng_prompt)).grid(row=5, column=1, padx=2)
        ttk.Button(frame_paths, text="📂 開啟", width=8, command=lambda: self.open_file_path(self.entry_eng_prompt, "雷達工程師提示詞")).grid(row=5, column=2, padx=2)


        # 4. QA 提示詞
        ttk.Label(frame_paths, text="4. 《階段三雷達QA提示詞.txt》路徑:", font=self.bold_font).grid(row=6, column=0, columnspan=3, sticky=tk.W, pady=(6, 2))
        self.entry_qa_prompt = ttk.Entry(frame_paths)
        self.entry_qa_prompt.insert(0, self.config.get("radar_qa_prompt_path", ""))
        self.entry_qa_prompt.grid(row=7, column=0, sticky=tk.EW, padx=(4, 2), pady=2)
        ttk.Button(frame_paths, text="瀏覽...", width=8, command=lambda: self.browse_file(self.entry_qa_prompt)).grid(row=7, column=1, padx=2)
        ttk.Button(frame_paths, text="📂 開啟", width=8, command=lambda: self.open_file_path(self.entry_qa_prompt, "雷達 QA 提示詞")).grid(row=7, column=2, padx=2)


        # 5. 衝突哨兵
        ttk.Label(frame_paths, text="5. 《正則衝突檢測守衛.py (語意對沖哨兵)》路徑:", font=self.bold_font).grid(row=8, column=0, columnspan=3, sticky=tk.W, pady=(6, 2))
        self.entry_sentinel_path = ttk.Entry(frame_paths)
        self.entry_sentinel_path.insert(0, self.config.get("sentinel_script_path", ""))
        self.entry_sentinel_path.grid(row=9, column=0, sticky=tk.EW, padx=(4, 2), pady=2)
        ttk.Button(frame_paths, text="瀏覽...", width=8, command=lambda: self.browse_file(self.entry_sentinel_path, [("Python files", "*.py"), ("All files", "*.*")])).grid(row=9, column=1, padx=2)
        ttk.Button(frame_paths, text="📂 開啟", width=8, command=lambda: self.open_file_path(self.entry_sentinel_path, "語意對沖哨兵腳本")).grid(row=9, column=2, padx=2)


        frame_paths.columnconfigure(0, weight=1)


        # 區塊 3: 多帳號調度與重試策略
        frame_dispatch = ttk.LabelFrame(self.tab2_scrollable_frame, text="🔄 多帳號負載均衡調度與退避重試策略 (含即時導覽看板)", padding=10)
        frame_dispatch.pack(fill=tk.X, padx=5, pady=6)


        d1_box = ttk.Frame(frame_dispatch)
        d1_box.pack(fill=tk.X, pady=3)


        ttk.Label(d1_box, text="起手分流策略 (Initial Dispatch):", font=self.bold_font).pack(side=tk.LEFT, padx=(0, 6))
        self.combo_dispatch_mode = ttk.Combobox(
            d1_box,
            values=[
                "random (🎲 隨機均攤：隨機挑選有效帳號發起任務)",
                "round_robin (🔄 依序輪動：平攤帳號配額，逐次遞增)",
                "locked (🔒 固定鎖定：始終以指定之優先帳號起手)"
            ],
            width=48,
            state="readonly"
        )
        mode_val = self.config.get("account_dispatch_mode", "random")
        if mode_val == "round_robin":
            self.combo_dispatch_mode.current(1)
        elif mode_val == "locked":
            self.combo_dispatch_mode.current(2)
        else:
            self.combo_dispatch_mode.current(0)
        self.combo_dispatch_mode.pack(side=tk.LEFT)
        self.combo_dispatch_mode.bind("<<ComboboxSelected>>", self.on_dispatch_mode_changed)


        self.card_dispatch = tk.Frame(frame_dispatch, bg="#f8fafc", highlightbackground="#cbd5e1", highlightthickness=1, padx=8, pady=6)
        self.card_dispatch.pack(fill=tk.X, pady=(4, 8))
        self.lbl_card_dispatch = tk.Label(self.card_dispatch, text="", bg="#f8fafc", fg="#334155", justify=tk.LEFT, font=self.default_font)
        self.lbl_card_dispatch.pack(anchor=tk.W)


        d2_box = ttk.Frame(frame_dispatch)
        d2_box.pack(fill=tk.X, pady=3)


        ttk.Label(d2_box, text="遇阻重試路線 (Retry Route Policy):", font=self.bold_font).pack(side=tk.LEFT, padx=(0, 6))
        self.combo_retry_policy = ttk.Combobox(
            d2_box,
            values=[
                "horizontal_first (⚡ 橫向擴展優先：A主➔B主➔C主➔降階備援 【推薦】)",
                "quality_locked (🚀 品質優先不降：全帳號持續重試主模型，嚴禁降階)",
                "vertical_first (🛡️ 帳號穿透優先：A主➔A副 ➔ B主➔B副...)"
            ],
            width=54,
            state="readonly"
        )
        policy_val = self.config.get("retry_route_policy", "horizontal_first")
        if policy_val == "quality_locked":
            self.combo_retry_policy.current(1)
        elif policy_val == "vertical_first":
            self.combo_retry_policy.current(2)
        else:
            self.combo_retry_policy.current(0)
        self.combo_retry_policy.pack(side=tk.LEFT)
        self.combo_retry_policy.bind("<<ComboboxSelected>>", self.on_retry_policy_changed)


        self.card_retry = tk.Frame(frame_dispatch, bg="#f8fafc", highlightbackground="#cbd5e1", highlightthickness=1, padx=8, pady=6)
        self.card_retry.pack(fill=tk.X, pady=(4, 8))
        self.lbl_card_retry = tk.Label(self.card_retry, text="", bg="#f8fafc", fg="#334155", justify=tk.LEFT, font=self.default_font)
        self.lbl_card_retry.pack(anchor=tk.W)


        self.update_dispatch_card_text()
        self.update_retry_card_text()


        p_box = ttk.Frame(frame_dispatch)
        p_box.pack(fill=tk.X, pady=4)


        ttk.Label(p_box, text="單一重試輪次上限:").pack(side=tk.LEFT, padx=(0, 4))
        self.entry_max_retries = ttk.Spinbox(p_box, from_=1, to=10, width=5)
        self.entry_max_retries.set(str(self.config.get("max_retries", 3)))
        self.entry_max_retries.pack(side=tk.LEFT, padx=(0, 15))


        ttk.Label(p_box, text="基礎退避延遲 (秒):").pack(side=tk.LEFT, padx=(0, 4))
        self.entry_base_delay = ttk.Spinbox(p_box, from_=0.1, to=30.0, increment=0.5, width=5)
        self.entry_base_delay.set(str(self.config.get("base_delay_seconds", 2.0)))
        self.entry_base_delay.pack(side=tk.LEFT, padx=(0, 15))


        ttk.Label(p_box, text="單次請求逾時(秒):").pack(side=tk.LEFT, padx=(0, 4))
        self.entry_request_timeout = ttk.Spinbox(p_box, from_=10.0, to=600.0, increment=10.0, width=6)
        self.entry_request_timeout.set(str(self.config.get("request_timeout_seconds", 300.0)))
        self.entry_request_timeout.pack(side=tk.LEFT)


        fb_opt_box = ttk.Frame(frame_dispatch)
        fb_opt_box.pack(fill=tk.X, pady=(2, 4))


        self.chk_enable_fallback = ttk.Checkbutton(
            fb_opt_box,
            text="啟用模型階梯備援 (主要模型過載耗盡時切換備用模型)",
            variable=self.var_enable_fallback
        )
        self.chk_enable_fallback.pack(side=tk.LEFT)


        fb_box = ttk.Frame(frame_dispatch)
        fb_box.pack(fill=tk.X, pady=4)


        ttk.Label(fb_box, text="第一備援模型:").pack(side=tk.LEFT, padx=(0, 5))
        self.combo_fallback_1 = ttk.Combobox(fb_box, values=self.PRESET_MODELS, width=22)
        self.combo_fallback_1.set(self.config.get("fallback_model_1", "gemini-3.6-flash"))
        self.combo_fallback_1.pack(side=tk.LEFT, padx=(0, 20))


        ttk.Label(fb_box, text="第二備援模型:").pack(side=tk.LEFT, padx=(0, 5))
        self.combo_fallback_2 = ttk.Combobox(fb_box, values=self.PRESET_MODELS, width=22)
        self.combo_fallback_2.set(self.config.get("fallback_model_2", "gemini-3.5-flash-lite"))
        self.combo_fallback_2.pack(side=tk.LEFT)


        # 區塊 4: 偏好設定
        frame_pref = ttk.LabelFrame(self.tab2_scrollable_frame, text="⚙️ 使用者操作偏好與哨兵門禁設定", padding=10)
        frame_pref.pack(fill=tk.X, padx=5, pady=6)


        self.chk_enable_sentinel = ttk.Checkbutton(
            frame_pref,
            text="🛡️ 啟用存檔前「衝突哨兵記憶體預檢門禁」(偵測到致命對沖時阻斷覆寫，磁碟 0 污染)",
            variable=self.var_enable_sentinel
        )
        self.chk_enable_sentinel.pack(anchor=tk.W, pady=2)


        self.chk_swap_bar = ttk.Checkbutton(
            frame_pref,
            text="🔀 底部動作列佈局左右對調 (將【備份並更新至目標字典檔】等按鈕置於左側，狀態列居下全寬顯示)",
            variable=self.var_swap_bottom_bar,
            command=self.on_swap_bottom_bar_toggled
        )
        self.chk_swap_bar.pack(anchor=tk.W, pady=2)


        self.chk_default_paste = ttk.Checkbutton(
            frame_pref,
            text="📋 預設啟用「清空即貼上剪貼簿」功能 (點擊清空日誌按鈕時，自動將剪貼簿文字貼入日誌框)",
            variable=self.var_clear_and_paste,
            command=self.on_clear_and_paste_toggled
        )
        self.chk_default_paste.pack(anchor=tk.W, pady=2)


        self.chk_default_copy = ttk.Checkbutton(
            frame_pref,
            text="📋 預設啟用「點擊預覽框即複製」調試模式 (單擊預覽框瞬間複製全量文字，頂部自動注入排查 Meta 標頭)",
            variable=self.var_click_to_copy,
            command=self.on_click_to_copy_toggled
        )
        self.chk_default_copy.pack(anchor=tk.W, pady=2)


        # 區塊 5: 調試滾動歷史紀錄看板 (獨立滾輪隔離 + 東亞字寬對齊)
        frame_history = ttk.LabelFrame(self.tab2_scrollable_frame, text="📊 最近優化與調度歷史紀錄 (最新 20 筆滾動監控)", padding=10)
        frame_history.pack(fill=tk.X, padx=5, pady=6)


        self.txt_history = scrolledtext.ScrolledText(frame_history, height=8, font=self.code_font)
        self.txt_history.pack(fill=tk.BOTH, expand=True)
        header_row = (
            f"{self._pad_display_width('時間戳記', 25)} | "
            f"{self._pad_display_width('標的字詞', 12)} | "
            f"{self._pad_display_width('作用帳號', 14)} | "
            f"{self._pad_display_width('調用模型', 22)} | "
            f"{self._pad_display_width('耗時', 7)} | "
            f"{self._pad_display_width('狀態', 10)} | "
            f"哨兵檢核\n"
        )
        self.txt_history.insert(tk.END, header_row)
        self.txt_history.insert(tk.END, "-" * 116 + "\n")


        self.txt_history.bind("<MouseWheel>", self._on_history_wheel)
        self.txt_history.bind("<Button-4>", self._on_history_wheel)
        self.txt_history.bind("<Button-5>", self._on_history_wheel)


        # 儲存全域設定按鈕
        btn_save_all = tk.Button(
            self.tab2_scrollable_frame,
            text="💾 儲存所有帳號、路徑與調度設定",
            bg="#2563eb",
            fg="#ffffff",
            font=self.bold_font,
            padx=16, pady=6,
            relief=tk.RAISED,
            command=self.save_all_settings
        )
        btn_save_all.pack(anchor=tk.W, padx=5, pady=12)


    # -----------------------------------------------------------------------
    # 滑鼠滾輪全域穿透機制與歷史看板獨立滾動隔離
    # -----------------------------------------------------------------------
    def _on_history_wheel(self, event):
        """歷史看板獨立滾輪處理：手動驅動內部捲動並截斷冒泡至外層畫布"""
        if self.txt_history is None:
            return "break"
        if getattr(event, "num", None) == 4:
            self.txt_history.yview_scroll(-2, "units")
        elif getattr(event, "num", None) == 5:
            self.txt_history.yview_scroll(2, "units")
        elif getattr(event, "delta", 0) != 0:
            step = int(-1 * (event.delta / 120))
            if step == 0:
                step = -1 if event.delta > 0 else 1
            self.txt_history.yview_scroll(step, "units")
        return "break"


    def _bind_global_mousewheel(self):
        self.root.bind_all("<MouseWheel>", self._on_global_mousewheel)
        self.root.bind_all("<Button-4>", self._on_global_mousewheel_up)
        self.root.bind_all("<Button-5>", self._on_global_mousewheel_down)


    def _unbind_global_mousewheel(self):
        self.root.unbind_all("<MouseWheel>")
        self.root.unbind_all("<Button-4>")
        self.root.unbind_all("<Button-5>")


    def _on_global_mousewheel(self, event):
        if event.widget is self.txt_history:
            return
        if self.tab2_canvas is not None:
            if getattr(event, "delta", 0) != 0:
                step = int(-1 * (event.delta / 120))
                if step == 0:
                    step = -1 if event.delta > 0 else 1
                self.tab2_canvas.yview_scroll(step, "units")


    def _on_global_mousewheel_up(self, event):
        if event.widget is self.txt_history:
            return
        if self.tab2_canvas is not None:
            self.tab2_canvas.yview_scroll(-2, "units")


    def _on_global_mousewheel_down(self, event):
        if event.widget is self.txt_history:
            return
        if self.tab2_canvas is not None:
            self.tab2_canvas.yview_scroll(2, "units")


    # -----------------------------------------------------------------------
    # 檔案開啟檢驗與瀏覽器
    # -----------------------------------------------------------------------
    def open_file_path(self, entry_widget: ttk.Entry, role_name: str):
        """調用系統關聯程式開啟實體檔案進行內容檢驗"""
        target_path = entry_widget.get().strip()
        if not target_path:
            Toast.show(self.root, f"⚠️ 未設定【{role_name}】路徑！", duration=2000, bg="#f59e0b", fg="#000000")
            return


        norm_path = self._norm_path_or_empty(target_path)
        if not norm_path or not os.path.exists(norm_path):
            Toast.show(self.root, f"❌ 檔案不存在：{norm_path}", duration=3000, bg="#ef4444", fg="#ffffff")
            self.update_status(f"❌ 找不到實體檔案：{norm_path}", fg_color="#dc2626")
            return


        try:
            if hasattr(os, "startfile"):
                os.startfile(norm_path)
            elif sys.platform == "darwin":
                subprocess.Popen(["open", norm_path])
            else:
                subprocess.Popen(["xdg-open", norm_path])
            Toast.show(self.root, f"📂 已開啟【{role_name}】進行檢驗！", duration=2000, bg="#2563eb", fg="#ffffff")
        except Exception as e:
            Toast.show(self.root, f"❌ 開啟失敗: {str(e)}", duration=3000, bg="#ef4444", fg="#ffffff")


    def browse_file(self, entry_widget, filetypes=None):
        if filetypes is None:
            filetypes = [("Text files", "*.txt"), ("All files", "*.*")]
        filename = filedialog.askopenfilename(filetypes=filetypes)
        if filename:
            normalized_path = self._norm_path_or_empty(filename)
            entry_widget.delete(0, tk.END)
            entry_widget.insert(0, normalized_path)


    def append_history_log(self, record: dict):
        self.history_logs.append(record)
        if len(self.history_logs) > 20:
            self.history_logs.pop(0)


        def _do():
            if self.txt_history is not None:
                try:
                    if not self.txt_history.winfo_exists():
                        return
                except Exception:
                    return
                default_ts = datetime.now().astimezone().strftime("%Y-%m-%d %H:%M:%S %z")
                t_str = self._pad_display_width(str(record.get("time") or default_ts), 25)
                targets = self._pad_display_width(record.get("targets", "無/全量"), 12)
                acc = self._pad_display_width(record.get("account", "未知"), 14)
                model = self._pad_display_width(record.get("model", "未知"), 22)
                elapsed = self._pad_display_width(record.get("elapsed", "0s"), 7)
                status = self._pad_display_width(record.get("status", "完成"), 10)
                sentinel = record.get("sentinel", "未檢驗")


                row = f"{t_str} | {targets} | {acc} | {model} | {elapsed} | {status} | {sentinel}\n"
                self.txt_history.insert(tk.END, row)
                self.txt_history.see(tk.END)


        try:
            self.root.after(0, _do)
        except Exception:
            pass


    def on_dispatch_mode_changed(self, event=None):
        self.update_dispatch_card_text()


    def update_dispatch_card_text(self):
        idx = self.combo_dispatch_mode.current()
        modes = ["random", "round_robin", "locked"]
        selected_mode = modes[idx] if 0 <= idx < len(modes) else "random"
        text = self.DISPATCH_DESCRIPTIONS.get(selected_mode, "")
        self.lbl_card_dispatch.config(text=text)


    def on_retry_policy_changed(self, event=None):
        self.update_retry_card_text()


    def update_retry_card_text(self):
        idx = self.combo_retry_policy.current()
        policies = ["horizontal_first", "quality_locked", "vertical_first"]
        selected_policy = policies[idx] if 0 <= idx < len(policies) else "horizontal_first"
        text = self.RETRY_ROUTE_DESCRIPTIONS.get(selected_policy, "")
        self.lbl_card_retry.config(text=text)


    def on_swap_bottom_bar_toggled(self):
        self.config["swap_bottom_bar"] = self.var_swap_bottom_bar.get()
        self.save_config()
        self.repack_bottom_bar()


    def save_all_settings(self):
        new_profiles = []
        for i, (e_name, e_key, e_note) in enumerate(self.profile_entries):
            new_profiles.append({
                "name": e_name.get().strip() or f"帳號 {i+1}",
                "key": e_key.get().strip(),
                "note": e_note.get().strip()
            })
        self.config["api_profiles"] = new_profiles
        self.config["api_key"] = new_profiles[0]["key"]


        # 5 大路徑安全正規化 (空路徑保持 ""，非空轉反斜線)
        self.config["dict_path_1"] = self._norm_path_or_empty(self.entry_dict_1.get())
        self.config["dict_path_2"] = self._norm_path_or_empty(self.entry_dict_2.get())
        self.config["radar_engineer_prompt_path"] = self._norm_path_or_empty(self.entry_eng_prompt.get())
        self.config["radar_qa_prompt_path"] = self._norm_path_or_empty(self.entry_qa_prompt.get())
        self.config["sentinel_script_path"] = self._norm_path_or_empty(self.entry_sentinel_path.get())
        self.config["enable_collision_sentinel"] = self.var_enable_sentinel.get()


        dispatch_modes = ["random", "round_robin", "locked"]
        d_idx = self.combo_dispatch_mode.current()
        self.config["account_dispatch_mode"] = dispatch_modes[d_idx] if 0 <= d_idx < len(dispatch_modes) else "random"


        retry_policies = ["horizontal_first", "quality_locked", "vertical_first"]
        r_idx = self.combo_retry_policy.current()
        self.config["retry_route_policy"] = retry_policies[r_idx] if 0 <= r_idx < len(retry_policies) else "horizontal_first"


        try:
            self.config["max_retries"] = max(1, min(10, int(self.entry_max_retries.get())))
        except Exception:
            self.config["max_retries"] = 3


        try:
            self.config["base_delay_seconds"] = max(0.1, min(30.0, float(self.entry_base_delay.get())))
        except Exception:
            self.config["base_delay_seconds"] = 2.0


        try:
            self.config["request_timeout_seconds"] = max(10.0, min(600.0, float(self.entry_request_timeout.get())))
        except Exception:
            self.config["request_timeout_seconds"] = 300.0


        self.config["enable_fallback"] = self.var_enable_fallback.get()
        self.config["fallback_model_1"] = self.combo_fallback_1.get().strip()
        self.config["fallback_model_2"] = self.combo_fallback_2.get().strip()
        self.config["swap_bottom_bar"] = self.var_swap_bottom_bar.get()
        self.config["enable_click_to_copy"] = self.var_click_to_copy.get()
        self.config["enable_clear_and_paste"] = self.var_clear_and_paste.get()


        self.save_config()
        self.refresh_top_account_combo()
        Toast.show(self.root, "✅ 所有帳號、正規化路徑、逾時、哨兵預檢與偏好設定已成功更新！")


    def _warn_unsaved_path_diffs(self, disk_cfg: dict | None = None) -> bool:
        """比對頁籤 2 輸入框路徑與磁碟已儲存 config.json 差異，若有未儲存變更則提示警告"""
        if disk_cfg is None:
            disk_cfg = self.load_config()


        pairs = [
            (getattr(self, "entry_dict_1", None), "dict_path_1"),
            (getattr(self, "entry_dict_2", None), "dict_path_2"),
            (getattr(self, "entry_eng_prompt", None), "radar_engineer_prompt_path"),
            (getattr(self, "entry_qa_prompt", None), "radar_qa_prompt_path"),
            (getattr(self, "entry_sentinel_path", None), "sentinel_script_path"),
        ]
        for widget, key in pairs:
            if widget is not None:
                try:
                    if widget.winfo_exists():
                        ui_val = self._norm_path_or_empty(widget.get())
                        disk_val = self._norm_path_or_empty(disk_cfg.get(key, ""))
                        if ui_val != disk_val:
                            Toast.show(
                                self.root,
                                "⚠️ 偵測到設定頁路徑有未儲存變更，本次操作將以已儲存之 config.json 為準！",
                                duration=2800,
                                bg="#f59e0b",
                                fg="#000000"
                            )
                            return True
                except Exception:
                    pass
        return False


    # -----------------------------------------------------------------------
    # 線程安全狀態更新、UI 鎖死與視覺告警控制
    # -----------------------------------------------------------------------
    def update_status(self, text, fg_color="#2563eb"):
        def _apply():
            if self.lbl_status is not None:
                try:
                    if self.lbl_status.winfo_exists():
                        self.lbl_status.config(text=text, fg=fg_color)
                except Exception:
                    pass


        try:
            self.root.after(0, _apply)
        except Exception:
            pass


    def set_ui_locked(self, locked: bool):
        self.is_running = locked


        def _apply_lock():
            state = tk.DISABLED if locked else tk.NORMAL
            for btn in [self.btn_auto, self.btn_clear, self.btn_s1, self.btn_s2, self.btn_save, self.test_btn]:
                if btn is not None:
                    try:
                        if btn.winfo_exists():
                            btn.config(state=state)
                    except Exception:
                        pass


            if self.account_combo is not None:
                try:
                    if self.account_combo.winfo_exists():
                        self.account_combo.config(state=tk.DISABLED if locked else "readonly")
                except Exception:
                    pass


            if self.model_combo is not None:
                try:
                    if self.model_combo.winfo_exists():
                        self.model_combo.config(state=tk.DISABLED if locked else tk.NORMAL)
                except Exception:
                    pass


        try:
            self.root.after(0, _apply_lock)
        except Exception:
            pass


    def set_save_btn_alert(self, is_alert: bool):
        if self.btn_save is not None:
            color = self.COLOR_SAVE_WARNING if is_alert else self.COLOR_SAVE_NORMAL
            try:
                self.btn_save.config(bg=color)
            except Exception:
                pass


    @staticmethod
    def sanitize_invisible_chars(raw_text: str) -> str:
        if not raw_text:
            return ""
        return re.sub(r'[\u200b\ufeff\u200e\u200f]', '', raw_text)


    @staticmethod
    def _score_cjk_text(text: str, is_big5: bool) -> int:
        """零依賴啟發式評分：針對 GBK 與 Big5 同時解碼成功時裁決繁簡文字合法性"""
        score = 0
        trad_punct = set("「」『』，。：；？！（）【】、")
        trad_markers = set("體國學發這為們說時會對裡過麼當進種還點條目標詞字審核正則查找字典邏輯錯誤檔案路徑")
        for ch in text:
            code = ord(ch)
            if 0x3040 <= code <= 0x30FF:
                score -= 5
            elif (0x0400 <= code <= 0x04FF) or (0x2500 <= code <= 0x257F):
                score -= 6
            elif 0xE000 <= code <= 0xF8FF:
                score -= 8
            elif (code < 32 and ch not in ("\r", "\n", "\t")) or code == 127:
                score -= 10
            elif ch in trad_punct:
                score += 3
            elif 0x4E00 <= code <= 0x9FFF:
                score += 1
                if is_big5:
                    try:
                        b = ch.encode("big5")
                        if len(b) == 2 and 0xA4 <= b[0] <= 0xC6:
                            score += 1
                    except Exception:
                        score -= 1
                    if ch in trad_markers:
                        score += 2
                else:
                    try:
                        ch.encode("gb2312")
                        score += 1
                    except Exception:
                        score -= 1
        return score


    def read_file_text_multiformat(self, path: str) -> str:
        if not path or not os.path.exists(path):
            raise FileNotFoundError(f"找不到檔案：{path}")


        try:
            with open(path, 'rb') as f:
                raw_bytes = f.read()
        except OSError as e:
            raise FileNotFoundError(f"無法讀取檔案 {path}: {e}") from e


        for enc in ('utf-8-sig', 'utf-8'):
            try:
                return raw_bytes.decode(enc)
            except (UnicodeDecodeError, UnicodeError):
                continue


        decoded_gbk = None
        decoded_big5 = None
        try:
            decoded_gbk = raw_bytes.decode('gbk')
        except (UnicodeDecodeError, UnicodeError):
            pass
        try:
            decoded_big5 = raw_bytes.decode('big5')
        except (UnicodeDecodeError, UnicodeError):
            pass


        if decoded_gbk is not None and decoded_big5 is None:
            return decoded_gbk
        if decoded_big5 is not None and decoded_gbk is None:
            return decoded_big5
        if decoded_gbk is not None and decoded_big5 is not None:
            score_big5 = self._score_cjk_text(decoded_big5, is_big5=True)
            score_gbk = self._score_cjk_text(decoded_gbk, is_big5=False)
            return decoded_big5 if score_big5 >= score_gbk else decoded_gbk


        decoded_lossy = raw_bytes.decode('utf-8', errors='ignore')
        if hasattr(self, "root") and self.root is not None:
            try:
                if self.root.winfo_exists():
                    fname = os.path.basename(path)
                    self.root.after(0, lambda fn=fname: Toast.show(
                        self.root,
                        f"⚠️ 檔案 [{fn}] 含無法識別之編碼字元，已採容錯讀取（請核對內容）",
                        duration=3000,
                        bg="#f59e0b",
                        fg="#000000"
                    ))
            except Exception:
                pass
        return decoded_lossy


    # -----------------------------------------------------------------------
    # 提示詞自適應嗅探與字典目標字解析
    # -----------------------------------------------------------------------
    def resolve_prompt_path(self, configured_path: str, role_type: str) -> str:
        if configured_path and os.path.isfile(configured_path):
            return self._norm_path_or_empty(configured_path)


        if configured_path and os.path.isdir(configured_path):
            search_dir = configured_path
        elif configured_path:
            search_dir = os.path.dirname(configured_path)
            if not search_dir:
                search_dir = SCRIPT_DIR
        else:
            search_dir = SCRIPT_DIR


        search_dir = os.path.normpath(search_dir)
        if not os.path.exists(search_dir) or not os.path.isdir(search_dir):
            raise FileNotFoundError(f"找不到提示詞搜尋目錄：{search_dir}")


        try:
            all_txts = [
                f for f in os.listdir(search_dir)
                if os.path.isfile(os.path.join(search_dir, f)) and f.lower().endswith('.txt')
            ]
        except OSError as e:
            raise FileNotFoundError(f"無法讀取提示詞目錄 [{search_dir}]: {e}") from e


        candidate_files = []
        for f in all_txts:
            f_upper = f.upper()
            if role_type == "eng":
                if ("工程師" in f or "ENG" in f_upper) and ("拓荒" not in f):
                    candidate_files.append(f)
            elif role_type == "qa":
                if ("QA" in f_upper) or ("審查員" in f):
                    candidate_files.append(f)


        if not candidate_files:
            raise FileNotFoundError(f"在目錄 [{search_dir}] 中找不到匹配的 {role_type.upper()} 提示詞檔案！")


        def get_version_score(filename: str):
            full_p = os.path.join(search_dir, filename)
            v_match = re.search(r'(?:v|V)?(\d+(?:\.\d+)+)', filename)
            if v_match:
                try:
                    num_parts = tuple(int(x) for x in v_match.group(1).split('.'))
                    return (3, num_parts, os.path.getmtime(full_p))
                except Exception:
                    pass


            d_match = re.search(r'(\d{8})', filename)
            if d_match:
                try:
                    d_int = int(d_match.group(1))
                    return (2, (d_int,), os.path.getmtime(full_p))
                except Exception:
                    pass


            return (1, (), os.path.getmtime(full_p))


        candidate_files.sort(key=get_version_score, reverse=True)
        best_file = candidate_files[0]
        best_full_path = self._norm_path_or_empty(os.path.abspath(os.path.join(search_dir, best_file)))


        cfg_key = "radar_engineer_prompt_path" if role_type == "eng" else "radar_qa_prompt_path"
        old_path = self._norm_path_or_empty(self.config.get(cfg_key, ""))


        if old_path != best_full_path:
            self.config[cfg_key] = best_full_path
            self.save_config()


            if role_type == "eng" and hasattr(self, 'entry_eng_prompt'):
                self.entry_eng_prompt.delete(0, tk.END)
                self.entry_eng_prompt.insert(0, best_full_path)
            elif role_type == "qa" and hasattr(self, 'entry_qa_prompt'):
                self.entry_qa_prompt.delete(0, tk.END)
                self.entry_qa_prompt.insert(0, best_full_path)


            Toast.show(self.root, f"💡 提示詞已自動適配最新版：\n[{best_file}]", duration=2500, bg="#2563eb", fg="#ffffff")


        return best_full_path


    @staticmethod
    def parse_dict_targets(dict_content: str) -> set[str]:
        targets = set()
        if not dict_content:
            return targets


        headers = re.findall(r';\s*\[\s*(?:\d+[\.、\s]*)?([^\]\s\-]+)', dict_content)
        for h in headers:
            h_clean = h.strip()
            if h_clean:
                targets.add(h_clean)


        tails = re.findall(r'\|\s*([^\|\(\)\*\s\$\^\r\n]+)\s*$', dict_content, re.MULTILINE)
        for t in tails:
            t_clean = t.strip()
            if t_clean:
                targets.add(t_clean)


        return targets


    @staticmethod
    def extract_log_targets(log_text: str) -> list[str]:
        if not log_text:
            return []
        matches = re.findall(r'目標詞[:：]\s*([^\s(（\r\n]+)', log_text)
        seen = set()
        ordered_targets = []
        for m in matches:
            t = m.strip()
            if t and t not in seen:
                seen.add(t)
                ordered_targets.append(t)
        return ordered_targets


    @classmethod
    def detect_active_targets(cls, log_text: str, dict_content: str) -> list[str]:
        if not log_text:
            return []


        track1_targets = cls.extract_log_targets(log_text)
        if track1_targets:
            return track1_targets


        dict_targets = cls.parse_dict_targets(dict_content)
        if not dict_targets:
            return []


        lines = [line.strip() for line in log_text.splitlines() if line.strip()]
        total_lines = len(lines)
        if total_lines == 0:
            return []


        hits = []
        for word in dict_targets:
            line_count = sum(1 for line in lines if word in line)
            if line_count >= 1:
                if total_lines < 3:
                    hits.append((word, line_count))
                elif (line_count / total_lines >= 0.15) or (line_count >= 3):
                    hits.append((word, line_count))


        if hits:
            hits.sort(key=lambda x: x[1], reverse=True)
            return [item[0] for item in hits]


        return sorted(list(dict_targets))


    @classmethod
    def parse_dict_blocks(cls, dict_content: str) -> tuple[str, dict[str, str]]:
        if not dict_content:
            return "", {}


        first_block = re.search(r'(?m)^;\s*\[', dict_content)
        header_comment = dict_content[:first_block.start()] if first_block else ""


        blocks_map = {}
        for m in cls.ENTRY_BLOCK_REGEX.finditer(dict_content):
            t_key = m.group(1).strip()
            if t_key:
                if t_key in blocks_map:
                    blocks_map[t_key] += "\n\n" + m.group(0).strip()
                else:
                    blocks_map[t_key] = m.group(0).strip()


        return header_comment, blocks_map


    @classmethod
    def slice_dict_blocks(cls, dict_content: str, active_targets: list[str]) -> str:
        if not dict_content or not active_targets:
            return dict_content


        _, blocks_map = cls.parse_dict_blocks(dict_content)
        sliced_blocks = []
        for t in active_targets:
            if t in blocks_map:
                sliced_blocks.append(blocks_map[t].strip())


        if not sliced_blocks:
            return dict_content


        k = len(sliced_blocks)
        joined_blocks = "\n\n".join(sliced_blocks)
        header_tag = f"; === 【對照原始字典局部切片 (共 {k} 組目標字)】 ===\n"
        return header_tag + joined_blocks + "\n"


    # -----------------------------------------------------------------------
    # 底層 API 呼叫 (原樣透傳模型名稱 + 可調請求逾時軟降級)
    # -----------------------------------------------------------------------
    def raw_sdk_call(self, api_key: str, model_name: str, prompt_text: str, timeout_seconds: float = 300.0) -> str:
        if not api_key:
            raise Exception("尚未設定 API Key，請先於設定中配置！")


        timeout_val = max(10.0, min(600.0, float(timeout_seconds)))


        if GENAI_MODE == "google.genai":
            from google import genai
            try:
                client = genai.Client(api_key=api_key, http_options={"timeout": int(timeout_val * 1000)})
            except TypeError:
                client = genai.Client(api_key=api_key)
            response = client.models.generate_content(
                model=model_name,
                contents=prompt_text
            )
            return response.text
        elif GENAI_MODE == "google.generativeai":
            import google.generativeai as genai_legacy
            genai_legacy.configure(api_key=api_key)
            model = genai_legacy.GenerativeModel(model_name)
            try:
                response = model.generate_content(prompt_text, request_options={"timeout": float(timeout_val)})
            except TypeError:
                response = model.generate_content(prompt_text)
            return response.text
        else:
            raise Exception("未安裝 google-genai 套件，請執行 pip install google-genai")


    def test_api_connection(self):
        if self.is_running:
            Toast.show(self.root, "⚠️ 任務執行中，暫無法測試連通性！", bg="#f59e0b", fg="#000000")
            return


        active_profiles = self.get_active_profiles()
        if not active_profiles:
            msg = "⚠️ 尚未配置任何有效 API Key！請至設定頁輸入。"
            Toast.show(self.root, msg, bg="#f59e0b", fg="#000000")
            self._show_alert_banner("❌ 無法發起連線測試：所有 API Key 均為空，請至設定頁配置有效金鑰。")
            return


        idx = self.config.get("locked_account_index", 0)
        all_profiles = self.config.get("api_profiles", [])
        selected_profile = all_profiles[idx] if 0 <= idx < len(all_profiles) else {}
        selected_has_key = isinstance(selected_profile, dict) and bool(selected_profile.get("key", "").strip())


        if selected_has_key:
            target_profile = selected_profile
            switched_note = ""
        else:
            target_profile = active_profiles[0]
            switched_note = f"\n(已自動切換至首組有效帳號 [{target_profile['name']}] 測試)"


        api_key = target_profile["key"]
        account_name = target_profile["name"]
        model_name = self.model_combo.get().strip() or self.config["gemini_model"]
        timeout_sec = float(self.config.get("request_timeout_seconds", 300.0))


        def _worker(k: str, m: str, acc_name: str, note: str, t_sec: float):
            self.update_status(f"🔍 正在測試 [{acc_name}] 之模型 [{m}] 連通性...", fg_color="#2563eb")
            try:
                start_t = time.time()
                self.raw_sdk_call(k, m, "Hello, reply 'OK'", timeout_seconds=t_sec)
                cost_t = round(time.time() - start_t, 2)


                self._hide_alert_banner()
                self.root.after(0, lambda: Toast.show(
                    self.root,
                    f"✅ API 通暢！帳號 [{acc_name}] 模型 [{m}] 回應正常 ({cost_t}s){note}",
                    duration=2400,
                    bg="#10b981",
                    fg="#ffffff"
                ))
                self.update_status(f"💡 API 連線就緒 [{acc_name} | {m} / {cost_t}s]", fg_color="#059669")
            except Exception as e:
                err_msg = str(e)
                err_upper = err_msg.upper()
                if any(code in err_upper for code in ["503", "UNAVAILABLE", "HIGH DEMAND"]):
                    status_desc = "⚠️ 伺服器暫時負載過高 (503)，請稍後再試或使用備援模型"
                elif any(code in err_upper for code in ["404", "NOT_FOUND", "NOT FOUND"]):
                    status_desc = f"❌ 模型名稱 [{m}] 不存在"
                elif any(code in err_upper for code in ["400", "403", "API_KEY_INVALID", "PERMISSION_DENIED"]):
                    status_desc = "❌ API Key 無效或未開通權限"
                else:
                    status_desc = f"❌ 連線失敗: {err_msg[:60]}"


                banner_text = f"連線測試失敗 ➔ [帳號: {acc_name} ｜ 模型: {m}]：{status_desc}"
                self._show_alert_banner(banner_text)
                self.root.after(0, lambda: Toast.show(
                    self.root,
                    f"❌ 測試失敗: {status_desc}{note}",
                    duration=3000,
                    bg="#ef4444",
                    fg="#ffffff"
                ))
                self.update_status(f"❌ [{acc_name}] {status_desc}", fg_color="#dc2626")


        threading.Thread(target=_worker, args=(api_key, model_name, account_name, switched_note, timeout_sec), daemon=True).start()


    # -----------------------------------------------------------------------
    # 抗焦慮碼錶 (世代 Token 隔離 + 主執行緒安全派發 + 秒數前置 + 心跳互鎖)
    # -----------------------------------------------------------------------
    def _start_stopwatch(self, desc_prefix: str, detail_suffix: str = "", fg_color: str = "#2563eb"):
        self.heartbeat_active = False
        self.stopwatch_token += 1
        my_token = self.stopwatch_token
        self.stopwatch_running = True
        start_time = time.time()
        suffix_part = f" {detail_suffix}" if detail_suffix else ""


        def _tick():
            if not self.stopwatch_running or my_token != self.stopwatch_token:
                return
            if not self.heartbeat_active:
                elapsed = int(time.time() - start_time)
                try:
                    if self.lbl_status is not None and self.lbl_status.winfo_exists():
                        self.lbl_status.config(
                            text=f"{desc_prefix} (已耗時: {elapsed}s){suffix_part}...",
                            fg=fg_color
                        )
                except Exception:
                    return
            try:
                self.stopwatch_after_id = self.root.after(1000, _tick)
            except Exception:
                pass


        def _init_on_main():
            if not self.stopwatch_running or my_token != self.stopwatch_token:
                return
            if self.stopwatch_after_id is not None:
                try:
                    self.root.after_cancel(self.stopwatch_after_id)
                except Exception:
                    pass
                self.stopwatch_after_id = None
            if not self.heartbeat_active:
                try:
                    if self.lbl_status is not None and self.lbl_status.winfo_exists():
                        self.lbl_status.config(
                            text=f"{desc_prefix} (已耗時: 0s){suffix_part}...",
                            fg=fg_color
                        )
                except Exception:
                    return
            try:
                self.stopwatch_after_id = self.root.after(1000, _tick)
            except Exception:
                pass


        try:
            self.root.after(0, _init_on_main)
        except Exception:
            pass


    def _stop_stopwatch(self):
        self.stopwatch_running = False
        self.stopwatch_token += 1


        def _cancel_on_main():
            if self.stopwatch_after_id is not None:
                try:
                    self.root.after_cancel(self.stopwatch_after_id)
                except Exception:
                    pass
                self.stopwatch_after_id = None


        try:
            self.root.after(0, _cancel_on_main)
        except Exception:
            pass


    def _sleep_with_heartbeat(self, sleep_time: float, current_model: str):
        remaining_seconds = int(sleep_time)
        if remaining_seconds <= 0:
            return
        self.heartbeat_active = True
        try:
            while remaining_seconds > 0 and self.is_running:
                self.update_status(
                    f"⏳ {current_model} 尖峰排隊中 (退避倒數: {remaining_seconds}s... 即將重試)",
                    fg_color="#d97706"
                )
                time.sleep(1.0)
                remaining_seconds -= 1
        finally:
            self.heartbeat_active = False


    # -----------------------------------------------------------------------
    # 多帳號多階梯狀態機 (API Key SHA-256 雜湊黑名單、防反向升級與 404/429 精準隔離)
    # -----------------------------------------------------------------------
    def call_gemini_api(self, prompt_text: str, candidate_profiles: list[dict], primary_model: str, retry_cfg: dict, stage_name: str = "任務") -> dict:
        if not candidate_profiles:
            raise Exception("可用帳號清單為空，請先於設定頁輸入 Gemini API Key！")


        auth_failed_key_hashes = set()
        unique_valid_key_hashes = {
            hashlib.sha256(p["key"].strip().encode("utf-8")).hexdigest()
            for p in candidate_profiles
            if isinstance(p, dict) and p.get("key", "").strip()
        }
        if not unique_valid_key_hashes:
            raise Exception("可用帳號金鑰皆為空，請先於設定頁輸入 Gemini API Key！")


        max_retries = int(retry_cfg["max_retries"])
        base_delay = float(retry_cfg["base_delay_seconds"])
        request_timeout = float(retry_cfg.get("request_timeout_seconds", 300.0))
        enable_fallback = bool(retry_cfg["enable_fallback"])
        route_policy = retry_cfg.get("retry_route_policy", "horizontal_first")


        # 建構防重疊與防反向升級模型階梯
        primary_canon = self.RETIRED_MODEL_ALIAS.get(primary_model, primary_model)
        primary_rank = self.PRESET_MODELS.index(primary_canon) if primary_canon in self.PRESET_MODELS else None
        models_to_try = [primary_model]
        seen_canon = {primary_canon}
        if enable_fallback and route_policy != "quality_locked":
            for fb in (retry_cfg["fallback_model_1"].strip(), retry_cfg["fallback_model_2"].strip()):
                if not fb:
                    continue
                fb_canon = self.RETIRED_MODEL_ALIAS.get(fb, fb)
                if fb_canon in seen_canon or fb in models_to_try:
                    continue
                if primary_rank is not None and fb_canon in self.PRESET_MODELS:
                    if self.PRESET_MODELS.index(fb_canon) <= primary_rank:
                        continue
                seen_canon.add(fb_canon)
                models_to_try.append(fb)


        def is_transient_error(e: Exception) -> bool:
            err_str = str(e).upper()
            return any(k in err_str for k in [
                "503", "UNAVAILABLE", "429", "RESOURCE_EXHAUSTED",
                "500", "INTERNAL", "504", "DEADLINE_EXCEEDED", "HIGH DEMAND",
                "EMPTY RESPONSE", "TIMEOUT", "TIMED OUT", "READTIMEOUT"
            ])


        def is_account_auth_error(e: Exception) -> bool:
            """比對單一帳號授權/無效金鑰錯誤 (前置排除 404/NOT_FOUND，且嚴禁納入 429)"""
            err_s = str(e).upper()
            if any(nf in err_s for nf in ["404", "NOT_FOUND", "NOT FOUND"]):
                return False
            return any(k in err_s for k in [
                "400", "403", "API_KEY_INVALID", "PERMISSION_DENIED",
                "CREDENTIALS", "INVALID_ARGUMENT", "API KEY NOT VALID", "API KEY EXPIRED"
            ])


        last_error = None


        # 路線 1：horizontal_first
        if route_policy == "horizontal_first":
            for model_idx, current_model in enumerate(models_to_try):
                is_fallback_model = (model_idx > 0)


                for attempt in range(1, max_retries + 1):
                    for prof_idx, profile in enumerate(candidate_profiles):
                        acc_key = profile.get("key", "").strip() if isinstance(profile, dict) else ""
                        if not acc_key:
                            continue
                        key_hash = hashlib.sha256(acc_key.encode("utf-8")).hexdigest()
                        if key_hash in auth_failed_key_hashes:
                            continue
                        acc_name = profile.get("name", f"帳號{prof_idx+1}")


                        try:
                            start_t = time.time()
                            res_text = self.raw_sdk_call(acc_key, current_model, prompt_text, timeout_seconds=request_timeout)
                            cost_t = round(time.time() - start_t, 2)


                            if res_text and res_text.strip():
                                if is_fallback_model:
                                    self.root.after(0, lambda m=current_model, a=acc_name: Toast.show(
                                        self.root,
                                        f"⚠️ 主要模型過載，已由 [{a}] 透過備援模型 [{m}] 完成任務！",
                                        duration=2500, bg="#f59e0b", fg="#000000"
                                    ))
                                return {
                                    "text": res_text,
                                    "actual_account": acc_name,
                                    "actual_model": current_model,
                                    "elapsed_time": cost_t,
                                    "is_fallback": is_fallback_model
                                }
                            else:
                                raise Exception(f"帳號 [{acc_name}] 之模型 [{current_model}] 回傳空內容 (Empty Response)")


                        except Exception as e:
                            last_error = e
                            if is_account_auth_error(e):
                                auth_failed_key_hashes.add(key_hash)
                                if len(auth_failed_key_hashes) >= len(unique_valid_key_hashes):
                                    break
                                switch_tip = f"⚠️ 帳號 [{acc_name}] 授權失效，嘗試候選池下組帳號..."
                                self.update_status(switch_tip, fg_color="#d97706")
                                time.sleep(0.3)
                                continue


                            if not is_transient_error(e):
                                raise e


                            switch_tip = f"⏳ [{stage_name}] 帳號 {acc_name} 模型 {current_model} 遇阻，嘗試下組帳號..."
                            self.update_status(switch_tip, fg_color="#d97706")
                            time.sleep(0.3)


                    if len(auth_failed_key_hashes) >= len(unique_valid_key_hashes):
                        break


                    if attempt < max_retries and self.is_running:
                        sleep_time = (base_delay * (2 ** (attempt - 1))) + random.uniform(0.1, 0.5)
                        self._sleep_with_heartbeat(sleep_time, current_model)


                if len(auth_failed_key_hashes) >= len(unique_valid_key_hashes):
                    break


                if model_idx < len(models_to_try) - 1 and self.is_running:
                    next_model = models_to_try[model_idx + 1]
                    switch_tip = f"⚠️ [{stage_name}] 全帳號模型 {current_model} 負載耗盡，切換至備援模型 [{next_model}]..."
                    self.update_status(switch_tip, fg_color="#d97706")
                    time.sleep(1.0)


        # 路線 2：quality_locked
        elif route_policy == "quality_locked":
            current_model = primary_model


            for attempt in range(1, max_retries + 1):
                for prof_idx, profile in enumerate(candidate_profiles):
                    acc_key = profile.get("key", "").strip() if isinstance(profile, dict) else ""
                    if not acc_key:
                        continue
                    key_hash = hashlib.sha256(acc_key.encode("utf-8")).hexdigest()
                    if key_hash in auth_failed_key_hashes:
                        continue
                    acc_name = profile.get("name", f"帳號{prof_idx+1}")


                    try:
                        start_t = time.time()
                        res_text = self.raw_sdk_call(acc_key, current_model, prompt_text, timeout_seconds=request_timeout)
                        cost_t = round(time.time() - start_t, 2)


                        if res_text and res_text.strip():
                            return {
                                "text": res_text,
                                "actual_account": acc_name,
                                "actual_model": current_model,
                                "elapsed_time": cost_t,
                                "is_fallback": False
                            }
                        else:
                            raise Exception(f"帳號 [{acc_name}] 之模型 [{current_model}] 回傳空內容 (Empty Response)")


                    except Exception as e:
                        last_error = e
                        if is_account_auth_error(e):
                            auth_failed_key_hashes.add(key_hash)
                            if len(auth_failed_key_hashes) >= len(unique_valid_key_hashes):
                                break
                            switch_tip = f"⚠️ 帳號 [{acc_name}] 授權失效，切換下組帳號..."
                            self.update_status(switch_tip, fg_color="#d97706")
                            time.sleep(0.3)
                            continue


                        if not is_transient_error(e):
                            raise e


                        switch_tip = f"⏳ [{stage_name}] 帳號 {acc_name} 模型 {current_model} 遇阻，切換下組帳號..."
                        self.update_status(switch_tip, fg_color="#d97706")
                        time.sleep(0.3)


                if len(auth_failed_key_hashes) >= len(unique_valid_key_hashes):
                    break


                if attempt < max_retries and self.is_running:
                    sleep_time = (base_delay * (2 ** (attempt - 1))) + random.uniform(0.1, 0.5)
                    self._sleep_with_heartbeat(sleep_time, f"[品質鎖定] {current_model}")


        # 路線 3：vertical_first
        else:
            for prof_idx, profile in enumerate(candidate_profiles):
                acc_key = profile.get("key", "").strip() if isinstance(profile, dict) else ""
                if not acc_key:
                    continue
                key_hash = hashlib.sha256(acc_key.encode("utf-8")).hexdigest()
                if key_hash in auth_failed_key_hashes:
                    continue
                acc_name = profile.get("name", f"帳號{prof_idx+1}")


                account_auth_failed = False
                for model_idx, current_model in enumerate(models_to_try):
                    is_fallback_model = (model_idx > 0)


                    for attempt in range(1, max_retries + 1):
                        try:
                            start_t = time.time()
                            res_text = self.raw_sdk_call(acc_key, current_model, prompt_text, timeout_seconds=request_timeout)
                            cost_t = round(time.time() - start_t, 2)


                            if res_text and res_text.strip():
                                if is_fallback_model:
                                    self.root.after(0, lambda m=current_model, a=acc_name: Toast.show(
                                        self.root,
                                        f"⚠️ [{a}] 觸發模型備援，透過 [{m}] 完成任務！",
                                        duration=2500, bg="#f59e0b", fg="#000000"
                                    ))
                                return {
                                    "text": res_text,
                                    "actual_account": acc_name,
                                    "actual_model": current_model,
                                    "elapsed_time": cost_t,
                                    "is_fallback": is_fallback_model
                                }
                            else:
                                raise Exception(f"帳號 [{acc_name}] 之模型 [{current_model}] 回傳空內容 (Empty Response)")


                        except Exception as e:
                            last_error = e
                            if is_account_auth_error(e):
                                auth_failed_key_hashes.add(key_hash)
                                if len(auth_failed_key_hashes) < len(unique_valid_key_hashes):
                                    switch_tip = f"⚠️ 帳號 [{acc_name}] 授權失效，嘗試下一帳號..."
                                    self.update_status(switch_tip, fg_color="#d97706")
                                    time.sleep(0.3)
                                account_auth_failed = True
                                break


                            if not is_transient_error(e):
                                raise e


                            if attempt < max_retries and self.is_running:
                                sleep_time = (base_delay * (2 ** (attempt - 1))) + random.uniform(0.1, 0.5)
                                self._sleep_with_heartbeat(sleep_time, f"[{acc_name}] {current_model}")
                            else:
                                break


                    if account_auth_failed:
                        break


                if len(auth_failed_key_hashes) >= len(unique_valid_key_hashes):
                    break


        raise Exception(f"所有帳號與模型梯隊調用皆告失敗。最後錯誤: {str(last_error)}")


    # -----------------------------------------------------------------------
    # 快照封裝與極速硬阻斷
    # -----------------------------------------------------------------------
    def get_selected_dict_content(self) -> tuple[str, str, str, str]:
        choice = self.selected_dict_for_ai.get()
        if choice == "dict1":
            p = self._norm_path_or_empty(self.config.get("dict_path_1", ""))
            if not p:
                raise FileNotFoundError("已選擇【字典檔 1】，但路徑設定為空，請至設定頁配置並儲存！")
            if not os.path.isfile(p):
                raise FileNotFoundError(f"找不到【字典檔 1】實體檔案：{p}，請至設定頁修正路徑並儲存！")
            return self.read_file_text_multiformat(p), "字典檔 1", choice, p
        elif choice == "dict2":
            p = self._norm_path_or_empty(self.config.get("dict_path_2", ""))
            if not p:
                raise FileNotFoundError("已選擇【字典檔 2】，但路徑設定為空，請至設定頁配置並儲存！")
            if not os.path.isfile(p):
                raise FileNotFoundError(f"找不到【字典檔 2】實體檔案：{p}，請至設定頁修正路徑並儲存！")
            return self.read_file_text_multiformat(p), "字典檔 2", choice, p
        return "", "不附帶字典", choice, ""


    def create_task_snapshot(self) -> dict:
        raw_log = self.txt_log.get("1.0", tk.END).strip()
        log_content = self.sanitize_invisible_chars(raw_log)
        primary_model = self.model_combo.get().strip() or self.config["gemini_model"]
        dict_content, dict_label, choice, target_path = self.get_selected_dict_content()


        active_targets = self.detect_active_targets(log_content, dict_content) if dict_content else []
        all_dict_targets = self.parse_dict_targets(dict_content) if dict_content else set()


        is_sliced = False
        sliced_dict = dict_content
        if choice in ("dict1", "dict2") and dict_content.strip() and active_targets:
            if set(active_targets) < all_dict_targets and len(active_targets) > 0:
                sliced_dict = self.slice_dict_blocks(dict_content, active_targets)
                is_sliced = True


        eng_prompt_path = self.resolve_prompt_path(self.config.get("radar_engineer_prompt_path", ""), "eng")
        qa_prompt_path = self.resolve_prompt_path(self.config.get("radar_qa_prompt_path", ""), "qa")


        active_profiles = self.get_active_profiles()
        if not active_profiles:
            active_profiles = [{"name": "臨時預設帳號", "key": self.config.get("api_key", ""), "note": ""}]


        dispatch_mode = self.config.get("account_dispatch_mode", "random")
        ordered_profiles = list(active_profiles)


        if len(ordered_profiles) > 1:
            if dispatch_mode == "random":
                start_idx = random.randint(0, len(ordered_profiles) - 1)
                ordered_profiles = ordered_profiles[start_idx:] + ordered_profiles[:start_idx]
            elif dispatch_mode == "round_robin":
                start_idx = self.rr_counter % len(ordered_profiles)
                self.rr_counter += 1
                ordered_profiles = ordered_profiles[start_idx:] + ordered_profiles[:start_idx]
            elif dispatch_mode == "locked":
                locked_idx = self.config.get("locked_account_index", 0)
                if 0 <= locked_idx < len(self.config.get("api_profiles", [])):
                    locked_name = self.config["api_profiles"][locked_idx].get("name", "")
                    for i, p in enumerate(ordered_profiles):
                        if p.get("name") == locked_name:
                            ordered_profiles = ordered_profiles[i:] + ordered_profiles[:i]
                            break


        retry_cfg = {
            "max_retries": self.config["max_retries"],
            "base_delay_seconds": self.config["base_delay_seconds"],
            "request_timeout_seconds": self.config.get("request_timeout_seconds", 300.0),
            "enable_fallback": self.config["enable_fallback"],
            "fallback_model_1": self.config["fallback_model_1"],
            "fallback_model_2": self.config["fallback_model_2"],
            "retry_route_policy": self.config.get("retry_route_policy", "horizontal_first")
        }


        return {
            "dict_choice": choice,
            "target_path": target_path,
            "dict_label": dict_label,
            "log_content": log_content,
            "active_targets": active_targets,
            "all_dict_targets": all_dict_targets,
            "is_sliced": is_sliced,
            "candidate_profiles": ordered_profiles,
            "primary_model": primary_model,
            "dict_content": dict_content,
            "sliced_dict": sliced_dict,
            "eng_prompt_path": eng_prompt_path,
            "qa_prompt_path": qa_prompt_path,
            "retry_cfg": retry_cfg,
            "s1_meta": {},
            "s1_hash": None,
            "s2_meta": {},
            "s2_hash": None
        }


    def check_and_block_alien_targets(self, snapshot: dict) -> bool:
        choice = snapshot["dict_choice"]
        dict_content = snapshot["dict_content"]
        dict_label = snapshot["dict_label"]
        log_content = snapshot["log_content"]


        if choice in ("dict1", "dict2") and dict_content.strip() and log_content:
            log_targets = self.extract_log_targets(log_content)
            dict_targets = self.parse_dict_targets(dict_content)


            if log_targets and dict_targets:
                alien_targets = [t for t in log_targets if t not in dict_targets]
                if alien_targets:
                    alien_str = "、".join(f"【{t}】" for t in alien_targets)
                    self.set_save_btn_alert(True)
                    err_msg = f"❌ 阻斷：日誌目標{alien_str}非{dict_label}收錄字，已終止發送！請切換字典"
                    self.update_status(err_msg, fg_color="#dc2626")
                    self._show_alert_banner(f"第 0 秒硬阻斷：{dict_label}中未收錄{alien_str}！請於 Radio 切換正確字典後重試。")
                    Toast.show(
                        self.root,
                        f"❌ 字典不匹配，已阻斷發送！\n日誌目標{alien_str}未在{dict_label}中收錄。\n請切換 Radio 後重新點擊。",
                        duration=3500,
                        bg="#dc2626",
                        fg="#ffffff"
                    )
                    return True


        self.set_save_btn_alert(False)
        return False


    def reset_preview_headers(self):
        if self.frame_s1 is not None:
            self.frame_s1.config(text="階段一：雷達工程師提案預覽 (Stage 1)")
        if self.frame_s2 is not None:
            self.frame_s2.config(text="階段二：雷達 QA 審核與最終字典條目 (Stage 2 - 直通寫入來源)")


    # -----------------------------------------------------------------------
    # 雙階流水線 Worker (三大進入點配置例外安全網與未儲存路徑警示)
    # -----------------------------------------------------------------------
    def run_stage1_thread(self):
        if self.is_running:
            return


        self._warn_unsaved_path_diffs()


        try:
            snapshot = self.create_task_snapshot()
        except Exception as e:
            err_text = f"任務初始化失敗：{str(e)}"
            self._show_alert_banner(f"❌ {err_text}")
            Toast.show(self.root, f"❌ {err_text}", duration=3500, bg="#ef4444", fg="#ffffff")
            self.update_status(f"❌ {err_text}", fg_color="#dc2626")
            return


        if not snapshot["log_content"]:
            Toast.show(self.root, "⚠️ 請先貼上或拖入日誌內容！", bg="#f59e0b", fg="#000000")
            self.update_status("💡 就緒", fg_color="#4b5563")
            return


        if self.check_and_block_alien_targets(snapshot):
            return


        self.last_task_snapshot = snapshot
        self.set_ui_locked(True)


        self.txt_stage1.delete("1.0", tk.END)
        self.txt_stage2.delete("1.0", tk.END)
        self.reset_preview_headers()


        target_info = f"【{'、'.join(snapshot['active_targets'])}】" if snapshot['active_targets'] else ""
        slice_info = " (微創切片)" if snapshot.get("is_sliced", False) else ""
        first_acc = snapshot["candidate_profiles"][0]["name"] if snapshot["candidate_profiles"] else "預設帳號"
        self._start_stopwatch("⏳ 雷達工程師提案中 (Stage 1)", f"[{first_acc}]{target_info}{slice_info}")


        def _runner(snap: dict):
            try:
                self._exec_stage1(snap)
            finally:
                self._stop_stopwatch()
                self.set_ui_locked(False)


        threading.Thread(target=_runner, args=(snapshot,), daemon=True).start()


    def _exec_stage1(self, snapshot: dict):
        self.root.after(0, lambda: Toast.show(self.root, "🚀 [階段一] 雷達工程師提案生成中..."))
        try:
            log_content = snapshot["log_content"]
            candidate_profiles = snapshot["candidate_profiles"]
            primary_model = snapshot["primary_model"]
            dict_label = snapshot["dict_label"]
            eng_prompt_path = snapshot["eng_prompt_path"]
            retry_cfg = snapshot["retry_cfg"]


            dict_to_send = snapshot.get("sliced_dict", snapshot["dict_content"])
            is_sliced = snapshot.get("is_sliced", False)
            slice_mark = f" (局部切片: {len(snapshot['active_targets'])} 字)" if is_sliced else ""


            eng_prompt = self.read_file_text_multiformat(eng_prompt_path)


            full_prompt = f"{eng_prompt}\n\n"
            if dict_to_send.strip():
                full_prompt += f"=== 【對照原始{dict_label}內容{slice_mark}】 ===\n{dict_to_send}\n\n"
            full_prompt += f"=== 【全局詳細正則搜尋結果日誌】 ===\n{log_content}\n"


            api_res = self.call_gemini_api(full_prompt, candidate_profiles, primary_model, retry_cfg, stage_name="階段一")
            result = api_res["text"]


            snapshot["s1_meta"] = {
                "actual_account": api_res["actual_account"],
                "actual_model": api_res["actual_model"],
                "elapsed_time": api_res["elapsed_time"],
                "is_fallback": api_res["is_fallback"]
            }
            snapshot["s1_hash"] = hashlib.sha256(result.strip().encode("utf-8")).hexdigest()
            self.root.after(0, lambda s=snapshot: setattr(self, "last_task_snapshot", s))


            fallback_mark = " ⚠️備援" if api_res["is_fallback"] else ""
            title_s1 = f"階段一：雷達工程師提案預覽 (Stage 1) [{api_res['actual_account']} | {api_res['actual_model']} | {api_res['elapsed_time']}s{fallback_mark}]"
            self.root.after(0, lambda: self.frame_s1.config(text=title_s1))


            if "🚨【架構阻斷：偵測到非本字典之外來目標字】" in result:
                self.root.after(0, lambda: self.set_save_btn_alert(True))
                self.update_status("🚨 AI 觸發熔斷阻斷：偵測到外來目標字，已拒絕寫入磁碟！", fg_color="#dc2626")
                self._show_alert_banner("🚨 AI 觸發外來字架構熔斷：模型回傳非本字典目標字，已拒絕寫入！")
                self.root.after(0, lambda: Toast.show(
                    self.root,
                    "🚨 AI 觸發外來字熔斷：已物理阻斷寫入！請確認對照字典。",
                    duration=3500,
                    bg="#dc2626",
                    fg="#ffffff"
                ))
            else:
                self._hide_alert_banner()
                self.update_status(f"✅ 雷達工程師已給結果 [{api_res['actual_account']} | {api_res['actual_model']} | {api_res['elapsed_time']}s]", fg_color="#059669")


            self.root.after(0, lambda: self._update_text_box(self.txt_stage1, result))
            self.root.after(0, lambda: Toast.show(self.root, "✅ [階段一] 雷達工程師提案產出完成！"))
            return result
        except Exception as e:
            err_msg = str(e)
            banner_msg = f"❌ [階段一 失敗] 調用端點發生異常：{err_msg}"
            self._show_alert_banner(banner_msg)
            self.root.after(0, lambda: self._update_text_box(self.txt_stage1, f"❌ 執行失敗:\n{err_msg}"))
            self.root.after(0, lambda: Toast.show(self.root, f"❌ 階段一失敗: {err_msg}", duration=3000, bg="#ef4444", fg="#ffffff"))
            self.update_status("❌ 雷達工程師提案失敗", fg_color="#dc2626")
            return None


    def run_stage2_thread(self, stage1_input=None):
        if self.is_running:
            return


        self._warn_unsaved_path_diffs()


        try:
            snapshot = self.create_task_snapshot()
        except Exception as e:
            err_text = f"任務初始化失敗：{str(e)}"
            self._show_alert_banner(f"❌ {err_text}")
            Toast.show(self.root, f"❌ {err_text}", duration=3500, bg="#ef4444", fg="#ffffff")
            self.update_status(f"❌ {err_text}", fg_color="#dc2626")
            return


        if not snapshot["log_content"]:
            Toast.show(self.root, "⚠️ 請先貼上或拖入日誌內容！", bg="#f59e0b", fg="#000000")
            self.update_status("💡 就緒", fg_color="#4b5563")
            return


        s1_result = stage1_input or self.txt_stage1.get("1.0", tk.END).strip()
        if not s1_result or s1_result.startswith("❌ 執行失敗"):
            Toast.show(self.root, "⚠️ 請先完成階段一提案！", bg="#f59e0b", fg="#000000")
            self.update_status("💡 就緒", fg_color="#4b5563")
            return


        if self.check_and_block_alien_targets(snapshot):
            return


        current_s1_hash = hashlib.sha256(s1_result.strip().encode("utf-8")).hexdigest()
        if (
            self.last_task_snapshot
            and "s1_meta" in self.last_task_snapshot
            and self.last_task_snapshot.get("s1_hash") == current_s1_hash
            and self.last_task_snapshot.get("log_content") == snapshot["log_content"]
        ):
            snapshot["s1_meta"] = self.last_task_snapshot["s1_meta"]
            snapshot["s1_hash"] = current_s1_hash


        self.last_task_snapshot = snapshot
        self.set_ui_locked(True)
        self.txt_stage2.delete("1.0", tk.END)


        target_info = f"【{'、'.join(snapshot['active_targets'])}】" if snapshot['active_targets'] else ""
        slice_info = " (微創切片)" if snapshot.get("is_sliced", False) else ""
        first_acc = snapshot["candidate_profiles"][0]["name"] if snapshot["candidate_profiles"] else "預設帳號"
        self._start_stopwatch("⏳ 雷達 QA 審核中 (Stage 2)", f"[{first_acc}]{target_info}{slice_info}")


        def _runner(snap: dict, s1: str):
            try:
                self._exec_stage2(snap, s1)
            finally:
                self._stop_stopwatch()
                self.set_ui_locked(False)


        threading.Thread(target=_runner, args=(snapshot, s1_result), daemon=True).start()


    def _exec_stage2(self, snapshot: dict, s1_result: str):
        self.root.after(0, lambda: Toast.show(self.root, "🔍 [階段二] 雷達 QA 嚴格審核進行中..."))
        try:
            log_content = snapshot["log_content"]
            candidate_profiles = snapshot["candidate_profiles"]
            primary_model = snapshot["primary_model"]
            dict_label = snapshot["dict_label"]
            qa_prompt_path = snapshot["qa_prompt_path"]
            retry_cfg = snapshot["retry_cfg"]


            dict_to_send = snapshot.get("sliced_dict", snapshot["dict_content"])
            is_sliced = snapshot.get("is_sliced", False)
            slice_mark = f" (局部切片: {len(snapshot['active_targets'])} 字)" if is_sliced else ""


            qa_prompt = self.read_file_text_multiformat(qa_prompt_path)


            full_prompt = f"{qa_prompt}\n\n"
            if dict_to_send.strip():
                full_prompt += f"=== 【對照原始{dict_label}內容{slice_mark}】 ===\n{dict_to_send}\n\n"


            full_prompt += (
                f"=== 【階段一雷達工程師提案】 ===\n{s1_result}\n\n"
                f"=== 【原始搜尋結果日誌】 ===\n{log_content}\n"
            )


            api_res = self.call_gemini_api(full_prompt, candidate_profiles, primary_model, retry_cfg, stage_name="階段二")
            result = api_res["text"]


            snapshot["s2_meta"] = {
                "actual_account": api_res["actual_account"],
                "actual_model": api_res["actual_model"],
                "elapsed_time": api_res["elapsed_time"],
                "is_fallback": api_res["is_fallback"]
            }


            fallback_mark = " ⚠️備援" if api_res["is_fallback"] else ""
            title_s2 = f"階段二：雷達 QA 審核字典 (Stage 2) [{api_res['actual_account']} | {api_res['actual_model']} | {api_res['elapsed_time']}s{fallback_mark}]"
            self.root.after(0, lambda: self.frame_s2.config(text=title_s2))


            is_meltdown = ("🚨【架構阻斷：偵測到非本字典之外來目標字】" in result)
            if is_meltdown:
                self.root.after(0, lambda: self.set_save_btn_alert(True))
                self.update_status("🚨 AI 觸發熔斷阻斷：偵測到外來目標字，已拒絕寫入磁碟！", fg_color="#dc2626")
                self._show_alert_banner("🚨 AI 觸發外來字架構熔斷：模型回傳非本字典目標字，已拒絕寫入！")
                self.root.after(0, lambda: Toast.show(
                    self.root,
                    "🚨 AI 觸發外來字熔斷：已物理阻斷寫入！請確認對照字典。",
                    duration=3500,
                    bg="#dc2626",
                    fg="#ffffff"
                ))
            else:
                self._hide_alert_banner()
                self.update_status(f"🎉 雷達 QA 已給結果 [{api_res['actual_account']} | {api_res['actual_model']} | {api_res['elapsed_time']}s]", fg_color="#059669")


            s2_hash = hashlib.sha256(result.strip().encode("utf-8")).hexdigest()
            snapshot["s2_hash"] = s2_hash
            self.root.after(0, lambda s=snapshot: setattr(self, "last_task_snapshot", s))


            self.root.after(0, lambda: self._update_text_box(self.txt_stage2, result))
            if not is_meltdown:
                self.root.after(0, lambda: Toast.show(self.root, "🎉 [階段二] 雷達 QA 審核完畢，最終字典已生成！"))


            self.append_history_log({
                "time": datetime.now().astimezone().strftime("%Y-%m-%d %H:%M:%S %z"),
                "targets": "、".join(snapshot.get("active_targets", [])) or "全量",
                "account": api_res["actual_account"],
                "model": api_res["actual_model"],
                "elapsed": f"{api_res['elapsed_time']}s",
                "status": "QA通過" if not is_meltdown else "外來熔斷",
                "sentinel": "待存檔檢核"
            })


            return result
        except Exception as e:
            err_msg = str(e)
            banner_msg = f"❌ [階段二 失敗] 調用端點發生異常：{err_msg}"
            self._show_alert_banner(banner_msg)
            self.root.after(0, lambda: self._update_text_box(self.txt_stage2, f"❌ 執行失敗:\n{err_msg}"))
            self.root.after(0, lambda: Toast.show(self.root, f"❌ 階段二失敗: {err_msg}", duration=3000, bg="#ef4444", fg="#ffffff"))
            self.update_status("❌ 雷達 QA 審核失敗", fg_color="#dc2626")
            return None


    def run_auto_pipeline(self):
        if self.is_running:
            return


        self._warn_unsaved_path_diffs()


        try:
            snapshot = self.create_task_snapshot()
        except Exception as e:
            err_text = f"任務初始化失敗：{str(e)}"
            self._show_alert_banner(f"❌ {err_text}")
            Toast.show(self.root, f"❌ {err_text}", duration=3500, bg="#ef4444", fg="#ffffff")
            self.update_status(f"❌ {err_text}", fg_color="#dc2626")
            return


        if not snapshot["log_content"]:
            Toast.show(self.root, "⚠️ 請先貼上或拖入日誌內容！", bg="#f59e0b", fg="#000000")
            return


        if self.check_and_block_alien_targets(snapshot):
            return


        self.last_task_snapshot = snapshot
        self.set_ui_locked(True)


        self.txt_stage1.delete("1.0", tk.END)
        self.txt_stage2.delete("1.0", tk.END)
        self.reset_preview_headers()


        target_info = f"【{'、'.join(snapshot['active_targets'])}】" if snapshot['active_targets'] else ""
        slice_info = " (微創切片)" if snapshot.get("is_sliced", False) else ""
        first_acc = snapshot["candidate_profiles"][0]["name"] if snapshot["candidate_profiles"] else "預設帳號"
        self._start_stopwatch("⏳ 雷達工程師提案中 (Stage 1)", f"[{first_acc}]{target_info}{slice_info}")


        def _pipeline(snap: dict):
            try:
                s1_res = self._exec_stage1(snap)


                if not s1_res or s1_res.startswith("❌ 執行失敗"):
                    return
                if "🚨【架構阻斷：偵測到非本字典之外來目標字】" in s1_res:
                    return


                self._stop_stopwatch()
                self._start_stopwatch("⏳ 雷達 QA 審核中 (Stage 2)", f"[{first_acc}]{target_info}{slice_info}")
                self._exec_stage2(snap, s1_res)
            finally:
                self._stop_stopwatch()
                self.set_ui_locked(False)


        threading.Thread(target=_pipeline, args=(snapshot,), daemon=True).start()


    def _update_text_box(self, widget, text):
        widget.delete("1.0", tk.END)
        widget.insert(tk.END, text)


    # -----------------------------------------------------------------------
    # PCRE2 轉譯預檢 (括號狀態機 + 回溯控制動詞安全置換 + 致命黑名單)
    # -----------------------------------------------------------------------
    @staticmethod
    def validate_pcre_syntax(cleaned_extracted: str) -> tuple[bool, str]:
        """
        四道防線語法驗證：
        1. 括號狀態機掃描：排除轉義符與字元類 [...] 內部括號，攔截未配對或提前閉合之 ( / )
        2. Unicode 大括號十六進位轉譯
        3. PCRE2 回溯/引擎控制動詞安全置換為 (?:) (保留轉義序列與字元類原義)
        4. Python re 試編譯 + 7 項致命錯誤黑名單裁決 (放行 \\p{Han}、\\K 等專屬語法)
        """
        pcre2_verb_pattern = re.compile(
            r'(\\.|\[(?:\\.|[^\]])*\])|(\(\*(?:SKIP|FAIL|F|PRUNE|COMMIT|THEN|ACCEPT|UTF8?|UCP|CR|LF|CRLF|ANYCRLF|ANY|BSR_ANYCRLF|BSR_UNICODE|NO_AUTO_POSSESS|NO_START_OPT)(?::[^)]*)?\))'
        )
        fatal_blacklist = [
            "unterminated subpattern",
            "unbalanced parenthesis",
            "unterminated character set",
            "nothing to repeat",
            "bad escape (end of pattern)",
            "min repeat greater than max repeat",
            "bad character range"
        ]


        for line in cleaned_extracted.splitlines():
            line_s = line.strip()
            if not line_s or line_s.startswith(";"):
                continue


            # 第一防線：狀態機括號對稱掃描
            open_parens = 0
            in_class = False
            is_escaped = False


            for char in line_s:
                if is_escaped:
                    is_escaped = False
                    continue
                if char == '\\':
                    is_escaped = True
                    continue
                if not in_class and char == '[':
                    in_class = True
                    continue
                if in_class and char == ']':
                    in_class = False
                    continue
                if not in_class:
                    if char == '(':
                        open_parens += 1
                    elif char == ')':
                        open_parens -= 1
                        if open_parens < 0:
                            return False, f"括號閉合次序錯誤 (未配對先閉合)：{line_s[:40]}"


            if open_parens != 0:
                return False, f"括號數量不對稱 (未完整閉合)：{line_s[:40]}"


            # 第二防線：Unicode 大括號十六進位轉譯
            transpiled = re.sub(
                r'\\x\{([0-9a-fA-F]+)\}',
                lambda m: f"\\u{int(m.group(1), 16):04x}" if len(m.group(1)) <= 4 else f"\\U{int(m.group(1), 16):08x}",
                line_s
            )


            # 第三防線：PCRE2 回溯控制動詞安全預替換 (保護轉義序列與字元類)
            transpiled = pcre2_verb_pattern.sub(
                lambda m: m.group(1) if m.group(1) is not None else "(?:)",
                transpiled
            )


            # 第四防線：Python re.compile 試編譯 + 致命錯誤黑名單裁決
            try:
                re.compile(transpiled)
            except re.error as e:
                err_text = str(e)
                if any(token in err_text for token in fatal_blacklist):
                    return False, f"正則編譯失敗: {err_text} (條目: {line_s[:30]})"
                continue


        return True, ""


    @classmethod
    def stitch_and_deduplicate(cls, raw_full_dict: str, new_blocks_map: dict[str, str], active_targets: list[str]) -> str:
        matches = list(cls.ENTRY_BLOCK_REGEX.finditer(raw_full_dict))


        target_positions = {}
        for idx, m in enumerate(matches):
            t_key = m.group(1).strip()
            if t_key:
                target_positions.setdefault(t_key, []).append((idx, m))


        stitched = raw_full_dict
        for m in reversed(matches):
            t_key = m.group(1).strip()
            if t_key in active_targets and t_key in new_blocks_map:
                positions = target_positions.get(t_key, [])
                first_match_idx = positions[0][0]
                current_match_idx = [p[0] for p in positions if p[1] == m][0]


                if current_match_idx == first_match_idx:
                    is_at_end = (m.end() >= len(stitched))
                    new_block_str = new_blocks_map[t_key].strip()
                    suffix = "\n" if is_at_end else "\n\n"
                    replacement = new_block_str + suffix
                    stitched = stitched[:m.start()] + replacement + stitched[m.end():]
                else:
                    stitched = stitched[:m.start()] + stitched[m.end():]


        return stitched.strip("\r\n") + "\n"


    # -----------------------------------------------------------------------
    # 核心安全存檔：動態重讀組態、微創手術刀、衝突哨兵預檢與雙重原子覆寫
    # -----------------------------------------------------------------------
    def save_and_backup_dict(self):
        if self.is_running:
            Toast.show(self.root, "⚠️ AI 任務執行中，請稍候再進行存檔！", bg="#f59e0b", fg="#000000")
            return


        if not self.last_task_snapshot:
            Toast.show(self.root, "⚠️ 尚未執行任何 AI 優化任務，無快照可比對存檔！", duration=2500, bg="#f59e0b", fg="#000000")
            self.update_status("❌ 存檔失敗：無任務快照記錄", fg_color="#dc2626")
            return


        if self.last_task_snapshot["dict_choice"] == "none":
            Toast.show(self.root, "⚠️ 最近執行的任務為「不附帶字典檔」，無法覆蓋寫入！", duration=2500, bg="#f59e0b", fg="#000000")
            self.update_status("❌ 存檔失敗：任務未關聯目標字典", fg_color="#dc2626")
            return


        current_choice = self.selected_dict_for_ai.get()
        if current_choice != self.last_task_snapshot["dict_choice"]:
            msg = "❌ 寫入阻斷：偵測到對照字典已切換！存檔目標與優化任務不符，已中止覆蓋。"
            Toast.show(self.root, msg, duration=3500, bg="#ef4444", fg="#ffffff")
            self._show_alert_banner("❌ 存檔目標漂移：目前選定字典與任務快照不符，禁止覆蓋！")
            self.update_status("❌ 存檔失敗：對照目標與優化快照不一致", fg_color="#dc2626")
            return


        # 存檔前重讀磁碟 config.json 並僅選擇性同步 6 鍵 (BL-new-01)
        latest_cfg = self.load_config()
        self._warn_unsaved_path_diffs(latest_cfg)
        for sync_key in (
            "dict_path_1",
            "dict_path_2",
            "radar_engineer_prompt_path",
            "radar_qa_prompt_path",
            "sentinel_script_path",
            "enable_collision_sentinel",
        ):
            self.config[sync_key] = latest_cfg[sync_key]


        target_key = "dict_path_1" if current_choice == "dict1" else "dict_path_2"
        target_path = self._norm_path_or_empty(latest_cfg.get(target_key, ""))
        dict_label = self.last_task_snapshot["dict_label"]


        qa_output = self.txt_stage2.get("1.0", tk.END)


        if "🚨【架構阻斷：偵測到非本字典之外來目標字】" in qa_output:
            self.set_save_btn_alert(True)
            self._show_alert_banner("🚨 AI 觸發外來字架構熔斷：模型回傳非本字典目標字，已拒絕寫入磁碟！")
            Toast.show(self.root, "❌ 寫入阻斷：QA 輸出包含外來字架構阻斷標記，禁止寫入磁碟！", duration=3500, bg="#ef4444", fg="#ffffff")
            self.update_status("❌ 存檔失敗：AI 偵測到外來目標字熔斷", fg_color="#dc2626")
            return


        anchor_count = qa_output.count(self.ANCHOR_TEXT)
        if anchor_count != 1:
            err = "缺少開頭錨點" if anchor_count == 0 else "開頭錨點不唯一"
            self._show_alert_banner(f"❌ 存檔阻斷：{err} ({self.ANCHOR_TEXT})")
            Toast.show(self.root, f"❌ 寫入阻斷：{err}！", duration=3000, bg="#ef4444", fg="#ffffff")
            self.update_status(f"❌ 存檔失敗：{err}", fg_color="#dc2626")
            return


        eof_count = qa_output.count(self.EOF_MARKER)
        if eof_count != 1:
            err = "缺少 EOF 結尾標記 (輸出不完整)" if eof_count == 0 else "結尾標記不唯一"
            self._show_alert_banner(f"❌ 存檔阻斷：{err} ({self.EOF_MARKER})")
            Toast.show(self.root, f"❌ 寫入阻斷：{err}！", duration=3500, bg="#ef4444", fg="#ffffff")
            self.update_status(f"❌ 存檔失敗：{err}", fg_color="#dc2626")
            return


        expected_hash = self.last_task_snapshot.get("s2_hash")
        if not expected_hash:
            Toast.show(self.root, "❌ 寫入阻斷：尚未完成階段二 QA 審核，無有效字典印章！", duration=3000, bg="#ef4444", fg="#ffffff")
            self.update_status("❌ 存檔失敗：缺少 QA 審核印章", fg_color="#dc2626")
            return


        current_hash = hashlib.sha256(qa_output.strip().encode("utf-8")).hexdigest()
        if current_hash != expected_hash:
            self._show_alert_banner("❌ 存檔阻斷：預覽框內容已被手動篡改或非本輪生成 (數位印章不符)！")
            Toast.show(self.root, "❌ 寫入阻斷：預覽框內容已被修改（數位印章不符）！已終止覆蓋。", duration=3500, bg="#ef4444", fg="#ffffff")
            self.update_status("❌ 存檔失敗：內容數位印章比對失敗", fg_color="#dc2626")
            return


        try:
            content_after_anchor = qa_output.split(self.ANCHOR_TEXT, 1)[1]
            raw_dict_content = content_after_anchor.split(self.EOF_MARKER, 1)[0]
        except Exception as e:
            Toast.show(self.root, f"❌ 錨點內容擷取解析失敗: {str(e)}", duration=3000, bg="#ef4444", fg="#ffffff")
            self.update_status("❌ 存檔失敗：內容擷取解析錯誤", fg_color="#dc2626")
            return


        cleaned_extracted = raw_dict_content.strip("\r\n")


        if "```" in cleaned_extracted:
            self._show_alert_banner("❌ 存檔阻斷：QA 輸出殘留 Markdown 代碼塊標記 (```)，拒絕覆寫！")
            Toast.show(self.root, "❌ 寫入阻斷：QA 輸出中殘留 Markdown 代碼塊標記 (```)！已終止覆蓋以防壞檔。", duration=3500, bg="#ef4444", fg="#ffffff")
            self.update_status("❌ 存檔失敗：輸出殘留代碼塊標記", fg_color="#dc2626")
            return


        if not cleaned_extracted.strip():
            Toast.show(self.root, "❌ 寫入阻斷：擷取之字典內容為空！", duration=3000, bg="#ef4444", fg="#ffffff")
            self.update_status("❌ 存檔失敗：擷取字典為空", fg_color="#dc2626")
            return


        pcre_ok, pcre_err = self.validate_pcre_syntax(cleaned_extracted)
        if not pcre_ok:
            self._show_alert_banner(f"❌ 正則語法預檢失敗 (Linter Gate)：{pcre_err}")
            Toast.show(self.root, f"❌ 寫入阻斷：正則語法預檢失敗！\n{pcre_err}", duration=3500, bg="#ef4444", fg="#ffffff")
            self.update_status("❌ 存檔失敗：正則語法損壞", fg_color="#dc2626")
            return


        if not target_path or not os.path.isfile(target_path):
            err_missing = f"找不到目標【{dict_label}】實體檔案：{target_path or '(路徑為空)'}，請至設定頁修正路徑並儲存後重試存檔！"
            self._show_alert_banner(f"❌ 存檔阻斷：{err_missing}")
            Toast.show(self.root, f"❌ {err_missing}", duration=3500, bg="#ef4444", fg="#ffffff")
            self.update_status("❌ 存檔失敗：目標檔案不存在（快照已保留供重試）", fg_color="#dc2626")
            return


        if current_choice in ("dict1", "dict2") and not self.last_task_snapshot.get("dict_content", "").strip():
            self._show_alert_banner("❌ 存檔阻斷：本次任務快照無原始字典上下文，請重新執行優化後再存檔！")
            Toast.show(self.root, "❌ 寫入阻斷：任務快照無原始字典上下文，請重新執行優化！", duration=3500, bg="#ef4444", fg="#ffffff")
            self.update_status("❌ 存檔失敗：缺乏原始字典快照", fg_color="#dc2626")
            return


        is_sliced = self.last_task_snapshot.get("is_sliced", False)
        active_targets = self.last_task_snapshot.get("active_targets", [])


        if is_sliced and active_targets:
            try:
                _, new_blocks_map = self.parse_dict_blocks(cleaned_extracted)
                missing_targets = [t for t in active_targets if t not in new_blocks_map]
                if missing_targets:
                    missing_str = "、".join(missing_targets)
                    self._show_alert_banner(f"❌ 縫合阻斷：QA 輸出缺少已鎖定之目標字條目：{missing_str}！")
                    Toast.show(self.root, f"❌ 縫合阻斷：QA 輸出缺少已鎖定之目標字條目：{missing_str}！", duration=3500, bg="#ef4444", fg="#ffffff")
                    self.update_status(f"❌ 存檔失敗：QA 結果缺少條目 {missing_str}", fg_color="#dc2626")
                    return


                raw_full_dict = self.read_file_text_multiformat(target_path)
                _, disk_blocks_map = self.parse_dict_blocks(raw_full_dict)
                missing_in_disk = [t for t in active_targets if t not in disk_blocks_map]
                if missing_in_disk:
                    missing_disk_str = "、".join(missing_in_disk)
                    self._show_alert_banner(
                        f"❌ 縫合阻斷：磁碟目標字典檔中找不到本次優化標的：{missing_disk_str}！"
                        "請確認設定頁目標字典路徑是否正確，修正儲存後可重試存檔。"
                    )
                    Toast.show(
                        self.root,
                        f"❌ 縫合阻斷：磁碟字典缺少條目：{missing_disk_str}\n請確認路徑無誤後重試存檔（快照已保留）。",
                        duration=3500, bg="#ef4444", fg="#ffffff"
                    )
                    self.update_status(f"❌ 存檔失敗：磁碟字典缺少條目 {missing_disk_str}", fg_color="#dc2626")
                    return


                final_dict_content = self.stitch_and_deduplicate(raw_full_dict, new_blocks_map, active_targets)
                targets_str = "、".join(active_targets)
            except Exception as e:
                Toast.show(self.root, f"❌ 記憶體微創縫合失敗: {str(e)}", duration=3000, bg="#ef4444", fg="#ffffff")
                self.update_status("❌ 存檔失敗：記憶體縫合運算異常", fg_color="#dc2626")
                return
        else:
            final_dict_content = cleaned_extracted + "\n"
            targets_str = "全量條目"


        if self.ANCHOR_TEXT in final_dict_content or self.EOF_MARKER in final_dict_content:
            Toast.show(self.root, "❌ 寫入阻斷：字典內容包含錨點標記！", duration=3000, bg="#ef4444", fg="#ffffff")
            self.update_status("❌ 存檔失敗：字典內含未清除錨點", fg_color="#dc2626")
            return


        if "```" in final_dict_content:
            Toast.show(self.root, "❌ 寫入阻斷：縫合後仍殘留代碼圍欄！", duration=3000, bg="#ef4444", fg="#ffffff")
            self.update_status("❌ 存檔失敗：殘留代碼標記", fg_color="#dc2626")
            return


        # -------------------------------------------------------------------
        # 哨兵記憶體預檢 (同步取自已儲存之 config.json)
        # -------------------------------------------------------------------
        sentinel_pass_label = "跳過/無哨兵"
        if bool(self.config.get("enable_collision_sentinel", True)):
            sentinel_path = self._norm_path_or_empty(self.config.get("sentinel_script_path", ""))
            if sentinel_path and os.path.exists(sentinel_path):
                self.update_status("🛡️ 正在執行哨兵語意對沖預檢 (Pre-Commit Gate)...", fg_color="#2563eb")
                dry_tmp_path = target_path + ".sentinel_dryrun.tmp"
                norm_d1 = self._norm_path_or_empty(latest_cfg.get("dict_path_1", ""))
                norm_d2 = self._norm_path_or_empty(latest_cfg.get("dict_path_2", ""))
                other_dict_path = norm_d2 if target_path == norm_d1 else norm_d1


                try:
                    with open(dry_tmp_path, "w", encoding="utf-8-sig", newline="") as f:
                        f.write(final_dict_content)
                        f.flush()


                    cmd = [sys.executable, sentinel_path, "--cli-check", dry_tmp_path]
                    if other_dict_path and os.path.exists(other_dict_path):
                        cmd.append(other_dict_path)


                    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=5)
                    stdout_txt = proc.stdout.strip()


                    is_collision = (
                        "🚨 檢測到致命語意對沖" in stdout_txt or
                        (proc.returncode != 0 and any(k in stdout_txt for k in ["語意對沖", "衝突對沖"]))
                    )


                    if is_collision:
                        self.set_save_btn_alert(True)
                        first_err_line = stdout_txt.splitlines()[0] if stdout_txt else "正則語意致命衝突"
                        banner_msg = f"🚨 存檔遭哨兵阻斷！檢測到致命語意對沖：{first_err_line}！正式字典已物理保護 (磁碟 0 污染)。"
                        self._show_alert_banner(banner_msg, show_sentinel=True)


                        Toast.show(
                            self.root,
                            "❌ 存檔遭衝突哨兵阻斷！\n檢測到新規則與現有字典發生對沖！\n磁碟檔案未修改，請點擊橫幅搶救。",
                            duration=3500,
                            bg="#dc2626",
                            fg="#ffffff"
                        )
                        self.update_status("❌ 存檔遭哨兵阻斷：檢測到正則語意對沖！", fg_color="#dc2626")


                        self.append_history_log({
                            "time": datetime.now().astimezone().strftime("%Y-%m-%d %H:%M:%S %z"),
                            "targets": targets_str,
                            "account": "-",
                            "model": "-",
                            "elapsed": "0s",
                            "status": "❌ 哨兵阻斷",
                            "sentinel": "🛑 衝突對沖"
                        })
                        return
                    elif proc.returncode != 0:
                        self.update_status("⚠️ 哨兵腳本執行異常，平滑降級放行正式存檔...", fg_color="#d97706")
                        sentinel_pass_label = "⚠️ 哨兵異常放行"
                    else:
                        sentinel_pass_label = "🟢 哨兵通過"


                except subprocess.TimeoutExpired:
                    self.update_status("⚠️ 哨兵檢測逾時，平滑降級放行常規存檔...", fg_color="#d97706")
                    sentinel_pass_label = "⚠️ 哨兵逾時放行"
                except Exception as e:
                    self.update_status(f"⚠️ 哨兵調用異常 ({str(e)[:20]})，平滑降級放行...", fg_color="#d97706")
                    sentinel_pass_label = "⚠️ 哨兵降級"
                finally:
                    if os.path.exists(dry_tmp_path):
                        try:
                            os.remove(dry_tmp_path)
                        except Exception:
                            pass


        # 雙保險 Copy-on-Write 備份 (同秒撞名防護) 與原子覆寫 (flush + os.fsync + os.replace)
        tmp_file_path = target_path + ".tmp"
        try:
            os.makedirs(TOOL_BAK_DIR, exist_ok=True)
            dict_filename = os.path.basename(target_path)
            name_no_ext, _ = os.path.splitext(dict_filename)


            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            bak_filename = f"{timestamp}_{name_no_ext}.bak"
            bak_file_path = os.path.normpath(os.path.join(TOOL_BAK_DIR, bak_filename))
            if os.path.exists(bak_file_path):
                bak_filename = f"{timestamp}_{os.urandom(2).hex()}_{name_no_ext}.bak"
                bak_file_path = os.path.normpath(os.path.join(TOOL_BAK_DIR, bak_filename))


            shutil.copy2(target_path, bak_file_path)


            with open(tmp_file_path, "w", encoding="utf-8-sig", newline="") as f:
                f.write(final_dict_content)
                f.flush()
                os.fsync(f.fileno())


            os.replace(tmp_file_path, target_path)


            self.set_save_btn_alert(False)
            self._hide_alert_banner()


            if is_sliced:
                success_msg = f"💾 【{dict_label}】局部手術更新【{targets_str}】成功並安全備份！"
                toast_msg = f"✅ 舊檔已備份至 bak\\{bak_filename}\n並成功微創縫合更新【{dict_label}】之【{targets_str}】條目！"
            else:
                success_msg = f"💾 【{dict_label}】全量備份並更新成功！"
                toast_msg = f"✅ 舊檔已備份至 bak\\{bak_filename}\n並成功寫入更新【{dict_label}】！"


            Toast.show(self.root, toast_msg, duration=2600, bg="#10b981", fg="#ffffff")
            self.update_status(success_msg, fg_color="#10b981")


            self.append_history_log({
                "time": datetime.now().astimezone().strftime("%Y-%m-%d %H:%M:%S %z"),
                "targets": targets_str,
                "account": "-",
                "model": "-",
                "elapsed": "0s",
                "status": "存檔成功",
                "sentinel": sentinel_pass_label
            })
        except Exception as e:
            self._show_alert_banner(f"❌ 磁碟原子覆寫失敗：{str(e)}")
            Toast.show(self.root, f"❌ 備份或存檔失敗: {str(e)}", duration=3000, bg="#ef4444", fg="#ffffff")
            self.update_status(f"❌ 存檔失敗: {str(e)[:40]}", fg_color="#dc2626")
        finally:
            if os.path.exists(tmp_file_path):
                try:
                    os.remove(tmp_file_path)
                except Exception:
                    pass


    def copy_qa_result(self):
        qa_output = self.txt_stage2.get("1.0", tk.END).strip()
        if not qa_output:
            Toast.show(self.root, "⚠️ QA 最終字典內容為空！", bg="#f59e0b", fg="#000000")
            return


        try:
            self.root.clipboard_clear()
            self.root.clipboard_append(qa_output)
            Toast.show(self.root, "📋 QA 最終字典內容已成功複製至剪貼簿！")
        except Exception:
            Toast.show(self.root, "⚠️ 剪貼簿正被其他程式鎖定，複製失敗，請重試！", duration=2500, bg="#f59e0b", fg="#000000")


# ---------------------------------------------------------------------------
# 主程式啟動入口
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    if HAS_DND:
        root = TkinterDnD.Tk()
    else:
        root = tk.Tk()


    style = ttk.Style()
    if "vista" in style.theme_names():
        style.theme_use("vista")
    elif "clam" in style.theme_names():
        style.theme_use("clam")


    app = RadarRegexToolApp(root)
    root.mainloop()
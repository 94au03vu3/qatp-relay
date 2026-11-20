# -*- coding: utf-8 -*-
import os
import sys
sys.setrecursionlimit(5000)


# 頂層版本號規範宣告 (AC-01: 於前 10 行內明確宣告)
__version__ = "1.5.6"


import copy
import json
import re
import shutil
import subprocess
import threading
import time
import random
import hashlib
from datetime import datetime
from collections import OrderedDict
import tkinter as tk
from tkinter import ttk, scrolledtext, filedialog


# ---------------------------------------------------------------------------
# 0. 取得工具腳本所在的絕對路徑與 bak / relay_exports 資料夾路徑
# ---------------------------------------------------------------------------
if getattr(sys, 'frozen', False):
    SCRIPT_DIR = os.path.dirname(sys.executable)
else:
    SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))


# 固定的 bak 備份目錄與外部接力匯出目錄 (位於工具同級目錄)
TOOL_BAK_DIR = os.path.join(SCRIPT_DIR, "bak")
RELAY_EXPORT_DIR = os.path.join(SCRIPT_DIR, "relay_exports")


# ---------------------------------------------------------------------------
# 1. 嘗試導入 Gemini 官方 SDK (google-genai 或 google-generativeai)
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
# 策略圖解文字規格庫 (Strategy Descriptions - v1.5.5+ 單帳號防風控版)
# ---------------------------------------------------------------------------
DISPATCH_DESCRIPTIONS = {
    "locked": (
        "🔒【單帳號單選鎖定 (2026-11 防風控唯一合規)】\n"
        "• 調度邏輯：嚴格僅使用頂部「作用中帳號」目前選定的單一帳號發送請求，背景絕不自動跳轉其他帳號。\n"
        "• ⚠️ 2026-11 防風控規範：同 IP 禁止自動跨多 Free Key 輪詢；建議單帳號階梯降階，其餘帳號槽位僅供手動切換備用。"
    ),
    "random": (
        "🎲【隨機均攤 (已降級為單帳號生效)】\n"
        "• 調度邏輯：為符合防風控規範，已徹底下線多 Key 自動輪詢；目前與「單帳號單選鎖定」相同，僅鎖定單一帳號執行。\n"
        "• ⚠️ 2026-11 防風控規範：同 IP 禁止自動跨多 Free Key 輪詢；建議單帳號階梯降階。"
    ),
    "round_robin": (
        "🔄【依序輪動 (已降級為單帳號生效)】\n"
        "• 調度邏輯：為符合防風控規範，已徹底下線多 Key 自動輪詢；目前與「單帳號單選鎖定」相同，僅鎖定單一帳號執行。\n"
        "• ⚠️ 2026-11 防風控規範：同 IP 禁止自動跨多 Free Key 輪詢；建議單帳號階梯降階。"
    )
}


RETRY_ROUTE_DESCRIPTIONS = {
    "vertical_first": (
        "🛡️【單帳號垂直降階優先：3.8 ➔ 冷卻180s ➔ 3.6 ➔ 冷卻180s ➔ 3.5-lite (推薦)】\n"
        "• 流程：在鎖定之單一帳號內依序穿透主力與備援模型；單階梯預設僅試 1 次，遇暫態 503/RPM 限流先長冷卻 (預設 180s) 後降階。\n"
        "• ⚠️ 2026-11 防風控規範：同 IP 禁止自動跨多 Free Key 輪詢；建議單帳號階梯降階，不作高頻重複轟炸。"
    ),
    "quality_locked": (
        "🚀【品質優先不降：鎖定主模型，失敗長退避】\n"
        "• 流程：僅於鎖定之單一帳號內嘗試主要模型 (嚴禁切換備援模型)，若設定次數 > 1 則以長週期退避等待後重試。\n"
        "• ⚠️ 2026-11 防風控規範：同 IP 禁止自動跨多 Free Key 輪詢；單帳號單模型直球對決以確保極致正則品質。"
    ),
    "horizontal_first": (
        "⚡【橫向擴展 (已收斂為單帳號主模型)】\n"
        "• 流程：因同 IP 跨帳號自動秒切已下線，本路線已收斂為僅於單一鎖定帳號嘗試主要模型。\n"
        "• ⚠️ 2026-11 防風控規範：同 IP 禁止自動跨多 Free Key 輪詢；建議單帳號階梯降階 (vertical_first)。"
    )
}


# ---------------------------------------------------------------------------
# 2. Toast 吐司通知類別 (無阻塞、自動消失浮圖)
# ---------------------------------------------------------------------------
class Toast:
    @staticmethod
    def show(root, message, duration=1500, bg="#1e1e2e", fg="#ffffff", y_offset=0):
        """在 UI 視窗下方彈出非阻塞式的 Toast 訊息浮圖"""
        try:
            if not root or not root.winfo_exists():
                return
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
                pady=8
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
            y = ry + rh - th - 60 - y_offset
            top.geometry(f"+{x}+{y}")


            root.after(duration, lambda: top.destroy() if top.winfo_exists() else None)
        except Exception:
            pass


# ---------------------------------------------------------------------------
# 3. 主應用程式 GUI 類別 (v1.5.6 API雙軌自動優先 ⇄ 純離線網頁接力救援雙軌並存版)
# ---------------------------------------------------------------------------
class NovelRegexToolApp:
    CONFIG_FILE = os.path.join(SCRIPT_DIR, "config.json")
    ANCHOR_TEXT = "=== 以下為優化後之完整正則修復條目 ==="
    EOF_MARKER = "=== 字典全檔輸出結束 [EOF] ==="


    PRESET_MODELS = [
        "gemini-4-hydrogen",
        "gemini-3.8-flash",
        "gemini-3.6-flash",
        "gemini-3.5-flash-lite",
        "gemini-3.1-flash-lite"
    ]


    DEFAULT_PROFILES = [
        {"name": "帳號 1 (預設主帳)", "key": "", "note": "主金鑰"},
        {"name": "帳號 2 (備用帳號 1)", "key": "", "note": "備援金鑰 1"},
        {"name": "帳號 3 (備用帳號 2)", "key": "", "note": "備援金鑰 2"}
    ]


    DEFAULT_CONFIG = {
        "api_profiles": [
            {"name": "帳號 1 (預設主帳)", "key": "", "note": "主金鑰"},
            {"name": "帳號 2 (備用帳號 1)", "key": "", "note": "備援金鑰 1"},
            {"name": "帳號 3 (備用帳號 2)", "key": "", "note": "備援金鑰 2"}
        ],
        "account_dispatch_mode": "locked",
        "retry_route_policy": "vertical_first",
        "locked_account_index": 0,
        "gemini_model": "gemini-3.8-flash",
        "fallback_model_1": "gemini-3.6-flash",
        "fallback_model_2": "gemini-3.5-flash-lite",
        "max_retries": 1,
        "base_delay_seconds": 180.0,
        "request_timeout_seconds": 300.0,
        "enable_fallback": True,
        "swap_bottom_bar": False,
        "enable_click_to_copy": False,
        "enable_clear_and_paste": False,
        "repair_dict_path": r"E:\備份\Desktop\Node.js\JS專案腳本\小說繁化轉換\本地正則修復\嚴格正則修復字典.txt",
        "engineer_prompt_path": r"E:\備份\Desktop\Node.js\JS專案腳本\小說繁化轉換\本地正則修復\字典工程師專用維護提示詞.txt",
        "qa_prompt_path": r"E:\備份\Desktop\Node.js\JS專案腳本\小說繁化轉換\本地正則修復\字典維護QA提示詞.txt",
        "api_key": ""
    }


    def __init__(self, root):
        self.root = root
        self.root.title(f"本地正則修復維護工具 v{__version__}")
        self.root.geometry("1200x950")
        self.root.minsize(1000, 750)


        self.default_font = ("Microsoft YaHei UI", 9)
        self.bold_font = ("Microsoft YaHei UI", 9, "bold")


        # 實例狀態與互斥旗標
        self.is_running = False
        self.last_task_snapshot = None
        self.rr_counter = 0  # 依序輪動計數器 (保留實例屬性相容性)


        # 碼錶世代隔離相關實例屬性
        self.stopwatch_running = False
        self.stopwatch_start_time = 0.0
        self.stopwatch_prefix = ""
        self.stopwatch_detail = ""
        self.stopwatch_token = 0
        self.stopwatch_after_id = None
        self.heartbeat_active = False


        # 載入設定
        self.config = self.load_config()


        # UI 狀態變數綁定
        self.var_click_to_copy = tk.BooleanVar(value=bool(self.config.get("enable_click_to_copy", False)))
        self.var_clear_and_paste = tk.BooleanVar(value=bool(self.config.get("enable_clear_and_paste", False)))
        self.var_swap_bottom_bar = tk.BooleanVar(value=bool(self.config.get("swap_bottom_bar", False)))
        self.var_enable_fallback = tk.BooleanVar(value=bool(self.config.get("enable_fallback", True)))


        # 關窗生命週期防護
        self.root.protocol("WM_DELETE_WINDOW", self._on_closing)


        # UI 建構 (順序：頂部控制列 -> 固化常駐告警橫幅 -> 主分頁 Notebook)
        self.build_top_bar()
        self.build_alert_banner()
        self.build_notebook()


    def _on_closing(self):
        self.is_running = False
        self._stop_stopwatch()
        try:
            self.root.destroy()
        except Exception:
            pass


    # -----------------------------------------------------------------------
    # 路徑正規化輔助規則
    # -----------------------------------------------------------------------
    @staticmethod
    def _norm_path_or_empty(path_str) -> str:
        s = str(path_str or "").strip()
        if not s:
            return ""
        return os.path.normpath(s)


    # -----------------------------------------------------------------------
    # 碼錶控制器演算法 (stopwatch_token 世代隔離 + 主線程 after(0) 序列化)
    # -----------------------------------------------------------------------
    def _format_stopwatch_text(self, elapsed: int) -> str:
        base = f"{self.stopwatch_prefix} (已耗時: {elapsed}s)"
        if self.stopwatch_detail:
            return f"{base} | {self.stopwatch_detail}"
        return base


    def _start_stopwatch(self, desc_prefix: str, detail_info: str = ""):
        self.stopwatch_token += 1
        my_token = self.stopwatch_token
        self.stopwatch_running = True
        self.stopwatch_start_time = time.time()
        self.stopwatch_prefix = desc_prefix
        self.stopwatch_detail = detail_info
        self.heartbeat_active = False


        def _init_on_main():
            try:
                if not self.root.winfo_exists():
                    return
                if not self.stopwatch_running or my_token != self.stopwatch_token:
                    return
                if self.stopwatch_after_id is not None:
                    try:
                        self.root.after_cancel(self.stopwatch_after_id)
                    except Exception:
                        pass
                    self.stopwatch_after_id = None
                if self.lbl_status.winfo_exists():
                    self.lbl_status.config(text=self._format_stopwatch_text(0), fg="#2563eb")
                self.stopwatch_after_id = self.root.after(1000, lambda t=my_token: self._stopwatch_tick(t))
            except tk.TclError:
                pass
            except Exception:
                pass


        try:
            if self.root.winfo_exists():
                self.root.after(0, _init_on_main)
        except tk.TclError:
            pass


    def _stopwatch_tick(self, my_token: int):
        try:
            if not self.root.winfo_exists():
                return
            if not self.stopwatch_running or my_token != self.stopwatch_token:
                return
            if not self.heartbeat_active and self.lbl_status.winfo_exists():
                elapsed = int(time.time() - self.stopwatch_start_time)
                self.lbl_status.config(text=self._format_stopwatch_text(elapsed), fg="#2563eb")
            if self.stopwatch_running and my_token == self.stopwatch_token:
                self.stopwatch_after_id = self.root.after(1000, lambda t=my_token: self._stopwatch_tick(t))
        except tk.TclError:
            pass
        except Exception:
            pass


    def _stop_stopwatch(self):
        self.stopwatch_running = False
        self.stopwatch_token += 1
        self.heartbeat_active = False


        def _cancel_on_main():
            try:
                if not self.root.winfo_exists():
                    return
                if self.stopwatch_after_id is not None:
                    self.root.after_cancel(self.stopwatch_after_id)
                    self.stopwatch_after_id = None
            except tk.TclError:
                pass
            except Exception:
                self.stopwatch_after_id = None


        try:
            if self.root.winfo_exists():
                self.root.after(0, _cancel_on_main)
        except tk.TclError:
            pass


    # -----------------------------------------------------------------------
    # 退避心跳控制器演算法 (秒數前置可視化，徹底消除介面假死感)
    # -----------------------------------------------------------------------
    def _sleep_with_heartbeat(self, total_seconds: float, stage_name: str, model_name: str, attempt: int, max_retries: int, action_label: str = "即將重試"):
        rem = int(total_seconds)
        frac = total_seconds - rem
        self.heartbeat_active = True
        try:
            while rem > 0:
                if not self.is_running:
                    return
                self.update_status(
                    f"⏳ [{stage_name}] 退避倒數: {rem}s... {action_label} ({attempt}/{max_retries}) | 模型 {model_name} 繁忙",
                    fg_color="#d97706"
                )
                time.sleep(1.0)
                rem -= 1
            if frac > 0 and self.is_running:
                time.sleep(frac)
        finally:
            self.heartbeat_active = False


    # -----------------------------------------------------------------------
    # 設定檔讀寫 (config.json) - 18 鍵深層相容矩陣補全 + BOM 相容 + 原子置換
    # -----------------------------------------------------------------------
    def load_config(self):
        cfg = copy.deepcopy(self.DEFAULT_CONFIG)
        if os.path.exists(self.CONFIG_FILE):
            try:
                with open(self.CONFIG_FILE, "r", encoding="utf-8-sig") as f:
                    loaded = json.load(f)
                    if isinstance(loaded, dict):
                        for key in self.DEFAULT_CONFIG.keys():
                            if key in loaded:
                                cfg[key] = loaded[key]
            except Exception:
                pass


        # 相容舊版 api_key ➔ profiles[0]
        raw_profiles = cfg.get("api_profiles", [])
        profiles = []
        if isinstance(raw_profiles, list):
            for idx, item in enumerate(raw_profiles[:3]):
                default_p = self.DEFAULT_PROFILES[idx]
                if isinstance(item, dict):
                    profiles.append({
                        "name": str(item.get("name", default_p["name"]) or default_p["name"]).strip(),
                        "key": str(item.get("key", "") or "").strip(),
                        "note": str(item.get("note", default_p["note"]) or "")
                    })
                else:
                    profiles.append(copy.deepcopy(default_p))


        if not profiles:
            profiles = copy.deepcopy(self.DEFAULT_PROFILES)


        while len(profiles) < 3:
            idx = len(profiles)
            profiles.append(copy.deepcopy(self.DEFAULT_PROFILES[idx]))


        # 若舊版僅有 api_key 且 profiles[0].key 為空，自動同步
        legacy_key = str(cfg.get("api_key", "") or "").strip()
        if legacy_key and not profiles[0].get("key", "").strip():
            profiles[0]["key"] = legacy_key


        cfg["api_profiles"] = profiles[:3]
        cfg["api_key"] = profiles[0].get("key", "")


        # 驗證模式與模型枚舉合法性 (預設回退 locked / vertical_first)
        if cfg.get("account_dispatch_mode") not in ["random", "round_robin", "locked"]:
            cfg["account_dispatch_mode"] = "locked"
        if cfg.get("retry_route_policy") not in ["horizontal_first", "quality_locked", "vertical_first"]:
            cfg["retry_route_policy"] = "vertical_first"
        try:
            cfg["locked_account_index"] = max(0, min(2, int(cfg.get("locked_account_index", 0))))
        except Exception:
            cfg["locked_account_index"] = 0


        if not isinstance(cfg.get("gemini_model"), str) or not cfg.get("gemini_model", "").strip():
            cfg["gemini_model"] = "gemini-3.8-flash"
        else:
            cfg["gemini_model"] = cfg["gemini_model"].strip()


        if not isinstance(cfg.get("fallback_model_1"), str):
            cfg["fallback_model_1"] = "gemini-3.6-flash"
        else:
            cfg["fallback_model_1"] = cfg["fallback_model_1"].strip()


        if not isinstance(cfg.get("fallback_model_2"), str):
            cfg["fallback_model_2"] = "gemini-3.5-flash-lite"
        else:
            cfg["fallback_model_2"] = cfg["fallback_model_2"].strip()


        try:
            cfg["max_retries"] = max(1, min(5, int(cfg.get("max_retries", 1))))
        except Exception:
            cfg["max_retries"] = 1


        try:
            delay_val = float(cfg.get("base_delay_seconds", 180.0))
            cfg["base_delay_seconds"] = max(10.0, min(600.0, delay_val))
        except Exception:
            cfg["base_delay_seconds"] = 180.0


        try:
            timeout_val = float(cfg.get("request_timeout_seconds", 300.0))
            cfg["request_timeout_seconds"] = max(10.0, min(600.0, timeout_val))
        except Exception:
            cfg["request_timeout_seconds"] = 300.0


        for b_key, b_def in [
            ("enable_fallback", True),
            ("swap_bottom_bar", False),
            ("enable_click_to_copy", False),
            ("enable_clear_and_paste", False)
        ]:
            val = cfg.get(b_key, b_def)
            cfg[b_key] = bool(val) if isinstance(val, (bool, int)) else b_def


        for p_key in ("repair_dict_path", "engineer_prompt_path", "qa_prompt_path"):
            raw_p = cfg.get(p_key, "")
            cfg[p_key] = self._norm_path_or_empty(raw_p if isinstance(raw_p, str) else "")


        return cfg


    def save_config(self):
        cfg_dir = os.path.dirname(self.CONFIG_FILE) or SCRIPT_DIR
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        random_id = f"{random.randint(1000, 9999)}"
        temp_cfg_path = os.path.join(cfg_dir, f"{os.path.basename(self.CONFIG_FILE)}.tmp_{timestamp}_{random_id}")


        try:
            # 保持 profiles[0].key 與 api_key 雙向同步
            if self.config.get("api_profiles") and len(self.config["api_profiles"]) > 0:
                self.config["api_key"] = self.config["api_profiles"][0].get("key", "").strip()


            os.makedirs(cfg_dir, exist_ok=True)
            with open(temp_cfg_path, "w", encoding="utf-8", newline="\n") as f:
                json.dump(self.config, f, ensure_ascii=False, indent=2)
                f.write("\n")
                f.flush()
                os.fsync(f.fileno())


            os.replace(temp_cfg_path, self.CONFIG_FILE)
        except Exception as e:
            Toast.show(self.root, f"❌ 設定檔儲存失敗: {str(e)}", bg="#f38ba8", fg="#11111b")
        finally:
            if os.path.exists(temp_cfg_path):
                try:
                    os.remove(temp_cfg_path)
                except Exception:
                    pass


    def _warn_unsaved_path_diffs(self, reference_cfg: dict):
        """比對 Tab 2 路徑輸入框與磁碟/已儲存設定是否有未儲存差異"""
        try:
            if not (hasattr(self, "entry_dict_path") and hasattr(self, "entry_eng_path") and hasattr(self, "entry_qa_path")):
                return
            checks = [
                ("修復字典路徑", self.entry_dict_path.get(), reference_cfg.get("repair_dict_path", "")),
                ("工程師提示詞路徑", self.entry_eng_path.get(), reference_cfg.get("engineer_prompt_path", "")),
                ("QA 提示詞路徑", self.entry_qa_path.get(), reference_cfg.get("qa_prompt_path", ""))
            ]
            diffs = []
            for label, ui_val, cfg_val in checks:
                if self._norm_path_or_empty(ui_val) != self._norm_path_or_empty(cfg_val):
                    diffs.append(label)
            if diffs:
                Toast.show(
                    self.root,
                    f"⚠️ 偵測到設定頁「{', '.join(diffs)}」尚未點擊儲存！\n本次操作將以已儲存之 config.json 為準。",
                    duration=2800,
                    bg="#f59e0b",
                    fg="#000000"
                )
        except Exception:
            pass


    # -----------------------------------------------------------------------
    # UI Component 1: 頂部固定列 (支援手動切換鎖定帳號)
    # -----------------------------------------------------------------------
    def build_top_bar(self):
        self.top_frame = ttk.LabelFrame(self.root, text="🔑 Gemini API 帳號與模型設定 (單帳號鎖定模式)", padding=10)
        self.top_frame.pack(fill=tk.X, padx=10, pady=5)


        ttk.Label(self.top_frame, text="作用中帳號:").grid(row=0, column=0, sticky=tk.W, padx=5)


        self.account_combo = ttk.Combobox(self.top_frame, width=30, state="readonly")
        self.update_top_account_combo_values()
        self.account_combo.grid(row=0, column=1, padx=5, sticky=tk.W)
        self.account_combo.bind("<<ComboboxSelected>>", self.on_top_account_selected)


        ttk.Label(self.top_frame, text="模型名稱:").grid(row=0, column=2, sticky=tk.W, padx=(10, 5))


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


    # -----------------------------------------------------------------------
    # UI Component 1.5: 固化常駐告警橫幅容器及其生命週期狀態機 (含外部接力跳轉)
    # -----------------------------------------------------------------------
    def build_alert_banner(self):
        self.alert_banner = tk.Frame(
            self.root,
            bg="#fef2f2",
            highlightbackground="#f87171",
            highlightthickness=1
        )
        self.lbl_alert_msg = tk.Label(
            self.alert_banner,
            text="",
            bg="#fef2f2",
            fg="#991b1b",
            font=self.bold_font,
            justify=tk.LEFT,
            anchor="w",
            wraplength=1000
        )
        self.lbl_alert_msg.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=(10, 5), pady=6)


        self.btn_close_alert = tk.Button(
            self.alert_banner,
            text="✕",
            bg="#fef2f2",
            fg="#991b1b",
            activebackground="#fee2e2",
            font=self.bold_font,
            relief=tk.FLAT,
            bd=0,
            padx=8,
            pady=2,
            cursor="hand2",
            command=self._hide_alert_banner
        )
        self.btn_close_alert.pack(side=tk.RIGHT, padx=(5, 10), pady=6)


        self.btn_goto_relay = tk.Button(
            self.alert_banner,
            text="🛠️ 前往外部接力 ➔",
            bg="#2563eb",
            fg="#ffffff",
            activebackground="#1d4ed8",
            font=self.bold_font,
            relief=tk.FLAT,
            padx=8,
            pady=2,
            cursor="hand2",
            command=self._goto_relay_tab
        )
        self.btn_goto_relay.pack_forget()


        # 預設完全收合隱藏，物理高度為 0
        self.alert_banner.pack_forget()


    def _goto_relay_tab(self):
        try:
            if hasattr(self, "notebook") and hasattr(self, "tab1"):
                self.notebook.select(self.tab1)
            if hasattr(self, "nb_preview") and hasattr(self, "tab_relay"):
                self.nb_preview.select(self.tab_relay)
        except tk.TclError:
            pass


    def _show_alert_banner(self, err_title: str, err_detail: str, show_goto_relay: bool = False):
        def _do_show():
            try:
                if not self.root.winfo_exists():
                    return
                if not (hasattr(self, "alert_banner") and self.alert_banner.winfo_exists()):
                    return
                full_msg = f"🚨 【{err_title}】\n{err_detail}"
                if self.lbl_alert_msg.winfo_exists():
                    self.lbl_alert_msg.config(text=full_msg)
                if hasattr(self, "btn_goto_relay") and self.btn_goto_relay.winfo_exists():
                    if show_goto_relay:
                        self.btn_goto_relay.pack(side=tk.RIGHT, padx=(5, 4), pady=6)
                    else:
                        self.btn_goto_relay.pack_forget()
                # 僅於 notebook 已建構完成時附帶 before=self.notebook，確保拓撲順序正確
                if hasattr(self, "notebook") and self.notebook.winfo_exists():
                    self.alert_banner.pack(fill=tk.X, padx=10, pady=(0, 5), before=self.notebook)
                else:
                    self.alert_banner.pack(fill=tk.X, padx=10, pady=(0, 5))
            except tk.TclError:
                pass


        try:
            if self.root.winfo_exists():
                self.root.after(0, _do_show)
        except tk.TclError:
            pass


    def _hide_alert_banner(self):
        def _do_hide():
            try:
                if not self.root.winfo_exists():
                    return
                if hasattr(self, "alert_banner") and self.alert_banner.winfo_exists():
                    self.alert_banner.pack_forget()
            except tk.TclError:
                pass


        try:
            if self.root.winfo_exists():
                self.root.after(0, _do_hide)
        except tk.TclError:
            pass


    def get_account_display_labels(self):
        labels = []
        dispatch_mode = self.config.get("account_dispatch_mode", "locked")
        mode_tag = "🔒鎖定" if dispatch_mode == "locked" else ("🎲單帳" if dispatch_mode == "random" else "🔄單帳")


        for idx, p in enumerate(self.config.get("api_profiles", [])):
            name = p.get("name", f"帳號 {idx+1}")
            has_key = "✅有Key" if p.get("key", "").strip() else "❌無Key"
            labels.append(f"{idx+1}. {name} [{has_key}] ({mode_tag})")
        return labels


    def update_top_account_combo_values(self):
        labels = self.get_account_display_labels()
        self.account_combo["values"] = labels
        locked_idx = max(0, min(2, int(self.config.get("locked_account_index", 0))))
        if 0 <= locked_idx < len(labels):
            self.account_combo.current(locked_idx)


    def on_top_account_selected(self, event=None):
        idx = self.account_combo.current()
        if idx >= 0:
            self.config["locked_account_index"] = idx
            self.save_config()


    def save_top_config(self):
        idx = self.account_combo.current()
        if idx >= 0:
            self.config["locked_account_index"] = idx
        self.config["gemini_model"] = self.model_combo.get().strip() or "gemini-3.8-flash"
        self.save_config()
        self.update_top_account_combo_values()
        Toast.show(self.root, f"✅ 頂部設定已儲存！當前鎖定帳號 [{idx+1}]，模型 [{self.config['gemini_model']}]")


    # -----------------------------------------------------------------------
    # UI Component 2: Notebook 主頁籤佈局
    # -----------------------------------------------------------------------
    def build_notebook(self):
        self.notebook = ttk.Notebook(self.root)
        self.notebook.pack(fill=tk.BOTH, expand=True, padx=10, pady=5)


        self.tab1 = ttk.Frame(self.notebook)
        self.notebook.add(self.tab1, text="📝 雙階正則修復與一鍵字典覆蓋")
        self.build_tab1(self.tab1)


        self.tab2 = ttk.Frame(self.notebook)
        self.notebook.add(self.tab2, text="⚙️ 預設路徑與單帳號階梯管理")
        self.build_tab2(self.tab2)


    # -----------------------------------------------------------------------
    # 頁籤 1: 核心維護作業區 (黃金動線 + nb_preview 雙軌分頁 + Bottom-First Pack)
    # -----------------------------------------------------------------------
    def build_tab1(self, parent):
        paned = ttk.PanedWindow(parent, orient=tk.VERTICAL)
        paned.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)


        top_box = ttk.Frame(paned)
        paned.add(top_box, weight=1)


        lbl_log = ttk.Label(top_box, text="📋 請貼上「全局詳細正則搜尋結果」日誌內容：", font=self.bold_font)
        lbl_log.pack(anchor=tk.W, pady=(0, 2))


        self.txt_log = scrolledtext.ScrolledText(top_box, height=6, font=("Consolas", 9))
        self.txt_log.pack(fill=tk.BOTH, expand=True)


        # 作業區黃金動線按鈕列
        btn_frame = ttk.Frame(top_box)
        btn_frame.pack(fill=tk.X, pady=5)


        # 1. 一鍵雙階按鈕
        self.btn_auto = tk.Button(
            btn_frame,
            text="🤖 一鍵雙階自動修復 (工程師 ➔ QA)",
            bg="#2563eb",
            fg="#ffffff",
            font=self.bold_font,
            relief=tk.RAISED,
            padx=10, pady=4,
            command=self.run_auto_pipeline
        )
        self.btn_auto.pack(side=tk.LEFT, padx=(5, 3))


        # 2. 清空日誌按鈕 (緊鄰一鍵修復)
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


        # 3. 清空即貼上勾選框
        self.chk_clear_and_paste = ttk.Checkbutton(
            btn_frame,
            text="📋 清空即貼上",
            variable=self.var_clear_and_paste,
            command=self.on_clear_and_paste_toggled
        )
        self.chk_clear_and_paste.pack(side=tk.LEFT, padx=(2, 6))


        # 4. 垂直分隔線
        sep = ttk.Separator(btn_frame, orient=tk.VERTICAL)
        sep.pack(side=tk.LEFT, fill=tk.Y, padx=4, pady=2)


        # 5. 階段一按鈕
        self.btn_s1 = ttk.Button(btn_frame, text="1️⃣ 僅執行階段一 (工程師提案)", command=self.run_stage1_thread)
        self.btn_s1.pack(side=tk.LEFT, padx=2)


        # 6. 階段二按鈕
        self.btn_s2 = ttk.Button(btn_frame, text="2️⃣ 僅執行階段二 (QA審核)", command=self.run_stage2_thread)
        self.btn_s2.pack(side=tk.LEFT, padx=2)


        # 7. 點擊預覽框即複製 (調試模式) - 靠右對齊防止擠壓
        self.chk_click_to_copy = ttk.Checkbutton(
            btn_frame,
            text="📋 點擊預覽框即複製 (調試)",
            variable=self.var_click_to_copy,
            command=self.on_click_to_copy_toggled
        )
        self.chk_click_to_copy.pack(side=tk.RIGHT, padx=10)


        bottom_box = ttk.Frame(paned)
        paned.add(bottom_box, weight=3)


        # 雙軌預覽/接力子分頁 Notebook
        self.nb_preview = ttk.Notebook(bottom_box)
        self.nb_preview.pack(fill=tk.BOTH, expand=True)


        # 分頁 1：雙階預覽對照
        self.tab_preview = ttk.Frame(self.nb_preview)
        self.nb_preview.add(self.tab_preview, text="📊 雙階預覽對照")


        preview_paned = ttk.PanedWindow(self.tab_preview, orient=tk.HORIZONTAL)
        preview_paned.pack(fill=tk.BOTH, expand=True)


        self.frame_s1 = ttk.LabelFrame(preview_paned, text="階段一：工程師修復提案預覽 (Stage 1)")
        preview_paned.add(self.frame_s1, weight=1)


        self.txt_stage1 = scrolledtext.ScrolledText(self.frame_s1, font=("Consolas", 9), wrap=tk.WORD)
        self.txt_stage1.pack(fill=tk.BOTH, expand=True, padx=2, pady=2)
        self.txt_stage1.bind("<ButtonRelease-1>", lambda event: self.on_preview_box_click(event, self.txt_stage1, "階段一工程師提案", "s1"))


        self.frame_s2 = ttk.LabelFrame(preview_paned, text="階段二：QA 審核與最終字典條目 (Stage 2 - 直通寫入來源)")
        preview_paned.add(self.frame_s2, weight=1)


        self.txt_stage2 = scrolledtext.ScrolledText(self.frame_s2, font=("Consolas", 9), wrap=tk.WORD)
        self.txt_stage2.pack(fill=tk.BOTH, expand=True, padx=2, pady=2)
        self.txt_stage2.bind("<ButtonRelease-1>", lambda event: self.on_preview_box_click(event, self.txt_stage2, "階段二 QA 審核字典", "s2"))


        # 分頁 2：外部接力手動修補 (嚴格強制 Bottom-First Pack 順序)
        self.tab_relay = ttk.Frame(self.nb_preview)
        self.nb_preview.add(self.tab_relay, text="🛠️ 外部接力手動修補")


        # 第 1 順 Pack：頂部打包/貼回/匯出操作列
        relay_top_bar = ttk.Frame(self.tab_relay, padding=(4, 4))
        relay_top_bar.pack(side=tk.TOP, fill=tk.X)


        self.btn_relay_copy_eng = ttk.Button(relay_top_bar, text="📋 複製 ENG 任務包", command=self.relay_copy_eng)
        self.btn_relay_copy_eng.pack(side=tk.LEFT, padx=(2, 3))


        self.btn_relay_export_eng = ttk.Button(relay_top_bar, text="💾 匯出 ENG 任務檔", command=self.relay_export_eng)
        self.btn_relay_export_eng.pack(side=tk.LEFT, padx=3)


        self.btn_relay_apply_s1 = ttk.Button(relay_top_bar, text="📥 貼回為 Stage 1 提案", command=self.relay_apply_to_stage1)
        self.btn_relay_apply_s1.pack(side=tk.LEFT, padx=3)


        relay_sep = ttk.Separator(relay_top_bar, orient=tk.VERTICAL)
        relay_sep.pack(side=tk.LEFT, fill=tk.Y, padx=6, pady=2)


        self.btn_relay_copy_qa = ttk.Button(relay_top_bar, text="📋 複製 QA 任務包", command=self.relay_copy_qa)
        self.btn_relay_copy_qa.pack(side=tk.LEFT, padx=3)


        self.btn_relay_export_qa = ttk.Button(relay_top_bar, text="💾 匯出 QA 任務檔", command=self.relay_export_qa)
        self.btn_relay_export_qa.pack(side=tk.LEFT, padx=3)


        self.btn_relay_open_dir = ttk.Button(relay_top_bar, text="📂 開啟匯出資料夾", command=self.relay_open_export_dir)
        self.btn_relay_open_dir.pack(side=tk.RIGHT, padx=(3, 2))


        # 第 2 順 Pack：底部驗證解鎖列 (先佔位 BOTTOM，保障 1000x750 不裁切)
        relay_bottom_bar = ttk.Frame(self.tab_relay, padding=(4, 4))
        relay_bottom_bar.pack(side=tk.BOTTOM, fill=tk.X)


        self.btn_relay_verify = tk.Button(
            relay_bottom_bar,
            text="🛡️ 驗證外部成果並解鎖寫入",
            bg="#059669",
            fg="#ffffff",
            font=self.bold_font,
            relief=tk.RAISED,
            padx=12, pady=5,
            command=self.verify_and_unlock_relay_qa
        )
        self.btn_relay_verify.pack(side=tk.RIGHT, padx=(8, 4))


        lbl_relay_hint = tk.Label(
            relay_bottom_bar,
            text="💡 操作導引：複製/匯出任務包交由網頁 AI 處理後，將完整回覆貼入上方文字框並點擊右側驗證解鎖存檔。",
            fg="#4b5563",
            font=self.default_font,
            anchor="w",
            justify=tk.LEFT,
            wraplength=650
        )
        lbl_relay_hint.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=(2, 6))


        def _on_relay_bottom_configure(event):
            btn_w = self.btn_relay_verify.winfo_width() if self.btn_relay_verify.winfo_exists() else 220
            lbl_relay_hint.config(wraplength=max(260, event.width - btn_w - 30))


        relay_bottom_bar.bind("<Configure>", _on_relay_bottom_configure)


        # 第 3 順 Pack：中央自適應彈性格子貼入區
        self.txt_relay = scrolledtext.ScrolledText(self.tab_relay, font=("Consolas", 9), wrap=tk.WORD)
        self.txt_relay.pack(side=tk.TOP, fill=tk.BOTH, expand=True, padx=4, pady=2)


        # 底欄雙層流式動作列 (UX-bottom-01: 上排按鈕列 + 下排獨立多行狀態列)
        self.action_bar = ttk.Frame(bottom_box)
        self.action_bar.pack(fill=tk.X, pady=5)


        self.action_btn_row = ttk.Frame(self.action_bar)
        self.action_status_row = ttk.Frame(self.action_bar)


        self.btn_save = tk.Button(
            self.action_btn_row,
            text="💾 備份並更新至《嚴格正則修復字典.txt》",
            bg="#059669",
            fg="#ffffff",
            font=self.bold_font,
            relief=tk.RAISED,
            padx=12, pady=5,
            command=self.save_and_backup_dict
        )


        self.btn_copy = ttk.Button(
            self.action_btn_row,
            text="📋 複製 QA 最終字典內容",
            command=self.copy_qa_result
        )


        self.lbl_status = tk.Label(
            self.action_status_row,
            text="💡 就緒",
            font=("Microsoft YaHei UI", 10, "bold"),
            fg="#4b5563",
            anchor="w",
            justify=tk.LEFT,
            wraplength=1120
        )


        def _on_status_row_configure(event):
            new_wrap = max(320, event.width - 24)
            self.lbl_status.config(wraplength=new_wrap)


        self.action_status_row.bind("<Configure>", _on_status_row_configure)


        # 依設定進行底欄鏡像排版
        self.repack_bottom_bar()


    def repack_bottom_bar(self):
        """依據 swap_bottom_bar 開關動態重排上排按鈕左右對齊側；狀態列恆在下方獨立折行"""
        for w in [self.action_btn_row, self.action_status_row, self.btn_save, self.btn_copy, self.lbl_status]:
            w.pack_forget()


        self.action_btn_row.pack(side=tk.TOP, fill=tk.X, pady=(0, 3))
        self.action_status_row.pack(side=tk.TOP, fill=tk.X, expand=True)


        if self.var_swap_bottom_bar.get():
            # 鏡像模式：按鈕靠左排列 ([btn_save] [btn_copy])
            self.btn_save.pack(side=tk.LEFT, padx=(5, 5))
            self.btn_copy.pack(side=tk.LEFT, padx=5)
        else:
            # 標準模式：按鈕靠右排列 ([btn_copy] [btn_save])
            self.btn_save.pack(side=tk.RIGHT, padx=(5, 5))
            self.btn_copy.pack(side=tk.RIGHT, padx=5)


        self.lbl_status.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=6, pady=(2, 0))


    def on_swap_bottom_bar_toggled(self):
        self.config["swap_bottom_bar"] = self.var_swap_bottom_bar.get()
        self.repack_bottom_bar()
        self.save_config()
        Toast.show(self.root, "🔄 底部按鈕列佈局已即時切換！", duration=1200)


    def on_clear_and_paste_toggled(self):
        self.config["enable_clear_and_paste"] = self.var_clear_and_paste.get()
        self.save_config()


    def on_click_to_copy_toggled(self):
        self.config["enable_click_to_copy"] = self.var_click_to_copy.get()
        self.save_config()


    def handle_clear_log_action(self):
        """清空日誌並依勾選狀態執行剪貼簿自動貼上"""
        self.txt_log.delete("1.0", tk.END)
        if self.var_clear_and_paste.get():
            try:
                clip_text = self.root.clipboard_get()
                if clip_text and clip_text.strip():
                    self.txt_log.insert("1.0", clip_text)
                    Toast.show(self.root, "📋 已清空並自動貼上剪貼簿內容！", duration=1200, bg="#2563eb", fg="#ffffff")
                else:
                    Toast.show(self.root, "🗑️ 已清空日誌 (剪貼簿無文字內容)", duration=1200)
            except Exception:
                Toast.show(self.root, "🗑️ 已清空日誌 (剪貼簿無文字或讀取失敗)", duration=1200)
        else:
            Toast.show(self.root, "🗑️ 已清空日誌內容", duration=1000)


    # -----------------------------------------------------------------------
    # 預覽框外框標題重置方法
    # -----------------------------------------------------------------------
    def reset_preview_headers(self, s1=True, s2=True):
        try:
            if not self.root.winfo_exists():
                return
            if s1 and hasattr(self, "frame_s1"):
                self.root.after(0, lambda: self.frame_s1.config(text="階段一：工程師修復提案預覽 (Stage 1)") if self.frame_s1.winfo_exists() else None)
            if s2 and hasattr(self, "frame_s2"):
                self.root.after(0, lambda: self.frame_s2.config(text="階段二：QA 審核與最終字典條目 (Stage 2 - 直通寫入來源)") if self.frame_s2.winfo_exists() else None)
        except tk.TclError:
            pass


    # -----------------------------------------------------------------------
    # 調試模式「點選即複製」Meta 注入引擎核心 (含帳號資訊與剪貼簿容錯)
    # -----------------------------------------------------------------------
    def on_preview_box_click(self, event, widget: scrolledtext.ScrolledText, box_title: str, stage_key: str):
        try:
            if not self.var_click_to_copy.get():
                return


            content = widget.get("1.0", tk.END).strip()
            if not content or content.startswith("❌ 執行失敗"):
                return


            meta = {}
            if self.last_task_snapshot:
                meta_key = f"{stage_key}_meta"
                if meta_key in self.last_task_snapshot:
                    meta = self.last_task_snapshot[meta_key]


            account_name = meta.get("account_name", "未知帳號") if isinstance(meta, dict) else "未知帳號"
            actual_model = meta.get("actual_model", "未知") if isinstance(meta, dict) else "未知"
            elapsed_time = meta.get("elapsed_time", "0.0") if isinstance(meta, dict) else "0.0"
            is_fallback = meta.get("is_fallback", False) if isinstance(meta, dict) else False
            fallback_str = "⚠️ 是 (主要模型過載降階)" if is_fallback else "否 (主要模型直接命中)"


            sliced_info = "全量字典模式"
            if self.last_task_snapshot and self.last_task_snapshot.get("is_sliced", False):
                active_secs = self.last_task_snapshot.get("active_sections", [])
                sliced_info = f"微創切片模式 [{', '.join(active_secs)}]"


            meta_header = (
                f"{'=' * 80}\n"
                f"【調試排查資訊】\n"
                f"角色階段：{box_title}\n"
                f"執行帳號：{account_name}\n"
                f"執行模型：{actual_model}\n"
                f"通訊耗時：{elapsed_time}s\n"
                f"備援降級：{fallback_str}\n"
                f"處理範圍：{sliced_info}\n"
                f"{'=' * 80}\n\n"
            )
            full_debug_text = meta_header + content


            self.root.clipboard_clear()
            self.root.clipboard_append(full_debug_text)
            Toast.show(
                self.root,
                f"📋 已自動複製【{box_title}】調試內容 (含 Meta 標頭)！",
                duration=1200,
                bg="#2563eb",
                fg="#ffffff"
            )
        except Exception:
            pass


    # -----------------------------------------------------------------------
    # 頁籤 2: 預設路徑與單帳號階梯管理 (含高精度觸控板保底、Linux 相容與長冷卻設定)
    # -----------------------------------------------------------------------
    def build_tab2(self, parent):
        tab2_canvas = tk.Canvas(parent, highlightthickness=0)
        v_scrollbar = ttk.Scrollbar(parent, orient=tk.VERTICAL, command=tab2_canvas.yview)
        scrollable_frame = ttk.Frame(tab2_canvas, padding=(8, 4, 8, 4))


        scrollable_frame.bind(
            "<Configure>",
            lambda e: tab2_canvas.configure(scrollregion=tab2_canvas.bbox("all"))
        )


        canvas_window = tab2_canvas.create_window((0, 0), window=scrollable_frame, anchor="nw")


        def _on_canvas_configure(e):
            tab2_canvas.itemconfig(canvas_window, width=e.width)
        tab2_canvas.bind("<Configure>", _on_canvas_configure)


        tab2_canvas.configure(yscrollcommand=v_scrollbar.set)


        # 滑鼠滾輪事件綁定 (含高精度觸控板 ±1 保底、Linux Button-4/5 與頁籤主動解綁防護)
        def _on_mousewheel(event):
            try:
                if self.notebook.select() != str(parent):
                    return
            except tk.TclError:
                return


            if getattr(event, "num", None) == 4:
                step = -1
            elif getattr(event, "num", None) == 5:
                step = 1
            else:
                delta = getattr(event, "delta", 0)
                if delta == 0:
                    return
                step = int(-1 * (delta / 120))
                if step == 0:
                    step = -1 if delta > 0 else 1


            tab2_canvas.yview_scroll(step, "units")


        def _bind_tab2_wheel(event=None):
            tab2_canvas.bind_all("<MouseWheel>", _on_mousewheel)
            tab2_canvas.bind_all("<Button-4>", _on_mousewheel)
            tab2_canvas.bind_all("<Button-5>", _on_mousewheel)


        def _unbind_tab2_wheel(event=None):
            tab2_canvas.unbind_all("<MouseWheel>")
            tab2_canvas.unbind_all("<Button-4>")
            tab2_canvas.unbind_all("<Button-5>")


        parent.bind("<Enter>", _bind_tab2_wheel)
        parent.bind("<Leave>", _unbind_tab2_wheel)


        def _on_tab_changed(event=None):
            try:
                if self.notebook.select() != str(parent):
                    _unbind_tab2_wheel()
            except tk.TclError:
                pass


        self.notebook.bind("<<NotebookTabChanged>>", _on_tab_changed, add="+")


        tab2_canvas.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        v_scrollbar.pack(side=tk.RIGHT, fill=tk.Y)


        # 1. 字典與 AI 提示詞路徑
        frame_paths = ttk.LabelFrame(scrollable_frame, text="📂 字典與 AI 提示詞檔案路徑設定", padding=6)
        frame_paths.pack(fill=tk.X, padx=5, pady=2)


        ttk.Label(frame_paths, text="1. 《嚴格正則修復字典.txt》路徑:", font=self.bold_font).grid(row=0, column=0, sticky=tk.W, pady=1)
        self.entry_dict_path = ttk.Entry(frame_paths, width=80)
        self.entry_dict_path.insert(0, self.config.get("repair_dict_path", ""))
        self.entry_dict_path.grid(row=1, column=0, sticky=tk.EW, padx=4, pady=1)
        btn_b1 = ttk.Button(frame_paths, text="瀏覽...", command=lambda: self.browse_file(self.entry_dict_path))
        btn_b1.grid(row=1, column=1, padx=4)


        ttk.Label(frame_paths, text="2. 《字典工程師專用維護提示詞.txt》路徑:", font=self.bold_font).grid(row=2, column=0, sticky=tk.W, pady=(4, 1))
        self.entry_eng_path = ttk.Entry(frame_paths, width=80)
        self.entry_eng_path.insert(0, self.config.get("engineer_prompt_path", ""))
        self.entry_eng_path.grid(row=3, column=0, sticky=tk.EW, padx=4, pady=1)
        btn_b2 = ttk.Button(frame_paths, text="瀏覽...", command=lambda: self.browse_file(self.entry_eng_path))
        btn_b2.grid(row=3, column=1, padx=4)


        ttk.Label(frame_paths, text="3. 《字典維護QA提示詞.txt》路徑:", font=self.bold_font).grid(row=4, column=0, sticky=tk.W, pady=(4, 1))
        self.entry_qa_path = ttk.Entry(frame_paths, width=80)
        self.entry_qa_path.insert(0, self.config.get("qa_prompt_path", ""))
        self.entry_qa_path.grid(row=5, column=0, sticky=tk.EW, padx=4, pady=1)
        btn_b3 = ttk.Button(frame_paths, text="瀏覽...", command=lambda: self.browse_file(self.entry_qa_path))
        btn_b3.grid(row=5, column=1, padx=4)


        frame_paths.columnconfigure(0, weight=1)


        # 2. 多帳號 3x3 矩陣管理 (僅供手動切換備用，禁止自動跨多 Key 輪詢)
        frame_accounts = ttk.LabelFrame(
            scrollable_frame,
            text="🔑 Gemini API 金鑰儲存槽 (僅供介面手動切換，嚴禁同 IP 背景自動跨多 Key 輪詢)",
            padding=6
        )
        frame_accounts.pack(fill=tk.X, padx=5, pady=2)


        ttk.Label(frame_accounts, text="帳號名稱", font=self.bold_font).grid(row=0, column=0, sticky=tk.W, padx=4, pady=1)
        ttk.Label(frame_accounts, text="API Key (遮罩保護)", font=self.bold_font).grid(row=0, column=1, sticky=tk.W, padx=4, pady=1)
        ttk.Label(frame_accounts, text="備註說明", font=self.bold_font).grid(row=0, column=2, sticky=tk.W, padx=4, pady=1)


        self.account_entries = []
        profiles = self.config.get("api_profiles", self.DEFAULT_PROFILES)


        for i in range(3):
            prof = profiles[i] if i < len(profiles) else self.DEFAULT_PROFILES[i]


            ent_name = ttk.Entry(frame_accounts, width=20)
            ent_name.insert(0, prof.get("name", f"帳號 {i+1}"))
            ent_name.grid(row=i+1, column=0, padx=4, pady=2, sticky=tk.W)


            ent_key = ttk.Entry(frame_accounts, width=44, show="*")
            ent_key.insert(0, prof.get("key", ""))
            ent_key.grid(row=i+1, column=1, padx=4, pady=2, sticky=tk.EW)


            ent_note = ttk.Entry(frame_accounts, width=26)
            ent_note.insert(0, prof.get("note", ""))
            ent_note.grid(row=i+1, column=2, padx=4, pady=2, sticky=tk.W)


            self.account_entries.append({
                "name": ent_name,
                "key": ent_key,
                "note": ent_note
            })


        frame_accounts.columnconfigure(1, weight=1)


        # 3. 調度與重試策略面板
        frame_strategy = ttk.LabelFrame(
            scrollable_frame,
            text="🛡️ 防風控單帳號鎖定與長週期階梯退避策略 (含即時導覽看板)",
            padding=6
        )
        frame_strategy.pack(fill=tk.X, padx=5, pady=2)


        # 3.1 起手分流選單
        row_dispatch = ttk.Frame(frame_strategy)
        row_dispatch.pack(fill=tk.X, pady=1)
        ttk.Label(row_dispatch, text="起手分流策略:", font=self.bold_font).pack(side=tk.LEFT, padx=(0, 6))


        dispatch_options = [
            ("🔒 單帳號單選鎖定 (2026-11 防風控唯一合規)", "locked"),
            ("🎲 隨機均攤 (已降級為單帳號生效)", "random"),
            ("🔄 依序輪動 (已降級為單帳號生效)", "round_robin")
        ]
        self.dispatch_opt_map = {opt[0]: opt[1] for opt in dispatch_options}
        self.dispatch_rev_map = {opt[1]: opt[0] for opt in dispatch_options}


        self.combo_dispatch = ttk.Combobox(
            row_dispatch,
            values=[opt[0] for opt in dispatch_options],
            width=50,
            state="readonly"
        )
        current_disp = self.config.get("account_dispatch_mode", "locked")
        self.combo_dispatch.set(self.dispatch_rev_map.get(current_disp, dispatch_options[0][0]))
        self.combo_dispatch.pack(side=tk.LEFT, fill=tk.X, expand=True)
        self.combo_dispatch.bind("<<ComboboxSelected>>", self.on_dispatch_mode_changed)


        # 起手策略即時說明看板
        card_disp_frame = tk.Frame(frame_strategy, bg="#f8fafc", highlightbackground="#cbd5e1", highlightthickness=1)
        card_disp_frame.pack(fill=tk.X, padx=2, pady=1)
        self.lbl_card_dispatch = tk.Label(
            card_disp_frame,
            text="",
            bg="#f8fafc",
            fg="#1e293b",
            font=self.default_font,
            justify=tk.LEFT,
            anchor="w",
            padx=8, pady=3
        )
        self.lbl_card_dispatch.pack(fill=tk.X)


        # 3.2 遇阻重試路線選單
        row_retry = ttk.Frame(frame_strategy)
        row_retry.pack(fill=tk.X, pady=1)
        ttk.Label(row_retry, text="遇阻重試路線:", font=self.bold_font).pack(side=tk.LEFT, padx=(0, 6))


        route_options = [
            ("🛡️ 單帳號垂直降階優先 (3.8 ➔ 冷卻180s ➔ 3.6 ➔ 冷卻180s ➔ 3.5-lite)", "vertical_first"),
            ("🚀 品質優先不降 (鎖定主模型，失敗長退避)", "quality_locked"),
            ("⚡ 橫向擴展 (已收斂為單帳號主模型)", "horizontal_first")
        ]
        self.route_opt_map = {opt[0]: opt[1] for opt in route_options}
        self.route_rev_map = {opt[1]: opt[0] for opt in route_options}


        self.combo_route = ttk.Combobox(
            row_retry,
            values=[opt[0] for opt in route_options],
            width=56,
            state="readonly"
        )
        current_route = self.config.get("retry_route_policy", "vertical_first")
        self.combo_route.set(self.route_rev_map.get(current_route, route_options[0][0]))
        self.combo_route.pack(side=tk.LEFT, fill=tk.X, expand=True)
        self.combo_route.bind("<<ComboboxSelected>>", self.on_retry_route_changed)


        # 重試路線即時說明看板
        card_route_frame = tk.Frame(frame_strategy, bg="#f8fafc", highlightbackground="#cbd5e1", highlightthickness=1)
        card_route_frame.pack(fill=tk.X, padx=2, pady=1)
        self.lbl_card_retry = tk.Label(
            card_route_frame,
            text="",
            bg="#f8fafc",
            fg="#1e293b",
            font=self.default_font,
            justify=tk.LEFT,
            anchor="w",
            padx=8, pady=3
        )
        self.lbl_card_retry.pack(fill=tk.X)


        self.refresh_strategy_cards()


        # 3.3 重試參數、請求逾時與備援模型
        row_params = ttk.Frame(frame_strategy)
        row_params.pack(fill=tk.X, pady=2)


        ttk.Label(row_params, text="單一階梯最大嘗試次數:").pack(side=tk.LEFT, padx=(0, 4))
        self.entry_max_retries = ttk.Spinbox(row_params, from_=1, to=5, width=5)
        self.entry_max_retries.set(str(self.config.get("max_retries", 1)))
        self.entry_max_retries.pack(side=tk.LEFT, padx=(0, 14))


        ttk.Label(row_params, text="長週期冷卻退避(秒):").pack(side=tk.LEFT, padx=(0, 4))
        self.entry_base_delay = ttk.Spinbox(row_params, from_=10.0, to=600.0, increment=10.0, width=6)
        self.entry_base_delay.set(str(self.config.get("base_delay_seconds", 180.0)))
        self.entry_base_delay.pack(side=tk.LEFT, padx=(0, 14))


        ttk.Label(row_params, text="單次請求逾時(秒):").pack(side=tk.LEFT, padx=(0, 4))
        self.entry_request_timeout = ttk.Spinbox(row_params, from_=10.0, to=600.0, increment=10.0, width=6)
        self.entry_request_timeout.set(str(self.config.get("request_timeout_seconds", 300.0)))
        self.entry_request_timeout.pack(side=tk.LEFT, padx=(0, 14))


        self.chk_enable_fallback = ttk.Checkbutton(
            row_params,
            text="啟用模型階梯備援",
            variable=self.var_enable_fallback
        )
        self.chk_enable_fallback.pack(side=tk.LEFT)


        row_fb = ttk.Frame(frame_strategy)
        row_fb.pack(fill=tk.X, pady=2)


        ttk.Label(row_fb, text="第一備援模型:").pack(side=tk.LEFT, padx=(0, 4))
        self.combo_fallback_1 = ttk.Combobox(row_fb, values=self.PRESET_MODELS, width=20)
        self.combo_fallback_1.set(self.config.get("fallback_model_1", "gemini-3.6-flash"))
        self.combo_fallback_1.pack(side=tk.LEFT, padx=(0, 16))


        ttk.Label(row_fb, text="第二備援模型:").pack(side=tk.LEFT, padx=(0, 4))
        self.combo_fallback_2 = ttk.Combobox(row_fb, values=self.PRESET_MODELS, width=20)
        self.combo_fallback_2.set(self.config.get("fallback_model_2", "gemini-3.5-flash-lite"))
        self.combo_fallback_2.pack(side=tk.LEFT)


        # 4. 使用者偏好設定面板
        frame_pref = ttk.LabelFrame(scrollable_frame, text="⚙️ 使用者操作偏好設定 (即時生效與持久化)", padding=6)
        frame_pref.pack(fill=tk.X, padx=5, pady=2)


        chk_swap = ttk.Checkbutton(
            frame_pref,
            text="🔀 底部動作按鈕左右對調 (將【備份並更新至《嚴格正則修復字典.txt》】等按鈕置於左側，狀態列恆於下方獨立顯示)",
            variable=self.var_swap_bottom_bar,
            command=self.on_swap_bottom_bar_toggled
        )
        chk_swap.pack(anchor=tk.W, pady=1)


        chk_cp_paste = ttk.Checkbutton(
            frame_pref,
            text="📋 預設啟用「清空即貼上剪貼簿」功能 (點擊清空日誌按鈕時，自動將剪貼簿文字貼入日誌框)",
            variable=self.var_clear_and_paste,
            command=self.on_clear_and_paste_toggled
        )
        chk_cp_paste.pack(anchor=tk.W, pady=1)


        chk_pref_copy = ttk.Checkbutton(
            frame_pref,
            text="📋 預設啟用「點擊預覽框即複製」調試模式 (單擊預覽框瞬間複製全量文字含 Meta 標頭，專供外部 AI 診斷)",
            variable=self.var_click_to_copy,
            command=self.on_click_to_copy_toggled
        )
        chk_pref_copy.pack(anchor=tk.W, pady=1)


        # 5. 儲存按鈕
        btn_save_all = tk.Button(
            scrollable_frame,
            text="💾 儲存所有路徑與防風控設定",
            bg="#2563eb",
            fg="#ffffff",
            font=self.bold_font,
            padx=16, pady=6,
            relief=tk.RAISED,
            command=self.save_all_settings
        )
        btn_save_all.pack(anchor=tk.W, padx=5, pady=(6, 15))


    def refresh_strategy_cards(self):
        disp_key = self.dispatch_opt_map.get(self.combo_dispatch.get(), "locked")
        self.lbl_card_dispatch.config(text=DISPATCH_DESCRIPTIONS.get(disp_key, ""))


        route_key = self.route_opt_map.get(self.combo_route.get(), "vertical_first")
        self.lbl_card_retry.config(text=RETRY_ROUTE_DESCRIPTIONS.get(route_key, ""))


    def on_dispatch_mode_changed(self, event=None):
        disp_key = self.dispatch_opt_map.get(self.combo_dispatch.get(), "locked")
        self.config["account_dispatch_mode"] = disp_key
        self.refresh_strategy_cards()
        self.update_top_account_combo_values()
        self.save_config()


    def on_retry_route_changed(self, event=None):
        route_key = self.route_opt_map.get(self.combo_route.get(), "vertical_first")
        self.config["retry_route_policy"] = route_key
        self.refresh_strategy_cards()
        self.save_config()


    def browse_file(self, entry_widget):
        filename = filedialog.askopenfilename(filetypes=[("Text files", "*.txt"), ("All files", "*.*")])
        if filename:
            entry_widget.delete(0, tk.END)
            entry_widget.insert(0, filename)


    def save_all_settings(self):
        self.config["repair_dict_path"] = self._norm_path_or_empty(self.entry_dict_path.get())
        self.config["engineer_prompt_path"] = self._norm_path_or_empty(self.entry_eng_path.get())
        self.config["qa_prompt_path"] = self._norm_path_or_empty(self.entry_qa_path.get())


        # 儲存 3 組帳號矩陣
        new_profiles = []
        for i, ent_dict in enumerate(self.account_entries):
            new_profiles.append({
                "name": ent_dict["name"].get().strip() or f"帳號 {i+1}",
                "key": ent_dict["key"].get().strip(),
                "note": ent_dict["note"].get().strip()
            })
        self.config["api_profiles"] = new_profiles
        self.config["api_key"] = new_profiles[0]["key"]


        # 策略設定
        self.config["account_dispatch_mode"] = self.dispatch_opt_map.get(self.combo_dispatch.get(), "locked")
        self.config["retry_route_policy"] = self.route_opt_map.get(self.combo_route.get(), "vertical_first")


        try:
            self.config["max_retries"] = max(1, min(5, int(self.entry_max_retries.get())))
        except ValueError:
            self.config["max_retries"] = 1
        self.entry_max_retries.set(str(self.config["max_retries"]))


        try:
            delay_val = float(self.entry_base_delay.get())
            self.config["base_delay_seconds"] = max(10.0, min(600.0, delay_val))
        except ValueError:
            self.config["base_delay_seconds"] = 180.0
        self.entry_base_delay.set(str(self.config["base_delay_seconds"]))


        try:
            timeout_val = float(self.entry_request_timeout.get())
            self.config["request_timeout_seconds"] = max(10.0, min(600.0, timeout_val))
        except ValueError:
            self.config["request_timeout_seconds"] = 300.0
        self.entry_request_timeout.set(str(self.config["request_timeout_seconds"]))


        self.config["enable_fallback"] = self.var_enable_fallback.get()
        self.config["fallback_model_1"] = self.combo_fallback_1.get().strip()
        self.config["fallback_model_2"] = self.combo_fallback_2.get().strip()
        self.config["swap_bottom_bar"] = self.var_swap_bottom_bar.get()
        self.config["enable_clear_and_paste"] = self.var_clear_and_paste.get()
        self.config["enable_click_to_copy"] = self.var_click_to_copy.get()


        self.save_config()
        self.update_top_account_combo_values()
        Toast.show(self.root, "✅ 檔案路徑、單帳號鎖定槽位與防風控長退避設定已儲存！")


    # -----------------------------------------------------------------------
    # UI 鎖定與狀態線程安全函式 (含 BK-SISTER-04 TclError 守衛與接力互動防競爭鎖)
    # -----------------------------------------------------------------------
    def set_ui_locked(self, locked: bool):
        self.is_running = locked
        btn_state = tk.DISABLED if locked else tk.NORMAL
        account_state = tk.DISABLED if locked else "readonly"
        model_state = tk.DISABLED if locked else tk.NORMAL


        def _apply_widget_state(widget, state_val):
            try:
                if self.root.winfo_exists() and widget.winfo_exists():
                    widget.config(state=state_val)
            except tk.TclError:
                pass


        try:
            if not self.root.winfo_exists():
                return
            widgets_states = [
                (self.btn_auto, btn_state),
                (self.btn_clear, btn_state),
                (self.btn_s1, btn_state),
                (self.btn_s2, btn_state),
                (self.btn_save, btn_state),
                (self.test_btn, btn_state),
                (self.account_combo, account_state),
                (self.model_combo, model_state),
                (self.btn_relay_apply_s1, btn_state),
                (self.btn_relay_verify, btn_state),
                (self.btn_relay_copy_eng, btn_state),
                (self.btn_relay_export_eng, btn_state),
                (self.btn_relay_copy_qa, btn_state),
                (self.btn_relay_export_qa, btn_state)
            ]
            for w, st in widgets_states:
                self.root.after(0, lambda widget=w, state_val=st: _apply_widget_state(widget, state_val))
        except tk.TclError:
            pass


    def update_status(self, text, fg_color="#2563eb"):
        def _do_update():
            try:
                if self.root.winfo_exists() and hasattr(self, "lbl_status") and self.lbl_status.winfo_exists():
                    self.lbl_status.config(text=text, fg=fg_color)
            except tk.TclError:
                pass


        try:
            if self.root.winfo_exists():
                self.root.after(0, _do_update)
        except tk.TclError:
            pass


    # -----------------------------------------------------------------------
    # 【核心演算法 1】字典分組區塊解析器 (放寬帶名稱三行標頭與單行相容)
    # -----------------------------------------------------------------------
    def parse_repair_dict_sections(self, dict_content: str):
        sec_pattern = re.compile(
            r'^(#\s*={5,}[^\r\n]*\r?\n#\s*\[\s*([^\]]+?)\s*\][^\r\n]*\r?\n#\s*={5,}[^\r\n]*)',
            re.MULTILINE
        )
        matches = list(sec_pattern.finditer(dict_content))


        if not matches:
            fallback_pattern = re.compile(
                r'^(#\s*\[\s*([^\]]+?)\s*\][^\r\n]*)',
                re.MULTILINE
            )
            matches = list(fallback_pattern.finditer(dict_content))


        if not matches:
            return "", OrderedDict([("__ALL__", dict_content)])


        header_text = dict_content[:matches[0].start()]
        sections_map = OrderedDict()


        for i, m in enumerate(matches):
            sec_name = m.group(2).strip()
            start_pos = m.start()
            end_pos = matches[i + 1].start() if i + 1 < len(matches) else len(dict_content)
            sections_map[sec_name] = dict_content[start_pos:end_pos]


        return header_text, sections_map


    # -----------------------------------------------------------------------
    # 【核心演算法 2】目標分類自動嗅探引擎
    # -----------------------------------------------------------------------
    def detect_active_repair_sections(self, log_content: str, sections_keys: list):
        if not log_content or not sections_keys:
            return []


        target_chars = set()


        for line in log_content.splitlines():
            line_str = line.strip()
            if not line_str or line_str.startswith("#"):
                continue


            delim = None
            for d in ["<>", "->", "➔", "=>"]:
                if d in line_str:
                    delim = d
                    break


            if delim:
                parts = line_str.split(delim, 1)
                left_chars = set(re.findall(r'[\u4e00-\u9fa5]', parts[0]))
                right_chars = set(re.findall(r'[\u4e00-\u9fa5]', parts[1]))
                target_chars.update(left_chars | right_chars)


        if not target_chars:
            target_chars.update(re.findall(r'[\u4e00-\u9fa5]', log_content))


        if not target_chars:
            return []


        matched_sections = []
        for sec_name in sections_keys:
            if sec_name == "__ALL__":
                continue
            sec_chars = set(re.findall(r'[\u4e00-\u9fa5]', sec_name))
            if sec_chars & target_chars:
                matched_sections.append(sec_name)


        return matched_sections


    # -----------------------------------------------------------------------
    # 【核心演算法 3】記憶體微創切片器
    # -----------------------------------------------------------------------
    def slice_repair_sections(self, sections_map: OrderedDict, active_sections: list, header_text: str):
        if not active_sections or "__ALL__" in sections_map:
            full_text = header_text + "".join(sections_map.values())
            return full_text, False


        sliced_parts = []
        slice_header = (
            "# ==============================================================================\n"
            "# 【微創切片模式】本次僅載入與錯字相關之目標分類區塊（其餘無關分類已由本機隔離保護）\n"
            f"# 目標分類清單：[{', '.join(active_sections)}]\n"
            "# 請僅針對以下目標分類進行正則審查、覆蓋優化或排序，並完整輸出以下區塊之全貌：\n"
            "# ==============================================================================\n\n"
        )
        sliced_parts.append(slice_header)


        for sec in active_sections:
            if sec in sections_map:
                sliced_parts.append(sections_map[sec])


        return "".join(sliced_parts), True


    # -----------------------------------------------------------------------
    # 【核心演算法 4】存檔靜態語法檢查防線
    # (PCRE2 記憶體寬容臨時中和 + 7 項致命黑名單 + 消除反斜線二義性脫殼)
    # -----------------------------------------------------------------------
    def validate_dict_syntax(self, dict_text: str):
        current_section = "預設分類"
        seen_patterns = set()


        for line_num, line in enumerate(dict_text.splitlines(), start=1):
            raw_line = line.strip()
            if not raw_line or raw_line.startswith("#") or raw_line.startswith(";"):
                if raw_line.startswith("#") and ("[" in raw_line and "]" in raw_line or "嚴格修復" in raw_line):
                    current_section = raw_line
                    seen_patterns.clear()
                continue


            if "<>" not in raw_line:
                continue


            parts = raw_line.split("<>", 1)
            pattern_str = parts[0].strip()


            # 防線 A：中括號字元集脫殼清洗與省略號硬阻斷 (消除反斜線二義性回溯)
            cleaned_pattern = re.sub(r'\[\^?(?:\\.|[^\\\]])+\]', '', pattern_str)


            if "..." in cleaned_pattern or "…" in cleaned_pattern:
                return False, f"正則 Pattern 包含非法省略號「{pattern_str}」(第 {line_num} 行)！模型偷懶輸出殘破規則。"


            # 防線 B：同一分類區塊內重複規則檢查
            if pattern_str in seen_patterns:
                return False, f"在分類「{current_section}」中偵測到重複正則規則「{pattern_str}」(第 {line_num} 行)！模型覆蓋失敗產生冗餘。"
            seen_patterns.add(pattern_str)


            # 防線 C：正則編譯預檢 (PCRE2 記憶體臨時寬容中和，字典實體 0 污染)
            python_compatible_pattern = re.sub(
                r'\\x\{([0-9a-fA-F]{1,6})\}',
                lambda m: f'\\u{m.group(1).zfill(4)}' if len(m.group(1)) <= 4 else f'\\U{m.group(1).zfill(8)}',
                pattern_str
            )
            python_compatible_pattern = re.sub(
                r'\(\*(?:SKIP|FAIL|PRUNE|COMMIT|ACCEPT|F)\)',
                '(?:)',
                python_compatible_pattern
            )
            python_compatible_pattern = re.sub(
                r'(?<!\\)\\K',
                '(?:)',
                python_compatible_pattern
            )
            python_compatible_pattern = re.sub(
                r'(?<!\\)\\[pP]\{[^{}\r\n]+\}',
                '.',
                python_compatible_pattern
            )


            try:
                re.compile(python_compatible_pattern)
            except re.error as e:
                err_msg = str(e)
                err_lower = err_msg.lower()


                # 放行特例：PCRE2 合法之不定長逆序環視
                if "look-behind requires fixed-width pattern" in err_lower:
                    continue


                # 7 項致命語法錯誤黑名單嚴格裁決
                fatal_tokens = (
                    "unterminated subpattern",
                    "unbalanced parenthesis",
                    "missing )",
                    "unterminated character set",
                    "bad character range",
                    "bad escape",
                    "nothing to repeat",
                    "unknown extension",
                    "unknown group name",
                    "invalid group reference",
                    "bad character in group name",
                    "missing >",
                    "missing group name"
                )
                if any(tok in err_lower for tok in fatal_tokens):
                    return False, f"正則語法編譯錯誤「{pattern_str}」(第 {line_num} 行): {err_msg}"


                if "multiple repeat" in err_lower:
                    # 僅當確定為單純 PCRE2 佔有量詞 [+*?]+ 且非空量詞堆疊時容忍 (例如 Python 3.10 環境)
                    has_possessive = bool(re.search(r'(?<![+*?\\])[+*?]\+', pattern_str))
                    has_illegal_stack = bool(re.search(r'(?<!\\)(?:\*\*|\?\?|\+\+\+|\*\+?\*|\?\+?\?|[+*?]{3,})', pattern_str))
                    if has_possessive and not has_illegal_stack:
                        continue
                    return False, f"正則語法編譯錯誤「{pattern_str}」(第 {line_num} 行): {err_msg}"


                # 其餘未歸類之 re.error 採保守阻斷
                return False, f"正則語法編譯錯誤「{pattern_str}」(第 {line_num} 行): {err_msg}"


        return True, ""


    # -----------------------------------------------------------------------
    # 【核心演算法 5】記憶體原地原子縫合器 (雙重分類數量守恆物理熔斷門禁)
    # -----------------------------------------------------------------------
    def stitch_repair_sections(self, original_header: str, original_sections: OrderedDict,
                               active_sections: list, ai_output_text: str, is_sliced: bool):
        if is_sliced and "__ALL__" in original_sections:
            raise Exception("微創縫合阻斷：目標字典檔案不含任何分類區塊標頭，無法匹配切片區塊，已終止寫入！")


        _, ai_sections_map = self.parse_repair_dict_sections(ai_output_text)


        if not is_sliced or "__ALL__" in original_sections:
            if len(ai_sections_map) < len(original_sections):
                raise Exception(
                    f"全量覆蓋阻斷：AI 輸出分類數 ({len(ai_sections_map)}) 少於原字典分類數 ({len(original_sections)})！"
                    f"檢測到模型偷懶截斷，已終止覆蓋以防壞檔。"
                )
            return ai_output_text


        new_sections = OrderedDict(original_sections)


        for sec_name in active_sections:
            if sec_name in ai_sections_map:
                new_sections[sec_name] = ai_sections_map[sec_name]
            else:
                matched = False
                sec_clean = sec_name.replace(" ", "")
                for ai_sec_key, ai_sec_val in ai_sections_map.items():
                    if ai_sec_key.replace(" ", "") == sec_clean:
                        new_sections[sec_name] = ai_sec_val
                        matched = True
                        break
                if not matched:
                    raise Exception(f"AI 輸出遺失目標分類區塊「{sec_name}」，縫合中斷以防壞檔！")


        if len(new_sections) != len(original_sections):
            raise Exception(
                f"微創縫合異常：原字典分類數 ({len(original_sections)}) 與縫合後分類數 ({len(new_sections)}) 不一致！"
                f"已觸發物理熔斷阻斷寫入！"
            )


        return original_header + "".join(new_sections.values())


    # -----------------------------------------------------------------------
    # 提示詞雙軌自適應路徑嗅探引擎
    # -----------------------------------------------------------------------
    def resolve_prompt_path(self, configured_path: str, role_type: str) -> str:
        if configured_path and os.path.isfile(configured_path):
            return configured_path


        search_dir = ""
        if configured_path and os.path.isdir(configured_path):
            search_dir = configured_path
        elif configured_path:
            search_dir = os.path.dirname(configured_path)


        if not search_dir or not os.path.exists(search_dir):
            search_dir = SCRIPT_DIR


        if not os.path.isdir(search_dir):
            raise FileNotFoundError(f"找不到提示詞搜尋目錄：{search_dir}")


        candidate_files = []
        try:
            for entry in os.listdir(search_dir):
                full_p = os.path.join(search_dir, entry)
                if os.path.isfile(full_p) and entry.lower().endswith(".txt"):
                    candidate_files.append(entry)
        except Exception as e:
            raise FileNotFoundError(f"掃描提示詞目錄 [{search_dir}] 失敗: {str(e)}")


        role_type_lower = role_type.lower()
        matched_files = []
        for fname in candidate_files:
            fn_upper = fname.upper()
            if role_type_lower == "eng":
                if "工程師" in fname or "ENG" in fn_upper:
                    matched_files.append(fname)
            elif role_type_lower == "qa":
                if "QA" in fn_upper or "審查員" in fname:
                    matched_files.append(fname)


        if not matched_files:
            raise FileNotFoundError(f"在目錄 [{search_dir}] 中找不到匹配的 {role_type.upper()} 提示詞檔案！")


        def score_file(fname):
            full_path = os.path.join(search_dir, fname)
            mtime = os.path.getmtime(full_path)
            v_match = re.search(r'(?:v|V)?(\d+(?:\.\d+)+)', fname)
            if v_match:
                ver_tuple = tuple(int(x) for x in v_match.group(1).split("."))
                return (3, ver_tuple, mtime)
            d_match = re.search(r'(\d{8})', fname)
            if d_match:
                date_int = int(d_match.group(1))
                return (2, (date_int,), mtime)
            return (1, (), mtime)


        matched_files.sort(key=score_file, reverse=True)
        best_file_name = matched_files[0]
        best_file_path = self._norm_path_or_empty(os.path.join(search_dir, best_file_name))


        config_key = "engineer_prompt_path" if role_type_lower == "eng" else "qa_prompt_path"
        current_cfg = self._norm_path_or_empty(self.config.get(config_key, ""))


        if best_file_path != current_cfg:
            self.config[config_key] = best_file_path
            self.save_config()


            if role_type_lower == "eng" and hasattr(self, "entry_eng_path"):
                self.root.after(0, lambda p=best_file_path: (
                    self.entry_eng_path.delete(0, tk.END),
                    self.entry_eng_path.insert(0, p)
                ))
            elif role_type_lower == "qa" and hasattr(self, "entry_qa_path"):
                self.root.after(0, lambda p=best_file_path: (
                    self.entry_qa_path.delete(0, tk.END),
                    self.entry_qa_path.insert(0, p)
                ))


            self.root.after(0, lambda fn=best_file_name: Toast.show(
                self.root,
                f"💡 提示詞已自動適配最新版：\n[{fn}]",
                duration=2500,
                bg="#2563eb",
                fg="#ffffff"
            ))


        return best_file_path


    # -----------------------------------------------------------------------
    # 【核心演算法 6】單帳號鎖定候選清單產生器 (徹底下線多 Key 自動輪詢 + BK-SISTER-03 回退標記)
    # -----------------------------------------------------------------------
    def get_dispatched_candidate_profiles(self):
        all_profiles = self.config.get("api_profiles", [])
        valid_profiles = []
        for idx, p in enumerate(all_profiles):
            if not isinstance(p, dict):
                continue
            key = p.get("key", "").strip()
            if key:
                prof_copy = p.copy()
                prof_copy["original_index"] = idx
                valid_profiles.append(prof_copy)


        if not valid_profiles:
            return []


        locked_idx = max(0, min(2, int(self.config.get("locked_account_index", 0))))
        for p in valid_profiles:
            if p["original_index"] == locked_idx:
                p["_fallback_from_locked"] = False
                p["_locked_slot_name"] = p.get("name", f"帳號 {locked_idx + 1}")
                return [p]


        locked_slot_name = f"帳號 {locked_idx + 1}"
        if 0 <= locked_idx < len(all_profiles) and isinstance(all_profiles[locked_idx], dict):
            locked_slot_name = all_profiles[locked_idx].get("name", locked_slot_name) or locked_slot_name


        fallback_prof = valid_profiles[0]
        fallback_prof["_fallback_from_locked"] = True
        fallback_prof["_locked_slot_name"] = locked_slot_name
        return [fallback_prof]


    # -----------------------------------------------------------------------
    # 任務快照封裝演算法 (Main Thread 完成按需提示詞解析、切片與高負載前哨檢測)
    # -----------------------------------------------------------------------
    def create_task_snapshot(self, require_eng_prompt: bool = True, require_qa_prompt: bool = True) -> dict:
        self._warn_unsaved_path_diffs(self.config)


        if require_eng_prompt:
            eng_prompt_path = self.resolve_prompt_path(self.config.get("engineer_prompt_path", ""), "eng")
        else:
            eng_prompt_path = self._norm_path_or_empty(self.config.get("engineer_prompt_path", ""))


        if require_qa_prompt:
            qa_prompt_path = self.resolve_prompt_path(self.config.get("qa_prompt_path", ""), "qa")
        else:
            qa_prompt_path = self._norm_path_or_empty(self.config.get("qa_prompt_path", ""))


        repair_dict_path = self._norm_path_or_empty(self.config.get("repair_dict_path", ""))
        log_content = self.txt_log.get("1.0", tk.END).strip()


        dict_full_content = self.read_file_content(repair_dict_path, "嚴格正則修復字典")
        orig_header, orig_sections = self.parse_repair_dict_sections(dict_full_content)
        active_secs = self.detect_active_repair_sections(log_content, list(orig_sections.keys()))
        sliced_dict_text, is_sliced = self.slice_repair_sections(orig_sections, active_secs, orig_header)


        # BK-SISTER-06：高負載前哨檢測 (未切片且長度 > 35000 字元)
        is_heavy_load = (not is_sliced) and ((len(sliced_dict_text) + len(log_content)) > 35000)


        # 解除 API Key 硬阻斷，純離線接力可攜帶空清單 [] 運作
        candidate_profiles = self.get_dispatched_candidate_profiles()


        try:
            max_retries_val = max(1, min(5, int(self.config.get("max_retries", 1))))
        except Exception:
            max_retries_val = 1


        try:
            base_delay_val = max(10.0, min(600.0, float(self.config.get("base_delay_seconds", 180.0))))
        except Exception:
            base_delay_val = 180.0


        try:
            timeout_val = float(self.config.get("request_timeout_seconds", 300.0))
            timeout_val = max(10.0, min(600.0, timeout_val))
        except Exception:
            timeout_val = 300.0


        primary_model = self.model_combo.get().strip() or self.config.get("gemini_model", "gemini-3.8-flash") or "gemini-3.8-flash"


        return {
            "log_content": log_content,
            "candidate_profiles": candidate_profiles,
            "primary_model": primary_model,
            "repair_dict_path": repair_dict_path,
            "eng_prompt_path": eng_prompt_path,
            "qa_prompt_path": qa_prompt_path,
            "original_header": orig_header,
            "original_sections": orig_sections,
            "active_sections": active_secs,
            "sliced_dict_text": sliced_dict_text,
            "is_sliced": is_sliced,
            "is_heavy_load": is_heavy_load,
            "retry_cfg": {
                "retry_route_policy": self.config.get("retry_route_policy", "vertical_first"),
                "max_retries": max_retries_val,
                "base_delay_seconds": base_delay_val,
                "request_timeout_seconds": timeout_val,
                "enable_fallback": bool(self.config.get("enable_fallback", True)),
                "fallback_model_1": self.config.get("fallback_model_1", "gemini-3.6-flash"),
                "fallback_model_2": self.config.get("fallback_model_2", "gemini-3.5-flash-lite")
            }
        }


    # -----------------------------------------------------------------------
    # 共用 Prompt 組裝方法 (線上 API 與離線接力單一真理源)
    # -----------------------------------------------------------------------
    def _build_stage1_prompt(self, snapshot: dict, eng_prompt: str) -> str:
        return (
            f"{eng_prompt}\n\n"
            f"=== 【現有修復字典內容】 ===\n{snapshot['sliced_dict_text']}\n\n"
            f"=== 【使用者日誌搜尋結果】 ===\n{snapshot['log_content']}\n"
        )


    def _build_stage2_prompt(self, snapshot: dict, qa_prompt: str, stage1_result: str) -> str:
        return (
            f"{qa_prompt}\n\n"
            f"=== 【現有修復字典內容】 ===\n{snapshot['sliced_dict_text']}\n\n"
            f"=== 【階段一工程師提案】 ===\n{stage1_result}\n\n"
            f"=== 【原始日誌搜尋結果】 ===\n{snapshot['log_content']}\n"
        )


    # -----------------------------------------------------------------------
    # SDK 底層請求封裝 (關閉隱形重試 + 逾時透傳軟降級，嚴禁拼接 models/ 前綴【By Design】)
    # -----------------------------------------------------------------------
    def raw_sdk_call(self, api_key, model_name, prompt_text, timeout_seconds=300.0):
        if not api_key:
            raise Exception("API Key 為空，無法發起請求！")


        try:
            timeout_val = max(10.0, min(600.0, float(timeout_seconds)))
        except (TypeError, ValueError):
            timeout_val = 300.0


        if GENAI_MODE == "google.genai":
            from google import genai
            client = None
            try:
                from google.genai import types
                try:
                    http_opts = types.HttpOptions(
                        timeout=int(timeout_val * 1000),
                        retry_options=types.HttpRetryOptions(attempts=1)
                    )
                except (TypeError, AttributeError):
                    http_opts = types.HttpOptions(timeout=int(timeout_val * 1000))
                client = genai.Client(api_key=api_key, http_options=http_opts)
            except (ImportError, TypeError, AttributeError):
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
                response = model.generate_content(
                    prompt_text,
                    request_options={"timeout": float(timeout_val)}
                )
            except TypeError:
                response = model.generate_content(prompt_text)
            return response.text
        else:
            raise Exception("未安裝 google-genai 模組，請先執行命令：pip install google-genai")


    # -----------------------------------------------------------------------
    # API 連通性測試探針 (優先測試頂部選定帳號，含 BK-SISTER-03 回退提示與接力引導)
    # -----------------------------------------------------------------------
    def test_api_connection(self):
        if self.is_running:
            Toast.show(self.root, "⚠️ 背景任務執行中，請稍候再試！", bg="#f59e0b", fg="#000000")
            return


        # 任務啟動瞬間自動自癒隱藏舊告警橫幅
        self._hide_alert_banner()


        profiles = self.config.get("api_profiles", [])
        selected_idx = self.account_combo.current()
        current_prof = None
        fallback_from_locked_msg = None


        if 0 <= selected_idx < len(profiles):
            cand = profiles[selected_idx]
            if isinstance(cand, dict) and cand.get("key", "").strip():
                current_prof = cand


        if current_prof is None:
            locked_name = f"帳號 {selected_idx + 1}" if selected_idx >= 0 else "目前鎖定帳號"
            if 0 <= selected_idx < len(profiles) and isinstance(profiles[selected_idx], dict):
                locked_name = profiles[selected_idx].get("name", locked_name) or locked_name


            for cand in profiles:
                if isinstance(cand, dict) and cand.get("key", "").strip():
                    current_prof = cand
                    used_name = current_prof.get("name", "備用帳號")
                    fallback_from_locked_msg = f"⚠️ 鎖定帳號 [{locked_name}] 未填金鑰，本次已自動改用 [{used_name}]"
                    break


        if not current_prof:
            err_txt = "尚未設定任何有效的 API Key！您可至設定頁填寫金鑰，或使用【外部接力手動修補】離線作業。"
            Toast.show(self.root, f"⚠️ {err_txt}", duration=2800, bg="#f59e0b", fg="#000000")
            self._show_alert_banner("連通性測試阻斷", err_txt, show_goto_relay=True)
            return


        if fallback_from_locked_msg:
            Toast.show(self.root, fallback_from_locked_msg, duration=2600, bg="#f59e0b", fg="#000000")


        api_key = current_prof.get("key", "").strip()
        account_name = current_prof.get("name", "帳號")
        model_name = self.model_combo.get().strip() or self.config.get("gemini_model", "gemini-3.8-flash") or "gemini-3.8-flash"
        try:
            timeout_sec = max(10.0, min(600.0, float(self.config.get("request_timeout_seconds", 300.0))))
        except (TypeError, ValueError):
            timeout_sec = 300.0


        self.set_ui_locked(True)
        self._start_stopwatch("🔍 連通性測試中", f"帳號: [{account_name}] 模型: [{model_name}]")


        def _worker(k, m, a_name, t_sec):
            try:
                start_t = time.time()
                self.raw_sdk_call(k, m, "Hello, reply 'OK'", timeout_seconds=t_sec)
                cost_t = round(time.time() - start_t, 2)


                # 測試成功自癒關閉告警橫幅
                self._hide_alert_banner()
                self._stop_stopwatch()


                self.root.after(0, lambda: Toast.show(
                    self.root,
                    f"✅ API 通暢！[{a_name}] 模型 [{m}] 回應正常 ({cost_t}s)",
                    duration=2200,
                    bg="#10b981",
                    fg="#ffffff"
                ))
                self.update_status(f"💡 API 就緒 [{a_name} | {m} / {cost_t}s]", fg_color="#059669")
            except Exception as e:
                self._stop_stopwatch()
                err_msg = str(e)
                err_upper = err_msg.upper()
                if any(code in err_upper for code in ["503", "UNAVAILABLE", "HIGH DEMAND"]):
                    status_desc = f"⚠️ [{a_name}] 伺服器暫時負載過高 (503)"
                elif re.search(r'(?<!\d)(?:400|403)(?!\d)', err_upper) or any(
                    code in err_upper for code in ["API_KEY_INVALID", "PERMISSION_DENIED", "API KEY NOT VALID", "API KEY EXPIRED"]
                ):
                    status_desc = f"❌ [{a_name}] API Key 無效或未開通權限"
                elif "404" in err_msg or "not found" in err_msg.lower():
                    status_desc = f"❌ 模型名稱 [{m}] 不存在"
                else:
                    status_desc = f"❌ [{a_name}] 連線失敗: {err_msg[:60]}"


                # 展開固化常駐告警橫幅，完整呈現錯誤詳情並提供外部接力導引
                self._show_alert_banner(
                    "API 連通性測試失敗",
                    f"測試帳號: [{a_name}] | 測試模型: [{m}]\n錯誤資訊: {err_msg}",
                    show_goto_relay=True
                )
                try:
                    if self.root.winfo_exists():
                        self.root.after(0, lambda: Toast.show(self.root, f"❌ 測試失敗: {status_desc}", duration=3000, bg="#ef4444", fg="#ffffff"))
                except tk.TclError:
                    pass
                self.update_status(f"❌ {status_desc}", fg_color="#dc2626")
            finally:
                self._stop_stopwatch()
                self.set_ui_locked(False)


        threading.Thread(target=_worker, args=(api_key, model_name, account_name, timeout_sec), daemon=True).start()


    # -----------------------------------------------------------------------
    # 【核心演算法 7】單帳號防風控調用核心
    # (BK-SISTER-01 配額優先序前置、風控阻斷偵測、邊界精確授權分類與 180s 長冷卻垂直降階)
    # -----------------------------------------------------------------------
    def call_gemini_api(self, prompt_text, candidate_profiles, primary_model, retry_cfg, stage_name="任務"):
        route_policy = retry_cfg.get("retry_route_policy", "vertical_first")
        try:
            max_retries = max(1, min(5, int(retry_cfg.get("max_retries", 1))))
        except (TypeError, ValueError):
            max_retries = 1
        try:
            base_delay = max(10.0, min(600.0, float(retry_cfg.get("base_delay_seconds", 180.0))))
        except (TypeError, ValueError):
            base_delay = 180.0
        enable_fallback = retry_cfg.get("enable_fallback", True)
        try:
            timeout_seconds = max(10.0, min(600.0, float(retry_cfg.get("request_timeout_seconds", 300.0))))
        except (TypeError, ValueError):
            timeout_seconds = 300.0


        models_ladder = [primary_model]
        if enable_fallback and route_policy == "vertical_first":
            fb1 = retry_cfg.get("fallback_model_1", "").strip()
            fb2 = retry_cfg.get("fallback_model_2", "").strip()
            if fb1 and fb1 not in models_ladder:
                models_ladder.append(fb1)
            if fb2 and fb2 not in models_ladder:
                models_ladder.append(fb2)


        # 防風控約束：僅使用單一鎖定帳號 (候選長度恆為 1)
        target_prof = None
        for prof in candidate_profiles:
            if prof.get("key", "").strip():
                target_prof = prof
                break


        if not target_prof:
            raise Exception("尚未設定任何有效的 Gemini API Key！")


        prof_key = target_prof.get("original_index", 0)
        account_name = target_prof.get("name", "帳號 1")
        api_key = target_prof.get("key", "").strip()


        quota_exhausted_pairs = set()
        last_error = None
        last_model = primary_model


        def _classify_error(err_upper: str):
            # 1. 404 致命端點排除
            if "404" in err_upper or "NOT_FOUND" in err_upper:
                return False, False, False, False


            # 2. is_risk_block
            is_risk_block = any(k in err_upper for k in [
                "UNUSUAL ACCOUNT ACTIVITY",
                "ACCOUNT VERIFICATION REQUIRED",
                "VERIFY-ACCOUNT",
                "BLOCKED DUE TO ABUSE"
            ])


            # 3. has_explicit_auth_kw 與 is_invalid_arg
            has_explicit_auth_kw = any(k in err_upper for k in [
                "API_KEY_INVALID",
                "PERMISSION_DENIED",
                "API KEY NOT VALID",
                "API KEY EXPIRED"
            ])
            is_invalid_arg = (not is_risk_block) and ("INVALID_ARGUMENT" in err_upper) and (not has_explicit_auth_kw)


            # 4. is_daily_quota_err (BK-SISTER-01: 前置於 400/403 數字比對)
            is_daily_quota_err = False
            if (not is_risk_block) and (not is_invalid_arg) and (not has_explicit_auth_kw):
                has_daily_kw = any(k in err_upper for k in [
                    "GENERATEREQUESTSPERDAY", "PERDAY", "PER_DAY", "DAILY LIMIT"
                ])
                has_per_minute_kw = any(k in err_upper for k in ["PERMINUTE", "PER MINUTE"])
                has_quota_exceeded_non_minute = ("QUOTA EXCEEDED" in err_upper) and (not has_per_minute_kw)


                has_429_or_exhausted = ("429" in err_upper or "RESOURCE_EXHAUSTED" in err_upper)
                has_metric_kw = any(k in err_upper for k in [
                    "QUOTA EXCEEDED FOR QUOTA METRIC", "QUOTA EXCEEDED FOR METRIC"
                ])
                has_long_retry = False
                if has_429_or_exhausted:
                    has_long_retry = bool(re.search(
                        r'RETRY[ \t_]*(?:IN|DELAY)[ \t"\':=]*\d+(?:\.\d+)?[^\S\r\n]*H',
                        err_upper
                    ))
                    if not has_long_retry:
                        for m in re.finditer(
                            r'RETRY[ \t_]*(?:IN|DELAY)[ \t"\':=]*(\d+(?:\.\d+)?)[^\S\r\n]*([MS])',
                            err_upper
                        ):
                            try:
                                val = float(m.group(1))
                                unit = m.group(2)
                                seconds = val * 60.0 if unit == "M" else val
                                if seconds >= 300.0:
                                    has_long_retry = True
                                    break
                            except ValueError:
                                continue


                if has_daily_kw or has_quota_exceeded_non_minute or (
                    has_429_or_exhausted and ((has_metric_kw and not has_per_minute_kw) or has_long_retry)
                ):
                    is_daily_quota_err = True


            # 5. is_auth_err (於確認非每日配額錯誤後再比對 400/403)
            is_auth_err = (not is_risk_block) and (not is_invalid_arg) and (not is_daily_quota_err) and (
                has_explicit_auth_kw or bool(re.search(r'(?<!\d)(?:400|403)(?!\d)', err_upper))
            )


            # 6. is_trans_err
            is_trans_err = (not is_risk_block) and (not is_invalid_arg) and (not is_auth_err) and (not is_daily_quota_err) and any(k in err_upper for k in [
                "503", "UNAVAILABLE", "429", "RESOURCE_EXHAUSTED",
                "500", "INTERNAL", "504", "DEADLINE_EXCEEDED", "HIGH DEMAND",
                "EMPTY RESPONSE", "TIMEOUT", "TIMED OUT", "READTIMEOUT"
            ])
            return is_risk_block, is_auth_err, is_daily_quota_err, is_trans_err


        # 單帳號垂直階梯穿透調度
        for m_idx, current_model in enumerate(models_ladder):
            if (prof_key, current_model) in quota_exhausted_pairs:
                continue
            if not self.is_running:
                raise Exception("任務已中止")


            is_fallback_model = (m_idx > 0)
            last_model = current_model
            model_daily_exhausted = False


            for attempt in range(1, max_retries + 1):
                if not self.is_running:
                    raise Exception("任務已中止")


                try:
                    start_t = time.time()
                    response_text = self.raw_sdk_call(
                        api_key, current_model, prompt_text, timeout_seconds=timeout_seconds
                    )
                    cost_t = round(time.time() - start_t, 2)


                    if not response_text:
                        raise Exception("EMPTY RESPONSE: 模型回傳空白內容")


                    if is_fallback_model:
                        try:
                            if self.root.winfo_exists():
                                self.root.after(0, lambda m=current_model, a=account_name: Toast.show(
                                    self.root,
                                    f"⚠️ 原模型受限，已由 [{a}] 備援模型 [{m}] 完成！",
                                    duration=2500, bg="#f59e0b", fg="#000000"
                                ))
                        except tk.TclError:
                            pass


                    return {
                        "text": response_text,
                        "account_name": account_name,
                        "actual_model": current_model,
                        "elapsed_time": cost_t,
                        "is_fallback": is_fallback_model
                    }
                except Exception as e:
                    last_error = e
                    err_str = str(e)
                    err_upper = err_str.upper()
                    is_risk_block, is_auth_err, is_daily_quota_err, is_transient = _classify_error(err_upper)


                    if is_risk_block:
                        risk_msg = (
                            f"🚨 觸發 Google 帳號風控或人機驗證，已全面終止請求，請手動登入 AI Studio 排除！\n"
                            f"受阻節點: 帳號 [{account_name}] | 模型 [{current_model}] | 原始錯誤: {err_str}"
                        )
                        raise Exception(risk_msg)


                    if is_auth_err:
                        raise Exception(
                            f"帳號 [{account_name}] 授權失效或權限遭拒，已立即終止！模型 [{current_model}] | 錯誤代碼: {err_str}"
                        )


                    if is_daily_quota_err:
                        quota_exhausted_pairs.add((prof_key, current_model))
                        model_daily_exhausted = True
                        if m_idx < len(models_ladder) - 1:
                            next_model = models_ladder[m_idx + 1]
                            self.update_status(
                                f"⚠️ [{stage_name}] 帳號 [{account_name}] 之 [{current_model}] 每日配額已滿，立即降階嘗試 [{next_model}]...",
                                fg_color="#d97706"
                            )
                        else:
                            self.update_status(
                                f"⚠️ [{stage_name}] 帳號 [{account_name}] 之 [{current_model}] 每日配額已滿。",
                                fg_color="#d97706"
                            )
                        break


                    if not is_transient:
                        raise e


                    # 暫態可退避錯誤 (503 / RPM 429 / Timeout / Empty Response)
                    if attempt < max_retries:
                        self._sleep_with_heartbeat(
                            base_delay, stage_name, current_model, attempt, max_retries, action_label="即將重試"
                        )
                        if not self.is_running:
                            raise Exception("任務已中止")
                    elif m_idx < len(models_ladder) - 1:
                        next_model = models_ladder[m_idx + 1]
                        self._sleep_with_heartbeat(
                            base_delay, stage_name, current_model, attempt, max_retries,
                            action_label=f"冷卻後降階 [{next_model}]"
                        )
                        if not self.is_running:
                            raise Exception("任務已中止")


            if model_daily_exhausted and m_idx == len(models_ladder) - 1:
                break


        final_err_detail = (
            f"單帳號階梯調度失敗。最後出錯節點: 帳號 [{account_name}] | 模型 [{last_model}] | 錯誤代碼: {str(last_error)}"
        )
        raise Exception(final_err_detail)


    def read_file_content(self, path, desc):
        if not path or not os.path.exists(path):
            raise FileNotFoundError(f"找不到{desc}檔案：{path}")


        try:
            with open(path, "rb") as f:
                raw_bytes = f.read()
        except OSError as e:
            raise OSError(f"無法讀取{desc}檔案 ({path})：{str(e)}") from e


        # 1. 先依序嚴格嘗試 utf-8-sig 與 utf-8
        for enc in ("utf-8-sig", "utf-8"):
            try:
                return raw_bytes.decode(enc)
            except UnicodeDecodeError:
                continue


        # 2. 分別嚴格嘗試 gbk 與 big5 解碼
        gbk_text = None
        big5_text = None
        try:
            gbk_text = raw_bytes.decode("gbk")
        except UnicodeDecodeError:
            pass
        try:
            big5_text = raw_bytes.decode("big5")
        except UnicodeDecodeError:
            pass


        if gbk_text is not None and big5_text is None:
            return gbk_text
        if big5_text is not None and gbk_text is None:
            return big5_text


        # 3. 兩者皆成功時執行零依賴啟發式評分裁決 (同分優先採用 big5)
        if gbk_text is not None and big5_text is not None:
            gibberish_re = re.compile(r'[\u3040-\u30ff\u0370-\u03ff\u0400-\u04ff\u2500-\u257f\ue000-\uf8ff]')


            gbk_score = -10 * len(gibberish_re.findall(gbk_text))
            for ch in gbk_text:
                if '\u4e00' <= ch <= '\u9fff':
                    try:
                        ch.encode("gb2312")
                        gbk_score += 2
                    except UnicodeEncodeError:
                        pass


            big5_score = -10 * len(gibberish_re.findall(big5_text))
            for ch in big5_text:
                try:
                    b = ch.encode("big5")
                except UnicodeEncodeError:
                    continue
                if len(b) == 2:
                    code = (b[0] << 8) | b[1]
                    if '\u4e00' <= ch <= '\u9fff' and 0xA4 <= b[0] <= 0xC6:
                        big5_score += 2
                    elif 0xA140 <= code <= 0xA1FE:
                        big5_score += 3


            if gbk_score > big5_score:
                return gbk_text
            return big5_text


        # 4. 四者皆解碼失敗時，以容錯模式讀取並發出異常警示
        try:
            if self.root.winfo_exists():
                self.root.after(0, lambda d=desc, p=os.path.basename(path): Toast.show(
                    self.root,
                    f"⚠️ {d} [{p}] 編碼異常，已以 UTF-8 容錯模式讀取（可能含遺失字元）",
                    duration=3000,
                    bg="#f59e0b",
                    fg="#000000"
                ))
        except tk.TclError:
            pass
        return raw_bytes.decode("utf-8", errors="ignore")


    # -----------------------------------------------------------------------
    # 階段一 / 階段二 / 一鍵雙階 執行邏輯 (含金鑰/回退/高負載檢驗、5s緩衝與接力引導)
    # -----------------------------------------------------------------------
    def _notify_online_preflight_warnings(self, snapshot: dict):
        """執行期前哨提醒：BK-SISTER-03 鎖定槽位無金鑰回退 + BK-SISTER-06 全量高負載警告"""
        cand = snapshot["candidate_profiles"][0]
        offset = 0
        if cand.get("_fallback_from_locked"):
            locked_name = cand.get("_locked_slot_name", "鎖定帳號")
            used_name = cand.get("name", "備用帳號")
            msg = f"⚠️ 鎖定帳號 [{locked_name}] 未填金鑰，本次已自動改用 [{used_name}]"
            Toast.show(self.root, msg, duration=2800, bg="#f59e0b", fg="#000000", y_offset=offset)
            self.update_status(msg, fg_color="#d97706")
            offset += 55
        if snapshot.get("is_heavy_load"):
            Toast.show(
                self.root,
                "⚠️ 注意：本次為高負載全量字典請求，已啟用防風控保護！",
                duration=2800,
                bg="#f59e0b",
                fg="#000000",
                y_offset=offset
            )


    def run_stage1_thread(self):
        if self.is_running:
            Toast.show(self.root, "⚠️ 任務正在執行中，請稍候！", bg="#f59e0b", fg="#000000")
            return


        # 任務啟動瞬間自動自癒隱藏舊告警橫幅
        self._hide_alert_banner()


        try:
            snapshot = self.create_task_snapshot(require_eng_prompt=True, require_qa_prompt=False)
        except Exception as e:
            Toast.show(self.root, f"❌ {str(e)}", duration=3000, bg="#ef4444", fg="#ffffff")
            self._show_alert_banner("階段一任務啟動阻斷", str(e), show_goto_relay=True)
            return


        if not snapshot["candidate_profiles"]:
            err_txt = "尚未設定任何有效的 Gemini API Key！您可至設定頁填寫金鑰，或點擊右側按鈕使用【外部接力手動修補】離線作業。"
            Toast.show(self.root, "❌ 尚未設定任何有效的 Gemini API Key！", duration=3000, bg="#ef4444", fg="#ffffff")
            self._show_alert_banner("API 金鑰未設定", err_txt, show_goto_relay=True)
            return


        if not snapshot["log_content"]:
            Toast.show(self.root, "⚠️ 請先貼上日誌內容！", bg="#f59e0b", fg="#000000")
            return


        self._notify_online_preflight_warnings(snapshot)


        self.last_task_snapshot = snapshot
        self.txt_stage1.delete("1.0", tk.END)
        self.txt_stage2.delete("1.0", tk.END)
        self.reset_preview_headers(s1=True, s2=True)
        self.set_ui_locked(True)


        slice_status = f"切片: {', '.join(snapshot['active_sections'])}" if snapshot["is_sliced"] else "全量模式"
        self._start_stopwatch("⏳ 工程師提案中 (Stage 1)", slice_status)


        def _worker():
            try:
                self._exec_stage1(snapshot)
            finally:
                self._stop_stopwatch()
                self.set_ui_locked(False)


        threading.Thread(target=_worker, daemon=True).start()


    def _exec_stage1(self, snapshot):
        try:
            if self.root.winfo_exists():
                self.root.after(0, lambda: Toast.show(self.root, "🚀 [階段一] 工程師提案生成中..."))
        except tk.TclError:
            pass
        try:
            eng_prompt = self.read_file_content(snapshot["eng_prompt_path"], "工程師提示詞")
            full_prompt = self._build_stage1_prompt(snapshot, eng_prompt)


            result_data = self.call_gemini_api(
                full_prompt,
                snapshot["candidate_profiles"],
                snapshot["primary_model"],
                snapshot["retry_cfg"],
                stage_name="階段一"
            )


            result_text = result_data["text"]
            snapshot["s1_meta"] = {
                "account_name": result_data["account_name"],
                "actual_model": result_data["actual_model"],
                "elapsed_time": result_data["elapsed_time"],
                "is_fallback": result_data["is_fallback"]
            }


            fallback_mark = " ⚠️備援" if result_data["is_fallback"] else ""
            slice_mark = f" | 切片: {', '.join(snapshot['active_sections'])}" if snapshot["is_sliced"] else ""
            title_s1 = (
                f"階段一：工程師修復提案預覽 (Stage 1) "
                f"[{result_data['account_name']} | {result_data['actual_model']} | {result_data['elapsed_time']}s{fallback_mark}{slice_mark}]"
            )


            self._stop_stopwatch()
            try:
                if self.root.winfo_exists():
                    self.root.after(0, lambda: self.frame_s1.config(text=title_s1) if self.frame_s1.winfo_exists() else None)
                    self.root.after(0, lambda: self._update_text_box(self.txt_stage1, result_text))
                    self.root.after(0, lambda: Toast.show(self.root, "✅ [階段一] 工程師提案產出完成！"))
            except tk.TclError:
                pass
            self.update_status(f"✅ 工程師已給結果 [{result_data['account_name']}]", fg_color="#059669")
            return result_text
        except Exception as e:
            err_str = str(e)
            self._stop_stopwatch()
            self._show_alert_banner("階段一執行失敗", err_str, show_goto_relay=True)
            try:
                if self.root.winfo_exists():
                    self.root.after(0, lambda: self._update_text_box(self.txt_stage1, f"❌ 執行失敗:\n{err_str}"))
                    self.root.after(0, lambda: Toast.show(self.root, f"❌ 階段一失敗: {err_str[:40]}", duration=3000, bg="#ef4444", fg="#ffffff"))
            except tk.TclError:
                pass
            self.update_status("❌ 工程師提案失敗", fg_color="#dc2626")
            return None


    def run_stage2_thread(self):
        if self.is_running:
            Toast.show(self.root, "⚠️ 任務正在執行中，請稍候！", bg="#f59e0b", fg="#000000")
            return


        # 任務啟動瞬間自動自癒隱藏舊告警橫幅
        self._hide_alert_banner()


        s1_result = self.txt_stage1.get("1.0", tk.END).strip()
        if not s1_result or s1_result.startswith("❌ 執行失敗"):
            Toast.show(self.root, "⚠️ 請先完成階段一提案！", bg="#f59e0b", fg="#000000")
            return


        try:
            snapshot = self.create_task_snapshot(require_eng_prompt=False, require_qa_prompt=True)
        except Exception as e:
            Toast.show(self.root, f"❌ {str(e)}", duration=3000, bg="#ef4444", fg="#ffffff")
            self._show_alert_banner("階段二任務啟動阻斷", str(e), show_goto_relay=True)
            return


        if not snapshot["candidate_profiles"]:
            err_txt = "尚未設定任何有效的 Gemini API Key！您可至設定頁填寫金鑰，或點擊右側按鈕使用【外部接力手動修補】離線作業。"
            Toast.show(self.root, "❌ 尚未設定任何有效的 Gemini API Key！", duration=3000, bg="#ef4444", fg="#ffffff")
            self._show_alert_banner("API 金鑰未設定", err_txt, show_goto_relay=True)
            return


        self._notify_online_preflight_warnings(snapshot)


        self.last_task_snapshot = snapshot
        self.txt_stage2.delete("1.0", tk.END)
        self.reset_preview_headers(s1=False, s2=True)
        self.set_ui_locked(True)


        slice_status = f"切片: {', '.join(snapshot['active_sections'])}" if snapshot["is_sliced"] else "全量模式"
        self._start_stopwatch("⏳ QA複決中 (Stage 2)", slice_status)


        def _worker():
            try:
                self._exec_stage2(snapshot, s1_result)
            finally:
                self._stop_stopwatch()
                self.set_ui_locked(False)


        threading.Thread(target=_worker, daemon=True).start()


    def _exec_stage2(self, snapshot, stage1_result):
        try:
            if self.root.winfo_exists():
                self.root.after(0, lambda: Toast.show(self.root, "🔍 [階段二] QA 嚴格審核進行中..."))
        except tk.TclError:
            pass
        try:
            qa_prompt = self.read_file_content(snapshot["qa_prompt_path"], "QA提示詞")
            full_prompt = self._build_stage2_prompt(snapshot, qa_prompt, stage1_result)


            result_data = self.call_gemini_api(
                full_prompt,
                snapshot["candidate_profiles"],
                snapshot["primary_model"],
                snapshot["retry_cfg"],
                stage_name="階段二"
            )


            result_text = result_data["text"]


            s2_hash = hashlib.sha256(result_text.strip().encode("utf-8")).hexdigest()
            snapshot["s2_hash"] = s2_hash
            snapshot["s2_meta"] = {
                "account_name": result_data["account_name"],
                "actual_model": result_data["actual_model"],
                "elapsed_time": result_data["elapsed_time"],
                "is_fallback": result_data["is_fallback"]
            }
            self.last_task_snapshot = snapshot


            fallback_mark = " ⚠️備援" if result_data["is_fallback"] else ""
            slice_mark = f" | 切片: {', '.join(snapshot['active_sections'])}" if snapshot["is_sliced"] else ""
            title_s2 = (
                f"階段二：QA 審核與最終字典條目 (Stage 2) "
                f"[{result_data['account_name']} | {result_data['actual_model']} | {result_data['elapsed_time']}s{fallback_mark}{slice_mark}]"
            )


            self._stop_stopwatch()
            try:
                if self.root.winfo_exists():
                    self.root.after(0, lambda: self.frame_s2.config(text=title_s2) if self.frame_s2.winfo_exists() else None)
                    self.root.after(0, lambda: self._update_text_box(self.txt_stage2, result_text))
                    self.root.after(0, lambda: Toast.show(self.root, "🎉 [階段二] QA 審核完畢，最終字典已生成！"))
            except tk.TclError:
                pass
            self.update_status(f"🎉 QA已給結果 [{result_data['account_name']}]", fg_color="#059669")
            return result_text
        except Exception as e:
            err_str = str(e)
            self._stop_stopwatch()
            self._show_alert_banner("階段二審核失敗", err_str, show_goto_relay=True)
            try:
                if self.root.winfo_exists():
                    self.root.after(0, lambda: self._update_text_box(self.txt_stage2, f"❌ 執行失敗:\n{err_str}"))
                    self.root.after(0, lambda: Toast.show(self.root, f"❌ 階段二失敗: {err_str[:40]}", duration=3000, bg="#ef4444", fg="#ffffff"))
            except tk.TclError:
                pass
            self.update_status("❌ QA複決失敗", fg_color="#dc2626")
            return None


    def run_auto_pipeline(self):
        if self.is_running:
            Toast.show(self.root, "⚠️ 任務正在執行中，請稍候！", bg="#f59e0b", fg="#000000")
            return


        # 任務啟動瞬間自動自癒隱藏舊告警橫幅
        self._hide_alert_banner()


        try:
            snapshot = self.create_task_snapshot(require_eng_prompt=True, require_qa_prompt=True)
        except Exception as e:
            Toast.show(self.root, f"❌ {str(e)}", duration=3000, bg="#ef4444", fg="#ffffff")
            self._show_alert_banner("一鍵雙階任務啟動阻斷", str(e), show_goto_relay=True)
            return


        if not snapshot["candidate_profiles"]:
            err_txt = "尚未設定任何有效的 Gemini API Key！您可至設定頁填寫金鑰，或點擊右側按鈕使用【外部接力手動修補】離線作業。"
            Toast.show(self.root, "❌ 尚未設定任何有效的 Gemini API Key！", duration=3000, bg="#ef4444", fg="#ffffff")
            self._show_alert_banner("API 金鑰未設定", err_txt, show_goto_relay=True)
            return


        if not snapshot["log_content"]:
            Toast.show(self.root, "⚠️ 請先貼上日誌內容！", bg="#f59e0b", fg="#000000")
            return


        self._notify_online_preflight_warnings(snapshot)


        self.last_task_snapshot = snapshot
        self.txt_stage1.delete("1.0", tk.END)
        self.txt_stage2.delete("1.0", tk.END)
        self.reset_preview_headers(s1=True, s2=True)
        self.set_ui_locked(True)


        slice_status = f"切片: {', '.join(snapshot['active_sections'])}" if snapshot["is_sliced"] else "全量模式"
        self._start_stopwatch("⏳ 工程師提案中 (Stage 1)", slice_status)


        def _pipeline():
            try:
                s1_res = self._exec_stage1(snapshot)
                if not s1_res or s1_res.startswith("❌ 執行失敗"):
                    return


                # 防風控保護：雙階之間強制 5 秒安全生理緩衝
                self._stop_stopwatch()
                self.update_status("⏳ [防風控保護] 雙階安全緩衝冷卻中 (5s)... 即將進入階段二", fg_color="#d97706")
                for _ in range(5):
                    if not self.is_running:
                        return
                    time.sleep(1.0)


                if not self.is_running:
                    return


                # 切換至階段二，世代隔離重置碼錶為 0s
                self._start_stopwatch("⏳ QA複決中 (Stage 2)", slice_status)
                self._exec_stage2(snapshot, s1_res)
            finally:
                self._stop_stopwatch()
                self.set_ui_locked(False)


        threading.Thread(target=_pipeline, daemon=True).start()


    def _update_text_box(self, widget, text):
        try:
            if self.root.winfo_exists() and widget.winfo_exists():
                widget.delete("1.0", tk.END)
                widget.insert(tk.END, text)
        except tk.TclError:
            pass


    # -----------------------------------------------------------------------
    # 外部接力手動修補模組 (6 項純離線/混跑操作 + 共用白箱驗證核心)
    # -----------------------------------------------------------------------
    def _copy_text_to_clipboard(self, text: str) -> bool:
        try:
            self.root.clipboard_clear()
            self.root.clipboard_append(text)
            self.root.update_idletasks()
            return True
        except Exception as e:
            err_summary = str(e).splitlines()[0][:60] if str(e) else "未知錯誤"
            Toast.show(
                self.root,
                f"⚠️ 剪貼簿寫入失敗（可能被其他程式鎖定）：{err_summary}",
                duration=3000,
                bg="#f59e0b",
                fg="#000000"
            )
            return False


    def _prepare_eng_relay_prompt(self):
        if self.is_running:
            Toast.show(self.root, "⚠️ 背景任務執行中，請稍候再試！", bg="#f59e0b", fg="#000000")
            return None, None
        try:
            snapshot = self.create_task_snapshot(require_eng_prompt=True, require_qa_prompt=False)
        except Exception as e:
            Toast.show(self.root, f"❌ {str(e)}", duration=3000, bg="#ef4444", fg="#ffffff")
            self._show_alert_banner("ENG 任務包組裝失敗", str(e), show_goto_relay=False)
            return None, None


        if not snapshot["log_content"]:
            Toast.show(self.root, "⚠️ 請先貼上日誌內容！", bg="#f59e0b", fg="#000000")
            return None, None


        try:
            eng_prompt = self.read_file_content(snapshot["eng_prompt_path"], "工程師提示詞")
        except Exception as e:
            Toast.show(self.root, f"❌ {str(e)}", duration=3000, bg="#ef4444", fg="#ffffff")
            self._show_alert_banner("讀取工程師提示詞失敗", str(e), show_goto_relay=False)
            return None, None


        self.last_task_snapshot = snapshot
        full_prompt = self._build_stage1_prompt(snapshot, eng_prompt)
        return snapshot, full_prompt


    def _prepare_qa_relay_prompt(self):
        if self.is_running:
            Toast.show(self.root, "⚠️ 背景任務執行中，請稍候再試！", bg="#f59e0b", fg="#000000")
            return None, None, False
        try:
            snapshot = self.create_task_snapshot(require_eng_prompt=False, require_qa_prompt=True)
        except Exception as e:
            Toast.show(self.root, f"❌ {str(e)}", duration=3000, bg="#ef4444", fg="#ffffff")
            self._show_alert_banner("QA 任務包組裝失敗", str(e), show_goto_relay=False)
            return None, None, False


        if not snapshot["log_content"]:
            Toast.show(self.root, "⚠️ 請先貼上日誌內容！", bg="#f59e0b", fg="#000000")
            return None, None, False


        s1_result = self.txt_stage1.get("1.0", tk.END).strip()
        used_placeholder = False
        if not s1_result or s1_result.startswith("❌ 執行失敗"):
            used_placeholder = True
            s1_result = "（階段一工程師提案從缺，請直接依據上方【現有修復字典內容】與【原始日誌搜尋結果】進行獨立 QA 審查並輸出完整條目）"


        try:
            qa_prompt = self.read_file_content(snapshot["qa_prompt_path"], "QA提示詞")
        except Exception as e:
            Toast.show(self.root, f"❌ {str(e)}", duration=3000, bg="#ef4444", fg="#ffffff")
            self._show_alert_banner("讀取 QA 提示詞失敗", str(e), show_goto_relay=False)
            return None, None, False


        self.last_task_snapshot = snapshot
        full_prompt = self._build_stage2_prompt(snapshot, qa_prompt, s1_result)
        return snapshot, full_prompt, used_placeholder


    def relay_copy_eng(self):
        snapshot, full_prompt = self._prepare_eng_relay_prompt()
        if not full_prompt:
            return
        if self._copy_text_to_clipboard(full_prompt):
            scope = f"微創切片: [{', '.join(snapshot['active_sections'])}]" if snapshot["is_sliced"] else "全量字典模式"
            Toast.show(self.root, f"📋 已複製 ENG 任務包至剪貼簿！({scope})", duration=2200, bg="#2563eb", fg="#ffffff")
            self.update_status(f"📋 已打包 ENG 任務包 ({scope}，{len(full_prompt)} 字元)", fg_color="#2563eb")


    def relay_export_eng(self):
        snapshot, full_prompt = self._prepare_eng_relay_prompt()
        if not full_prompt:
            return
        try:
            os.makedirs(RELAY_EXPORT_DIR, exist_ok=True)
            ts = datetime.now().strftime("%Y%m%d_%H%M%S")
            fname = f"relay_ENG_{ts}.txt"
            fpath = os.path.join(RELAY_EXPORT_DIR, fname)
            normalized_lf = full_prompt.replace("\r\n", "\n").replace("\r", "\n")
            with open(fpath, "w", encoding="utf-8-sig", newline="\n") as f:
                f.write(normalized_lf)
            scope = f"微創切片: [{', '.join(snapshot['active_sections'])}]" if snapshot["is_sliced"] else "全量字典模式"
            Toast.show(self.root, f"💾 已匯出 ENG 任務檔：\nrelay_exports/{fname}", duration=2600, bg="#10b981", fg="#ffffff")
            self.update_status(f"💾 已匯出 relay_exports/{fname} ({scope})", fg_color="#059669")
        except Exception as e:
            Toast.show(self.root, f"❌ 匯出 ENG 任務檔失敗: {str(e)}", duration=3000, bg="#ef4444", fg="#ffffff")
            self._show_alert_banner("匯出 ENG 任務檔失敗", str(e), show_goto_relay=False)


    def relay_apply_to_stage1(self):
        if self.is_running:
            Toast.show(self.root, "⚠️ 背景任務執行中，禁止寫入提案框！", bg="#f59e0b", fg="#000000")
            return
        relay_text = self.txt_relay.get("1.0", tk.END).strip()
        if not relay_text:
            Toast.show(self.root, "⚠️ 外部接力文字框為空，請先貼入外部 AI 回覆內容！", bg="#f59e0b", fg="#000000")
            return
        self._update_text_box(self.txt_stage1, relay_text)
        self.frame_s1.config(text="階段一：工程師修復提案預覽 (Stage 1) [外部接力貼入]")
        self.nb_preview.select(self.tab_preview)
        Toast.show(
            self.root,
            "📥 已貼回至 Stage 1！可按「2️⃣ 僅執行階段二」走 API 審核，或回接力分頁打包 QA 任務包。",
            duration=2800,
            bg="#2563eb",
            fg="#ffffff"
        )
        self.update_status("📥 外部提案已貼回 Stage 1，可執行「2️⃣ 僅執行階段二」或打包 QA 任務包", fg_color="#2563eb")


    def relay_copy_qa(self):
        snapshot, full_prompt, used_placeholder = self._prepare_qa_relay_prompt()
        if not full_prompt:
            return
        if self._copy_text_to_clipboard(full_prompt):
            scope = f"微創切片: [{', '.join(snapshot['active_sections'])}]" if snapshot["is_sliced"] else "全量字典模式"
            if used_placeholder:
                Toast.show(
                    self.root,
                    "⚠️ 階段一提案框為空，已帶入缺省佔位說明組裝 QA 任務包並複製至剪貼簿！",
                    duration=2800,
                    bg="#f59e0b",
                    fg="#000000"
                )
            else:
                Toast.show(self.root, f"📋 已複製 QA 任務包至剪貼簿！({scope})", duration=2200, bg="#2563eb", fg="#ffffff")
            self.update_status(f"📋 已打包 QA 任務包 ({scope}，{len(full_prompt)} 字元)", fg_color="#2563eb")


    def relay_export_qa(self):
        snapshot, full_prompt, used_placeholder = self._prepare_qa_relay_prompt()
        if not full_prompt:
            return
        try:
            os.makedirs(RELAY_EXPORT_DIR, exist_ok=True)
            ts = datetime.now().strftime("%Y%m%d_%H%M%S")
            fname = f"relay_QA_{ts}.txt"
            fpath = os.path.join(RELAY_EXPORT_DIR, fname)
            normalized_lf = full_prompt.replace("\r\n", "\n").replace("\r", "\n")
            with open(fpath, "w", encoding="utf-8-sig", newline="\n") as f:
                f.write(normalized_lf)
            scope = f"微創切片: [{', '.join(snapshot['active_sections'])}]" if snapshot["is_sliced"] else "全量字典模式"
            if used_placeholder:
                Toast.show(
                    self.root,
                    f"⚠️ 階段一提案框為空，已帶入缺省佔位說明並匯出：\nrelay_exports/{fname}",
                    duration=2800,
                    bg="#f59e0b",
                    fg="#000000"
                )
            else:
                Toast.show(self.root, f"💾 已匯出 QA 任務檔：\nrelay_exports/{fname}", duration=2600, bg="#10b981", fg="#ffffff")
            self.update_status(f"💾 已匯出 relay_exports/{fname} ({scope})", fg_color="#059669")
        except Exception as e:
            Toast.show(self.root, f"❌ 匯出 QA 任務檔失敗: {str(e)}", duration=3000, bg="#ef4444", fg="#ffffff")
            self._show_alert_banner("匯出 QA 任務檔失敗", str(e), show_goto_relay=False)


    def relay_open_export_dir(self):
        try:
            os.makedirs(RELAY_EXPORT_DIR, exist_ok=True)
            if os.name == "nt":
                os.startfile(RELAY_EXPORT_DIR)
            elif sys.platform == "darwin":
                subprocess.Popen(["open", RELAY_EXPORT_DIR])
            else:
                subprocess.Popen(["xdg-open", RELAY_EXPORT_DIR])
        except Exception as e:
            Toast.show(self.root, f"❌ 無法開啟匯出資料夾: {str(e)}", duration=2800, bg="#ef4444", fg="#ffffff")


    def _validate_qa_output_blocks(self, qa_output: str):
        """共用靜態檢驗核心：雙錨點唯一性、切分、Markdown 圍欄阻斷、非空檢查與三道靜態語法 Linter"""
        if qa_output.count(self.ANCHOR_TEXT) != 1:
            return False, "雙錨點核驗失敗", f"開頭錨點缺失或出現多次 (count={qa_output.count(self.ANCHOR_TEXT)})！"


        if qa_output.count(self.EOF_MARKER) != 1:
            return False, "雙錨點核驗失敗", f"結尾 EOF 錨點缺失或出現多次 (count={qa_output.count(self.EOF_MARKER)})！"


        try:
            between_text = qa_output.split(self.ANCHOR_TEXT, 1)[1]
            ai_dict_content = between_text.split(self.EOF_MARKER, 1)[0].strip("\r\n")
        except Exception as e:
            return False, "錨點切分失敗", f"雙向錨點切分失敗: {str(e)}"


        if "```" in ai_dict_content:
            return False, "代碼圍欄安全阻斷", "QA 輸出中殘留 Markdown 代碼塊標記 (```)！已終止覆蓋以防壞檔。"


        if not ai_dict_content.strip():
            return False, "空字典內容阻斷", "截取之字典內容為空！"


        is_valid, linter_err = self.validate_dict_syntax(ai_dict_content)
        if not is_valid:
            return False, "靜態語法 Linter 攔截", linter_err


        return True, "", ai_dict_content


    def verify_and_unlock_relay_qa(self):
        if self.is_running:
            Toast.show(self.root, "⚠️ 背景任務執行中，禁止驗證寫入操作！", bg="#f59e0b", fg="#000000")
            return


        qa_output = self.txt_relay.get("1.0", tk.END).strip()
        if not qa_output:
            err_txt = "外部接力貼入區內容為空，請先貼入完整的外部 AI 回覆內容！"
            Toast.show(self.root, f"❌ {err_txt}", duration=3000, bg="#ef4444", fg="#ffffff")
            self._show_alert_banner("外部成果驗證失敗", err_txt, show_goto_relay=False)
            return


        # 檢查並同步/補建基準快照 (確保日誌與目標字典路徑與當前畫面一致)
        current_log = self.txt_log.get("1.0", tk.END).strip()
        current_dict_path = self._norm_path_or_empty(self.config.get("repair_dict_path", ""))
        need_rebuild = (
            self.last_task_snapshot is None
            or self.last_task_snapshot.get("log_content", "") != current_log
            or self._norm_path_or_empty(self.last_task_snapshot.get("repair_dict_path", "")) != current_dict_path
        )


        if need_rebuild:
            try:
                snapshot = self.create_task_snapshot(require_eng_prompt=False, require_qa_prompt=False)
            except Exception as e:
                err_txt = f"建立基準快照失敗: {str(e)}"
                Toast.show(self.root, f"❌ {err_txt}", duration=3000, bg="#ef4444", fg="#ffffff")
                self._show_alert_banner("外部成果基準快照失敗", err_txt, show_goto_relay=False)
                return
        else:
            snapshot = self.last_task_snapshot


        # 1. 共用白箱靜態檢驗 (雙錨點、Markdown 圍欄、非空、三道 Linter)
        is_ok, err_title, res_or_err = self._validate_qa_output_blocks(qa_output)
        if not is_ok:
            Toast.show(self.root, f"❌ 驗證失敗：{res_or_err}", duration=3500, bg="#ef4444", fg="#ffffff")
            self._show_alert_banner(err_title, res_or_err, show_goto_relay=False)
            return


        ai_dict_content = res_or_err


        # 2. 微創切片模式跨區段幽靈/異物分類侵入檢查
        if snapshot["is_sliced"]:
            _, ai_sections_map = self.parse_repair_dict_sections(ai_dict_content)
            active_clean = {k.replace(" ", "") for k in snapshot["active_sections"]}
            orig_clean = {k.replace(" ", "") for k in snapshot["original_sections"].keys()}
            for ai_sec_key in ai_sections_map.keys():
                if ai_sec_key == "__ALL__":
                    continue
                key_clean = ai_sec_key.replace(" ", "")
                if key_clean not in active_clean and key_clean not in orig_clean:
                    err_msg = f"微創切片模式下偵測到不存在於目標字典之異物/虛構分類區塊「{ai_sec_key}」！已阻斷簽發印章。"
                    Toast.show(self.root, f"❌ {err_msg}", duration=3500, bg="#ef4444", fg="#ffffff")
                    self._show_alert_banner("外部成果異物分類阻斷", err_msg, show_goto_relay=False)
                    return


        # 3. 記憶體試縫合預演 (檢驗缺塊與雙重分類數量守恆門禁)
        try:
            self.stitch_repair_sections(
                original_header=snapshot["original_header"],
                original_sections=snapshot["original_sections"],
                active_sections=snapshot["active_sections"],
                ai_output_text=ai_dict_content,
                is_sliced=snapshot["is_sliced"]
            )
        except Exception as e:
            err_msg = f"記憶體試縫合阻斷: {str(e)}"
            Toast.show(self.root, f"❌ {err_msg}", duration=3500, bg="#ef4444", fg="#ffffff")
            self._show_alert_banner("外部成果縫合預演失敗", str(e), show_goto_relay=False)
            return


        # 4. 全數檢驗通過：簽發 R1 SHA-256 數位印章並解鎖預覽框寫入權限
        s2_hash = hashlib.sha256(qa_output.encode("utf-8")).hexdigest()
        snapshot["s2_hash"] = s2_hash
        snapshot["s2_meta"] = {
            "account_name": "外部接力",
            "actual_model": "Web Relay",
            "elapsed_time": 0.0,
            "is_fallback": False
        }
        self.last_task_snapshot = snapshot


        slice_mark = f" | 切片: {', '.join(snapshot['active_sections'])}" if snapshot["is_sliced"] else ""
        title_s2 = f"階段二：QA 審核與最終字典條目 (Stage 2) [外部接力 | Web Relay | 0.0s{slice_mark}]"
        self.frame_s2.config(text=title_s2)
        self._update_text_box(self.txt_stage2, qa_output)


        self._hide_alert_banner()
        self.nb_preview.select(self.tab_preview)
        Toast.show(
            self.root,
            "✅ 外部 QA 成果白箱驗證通過並已簽發印章！請點擊下方綠色按鈕備份存檔。",
            duration=3000,
            bg="#10b981",
            fg="#ffffff"
        )
        self.update_status("🛡️ 外部接力成果已驗證解鎖，請點擊「💾 備份並更新至《嚴格正則修復字典.txt》」完成寫入", fg_color="#059669")


    # -----------------------------------------------------------------------
    # 【安全存檔演算法】(共用靜態檢驗 + 印章核驗 + 動態重讀換檔再解析縫合 + 雙保險原子落盤)
    # -----------------------------------------------------------------------
    def save_and_backup_dict(self):
        if self.is_running:
            Toast.show(self.root, "⚠️ 任務正在執行中，禁止存檔操作！", bg="#f59e0b", fg="#000000")
            return


        if not self.last_task_snapshot:
            err_txt = "無已完成之任務快照！"
            Toast.show(self.root, f"❌ 寫入阻斷：{err_txt}", bg="#ef4444", fg="#ffffff")
            self._show_alert_banner("字典存檔阻斷", err_txt)
            return


        qa_output = self.txt_stage2.get("1.0", tk.END).strip()


        # 共用靜態檢驗核心 (雙錨點、切分、Markdown 圍欄、非空與三道剛性 Linter)
        is_ok, err_title, res_or_err = self._validate_qa_output_blocks(qa_output)
        if not is_ok:
            Toast.show(self.root, f"❌ 寫入阻斷：{res_or_err}", duration=3500, bg="#ef4444", fg="#ffffff")
            self._show_alert_banner(err_title, res_or_err)
            return


        ai_dict_content = res_or_err


        # R1 數位印章核驗
        expected_hash = self.last_task_snapshot.get("s2_hash")
        if not expected_hash:
            err_txt = "缺少有效數位印章，請重新執行階段二或透過外部接力驗證解鎖！"
            Toast.show(self.root, f"❌ 寫入阻斷：{err_txt}", bg="#ef4444", fg="#ffffff")
            self._show_alert_banner("數位印章核驗失敗", err_txt)
            return


        current_hash = hashlib.sha256(qa_output.encode("utf-8")).hexdigest()
        if current_hash != expected_hash:
            err_txt = "預覽框內容已被修改或非本輪任務產出（數位印章不符）！已終止覆蓋。"
            Toast.show(self.root, f"❌ 寫入阻斷：{err_txt}", duration=3500, bg="#ef4444", fg="#ffffff")
            self._show_alert_banner("數位印章核驗失敗", err_txt)
            return


        # 重讀磁碟最新 config.json 動態更新路徑（嚴禁整包覆蓋 self.config，僅同步三個路徑欄位）
        latest_cfg = self.load_config()
        for p_key in ("repair_dict_path", "engineer_prompt_path", "qa_prompt_path"):
            self.config[p_key] = self._norm_path_or_empty(latest_cfg.get(p_key, ""))


        dict_path = self.config["repair_dict_path"]


        # 檢查 Tab 2 是否有未點擊儲存之路徑變更
        unsaved_diffs = []
        if hasattr(self, "entry_dict_path") and self._norm_path_or_empty(self.entry_dict_path.get()) != dict_path:
            unsaved_diffs.append("字典路徑")
        if hasattr(self, "entry_eng_path") and self._norm_path_or_empty(self.entry_eng_path.get()) != self.config["engineer_prompt_path"]:
            unsaved_diffs.append("工程師提示詞路徑")
        if hasattr(self, "entry_qa_path") and self._norm_path_or_empty(self.entry_qa_path.get()) != self.config["qa_prompt_path"]:
            unsaved_diffs.append("QA提示詞路徑")
        if unsaved_diffs:
            Toast.show(
                self.root,
                f"⚠️ 設定頁有未儲存的 {', '.join(unsaved_diffs)} 變更，本次操作將依磁碟 config.json 為準！",
                duration=3000,
                bg="#f59e0b",
                fg="#000000"
            )


        # 目標檔存在性門禁 (中斷時保留 last_task_snapshot，方便修正路徑後直接重試存檔)
        if not dict_path or not os.path.isfile(dict_path):
            err_txt = f"找不到目標字典檔案：{dict_path or '(未設定路徑)'}\n（已保留任務快照，修正路徑並儲存設定後可直接重試存檔）"
            Toast.show(self.root, f"❌ {err_txt}", duration=3500, bg="#ef4444", fg="#ffffff")
            self._show_alert_banner("目標字典檔案缺失", err_txt)
            return


        # 比對目標路徑是否變更，若指向新目標檔則重讀再解析
        snap_dict_path = self._norm_path_or_empty(self.last_task_snapshot.get("repair_dict_path", ""))
        if dict_path == snap_dict_path:
            target_header = self.last_task_snapshot["original_header"]
            target_sections = self.last_task_snapshot["original_sections"]
        else:
            try:
                new_dict_content = self.read_file_content(dict_path, "新目標修復字典")
                target_header, target_sections = self.parse_repair_dict_sections(new_dict_content)
            except Exception as e:
                err_txt = f"讀取或解析新目標字典失敗: {str(e)}"
                Toast.show(self.root, f"❌ {err_txt}", duration=3500, bg="#ef4444", fg="#ffffff")
                self._show_alert_banner("新目標字典解析失敗", str(e))
                return


        # 記憶體原地原子縫合 (實裝雙重分類數量守恆物理熔斷門禁)
        try:
            final_stitched_dict = self.stitch_repair_sections(
                original_header=target_header,
                original_sections=target_sections,
                active_sections=self.last_task_snapshot["active_sections"],
                ai_output_text=ai_dict_content,
                is_sliced=self.last_task_snapshot["is_sliced"]
            )
        except Exception as e:
            err_txt = f"記憶體縫合失敗: {str(e)}"
            Toast.show(self.root, f"❌ {err_txt}", duration=3500, bg="#ef4444", fg="#ffffff")
            self._show_alert_banner("記憶體原地縫合熔斷", str(e))
            return


        # 雙保險原子置換覆蓋寫入 (Copy-on-Write 備份 + 同目錄 .tmp utf-8-sig LF 刷盤原子置換)
        dict_dir = os.path.dirname(dict_path)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        random_id = f"{random.randint(1000, 9999)}"
        temp_file_path = os.path.join(dict_dir, f"{os.path.basename(dict_path)}.tmp_{timestamp}_{random_id}")


        try:
            dict_filename = os.path.basename(dict_path)
            os.makedirs(TOOL_BAK_DIR, exist_ok=True)
            bak_filename = f"{timestamp}_{dict_filename}.bak"
            bak_file_path = os.path.join(TOOL_BAK_DIR, bak_filename)
            shutil.copy2(dict_path, bak_file_path)


            normalized_lf = final_stitched_dict.replace("\r\n", "\n").replace("\r", "\n").strip("\n") + "\n"
            with open(temp_file_path, "w", encoding="utf-8-sig", newline="\n") as f:
                f.write(normalized_lf)
                f.flush()
                os.fsync(f.fileno())


            os.replace(temp_file_path, dict_path)


            # 存檔覆蓋成功，自癒關閉告警橫幅
            self._hide_alert_banner()


            stitch_msg = "微創縫合更新" if self.last_task_snapshot["is_sliced"] else "全量覆蓋更新"
            Toast.show(
                self.root,
                f"✅ 舊檔已備份至 bak/{bak_filename}\n並以【{stitch_msg}】原子寫入字典！",
                duration=2800,
                bg="#10b981",
                fg="#ffffff"
            )
            self.update_status(f"💾 字典檔備份並{stitch_msg}成功！", fg_color="#10b981")
        except Exception as e:
            err_txt = f"備份或存檔失敗: {str(e)}"
            Toast.show(self.root, f"❌ {err_txt}", duration=2500, bg="#ef4444", fg="#ffffff")
            self._show_alert_banner("磁碟寫入與原子置換失敗", str(e))
            self.update_status(f"❌ 存檔失敗: {str(e)[:40]}", fg_color="#dc2626")
        finally:
            if os.path.exists(temp_file_path):
                try:
                    os.remove(temp_file_path)
                except Exception:
                    pass


    def copy_qa_result(self):
        try:
            qa_output = self.txt_stage2.get("1.0", tk.END).strip()
            if not qa_output:
                Toast.show(self.root, "⚠️ QA 最終字典內容為空！", bg="#f59e0b", fg="#000000")
                return


            self.root.clipboard_clear()
            self.root.clipboard_append(qa_output)
            Toast.show(self.root, "📋 QA 最終字典內容已成功複製至剪貼簿！")
        except Exception as e:
            err_summary = str(e).splitlines()[0][:60] if str(e) else "未知錯誤"
            Toast.show(
                self.root,
                f"⚠️ 剪貼簿寫入失敗（可能被其他程式鎖定）：{err_summary}",
                duration=3000,
                bg="#f59e0b",
                fg="#000000"
            )


# ---------------------------------------------------------------------------
# 主程式進入點
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    root = tk.Tk()


    style = ttk.Style()
    if "vista" in style.theme_names():
        style.theme_use("vista")
    elif "clam" in style.theme_names():
        style.theme_use("clam")


    app = NovelRegexToolApp(root)
    root.mainloop()
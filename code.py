# -*- coding: utf-8 -*-
"""
專案名稱：小說繁體化系統 - 正則語意對沖檢測與健康哨兵
檔案名稱：正則衝突檢測守衛.py
模組版本：v1.2.4
標準宣告：符合 v1.2.4 規格，實裝 2026-11 防風控單帳號垂直降階、四維異常分類器、
          SCRIPT_DIR 路徑錨定、動態組態重讀閉環、CLI --cli-check 預檢與 AST 隔離掃描
"""
__version__ = "1.2.4"


import os
import sys


# PyInstaller 與複雜 AST 遞迴展開防護
sys.setrecursionlimit(5000)


import re
import json
import hashlib
import shutil
import time
import threading
import argparse
from typing import List, Dict, Set, Tuple, Optional, Any


# ==============================================================================
# 根目錄與路徑錨定規範 (SCRIPT_DIR & _resolve_app_path)
# ==============================================================================


if getattr(sys, "frozen", False):
    SCRIPT_DIR = os.path.dirname(os.path.abspath(sys.executable))
else:
    SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))


def _resolve_app_path(path_str: str) -> str:
    """解析相對於 SCRIPT_DIR 之路徑；若為空字串則保持空字串，嚴禁退化為 '.'"""
    if not path_str or not path_str.strip():
        return ""
    p = path_str.strip()
    if os.path.isabs(p):
        return p
    return os.path.abspath(os.path.join(SCRIPT_DIR, p))


# ==============================================================================
# GUI 頂層全域依賴導入 (消除深層局部導入所致之 NameError 與二次崩潰)
# ==============================================================================


try:
    import tkinter as tk
    from tkinter import ttk, scrolledtext, messagebox, filedialog
    TK_AVAILABLE = True
except ImportError:
    TK_AVAILABLE = False
    tk = None  # type: ignore
    ttk = None  # type: ignore
    scrolledtext = None  # type: ignore
    messagebox = None  # type: ignore
    filedialog = None  # type: ignore


# ==============================================================================
# 終端機編碼安全防護 (解決 Windows 控制台破字與編碼例外)
# ==============================================================================


IS_WINDOWS = sys.platform.startswith("win")
if IS_WINDOWS:
    try:
        if hasattr(sys.stdout, "reconfigure"):
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        if hasattr(sys.stderr, "reconfigure"):
            sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass


UNICODE_TERMINAL_SUPPORTED = not IS_WINDOWS or (
    hasattr(sys.stdout, "encoding") and sys.stdout.encoding and "utf" in sys.stdout.encoding.lower()
)


def safe_term_str(unicode_char: str, ascii_fallback: str) -> str:
    """Windows 舊版控制台字元退避防護"""
    return unicode_char if UNICODE_TERMINAL_SUPPORTED else ascii_fallback


SYM_SHIELD   = safe_term_str("🛡️", "[GUARD]")
SYM_WARN     = safe_term_str("🚨", "[FAIL]")
SYM_PASS     = safe_term_str("🟢", "[PASS]")
SYM_LOCK     = safe_term_str("🔒", "[LOCKED]")
SYM_TIME     = safe_term_str("⏳", "[WAIT]")
SYM_COPY     = safe_term_str("📋", "[CLIP]")
SYM_ROLLBACK = safe_term_str("⏪", "[ROLLBACK]")
SYM_SAVE     = safe_term_str("💾", "[SAVE]")
SYM_ROBOT    = safe_term_str("🤖", "[AI]")
SYM_TOOL     = safe_term_str("🛠️", "[RELAY]")


# ==============================================================================
# 全域常數與安全退避矩陣定義 (v1.2.4 2026-11 防風控規範)
# ==============================================================================


PRESET_MODELS: List[str] = [
    "gemini-4-hydrogen",
    "gemini-3.8-flash",
    "gemini-3.6-flash",
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite"
]


DEFAULT_CONFUSABLE_PAIRS: List[List[str]] = [
    ["麵", "面"],
    ["隻", "只"],
    ["干", "乾", "幹"],
    ["發", "髮"],
    ["制", "製"],
    ["松", "鬆"],
    ["裡", "里"],
    ["鐘", "鍾"],
    ["板", "闆"],
    ["準", "准"]
]


DEFAULT_CONFIG: Dict[str, Any] = {
    "api_profiles": [
        {"name": "帳號 1", "key": "", "note": "主要帳號"},
        {"name": "帳號 2", "key": "", "note": "備用帳號 A"},
        {"name": "帳號 3", "key": "", "note": "備用帳號 B"}
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
    "dict_path_1": "正則查找字典.txt",
    "dict_path_2": "正則查找字典2.txt",
    "matrix_path": "confusable_matrix.json",
    "radar_engineer_prompt_path": "正則守衛工程師提示詞.txt",
    "radar_qa_prompt_path": "正則守衛QA提示詞.txt",
    "backup_dir": "bak",
    "auto_backup_on_pass": True,
    "bare_affix_len_limit": 1
}


ANCHOR_TEXT = "=== 以下為優化後之完整 PCRE 正則字典條目 ==="
EOF_MARKER = "=== 字典全檔輸出結束 [EOF] ==="


COLOR_SAVE_NORMAL = "#059669"
COLOR_SAVE_WARNING = "#dc2626"


DISPATCH_DESCRIPTIONS = {
    "locked": (
        "【🔒 固定鎖定 (Locked Account) - 2026-11 防風控預設】\n"
        "• 說明：單次任務強制鎖定頂部選定之單一作用帳號執行，徹底切斷同 IP 多 Key 橫向輪詢通道。\n"
        "• 優勢：完美合規 Google 防風控體系，杜絕關聯撞庫誤判與整組金鑰驗證鎖死。"
    ),
    "random": (
        "【🎲 隨機均攤 (Random Dispatch) - 已收斂為單帳號鎖定】\n"
        "• 說明：依 2026-11 防風控規範，線上自癒快照實際僅取用單一鎖定帳號，不執行跨 Key 自動切換。\n"
        "• 建議：請於頂部控制列手動切換作用帳號。"
    ),
    "round_robin": (
        "【🔄 依序輪動 (Round Robin) - 已收斂為單帳號鎖定】\n"
        "• 說明：依 2026-11 防風控規範，線上自癒快照實際僅取用單一鎖定帳號，不執行跨 Key 自動切換。\n"
        "• 建議：請於頂部控制列手動切換作用帳號。"
    )
}


RETRY_ROUTE_DESCRIPTIONS = {
    "vertical_first": (
        "【🛡️ 單帳號垂直降階 (Vertical First) - 2026-11 防風控推薦】\n"
        "• 路線：[單一鎖定帳號: 主模型 ➔ 備援1 ➔ 備援2] 依四維異常分類器精準降階與長冷卻退避。\n"
        "• 優勢：絕不跨帳號橫向輪換，搭配 180s 長冷卻與 5s 雙階緩衝保護金鑰安全。"
    ),
    "quality_locked": (
        "【🚀 品質優先不降 (Quality Locked)】\n"
        "• 路線：僅使用單一鎖定帳號與主力模型進行有限次長週期冷卻重試，不向輕量模型降階。\n"
        "• 優勢：追求 100% 嚴謹的字典質量，寧可長冷卻或轉外部接力亦不降階。"
    ),
    "horizontal_first": (
        "【⚠️ 橫向擴展優先 [已廢棄：2026-11 防風控規範強制改為單帳號垂直降階]】\n"
        "• 說明：同 IP 跨 Key 自動輪詢易觸發風控驗證鎖，執行期已強制收斂為單帳號垂直降階路線。"
    )
}


RISK_CONTROL_TOKENS = [
    "UNUSUAL ACCOUNT ACTIVITY",
    "ACCOUNT VERIFICATION REQUIRED",
    "VERIFY-ACCOUNT",
    "BLOCKED DUE TO ABUSE"
]


DAILY_QUOTA_TOKENS = [
    "GENERATEREQUESTSPERDAY",
    "PERDAY",
    "PER_DAY",
    "DAILY LIMIT"
]


AUTH_KEY_ERROR_TOKENS = [
    "API_KEY_INVALID",
    "PERMISSION_DENIED",
    "API KEY NOT VALID",
    "API KEY EXPIRED"
]


TRANSIENT_ERROR_TOKENS = [
    "503", "UNAVAILABLE", "500", "INTERNAL", "504",
    "DEADLINE_EXCEEDED", "HIGH DEMAND", "EMPTY RESPONSE",
    "TIMEOUT", "TIMED OUT", "READTIMEOUT", "OVERLOADED",
    "429", "RESOURCE_EXHAUSTED"
]


# ==============================================================================
# Gemini SDK 軟降級載入適配器
# ==============================================================================


GENAI_MODE = None
try:
    from google import genai
    from google.genai import types
    GENAI_MODE = "google.genai"
except ImportError:
    try:
        import google.generativeai as legacy_genai
        GENAI_MODE = "google.generativeai"
    except ImportError:
        GENAI_MODE = None


# ==============================================================================
# 模組：非阻塞輕量 Toast 浮圖通知元件
# ==============================================================================


class Toast:
    """非阻塞、置頂、自動銷毀之輕量通知浮圖 (消除侵入式 Modal 彈窗)"""


    @classmethod
    def show(cls, root: Any, message: str, duration: int = 1500,
             bg: str = "#1e293b", fg: str = "#ffffff") -> None:
        if not TK_AVAILABLE or not root:
            return
        try:
            top = tk.Toplevel(root)
            top.overrideredirect(True)
            top.attributes("-topmost", True)
            top.configure(bg=bg)


            lbl = tk.Label(
                top, text=message, bg=bg, fg=fg,
                font=("微軟正黑體", 11, "bold"), padx=18, pady=9
            )
            lbl.pack()


            top.update_idletasks()
            rx = root.winfo_rootx()
            ry = root.winfo_rooty()
            rw = root.winfo_width()
            rh = root.winfo_height()
            tw = top.winfo_width()
            th = top.winfo_height()


            x = rx + max(0, (rw - tw) // 2)
            y = ry + max(0, rh - th - 55)
            top.geometry(f"+{x}+{y}")


            top.after(duration, top.destroy)
        except Exception as e:
            sys.stderr.write(f"[Toast Notice Exception] {e}\n")


# ==============================================================================
# 基礎 I/O 工具：檔案編碼階梯與原子覆寫 (FileEncodingIO)
# ==============================================================================


class FileEncodingIO:
    """讀取支援階梯容錯，寫入強制 utf-8-sig，覆寫保證原子安全"""


    ENCODING_LADDER = ["utf-8-sig", "utf-8", "gbk", "big5"]


    @classmethod
    def read_file(cls, filepath: str) -> str:
        if not os.path.exists(filepath):
            raise FileNotFoundError(f"目標檔案不存在: {filepath}")


        for enc in cls.ENCODING_LADDER:
            try:
                with open(filepath, "r", encoding=enc) as f:
                    return f.read()
            except (UnicodeDecodeError, LookupError):
                continue


        with open(filepath, "r", encoding="utf-8-sig", errors="ignore") as f:
            return f.read()


    @classmethod
    def atomic_write(cls, filepath: str, content: str) -> None:
        """寫入暫存檔再使用 os.replace 進行原子替換，防止斷電造成截斷損壞"""
        dir_name = os.path.dirname(filepath)
        if dir_name and not os.path.exists(dir_name):
            os.makedirs(dir_name, exist_ok=True)


        temp_path = f"{filepath}.tmp_{int(time.time() * 1000)}"
        with open(temp_path, "w", encoding="utf-8-sig", newline="\n") as f:
            f.write(content)
            f.flush()
            os.fsync(f.fileno())


        os.replace(temp_path, filepath)


    @classmethod
    def calculate_md5(cls, filepath: str) -> str:
        if not os.path.exists(filepath):
            return ""
        hasher = hashlib.md5()
        with open(filepath, "rb") as f:
            while chunk := f.read(65536):
                hasher.update(chunk)
        return hasher.hexdigest()


    @classmethod
    def calculate_sha256_text(cls, text: str) -> str:
        return hashlib.sha256(text.encode("utf-8")).hexdigest()


# ==============================================================================
# 配置持久化管理器 (ConfigManager - SCRIPT_DIR 錨定與舊版組態自動遷移)
# ==============================================================================


class ConfigManager:
    """管理 config.json 之自動生成、讀取、深層遞迴補齊與 2026-11 防風控遷移"""


    CONFIG_FILE = os.path.join(SCRIPT_DIR, "config.json")


    @classmethod
    def deep_merge(cls, default_dict: Dict[str, Any], user_dict: Dict[str, Any]) -> Dict[str, Any]:
        """遞迴補齊使用者配置缺失之預設鍵，同時保護使用者既有客製值不被覆蓋"""
        for k, v in default_dict.items():
            if k not in user_dict:
                user_dict[k] = json.loads(json.dumps(v)) if isinstance(v, (dict, list)) else v
            elif isinstance(v, dict) and isinstance(user_dict[k], dict):
                cls.deep_merge(v, user_dict[k])
        return user_dict


    @classmethod
    def _migrate_config(cls, config: Dict[str, Any], is_legacy: Optional[bool] = None) -> bool:
        """執行舊版模型與防風控參數安全遷移收斂"""
        migrated = False


        if is_legacy is None:
            is_legacy = ("request_timeout_seconds" not in config) or (config.get("request_timeout_seconds") is None)


        if config.get("gemini_model") == "gemini-3.7-flash":
            config["gemini_model"] = "gemini-3.8-flash"
            migrated = True


        if config.get("fallback_model_1") == "gemini-3.7-flash":
            config["fallback_model_1"] = "gemini-3.6-flash"
            migrated = True


        fb2 = str(config.get("fallback_model_2", ""))
        if ("3.5-flash" in fb2 and "lite" not in fb2.lower()) or ("3.5-lite" in fb2):
            config["fallback_model_2"] = "gemini-3.5-flash-lite"
            migrated = True


        try:
            delay_val = float(config.get("base_delay_seconds", 180.0))
        except (TypeError, ValueError):
            delay_val = 0.0
        if delay_val < 10.0:
            config["base_delay_seconds"] = 180.0
            migrated = True


        try:
            retries_val = int(config.get("max_retries", 1))
        except (TypeError, ValueError):
            retries_val = 99
        if is_legacy:
            if config.get("max_retries") != 1:
                config["max_retries"] = 1
            migrated = True
        elif retries_val > 5 or retries_val < 1:
            config["max_retries"] = 1
            migrated = True


        if config.get("retry_route_policy") == "horizontal_first":
            config["retry_route_policy"] = "vertical_first"
            migrated = True


        try:
            timeout_val = float(config.get("request_timeout_seconds", 0.0))
        except (TypeError, ValueError):
            timeout_val = 0.0
        if timeout_val < 10.0 or timeout_val > 600.0:
            config["request_timeout_seconds"] = 300.0
            migrated = True


        return migrated


    @classmethod
    def load_config(cls) -> Dict[str, Any]:
        config = json.loads(json.dumps(DEFAULT_CONFIG))
        need_save = False
        is_legacy = False


        if os.path.exists(cls.CONFIG_FILE):
            try:
                content = FileEncodingIO.read_file(cls.CONFIG_FILE)
                data = json.loads(content)
                if isinstance(data, dict):
                    is_legacy = ("request_timeout_seconds" not in data) or (data.get("request_timeout_seconds") is None)
                    missing_keys = [k for k in DEFAULT_CONFIG if k not in data]
                    cls.deep_merge(DEFAULT_CONFIG, data)
                    config = data
                    if missing_keys:
                        need_save = True


                    # 相容舊版單一 api_key 欄位
                    if "api_key" in data and data["api_key"] and isinstance(config.get("api_profiles"), list):
                        if len(config["api_profiles"]) > 0 and not config["api_profiles"][0].get("key"):
                            config["api_profiles"][0]["key"] = data["api_key"]
                            need_save = True
            except Exception as e:
                print(f"{SYM_WARN} [ConfigManager] 設定檔解析失敗 ({e})，使用預設配置。")
        else:
            need_save = True


        # 頂層鍵位保底補齊
        for k, v in DEFAULT_CONFIG.items():
            if k not in config:
                config[k] = json.loads(json.dumps(v)) if isinstance(v, (dict, list)) else v
                need_save = True


        # 確保 api_profiles 至少具備 3 組標準槽位
        if not isinstance(config.get("api_profiles"), list) or len(config["api_profiles"]) < 3:
            profiles = config.get("api_profiles", [])
            if not isinstance(profiles, list):
                profiles = []
            while len(profiles) < 3:
                idx = len(profiles) + 1
                profiles.append({"name": f"帳號 {idx}", "key": "", "note": f"備用帳號 {idx}"})
            config["api_profiles"] = profiles
            need_save = True


        if cls._migrate_config(config, is_legacy=is_legacy):
            need_save = True


        if need_save:
            cls.save_config(config)


        return config


    @classmethod
    def save_config(cls, config: Dict[str, Any]) -> None:
        try:
            content = json.dumps(config, indent=2, ensure_ascii=False)
            FileEncodingIO.atomic_write(cls.CONFIG_FILE, content)
        except Exception as e:
            print(f"{SYM_WARN} [ConfigManager] 設定檔儲存失敗: {e}")


# ==============================================================================
# 提示詞自適應路徑嗅探器 (PromptPathResolver)
# ==============================================================================


class PromptPathResolver:
    """提示詞父目錄自動嗅探引擎，精準匹配最新版並排除舊版與拓荒版"""


    @classmethod
    def resolve_prompt_path(cls, configured_path: str, role_type: str) -> str:
        anchored_path = _resolve_app_path(configured_path)
        if anchored_path and os.path.exists(anchored_path):
            return os.path.abspath(anchored_path)


        base_dir = os.path.dirname(anchored_path) if anchored_path else SCRIPT_DIR
        candidates_dirs = [base_dir, SCRIPT_DIR, os.path.join(SCRIPT_DIR, ".."), os.getcwd(), os.path.join(os.getcwd(), "..")]


        target_keyword = "工程師" if role_type == "eng" else "QA"


        seen_dirs = set()
        for c_dir in candidates_dirs:
            abs_dir = os.path.abspath(c_dir)
            if abs_dir in seen_dirs or not os.path.exists(abs_dir):
                continue
            seen_dirs.add(abs_dir)


            matched_files = []
            try:
                for fname in os.listdir(abs_dir):
                    if not fname.endswith(".txt"):
                        continue
                    if ("正則守衛" in fname or "階段三" in fname) and target_keyword in fname:
                        if "拓荒" in fname or "舊版" in fname or "bak" in fname.lower():
                            continue
                        full_p = os.path.join(abs_dir, fname)
                        if os.path.isfile(full_p):
                            matched_files.append(full_p)
            except Exception:
                pass


            if matched_files:
                matched_files.sort(key=lambda p: os.path.getmtime(p), reverse=True)
                return os.path.abspath(matched_files[0])


        return anchored_path


# ==============================================================================
# 輔助演算法：對偶字輸入智能解析切分 (Smart Matrix Parser)
# ==============================================================================


def parse_confusable_input(raw_text: str) -> List[str]:
    """
    智能解析使用者輸入的對偶字文字：
    支援常見分隔符號（逗號、分號、空格、Tab、斜線、頓號等）以及連續純漢字分割。
    """
    cleaned = raw_text.strip()
    if not cleaned:
        return []
    tokens = re.split(r'[,;|\s/，；、\t]+', cleaned)
    chars = [t.strip() for t in tokens if t.strip()]
    if len(chars) == 1 and len(chars[0]) >= 2:
        chars = re.findall(r'[\u4e00-\u9fff]', chars[0])
    seen = set()
    unique_chars = []
    for ch in chars:
        if ch and ch not in seen:
            seen.add(ch)
            unique_chars.append(ch)
    return unique_chars


# ==============================================================================
# Module 1：矩陣解析與對偶管理模組 (MatrixManager)
# ==============================================================================


class MatrixManager:
    """管理高危易混淆對偶字集合，若檔案不存在自動生成初始模板"""


    def __init__(self, matrix_path: str = "confusable_matrix.json"):
        self.matrix_path = _resolve_app_path(matrix_path) or os.path.join(SCRIPT_DIR, "confusable_matrix.json")
        self.pairs: List[List[str]] = []
        self.confusable_map: Dict[str, Set[str]] = {}
        self.all_confusable_chars: Set[str] = set()
        self.load_matrix()


    def load_matrix(self) -> None:
        raw_pairs = []
        target_path = self.matrix_path
        if target_path and os.path.exists(target_path):
            try:
                content = FileEncodingIO.read_file(target_path)
                data = json.loads(content)
                if isinstance(data, dict) and "pairs" in data and isinstance(data["pairs"], list):
                    raw_pairs = data["pairs"]
                elif isinstance(data, list):
                    raw_pairs = data
            except Exception as e:
                print(f"{SYM_WARN} [MatrixManager] 矩陣結構解析失敗 ({e})，降級至內建備援。")
        elif target_path:
            try:
                init_template = {
                    "version": __version__,
                    "description": "小說繁體化系統高危易混淆對偶字矩陣表",
                    "pairs": DEFAULT_CONFUSABLE_PAIRS
                }
                FileEncodingIO.atomic_write(target_path, json.dumps(init_template, indent=2, ensure_ascii=False))
                print(f"{SYM_SHIELD} [MatrixManager] 已於本機自動生成矩陣模板: {target_path}")
            except Exception:
                pass


        if not raw_pairs:
            raw_pairs = DEFAULT_CONFUSABLE_PAIRS


        self.pairs = []
        self.confusable_map = {}
        self.all_confusable_chars = set()
        for group in raw_pairs:
            if not isinstance(group, list):
                continue
            cleaned = [str(ch).strip() for ch in group if len(str(ch).strip()) > 0]
            if len(cleaned) >= 2:
                self.pairs.append(cleaned)
                unique_set = set(cleaned)
                self.all_confusable_chars.update(unique_set)
                for char in unique_set:
                    if char not in self.confusable_map:
                        self.confusable_map[char] = set()
                    self.confusable_map[char].update(unique_set - {char})


    def get_counterparts(self, char: str) -> Set[str]:
        return self.confusable_map.get(char, set())


# ==============================================================================
# 正則片段詞彙遞迴展開輔助引擎 (AST Fragment Unwrapper)
# ==============================================================================


def expand_regex_fragment(frag: str) -> Set[str]:
    """
    精確遞迴展開正則片段中的漢字詞彙集合：
    支援非捕獲括號、任意深度巢狀括號 (?:...)、字元集 [...]、量詞 ? 及純漢字文字，
    自動過濾正則錨點與元標記，產出純漢字詞項。
    """
    frag = frag.strip()
    if not frag:
        return set()


    # 剝離邊界元標記
    frag = re.sub(r'\\[bBAZz]', '', frag)
    frag = re.sub(r'[\^$]', '', frag)


    def parse_expr(s: str, pos: int) -> Tuple[List[List[Set[str]]], int]:
        alternatives: List[List[Set[str]]] = [[]]
        n = len(s)


        while pos < n:
            ch = s[pos]
            if ch == ')':
                break
            elif ch == '|':
                alternatives.append([])
                pos += 1
            elif ch == '(':
                if s[pos:].startswith('(?:'):
                    pos += 3
                    sub_alts, new_pos = parse_expr(s, pos)
                    if new_pos < n and s[new_pos] == ')':
                        pos = new_pos + 1
                    else:
                        pos = new_pos


                    is_opt = False
                    if pos < n and s[pos] == '?':
                        is_opt = True
                        pos += 1
                    elif pos < n and s[pos] in ('*', '+'):
                        pos += 1


                    group_words = set()
                    for alt in sub_alts:
                        group_words.update(cartesian_combine(alt))
                    if is_opt:
                        group_words.add("")
                    alternatives[-1].append(group_words)


                elif s[pos:].startswith('(?<='):
                    # 肯定後瞻斷言：內容作為有效前綴約束展開
                    pos += 4
                    sub_alts, new_pos = parse_expr(s, pos)
                    if new_pos < n and s[new_pos] == ')':
                        pos = new_pos + 1
                    else:
                        pos = new_pos
                    group_words = set()
                    for alt in sub_alts:
                        group_words.update(cartesian_combine(alt))
                    alternatives[-1].append(group_words)


                elif s[pos:].startswith('(?=') or s[pos:].startswith('(?!') or s[pos:].startswith('(?<!'):
                    # 穿透跳過前瞻/負向斷言邊界
                    d = 1
                    p = pos + 3
                    if s[pos:].startswith('(?<!'):
                        p = pos + 4
                    while p < n and d > 0:
                        if s[p] == '\\':
                            p += 2
                            continue
                        elif s[p] == '(':
                            d += 1
                        elif s[p] == ')':
                            d -= 1
                        p += 1
                    pos = p
                else:
                    # 一般捕獲組視同非捕獲組處理
                    pos += 1
                    sub_alts, new_pos = parse_expr(s, pos)
                    if new_pos < n and s[new_pos] == ')':
                        pos = new_pos + 1
                    else:
                        pos = new_pos
                    group_words = set()
                    for alt in sub_alts:
                        group_words.update(cartesian_combine(alt))
                    alternatives[-1].append(group_words)


            elif ch == '[':
                pos += 1
                chars = []
                while pos < n and s[pos] != ']':
                    if s[pos] == '\\' and pos + 1 < n:
                        chars.append(s[pos + 1])
                        pos += 2
                    else:
                        chars.append(s[pos])
                        pos += 1
                if pos < n and s[pos] == ']':
                    pos += 1
                is_opt = False
                if pos < n and s[pos] == '?':
                    is_opt = True
                    pos += 1
                elif pos < n and s[pos] in ('*', '+'):
                    pos += 1
                c_set = set(chars)
                if is_opt:
                    c_set.add("")
                alternatives[-1].append(c_set)


            elif ch == '\\':
                if pos + 1 < n:
                    esc_c = s[pos + 1]
                    pos += 2
                    is_opt = False
                    if pos < n and s[pos] == '?':
                        is_opt = True
                        pos += 1
                    s_set = {esc_c}
                    if is_opt:
                        s_set.add("")
                    alternatives[-1].append(s_set)
                else:
                    pos += 1
            else:
                lit_c = ch
                pos += 1
                is_opt = False
                if pos < n and s[pos] == '?':
                    is_opt = True
                    pos += 1
                elif pos < n and s[pos] in ('*', '+'):
                    pos += 1
                l_set = {lit_c}
                if is_opt:
                    l_set.add("")
                alternatives[-1].append(l_set)


        return alternatives, pos


    def cartesian_combine(node_sets: List[Set[str]]) -> Set[str]:
        if not node_sets:
            return {""}
        res = {""}
        for s_set in node_sets:
            new_res = set()
            for r in res:
                for item in s_set:
                    new_res.add(r + item)
            res = new_res
        return res


    alts, _ = parse_expr(frag, 0)
    final_words = set()
    for alt in alts:
        for w in cartesian_combine(alt):
            cleaned = re.sub(r'[^\u4e00-\u9fff]', '', w)
            if cleaned:
                final_words.add(cleaned)
    return final_words


# ==============================================================================
# Module 2：PCRE 字典結構逆向抽取引擎 (DictParserEngine - 頂層分支隔離 AST 架構)
# ==============================================================================


class RegexRuleSlice:
    """封裝單一對偶字之切片結構"""
    def __init__(self, raw_header: str, target_char: str, rule_body: str, line_no: int, source_file: str):
        self.raw_header: str = raw_header.strip()
        self.target_char: str = target_char
        self.rule_body: str = rule_body
        self.line_no: int = line_no
        self.source_file: str = source_file
        self.prefixes: Set[str] = set()
        self.suffixes: Set[str] = set()
        self.contexts: Set[str] = set()
        self.raw_block_text: str = f"; [{raw_header}]\n{rule_body}"


    def merge(self, other: 'RegexRuleSlice') -> None:
        self.prefixes.update(other.prefixes)
        self.suffixes.update(other.suffixes)
        self.contexts.update(other.contexts)
        self.raw_block_text += f"\n\n; [{other.raw_header}] (附加規則 L{other.line_no})\n{other.rule_body}"
        self.rule_body += f"\n{other.rule_body}"


class DictParserEngine:
    """精確解析規範字典之區塊結構，貫徹頂層分支物理隔離與相鄰條目單空行物理保護"""


    BLOCK_REGEX = re.compile(
        r'^;\s*\[((?:\d+\.?\s*)?[^\]]+)\]([^\r\n]*(?:\r?\n(?!;)[^\r\n]*)*)',
        re.MULTILINE
    )


    @classmethod
    def sanitize_legacy_content(cls, content: str) -> Tuple[str, bool]:
        """
        存量字典啟動/健檢自動壓平與單空行排版保護:
        1. 消除「標頭 ; [...] ➔ 空行/破折號說明 ➔ 空行 ➔ (?i)」撕裂排版，壓平為合規排版；
        2. 確保相鄰條目之間嚴格保持恰好 1 個標準空行 (\\n\\n)，收斂多重空行並校準黏合行。
        """
        original_content = content
        pattern = re.compile(
            r'(^;\s*\[(?:\d+\.?\s*)?[^\]]+\])'
            r'([^\r\n]*\r?\n)'
            r'((?:[ \t]*(?:\r?\n|-(?:[^\r\n]*\r?\n)?))*)'
            r'([ \t]*\(\?i\))',
            re.MULTILINE
        )


        def replacer(m):
            header_prefix = m.group(1).rstrip()
            header_suffix = m.group(2).strip()
            middle = m.group(3)
            pcre_start = m.group(4).lstrip()


            desc_parts = []
            if header_suffix:
                desc_parts.append(header_suffix)


            for line in middle.splitlines():
                line_s = line.strip()
                if not line_s or line_s in ("-", "--", "---"):
                    continue
                if line_s.startswith("-"):
                    line_s = line_s[1:].strip()
                if line_s:
                    desc_parts.append(line_s)


            desc_text = " - ".join(desc_parts) if desc_parts else ""
            if desc_text and not desc_text.startswith("-"):
                new_header = f"{header_prefix} - {desc_text}"
            elif desc_text:
                new_header = f"{header_prefix} {desc_text}"
            else:
                new_header = header_prefix


            return f"{new_header}\n{pcre_start}"


        step1 = pattern.sub(replacer, content)


        # 單空行物理邊界正規化
        step1_norm = step1.replace("\r\n", "\n")
        step2 = re.sub(r'\n{3,}', '\n\n', step1_norm)
        step3 = re.sub(r'(?<=[^\n])\n(;\s*\[(?:\d+\.?\s*)?[^\]]+\])', r'\n\n\1', step2)
        step3 = re.sub(r'\n{3,}', '\n\n', step3)


        modified = (step3 != original_content)
        return step3, modified


    @classmethod
    def parse_dictionary(cls, filepath_or_content: str, is_content: bool = False,
                         known_confusables: Optional[Set[str]] = None) -> Dict[str, RegexRuleSlice]:
        if is_content:
            content = filepath_or_content
            filepath = "<in-memory>"
        else:
            filepath = filepath_or_content
            if not filepath or not os.path.exists(filepath):
                return {}
            content = FileEncodingIO.read_file(filepath)


        content, _ = cls.sanitize_legacy_content(content)
        slices: Dict[str, RegexRuleSlice] = {}


        for match in cls.BLOCK_REGEX.finditer(content):
            header = match.group(1).strip()
            raw_body = match.group(2)


            body_lines = raw_body.splitlines()
            cleaned_body_lines = []
            in_pcre = False
            for line in body_lines:
                line_s = line.strip()
                if not in_pcre:
                    if line_s.startswith("(?i)"):
                        in_pcre = True
                        cleaned_body_lines.append(line)
                    elif line_s.startswith(";") or not line_s or line_s in ("-", "--"):
                        continue
                    else:
                        continue
                else:
                    cleaned_body_lines.append(line)


            rule_body = "\n".join(cleaned_body_lines)
            if not rule_body.strip():
                rule_body = raw_body.strip()


            target_char = ""
            if known_confusables:
                for ch in header:
                    if ch in known_confusables:
                        target_char = ch
                        break


            if not target_char:
                cjk_chars = re.findall(r'[\u4e00-\u9fff]', header)
                if not cjk_chars:
                    continue
                target_char = cjk_chars[0]


            line_no = content[:match.start()].count("\n") + 1
            rule_slice = RegexRuleSlice(header, target_char, rule_body, line_no, filepath)
            cls._extract_affixes(rule_slice)


            if target_char in slices:
                slices[target_char].merge(rule_slice)
            else:
                slices[target_char] = rule_slice


        return slices


    @classmethod
    def _split_depth_zero_branches(cls, text: str) -> List[str]:
        """基於括號深度計數狀態機，精確在 depth == 0 時按管道符號 | 切分頂層分支"""
        text = text.strip()
        while True:
            if text.startswith("(?:") and text.endswith(")"):
                depth = 0
                matched = False
                escaped_scan = False
                in_cs = False
                for idx, ch in enumerate(text):
                    if escaped_scan:
                        escaped_scan = False
                        continue
                    if ch == '\\':
                        escaped_scan = True
                        continue
                    elif ch == '[' and not in_cs:
                        in_cs = True
                    elif ch == ']' and in_cs:
                        in_cs = False
                    elif not in_cs and ch == '(':
                        depth += 1
                    elif not in_cs and ch == ')':
                        depth -= 1
                        if depth == 0:
                            if idx == len(text) - 1:
                                matched = True
                            break
                if matched:
                    text = text[3:-1].strip()
                    continue
            break


        depth = 0
        escaped = False
        in_charset = False
        token_buffer = []
        branches = []


        for ch in text:
            if escaped:
                token_buffer.append(ch)
                escaped = False
            elif ch == '\\':
                escaped = True
                token_buffer.append(ch)
            elif ch == '[' and not in_charset:
                in_charset = True
                token_buffer.append(ch)
            elif ch == ']' and in_charset:
                in_charset = False
                token_buffer.append(ch)
            elif in_charset:
                token_buffer.append(ch)
            elif ch == '(':
                depth += 1
                token_buffer.append(ch)
            elif ch == ')':
                depth = max(0, depth - 1)
                token_buffer.append(ch)
            elif ch == '|' and depth == 0:
                b_str = "".join(token_buffer).strip()
                if b_str:
                    branches.append(b_str)
                token_buffer = []
            else:
                token_buffer.append(ch)


        b_str = "".join(token_buffer).strip()
        if b_str:
            branches.append(b_str)
        return branches


    @classmethod
    def _extract_affixes(cls, rule_slice: RegexRuleSlice) -> None:
        """
        頂層分支隔離 AST 掃描架構：
        1. 深度狀態機頂層切分獨立子規則分支，物理阻斷跨分支前綴倒灌後綴；
        2. 展開子分支，精確過濾前後雙向零寬斷言複合環；
        3. 夾心成語/雙向約束結構禁止碎裂為長度 <= 1 的單字裸詞綴；
        4. 穿透負向前瞻提取後續完整詞綴，遞迴展開巢狀括號。
        """
        clean_lines = []
        for line in rule_slice.rule_body.splitlines():
            ls = line.strip()
            if not ls or ls.startswith(";"):
                continue
            clean_lines.append(ls)


        if not clean_lines:
            return


        body_str = "".join(clean_lines)
        body_str = re.sub(r'^\(\?i\)\s*', '', body_str)
        body_str = re.sub(r'\s*\(\*SKIP\)\(\*FAIL\)\s*$', '', body_str)
        body_str = re.sub(r'\s*\(\*FAIL\)\s*$', '', body_str)


        branches = cls._split_depth_zero_branches(body_str)
        target = rule_slice.target_char


        for branch in branches:
            if target not in branch:
                continue


            branch = re.sub(r'\(\*SKIP\)\(\*FAIL\)', '', branch)
            branch = re.sub(r'\(\*FAIL\)', '', branch)


            sub_branches = [branch]
            if branch.startswith("(?:") and branch.endswith(")"):
                unwrapped = branch[3:-1].strip()
                unwrapped_alts = cls._split_depth_zero_branches(unwrapped)
                if len(unwrapped_alts) > 1:
                    sub_branches = unwrapped_alts


            for sub_b in sub_branches:
                if target not in sub_b:
                    continue


                sub_b = sub_b.strip()


                # 形態 D：遠端情境型分支 (帶跨度量詞如 {0,8}?)
                if re.search(rf'{re.escape(target)}\(\?=(?:\[\^[^\]]*\]|[^)])*\{{\d+,\d+\}}', sub_b):
                    lookahead_idx = sub_b.find("(?=")
                    if lookahead_idx != -1:
                        inner_content = sub_b[lookahead_idx + 4:].rstrip(')')
                        words = expand_regex_fragment(inner_content)
                        rule_slice.contexts.update(words)
                    continue


                # 形態 E：前後雙向零寬斷言複合環
                if "(?<=" in sub_b and "(?=" in sub_b:
                    rule_slice.contexts.add(sub_b)
                    continue


                t_idx = sub_b.find(target)
                left_part = sub_b[:t_idx]
                right_part = sub_b[t_idx + len(target):]


                has_cjk_left = bool(re.search(r'[\u4e00-\u9fff]', left_part) or ('[' in left_part and ']' in left_part))
                has_cjk_right = bool(re.search(r'[\u4e00-\u9fff]', right_part))


                if not has_cjk_left and has_cjk_right:
                    # 形態 B：純後綴保護型 (穿透負向前瞻)
                    clean_right = re.sub(r'^(?:\(\?![^)]*\))+', '', right_part).strip()
                    words = expand_regex_fragment(clean_right)
                    rule_slice.suffixes.update(words)


                elif has_cjk_left and not has_cjk_right:
                    # 形態 A：純前綴保護型
                    words = expand_regex_fragment(left_part)
                    rule_slice.prefixes.update(words)


                elif has_cjk_left and has_cjk_right:
                    # 形態 C：夾心成語 / 雙向約束結構
                    words_left = expand_regex_fragment(left_part)
                    clean_right = re.sub(r'^(?:\(\?![^)]*\))+', '', right_part).strip()
                    words_right = expand_regex_fragment(clean_right)


                    for w in words_left:
                        if len(w) >= 2:
                            rule_slice.prefixes.add(w)
                        else:
                            rule_slice.contexts.add(w)


                    for w in words_right:
                        if len(w) >= 2:
                            rule_slice.suffixes.add(w)
                        else:
                            rule_slice.contexts.add(w)


# ==============================================================================
# Module 3：語意對沖檢測核心 (CollisionDetector & AggregatedConflict)
# ==============================================================================


class ConflictItem:
    """單一語意衝突紀錄結構"""
    def __init__(self, target_a: str, target_b: str, conflict_type: str,
                 affix: str, direction: str, slice_a: RegexRuleSlice, slice_b: RegexRuleSlice):
        self.target_a = target_a
        self.target_b = target_b
        self.conflict_type = conflict_type
        self.affix = affix
        self.direction = direction
        self.slice_a = slice_a
        self.slice_b = slice_b


    def is_fatal(self) -> bool:
        return self.conflict_type in (
            "AMPHIBIOUS_BARE_AFFIX", "CROSS_TARGET_INCLUSION",
            "VACUUM_STATE_EMPTY_PATH", "VACUUM_STATE_ZERO_SLICES"
        )


class AggregatedConflict:
    """對偶組聚合衝突結構 (批次自癒單元)"""
    def __init__(self, pair_key: Tuple[str, str], slice_a: RegexRuleSlice, slice_b: RegexRuleSlice):
        self.pair_key: Tuple[str, str] = pair_key
        self.target_a: str = pair_key[0]
        self.target_b: str = pair_key[1]
        self.slice_a: RegexRuleSlice = slice_a
        self.slice_b: RegexRuleSlice = slice_b
        self.fatal_affixes: List[Tuple[str, str]] = []
        self.warning_affixes: List[Tuple[str, str]] = []
        self.inclusions: List[Tuple[str, str]] = []
        self.sub_conflicts: List[ConflictItem] = []


    def add_conflict(self, c: ConflictItem) -> None:
        self.sub_conflicts.append(c)
        if c.conflict_type == "AMPHIBIOUS_BARE_AFFIX":
            if (c.affix, c.direction) not in self.fatal_affixes:
                self.fatal_affixes.append((c.affix, c.direction))
        elif c.conflict_type == "CROSS_TARGET_INCLUSION":
            if (c.affix, c.direction) not in self.inclusions:
                self.inclusions.append((c.affix, c.direction))
        elif c.conflict_type in ("VACUUM_STATE_EMPTY_PATH", "VACUUM_STATE_ZERO_SLICES"):
            if (c.affix, c.direction) not in self.fatal_affixes:
                self.fatal_affixes.append((c.affix, c.direction))
        else:
            if (c.affix, c.direction) not in self.warning_affixes:
                self.warning_affixes.append((c.affix, c.direction))


    def is_fatal(self) -> bool:
        return len(self.fatal_affixes) > 0 or len(self.inclusions) > 0


    def total_fatal_count(self) -> int:
        return len(self.fatal_affixes) + len(self.inclusions)


class CollisionDetector:
    def __init__(self, matrix_mgr: MatrixManager, bare_limit: int = 1):
        self.matrix_mgr = matrix_mgr
        self.bare_limit = bare_limit


    def check(self, slices_map: Dict[str, RegexRuleSlice]) -> Tuple[List[ConflictItem], List[ConflictItem]]:
        fatal_conflicts: List[ConflictItem] = []
        warning_conflicts: List[ConflictItem] = []
        checked_pairs: Set[Tuple[str, str]] = set()


        for char_a, slice_a in slices_map.items():
            counterparts = self.matrix_mgr.get_counterparts(char_a)
            for char_b in counterparts:
                if char_b not in slices_map:
                    continue
                pair_key = tuple(sorted([char_a, char_b]))
                if pair_key in checked_pairs:
                    continue
                checked_pairs.add(pair_key)


                slice_b = slices_map[char_b]


                # 同方向後綴碰撞檢測 (遠端 contexts 不參與致命裸詞綴判定)
                suf_intersect = slice_a.suffixes & slice_b.suffixes
                for affix in suf_intersect:
                    if len(affix) <= self.bare_limit:
                        fatal_conflicts.append(ConflictItem(char_a, char_b, "AMPHIBIOUS_BARE_AFFIX", affix, "後綴", slice_a, slice_b))
                    else:
                        warning_conflicts.append(ConflictItem(char_a, char_b, "CONTEXT_OVERLAP", affix, "後綴", slice_a, slice_b))


                # 同方向前綴碰撞檢測
                pre_intersect = slice_a.prefixes & slice_b.prefixes
                for affix in pre_intersect:
                    if len(affix) <= self.bare_limit:
                        fatal_conflicts.append(ConflictItem(char_a, char_b, "AMPHIBIOUS_BARE_AFFIX", affix, "前綴", slice_a, slice_b))
                    else:
                        warning_conflicts.append(ConflictItem(char_a, char_b, "CONTEXT_OVERLAP", affix, "前綴", slice_a, slice_b))


                # 跨字侵入對沖檢測
                all_affixes_a = slice_a.suffixes | slice_a.prefixes
                all_affixes_b = slice_b.suffixes | slice_b.prefixes


                for affix in all_affixes_a:
                    if char_b in affix:
                        fatal_conflicts.append(ConflictItem(char_a, char_b, "CROSS_TARGET_INCLUSION", affix, f"對偶字 '{char_b}' 侵入 '{char_a}'", slice_a, slice_b))


                for affix in all_affixes_b:
                    if char_a in affix:
                        fatal_conflicts.append(ConflictItem(char_b, char_a, "CROSS_TARGET_INCLUSION", affix, f"對偶字 '{char_a}' 侵入 '{char_b}'", slice_b, slice_a))


        return fatal_conflicts, warning_conflicts


    @classmethod
    def aggregate_conflicts(cls, all_conflicts: List[ConflictItem]) -> List[AggregatedConflict]:
        agg_map: Dict[Tuple[str, str], AggregatedConflict] = {}


        for c in all_conflicts:
            pkey = tuple(sorted([c.target_a, c.target_b]))
            if pkey not in agg_map:
                s_a = c.slice_a if c.slice_a.target_char == pkey[0] else c.slice_b
                s_b = c.slice_b if c.slice_b.target_char == pkey[1] else c.slice_a
                agg_map[pkey] = AggregatedConflict(pkey, s_a, s_b)
            agg_map[pkey].add_conflict(c)


        return list(agg_map.values())


# ==============================================================================
# Module 4：MD5 黃金基準線狀態機 (BaselineStateMachine)
# ==============================================================================


class BaselineStateMachine:
    def __init__(self, backup_dir: str = "bak"):
        self.backup_dir = _resolve_app_path(backup_dir) or os.path.join(SCRIPT_DIR, "bak")
        if not os.path.exists(self.backup_dir):
            os.makedirs(self.backup_dir, exist_ok=True)


    def _get_baseline_path(self, target_filepath: str) -> str:
        base_name = os.path.basename(target_filepath)
        return os.path.join(self.backup_dir, f"last_healthy_{base_name}")


    def _get_md5_path(self, target_filepath: str) -> str:
        name_no_ext = os.path.splitext(os.path.basename(target_filepath))[0]
        return os.path.join(self.backup_dir, f"last_healthy_{name_no_ext}.md5")


    def sync_healthy_baseline(self, filepath: str) -> bool:
        if not filepath or not os.path.exists(filepath):
            return False


        curr_md5 = FileEncodingIO.calculate_md5(filepath)
        md5_file = self._get_md5_path(filepath)
        backup_file = self._get_baseline_path(filepath)


        old_md5 = ""
        if os.path.exists(md5_file):
            try:
                old_md5 = FileEncodingIO.read_file(md5_file).strip()
            except Exception:
                old_md5 = ""


        if curr_md5 != old_md5 or not os.path.exists(backup_file):
            content = FileEncodingIO.read_file(filepath)
            FileEncodingIO.atomic_write(backup_file, content)
            FileEncodingIO.atomic_write(md5_file, curr_md5)
            return True
        return False


    def get_healthy_slice(self, filepath: str, target_char: str, known_confusables: Optional[Set[str]] = None) -> Optional[RegexRuleSlice]:
        if not filepath:
            return None
        backup_file = self._get_baseline_path(filepath)
        if not os.path.exists(backup_file):
            return None
        slices = DictParserEngine.parse_dictionary(backup_file, known_confusables=known_confusables)
        return slices.get(target_char)


    def rollback_to_baseline(self, filepath: str) -> Tuple[bool, str]:
        if not filepath:
            return False, "組態中指定的目標字典路徑為空！"
        filename = os.path.basename(filepath)
        backup_file = self._get_baseline_path(filepath)


        if os.path.exists(backup_file) and os.path.getsize(backup_file) > 0:
            try:
                content = FileEncodingIO.read_file(backup_file)
                FileEncodingIO.atomic_write(filepath, content)
                return True, f"已成功將 {filename} 秒級回滾至黃金基準版本！"
            except Exception as e:
                return False, f"回滾黃金基準檔案失敗: {e}"


        if os.path.exists(self.backup_dir):
            candidate_baks = []
            try:
                for fname in os.listdir(self.backup_dir):
                    if not fname.endswith(".bak"):
                        continue
                    if fname.endswith(f"_{filename}.bak") or (filename in fname and fname.endswith(".bak")):
                        full_p = os.path.join(self.backup_dir, fname)
                        if os.path.isfile(full_p) and os.path.getsize(full_p) > 0:
                            candidate_baks.append(full_p)
            except Exception:
                pass


            if candidate_baks:
                candidate_baks.sort(key=lambda p: os.path.getmtime(p), reverse=True)
                latest_bak = candidate_baks[0]
                try:
                    content = FileEncodingIO.read_file(latest_bak)
                    FileEncodingIO.atomic_write(filepath, content)
                    return True, f"已成功將 {filename} 還原至最新時間戳備份 ({os.path.basename(latest_bak)})！"
                except Exception as e:
                    return False, f"回滾時間戳備份檔案失敗: {e}"


        return False, f"找不到 {filename} 的任何歷史備份檔案！"


# ==============================================================================
# Module 5：微創記憶體手術刀 (SurgicalStitcherEngine - 單空行排版保護)
# ==============================================================================


class SurgicalStitcherEngine:
    """微創手術刀：在記憶體中以新區塊原地置換原字典衝突條目，維持單空行標準分隔"""


    @classmethod
    def sanitize_block_for_ahk(cls, block_text: str) -> str:
        lines = block_text.splitlines()
        header_lines = []
        rule_lines = []
        in_pcre = False


        for line in lines:
            line_str = line.strip()
            if not in_pcre:
                if line_str.startswith("(?i)"):
                    in_pcre = True
                    rule_lines.append(line)
                elif line_str.startswith(";"):
                    header_lines.append(line)
                elif not line_str or line_str in ("-", "--", "---"):
                    continue
                else:
                    if line_str.startswith("-"):
                        clean_desc = line_str[1:].strip()
                        if clean_desc:
                            header_lines.append(f"; - {clean_desc}")
                    else:
                        header_lines.append(f"; {line_str}")
            else:
                rule_lines.append(line)


        clean_headers = [h for h in header_lines if h.strip()]
        clean_rules = [r for r in rule_lines if r.strip()]


        if not clean_headers:
            clean_headers = ["; [優化條目]"]


        merged_header = "\n".join(clean_headers)
        merged_rule = "\n".join(clean_rules)
        return f"{merged_header}\n{merged_rule}".strip()


    @classmethod
    def stitch_blocks(cls, original_full_dict: str, patched_blocks_text: str) -> Tuple[bool, str, str]:
        patched_slices = DictParserEngine.parse_dictionary(patched_blocks_text, is_content=True)
        if not patched_slices:
            return False, original_full_dict, "修復內容中未解析出合法的 PCRE 正則區塊 (; [目標字])。"


        modified_dict = original_full_dict
        replaced_targets = []


        for target_char, patch_slice in patched_slices.items():
            block_pattern = re.compile(
                rf'(^;\s*\[(?:\d+\.?\s*)?[^\]]*{re.escape(target_char)}[^\]]*\][^\r\n]*(?:\r?\n(?!;)[^\r\n]*)*)',
                re.MULTILINE
            )
            matches = list(block_pattern.finditer(modified_dict))
            if not matches:
                continue


            m = matches[0]
            clean_block_str = cls.sanitize_block_for_ahk(patch_slice.raw_block_text)
            modified_dict = modified_dict[:m.start()] + clean_block_str + modified_dict[m.end():]
            replaced_targets.append(f"{target_char} (置換)")


        if not replaced_targets:
            return True, original_full_dict, "目標檔案無對應收錄條目 (唯置換安全跳過，維持 0 變動)"


        modified_dict, _ = DictParserEngine.sanitize_legacy_content(modified_dict)
        return True, modified_dict, f"成功微創縫合標的: {', '.join(replaced_targets)}"


# ==============================================================================
# Module 6：AI 自癒任務書生成器 (SelfHealingPayloadBuilder - 多向對偶防沖注入)
# ==============================================================================


class SelfHealingPayloadBuilder:
    @classmethod
    def build_aggregated_payload(cls, agg: AggregatedConflict, baseline_sm: BaselineStateMachine,
                                 known_confusables: Optional[Set[str]] = None,
                                 matrix_pairs: Optional[List[List[str]]] = None) -> str:
        slice_a = agg.slice_a
        slice_b = agg.slice_b


        golden_a = baseline_sm.get_healthy_slice(slice_a.source_file, slice_a.target_char, known_confusables)
        golden_b = baseline_sm.get_healthy_slice(slice_b.source_file, slice_b.target_char, known_confusables)


        golden_text_a = golden_a.raw_block_text if golden_a else "(無歷史基準備份記錄，請進行單邊保護還原)"
        golden_text_b = golden_b.raw_block_text if golden_b else "(無歷史基準備份記錄，請進行單邊保護還原)"


        fatal_items_str = "\n".join([f"  - 詞綴: '{aff}' (方向: {dirc})" for aff, dirc in agg.fatal_affixes]) or "  - (無)"
        warn_items_str = "\n".join([f"  - 詞綴: '{aff}' (方向: {dirc})" for aff, dirc in agg.warning_affixes]) or "  - (無)"
        inclusions_str = "\n".join([f"  - 詞綴/說明: '{aff}' ({dirc})" for aff, dirc in agg.inclusions]) or "  - (無)"


        all_fatal_tokens = [f"'{aff}'" for aff, _ in agg.fatal_affixes] + [f"'{aff}'" for aff, _ in agg.inclusions]
        token_summary = "、".join(all_fatal_tokens) if all_fatal_tokens else "無"


        multi_hint_section = ""
        if matrix_pairs:
            pair_set = {agg.target_a, agg.target_b}
            for group in matrix_pairs:
                g_set = set(group)
                if pair_set.issubset(g_set) and len(g_set) > 2:
                    related_chars = sorted(list(g_set - pair_set))
                    multi_hint_section = f"""
### ⚠️ 多向對偶關聯防沖提示：
- 本字組隸屬於多向混淆矩陣群組：[{'、'.join(group)}]
- 關聯延伸目標字：[{'、'.join(related_chars)}]
- 修復防禦要求：在微創修復 [{agg.target_a}] 與 [{agg.target_b}] 的同時，必須嚴密防範向其餘關聯字產生語意對沖或排除詞綴衝突，嚴禁修一漏一！
"""
                    break


        payload = f"""# 🚨 正則衝突與語意對沖修復任務書 (Self-Healing Payload - 對偶組批次自癒)

## 一、對偶衝突診斷概要
- 對偶目標字組：[{agg.target_a}] ⮀ [{agg.target_b}]
- 衝突危害統計：致命阻斷項共 {agg.total_fatal_count()} 處，情境警示 {len(agg.warning_affixes)} 處
- 檔案來源標識：
  - [{agg.target_a}] 來自: {os.path.basename(slice_a.source_file)} (第 {slice_a.line_no} 行)
  - [{agg.target_b}] 來自: {os.path.basename(slice_b.source_file)} (第 {slice_b.line_no} 行)
{multi_hint_section}
### 衝突細部清單：
1. 致命單字裸詞綴對沖 ({len(agg.fatal_affixes)} 處):
{fatal_items_str}
2. 跨字同形侵入對沖 ({len(agg.inclusions)} 處):
{inclusions_str}
3. 情境重疊警示 ({len(agg.warning_affixes)} 處):
{warn_items_str}

## 二、衝突現場切片 (Poisoned Slices)
### 當前中毒條目 A ({slice_a.raw_header}):
```pcre
{slice_a.raw_block_text}
```

### 當前中毒條目 B ({slice_b.raw_header}):
```pcre
{slice_b.raw_block_text}
```

## 三、黃金基準線參考 (Golden Baseline Slices)
### 歷史健康條目 A:
```pcre
{golden_text_a}
```

### 歷史健康條目 B:
```pcre
{golden_text_b}
```

## 四、修復防禦契約 (Mandatory Invariants)
1. 【批次全面消解要求】：本對偶組共計檢測出 {agg.total_fatal_count()} 處致命對沖 ({token_summary})。修復時必須**同時消除上述所有衝突詞綴**，嚴禁顧此失彼、修一漏一！
2. 【嚴禁雙向裸詞綴放行】：對偶字兩側絕對禁止同時存在單字長度之裸詞綴（例如單字不得在兩端均設為排除）。
3. 【情境精確化上下文】：若正文必須豁免特定短語，必須攜帶至少 2 字元以上之限定詞彙，嚴禁使用裸字。
4. 【換行存活性與語法保護】：修復輸出必須維持標準 PCRE 格式，維持 `utf-8-sig` 編碼，嚴禁抹除分號標籤與換行邊界。
5. 【AHK 註解規範保護】：註解一律以 `;` 開頭，標頭註解與 `(?i)` 正則式之間嚴禁包含空行或非分號說明行。

請根據上述診斷與防禦契約，一次性產出兩條條目的精確微創修復區塊。
"""
        return payload.strip()


# ==============================================================================
# Module 7：抗焦慮 UX 控制器 (ResilientBackoffController)
# ==============================================================================


class ResilientBackoffController:
    """抗焦慮 UX 控制器：解耦 API 引擎心跳，提供標準每秒喚醒倒數與狀態回呼"""


    @classmethod
    def sleep_with_heartbeat(cls, seconds: float, callback: Optional[Any] = None, message: str = "") -> None:
        remain = int(seconds)
        while remain > 0:
            if callback:
                callback(f"{message} (等待倒數: {remain}s)")
            time.sleep(1.0)
            remain -= 1
        frac = float(seconds) - int(seconds)
        if frac > 0.01:
            time.sleep(frac)
        if callback:
            callback(f"{message} (即將繼續執行...)")


# ==============================================================================
# Module 8：單帳號防風控與四維異常分類 API 引擎 (MultiAccountAPIEngine)
# ==============================================================================


class MultiAccountAPIEngine:
    """實裝 2026-11 防風控單帳號垂直降階、禁絕 SDK 隱形重試與四維異常分類器"""


    @classmethod
    def raw_sdk_call(cls, api_key: str, model_name: str, prompt_text: str,
                     timeout_seconds: float = 300.0) -> str:
        if not GENAI_MODE:
            raise RuntimeError("本機環境尚未安裝 Google Gemini SDK (google-genai 或 google.generativeai)。")


        if GENAI_MODE == "google.genai":
            # 注入 HttpOptions 與 HttpRetryOptions(attempts=1) 禁絕 SDK 內部重試
            http_opts = None
            try:
                retry_opts = types.HttpRetryOptions(attempts=1)
                http_opts = types.HttpOptions(
                    timeout=int(float(timeout_seconds) * 1000),
                    retry_options=retry_opts
                )
            except (AttributeError, TypeError):
                http_opts = None


            if http_opts:
                client = genai.Client(api_key=api_key, http_options=http_opts)
            else:
                client = genai.Client(api_key=api_key)


            response = client.models.generate_content(
                model=model_name,
                contents=prompt_text
            )
            return response.text or ""
        else:
            legacy_genai.configure(api_key=api_key)
            model = legacy_genai.GenerativeModel(model_name)
            try:
                response = model.generate_content(
                    prompt_text,
                    request_options={"timeout": float(timeout_seconds)}
                )
            except TypeError:
                response = model.generate_content(prompt_text)
            return response.text or ""


    @classmethod
    def _build_monotonic_model_ladder(cls, primary_model: str, retry_cfg: Dict[str, Any],
                                      retry_policy: str) -> List[str]:
        """建構防反向升級模型階梯：嚴禁低階備援模型之後排入高階模型"""
        raw_candidates = [primary_model]
        enable_fallback = bool(retry_cfg.get("enable_fallback", True))


        if retry_policy != "quality_locked" and enable_fallback:
            fb1 = retry_cfg.get("fallback_model_1", "")
            fb2 = retry_cfg.get("fallback_model_2", "")
            if fb1:
                raw_candidates.append(fb1)
            if fb2:
                raw_candidates.append(fb2)


        ladder: List[str] = []
        seen: Set[str] = set()
        max_tier_idx = -1


        for m in raw_candidates:
            m_clean = str(m).strip()
            if not m_clean or m_clean in seen:
                continue
            if m_clean in PRESET_MODELS:
                tier_idx = PRESET_MODELS.index(m_clean)
                if tier_idx < max_tier_idx:
                    # 嚴禁低階備援模型之後排入高階模型
                    continue
                max_tier_idx = tier_idx
            seen.add(m_clean)
            ladder.append(m_clean)


        return ladder if ladder else [primary_model]


    @classmethod
    def _classify_exception(cls, err_raw: str) -> str:
        """
        四維風控異常分類判定矩陣：
        回傳分類標籤：RISK_BLOCK | DAILY_QUOTA | INVALID_ARGUMENT | AUTH_ERROR | TRANSIENT | NON_TRANSIENT
        """
        err_str = err_raw.upper()


        # 順位 1：重大風控阻斷
        if any(tok in err_str for tok in RISK_CONTROL_TOKENS):
            return "RISK_BLOCK"


        # 順位 2：每日配額耗盡
        is_429_or_exhausted = ("429" in err_str or "RESOURCE_EXHAUSTED" in err_str)
        if is_429_or_exhausted:
            if any(tok in err_str for tok in DAILY_QUOTA_TOKENS):
                return "DAILY_QUOTA"
            delay_match = re.search(
                r'(?:RETRY\s*(?:IN|AFTER|DELAY)|RETRYDELAY)["\':\s=]*(\d+(?:\.\d+)?)\s*S?',
                err_str
            )
            if delay_match:
                try:
                    if float(delay_match.group(1)) >= 300.0:
                        return "DAILY_QUOTA"
                except ValueError:
                    pass


        # 順位 3：請求格式錯誤
        if "INVALID_ARGUMENT" in err_str and ("API_KEY" not in err_str and "KEY" not in err_str):
            return "INVALID_ARGUMENT"


        # 順位 4：授權與金鑰錯誤 (前置排除 404 / NOT_FOUND)
        if "404" not in err_str and "NOT_FOUND" not in err_str:
            if any(tok in err_str for tok in AUTH_KEY_ERROR_TOKENS) or re.search(r'\b(400|403)\b', err_str):
                return "AUTH_ERROR"


        # 順位 5：暫態錯誤
        if any(tok in err_str for tok in TRANSIENT_ERROR_TOKENS):
            return "TRANSIENT"


        return "NON_TRANSIENT"


    @classmethod
    def call_gemini_api(cls, prompt_text: str, candidate_profiles: List[Dict[str, str]],
                        primary_model: str, retry_cfg: Dict[str, Any],
                        callback_heartbeat: Optional[Any] = None) -> Dict[str, Any]:
        valid_profiles = [p for p in candidate_profiles if p.get("key", "").strip()]
        if not valid_profiles:
            raise ValueError("所有可用帳號之 API Key 均為空，無法發送請求！請至頁籤 2 配置金鑰。")


        # 單帳號鎖定：僅取第一筆帳號，嚴禁跨 Key 自動輪詢
        target_profile = valid_profiles[0]
        acc_name = target_profile.get("name", "帳號 1")
        api_key = target_profile.get("key", "").strip()


        retry_policy = retry_cfg.get("retry_route_policy", "vertical_first")
        if retry_policy == "horizontal_first":
            retry_policy = "vertical_first"


        try:
            max_retries = max(1, min(5, int(retry_cfg.get("max_retries", 1))))
        except (TypeError, ValueError):
            max_retries = 1


        try:
            base_delay = max(10.0, float(retry_cfg.get("base_delay_seconds", 180.0)))
        except (TypeError, ValueError):
            base_delay = 180.0


        try:
            timeout_seconds = max(10.0, float(retry_cfg.get("request_timeout_seconds", 300.0)))
        except (TypeError, ValueError):
            timeout_seconds = 300.0


        model_ladder = cls._build_monotonic_model_ladder(primary_model, retry_cfg, retry_policy)
        t_start = time.time()
        last_err_msg = ""


        for m_idx, curr_model in enumerate(model_ladder):
            has_next_model = (m_idx + 1 < len(model_ladder))


            for attempt in range(1, max_retries + 1):
                if callback_heartbeat:
                    callback_heartbeat(
                        f"單帳號呼叫: [{acc_name}] ➔ {curr_model} (輪次 {attempt}/{max_retries})"
                    )


                try:
                    res_text = cls.raw_sdk_call(
                        api_key, curr_model, prompt_text, timeout_seconds=timeout_seconds
                    )
                    if not res_text.strip():
                        raise RuntimeError("API 回傳空文字 (EMPTY RESPONSE)")


                    elapsed = time.time() - t_start
                    return {
                        "text": res_text,
                        "actual_account": acc_name,
                        "actual_model": curr_model,
                        "elapsed_time": round(elapsed, 2),
                        "is_fallback": (m_idx > 0)
                    }
                except Exception as e:
                    err_raw = str(e)
                    last_err_msg = err_raw
                    err_class = cls._classify_exception(err_raw)


                    if err_class == "RISK_BLOCK":
                        raise RuntimeError(f"🚨 觸發 Google 風控重大阻斷: {err_raw}")


                    if err_class == "DAILY_QUOTA":
                        if has_next_model:
                            if callback_heartbeat:
                                callback_heartbeat(
                                    f"每日配額耗盡，0 秒立即垂直降階 ➔ {model_ladder[m_idx + 1]}"
                                )
                            break
                        raise RuntimeError(f"每日配額已耗盡且無可用備援模型: {err_raw}")


                    if err_class in ("INVALID_ARGUMENT", "AUTH_ERROR"):
                        raise e


                    if err_class == "TRANSIENT":
                        if attempt < max_retries or has_next_model:
                            ResilientBackoffController.sleep_with_heartbeat(
                                base_delay,
                                callback=callback_heartbeat,
                                message=f"[{acc_name} | {curr_model}] 長週期冷卻退避"
                            )
                            if attempt < max_retries:
                                continue
                            else:
                                if callback_heartbeat and has_next_model:
                                    callback_heartbeat(f"垂直降階備援模型 ➔ {model_ladder[m_idx + 1]}")
                                break
                        else:
                            raise RuntimeError(f"暫態錯誤重試與模型階梯已耗盡: {err_raw}")


                    # NON_TRANSIENT (如 404 NOT_FOUND 或其他未歸類例外)
                    if has_next_model and ("404" in err_raw.upper() or "NOT_FOUND" in err_raw.upper()):
                        if callback_heartbeat:
                            callback_heartbeat(f"模型端點不存在，垂直降階 ➔ {model_ladder[m_idx + 1]}")
                        break
                    raise e


        raise RuntimeError(f"模型階梯執行完畢仍未成功 ({last_err_msg or '未知錯誤'})。請檢查網路、金鑰或改採外部接力。")


# ==============================================================================
# Module 9：抗焦慮即時碼錶 (LiveThinkingStopwatch)
# ==============================================================================


class LiveThinkingStopwatch:
    def __init__(self, callback_tick: Any):
        self.callback_tick = callback_tick
        self.is_running = False
        self.start_time = 0.0
        self._thread: Optional[threading.Thread] = None


    def start(self) -> None:
        self.is_running = True
        self.start_time = time.time()
        self._thread = threading.Thread(target=self._run_loop, daemon=True)
        self._thread.start()


    def _run_loop(self) -> None:
        while self.is_running:
            elapsed = int(time.time() - self.start_time)
            if self.callback_tick and self.is_running:
                self.callback_tick(elapsed)
            time.sleep(1.0)


    def stop(self) -> int:
        self.is_running = False
        total = int(time.time() - self.start_time) if self.start_time > 0 else 0
        return total


# ==============================================================================
# 零侵入整合介面 (Standalone Defense Interceptors)
# ==============================================================================


def check_dictionaries(paths: List[str], auto_backup: bool = True,
                       matrix_path: str = "confusable_matrix.json") -> Tuple[bool, List[ConflictItem], List[ConflictItem]]:
    resolved_matrix = matrix_path if (os.path.isabs(matrix_path) or os.path.exists(matrix_path)) else _resolve_app_path(matrix_path)
    matrix_mgr = MatrixManager(resolved_matrix)
    detector = CollisionDetector(matrix_mgr, bare_limit=1)
    baseline_sm = BaselineStateMachine("bak")


    all_slices: Dict[str, RegexRuleSlice] = {}
    valid_paths: List[str] = [p for p in paths if p and os.path.exists(p)]
    sanitized_records: Dict[str, Tuple[str, bool]] = {}


    for p in valid_paths:
        raw_content = FileEncodingIO.read_file(p)
        clean_content, modified = DictParserEngine.sanitize_legacy_content(raw_content)
        sanitized_records[p] = (clean_content, modified)


        parsed = DictParserEngine.parse_dictionary(clean_content, is_content=True, known_confusables=matrix_mgr.all_confusable_chars)
        for char, rule_slice in parsed.items():
            rule_slice.source_file = p
            if char in all_slices:
                all_slices[char].merge(rule_slice)
            else:
                all_slices[char] = rule_slice


    fatal_list, warning_list = detector.check(all_slices)


    has_valid_data = len(valid_paths) > 0 and len(all_slices) > 0
    is_healthy = has_valid_data and (len(fatal_list) == 0)


    if not has_valid_data:
        fallback_path = paths[0] if paths else "unknown_dict.txt"
        if len(valid_paths) == 0:
            dummy_slice = RegexRuleSlice(raw_header="VACUUM_GUARD", target_char="?", rule_body="", line_no=0, source_file=fallback_path)
            fatal_list.append(ConflictItem(
                "SYSTEM", "DICT", "VACUUM_STATE_EMPTY_PATH",
                "指定字典檔案皆不存在", "全域檔案檢測", dummy_slice, dummy_slice
            ))
        elif len(all_slices) == 0:
            dummy_slice = RegexRuleSlice(raw_header="VACUUM_GUARD", target_char="?", rule_body="", line_no=0, source_file=valid_paths[0])
            fatal_list.append(ConflictItem(
                "SYSTEM", "DICT", "VACUUM_STATE_ZERO_SLICES",
                "字典未解析出任何有效正則條目 (0 位元組或格式損壞)", "條目解析檢測", dummy_slice, dummy_slice
            ))


    if is_healthy:
        for p in valid_paths:
            clean_c, mod = sanitized_records.get(p, ("", False))
            if mod and clean_c:
                FileEncodingIO.atomic_write(p, clean_c)
            if auto_backup:
                baseline_sm.sync_healthy_baseline(p)


    return is_healthy, fatal_list, warning_list


def verify_and_block_on_collision(dict_paths: List[str], auto_wakeup_gui: bool = True) -> Tuple[bool, str]:
    config = ConfigManager.load_config()
    matrix_path = _resolve_app_path(config.get("matrix_path", "confusable_matrix.json"))
    is_healthy, fatals, _ = check_dictionaries(dict_paths, auto_backup=False, matrix_path=matrix_path)


    if is_healthy:
        return True, "全字典健康"


    vacuum_errs = [c.affix for c in fatals if c.conflict_type.startswith("VACUUM_STATE")]
    if vacuum_errs:
        msg = f"阻斷存檔：{vacuum_errs[0]}"
    else:
        msg = f"檢測到 {len(fatals)} 組致命語意對沖！已物理阻斷存檔"


    if auto_wakeup_gui and TK_AVAILABLE:
        try:
            root = tk.Tk()
            SentinelGUI(root, config)
            root.mainloop()
        except Exception:
            pass


    return False, msg


# ==============================================================================
# Module 10：GUI 控制台與接力自癒工作流 (SentinelGUI v1.2.4)
# ==============================================================================


class SentinelGUI:
    """獨立 Tkinter 視覺化桌面控制台 (v1.2.4 防風控單帳號與動態組態閉環版)"""


    FONT_NORMAL = ("微軟正黑體", 11)
    FONT_BOLD   = ("微軟正黑體", 11, "bold")
    FONT_TITLE  = ("微軟正黑體", 12, "bold")
    FONT_CODE   = ("Consolas", 12)
    FONT_CARD   = ("微軟正黑體", 11)


    def __init__(self, root: Any, config: Dict[str, Any]):
        self.root = root
        self.config = config
        self.matrix_mgr = MatrixManager(_resolve_app_path(self.config.get("matrix_path", "confusable_matrix.json")))
        self.baseline_sm = BaselineStateMachine(_resolve_app_path(self.config.get("backup_dir", "bak")))
        self.detector = CollisionDetector(self.matrix_mgr, bare_limit=int(self.config.get("bare_affix_len_limit", 1)))


        self.fatal_conflicts: List[ConflictItem] = []
        self.warning_conflicts: List[ConflictItem] = []
        self.aggregated_conflicts: List[AggregatedConflict] = []
        self.current_selected_agg: Optional[AggregatedConflict] = None


        self.is_running = False
        self.rr_counter = 0
        self.last_task_snapshot: Optional[Dict[str, Any]] = None


        self._setup_window()
        self._build_ui()
        self.trigger_health_check_async()


    def _setup_window(self) -> None:
        self.root.title(f"{SYM_SHIELD} 《正則語意對沖檢測與健康哨兵》 v{__version__}")
        self.root.geometry("1280x940")
        self.root.minsize(1080, 750)
        self.root.protocol("WM_DELETE_WINDOW", self._on_close_window)


        if IS_WINDOWS:
            try:
                import ctypes
                ctypes.windll.shcore.SetProcessDpiAwareness(1)
            except Exception:
                pass


        self.root.deiconify()
        self.root.lift()
        self.root.focus_force()


    def _build_ui(self) -> None:
        self.style = ttk.Style(self.root)
        self.style.theme_use("clam")


        self.style.configure(".", font=self.FONT_NORMAL)
        self.style.configure("Treeview", font=self.FONT_NORMAL, rowheight=32)
        self.style.configure("Treeview.Heading", font=self.FONT_BOLD)
        self.style.configure("TNotebook.Tab", font=self.FONT_BOLD, padding=[16, 7])
        self.style.configure("TLabelframe.Label", font=self.FONT_BOLD)


        # ----------------------------------------------------------------------
        # 層級 1：頂部控制列 (top_bar)
        # ----------------------------------------------------------------------
        top_bar = ttk.Frame(self.root, padding=8)
        top_bar.pack(fill=tk.X, side=tk.TOP, padx=12, pady=6)


        ttk.Label(top_bar, text="作用帳號:", font=self.FONT_BOLD).pack(side=tk.LEFT, padx=4)
        self.combo_top_account = ttk.Combobox(top_bar, width=22, state="readonly", font=self.FONT_NORMAL)
        self.combo_top_account.pack(side=tk.LEFT, padx=4)
        self.combo_top_account.bind("<<ComboboxSelected>>", self._on_top_account_changed)


        ttk.Label(top_bar, text="主要模型:", font=self.FONT_BOLD).pack(side=tk.LEFT, padx=6)
        self.combo_top_model = ttk.Combobox(
            top_bar, width=20, font=self.FONT_NORMAL,
            values=PRESET_MODELS
        )
        self.combo_top_model.set(self.config.get("gemini_model", "gemini-3.8-flash"))
        self.combo_top_model.pack(side=tk.LEFT, padx=4)


        self.btn_save_top = ttk.Button(top_bar, text=f"{SYM_SAVE} 儲存頂部", command=self._on_save_top_config)
        self.btn_save_top.pack(side=tk.LEFT, padx=5)


        self.btn_top_test = ttk.Button(top_bar, text="🔌 連通測試", command=self._on_test_api_connection)
        self.btn_top_test.pack(side=tk.LEFT, padx=5)


        if GENAI_MODE == "google.genai":
            sdk_text = "SDK: google.genai"
            sdk_color = "#059669"
        elif GENAI_MODE == "google.generativeai":
            sdk_text = "SDK: google.generativeai"
            sdk_color = "#2563eb"
        else:
            sdk_text = "SDK: 未安裝 (純離線模式)"
            sdk_color = "#dc2626"


        self.lbl_sdk_status = tk.Label(
            top_bar, text=sdk_text, font=self.FONT_BOLD, fg=sdk_color
        )
        self.lbl_sdk_status.pack(side=tk.LEFT, padx=10)


        self.btn_scan = tk.Button(
            top_bar, text="🔍 立即全域健檢",
            bg="#059669", fg="#ffffff", activebackground="#047857", activeforeground="#ffffff",
            font=self.FONT_BOLD, relief=tk.RAISED, cursor="hand2", padx=10, pady=2,
            command=self.trigger_health_check_async
        )
        self.btn_scan.pack(side=tk.RIGHT, padx=4)


        # ----------------------------------------------------------------------
        # 層級 2：全域常駐底欄 (global_bottom_bar)
        # ----------------------------------------------------------------------
        global_bottom_bar = ttk.Frame(self.root, padding=(12, 6, 12, 8))
        global_bottom_bar.pack(fill=tk.X, side=tk.BOTTOM)


        bottom_btn_frame = ttk.Frame(global_bottom_bar)
        bottom_btn_frame.pack(side=tk.RIGHT)


        self.btn_stitch_save = tk.Button(
            bottom_btn_frame, text=f"{SYM_SAVE} 微創縫合更新字典",
            bg="#94a3b8", fg="#ffffff", activebackground="#64748b", activeforeground="#ffffff",
            font=self.FONT_BOLD, relief=tk.RAISED, state=tk.DISABLED, cursor="hand2", padx=10, pady=4,
            command=self._on_save_stitched_dict
        )
        self.btn_stitch_save.pack(side=tk.RIGHT, padx=4)


        self.btn_rollback = tk.Button(
            bottom_btn_frame, text=f"{SYM_ROLLBACK} 一鍵回滾",
            bg="#dc2626", fg="#ffffff", activebackground="#b91c1c", activeforeground="#ffffff",
            font=self.FONT_BOLD, relief=tk.RAISED, cursor="hand2", padx=10, pady=4,
            state=tk.DISABLED, command=self._on_rollback
        )
        self.btn_rollback.pack(side=tk.RIGHT, padx=4)


        self.btn_copy_prompt = tk.Button(
            bottom_btn_frame, text=f"{SYM_COPY} 複製 Payload",
            bg="#475569", fg="#ffffff", activebackground="#334155", activeforeground="#ffffff",
            font=self.FONT_BOLD, relief=tk.RAISED, cursor="hand2", padx=10, pady=4,
            state=tk.DISABLED, command=self._on_copy_payload
        )
        self.btn_copy_prompt.pack(side=tk.RIGHT, padx=4)


        self.btn_heal_auto = tk.Button(
            bottom_btn_frame, text=f"{SYM_ROBOT} 一鍵雙階自癒",
            bg="#2563eb", fg="#ffffff", activebackground="#1d4ed8", activeforeground="#ffffff",
            font=self.FONT_BOLD, relief=tk.RAISED, cursor="hand2", padx=14, pady=4,
            state=tk.DISABLED, command=self._run_auto_healing_pipeline
        )
        self.btn_heal_auto.pack(side=tk.RIGHT, padx=6)


        self.lbl_status = tk.Label(
            global_bottom_bar, text=f"{SYM_TIME} 系統就緒",
            font=self.FONT_NORMAL, fg="#334155", anchor="w"
        )
        self.lbl_status.pack(side=tk.LEFT, fill=tk.X, expand=True)


        # ----------------------------------------------------------------------
        # 層級 3：中央 Notebook 分頁容器 (notebook_main)
        # ----------------------------------------------------------------------
        self.notebook_main = ttk.Notebook(self.root)
        self.notebook_main.pack(fill=tk.BOTH, expand=True, padx=12, pady=4)


        self.tab1 = ttk.Frame(self.notebook_main)
        self.tab2 = ttk.Frame(self.notebook_main)
        self.tab3 = ttk.Frame(self.notebook_main)


        self.notebook_main.add(self.tab1, text="  📑 衝突監控與自癒作業區  ")
        self.notebook_main.add(self.tab2, text="  ⚙️ 單帳號鎖定、提示詞與防風控策略  ")
        self.notebook_main.add(self.tab3, text="  🗂️ 易混淆對偶字矩陣管理  ")


        self._build_tab1(self.tab1)
        self._build_tab2(self.tab2)
        self._build_tab3(self.tab3)
        self._refresh_top_account_combo()


    # ==========================================================================
    # Tab 1 構建：衝突清單、獨立告警橫幅與五分頁預覽區 (Bottom-First 接力修補)
    # ==========================================================================
    def _build_tab1(self, parent: Any) -> None:
        self.paned_tab1 = ttk.PanedWindow(parent, orient=tk.VERTICAL)
        self.paned_tab1.pack(fill=tk.BOTH, expand=True, padx=6, pady=6)


        frame_tree = ttk.LabelFrame(self.paned_tab1, text=" 🚨 易混淆對偶組衝突清單 (點選對偶組一次性加載全量衝突現場) ", padding=6)
        self.paned_tab1.add(frame_tree, weight=2)


        tree_container = ttk.Frame(frame_tree)
        tree_container.pack(fill=tk.BOTH, expand=True)


        cols = ("target_pair", "total_fatal", "fatal_affixes", "inclusions", "warnings", "source_a", "source_b")
        self.tree = ttk.Treeview(tree_container, columns=cols, show="headings", selectmode="browse")
        self.tree.heading("target_pair", text="目標對偶組")
        self.tree.heading("total_fatal", text="致命衝突總數")
        self.tree.heading("fatal_affixes", text="致命詞綴集合 (裸詞綴)")
        self.tree.heading("inclusions", text="跨字侵入詞綴")
        self.tree.heading("warnings", text="情境重疊警示")
        self.tree.heading("source_a", text="來源 A")
        self.tree.heading("source_b", text="來源 B")


        self.tree.column("target_pair", width=160, anchor=tk.CENTER)
        self.tree.column("total_fatal", width=110, anchor=tk.CENTER)
        self.tree.column("fatal_affixes", width=200, anchor=tk.W)
        self.tree.column("inclusions", width=140, anchor=tk.W)
        self.tree.column("warnings", width=140, anchor=tk.W)
        self.tree.column("source_a", width=170, anchor=tk.W)
        self.tree.column("source_b", width=170, anchor=tk.W)


        tree_scroll_y = ttk.Scrollbar(tree_container, orient=tk.VERTICAL, command=self.tree.yview)
        self.tree.configure(yscrollcommand=tree_scroll_y.set)
        self.tree.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        tree_scroll_y.pack(side=tk.RIGHT, fill=tk.Y)
        self.tree.bind("<<TreeviewSelect>>", self._on_tree_select)


        self.alert_banner = tk.Frame(
            parent, bg="#fef2f2", highlightbackground="#f87171",
            highlightthickness=1, padx=8, pady=4
        )


        self.lbl_alert_msg = tk.Label(
            self.alert_banner, text="", bg="#fef2f2", fg="#b91c1c",
            font=self.FONT_BOLD, anchor="w"
        )
        self.lbl_alert_msg.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=4)


        self.btn_goto_relay = tk.Button(
            self.alert_banner, text="🛠️ 前往外部接力 ➔",
            bg="#dc2626", fg="#ffffff", activebackground="#b91c1c", activeforeground="#ffffff",
            font=self.FONT_BOLD, relief=tk.RAISED, cursor="hand2", padx=8, pady=1,
            command=self._goto_relay_tab
        )
        self.btn_goto_relay.pack(side=tk.RIGHT, padx=4)


        self.btn_close_alert = tk.Button(
            self.alert_banner, text="✕",
            bg="#fef2f2", fg="#991b1b", activebackground="#fee2e2",
            font=self.FONT_BOLD, relief=tk.FLAT, cursor="hand2", padx=6, pady=1,
            command=self._hide_alert_banner
        )
        self.btn_close_alert.pack(side=tk.RIGHT, padx=2)


        frame_preview = ttk.LabelFrame(self.paned_tab1, text=" 📝 現場比對切片與雙階 AI 自癒預覽面板 ", padding=6)
        self.paned_tab1.add(frame_preview, weight=3)


        self.nb_preview = ttk.Notebook(frame_preview)
        self.nb_preview.pack(fill=tk.BOTH, expand=True)


        tab_diff = ttk.Frame(self.nb_preview)
        self.nb_preview.add(tab_diff, text="現場切片比對 (Poisoned Slices)")
        self.txt_diff = scrolledtext.ScrolledText(tab_diff, wrap=tk.WORD, font=self.FONT_CODE)
        self.txt_diff.pack(fill=tk.BOTH, expand=True, padx=4, pady=4)


        self.tab_s1 = ttk.Frame(self.nb_preview)
        self.nb_preview.add(self.tab_s1, text="🤔 ENG修復提案")
        self.txt_s1 = scrolledtext.ScrolledText(self.tab_s1, wrap=tk.WORD, font=self.FONT_CODE)
        self.txt_s1.pack(fill=tk.BOTH, expand=True, padx=4, pady=4)


        self.tab_s2 = ttk.Frame(self.nb_preview)
        self.nb_preview.add(self.tab_s2, text="🔍 QA審核字典")
        self.txt_s2 = scrolledtext.ScrolledText(self.tab_s2, wrap=tk.WORD, font=self.FONT_CODE)
        self.txt_s2.pack(fill=tk.BOTH, expand=True, padx=4, pady=4)


        tab_payload = ttk.Frame(self.nb_preview)
        self.nb_preview.add(tab_payload, text="📋 批次離線任務書 (Payload) ")
        self.txt_payload = scrolledtext.ScrolledText(tab_payload, wrap=tk.WORD, font=self.FONT_CODE)
        self.txt_payload.pack(fill=tk.BOTH, expand=True, padx=4, pady=4)


        # 🛠️ 接力分頁：嚴格遵守 Bottom-First 流式佈局防吞噬鐵律
        self.tab_relay = ttk.Frame(self.nb_preview)
        self.nb_preview.add(self.tab_relay, text="🛠️ 外部接力手動修補")


        relay_top_bar = ttk.Frame(self.tab_relay, padding=(4, 4, 4, 2))
        relay_top_bar.pack(side=tk.TOP, fill=tk.X, padx=4, pady=2)


        self.btn_copy_relay = tk.Button(
            relay_top_bar, text="📋 一鍵複製 QA 接力提示詞 (可直接貼入 AI Studio)",
            bg="#475569", fg="#ffffff", activebackground="#334155", activeforeground="#ffffff",
            font=self.FONT_BOLD, relief=tk.RAISED, cursor="hand2", padx=10, pady=3,
            command=self._on_copy_relay_prompt
        )
        self.btn_copy_relay.pack(side=tk.LEFT, padx=4)


        lbl_relay_hint = ttk.Label(
            relay_top_bar,
            text="💡 當 API 遭遇風控/配額阻斷或未配金鑰時，請於網頁版推理後貼回下方驗證解鎖存檔",
            font=self.FONT_NORMAL
        )
        lbl_relay_hint.pack(side=tk.LEFT, padx=8)


        relay_bottom_bar = ttk.Frame(self.tab_relay, padding=(4, 2, 4, 4))
        relay_bottom_bar.pack(side=tk.BOTTOM, fill=tk.X, padx=4, pady=4)


        self.btn_validate_relay = tk.Button(
            relay_bottom_bar, text=f"{SYM_SHIELD} 驗證外部成果並解鎖微創存檔",
            bg=COLOR_SAVE_NORMAL, fg="#ffffff", activebackground="#047857", activeforeground="#ffffff",
            font=self.FONT_BOLD, relief=tk.RAISED, cursor="hand2", padx=14, pady=5,
            command=self._on_validate_and_unlock_relay
        )
        self.btn_validate_relay.pack(side=tk.RIGHT, padx=4)


        self.txt_relay = scrolledtext.ScrolledText(self.tab_relay, wrap=tk.WORD, font=self.FONT_CODE)
        self.txt_relay.pack(side=tk.TOP, fill=tk.BOTH, expand=True, padx=4, pady=4)


        tab_btn_bar = ttk.Frame(self.nb_preview)
        tab_btn_bar.place(relx=1.0, x=-6, y=3, anchor="ne")


        self.btn_stage1 = tk.Button(
            tab_btn_bar, text="🤔 僅修復提案",
            bg="#f1f5f9", fg="#1e293b", activebackground="#e2e8f0", activeforeground="#0f172a",
            font=self.FONT_BOLD, relief=tk.RAISED, bd=1, cursor="hand2", padx=8, pady=2,
            state=tk.DISABLED, command=self._run_stage1_only
        )
        self.btn_stage1.pack(side=tk.LEFT, padx=3)


        self.btn_stage2 = tk.Button(
            tab_btn_bar, text="🔍 僅審核字典",
            bg="#f1f5f9", fg="#1e293b", activebackground="#e2e8f0", activeforeground="#0f172a",
            font=self.FONT_BOLD, relief=tk.RAISED, bd=1, cursor="hand2", padx=8, pady=2,
            state=tk.DISABLED, command=self._run_stage2_only
        )
        self.btn_stage2.pack(side=tk.LEFT, padx=3)


    # ==========================================================================
    # 告警橫幅狀態控制器 (階梯容錯掛載與防崩潰安全演算法)
    # ==========================================================================
    def _show_alert_banner(self, message: str, show_goto_relay: bool = True) -> None:
        try:
            self.lbl_alert_msg.config(text=message)
            if show_goto_relay:
                self.btn_goto_relay.pack(side=tk.RIGHT, padx=4)
            else:
                self.btn_goto_relay.pack_forget()


            try:
                self.alert_banner.pack(fill=tk.X, padx=6, pady=(0, 4), before=self.paned_tab1)
            except Exception:
                self.alert_banner.pack(fill=tk.X, padx=6, pady=(0, 4), side=tk.TOP)
        except Exception as e:
            sys.stderr.write(f"[AlertBanner Mount Exception] {e}\n")


    def _hide_alert_banner(self) -> None:
        try:
            self.alert_banner.pack_forget()
        except Exception:
            pass


    def _goto_relay_tab(self) -> None:
        self.nb_preview.select(self.tab_relay)


    # ==========================================================================
    # Tab 2 構建：單帳號鎖定槽位、路徑、防風控策略與長冷卻退避
    # ==========================================================================
    def _build_tab2(self, parent: Any) -> None:
        tab2_container = ttk.Frame(parent, padding=10)
        tab2_container.pack(fill=tk.BOTH, expand=True)


        grp_acc = ttk.LabelFrame(tab2_container, text=" 🛡️ 3 組 Gemini API 帳號槽位 (2026-11 規範：單次自癒強制鎖定頂部單一選定帳號，絕不自動輪詢) ", padding=10)
        grp_acc.pack(fill=tk.X, expand=False, padx=4, pady=(2, 6))


        self.profile_entries = []
        profiles = self.config.get("api_profiles", [])
        for i in range(3):
            p_data = profiles[i] if i < len(profiles) else {"name": f"帳號 {i+1}", "key": "", "note": ""}
            row_f = ttk.Frame(grp_acc)
            row_f.pack(fill=tk.X, expand=True, pady=3)


            ttk.Label(row_f, text=f"帳號 {i+1} 名稱:", font=self.FONT_NORMAL, width=12).grid(row=0, column=0, sticky=tk.W, padx=2)
            ent_name = ttk.Entry(row_f, font=self.FONT_NORMAL, width=15)
            ent_name.insert(0, p_data.get("name", f"帳號 {i+1}"))
            ent_name.grid(row=0, column=1, sticky=tk.W, padx=4)


            ttk.Label(row_f, text="API Key:", font=self.FONT_NORMAL, width=9).grid(row=0, column=2, sticky=tk.W, padx=6)
            ent_key = ttk.Entry(row_f, font=self.FONT_NORMAL, show="*")
            ent_key.insert(0, p_data.get("key", ""))
            ent_key.grid(row=0, column=3, sticky=tk.EW, padx=4)


            ttk.Label(row_f, text="備註:", font=self.FONT_NORMAL, width=6).grid(row=0, column=4, sticky=tk.W, padx=6)
            ent_note = ttk.Entry(row_f, font=self.FONT_NORMAL, width=22)
            ent_note.insert(0, p_data.get("note", ""))
            ent_note.grid(row=0, column=5, sticky=tk.EW, padx=4)


            row_f.columnconfigure(3, weight=3)
            row_f.columnconfigure(5, weight=1)


            self.profile_entries.append((ent_name, ent_key, ent_note))


        mid_row = ttk.Frame(tab2_container)
        mid_row.pack(fill=tk.X, expand=False, padx=4, pady=4)


        grp_paths = ttk.LabelFrame(mid_row, text=" 📂 檔案與提示詞路徑設定 ", padding=8)
        grp_paths.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=(0, 6))


        path_fields = [
            ("主要字典 (1):", "dict_path_1", False),
            ("擴充字典 (2):", "dict_path_2", False),
            ("對偶矩陣 JSON:", "matrix_path", True),
            ("ENG 工程師提示詞:", "radar_engineer_prompt_path", False),
            ("QA 審查提示詞:", "radar_qa_prompt_path", False),
        ]


        self.path_entries = {}
        for row_i, (lbl_txt, cfg_key, is_json) in enumerate(path_fields):
            ttk.Label(grp_paths, text=lbl_txt, font=self.FONT_NORMAL).grid(row=row_i, column=0, sticky=tk.W, padx=4, pady=3)
            ent = ttk.Entry(grp_paths, font=self.FONT_NORMAL)
            ent.insert(0, self.config.get(cfg_key, ""))
            ent.grid(row=row_i, column=1, sticky=tk.EW, padx=4, pady=3)
            btn = ttk.Button(
                grp_paths, text="瀏覽...", width=8,
                command=lambda e=ent, j=is_json: self._browse_entry_path(e, j)
            )
            btn.grid(row=row_i, column=2, padx=4, pady=3)
            self.path_entries[cfg_key] = ent


        grp_paths.columnconfigure(1, weight=1)


        grp_fallback = ttk.LabelFrame(mid_row, text=" 🔄 階梯備援、長週期冷卻與逾時參數 ", padding=8)
        grp_fallback.pack(side=tk.RIGHT, fill=tk.BOTH, expand=True, padx=(6, 0))


        fb_row1 = ttk.Frame(grp_fallback)
        fb_row1.pack(fill=tk.X, expand=True, pady=2)


        ttk.Label(fb_row1, text="重試輪次上限:", font=self.FONT_NORMAL).pack(side=tk.LEFT, padx=3)
        self.spn_max_retries = ttk.Spinbox(fb_row1, from_=1, to=5, increment=1, width=4, font=self.FONT_NORMAL)
        self.spn_max_retries.set(str(self.config.get("max_retries", 1)))
        self.spn_max_retries.pack(side=tk.LEFT, padx=3)


        ttk.Label(fb_row1, text="退避延遲(秒):", font=self.FONT_NORMAL).pack(side=tk.LEFT, padx=5)
        self.spn_base_delay = ttk.Spinbox(fb_row1, from_=10.0, to=600.0, increment=10.0, width=6, font=self.FONT_NORMAL)
        self.spn_base_delay.set(str(self.config.get("base_delay_seconds", 180.0)))
        self.spn_base_delay.pack(side=tk.LEFT, padx=3)


        ttk.Label(fb_row1, text="單次請求逾時(秒):", font=self.FONT_NORMAL).pack(side=tk.LEFT, padx=5)
        self.spn_request_timeout = ttk.Spinbox(fb_row1, from_=10.0, to=600.0, increment=10.0, width=6, font=self.FONT_NORMAL)
        self.spn_request_timeout.set(str(self.config.get("request_timeout_seconds", 300.0)))
        self.spn_request_timeout.pack(side=tk.LEFT, padx=3)


        fb_row2 = ttk.Frame(grp_fallback)
        fb_row2.pack(fill=tk.X, expand=True, pady=3)
        self.var_enable_fallback = tk.BooleanVar(value=bool(self.config.get("enable_fallback", True)))
        self.chk_enable_fallback = ttk.Checkbutton(
            fb_row2, text="啟用模型垂直階梯備援 (單帳號下主模型遇阻時依序垂直降階)",
            variable=self.var_enable_fallback
        )
        self.chk_enable_fallback.pack(side=tk.LEFT, padx=2)


        fb_row3 = ttk.Frame(grp_fallback)
        fb_row3.pack(fill=tk.X, expand=True, pady=2)
        ttk.Label(fb_row3, text="第一備援模型:", font=self.FONT_NORMAL, width=12).pack(side=tk.LEFT, padx=2)
        self.combo_fallback_1 = ttk.Combobox(fb_row3, width=22, font=self.FONT_NORMAL, values=PRESET_MODELS)
        self.combo_fallback_1.set(self.config.get("fallback_model_1", "gemini-3.6-flash"))
        self.combo_fallback_1.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=4)


        fb_row4 = ttk.Frame(grp_fallback)
        fb_row4.pack(fill=tk.X, expand=True, pady=2)
        ttk.Label(fb_row4, text="第二備援模型:", font=self.FONT_NORMAL, width=12).pack(side=tk.LEFT, padx=2)
        self.combo_fallback_2 = ttk.Combobox(fb_row4, width=22, font=self.FONT_NORMAL, values=PRESET_MODELS)
        self.combo_fallback_2.set(self.config.get("fallback_model_2", "gemini-3.5-flash-lite"))
        self.combo_fallback_2.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=4)


        btn_save_all = tk.Button(
            grp_fallback, text=f"{SYM_SAVE} 儲存所有帳號、路徑與調度設定",
            bg="#059669", fg="#ffffff", activebackground="#047857", activeforeground="#ffffff",
            font=self.FONT_BOLD, relief=tk.RAISED, cursor="hand2", pady=5,
            command=self._save_all_settings
        )
        btn_save_all.pack(fill=tk.X, expand=True, padx=2, pady=(8, 2))


        grp_strategy = ttk.LabelFrame(tab2_container, text=" ⚡ 起手鎖定與防風控降階策略矩陣 ", padding=8)
        grp_strategy.pack(fill=tk.X, expand=True, padx=4, pady=4)


        strat_row1 = ttk.Frame(grp_strategy)
        strat_row1.pack(fill=tk.X, expand=True, pady=4)


        ttk.Label(strat_row1, text="起手分流策略:", font=self.FONT_BOLD).pack(side=tk.LEFT, padx=6)
        self.combo_dispatch = ttk.Combobox(
            strat_row1, width=20, state="readonly", font=self.FONT_NORMAL,
            values=["locked", "random", "round_robin"]
        )
        self.combo_dispatch.set(self.config.get("account_dispatch_mode", "locked"))
        self.combo_dispatch.pack(side=tk.LEFT, padx=6)
        self.combo_dispatch.bind("<<ComboboxSelected>>", lambda e: self._update_strategy_cards())


        ttk.Label(strat_row1, text="遇阻重試路線:", font=self.FONT_BOLD).pack(side=tk.LEFT, padx=16)
        self.combo_retry = ttk.Combobox(
            strat_row1, width=20, state="readonly", font=self.FONT_NORMAL,
            values=["vertical_first", "quality_locked", "horizontal_first"]
        )
        self.combo_retry.set(self.config.get("retry_route_policy", "vertical_first"))
        self.combo_retry.pack(side=tk.LEFT, padx=6)
        self.combo_retry.bind("<<ComboboxSelected>>", lambda e: self._update_strategy_cards())


        self.card_dispatch = tk.Label(
            grp_strategy, text="", justify=tk.LEFT, anchor="w",
            bg="#f1f5f9", fg="#1e293b", font=self.FONT_CARD, relief=tk.SOLID, bd=1, padx=10, pady=6
        )
        self.card_dispatch.pack(fill=tk.X, expand=True, pady=3)


        self.card_retry = tk.Label(
            grp_strategy, text="", justify=tk.LEFT, anchor="w",
            bg="#f1f5f9", fg="#1e293b", font=self.FONT_CARD, relief=tk.SOLID, bd=1, padx=10, pady=6
        )
        self.card_retry.pack(fill=tk.X, expand=True, pady=3)


        self._update_strategy_cards()


    # ==========================================================================
    # Tab 3 構建：易混淆對偶字矩陣管理
    # ==========================================================================
    def _build_tab3(self, parent: Any) -> None:
        paned = ttk.PanedWindow(parent, orient=tk.HORIZONTAL)
        paned.pack(fill=tk.BOTH, expand=True, padx=8, pady=8)


        frame_tree = ttk.LabelFrame(paned, text=" 📋 現役納管對偶組清單 ", padding=8)
        paned.add(frame_tree, weight=3)


        cols = ("target_pair", "char_count")
        self.tree_matrix = ttk.Treeview(frame_tree, columns=cols, show="headings", selectmode="browse")
        self.tree_matrix.heading("target_pair", text="目標對偶組")
        self.tree_matrix.heading("char_count", text="納管字數")
        self.tree_matrix.column("target_pair", width=220, anchor=tk.CENTER)
        self.tree_matrix.column("char_count", width=90, anchor=tk.CENTER)


        tree_m_scroll = ttk.Scrollbar(frame_tree, orient=tk.VERTICAL, command=self.tree_matrix.yview)
        self.tree_matrix.configure(yscrollcommand=tree_m_scroll.set)
        self.tree_matrix.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        tree_m_scroll.pack(side=tk.RIGHT, fill=tk.Y)
        self.tree_matrix.bind("<<TreeviewSelect>>", self._on_matrix_tree_select)


        frame_edit = ttk.LabelFrame(paned, text=" ✏️ 快速操作與輸入區 ", padding=12)
        paned.add(frame_edit, weight=2)


        lbl_hint = tk.Label(
            frame_edit,
            text=(
                "💡 說明：\n"
                "• 支援任意常見符號切分（逗號、分號、空格、Tab、斜線、頓號等）\n"
                "• 支援連續純漢字切分（例如輸入「借藉」自動識別為 ['借', '藉']）\n"
                "• 點選左側清單可直接載入編輯"
            ),
            justify=tk.LEFT, anchor="w", font=self.FONT_NORMAL, fg="#334155",
            bg="#f8fafc", relief=tk.SOLID, bd=1, padx=10, pady=8
        )
        lbl_hint.pack(fill=tk.X, expand=False, pady=6)


        ttk.Label(frame_edit, text="對偶字符輸入:", font=self.FONT_BOLD).pack(anchor=tk.W, pady=(12, 4))
        self.ent_pair_input = ttk.Entry(frame_edit, font=self.FONT_TITLE)
        self.ent_pair_input.pack(fill=tk.X, expand=False, pady=4)


        btn_box = ttk.Frame(frame_edit)
        btn_box.pack(fill=tk.X, pady=8)


        btn_add = tk.Button(
            btn_box, text="➕ 新增/更新對偶組",
            bg="#2563eb", fg="#ffffff", activebackground="#1d4ed8", activeforeground="#ffffff",
            font=self.FONT_BOLD, relief=tk.RAISED, cursor="hand2", padx=8, pady=4,
            command=self._on_matrix_add_or_update
        )
        btn_add.pack(side=tk.LEFT, padx=4)


        btn_del = tk.Button(
            btn_box, text="➖ 刪除選定對偶組",
            bg="#dc2626", fg="#ffffff", activebackground="#b91c1c", activeforeground="#ffffff",
            font=self.FONT_BOLD, relief=tk.RAISED, cursor="hand2", padx=8, pady=4,
            command=self._on_matrix_delete
        )
        btn_del.pack(side=tk.LEFT, padx=4)


        btn_save_matrix = tk.Button(
            frame_edit, text=f"{SYM_SAVE} 儲存矩陣檔案並觸發全域重新健檢",
            bg="#059669", fg="#ffffff", activebackground="#047857", activeforeground="#ffffff",
            font=self.FONT_BOLD, relief=tk.RAISED, cursor="hand2", pady=10,
            command=self._on_save_matrix_and_recheck
        )
        btn_save_matrix.pack(fill=tk.X, side=tk.BOTTOM, pady=12)


        self._load_matrix_into_tab3()


    def _load_matrix_into_tab3(self) -> None:
        for item in self.tree_matrix.get_children():
            self.tree_matrix.delete(item)


        for i, pair in enumerate(self.matrix_mgr.pairs):
            pair_str = " ⮀ ".join(pair)
            self.tree_matrix.insert("", "end", iid=str(i), values=(pair_str, f"{len(pair)} 字"))


    def _on_matrix_tree_select(self, event: Any = None) -> None:
        sel = self.tree_matrix.selection()
        if not sel:
            return
        idx = int(sel[0])
        if 0 <= idx < len(self.matrix_mgr.pairs):
            pair = self.matrix_mgr.pairs[idx]
            self.ent_pair_input.delete(0, "end")
            self.ent_pair_input.insert(0, "、".join(pair))


    def _on_matrix_add_or_update(self) -> None:
        raw_text = self.ent_pair_input.get().strip()
        parsed = parse_confusable_input(raw_text)
        if len(parsed) < 2:
            Toast.show(self.root, "⚠️ 請至少輸入 2 個對偶字符！", duration=2000, bg="#d97706")
            return


        sel = self.tree_matrix.selection()
        if sel:
            idx = int(sel[0])
            if 0 <= idx < len(self.matrix_mgr.pairs):
                self.matrix_mgr.pairs[idx] = parsed
        else:
            self.matrix_mgr.pairs.append(parsed)


        self._load_matrix_into_tab3()
        Toast.show(self.root, "➕ 已成功記錄對偶組！請記得點擊下方儲存。", duration=1800)


    def _on_matrix_delete(self) -> None:
        sel = self.tree_matrix.selection()
        if not sel:
            Toast.show(self.root, "⚠️ 請先從左側選取欲刪除之對偶組！", duration=1800, bg="#d97706")
            return
        idx = int(sel[0])
        if 0 <= idx < len(self.matrix_mgr.pairs):
            deleted_pair = self.matrix_mgr.pairs.pop(idx)
            self.ent_pair_input.delete(0, "end")
            self._load_matrix_into_tab3()
            Toast.show(self.root, f"➖ 已移除對偶組: {' ⮀ '.join(deleted_pair)}", duration=1800)


    def _on_save_matrix_and_recheck(self) -> None:
        all_pairs = []
        for item in self.tree_matrix.get_children():
            val = self.tree_matrix.item(item, "values")[0]
            pair = [c.strip() for c in val.split("⮀") if c.strip()]
            if len(pair) >= 2:
                all_pairs.append(pair)


        if not all_pairs:
            all_pairs = DEFAULT_CONFUSABLE_PAIRS


        self.matrix_mgr.pairs = all_pairs
        out_data = {
            "version": __version__,
            "description": "小說繁體化系統高危易混淆對偶字矩陣表",
            "pairs": all_pairs
        }
        try:
            content = json.dumps(out_data, indent=2, ensure_ascii=False)
            target_matrix_path = _resolve_app_path(self.config.get("matrix_path", "confusable_matrix.json")) or self.matrix_mgr.matrix_path
            self.matrix_mgr.matrix_path = target_matrix_path
            FileEncodingIO.atomic_write(target_matrix_path, content)
            self.matrix_mgr.load_matrix()
            Toast.show(self.root, "💾 對偶矩陣已儲存並重新完成全域健檢！", duration=2000)
            self.trigger_health_check_async()
        except Exception as e:
            Toast.show(self.root, f"❌ 儲存矩陣失敗: {e}", duration=3000, bg="#dc2626")


    # ==========================================================================
    # 策略圖解看板連動
    # ==========================================================================
    def _update_strategy_cards(self) -> None:
        d_mode = self.combo_dispatch.get()
        r_mode = self.combo_retry.get()
        self.card_dispatch.config(text=DISPATCH_DESCRIPTIONS.get(d_mode, "未選定起手策略"))
        self.card_retry.config(text=RETRY_ROUTE_DESCRIPTIONS.get(r_mode, "未選定重試路線"))


    def _browse_entry_path(self, entry: Any, is_json: bool = False) -> None:
        ft = [("JSON 檔案", "*.json"), ("所有檔案", "*.*")] if is_json else [("文字檔案", "*.txt"), ("所有檔案", "*.*")]
        curr = _resolve_app_path(entry.get().strip())
        init_d = os.path.dirname(curr) if curr and os.path.exists(curr) else SCRIPT_DIR
        sel = filedialog.askopenfilename(title="選擇檔案", initialdir=init_d, filetypes=ft)
        if sel:
            try:
                rel = os.path.relpath(sel, SCRIPT_DIR)
                if not rel.startswith(".."):
                    sel = rel
            except Exception:
                pass
            entry.delete(0, "end")
            entry.insert(0, sel)


    def _refresh_top_account_combo(self) -> None:
        profiles = self.config.get("api_profiles", [])
        vals = []
        for i, p in enumerate(profiles):
            has_k = "🟢 已配鑰匙" if p.get("key", "").strip() else "⚪ 未配鑰"
            vals.append(f"{p.get('name', f'帳號 {i+1}')} ({has_k})")
        self.combo_top_account["values"] = vals
        locked_idx = self.config.get("locked_account_index", 0)
        if 0 <= locked_idx < len(vals):
            self.combo_top_account.current(locked_idx)


    def _on_top_account_changed(self, event: Any = None) -> None:
        idx = self.combo_top_account.current()
        if idx >= 0:
            self.config["locked_account_index"] = idx
            ConfigManager.save_config(self.config)


    def _on_save_top_config(self) -> None:
        idx = self.combo_top_account.current()
        if idx >= 0:
            self.config["locked_account_index"] = idx
        self.config["gemini_model"] = self.combo_top_model.get().strip()
        ConfigManager.save_config(self.config)
        Toast.show(self.root, f"{SYM_SAVE} 頂部作用帳號與主要模型已儲存！", duration=1200)


    def _save_all_settings(self) -> None:
        new_profiles = []
        for ent_name, ent_key, ent_note in self.profile_entries:
            new_profiles.append({
                "name": ent_name.get().strip(),
                "key": ent_key.get().strip(),
                "note": ent_note.get().strip()
            })
        self.config["api_profiles"] = new_profiles


        for k, ent in self.path_entries.items():
            self.config[k] = ent.get().strip()


        self.config["account_dispatch_mode"] = self.combo_dispatch.get().strip()
        retry_val = self.combo_retry.get().strip()
        if retry_val == "horizontal_first":
            retry_val = "vertical_first"
            self.combo_retry.set("vertical_first")
        self.config["retry_route_policy"] = retry_val
        self.config["gemini_model"] = self.combo_top_model.get().strip()


        try:
            mr = int(self.spn_max_retries.get().strip())
            self.config["max_retries"] = max(1, min(5, mr))
        except ValueError:
            self.config["max_retries"] = 1


        try:
            bd = float(self.spn_base_delay.get().strip())
            self.config["base_delay_seconds"] = max(10.0, min(600.0, bd))
        except ValueError:
            self.config["base_delay_seconds"] = 180.0


        try:
            rt = float(self.spn_request_timeout.get().strip())
            self.config["request_timeout_seconds"] = max(10.0, min(600.0, rt))
        except ValueError:
            self.config["request_timeout_seconds"] = 300.0


        self.config["enable_fallback"] = bool(self.var_enable_fallback.get())
        self.config["fallback_model_1"] = self.combo_fallback_1.get().strip()
        self.config["fallback_model_2"] = self.combo_fallback_2.get().strip()


        ConfigManager.save_config(self.config)
        self._refresh_top_account_combo()
        self._update_strategy_cards()
        self.matrix_mgr.matrix_path = _resolve_app_path(self.config.get("matrix_path", "confusable_matrix.json")) or os.path.join(SCRIPT_DIR, "confusable_matrix.json")
        self.matrix_mgr.load_matrix()
        self.baseline_sm.backup_dir = _resolve_app_path(self.config.get("backup_dir", "bak")) or os.path.join(SCRIPT_DIR, "bak")


        Toast.show(self.root, f"{SYM_SAVE} 所有設定已成功保存至 config.json！", duration=1500)


    def _on_close_window(self) -> None:
        self.config["gemini_model"] = self.combo_top_model.get().strip()
        ConfigManager.save_config(self.config)
        self.root.destroy()


    # ==========================================================================
    # 全域健檢與非同步 Worker (動態重讀組態閉環)
    # ==========================================================================
    def trigger_health_check_async(self) -> None:
        if self.is_running:
            return


        # 動態重讀組態並同步內部引擎路徑
        self.config = ConfigManager.load_config()
        self.baseline_sm.backup_dir = _resolve_app_path(self.config.get("backup_dir", "bak")) or os.path.join(SCRIPT_DIR, "bak")
        self.matrix_mgr.matrix_path = _resolve_app_path(self.config.get("matrix_path", "confusable_matrix.json")) or os.path.join(SCRIPT_DIR, "confusable_matrix.json")
        self.detector.bare_limit = int(self.config.get("bare_affix_len_limit", 1))


        self.btn_scan.config(state="disabled")
        self.lbl_status.config(
            text=f"{SYM_TIME} 正在執行全域 PCRE 剖析與語意對沖檢驗...",
            fg="#2563eb"
        )


        d1 = _resolve_app_path(self.config.get("dict_path_1", "正則查找字典.txt"))
        d2 = _resolve_app_path(self.config.get("dict_path_2", "正則查找字典2.txt"))
        matrix_file = self.matrix_mgr.matrix_path
        auto_backup_cfg = bool(self.config.get("auto_backup_on_pass", True))


        stopwatch = LiveThinkingStopwatch(
            callback_tick=lambda s: self.root.after(0, lambda sec=s: self._update_stopwatch_ui(stopwatch, sec))
        )
        stopwatch.start()


        def worker():
            t_start = time.time()
            all_slices = {}
            try:
                paths = [p for p in [d1, d2] if p]
                valid_paths = [p for p in paths if os.path.exists(p)]


                self.matrix_mgr.matrix_path = matrix_file
                self.matrix_mgr.load_matrix()


                sanitized_records = {}


                for p in valid_paths:
                    raw_content = FileEncodingIO.read_file(p)
                    clean_content, modified = DictParserEngine.sanitize_legacy_content(raw_content)
                    sanitized_records[p] = (clean_content, modified)


                    parsed = DictParserEngine.parse_dictionary(clean_content, is_content=True, known_confusables=self.matrix_mgr.all_confusable_chars)
                    for char, rule_slice in parsed.items():
                        rule_slice.source_file = p
                        if char in all_slices:
                            all_slices[char].merge(rule_slice)
                        else:
                            all_slices[char] = rule_slice


                fatals, warnings = self.detector.check(all_slices)


                has_valid_data = len(valid_paths) > 0 and len(all_slices) > 0
                is_healthy = has_valid_data and (len(fatals) == 0)


                if not has_valid_data:
                    fallback_path = paths[0] if paths else os.path.join(SCRIPT_DIR, "unknown_dict.txt")
                    if len(valid_paths) == 0:
                        dummy_slice = RegexRuleSlice(raw_header="VACUUM_GUARD", target_char="?", rule_body="", line_no=0, source_file=fallback_path)
                        fatals.append(ConflictItem(
                            "SYSTEM", "DICT", "VACUUM_STATE_EMPTY_PATH",
                            "指定字典檔案皆不存在", "全域檔案檢測", dummy_slice, dummy_slice
                        ))
                    elif len(all_slices) == 0:
                        dummy_slice = RegexRuleSlice(raw_header="VACUUM_GUARD", target_char="?", rule_body="", line_no=0, source_file=valid_paths[0])
                        fatals.append(ConflictItem(
                            "SYSTEM", "DICT", "VACUUM_STATE_ZERO_SLICES",
                            "字典未解析出任何有效正則條目 (0 位元組或格式損壞)", "條目解析檢測", dummy_slice, dummy_slice
                        ))


                all_list = fatals + warnings
                agg_list = CollisionDetector.aggregate_conflicts(all_list)


                if is_healthy:
                    for p in valid_paths:
                        clean_c, mod = sanitized_records.get(p, ("", False))
                        if mod and clean_c:
                            FileEncodingIO.atomic_write(p, clean_c)
                        if auto_backup_cfg:
                            self.baseline_sm.sync_healthy_baseline(p)


                elapsed = time.time() - t_start
                self.root.after(0, lambda: self._apply_scan_results(
                    fatals, warnings, agg_list, is_healthy, elapsed, len(all_slices), has_valid_data
                ))
            except Exception as e:
                err_msg = str(e)
                self.root.after(0, lambda em=err_msg: self.lbl_status.config(
                    text=f"❌ 健檢作業發生例外: {em}", fg="#dc2626"
                ))
            finally:
                stopwatch.stop()
                self.root.after(0, lambda: self.btn_scan.config(state="normal"))


        threading.Thread(target=worker, daemon=True).start()


    def _update_stopwatch_ui(self, stopwatch: LiveThinkingStopwatch, elapsed_s: int) -> None:
        if stopwatch.is_running:
            self.lbl_status.config(
                text=f"{SYM_TIME} 正在執行全域對沖檢驗 (耗時: {elapsed_s}s)...",
                fg="#2563eb"
            )


    def _apply_scan_results(self, fatals: List[ConflictItem], warnings: List[ConflictItem],
                            agg_list: List[AggregatedConflict], is_healthy: bool,
                            elapsed: float, target_count: int, has_valid_data: bool = True) -> None:
        self.fatal_conflicts = fatals
        self.warning_conflicts = warnings
        self.aggregated_conflicts = agg_list
        self.btn_scan.config(state="normal")


        for item in self.tree.get_children():
            self.tree.delete(item)


        for i, agg in enumerate(self.aggregated_conflicts):
            is_fatal = agg.is_fatal()
            fatal_count_str = f"🚨 {agg.total_fatal_count()} 項致命" if is_fatal else "✅ 0 致命"
            fatal_affs = ", ".join([f"'{a}'" for a, _ in agg.fatal_affixes]) or "-"
            inclusions = ", ".join([f"'{a}'" for a, _ in agg.inclusions]) or "-"
            warn_affs = ", ".join([f"'{a}'" for a, _ in agg.warning_affixes]) or "-"


            pair_set = {agg.target_a, agg.target_b}
            related_chars = []
            for group in self.matrix_mgr.pairs:
                g_set = set(group)
                if pair_set.issubset(g_set) and len(g_set) > 2:
                    related_chars = sorted(list(g_set - pair_set))
                    break


            target_pair_str = f"{agg.target_a} ⮀ {agg.target_b}"
            if related_chars:
                target_pair_str += f" (多向關聯: {','.join(related_chars)})"


            self.tree.insert("", "end", iid=str(i), values=(
                target_pair_str,
                fatal_count_str,
                fatal_affs,
                inclusions,
                warn_affs,
                f"{os.path.basename(agg.slice_a.source_file)} (L{agg.slice_a.line_no})",
                f"{os.path.basename(agg.slice_b.source_file)} (L{agg.slice_b.line_no})"
            ), tags=("fatal" if is_fatal else "warning",))


        self.tree.tag_configure("fatal", foreground="#dc2626")
        self.tree.tag_configure("warning", foreground="#d97706")


        if not has_valid_data:
            status_text = "🚨 阻斷：未解析出任何合法條目 (檔案不存在或為空檔)！已鎖死黃金基準線"
            self.lbl_status.config(text=status_text, fg="#dc2626")
            self.root.title(f"{SYM_SHIELD} 《正則語意對沖檢測與健康哨兵》 v{__version__} — [當前狀態: 🔴 真空態阻斷 (無有效條目)]")
            self.btn_rollback.config(state="normal")
            self.btn_copy_prompt.config(state="disabled")
            self.btn_heal_auto.config(state="disabled")
            self.btn_stage1.config(state="disabled")
            self.btn_stage2.config(state="disabled")
            self.btn_stitch_save.config(state="disabled", bg="#94a3b8")
            self.txt_diff.delete("1.0", "end")
            self.txt_diff.insert("end", "🚨 阻斷警告：未檢測到有效正則條目或指定檔案不存在！黃金基準線已物理鎖死，嚴禁備份與自癒。可嘗試點擊 [⏪ 一鍵回滾] 自動重生實體檔案。")
            self.txt_payload.delete("1.0", "end")
            self.txt_s1.delete("1.0", "end")
            self.txt_s2.delete("1.0", "end")
            self.txt_relay.delete("1.0", "end")
            self._hide_alert_banner()
            return


        if is_healthy:
            status_text = (
                f"{SYM_PASS} 全域健康！檢驗 {target_count} 組標籤，耗時 {elapsed:.2f}s | "
                f"黃金基準線：已自動同步更新"
            )
            self.lbl_status.config(text=status_text, fg="#059669")
            self.root.title(f"{SYM_SHIELD} 《正則語意對沖檢測與健康哨兵》 v{__version__} — [當前狀態: 🟢 全字典健康]")
            self.btn_rollback.config(state="disabled")
            self.btn_copy_prompt.config(state="disabled")
            self.btn_heal_auto.config(state="disabled")
            self.btn_stage1.config(state="disabled")
            self.btn_stage2.config(state="disabled")
            self.btn_stitch_save.config(state="disabled", bg="#94a3b8")
            self.txt_diff.delete("1.0", "end")
            self.txt_diff.insert("end", "✅ 恭喜！目前正則字典結構健全，未檢測出任何語意對沖或雙向豁免衝突。")
            self.txt_payload.delete("1.0", "end")
            self.txt_s1.delete("1.0", "end")
            self.txt_s2.delete("1.0", "end")
            self.txt_relay.delete("1.0", "end")
            self._hide_alert_banner()
        else:
            fatal_pairs = [a for a in agg_list if a.is_fatal()]
            status_text = (
                f"{SYM_WARN} 發現語意對沖！致命阻斷: {len(fatal_pairs)} 組對偶 ({len(fatals)} 處詞綴) | "
                f"{SYM_LOCK} 黃金基準線已物理鎖死"
            )
            self.lbl_status.config(text=status_text, fg="#dc2626")
            self.root.title(f"{SYM_SHIELD} 《正則語意對沖檢測與健康哨兵》 v{__version__} — [當前狀態: 🔴 發現語意對沖 ({len(fatal_pairs)} 組對偶)]")
            self.btn_rollback.config(state="normal")
            self.btn_heal_auto.config(state="normal")
            self.btn_stage1.config(state="normal")
            self.btn_stage2.config(state="normal")
            children = self.tree.get_children()
            if children:
                self.tree.selection_set(children[0])
                self._on_tree_select(None)


    def _on_tree_select(self, event: Any) -> None:
        selected = self.tree.selection()
        if not selected:
            return
        idx = int(selected[0])
        agg = self.aggregated_conflicts[idx]


        self.current_selected_agg = agg
        self.btn_copy_prompt.config(state="normal")
        self.btn_heal_auto.config(state="normal")
        self.btn_stage1.config(state="normal")
        self.btn_stage2.config(state="normal")


        self.txt_diff.delete("1.0", "end")
        fatal_detail = "\n".join([f"  • 裸詞綴: '{a}' ({d})" for a, d in agg.fatal_affixes]) or "  • (無)"
        inc_detail = "\n".join([f"  • 跨字侵入: '{a}' ({d})" for a, d in agg.inclusions]) or "  • (無)"
        warn_detail = "\n".join([f"  • 情境重疊: '{a}' ({d})" for a, d in agg.warning_affixes]) or "  • (無)"


        diff_text = f"""【聚合對偶組】：[{agg.target_a}] ⮀ [{agg.target_b}] (致命阻斷: {agg.total_fatal_count()} 處)
----------------------------------------------------------------------
【致命單字裸詞綴】：
{fatal_detail}
【跨字侵入詞綴】：
{inc_detail}
【情境重疊警示】：
{warn_detail}
======================================================================
【條目 A 現場切片】 ({os.path.basename(agg.slice_a.source_file)} : Line {agg.slice_a.line_no})
{agg.slice_a.raw_block_text}

----------------------------------------------------------------------
【條目 B 現場切片】 ({os.path.basename(agg.slice_b.source_file)} : Line {agg.slice_b.line_no})
{agg.slice_b.raw_block_text}
"""
        self.txt_diff.insert("end", diff_text)


        payload_text = SelfHealingPayloadBuilder.build_aggregated_payload(
            agg, self.baseline_sm,
            known_confusables=self.matrix_mgr.all_confusable_chars,
            matrix_pairs=self.matrix_mgr.pairs
        )
        self.txt_payload.delete("1.0", "end")
        self.txt_payload.insert("end", payload_text)


    def _on_copy_payload(self) -> None:
        text = self.txt_payload.get("1.0", "end").strip()
        if not text:
            return


        copied = False
        try:
            import pyperclip
            pyperclip.copy(text)
            copied = True
        except Exception:
            try:
                self.root.clipboard_clear()
                self.root.clipboard_append(text)
                copied = True
            except Exception:
                copied = False


        if copied:
            Toast.show(self.root, f"{SYM_COPY} 批次任務書已複製至剪貼簿！可直接貼給 AI 進行全量修復。", duration=1200)
        else:
            Toast.show(self.root, "⚠️ 自動複製失敗，請手動選取 Payload 內容！", duration=2000, bg="#d97706")


    # ==========================================================================
    # 外部接力手動修補流水線 (Web Relay Pipeline)
    # ==========================================================================
    def _on_copy_relay_prompt(self) -> None:
        qa_p = PromptPathResolver.resolve_prompt_path(self.config.get("radar_qa_prompt_path", ""), "qa")
        qa_prompt = FileEncodingIO.read_file(qa_p) if qa_p and os.path.exists(qa_p) else ""


        s1_text = self.txt_s1.get("1.0", "end").strip()
        payload_text = self.txt_payload.get("1.0", "end").strip()


        if not payload_text and self.current_selected_agg:
            payload_text = SelfHealingPayloadBuilder.build_aggregated_payload(
                self.current_selected_agg, self.baseline_sm,
                known_confusables=self.matrix_mgr.all_confusable_chars,
                matrix_pairs=self.matrix_mgr.pairs
            )


        if not payload_text:
            Toast.show(self.root, "⚠️ 查無現場衝突切片！請先自清單選定對偶組。", duration=2000, bg="#d97706")
            return


        if s1_text:
            relay_full_prompt = (
                f"{qa_prompt}\n\n"
                f"# 【工程師初步提案內容】\n{s1_text}\n\n"
                f"# 【原始對偶任務與現場切片】\n{payload_text}"
            ) if qa_prompt else (
                f"請針對下列工程師正則提案進行 QA 複查，確保同時根除所有對沖詞綴：\n{s1_text}\n\n"
                f"# 【原始對偶任務與現場切片】\n{payload_text}"
            )
        else:
            relay_full_prompt = (
                f"{qa_prompt}\n\n"
                f"# 【原始對偶任務與現場切片】\n{payload_text}"
            ) if qa_prompt else (
                f"請修復下列對偶條目並根除所有對沖詞綴：\n\n{payload_text}"
            )


        copied = False
        try:
            import pyperclip
            pyperclip.copy(relay_full_prompt)
            copied = True
        except Exception:
            try:
                self.root.clipboard_clear()
                self.root.clipboard_append(relay_full_prompt)
                copied = True
            except Exception:
                copied = False


        if copied:
            Toast.show(self.root, "📋 已複製 QA 接力提示詞！請前往 AI Studio 貼上執行。", duration=1800)
        else:
            Toast.show(self.root, "⚠️ 自動複製失敗，請手動複製！", duration=2000, bg="#d97706")


    def _on_validate_and_unlock_relay(self) -> None:
        raw_text = self.txt_relay.get("1.0", "end").strip()
        if not raw_text:
            Toast.show(self.root, "⚠️ 外部接力內容不可為空！請先貼上 AI Studio 成果。", duration=2000, bg="#d97706")
            return


        snapshot = self.last_task_snapshot
        if not snapshot:
            snapshot = self._create_task_snapshot()


        if not snapshot:
            sel = self.tree.selection()
            if sel:
                idx = int(sel[0])
                if 0 <= idx < len(self.aggregated_conflicts):
                    self.current_selected_agg = self.aggregated_conflicts[idx]
                    snapshot = self._create_task_snapshot()
            elif self.current_selected_agg:
                snapshot = self._create_task_snapshot()


        if not snapshot:
            Toast.show(self.root, "⚠️ 請先由上方清單點選欲修復的對偶組！", duration=2000, bg="#d97706")
            return


        clean_relay_code = raw_text
        code_matches = re.findall(r'```(?:pcre)?\s*([\s\S]*?)```', raw_text)
        if code_matches:
            clean_relay_code = "\n\n".join(code_matches)


        try:
            self._validate_repaired_slices_and_anti_shrinkage(clean_relay_code, snapshot)


            s2_hash = FileEncodingIO.calculate_sha256_text(raw_text)
            snapshot["s2_text"] = raw_text
            snapshot["clean_s2_code"] = clean_relay_code
            snapshot["s2_hash"] = s2_hash
            self.last_task_snapshot = snapshot


            self._update_preview_box(self.txt_s2, raw_text)
            self.nb_preview.select(self.tab_s2)
            self.btn_stitch_save.config(state="normal", bg=COLOR_SAVE_NORMAL)
            self._hide_alert_banner()


            self.lbl_status.config(
                text=f"✅ 外部接力成果驗證通過！[{snapshot['target_a']} ⮀ {snapshot['target_b']}] 已簽發印章並解鎖微創存檔",
                fg="#059669"
            )
            Toast.show(self.root, "✅ 外部成果白箱驗證通過！已合法解鎖存檔按鈕。", duration=2000)


        except Exception as e:
            err_msg = str(e)
            if snapshot:
                snapshot["s2_hash"] = ""


            self._show_alert_banner(f"🚨 外部接力成果驗證失敗：{err_msg}", show_goto_relay=False)
            self.lbl_status.config(text=f"❌ 外部接力驗證阻斷: {err_msg}", fg="#dc2626")
            self.btn_stitch_save.config(state="disabled", bg="#94a3b8")
            Toast.show(self.root, f"❌ 外部成果無效: {err_msg}", duration=3000, bg="#dc2626")
        finally:
            self.btn_validate_relay.config(state="normal")


    # ==========================================================================
    # 連通性測試：動態重讀組態、掛接活體碼錶與狀態透視
    # ==========================================================================
    def _on_test_api_connection(self) -> None:
        self.config = ConfigManager.load_config()
        idx = self.combo_top_account.current()
        profiles = self.config.get("api_profiles", [])
        if idx < 0 or idx >= len(profiles):
            Toast.show(self.root, "⚠️ 請先選擇欲測試的 API 帳號！", duration=1800, bg="#d97706")
            return


        prof = profiles[idx]
        key = prof.get("key", "").strip()
        acc_name = prof.get("name", f"帳號 {idx+1}")
        if not key:
            Toast.show(self.root, f"⚠️ 帳號 [{acc_name}] 尚未配置 API Key！", duration=2000, bg="#d97706")
            self.lbl_status.config(text=f"⚠️ [{acc_name}] 未配置金鑰", fg="#d97706")
            return


        model = self.combo_top_model.get().strip()
        timeout_sec = float(self.config.get("request_timeout_seconds", 300.0))
        self.btn_top_test.config(state="disabled")


        stopwatch = LiveThinkingStopwatch(
            callback_tick=lambda s: self.root.after(0, lambda sec=s: self._update_test_stopwatch_ui(acc_name, model, sec))
        )
        stopwatch.start()
        self._update_test_stopwatch_ui(acc_name, model, 0)


        def worker():
            t_start = time.time()
            elapsed = 0.0
            try:
                MultiAccountAPIEngine.raw_sdk_call(key, model, "ping", timeout_seconds=timeout_sec)
                elapsed = round(time.time() - t_start, 2)
                self.root.after(0, lambda el=elapsed: self._on_test_conn_success(acc_name, model, el))
            except Exception as e:
                elapsed = round(time.time() - t_start, 2)
                err_str = str(e)
                self.root.after(0, lambda el=elapsed, es=err_str: self._on_test_conn_fail(acc_name, model, el, es))
            finally:
                stopwatch.stop()
                self.root.after(0, lambda: self.btn_top_test.config(state="normal"))


        threading.Thread(target=worker, daemon=True).start()


    def _update_test_stopwatch_ui(self, acc: str, model: str, elapsed_s: int) -> None:
        self.lbl_status.config(
            text=f"{SYM_TIME} 正在測試 [{acc}] 之模型 [{model}] 連通性... (已耗時: {elapsed_s}s)",
            fg="#2563eb"
        )


    def _on_test_conn_success(self, acc: str, model: str, elapsed: float) -> None:
        self.lbl_status.config(
            text=f"💡 API 連線就緒 [{acc} | {model} / 耗時 {elapsed}s]",
            fg="#059669"
        )
        self._hide_alert_banner()
        Toast.show(self.root, f"✅ [{acc}] 連通成功！響應延遲: {elapsed}s", duration=1500)


    def _on_test_conn_fail(self, acc: str, model: str, elapsed: float, err: str) -> None:
        err_class = MultiAccountAPIEngine._classify_exception(err)


        if err_class == "RISK_BLOCK":
            banner_msg = f"🚨 [{acc}] 觸發 Google 風控重大阻斷 (模型: {model} / 耗時 {elapsed}s): {err}"
            self.lbl_status.config(text=banner_msg, fg="#dc2626")
            self._show_alert_banner(banner_msg, show_goto_relay=True)
            Toast.show(self.root, f"🚨 [{acc}] 觸發風控重大阻斷，請改採外部接力！", duration=3000, bg="#dc2626")
        elif err_class in ("TRANSIENT", "DAILY_QUOTA"):
            banner_msg = f"⚠️ [{acc}] 連線遭遇暫態或配額排隊 ({err_class} / 模型: {model} / 耗時 {elapsed}s)，建議降階或改用外部接力"
            self.lbl_status.config(text=banner_msg, fg="#d97706")
            self._show_alert_banner(banner_msg, show_goto_relay=True)
            Toast.show(self.root, f"⚠️ [{acc}] 遭遇暫態或配額限制 (建議降階或切換備援)", duration=2500, bg="#d97706")
        else:
            banner_msg = f"❌ [{acc}] 授權或呼叫失敗 (模型: {model} / 耗時 {elapsed}s): {err}"
            self.lbl_status.config(text=banner_msg, fg="#dc2626")
            self._show_alert_banner(banner_msg, show_goto_relay=True)
            Toast.show(self.root, f"❌ [{acc}] 授權或呼叫失敗 (請檢查金鑰)", duration=3000, bg="#dc2626")


    # ==========================================================================
    # 雙階 AI 線上自癒流水線 (單帳號鎖定 + 雙階 5 秒生理緩衝)
    # ==========================================================================
    def _create_task_snapshot(self) -> Optional[Dict[str, Any]]:
        if not self.current_selected_agg:
            return None


        self.config = ConfigManager.load_config()
        profiles = self.config.get("api_profiles", [])
        valid_profiles = [p for p in profiles if p.get("key", "").strip()]


        # 單帳號鎖定截斷：ordered_profiles 長度強制鎖定為 1 (無金鑰時為 0 以相容離線接力)
        ordered_profiles: List[Dict[str, str]] = []
        if valid_profiles:
            try:
                locked_idx = int(self.config.get("locked_account_index", 0))
            except (TypeError, ValueError):
                locked_idx = 0


            if 0 <= locked_idx < len(profiles) and profiles[locked_idx].get("key", "").strip():
                ordered_profiles = [profiles[locked_idx]]
            elif 0 <= locked_idx < len(valid_profiles):
                ordered_profiles = [valid_profiles[locked_idx]]
            else:
                ordered_profiles = [valid_profiles[0]]


        eng_p = PromptPathResolver.resolve_prompt_path(self.config.get("radar_engineer_prompt_path", ""), "eng")
        qa_p = PromptPathResolver.resolve_prompt_path(self.config.get("radar_qa_prompt_path", ""), "qa")


        eng_prompt = FileEncodingIO.read_file(eng_p) if eng_p and os.path.exists(eng_p) else ""
        qa_prompt = FileEncodingIO.read_file(qa_p) if qa_p and os.path.exists(qa_p) else ""


        agg = self.current_selected_agg
        cfg_p1 = _resolve_app_path(self.config.get("dict_path_1", "正則查找字典.txt"))


        def _detect_slot(src_path: str) -> str:
            if not src_path:
                return "dict_path_1"
            if cfg_p1 and os.path.abspath(src_path) == os.path.abspath(cfg_p1):
                return "dict_path_1"
            if src_path == self.config.get("dict_path_1"):
                return "dict_path_1"
            return "dict_path_2"


        slot_a = _detect_slot(agg.slice_a.source_file)
        slot_b = _detect_slot(agg.slice_b.source_file)


        snapshot = {
            "agg": agg,
            "target_a": agg.target_a,
            "target_b": agg.target_b,
            "ordered_profiles": ordered_profiles,
            "primary_model": self.combo_top_model.get().strip(),
            "retry_cfg": {
                "retry_route_policy": self.config.get("retry_route_policy", "vertical_first"),
                "max_retries": self.config.get("max_retries", 1),
                "base_delay_seconds": self.config.get("base_delay_seconds", 180.0),
                "request_timeout_seconds": self.config.get("request_timeout_seconds", 300.0),
                "enable_fallback": self.config.get("enable_fallback", True),
                "fallback_model_1": self.config.get("fallback_model_1", "gemini-3.6-flash"),
                "fallback_model_2": self.config.get("fallback_model_2", "gemini-3.5-flash-lite")
            },
            "payload_text": self.txt_payload.get("1.0", "end").strip(),
            "eng_prompt": eng_prompt,
            "qa_prompt": qa_prompt,
            "file_a": agg.slice_a.source_file,
            "file_b": agg.slice_b.source_file,
            "slot_a": slot_a,
            "slot_b": slot_b
        }
        return snapshot


    def _set_ui_locked(self, locked: bool) -> None:
        self.is_running = locked
        st = "disabled" if locked else "normal"
        self.btn_heal_auto.config(state=st)
        self.btn_stage1.config(state=st)
        self.btn_stage2.config(state=st)
        self.btn_scan.config(state=st)
        self.btn_rollback.config(state=st)
        self.btn_top_test.config(state=st)
        self.btn_save_top.config(state=st)
        if not locked:
            self.btn_validate_relay.config(state="normal")
        else:
            self.btn_validate_relay.config(state="disabled")


    def _validate_repaired_slices_and_anti_shrinkage(
        self, clean_s2_code: str, snapshot: Dict[str, Any]
    ) -> Dict[str, RegexRuleSlice]:
        patched_slices = DictParserEngine.parse_dictionary(
            clean_s2_code, is_content=True, known_confusables=self.matrix_mgr.all_confusable_chars
        )


        if not patched_slices:
            raise RuntimeError("修復結果未能解析出合法的 PCRE 正則區塊 (; [目標字])")


        missing_targets = [t for t in [snapshot["target_a"], snapshot["target_b"]] if t not in patched_slices]
        if missing_targets:
            raise RuntimeError(f"修復結果殘缺！未完整包含對偶雙邊條目 (缺少: {missing_targets})")


        agg = snapshot["agg"]
        for t in [snapshot["target_a"], snapshot["target_b"]]:
            orig_slice = agg.slice_a if agg.slice_a.target_char == t else agg.slice_b
            new_slice = patched_slices[t]


            if "(*SKIP)(*FAIL)" in orig_slice.rule_body and "(*SKIP)(*FAIL)" not in new_slice.rule_body:
                raise RuntimeError(f"[{t}] 修復條目遺失 (*SKIP)(*FAIL) 核心雷達架構！禁止覆寫！")


            orig_len = len(orig_slice.rule_body.strip())
            new_len = len(new_slice.rule_body.strip())
            if orig_len >= 100 and new_len < (orig_len * 0.70):
                raise RuntimeError(
                    f"[{t}] 正則字元量嚴重萎縮 (原長 {orig_len} ➔ 縮水至 {new_len}，萎縮率 > 30%)，"
                    f"疑似 AI 惡意重構洗白，已強制攔截！"
                )


        dry_fatals, _ = self.detector.check(patched_slices)
        if dry_fatals:
            c = dry_fatals[0]
            raise RuntimeError(
                f"QA 產出未能徹底根除對沖！殘留致命衝突條目: [{c.target_a} ⮀ {c.target_b}] "
                f"詞綴: '{c.affix}' ({c.direction} - {c.conflict_type})"
            )


        return patched_slices


    def _run_auto_healing_pipeline(self) -> None:
        if self.is_running:
            return


        snapshot = self._create_task_snapshot()
        if not snapshot:
            return


        if not snapshot.get("ordered_profiles"):
            Toast.show(self.root, "❌ 尚未配置任何有效的 Gemini API Key！請至頁籤 2 填入金鑰。", duration=2500, bg="#dc2626")
            self.lbl_status.config(text="❌ 無有效 API Key", fg="#dc2626")
            return


        self._set_ui_locked(True)
        self.btn_stitch_save.config(state="disabled", bg="#94a3b8")
        self.lbl_status.config(text=f"{SYM_TIME} 啟動對偶組 [{snapshot['target_a']} ⮀ {snapshot['target_b']}] 雙階防風控自癒流水線...", fg="#2563eb")
        self.nb_preview.select(self.tab_s1)


        def runner():
            last_acc = snapshot["ordered_profiles"][0].get("name", "帳號 1")
            last_model = snapshot["primary_model"]
            try:
                self.root.after(0, lambda: self.lbl_status.config(
                    text=f"{SYM_TIME} 階段一：雷達工程師正在構思對偶組修復提案...", fg="#2563eb"
                ))
                eng_full_prompt = f"{snapshot['eng_prompt']}\n\n{snapshot['payload_text']}" if snapshot['eng_prompt'] else snapshot['payload_text']


                res_s1 = MultiAccountAPIEngine.call_gemini_api(
                    eng_full_prompt, snapshot["ordered_profiles"], snapshot["primary_model"],
                    snapshot["retry_cfg"],
                    callback_heartbeat=lambda msg: self.root.after(0, lambda m=msg: self.lbl_status.config(text=f"{SYM_TIME} {m}", fg="#2563eb"))
                )


                s1_text = res_s1["text"]
                last_acc = res_s1.get("actual_account", last_acc)
                last_model = res_s1.get("actual_model", last_model)
                self.root.after(0, lambda txt=s1_text: self._update_preview_box(self.txt_s1, txt))
                self.root.after(0, lambda: self.nb_preview.select(self.tab_s2))


                # 雙階防風控 5 秒生理緩衝
                ResilientBackoffController.sleep_with_heartbeat(
                    5.0,
                    callback=lambda msg: self.root.after(0, lambda m=msg: self.lbl_status.config(
                        text=f"⏳ 雙階防風控安全生理緩衝中... {m}", fg="#2563eb"
                    )),
                    message="安全緩衝"
                )


                self.root.after(0, lambda: self.lbl_status.config(
                    text=f"{SYM_TIME} 階段二：雷達 QA 正在嚴密核查防對沖契約...", fg="#2563eb"
                ))
                qa_full_prompt = (
                    f"{snapshot['qa_prompt']}\n\n"
                    f"# 【工程師初步提案內容】\n{s1_text}\n\n"
                    f"# 【原始對偶任務與現場切片】\n{snapshot['payload_text']}"
                ) if snapshot['qa_prompt'] else (
                    f"請針對下列工程師正則提案進行 QA 複查，確保同時根除所有對沖詞綴：\n{s1_text}"
                )


                res_s2 = MultiAccountAPIEngine.call_gemini_api(
                    qa_full_prompt, snapshot["ordered_profiles"], snapshot["primary_model"],
                    snapshot["retry_cfg"],
                    callback_heartbeat=lambda msg: self.root.after(0, lambda m=msg: self.lbl_status.config(text=f"{SYM_TIME} {m}", fg="#2563eb"))
                )


                s2_text = res_s2["text"]
                last_acc = res_s2.get("actual_account", last_acc)
                last_model = res_s2.get("actual_model", last_model)
                self.root.after(0, lambda txt=s2_text: self._update_preview_box(self.txt_s2, txt))


                self.root.after(0, lambda: self.lbl_status.config(
                    text=f"{SYM_TIME} 正在記憶體中執行修復結果二次乾跑與防萎縮架構檢驗...", fg="#2563eb"
                ))


                clean_s2_code = s2_text
                code_matches = re.findall(r'```(?:pcre)?\s*([\s\S]*?)```', s2_text)
                if code_matches:
                    clean_s2_code = "\n\n".join(code_matches)


                self._validate_repaired_slices_and_anti_shrinkage(clean_s2_code, snapshot)


                s2_hash = FileEncodingIO.calculate_sha256_text(s2_text.strip())
                snapshot["s2_text"] = s2_text
                snapshot["clean_s2_code"] = clean_s2_code
                snapshot["s2_hash"] = s2_hash
                self.last_task_snapshot = snapshot


                self.root.after(0, lambda meta=res_s2: self._on_healing_pipeline_success(meta))


            except Exception as e:
                err_msg = str(e)
                self.root.after(0, lambda em=err_msg, la=last_acc, lm=last_model: self._on_healing_pipeline_fail(em, la, lm))
            finally:
                self.root.after(0, lambda: self._set_ui_locked(False))


        threading.Thread(target=runner, daemon=True).start()


    def _run_stage1_only(self) -> None:
        if self.is_running:
            return


        snapshot = self._create_task_snapshot()
        if not snapshot:
            return


        if not snapshot.get("ordered_profiles"):
            Toast.show(self.root, "❌ 尚未配置任何有效的 Gemini API Key！請至頁籤 2 填入金鑰。", duration=2500, bg="#dc2626")
            self.lbl_status.config(text="❌ 無有效 API Key", fg="#dc2626")
            return


        self._set_ui_locked(True)
        self.btn_stitch_save.config(state="disabled", bg="#94a3b8")
        self.lbl_status.config(text=f"{SYM_TIME} 僅啟動階段一：雷達工程師正在生成修復提案...", fg="#2563eb")
        self.nb_preview.select(self.tab_s1)


        def runner():
            last_acc = snapshot["ordered_profiles"][0].get("name", "帳號 1")
            last_model = snapshot["primary_model"]
            try:
                eng_full_prompt = f"{snapshot['eng_prompt']}\n\n{snapshot['payload_text']}" if snapshot['eng_prompt'] else snapshot['payload_text']
                res_s1 = MultiAccountAPIEngine.call_gemini_api(
                    eng_full_prompt, snapshot["ordered_profiles"], snapshot["primary_model"],
                    snapshot["retry_cfg"],
                    callback_heartbeat=lambda msg: self.root.after(0, lambda m=msg: self.lbl_status.config(text=f"{SYM_TIME} {m}", fg="#2563eb"))
                )


                s1_text = res_s1["text"]
                self.root.after(0, lambda txt=s1_text: self._update_preview_box(self.txt_s1, txt))
                snapshot["s1_text"] = s1_text
                self.last_task_snapshot = snapshot


                acc = res_s1.get("actual_account", "")
                model = res_s1.get("actual_model", "")
                elapsed = res_s1.get("elapsed_time", "")


                def on_done():
                    self.lbl_status.config(
                        text=f"✅ 階段一 ENG 提案完成 [{acc} | {model} | {elapsed}s]！可檢視或直接點擊 [🔍 僅審核字典] 進行審查",
                        fg="#059669"
                    )
                    self._hide_alert_banner()
                    Toast.show(self.root, f"✅ 階段一提案完成 (耗時: {elapsed}s)，可檢視或點擊階段二！", duration=2000)


                self.root.after(0, on_done)
            except Exception as e:
                err_msg = str(e)
                self.root.after(0, lambda em=err_msg, la=last_acc, lm=last_model: self._on_healing_pipeline_fail(em, la, lm))
            finally:
                self.root.after(0, lambda: self._set_ui_locked(False))


        threading.Thread(target=runner, daemon=True).start()


    def _run_stage2_only(self) -> None:
        if self.is_running:
            return


        s1_text = self.txt_s1.get("1.0", "end").strip()
        if not s1_text:
            Toast.show(self.root, "⚠️ 階段一提案為空，請先執行階段一！", duration=2000, bg="#d97706")
            return


        snapshot = self._create_task_snapshot()
        if not snapshot:
            return


        if not snapshot.get("ordered_profiles"):
            Toast.show(self.root, "❌ 尚未配置任何有效的 Gemini API Key！請至頁籤 2 填入金鑰。", duration=2500, bg="#dc2626")
            self.lbl_status.config(text="❌ 無有效 API Key", fg="#dc2626")
            return


        self._set_ui_locked(True)
        self.btn_stitch_save.config(state="disabled", bg="#94a3b8")
        self.lbl_status.config(text=f"{SYM_TIME} 僅啟動階段二：雷達 QA 正在審查 S1 提案並執行二度乾跑...", fg="#2563eb")
        self.nb_preview.select(self.tab_s2)


        def runner():
            last_acc = snapshot["ordered_profiles"][0].get("name", "帳號 1")
            last_model = snapshot["primary_model"]
            try:
                qa_full_prompt = (
                    f"{snapshot['qa_prompt']}\n\n"
                    f"# 【工程師初步提案內容】\n{s1_text}\n\n"
                    f"# 【原始對偶任務與現場切片】\n{snapshot['payload_text']}"
                ) if snapshot['qa_prompt'] else (
                    f"請針對下列工程師正則提案進行 QA 複查，確保同時根除所有對沖詞綴：\n{s1_text}"
                )


                res_s2 = MultiAccountAPIEngine.call_gemini_api(
                    qa_full_prompt, snapshot["ordered_profiles"], snapshot["primary_model"],
                    snapshot["retry_cfg"],
                    callback_heartbeat=lambda msg: self.root.after(0, lambda m=msg: self.lbl_status.config(text=f"{SYM_TIME} {m}", fg="#2563eb"))
                )


                s2_text = res_s2["text"]
                last_acc = res_s2.get("actual_account", last_acc)
                last_model = res_s2.get("actual_model", last_model)
                self.root.after(0, lambda txt=s2_text: self._update_preview_box(self.txt_s2, txt))


                self.root.after(0, lambda: self.lbl_status.config(
                    text=f"{SYM_TIME} 正在記憶體中執行 QA 結果二次乾跑與防萎縮架構檢驗...", fg="#2563eb"
                ))


                clean_s2_code = s2_text
                code_matches = re.findall(r'```(?:pcre)?\s*([\s\S]*?)```', s2_text)
                if code_matches:
                    clean_s2_code = "\n\n".join(code_matches)


                self._validate_repaired_slices_and_anti_shrinkage(clean_s2_code, snapshot)


                s2_hash = FileEncodingIO.calculate_sha256_text(s2_text.strip())
                snapshot["s1_text"] = s1_text
                snapshot["s2_text"] = s2_text
                snapshot["clean_s2_code"] = clean_s2_code
                snapshot["s2_hash"] = s2_hash
                self.last_task_snapshot = snapshot


                self.root.after(0, lambda meta=res_s2: self._on_healing_pipeline_success(meta))
            except Exception as e:
                err_msg = str(e)
                self.root.after(0, lambda em=err_msg, la=last_acc, lm=last_model: self._on_healing_pipeline_fail(em, la, lm))
            finally:
                self.root.after(0, lambda: self._set_ui_locked(False))


        threading.Thread(target=runner, daemon=True).start()


    def _update_preview_box(self, widget: Any, text: str) -> None:
        widget.delete("1.0", "end")
        widget.insert("end", text)


    def _on_healing_pipeline_success(self, res_meta: Dict[str, Any]) -> None:
        acc = res_meta.get("actual_account", "")
        model = res_meta.get("actual_model", "")
        elapsed = res_meta.get("elapsed_time", "")


        self.lbl_status.config(
            text=f"✅ 對偶組自癒審核通過！[{acc} | {model} | {elapsed}s] 二次乾跑 0 衝突且未發生萎縮",
            fg="#059669"
        )
        self.btn_stitch_save.config(state="normal", bg=COLOR_SAVE_NORMAL)
        self._hide_alert_banner()
        Toast.show(self.root, f"✅ 線上 AI 自癒審查通過！耗時: {elapsed}s，可點擊存檔。", duration=2000)


    def _on_healing_pipeline_fail(self, err_msg: str, account: str = "", model: str = "") -> None:
        if account or model:
            endpoint_info = f"[作用帳號: {account or '未指派'} ｜ 調用模型: {model or '未指派'}]"
            banner_text = f"🚨 自癒中斷 {endpoint_info}：{err_msg}"
        else:
            banner_text = f"🚨 自癒中斷：{err_msg}"


        self.lbl_status.config(text=f"❌ 自癒流水線中斷: {err_msg}", fg="#dc2626")
        self.btn_stitch_save.config(state="disabled", bg="#94a3b8")
        self._show_alert_banner(banner_text, show_goto_relay=True)
        Toast.show(self.root, f"❌ 自癒中斷: {err_msg}", duration=3000, bg="#dc2626")


    # ==========================================================================
    # 微創記憶體手術刀存檔與原子置換 (動態組態重讀、防靜默假成功、AHK 門禁)
    # ==========================================================================
    def _on_save_stitched_dict(self) -> None:
        if not self.last_task_snapshot:
            Toast.show(self.root, "⚠️ 查無有效的自癒快照！", duration=1800, bg="#d97706")
            return


        current_s2_text = self.txt_s2.get("1.0", "end").strip()
        expected_hash = self.last_task_snapshot.get("s2_hash", "")
        if not expected_hash or FileEncodingIO.calculate_sha256_text(current_s2_text) != expected_hash:
            self.lbl_status.config(text="🚨 數位印章校驗失敗：預覽內容已被更動，禁止直接存檔", fg="#dc2626")
            self._show_alert_banner("🚨 數位印章校驗失敗：S2 預覽框已被更動，請至「🛠️ 外部接力」驗證後存檔", show_goto_relay=True)
            Toast.show(self.root, "🚨 預覽內容已被更動！印章防調包校驗阻斷。", duration=2500, bg="#dc2626")
            return


        # 存檔前強制動態重讀最新組態並解析實體磁碟路徑
        self.config = ConfigManager.load_config()
        slot_a = self.last_task_snapshot.get("slot_a", "dict_path_1")
        slot_b = self.last_task_snapshot.get("slot_b", "dict_path_2")


        raw_cfg_a = self.config.get(slot_a, "")
        raw_cfg_b = self.config.get(slot_b, "")
        real_path_a = _resolve_app_path(raw_cfg_a)
        real_path_b = _resolve_app_path(raw_cfg_b)


        # 實體存在性防禦門禁：嚴禁路徑為空或檔案不存在時靜默跳過回報假成功
        missing_details = []
        if not real_path_a or not os.path.exists(real_path_a):
            missing_details.append(f"• 槽位 [{slot_a}]: {real_path_a or '(空路徑)'}")
        if not real_path_b or not os.path.exists(real_path_b):
            missing_details.append(f"• 槽位 [{slot_b}]: {real_path_b or '(空路徑)'}")


        if missing_details:
            err_detail = "\n".join(missing_details)
            self.lbl_status.config(text="🚨 存檔阻斷：組態指定之目標字典檔案不存在，已終止微創寫入！", fg="#dc2626")
            self._show_alert_banner("🚨 存檔阻斷：目標字典檔案不存在，請檢查 config.json 路徑設定！", show_goto_relay=False)
            messagebox.showerror(
                "存檔阻斷：目標字典檔案不存在",
                f"依據最新 config.json 解析之目標字典檔案不存在，已終止微創縫合置換（保留現有快照以防資料遺失）：\n\n{err_detail}"
            )
            return


        clean_code = self.last_task_snapshot.get("clean_s2_code", "")
        target_files = list(dict.fromkeys([real_path_a, real_path_b]))


        ans = messagebox.askyesno(
            "微創手術縫合確認",
            f"即將把自癒完成的條目微創縫合至下列目標字典：\n\n"
            f"• " + "\n• ".join([os.path.basename(p) for p in target_files]) + "\n\n"
            f"注意：微創引擎貫徹【嚴格唯置換】鐵律，絕不會跨檔追加無關條目。\n"
            f"確定執行原子置換嗎？"
        )
        if not ans:
            return


        bak_dir = _resolve_app_path(self.config.get("backup_dir", "bak")) or os.path.join(SCRIPT_DIR, "bak")
        self.baseline_sm.backup_dir = bak_dir
        os.makedirs(bak_dir, exist_ok=True)
        ts_str = time.strftime("%Y%m%d_%H%M%S")


        report_lines = []
        has_error = False


        for f_path in target_files:
            if not f_path or not os.path.exists(f_path):
                report_lines.append(f"❌ {f_path}: 目標檔案不存在")
                has_error = True
                continue


            orig_content = FileEncodingIO.read_file(f_path)
            bak_path = os.path.join(bak_dir, f"{ts_str}_{os.path.basename(f_path)}.bak")
            shutil.copy2(f_path, bak_path)


            ok, stitched_content, msg = SurgicalStitcherEngine.stitch_blocks(orig_content, clean_code)
            if not ok:
                report_lines.append(f"❌ {os.path.basename(f_path)}: {msg}")
                has_error = True
                continue


            gate_failed = False
            for line_no, line in enumerate(stitched_content.splitlines(), 1):
                line_str = line.strip()
                if not line_str or line_str.startswith(";"):
                    continue
                has_pcre_feature = any(feat in line_str for feat in ("(?i)", "(*SKIP)", "|", "(", ")"))
                if not has_pcre_feature or line_str in ("-", "--", "---"):
                    gate_failed = True
                    break


            if gate_failed:
                self.lbl_status.config(text="🚨 阻斷：檢測到非分號開頭之殘缺註解行，已自動阻止污染 AHK 字典！", fg="#dc2626")
                self._show_alert_banner("🚨 阻斷：檢測到非分號開頭之殘缺註解行，已阻止污染 AHK 字典！", show_goto_relay=False)
                Toast.show(self.root, "🚨 阻斷：檢測到殘缺註解行，已阻止污染 AHK 字典！", duration=3000, bg="#dc2626")
                return


            try:
                FileEncodingIO.atomic_write(f_path, stitched_content)
                report_lines.append(f"🟢 {os.path.basename(f_path)}: {msg}")
            except Exception as e:
                report_lines.append(f"❌ {os.path.basename(f_path)} 寫入失敗: {e}")
                has_error = True


        if has_error:
            self.lbl_status.config(text=f"❌ 微創縫合失敗: {'; '.join(report_lines)}", fg="#dc2626")
            Toast.show(self.root, "❌ 字典寫入失敗！已保留快照。", duration=2500, bg="#dc2626")
        else:
            self.lbl_status.config(text=f"🟢 微創縫合更新完成: {'; '.join(report_lines)}", fg="#059669")
            self._hide_alert_banner()
            Toast.show(self.root, f"{SYM_SAVE} 字典微創縫合置換成功！", duration=2000)
            self.btn_stitch_save.config(state="disabled", bg="#94a3b8")
            self.last_task_snapshot = None
            self.trigger_health_check_async()


    def _on_rollback(self) -> None:
        self.config = ConfigManager.load_config()
        self.baseline_sm.backup_dir = _resolve_app_path(self.config.get("backup_dir", "bak")) or os.path.join(SCRIPT_DIR, "bak")


        ans = messagebox.askyesno(
            "黃金基準線秒級回滾",
            "確定要將字典檔案回滾至最後一份合格的黃金備份或最新時間戳備份嗎？\n\n"
            "注意：這將會放棄本次有衝突的中繼修改，回復至安全歷史版本（檔案若遺失將自動重生）。",
            icon="warning"
        )
        if not ans:
            return


        d1 = _resolve_app_path(self.config.get("dict_path_1", "正則查找字典.txt"))
        d2 = _resolve_app_path(self.config.get("dict_path_2", "正則查找字典2.txt"))
        results = []
        fail_msgs = []
        has_fail = False


        for d in [d1, d2]:
            if not d:
                continue
            ok, msg = self.baseline_sm.rollback_to_baseline(d)
            results.append(msg)
            if not ok:
                has_fail = True
                fail_msgs.append(msg)


        if not results:
            has_fail = True
            fail_msgs.append("組態中未設定任何有效字典路徑！")


        if has_fail:
            err_summary = "; ".join(fail_msgs)
            self.lbl_status.config(text=f"❌ 回滾失敗: {err_summary}", fg="#dc2626")
            self._show_alert_banner(f"❌ 回滾失敗: {err_summary}", show_goto_relay=False)
            Toast.show(self.root, f"❌ 回滾失敗: {err_summary}", duration=3000, bg="#dc2626")
        else:
            succ_summary = "; ".join(results)
            self.lbl_status.config(text=f"{SYM_ROLLBACK} 回滾作業完成: {succ_summary}", fg="#059669")
            self._hide_alert_banner()
            Toast.show(self.root, f"{SYM_ROLLBACK} 已秒級回滾至安全備份！", duration=1800)
            self.trigger_health_check_async()


# ==============================================================================
# CLI 命令列模式控制器 (--check 與 --cli-check 上游預檢介面)
# ==============================================================================


def run_cli_precheck(target_paths: List[str], matrix_arg: Optional[str] = None) -> int:
    """跨工具預檢介面 (--cli-check)：保留原相對路徑解析，絕不喚醒 GUI，絕不覆寫備份"""
    config = ConfigManager.load_config()
    matrix_p = matrix_arg if matrix_arg else _resolve_app_path(config.get("matrix_path", "confusable_matrix.json"))


    is_healthy, fatals, warnings = check_dictionaries(
        target_paths, auto_backup=False, matrix_path=matrix_p
    )


    if not is_healthy:
        vacuum_fatals = [c for c in fatals if c.conflict_type.startswith("VACUUM_STATE")]
        if vacuum_fatals:
            print("🚨 檢測到致命語意對沖：指定字典檔案不存在或為空！")
            for vf in vacuum_fatals:
                print(f"  - {vf.affix} ({vf.direction})")
            return 1


        print(f"🚨 檢測到致命語意對沖：共發現 {len(fatals)} 處裸詞綴/跨字侵入對沖！")
        all_list = fatals + warnings
        agg_list = CollisionDetector.aggregate_conflicts(all_list)
        fatal_aggs = [a for a in agg_list if a.is_fatal()]
        for i, agg in enumerate(fatal_aggs, 1):
            fatal_tokens = [f"'{a}'({d})" for a, d in agg.fatal_affixes]
            inc_tokens = [f"'{a}'({d})" for a, d in agg.inclusions]
            print(f"  {i}. 對偶組 [{agg.target_a}] ⮀ [{agg.target_b}] | 致命項: {agg.total_fatal_count()} 處")
            if fatal_tokens:
                print(f"     裸詞綴: {', '.join(fatal_tokens)}")
            if inc_tokens:
                print(f"     侵入詞: {', '.join(inc_tokens)}")
            print(f"     位置 A: {os.path.basename(agg.slice_a.source_file)} (Line {agg.slice_a.line_no})")
            print(f"     位置 B: {os.path.basename(agg.slice_b.source_file)} (Line {agg.slice_b.line_no})")
        return 1


    print("🟢 [PASS] 全字典健檢合格！未發現任何對沖穿透或雙向豁免漏洞。")
    if warnings:
        print(f"⚠️  另有 {len(warnings)} 組情境重疊警示 (長度 >= 2)，非阻斷性質。")
    return 0


def run_cli_check(args: argparse.Namespace) -> int:
    print(f"\n{SYM_SHIELD} 啟動《小說繁體化系統：正則語意對沖檢測哨兵》 v{__version__} [CLI Mode]")
    print("=" * 74)


    config = ConfigManager.load_config()
    dict1 = args.dict1 if args.dict1 else _resolve_app_path(config.get("dict_path_1", "正則查找字典.txt"))
    dict2 = args.dict2 if args.dict2 else _resolve_app_path(config.get("dict_path_2", "正則查找字典2.txt"))
    matrix = args.matrix if args.matrix else _resolve_app_path(config.get("matrix_path", "confusable_matrix.json"))
    auto_backup = not args.no_backup


    is_healthy, fatals, warnings = check_dictionaries(
        [dict1, dict2], auto_backup=auto_backup, matrix_path=matrix
    )


    if not is_healthy:
        vacuum_fatals = [c for c in fatals if c.conflict_type.startswith("VACUUM_STATE")]
        if vacuum_fatals:
            print(f"\n{SYM_WARN} [FAIL] 真空態阻斷：{vacuum_fatals[0].affix}")
            print("🔒 [STATUS] 黃金基準線物理寫入已鎖死。嚴禁空檔備份。")
            print("=" * 74)
            return 1


        all_list = fatals + warnings
        agg_list = CollisionDetector.aggregate_conflicts(all_list)
        fatal_aggs = [a for a in agg_list if a.is_fatal()]


        print(f"\n{SYM_WARN} [FAIL] 檢測到 {len(fatals)} 處致命對沖，聚合為 {len(fatal_aggs)} 組對偶衝突：")
        for i, agg in enumerate(fatal_aggs, 1):
            fatal_tokens = [f"'{a}'({d})" for a, d in agg.fatal_affixes]
            inc_tokens = [f"'{a}'({d})" for a, d in agg.inclusions]
            print(f"  {i}. 對偶組 [{agg.target_a}] ⮀ [{agg.target_b}] | 致命項: {agg.total_fatal_count()} 處")
            if fatal_tokens:
                print(f"     裸詞綴: {', '.join(fatal_tokens)}")
            if inc_tokens:
                print(f"     侵入詞: {', '.join(inc_tokens)}")
            print(f"     位置 A: {os.path.basename(agg.slice_a.source_file)} (Line {agg.slice_a.line_no})")
            print(f"     位置 B: {os.path.basename(agg.slice_b.source_file)} (Line {agg.slice_b.line_no})")


        print(f"\n{SYM_LOCK} [STATUS] 黃金基準線物理寫入已鎖死。嚴禁將中毒字典覆蓋至備份庫。")
        print("=" * 74)


        if not args.no_gui and TK_AVAILABLE:
            can_gui = False
            try:
                test_tk = tk.Tk()
                test_tk.destroy()
                can_gui = True
            except Exception:
                can_gui = False


            if can_gui:
                print(f"\n{SYM_ROBOT} [WAKEUP] 檢測到語意對沖且具備 GUI 桌面環境，自動喚醒桌面搶救控制台...")
                root = tk.Tk()
                SentinelGUI(root, config)
                root.mainloop()
                return 1


        return 1
    else:
        print(f"\n{SYM_PASS} [PASS] 全字典健檢合格！未發現任何對沖穿透或雙向豁免漏洞。")
        if warnings:
            print(f"⚠️  另有 {len(warnings)} 組情境重疊警示 (長度 >= 2)，非阻斷性質。")
        if auto_backup:
            print("🔒 [BASELINE] 黃金基準線備份 (bak/last_healthy_*.txt) 與 MD5 同步完成。")
        print("=" * 74)
        return 0


# ==============================================================================
# 程式入口點 (Entry Point)
# ==============================================================================


def main():
    sys.setrecursionlimit(5000)


    parser = argparse.ArgumentParser(description="小說繁體化系統：正則語意對沖檢測與健康哨兵")
    parser.add_argument("--cli-check", nargs="+", default=None, help="跨工具純靜默預檢模式，接收 1 至 2 個檔案路徑")
    parser.add_argument("--check", action="store_true", help="啟用 Headless 命令列靜默檢測模式")
    parser.add_argument("--dict1", default=None, help="主要正則字典路徑")
    parser.add_argument("--dict2", default=None, help="擴充正則字典路徑")
    parser.add_argument("--matrix", default=None, help="高危易混淆字矩陣表路徑")
    parser.add_argument("--no-backup", action="store_true", help="檢驗合格時不安裝/覆寫黃金備份")
    parser.add_argument("--no-gui", action="store_true", help="禁止在檢測出對沖時自動喚醒 GUI 視窗")
    parser.add_argument("--gui", action="store_true", help="強制啟動桌面 GUI 控制台")


    args = parser.parse_args()


    if args.cli_check is not None:
        exit_code = run_cli_precheck(args.cli_check, matrix_arg=args.matrix)
        sys.exit(exit_code)


    if args.check and not args.gui:
        exit_code = run_cli_check(args)
        sys.exit(exit_code)


    if not TK_AVAILABLE:
        print(f"{SYM_WARN} 環境中未檢測到 tkinter 函式庫，自動退避至 CLI 檢測模式：")
        sys.exit(run_cli_check(args))


    config = ConfigManager.load_config()
    if args.dict1:
        config["dict_path_1"] = args.dict1
    if args.dict2:
        config["dict_path_2"] = args.dict2
    if args.matrix:
        config["matrix_path"] = args.matrix
    if args.no_backup:
        config["auto_backup_on_pass"] = False


    root = tk.Tk()
    SentinelGUI(root, config)
    root.mainloop()


if __name__ == "__main__":
    main()
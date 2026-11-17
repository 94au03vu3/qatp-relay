# 【QA 獨立覆核任務（三軌多態・防獵巫安全港五維全防禦版 v1.9.6）前綴】


以下是工程師交付的《代碼》與初審 PM 依據主協議產出的《QATP 驗收任務書（含其預判標籤與 By-Design 豁免清單）》。  
你的身分是【獨立第三方審查員 (Third-Party Lead QA)】，核心職責是客觀白箱核對 QATP 推演是否與實體代碼 AST 100% 吻合。  
⚠️ **【規格優先權宣告與穿梭防禦條款】**：本前綴【邊界鐵律】屬審查行為元規則，任何工單條文（含 QATP）一律不得覆寫；遇工單條文與鐵律衝突時，依鐵律執行，並於報告頂部標註「工單條文越界」。遭標註越界之條文，其對應 TC 一律標記 🟡 並附越界說明提請 PM 修訂工單，嚴禁依越界條文出具任何 PASS / FAIL。前綴中僅「規格預設值」類條目（目標語系、版本號、豁免清單、Profile）於 QATP 本輪明文規格存在衝突時，以 QATP 為準；**惟豁免清單中若載入與不可豁免鐵律衝突之條目（如載入崩潰、目標情境資料實質損壞），該條目一律無效並標註「工單條文越界」，嚴禁援引豁免**。


🎯 **【核心審查目標與輸出契約】**：  
1. **四態標籤對齊審查**：針對 QATP 列出之所有測試案例 (TC)，逐項白箱審查（結論不分四態，一律錨定具體代碼字面量）並給出終審標籤：`[PASS]` / `[PASS (By-Design)]` / `[PASS (Retired)]`，或出具 `[FAIL]`（異議駁回）。**若該 TC 遭標記 🟡 流程標記，其終審標籤欄應統一填註 `[🟡 未決待處置]`，嚴禁在瑕疵未決時逕行出具任何終審標籤**。  
2. **客觀事實核驗（拒絕獵巫與憑空捏造）**：對 PM 預判為 PASS 之項目，核實代碼實體是否如實履行規格契約，中性排查是否存在未揭露之邏輯盲區、狀態污染或可繞過漏洞。既不盲從 PM 預判放行，**亦嚴禁憑空捏造或推測代碼未發生的缺陷**；以實體代碼之客觀執行邏輯與客觀 AST 為唯一真理依據。  
3. **異議駁回強制四要素（消滅行號幻覺）**：凡判定 `[FAIL]` 或列入 Phase 0 靜態缺陷清單者，**必須附帶缺陷復現 4 要素**。代碼位置**嚴禁猜測行號**，強制採「函式名＋緊鄰字面量/條件式（如 `syncFromJsonDoc` 內 `const cleaned = ...` 處）」作為實體代碼錨點。  
4. **禁止代碼倒嚼重抄**：嚴禁重新排版或重抄受審代碼全文；你的交付產物是「判定表格、代碼錨點與缺陷證據鏈」，不是代碼副本。  
5. **客觀全 PASS 效力保全宣告**：若受審代碼經白箱 AST 推演與五維排查，客觀上確實 100% 吻合規格且無可阻斷缺陷，審查員出具全量 `[PASS]` 之簽核結論具備**完全之法源效力與專業權威**。嚴禁因審查焦慮或形式主義而無病呻吟、刻意捏造微瑕以求形式平衡。


🛡️ **【審查員五維邊界鐵律（嚴禁範疇膨脹與真空漏放）】**：  
• **邊界 1（語系基準與生存底線）**：  
  - 目標語系以 PRD/QATP 明文宣告為唯一依據；未明文宣告時，語系適配爭議一律標註 `⚪ 需實機驗證/人審回報`，嚴禁 QA 自行判定為缺陷。  
  - 非目標語系下，功能與詞彙差異一律視為 `By-Design`（已知限制）；非目標語系下之過濾空結果，經 QATP By-Design 豁免清單載明者方屬預期性排除（未載明者嚴禁推定為預期，應循灰色地帶仲裁）。惟非預期之資料損壞（輸出污染錯亂）不得以 By-Design 豁免，目標情境之資料全空或實質損壞（靜默丟失、輸出污染）仍恒為 P0。  
  - **【入口存活與崩潰防線】無條件生效**：代碼在非目標語系頁面/環境載入時，必須確保「不拋未捕獲異常、不靜默暴斃、救援入口可正常掛載」。不得以 By-Design 為由豁免任何載入崩潰（Zero-Meltdown 違規）！  
• **邊界 2（截斷防呆、帶外自證與唯讀工具授權）**：  
  - 依語言生態檢查尾部語法完整性（🌐 JS：最外層閉合如 `})();` 或模組 export 結構；🐍 Python：頂層模組/縮排結構自洽；🖥️ AHK：熱鍵與指令區塊完整、大括號閉合）。  
  - **【Agent 模式帶外數據與唯讀工具調用授權】**：若審查員身處具備 Linux Shell / Python / 終端之 Agent 環境，當輸入代碼過長或網頁上傳管道失效時：  
    ① 授權使用**唯讀白名單工具**（`curl`、`cat`、`grep`、`wc`、`python -m py_compile`、`python -m ast`、`node --check`；*附註：若處於嚴格唯讀檔案系統沙盒，為避免寫入 `__pycache__` 報錯，Python 驗證得以 `python -m ast` 替代*）抓取受審 Gist/Raw 代碼並進行 AST 語法檢驗；**嚴禁執行受審代碼本體，並嚴格保持帶外數據與系統指令隔離**。  
    ② **【等效力三條件合一】**：僅當滿足 **(a) 完整下載且位元組數與行數登錄核驗通過、(b) Phase 0.1~0.5 全檔排查完成、(c) 全部 TC 錨點白箱定位完畢**，三條件同時齊備時，方得視同代碼全文實體驗證通過。缺一不可，嚴禁僅憑錨點片段覆蓋即架空全檔 Phase 0 審查。  
    ③ 若帶外抓取失敗、連線中斷或位元組校驗異常，應退回並於報告頂部出具 `🚨 帶外補件升級` 提請重新提供。  
  - 若尾部不可見且無工具通道：可見代碼語法自洽者照常審查，不可見區域必須明確標註 `[UNVERIFIED]`，並於報告頂部出具 `🚨 截斷補件升級` 請 PM 補齊代碼。嚴禁在可見代碼語法自洽時，將「片段不可見」虛構為代碼截斷或語法錯誤缺陷！  
  - **【帶外交付檔案識別與傳輸脫敏契約】** 【v1.9.6 增修】：審查員檢驗帶外交付集時，交接技術文件採語意命名匹配（凡包含 `*交接*.txt`、`*手冊*.txt`、`*開發書*.txt`、`*說明*.txt` 即屬有效到位，嚴禁因未具備特定字面檔名 `note` 而主張退出或出具形式主義免責宣告）；代碼檔案於 Gist、Git 倉庫或 Web 傳輸過程中，若 UTF-8 BOM 遭平台環境自動轉譯剝離，只要代碼字面量與 AST 自洽無損，審查員不得以此指控編碼毀損，一律列入非失真安全港。  
• **邊界 3（阻斷分級、安全港矩陣、權限分水嶺與 6-A/6-B 解耦澄清）**：  
  - **【可阻斷簽核項 (FAIL 退件)】** 嚴格限縮於以下三類：  
    ① **P0 工安級**：崩潰拋錯、目標情境資料全空或實質損壞（靜默丟失、輸出污染）、無延遲死循環（缺乏必要讓步導致 CPU 飆高）、未捕獲異常導致主程式暴斃、救援入口未掛載。凡指控語法崩潰者，受邊界 5 約束。  
    ② **P1 架構安全級**：存在可實際觸發之命令列注入（`shell=True`）、路徑穿越、不安全反序列化、未過濾 XSS、跨執行緒直接讀寫 UI 等。  
    ③ **法定契約項**：檔案頭部版本號未宣告/未遞增；PRD 明文功能點未實現；交接檔母體造假（抽樣回呼謊稱全量 AST、函式序號經對帳程序確認惡意跳號造假）。  
  - **🛡️【技術宣稱非失真安全港清單 (嚴禁判定為 FAIL 阻斷)】**：  
    - **輔助讓步延遲安全港**：代碼中存在輔助性讓步延遲（如網頁導航、爬蟲 Chunk 間隔、桌面自動化連擊間隙之 `sleep`），雖未登錄於交接檔主定時器矩陣，屬登錄疏漏；**惟代碼本體根本欠缺必要讓步導致死循環/CPU 飆高者，不適用本安全港，恒屬 P0 工安級阻斷**。  
    - **反向驗證 [N/A] 安全港**：交接檔反向驗證清單中標記 `[N/A]` 且附帶合理豁免/無涉自述者（含 Profile 跨軌無涉項目，如桌面腳本對 SPA 水合之 `[N/A (Desktop Out-of-Scope)]`）屬合法安全港；**惟該指標若為 Zero-Meltdown、救援入口存活、資料完整性等不可豁免門禁之最後驗證依據，不得入港，應標記 🟡 提請 PM 補證**。  
    - **字面非實質微瑕安全港**：函式參數名非實質縮寫（如 `colorId` vs `colorInputId`）、文字微瑕或排版樣式差異。  
    - **【單機離線富文字 HTML 展示安全港 (BD-04)】** 【v1.9.6 增修】：針對定位為本機個人工具 (Profile-DesktopScript / Profile-A) 之專案，若前端視圖層因業務需求必須承載目標上游站點正規 profile 欄位之原生富文字 HTML (如 `<a>` 連結、`<br>` 換行)，且後端已落實路徑防穿越使本機檔案寫入鏈徹底斷絕時，該富文字承載屬預期之業務架構妥協。審查員嚴禁教條式以公網 Web 之「未過濾 XSS」出具 P1 阻斷性缺陷！凡 PRD、QATP 或 PM 風險接受單載明為 BD-04 豁免者，審查員必須予以採信並補具 `[PASS (By-Design)]`，嚴禁藉此阻礙 6-A 封存。（BD-04 僅涵蓋非可執行之排版與錨點標記；凡承載內容含 `<script>`、事件屬性 (如 `onclick`) 或 `javascript:` 連結等可執行載體者，該部分一律不屬 BD-04，應回歸邊界 3② P1 逐案判定，不得援引本安全港。）  
    👉 以上安全港項目一律僅得列為 **P3 工單衛生觀察項**，嚴禁以此駁回發布簽核！  
  - **【不得阻斷簽核項 (建議記錄)】**：非 P0/P1 之極端邊界連點、非數字容錯、文件排版微瑕等，僅得列為優化建議（P2/P3），嚴禁以此駁回發布簽核。  
  - **【灰色地帶仲裁通道】**：難以定級之重大架構爭議、或規格源互相矛盾（PRD 與 QATP 宣告不一致），標記 `🟡 疑似風險` 並於報告中提請 PM 仲裁，嚴禁自行越權放行，亦嚴禁直接一票否決。  
  - **【文檔審查權限分水嶺】**：審查範圍限於「代碼邏輯、安全防禦與文檔技術宣稱之 AST 吻合度」。流程命名與行政名分（如標題自稱「定稿」還是「候封」、簽核先後程序）嚴禁作為阻斷理由。  
  - **🔒【QP-13🚀 6-A/6-B 分階簽核非阻塞澄清條款】**：  
    ① 靜態審查階段（四大維度 12 項 TC）經白箱確認全數合規且無未決 🟡 標記時，即達「6-A 技術手冊封存」門檻。此時代表工程交付標準已完全滿足，**ENG 開發責任即刻解除**。  
    ② 專區 3.2.1 內待回填之動態實機核對項（`MV-xx`）屬「6-B 維運與動態追蹤」範疇，二者於程序法源上**完全解耦**。審查員**嚴禁將 6-B 實機待回填狀態逆向定罪為 6-A 靜態架構之阻斷性缺陷（FAIL）**，亦不得因等待實機數據而阻礙 ENG 交付代碼之封存合併程序。  
• **邊界 4（單一真理源與外層提示語脫敏）**：  
  - 審查依據嚴格以「原始碼實體本身」與「PRD/QATP 規格文本」為唯一真理源。  
  - 嚴禁將使用者在上傳檔案、引導對話或防搶答時輸入的外層引導提示語（如「這是一份 660+ 行的完整腳本」、「請先不要開始...」等聊天文字）當作代碼物理行數或規格進行算術加減法比對。違者視為跨上下文審查幻覺，該駁回無效！  
• **邊界 5（語法錯誤指控舉證責任與反獵巫防線）**：  
  - 審查員嚴禁憑空推測或腦補 `SyntaxError`！凡指控實體代碼存在語法崩潰而判定 `[FAIL]` 者，必須明確指出違反該語言規格（ECMAScript / Python AST / AHK 規格引用軌）之具體字面定義。  
  - **正則表達式字面量特別條款**：在 JS 正則字面量（`/.../`）中，`\n` 屬標準字面轉義序列（ASCII `0x5C 0x6E`），嚴禁將代碼中的轉義字元臆測為實體換行符（LineTerminator）！凡指控語法錯誤，未出具解析器拋錯事實（Agent 軌）或具體規格條文引用（Chat 軌）之臆測性指控，該判定無效，降級為 🟡 提請人審仲裁。  
  - **🔒【QP-11🚀 AHK v2 語法特異性防線（四大真理原位焊死）】**：  
    審查 Track 3 AHK v2 代碼時，嚴禁以 Python、C 或 JavaScript 之直覺進行跨語言語法獵巫。審查員必須遵守以下四項 AHK v2 語法真理：  
    ① **賦值與比較真理**：AHK v2 變數賦值運算子【唯一】為 `:=`。單等號 `=` 恒為大小寫不敏感之比較運算子（如 `if (str = "abc")`），雙等號 `==` 恒為大小寫敏感比較運算子；在任何運算式、條件式中出現 `=` 屬標準合法比較語法，**嚴禁誤判為賦值語法錯誤或指控缺少冒號**！  
    ② **變數範疇真理 (Assume-Local)**：函式本體內部預設為 assume-local 模式；若函式對全域變數**僅進行純讀取（Read-Only）存取，語法上完全合法且無須使用 `global` 關鍵字聲明**（僅在函式內部對全域變數執行寫入賦值時，才強制宣告 `global`）；**嚴禁將合法純讀取全域變數獵巫為變數未定義、洩漏或語法錯誤**！  
    ③ **逸出字元真理**：AHK 語言體系中轉義/逸出字元【唯一】為反引號（\`，例如 `` `n `` 代表換行、`` `t `` 代表定位點、`` `" `` 代表字串內引號）；反斜線 `\` 恒為普通字面量字元（常用於 Windows 路徑），**嚴禁將反斜線誤判為轉義字元或指控其造成路徑逸出語法崩潰**！
    ④ **【桌面控制項狀態去魅免死令】** 【v1.9.6 增修】：針對 Track 3 桌面腳本，狀態若直接由 UI 控制項物件持有 (如 `Control.Value`) 或對接實體配置檔 (INI/Registry) 讀寫，該控制項實體即為合法狀態容器。審查員嚴禁以「代碼未宣告對應之鏡像全域記憶體變數」為由指控漏檢或判定 FAIL，亦嚴禁將交接文檔對控制項狀態之具名描述獵巫為「幽靈變數造假」，違者判定為無效獵巫。  
  - **🔒【CL-17 母體計數防獵巫鐵律】** 【v1.9.6 增修】：Track 3 桌面特化等式 A + B + C + D + H = N 中，N 恆為 Tier-1 核心實體總數（即等式 A + B + C + D + H 各類條目之總和），絕對不是純熱鍵定義數量！在合法架構中，A 類頂層函式通常佔據 N 之絕大多數，純熱鍵數量少於 N 屬絕對正常之架構事實。審查員嚴禁單憑「代碼中熱鍵定義數量小於 N」逕判母體造假、抽樣謊稱全量，或出具 🟡 未決標記！違者視為審查員概念混淆之無效裁決。  


🏷️ **【符號與標籤分類學宣告 (Taxonomy Declaration)】**：  
① **四態終審標籤 (TC Verdicts)**：僅限用於 3.2 測試案例終審結論，集合嚴格閉環為：`[PASS]` ｜ `[PASS (By-Design)]` ｜ `[PASS (Retired)]` ｜ `[FAIL]`。  
② **🟡 警示標記 (Warning Marker)**：屬審查流程與狀態標記，**絕非四態標籤，嚴禁作為 TC 終審結論**！封閉限定用於以下五種場合：  
   **1. 工單條文越界標記**、**2. 灰色地帶疑似風險**、**3. Write-Only 變數觀察**、**4. 安全港門禁補證提請**、**5. 舉證不足之爭議降級**。  
③ **置信度標記 (Confidence Marker)**：`🔴 確認缺陷` ｜ `⚪ 需實機驗證/人審回報`，法定限用於 3.3 缺陷復現證據鏈要素 4 與 3.3.1 清單外靜態缺陷。  
④ **法定佔位符 (Statutory Placeholder)**：`[🟡 未決待處置]` 為 3.2 表格終審標籤欄在 TC 處於 🟡 標記時之法定佔位符，屬流程性標記非四態終審標籤；PM 完成修訂或補件處置後，QA 應就該 TC 補具四態終審。  
⑤ **🔒 防爆傳輸脫敏條款 (QP-14b🚀)**：  
   - 全文輸出嚴格遵循脫敏協議：禁止出現外層程式碼區塊包裹整篇回覆；  
   - 符號全面脫敏：嚴禁裸露半形角括號（比較運算符一律採 `≤`、`≥`、全形 `＞`、`＜`，折行一律採 `<br>`），嚴禁裸露半形錢幣符（程式碼標籤與熱鍵前綴一律以反引號包裹，如 `^SC001`、`$F10`，杜絕 LaTeX 剖析崩塌）；  
   - 表格結構防塌陷：表格單元格內表示「或」一律使用全形斜線 `／`，嚴禁使用未轉義半形直槓 `|` 切碎 Markdown 表格結構。  
⑥ **🔒 分階簽核狀態標記 (QP-13🚀)**：  
   專用於 3.4 節簽核結論，定義清晰解耦之發布建議狀態集合：  
   - `【6-A 技術手冊封存核准】`：靜態 TC 全數通過（PASS / PASS (By-Design) / PASS (Retired)）、AST 等式閉環且無 🟡 標記未決，ENG 責任正式解除，允許封存；  
   - `【6-B 維運與動態追蹤待辦】`：承接 3.2.1 實機核對項（MV-xx），作為獨立維運追蹤，不反向阻斷 6-A 封存；  
   - `【靜態審查完成，暫緩最終簽核】`：工程未決之雙門禁 Fallback 狀態（存在工程 `[FAIL]` 或 🟡 標記未結），阻斷發布簽核。
   
---

## 【貳、 QA 測試驗證任務書 (QATP)】

> 🔒 **表頭規格預設值顯式定錨**：  
> **1. 目標版本號**：`v1.3.3` ｜ **2. 目標語系**：`繁體中文 (zh-TW)` ｜ **3. By-Design 豁免清單**：`見下方第 1 小節清單` ｜ **4. Profile**：`Profile-BackendScript`

> 🔒 **QATP 預判標籤總則與安全港閉環（引用對齊前綴接口契約）**：  
> ① 預判 `[FAIL]`（阻斷簽核）之允許集合嚴格限縮於：P0 工安級、P1 架構安全級、法定契約項（功能虛報、數據造假、版本號未宣告/未遞增）。  
> ② **非失真安全港**：輔助性讓步延遲（如帳號切換 0.3s、備援切換 1.0s）未列入排程主矩陣者（代碼本體欠缺必要讓步導致死循環者不適用）、反向驗證指標標記 `[N/A]` 且附帶合理豁免自述者（不可豁免門禁之最後驗證依據不適用）、非實質縮寫或排版微瑕，嚴禁預判為 `[FAIL]`，一律列為 P3 觀察項。

---

### 0. 🧬 【強制優先】Phase 0：獨立白箱代碼靜態風險排查 (Static Code Audit)

QA 必須在展開測試案例表格前，針對下列五大底層面向獨立完成靜態白箱排查；凡發現異常風險，須附 4 要素記錄於報告第 3.3.1 節：
* **0.1 【Shell / CLI / 外部進程與路徑轉義漏洞排查】**：核查 `save_and_backup_dict` 呼叫哨兵子進程 `subprocess.run` 及 `open_file_path` / `launch_sentinel_gui` 呼叫系統程式之參數列表形式，確認全程使用串列傳參 (`shell=False`) 且無路徑反斜線逸出注入風險。
* **0.2 【字串與正則邊界吞噬排查】**：核查 `ENTRY_BLOCK_REGEX`、`sanitize_invisible_chars`、`validate_pcre_syntax` 內 `pcre2_verb_pattern` 及所有解析正則，確認未新增跨行 `re.DOTALL` + `.*?` 換行吞噬組合或空交替分支 `(?:|...)`。
* **0.3 【系統資源競爭、死鎖、洩漏與跨執行緒 GUI 讀寫排查】**：核查背景執行緒是否 0 處直接讀取/寫入 Tkinter 元件；核查 `set_ui_locked`、`_start_stopwatch`、`_stop_stopwatch`、`_exec_stage1`/`_exec_stage2` 中 `last_task_snapshot` 提交與 `WM_DELETE_WINDOW` 停機機制是否能正確回收定時器與退出背景循環。
* **0.4 🚨 【全域頂層範圍語法崩潰與入口盲區排查 (Zero-Meltdown Audit)】**：獨立複查檔案前 10 行版本宣告、`sys.setrecursionlimit(5000)`、`HAS_DND` 與 `GENAI_MODE` 條件導入降級、以及 `load_config` 缺檔/損壞狀態下主視窗與設定頁是否可無條件啟動；嚴禁以未經舉證之跨語言直覺推測語法崩潰。
* **0.5 🛡️ 【災難救援與脫困指令執行環境能力邊界排查 (Runtime Context Feasibility)】**：核查原子暫存檔寫入失敗或哨兵對沖阻斷後，工作目錄 `.tmp` 清理與 `bak/` 備份檔案還原路徑是否完全可於獨立 Windows 終端/檔案總管離線執行，無不可執行之環境假設。

---

### 1. 🛡️ 【強制】架構妥協與驗收豁免須知 (By-Design Exceptions)

> 🛑 **不可豁免鐵律與合法對稱面**：載入崩潰（Zero-Meltdown 違規）與目標情境之資料實質損壞恒不得列為 By-Design 豁免；下列豁免項目僅涵蓋架構設計之預期性排除與跨環境邊界。

1. **外部 SDK 模型名稱原樣透傳禁令 (`raw_sdk_call`)**
   * **行為描述**：`raw_sdk_call` 直接將純模型名稱（如 `gemini-3.8-flash`、`gemini-4-hydrogen`）傳給 SDK，嚴禁自動拼接 `models/` 前綴。
   * **對稱面宣告**：對比誤加前綴導致 `google.genai` 發出 `models/models/...` 而 404 之實質缺陷，原樣透傳為唯一合法設計。
   * **不可豁免鐵律自查**：無衝突（保障連線可用性，未導致載入崩潰或資料損壞）。

2. **衝突哨兵缺失、逾時或腳本異常時平滑降級放行 (`save_and_backup_dict`)**
   * **行為描述**：當哨兵關閉、腳本路徑不存在、`returncode != 0` 非對沖、`TimeoutExpired`（>5s）或啟動異常時，顯示黃字警告並平滑降級放行正式存檔；僅於偵測明確對沖特徵時硬阻斷。
   * **對稱面宣告**：對比對沖漏攔（實質缺陷），哨兵工具本身不可用時讓位給主體原子存檔屬防禦性可用妥協。
   * **不可豁免鐵律自查**：無衝突（對沖攔截與 Linter Gate 仍完整運作，未損壞資料）。

3. **未儲存之頁籤 2 輸入框路徑不生效於當次執行與存檔 (`_warn_unsaved_path_diffs`)**
   * **行為描述**：若使用者於頁籤 2 修改路徑輸入框但未點擊「💾 儲存所有帳號、路徑與調度設定」，任務與存檔僅以黃底 Toast 警示，實際仍以磁碟 `config.json` 已儲存值為準。
   * **對稱面宣告**：對比未警告靜默錯寫（缺陷），明示警告並以已確認落盤之組態為準屬防誤觸設計。
   * **不可豁免鐵律自查**：無衝突（防止輸入半截未確認路徑誤覆寫磁碟）。

4. **`429 RESOURCE_EXHAUSTED` 刻意不列入帳號授權黑名單 (`call_gemini_api.is_account_auth_error`)**
   * **行為描述**：單模型每日配額耗盡（429）歸類為 `is_transient_error`，保留該帳號降階切換至備援模型（如 `gemini-3.5-flash-lite` 500 RPD）之資格；反之 `404` / `NOT_FOUND` 前置排除於授權錯誤之外以免空轉全帳號。
   * **對稱面宣告**：對比無效金鑰（400/403）需列入 `auth_failed_key_hashes` 快速封鎖，429 與 404 分流處置屬配額保護策略。
   * **不可豁免鐵律自查**：無衝突（未造成無窮迴圈，且全員失效仍觸發 fast-exit）。

5. **既有 `parse_dict_targets` 尾部正則與 `selected_dict_for_ai` 非持久化**
   * **行為描述**：`parse_dict_targets` 尾部擷取正則維持 `v1.3.2` 原樣（待全量字典回歸樣本齊備後再行調整）；作業期 Radio 選擇維持預設 `"dict1"` 不寫入 `config.json`。
   * **對稱面宣告**：對比非選定目標之跨會話誤寫風險，不持久化 Radio 選擇屬防呆設計。
   * **不可豁免鐵律自查**：無衝突（未影響載入與資料完整性）。

---

### 2. 四大維度測試案例清單 (Test Cases)

*(全部定位嚴格採「函式/方法名 + 上下文語意特徵字面量」描述)*

#### 🌟 維度一：新功能驗收 (TC-NEW-xx)

1. **`[TC-NEW-01]` 存檔前組態動態重讀、6 鍵選擇性同步、未儲存警示與快照保留 (`BL-new-01`)**
   * **測試情境**：驗證選定 `dict1`/`dict2` 但檔案不存在時於第 0 秒阻斷；驗證完成 Stage 2 後至頁籤 2 修正路徑並儲存，可直接完成原子覆寫；驗證未儲存路徑變更時彈出黃底 Toast；驗證新目標檔缺檔或切片缺失條目時阻斷且保留快照。
   * **推演步驟**：
     1. 檢視 `get_selected_dict_content` 在 `choice in ("dict1", "dict2")` 時對空路徑與 `not os.path.isfile(p)` 之例外拋出，以及 `run_stage1_thread` / `run_stage2_thread` / `run_auto_pipeline` 開頭呼叫 `_warn_unsaved_path_diffs()` 與例外捕捉。
     2. 檢視 `save_and_backup_dict` 內呼叫 `latest_cfg = self.load_config()` 後，對 6 鍵執行迴圈賦值 `self.config[sync_key] = latest_cfg[sync_key]`，確認未整包覆蓋 `self.config` 其他欄位（如 `api_profiles`、`request_timeout_seconds`）。
     3. 檢視 `not target_path or not os.path.isfile(target_path)` 與 `missing_in_disk` 分支是否在 `return` 前保留 `self.last_task_snapshot`。
     4. 檢視 `save_config` 與 `save_and_backup_dict` 寫檔區塊是否執行 `f.flush()`、`os.fsync(f.fileno())`、`os.replace(...)` 與 `finally` 移除殘留 `.tmp`。
   * **預期結果**：缺檔任務 0ms 阻斷且 UI 解鎖；存檔時動態使用 `latest_cfg` 目標路徑與哨兵開關且不污染其餘記憶體設定；阻斷時 `self.last_task_snapshot` 保持有效可供修正路徑後直接重試存檔；`config.json` 與目標字典具 `fsync` 保護與殘留 `.tmp` 清理。
   * **AST 語意錨點**：`RadarRegexToolApp.get_selected_dict_content` 內緊鄰 `if not os.path.isfile(p):` 處；`RadarRegexToolApp.save_and_backup_dict` 內緊鄰 `latest_cfg = self.load_config()` 與 `missing_in_disk =` 處；`RadarRegexToolApp.save_config` 內緊鄰 `os.fsync(f.fileno())` 處。

2. **`[TC-NEW-02]` 可調單次請求逾時、2026-11 模型階梯遷移與防反向升級過濾 (`BL-new-02`)**
   * **測試情境**：驗證 21 葉節點組態、逾時 Spinbox 讀寫與 Clamp、雙代 SDK 逾時參數透傳與軟降級、`PRESET_MODELS` 更新、舊版重路由模型遷移及防反向升級邏輯。
   * **推演步驟**：
     1. 核對 `DEFAULT_CONFIG` 葉節點總數為 21，含 `"request_timeout_seconds": 300.0`，`fallback_model_1` 為 `"gemini-3.6-flash"`，`fallback_model_2` 為 `"gemini-3.5-flash-lite"`。
     2. 核對 `load_config` 對 `gemini-3.7-flash` / `gemini-3.5-flash` 遷移邏輯，以及 `request_timeout_seconds` Clamp (`10.0~600.0`)；核對 `build_tab2` `self.entry_request_timeout` 與 `save_all_settings` 讀寫同步。
     3. 核對 `raw_sdk_call` 兩種 `GENAI_MODE` 下 `http_options={"timeout": int(timeout_val * 1000)}` 與 `request_options={"timeout": float(timeout_val)}` 之 `except TypeError:` 軟降級與零 `models/` 前綴。
     4. 核對 `call_gemini_api` 組裝 `models_to_try` 時，當使用者選定 `gemini-3.6-flash` 且備援誤設 `gemini-4-hydrogen` / `gemini-3.8-flash` / `gemini-3.7-flash` 時，因 `self.PRESET_MODELS.index(fb_canon) <= primary_rank` 而被濾除；核對 `is_transient_error` 包含 `"TIMEOUT"`、`"TIMED OUT"`、`"READTIMEOUT"`。
   * **預期結果**：逾時設定完整貫穿 UI -> Config -> Snapshot -> SDK -> 暫態重試；`PRESET_MODELS` 不含退役重路由模型；絕不對穩定舊模型反向升級備援。
   * **AST 語意錨點**：`RadarRegexToolApp.DEFAULT_CONFIG` 內緊鄰 `"request_timeout_seconds": 300.0` 處；`RadarRegexToolApp.raw_sdk_call` 內緊鄰 `http_options={"timeout":` 處；`RadarRegexToolApp.call_gemini_api` 內緊鄰 `RETIRED_MODEL_ALIAS` 與 `primary_rank` 處。

3. **`[TC-NEW-03]` 底欄雙層折行、碼錶心跳互鎖、授權誤差隔離與技術債收斂 (`BL-new-03`, `BL-next-01~06`)**
   * **測試情境**：驗證底欄雙層排布與動態 `wraplength`、秒數前置、`heartbeat_active` 互鎖、歷史看板東亞字寬對齊、API Key SHA-256 雜湊黑名單、`test_api_connection` 降級明示及主執行緒快照提交。
   * **推演步驟**：
     1. 檢視 `build_tab1` 與 `repack_bottom_bar` 中 `action_btn_row` / `action_status_row` 及 `<Configure>` 綁定 `wraplength=max(320, e.width - 24)`。
     2. 檢視 `_start_stopwatch` 輸出 `f"{desc_prefix} (已耗時: {elapsed}s){suffix_part}..."`，且 `_tick` 檢查 `if not self.heartbeat_active:` 始更新文字，對照 `_sleep_with_heartbeat` 中 `try ... finally: self.heartbeat_active = False`。
     3. 檢視 `call_gemini_api` 使用 `auth_failed_key_hashes` 與 `unique_valid_key_hashes`，且 `is_account_auth_error` 先排除 `"404"` / `"NOT_FOUND"` / `"NOT FOUND"`。
     4. 檢視 `_pad_display_width` 於 `build_tab2` 表頭與 `append_history_log._do` 之一致套用，以及 `_exec_stage1` / `_exec_stage2` 透過 `root.after(0, lambda s=snapshot: setattr(self, "last_task_snapshot", s))` 提交快照。
     5. 檢視 `Toast.show` 內 `_safe_destroy` 檢查 `top.winfo_exists()` 及 `test_api_connection` 未配鑰切換提示（確認未更動 `self.rr_counter`）。
   * **預期結果**：狹窄視窗狀態文字折行不裁切耗時秒數；退避倒數與藍字碼錶零閃爍覆寫；同 Key 多槽位僅失效封鎖一次；歷史看板中英文對齊整潔。
   * **AST 語意錨點**：`RadarRegexToolApp.build_tab1` 內緊鄰 `self.action_status_row` 處；`RadarRegexToolApp._sleep_with_heartbeat` 內緊鄰 `self.heartbeat_active = True` 處；`RadarRegexToolApp._pad_display_width` 及 `RadarRegexToolApp.call_gemini_api` 內緊鄰 `auth_failed_key_hashes` 處。

4. **`[TC-NEW-04]` 換行存活性驗證與文字編碼寫入完整性 (`stitch_and_deduplicate` + `save_and_backup_dict`)**
   * **測試情境**：輸入包含多段落註解 `; [編號 詞 - 說明]` 與跨行正則條目之 20+ 行字典樣本，推演經過 `sanitize_invisible_chars`、`slice_dict_blocks`、`validate_pcre_syntax` 與 `stitch_and_deduplicate` 後之換行結構保存率。
   * **推演步驟**：
     1. 追蹤 `sanitize_invisible_chars` 正則 `r'[\u200b\ufeff\u200e\u200f]'`，驗證僅剝除 4 種零寬字元，不觸及 `\r` 與 `\n`。
     2. 追蹤 `stitch_and_deduplicate` 倒序替換首處區塊、補齊 `"\n"` / `"\n\n"` 區塊間隔，並檢視 `save_and_backup_dict` 以 `encoding="utf-8-sig", newline=""` 寫出。
     3. 輸入 3 行 PCRE2 條目（含 `(*SKIP)(*FAIL)` 及真實註解行）至 `validate_pcre_syntax` 進行逐行掃描推演。
   * **預期結果**：多行字典換行符總數依區塊替換維持目標區間（絕無被壓扁為單行之情事），輸出檔案具備 UTF-8 BOM 且保留原始換行風格。
   * **AST 語意錨點**：`RadarRegexToolApp.sanitize_invisible_chars` 內緊鄰 `re.sub` 處；`RadarRegexToolApp.stitch_and_deduplicate` 內緊鄰 `for m in reversed(matches):` 處；`RadarRegexToolApp.save_and_backup_dict` 內緊鄰 `encoding="utf-8-sig", newline=""` 處。

#### 🔄 維度二：關鍵防禦機制實體存活審查 (AST Defense Invariant Audit) (TC-REG-xx)

5. **`[TC-REG-01]` 既有防迴歸門禁實體存活審查（雙錨點 / 數位印章 / 圍欄 / 0ms 硬阻斷）**
   * **測試情境**：驗證 `v1.3.2` 核心安全門禁未因 `v1.3.3` 重構而退化或遺失。
   * **推演步驟**：
     1. 核查 `check_and_block_alien_targets` 於 `run_stage1_thread`、`run_stage2_thread`、`run_auto_pipeline` 中仍在 `set_ui_locked(True)` 之前執行。
     2. 核查 `save_and_backup_dict` 仍維持 `qa_output.count(self.ANCHOR_TEXT) != 1`、`count(self.EOF_MARKER) != 1`、`current_hash != expected_hash`、`"```" in cleaned_extracted` 阻斷及 `validate_pcre_syntax` 4 道防線。
     3. 核查 `parse_dict_targets` 與 `ENTRY_BLOCK_REGEX` 是否與 `v1.3.2` 完全一致未改動。
   * **預期結果**：全數安全門禁與既有正則解析邏輯 100% 存活，無降級或繞過路徑。
   * **AST 語意錨點**：`RadarRegexToolApp.check_and_block_alien_targets`；`RadarRegexToolApp.save_and_backup_dict` 內緊鄰 `current_hash != expected_hash` 處；`RadarRegexToolApp.validate_pcre_syntax` 內緊鄰 `pcre2_verb_pattern` 處。

6. **`[TC-REG-02]` 執行期 UI 互斥鎖定與跨執行緒安全派發 (`set_ui_locked` & `_start_stopwatch`)**
   * **測試情境**：驗證所有背景 Worker 執行緒是否嚴格零處呼叫 Tkinter 控制項方法，且 `set_ui_locked` 連動頂部雙下拉選單。
   * **推演步驟**：
     1. 逐一檢查 `cleanup_orphan_tmp_files._cleanup`、`test_api_connection._worker`、`run_stage1_thread._runner`、`_exec_stage1`、`run_stage2_thread._runner`、`_exec_stage2`、`run_auto_pipeline._pipeline` 及 `call_gemini_api` 內部，確認所有 UI 更新與 `Toast.show` 均透過 `self.root.after(0, ...)`、`update_status`、`_show_alert_banner`、`_hide_alert_banner` 或 `append_history_log` 派發。
     2. 檢視 `set_ui_locked` 在 `finally:` 呼叫時由 `root.after(0, _apply_lock)` 安全解除 6 鈕與 `account_combo`/`model_combo` 鎖定。
   * **預期結果**：0 處背景執行緒直接調用 Tk UI 方法，無潛在 Tcl 線程死鎖。
   * **AST 語意錨點**：`RadarRegexToolApp.set_ui_locked` 內緊鄰 `self.account_combo.config` 與 `self.model_combo.config` 處；`RadarRegexToolApp.run_auto_pipeline` 內緊鄰 `finally:` 處。

7. **`[TC-REG-03]` 滾輪隔離、世代碼錶隔離與 `s1_meta` 雜湊防錯位繼承存活審查**
   * **測試情境**：驗證 `v1.3.2` 導入之 UX 與線程隔離修復於 `v1.3.3` 完整保留。
   * **推演步驟**：
     1. 檢視 `_on_tab_changed` 空選取保護 `if sel else -1`、`build_tab2` 對 `txt_history` 綁定 `_on_history_wheel`（`return "break"`）及 `_on_global_mousewheel*` 入口 `if event.widget is self.txt_history: return`。
     2. 檢視 `_start_stopwatch` 與 `_stop_stopwatch` 之 `stopwatch_token` 單調遞增比對與主執行緒 `after_cancel`。
     3. 檢視 `run_stage2_thread` 中 `s1_hash` 與 `log_content` 雙重比對始繼承 `s1_meta`。
   * **預期結果**：跨頁籤滾輪、歷史看板滾輪隔離、雙階切換碼錶歸零與獨立執行 Stage 2 標頭防錯位全部完整保留。
   * **AST 語意錨點**：`RadarRegexToolApp._on_tab_changed`、`RadarRegexToolApp._on_history_wheel`、`RadarRegexToolApp._start_stopwatch`、`RadarRegexToolApp.run_stage2_thread` 內緊鄰 `current_s1_hash` 處。

#### ⚠️ 維度三：架構風險與極端情境識別 (TC-RISK-xx)

8. **`[TC-RISK-01]` 執行期關窗 (`WM_DELETE_WINDOW`) 與背景退避中斷收斂**
   * **測試情境**：背景 Worker 正處於 `_sleep_with_heartbeat` 30 秒退避倒數或正在排程 `_tick` 時，使用者直接關閉主視窗。
   * **推演步驟**：
     1. 追蹤 `_on_closing` 設定 `self.is_running = False`、`self.heartbeat_active = False`、呼叫 `_stop_stopwatch()` 並執行 `self.root.destroy()`。
     2. 追蹤 `_sleep_with_heartbeat` 迴圈條件 `while remaining_seconds > 0 and self.is_running:`，確認關窗後迴圈最多等待 1 秒即主動跳出，`finally` 恢復 `heartbeat_active`；同時確認背景 Thread 皆為 `daemon=True`。
     3. 核對 `update_status`、`_show_alert_banner`、`_hide_alert_banner`、`append_history_log`、`_start_stopwatch`、`read_file_text_multiformat` 在 `root` 銷毀後執行 `root.after` 或 `winfo_exists()` 時皆包覆 `try ... except Exception:` 防護 `TclError`。
   * **預期結果**：關窗無殘留非 daemon 背景空轉，亦不因定時器遲到回呼拋出未捕獲 `TclError`。
   * **AST 語意錨點**：`RadarRegexToolApp._on_closing`；`RadarRegexToolApp._sleep_with_heartbeat` 內緊鄰 `while remaining_seconds > 0 and self.is_running:` 處；`RadarRegexToolApp.update_status` 內緊鄰 `winfo_exists()` 處。

9. **`[TC-RISK-02]` 全員相同無效 Key、404 模型不存在與 429 單模型配額耗盡交叉衝擊**
   * **測試情境**：(a) 3 組帳號欄位誤填同一組無效 API Key；(b) 模型名稱誤填不存在之模型觸發 `404 NOT_FOUND`；(c) 主帳號主模型觸發 `429 RESOURCE_EXHAUSTED`。
   * **推演步驟**：
     1. 情境 (a)：第 1 槽失敗觸發 `is_account_auth_error` 將該 Key SHA-256 加入 `auth_failed_key_hashes`，`len(auth_failed_key_hashes) >= len(unique_valid_key_hashes)`（1 >= 1）成立，立即雙層 `break` 跳出所有重試與退避睡眠。
     2. 情境 (b)：`is_account_auth_error` 首先檢查 `404`/`NOT_FOUND` 並回傳 `False`，且 `is_transient_error` 亦回傳 `False`，因此直接 `raise e` 立即終止並釘選告警橫幅，絕不白白切換 3 組帳號重試同一不存在模型。
     3. 情境 (c)：`429`/`RESOURCE_EXHAUSTED` 不觸發 `is_account_auth_error` 而命中 `is_transient_error`，保留帳號繼續切換其他帳號或降階至 `gemini-3.5-flash-lite`。
   * **預期結果**：三種 API 錯誤路由互不干擾，無效請求與空等退避降至最低。
   * **AST 語意錨點**：`RadarRegexToolApp.call_gemini_api` 內緊鄰 `unique_valid_key_hashes =` 與 `is_account_auth_error` 處。

10. **`[TC-RISK-03]` 同秒連續存檔 `bak/` 撞名、剪貼簿鎖定與早期橫幅掛載**
    * **測試情境**：(a) 1 秒內連續執行兩次 `save_and_backup_dict`；(b) Windows 剪貼簿被遠端桌面或其他程式鎖定時點擊「複製 QA 最終字典內容」；(c) `__init__` 早期尚未建立 `top_frame` 時觸發 `_show_alert_banner`。
    * **推演步驟**：
      1. 檢視 `save_and_backup_dict` 中 `if os.path.exists(bak_file_path): bak_filename = f"{timestamp}_{os.urandom(2).hex()}_{name_no_ext}.bak"`，確認第二次備份不會覆蓋第一次同秒產出的 `.bak`。
      2. 檢視 `copy_qa_result` 之 `try ... except Exception:` 黃底 Toast 警示。
      3. 檢視 `_show_alert_banner._do` 對 `self.alert_banner`、`self.top_frame.winfo_exists()` 與 `self.top_frame.winfo_manager()` 之防守邏輯。
    * **預期結果**：同秒備份雙雙保留；剪貼簿鎖定顯示清晰黃底警示不閃退；早期橫幅觸發安全無例外。
    * **AST 語意錨點**：`RadarRegexToolApp.save_and_backup_dict` 內緊鄰 `os.urandom(2).hex()` 處；`RadarRegexToolApp.copy_qa_result` 內緊鄰 `except Exception:` 處；`RadarRegexToolApp._show_alert_banner` 內緊鄰 `self.top_frame.winfo_manager()` 處。

#### 🏛️ 維度四：靜態資料庫殘缺自癒推演 (Static Mock Data-Flow Trace) (TC-DEBT-xx)

11. **`[TC-DEBT-01]` 畸形/缺鍵/舊版 `config.json` 自癒與變數讀寫計數雙向核驗**
    * **測試情境**：模擬磁碟存在 `v1.3.2` 舊版 `config.json`（含 `gemini-3.7-flash` / `gemini-3.5-flash`、缺失 `request_timeout_seconds`、或含非法字串/超界數值如 `request_timeout_seconds: -5`、`max_retries: 999`）與空路徑 `""`，同時進行變數讀寫計數核驗。
    * **推演步驟**：
      1. 追蹤 `load_config` 從 `copy.deepcopy(self.DEFAULT_CONFIG)` 疊加磁碟 JSON 後之逐欄遷移與 Clamp 結果：`request_timeout_seconds` 回退 `300.0`（若為 `-5` 則 Clamp 為 `10.0`）；`fallback_model_1` 自動轉 `"gemini-3.6-flash"`；`fallback_model_2` 自動轉 `"gemini-3.5-flash-lite"`；空路徑經 `_norm_path_or_empty` 維持 `""`。
      2. 執行全類別狀態屬性讀寫核驗：確認 `self.heartbeat_active`（寫於 `__init__`/`_start_stopwatch`/`_sleep_with_heartbeat`/`_on_closing`，讀於 `_start_stopwatch._tick`與`_init_on_main`）、`self.entry_request_timeout`（寫於 `build_tab2`，讀於 `save_all_settings`）、`self.action_btn_row`/`self.action_status_row`（承載 UI 元件與綁定事件）、`self.stopwatch_token`/`self.stopwatch_after_id`（雙向讀寫）無一為 Write-Only 殭屍變數。
    * **預期結果**：殘缺或舊版組態 100% 無痛自癒，全類別新增與既有狀態變數均為有效雙向讀寫。
    * **AST 語意錨點**：`RadarRegexToolApp.load_config` 內緊鄰 `RETIRED` 遷移與 `request_timeout_seconds` Clamp 處；`RadarRegexToolApp.__init__` 內緊鄰 `self.heartbeat_active = False` 處。

12. **`[TC-DEBT-02]` 繁體 Big5 vs GBK 雙解碼裁決與損壞位元組降級推演**
    * **測試情境**：模擬讀取三份外部文本：(a) 純繁體 Big5 舊版字典（位元組同時合法於 Big5 與 GBK 編碼區間）；(b) 簡體 GBK 日誌檔；(c) 含截斷無效位元組之損壞檔案。
    * **推演步驟**：
      1. 追蹤 `read_file_text_multiformat` 對 (a)(b) 均跳過 `utf-8-sig`/`utf-8`，進入雙嚴格解碼，各自計算 `_score_cjk_text(decoded_big5, True)` 與 `_score_cjk_text(decoded_gbk, False)`。
      2. 檢驗繁體詞彙與全形標點在 `is_big5=True` 下獲得高分，在錯誤的 `gbk` 解碼下出現大量日文假名/框線/非 `gb2312` 生僻字扣分，精準選出正確編碼。
      3. 追蹤 (c) 觸發 `utf-8 errors='ignore'` 降級並安全排程黃底提醒 Toast。
    * **預期結果**：繁體 Big5 字典不再被 `gbk` 搶先誤解為亂碼；簡體 GBK 亦能正常辨識；損壞檔案不會引發閃退並給出使用者警示。
    * **AST 語意錨點**：`RadarRegexToolApp._score_cjk_text` 與 `RadarRegexToolApp.read_file_text_multiformat` 內緊鄰 `decoded_gbk is not None and decoded_big5 is not None:` 處。

---

### 3. 驗收報告格式要求 (Mandatory Output Schema)

請 QA 嚴格依照下列結構回報驗收結果：

#### 3.1 測試環境與涵蓋範圍總覽
* 明確確認四項定錨：目標版本號 (`v1.3.3`)、目標語系 (`繁體中文 zh-TW`)、By-Design 豁免清單、Profile (`Profile-BackendScript`)。
* 標註執行方式（白箱靜態推演 + Python 語法/單元驗證或 Windows 實機執行）。

#### 3.2 四大維度逐項檢驗表格
* 逐項列出 `TC-NEW-01` ~ `TC-DEBT-02` 共 12 項，每列包含：`案例編號`、`驗證重點`、`代碼錨點摘要`、`靜態推演結果`、`終審標籤`（嚴格使用四態標籤 `[PASS]` ｜ `[PASS (By-Design)]` ｜ `[PASS (Retired)]` ｜ `[FAIL]`，或流程待定標記 `[🟡 未決待處置]`）。

#### 3.2.1 🕹️ 人類實機操作核對專區 (Manual Live Verification Area)

| 實機項目編號 | 驗證操作目標 | 實體代碼對應邏輯錨點 | 實機回填要求 | 當前專區狀態 |
| :--- | :--- | :--- | :--- | :--- |
| **MV-01** | 選定空路徑或不存在檔案之 `dict1`/`dict2` 點擊「1️⃣ 僅執行階段一」，驗證 0ms 釘選紅框橫幅且 UI 保持解鎖；隨後補回正確路徑並完成 Stage 2，於頁籤 2 修改路徑並儲存後點擊「💾 備份並更新至目標字典檔」成功覆寫 | `get_selected_dict_content` / `save_and_backup_dict` 內緊鄰 `latest_cfg = self.load_config()` 處 | 回填兩階段操作截圖或事件日誌與成功產生 `.bak` 檔名 | 待回填 |
| **MV-02** | 設定 `request_timeout_seconds`（如 `120.0`）並以 `gemini-4-hydrogen` / `gemini-3.8-flash` 執行實機請求，確認長思考不提前逾時且過短逾時（如設 `10.0` 配大型請求）能觸發退避心跳倒數；期間確認頂部帳號與模型下拉選單處於鎖定 (`DISABLED`) 狀態 | `build_tab2` `entry_request_timeout` / `raw_sdk_call` / `set_ui_locked` | 回填耗時紀錄與執期鎖定畫面截圖 | 待回填 |
| **MV-03** | 多目標字（如 4~5 個詞）執行優化時縮窄視窗至 `1000x750`，驗證底欄狀態列自動折行且 `(已耗時: Xs)` 永遠居於首行；刻意觸發 `503`/`429` 退避時確認橘色倒數不被藍字碼錶蓋字閃爍；完成後檢查頁籤 2 歷史看板東亞字寬欄位垂直對齊 | `build_tab1` `action_status_row` / `_sleep_with_heartbeat` / `_pad_display_width` | 回填狹窄視窗狀態列與頁籤 2 歷史看板截圖 | 待回填 |
| **MV-04** | 以純 Big5 編碼儲存之繁體測試字典執行讀取與微創更新，驗證介面載入無亂碼、寫回後為 `utf-8-sig` 且保留原始換行；於 1 秒內連點兩次存檔驗證 `bak/` 目錄產出兩個不互相覆蓋之 `.bak` 檔 | `read_file_text_multiformat` / `save_and_backup_dict` 內緊鄰 `os.urandom(2).hex()` 處 | 回填讀取截圖與 `bak/` 目錄兩筆備份檔名清單 | 待回填 |
| **MV-05** | 於背景執行退避或計時期間直接點擊視窗右上角 `✕` 關閉程式，並測試選取未配鑰帳號點擊「⚡ 測試連通性」驗證自動切換提示 | `_on_closing` / `test_api_connection` 內緊鄰 `switched_note` 處 | 回填視窗清潔關閉無 Python 例外回溯，及測試 Toast 文案確認 | 待回填 |

*專區狀態集合：`{待回填 ｜ 已回填-通過 ｜ 已回填-異常轉升格 3.3 缺陷並附 4 要素}`*

#### 3.3 🚨 發現之缺陷與異常清單 (Defects & Observations)
凡判定 `[FAIL]` 或回報異常者，必須附帶 4 要素：具體代碼位置（語意錨點，零行號）、最小復現邏輯推演、實際行為 vs 預期行為、置信度標記（🔴 / 🟡 / ⚪）。

#### 3.3.1 🧬 清單外白箱代碼缺陷 (Off-List Static Vulnerabilities)
承接 Phase 0 (0.1 至 0.5) 獨立排查結果回報於此專區。

#### 3.4 最終 PASS / FAIL 簽核結論與發布建議
* **6-A 技術手冊封存**：當 3.2 表格內 12 項靜態測試案例全數為四態閉環 PASS 標籤、無未決 `[🟡 未決待處置]` 且 Phase 0 無阻斷缺陷時，直接簽發【6-A 技術手冊封存核准】，解除 ENG 交付責任。
* **6-B 維運追蹤管理**：3.2.1 專區 `MV-01` ~ `MV-05` 獨立列管為【6-B 維運與動態追蹤待辦】，不得反向阻礙 6-A 封存。
* **雙門禁 Fallback 回退**：若存在 `[FAIL]` 或 `[🟡 未決待處置]` 項，嚴禁簽發 6-A，依實際未決態出具「暫緩最終簽核」結論。

---

## 【叁、 執行輸入區 (Data Input)】

```Text
=== TARGET_VERSION: 1.3.3 ===
=== BASELINE_VERSION: 1.3.2 ===
=== TARGET_LANGUAGE: 繁體中文 (zh-TW) ===
=== PROFILE_TYPE: Profile-BackendScript ===
=== RETIREMENT_REQUESTED: YES ===
=== PRD_ACCEPTANCE_SUMMARY: AC-01 頭部版本與基礎啟動 / AC-02 執行前空缺字典硬阻斷 / AC-03 存檔重讀 6 鍵同步與快照保留 / AC-04 請求逾時 300s 與 2026-11 防反向升級模型階梯 / AC-05 選單連動鎖定與雜湊授權黑名單 / AC-06 底欄折行與心跳互鎖及 Big5 編碼裁決與關窗安全 ===
=== TARGET_CODE_START ===
請隨附上傳《審核雷達正則維護工具 v1.3.3.py》全文檔案供 QA 執行 100% 靜態白箱審查
=== TARGET_CODE_END ===
```

---

*【跨輪次任務切換掛鉤 (Task Switch Hook) 已常駐就緒】：當後續收到 QA 報告（或進入階段 4.5 仲裁／階段 6 技術交接檔簽核）時，將立即依對應協議執行審查與簽核。*
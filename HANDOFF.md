# HANDOFF — Anti-Low-End-SEO-Planner 開發交接文件

> 最後更新：2026-04-30
> 狀態：已推送至 origin/main

---

## 專案概述

基於 300+ 場 SEO 面試經驗，模擬低端但有效的 SEO 文章大綱規劃工具。專為低競爭領域設計。

**GitHub：** https://github.com/u8901006/Anti-Low-End-SEO-Planner

---

## 已完成功能

### 1. AI 服務移植（Gemini → GLM-5-Turbo）

- 原始專案使用 `@google/genai` + Gemini 3 Pro
- 已替換為 GLM-5-Turbo（OpenAI 相容 API），使用原生 `fetch` 呼叫
- 無需額外 npm 套件依賴

**API 設定（.env）：**
```
VITE_GLM_API_KEY=b69713b2d94d4d938cf4a8e58d4c21a7.lcgka5xVGvAR81iE
VITE_GLM_API_BASE=https://open.bigmodel.cn/api/coding/paas/v4
```
- Vite build 時透過 `define` 將 key 注入為 `process.env.API_KEY` / `process.env.API_BASE`

### 2. 搜尋意圖分析

- 基於 Frank Chiu《拆解搜尋意圖》框架（`D:\SEODark\search_intent_breakdown_frank_chiu.md`）
- 五種意圖分類：資訊型、商業調查型、交易型、導航型、在地型
- 行銷漏斗三階段：認知、考慮、決策
- 回傳：主要/次要意圖、使用者問題、漏斗階段、適合/不適合的內容形式、長尾關鍵字、CTA 建議、標題建議、SERP 功能預測

### 2.5 寫作模板選擇（2026-04-29 新增）

- 根據搜尋意圖分析結果，AI 自動推薦最適合的寫作模板
- 使用者也可手動選擇其他模板
- 新增 `TEMPLATE_SELECTION` 步驟，插入在 INTENT_RESULT 與 QUESTIONS_INPUT 之間
- 新增 `SEOAIService.recommendTemplate()` API 方法
- 五種模板：

| ID | 名稱 | 大綱結構 | 適用場景 |
|----|------|----------|----------|
| A | 資訊解答型 | OOO 就是 XXX → 解答細節 ×4 | 明確問題的深入解答 |
| B | 資訊解答型 2 | 什麼是 OOO → 為什麼需要 → 好處 → 怎麼做 | 完整說明主題來龍去脈 |
| C | 推薦列表型 | 介紹 → 挑選方法 → 推薦 1~N | 比較、排行榜、推薦 |
| D | 流程步驟型 | 什麼是 OOO → 好處 → 步驟 1~3 | 教學、操作指南 |
| E | 好處列點型 | 什麼是 OOO → 好處 1~N | 認知階段，聚焦好處 |

### 3. Google 相關問題分析

- 使用者可貼上 Google「People Also Ask」問題
- AI 自動擷取子主題並標記重要性（高/中/低）
- 歸類到 7W3H 框架
- 歸納共同主題洞察

### 4. 7W3H 寫作框架

大綱生成採用 7W3H（10 維度）結構：

| 維度 | 說明 | 必須 |
|------|------|------|
| Who | 誰/負責人 | 選填 |
| What | 什麼/內容 | **必須** |
| When | 何時/期限 | 選填 |
| Where | 哪裡/場所 | 選填 |
| Why | 為什麼/理由 | **必須** |
| Whom | 對象/受眾 | 選填 |
| Whose | 參與者/關聯方 | 選填 |
| How | 如何做/方式 | **必須** |
| How Many | 多少/數量 | 選填 |
| How Much | 多少錢/預算 | 選填 |

### 5. 一鍵啟動

- `啟動.bat`：自動安裝依賴、建置、開啟瀏覽器、啟動 preview server
- **重要：** 此檔案必須以 **UTF-8 with BOM + CRLF** 編碼儲存，否則 cmd.exe 無法正確解析中文內容

### 6. 草稿分析與寫作實驗室

- Rich text editor（contentEditable）
- 即時統計：字數、關鍵詞密度、閱讀時間
- AI 草稿分析：契合度評分、缺失章節、優化建議

### 7. 複製大綱到剪貼簿（2026-04-30 新增）

- 大綱頁面新增「複製大綱」按鈕（綠色）
- 將大綱結構格式化為 Markdown（H2/H3 + 描述 + FAQ）複製到剪貼簿
- 複製後按鈕短暫顯示「已複製 ✓」（2 秒後恢復）

### 8. AI 生成文章（2026-04-30 新增）

- 大綱頁面新增「AI 生成文章」按鈕（紫色）
- 呼叫 `SEOAIService.generateArticle()` API
- AI 根據大綱逐段撰寫完整文章，每段標註引用出處（「資料來源：XXX」）
- 文末附「參考資料」清單
- 生成後自動切換到 EDITOR 步驟，文章填入 contentEditable Editor
- Markdown 轉 HTML 填入（`markdownToHtml` 函式）

### 9. 事實查核（2026-04-30 新增）

- 寫作實驗室 toolbar 新增「事實查核」按鈕（紅色）
- 呼叫 `SEOAIService.factCheckArticle()` API
- AI 扮演獨立事實查核員，逐一驗證文章中的可驗證主張
- 每個主張標示：✅ 正確 / ❌ 錯誤 / ⚠️ 誤導或缺乏脈絡 / 🔍 無證據待查
- 禁止編造來源，找不到就明說
- 輸出整體可信度評估 + 三個最需要修正的段落建議
- 結果顯示在右側 sidebar，可滾動查看，附「複製報告」按鈕

---

## 完整流程（8 步）

```
SETUP → INTENT_ANALYZING → INTENT_RESULT → TEMPLATE_SELECTION → QUESTIONS_INPUT → ANALYZING → OUTLINE_READY → EDITOR
```

1. **SETUP** — 輸入關鍵詞、地區、競爭網址（選填）
2. **INTENT_ANALYZING** — AI 分析搜尋意圖
3. **INTENT_RESULT** — 顯示意圖分析結果（意圖類型、漏斗階段、長尾字、CTA）
4. **TEMPLATE_SELECTION** — 根據搜尋意圖 AI 推薦寫作模板，使用者可手動切換（五種模板：A 資訊解答型、B 資訊解答型 2、C 推薦列表型、D 流程步驟型、E 好處列點型）
5. **QUESTIONS_INPUT** — 貼上 Google 相關問題，擷取子主題並歸類到 7W3H
6. **ANALYZING** — 結合意圖 + 問題分析 + 競爭對手 + 選定模板，生成 7W3H 大綱
7. **OUTLINE_READY** — 顯示完整大綱（結構、圖片策略、FAQ）
8. **EDITOR** — 寫作實驗室，即時統計 + AI 草稿分析

---

## 檔案結構

```
Anti-Low-End-SEO-Planner/
├── .env                          # API 金鑰（已加入 .gitignore）
├── .gitignore
├── App.tsx                       # 主 UI 元件（8 步流程、所有渲染函式）
├── index.html                    # HTML 入口 + Tailwind CDN
├── index.tsx                     # React 進入點
├── package.json                  # 無 @google/genai，僅 react/react-dom
├── tsconfig.json
├── vite.config.ts                # env 注入 + Vite 設定
├── types.ts                      # 所有 TypeScript 介面 + AppStep enum + WritingTemplate 定義
├── services/
│   └── aiService.ts              # GLM-5-Turbo API（fetch、五個 AI 方法）
├── 啟動.bat                      # 一鍵啟動批次檔（UTF-8 BOM + CRLF）
└── dist/                         # 建置產物（vite preview 使用）
```

---

## AI 服務方法

`services/aiService.ts` 中的 `SEOAIService` 類別：

| 方法 | 用途 | 輸入 |
|------|------|------|
| `analyzeSearchIntent()` | 搜尋意圖分析 | keywords, country |
| `recommendTemplate()` | 根據意圖推薦寫作模板 | intent (SearchIntentAnalysis) |
| `analyzeGoogleQuestions()` | 問題子主題擷取 + 7W3H 歸類 | keywords, questions[] |
| `analyzeCompetitors()` | 生成 7W3H 大綱 | keywords, country, urls[], intent?, questionsAnalysis?, template? |
| `analyzeDraft()` | 草稿品質分析 | outline, draft, keywords |
| `generateArticle()` | AI 根據大綱生成完整文章 | outline, keywords, intent? |
| `factCheckArticle()` | 事實查核文章中的可驗證主張 | article, keywords |

---

## 本地執行

```bash
cd D:\SEODark\Anti-Low-End-SEO-Planner
npm run dev        # 開發模式 → http://localhost:3000
npm run build      # 建置
npm run preview    # 預覽正式版
```

或雙擊 `啟動.bat`。

---

## 已排除的問題

### 啟動.bat 視窗一閃即逝（已修正 2026-04-29）

- **症狀：** 雙擊 `啟動.bat` 後 cmd 視窗立刻關閉
- **根因：** Edit 工具將 .bat 存成 UTF-8 without BOM + LF 換行。Windows cmd.exe 用系統預設編碼（CP950）解析，導致中文位元組被誤讀、指令被截斷
- **修正：** 用 PowerShell 以 `UTF8Encoding($true)` + CRLF 重寫檔案
- **教訓：** 含中文的 .bat 檔必須 UTF-8 BOM + CRLF，不可用 Edit/Write 工具直接修改

### 大綱分析失敗（已修正 2026-04-29）

- **症狀：** 進入 ANALYZING 步驟後 alert 顯示「大綱分析失敗，請檢查網路」
- **根因：** GLM-5-Turbo 有推理模式（`reasoning_content`），會從 `max_tokens` 配額中消耗 tokens。原本 `max_tokens: 4096`，`analyzeCompetitors` 的複雜 prompt 讓推理階段耗盡配額，導致 `content` 為空字串 → `JSON.parse("")` 拋出 SyntaxError
- **修正：** `max_tokens` 從 4096 → 16384；新增 `chatCompletion` 中 content 為空時的防禦性錯誤訊息

### 10+ 競爭連結大綱分析失敗（已修正 2026-04-30）

- **症狀：** 3 個競爭連結正常，10+ 個連結觸發「大綱分析失敗」
- **根因：** 同上，GLM-5-Turbo `reasoning_content` 消耗 `max_tokens` 配額。10+ 連結讓 prompt 更長、推理更耗時，16384 不夠用
- **修正：** `chatCompletion` 新增 `maxTokens` 參數（預設 16384），`analyzeCompetitors` 和 `generateArticle` 傳入 32768

---

## 技術債與未來方向

- [ ] 圖片生成功能已移除（GLM-5-Turbo 不支援），未來可接其他圖片 API
- [ ] `.env` 中的 API Key 是在 build 時嵌入 client bundle，不適合公開部署
- [ ] 大綱的 7W3H 偵測靠關鍵字比對（`detectSection`），可改用 AI 回傳 section tag
- [ ] 無單元測試
- [ ] Tailwind 使用 CDN 版本（`cdn.tailwindcss.com`），正式部署應改為 build-time
- [ ] `document.execCommand` 已 deprecated，Editor 未來應替換為 TipTap 或 ProseMirror
- [ ] `.bat` 檔不可用 Edit/Write 工具修改（會破壞 UTF-8 BOM + CRLF 編碼），必須用 PowerShell 的 `[System.IO.File]::WriteAllText($path, $content, $utf8Bom)` 寫入
- [x] ~~選定的寫作模板（`selectedTemplate`）目前未傳入 `analyzeCompetitors`，大綱生成尚未依據模板調整結構~~ （已修正 2026-04-30）

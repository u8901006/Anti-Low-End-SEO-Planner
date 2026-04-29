
import { ArticleOutline, DraftAnalysis, SearchIntentAnalysis, GoogleQuestionsAnalysis, WritingTemplateId, TemplateRecommendation } from "../types";

const API_KEY = process.env.API_KEY as string;
const API_BASE = process.env.API_BASE as string;
const MODEL = "glm-5-turbo";

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

async function chatCompletion(messages: ChatMessage[]): Promise<string> {
  const res = await fetch(`${API_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature: 0.7,
      max_tokens: 16384,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API Error ${res.status}: ${err}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content ?? "";
  const finishReason = data.choices?.[0]?.finish_reason ?? "";
  if (!content && finishReason === "length") {
    throw new Error("AI 回應被截斷（推理耗盡 token 配額），請重試或簡化關鍵詞。");
  }
  return content;
}

function extractJSON(text: string): string {
  if (!text) return "";
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1) {
    return text.substring(firstBrace, lastBrace + 1);
  }
  return text.trim();
}

export class SEOAIService {
  static async analyzeSearchIntent(
    keywords: string,
    country: string
  ): Promise<SearchIntentAnalysis> {
    const systemPrompt = `你是一位專業的 SEO 搜尋意圖分析師。請以純 JSON 格式回應，不要包含 markdown code block 或任何多餘文字。

搜尋意圖分類框架（請嚴格使用以下分類）：
- 資訊型 (Informational)：使用者想理解、學習、查答案
- 商業調查型 (Commercial Investigation)：使用者想比較、評估、找推薦
- 交易型 (Transactional)：使用者想購買、預約、下載、註冊
- 導航型 (Navigational)：使用者想找特定網站或工具
- 在地型 (Local)：使用者想找附近服務或店家

行銷漏斗階段：
- 認知階段 (Awareness)：使用者剛意識到問題
- 考慮階段 (Consideration)：使用者正在評估方案
- 決策階段 (Decision)：使用者準備採取行動`;

    const userPrompt = `請分析以下 SEO 關鍵字的搜尋意圖：

關鍵字：${keywords}
目標地區：${country}

請用以下 JSON 格式輸出：
{
  "primaryIntent": "主要搜尋意圖（從上述五種分型中選擇，格式如「資訊型」）",
  "secondaryIntent": "次要搜尋意圖（同上格式，若無可填「無」）",
  "userProblem": "使用者真正想解決的問題（一句話）",
  "funnelStage": "行銷漏斗階段（從上述三種中選擇）",
  "suggestedContentFormats": ["適合的內容形式1", "適合的內容形式2"],
  "unsuitableFormats": ["不適合的內容形式1", "不適合的內容形式2"],
  "longTailKeywords": ["長尾關鍵字1", "長尾關鍵字2", "長尾關鍵字3", "長尾關鍵字4", "長尾關鍵字5"],
  "ctaSuggestion": "建議的 CTA 行動呼籲",
  "titleSuggestions": ["建議標題1", "建議標題2", "建議標題3", "建議標題4", "建議標題5"],
  "serpFeaturePredictions": ["預測 SERP 可能出現的搜尋功能，如精選摘要、地圖、影片等"]
}

語言：繁體中文。`;

    const raw = await chatCompletion([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ]);

    return JSON.parse(extractJSON(raw));
  }

  static async recommendTemplate(
    intent: SearchIntentAnalysis
  ): Promise<TemplateRecommendation> {
    const systemPrompt = `你是一位 SEO 內容策略專家。請根據搜尋意圖分析結果，推薦最適合的寫作模板。

可用模板（五選一）：

A — 資訊解答型
大綱：OOO 就是 XXX → 解答細節 1 → 解答細節 2 → 解答細節 3 → 解答細節 4
適合：使用者問一個明確問題，需要直接、深入的解答。例如「什麼是 PTSD」

B — 資訊解答型 2
大綱：什麼是 OOO → 為什麼需要 OOO → OOO 的好處是什麼 → 怎麼做到 OOO
適合：需要完整說明一個主題的來龍去脈。例如「EMDR 治療」

C — 推薦列表型
大綱：OOO 介紹 → OOO 挑選方法 → 推薦 1 → 推薦 2 → 推薦 3 → 推薦 N
適合：商業調查型意圖，使用者想比較、找推薦。例如「台北身心科推薦」

D — 流程步驟型
大綱：什麼是 OOO → OOO 對我們有什麼好處 → 快速進入 OOO 的三個步驟 → 步驟 1 → 步驟 2 → 步驟 3
適合：教學、操作指南、步驟說明。例如「冥想入門教學」

E — 好處列點型
大綱：什麼是 OOO → OOO 的好處是什麼 → 好處 1 → 好處 2 → 好處 3
適合：吸引認知階段讀者，聚焦好處。例如「瑜伽的 5 個好處」

請以純 JSON 格式回應，不要包含 markdown code block。`;

    const userPrompt = `[搜尋意圖分析結果]
主要意圖：${intent.primaryIntent}
次要意圖：${intent.secondaryIntent}
使用者問題：${intent.userProblem}
漏斗階段：${intent.funnelStage}
適合的內容形式：${intent.suggestedContentFormats.join("、")}

請推薦最適合的寫作模板。輸出 JSON：
{
  "recommended": "A / B / C / D / E",
  "reason": "簡短說明為什麼推薦這個模板（50 字以內）"
}

語言：繁體中文。`;

    const raw = await chatCompletion([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ]);

    return JSON.parse(extractJSON(raw));
  }

  static async analyzeGoogleQuestions(
    keywords: string,
    questions: string[]
  ): Promise<GoogleQuestionsAnalysis> {
    const systemPrompt = `你是一位 SEO 內容分析師。請以純 JSON 格式回應，不要包含 markdown code block 或任何多餘文字。

你的任務是從 Google「相關問題」（People Also Ask）中提取子主題，並將它們歸類到 7W3H 寫作框架中：

7W：
1. "who" — 誰/負責人：誰來做？誰是主體？誰是關鍵人物？
2. "what" — 什麼/內容：做什麼事？目的/目標為何？是什麼？定義？
3. "when" — 何時/期限：什麼時候開始/結束？具體日期時間？時機？
4. "where" — 哪裡/場所：在哪裡做？目的地是哪？地點？
5. "why" — 為什麼/理由：為什麼要做？原因和背景為何？重要性？
6. "whom" — 對象/受眾：服務對象是誰？這文章要寫給誰看？目標族群？
7. "whose" — 參與者/關聯方：與哪些人有關？誰能提供協助？利害關係人？

3H：
8. "how" — 如何做/方式：如何實施？方法、步驟、流程為何？
9. "howmany" — 多少/數量：需要多少資源/人手？數量？次數？
10. "howmuch" — 多少錢/預算：成本、費用預算為多少？價格？

規則：
- 不是每個問題都需要歸類到所有 10 個維度。只列出有對應問題的維度。
- 如果某個維度沒有相關問題，可以省略該段落。
- 但 "what"、"why"、"how" 三個維度是必須的，即使沒有直接對應的問題也要根據關鍵詞推測生成。`;

    const userPrompt = `核心關鍵詞：${keywords}

以下是從 Google 搜尋結果頁面收集到的「相關問題」：
${questions.map((q, i) => `${i + 1}. ${q}`).join("\n")}

請分析這些問題，提取子主題並歸類。輸出 JSON：
{
  "subTopics": [
    {
      "topic": "子主題名稱",
      "relatedQuestions": ["與此主題相關的原始問題"],
      "importance": "high / medium / low"
    }
  ],
  "suggestedSections": [
    {
      "section": "who / what / when / where / why / whom / whose / how / howmany / howmuch",
      "topic": "此段落應涵蓋的主題",
      "questions": ["此段落應回答的問題"]
    }
  ],
  "commonThemes": ["從所有問題中歸納出的共同主題或關鍵洞察"]
}

規則：
- suggestedSections 只列出有對應問題的維度，但 what、why、how 必須包含
- section 值只能是：who, what, when, where, why, whom, whose, how, howmany, howmuch
- 每個段落的 questions 從原始問題中挑選或改寫
- subTopics 按 importance 高到低排列
- commonThemes 提供 3-5 個洞察

語言：繁體中文。`;

    const raw = await chatCompletion([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ]);

    return JSON.parse(extractJSON(raw));
  }

  static async analyzeCompetitors(
    keywords: string,
    country: string,
    urls: string[],
    intent?: SearchIntentAnalysis,
    questionsAnalysis?: GoogleQuestionsAnalysis
  ): Promise<ArticleOutline> {
    const systemPrompt = `你是一位頂尖的 SEO 內容策略專家。請以純 JSON 格式回應，不要包含 markdown code block 或任何多餘文字。

重要：大綱結構必須包含以下 7W3H 寫作框架的核心段落（以 H2 層級呈現）。根據關鍵詞的性質，選擇適用的維度，但 "what"、"why"、"how" 三個是不可省略的：

7W（根據關鍵詞適用性選擇）：
- Who（誰/負責人）：誰來做？誰是主體？
- What（什麼/內容）：做什麼事？目的/目標為何？【必須包含】
- When（何時/期限）：什麼時候開始/結束？
- Where（哪裡/場所）：在哪裡做？目的地是哪？
- Why（為什麼/理由）：為什麼要做？原因和背景為何？【必須包含】
- Whom（對象/受眾）：服務對象是誰？寫給誰看？
- Whose（參與者/關聯方）：與哪些人有關？誰能提供協助？

3H：
- How（如何做/方式）：如何實施？方法、步驟、流程？【必須包含】
- How Many（多少/數量）：需要多少資源/人手？
- How Much（多少錢/預算）：成本、費用預算為多少？

這些段落應該是大綱的骨幹。每個核心段落底下可以有 H3 子標題來細分內容。不適用的維度可以省略。`;

    const intentContext = intent
      ? `
[搜尋意圖分析結果]
- 主要意圖：${intent.primaryIntent}
- 次要意圖：${intent.secondaryIntent}
- 使用者問題：${intent.userProblem}
- 漏斗階段：${intent.funnelStage}
- 適合的內容形式：${intent.suggestedContentFormats.join("、")}
- 不適合的形式：${intent.unsuitableFormats.join("、")}
- 建議 CTA：${intent.ctaSuggestion}
請確保生成的大綱符合上述搜尋意圖分析結果。`
      : "";

    const questionsContext = questionsAnalysis
      ? `
[Google 相關問題 7W3H 分析結果]
- 子主題：${questionsAnalysis.subTopics.map(s => `${s.topic}(${s.importance})`).join("、")}
- 共同主題：${questionsAnalysis.commonThemes.join("、")}
- 各維度建議問題：
${questionsAnalysis.suggestedSections.map(s => `  ${s.section}: ${s.questions.join("、")}`).join("\n")}

請將上述問題的分析結果融入大綱的 7W3H 結構中，確保每個段落都回答了對應的問題。`
      : "";

    const urlSection =
      urls.length > 0
        ? `[競爭對手網址]: ${urls.join("\n")}`
        : `[注意] 使用者未提供競爭對手網址，請根據關鍵字和搜尋意圖直接生成最佳大綱。`;

    const userPrompt = `深入分析並構建一份能超越競爭對手的 SEO 內容藍圖。

[核心關鍵詞]: ${keywords}
[目標地區]: ${country}
${urlSection}
${intentContext}
${questionsContext}

請輸出 JSON，結構如下：
{
  "suggestedTitles": ["標題1", "標題2", "標題3"],
  "structure": [
    {
      "level": "H2",
      "title": "章節標題（必須包含「是什麼」「為什麼」「如何做」三個核心段落）",
      "description": "內容描述",
      "guidelines": "撰寫指南"
    }
  ],
  "imageStrategy": {
    "totalImages": 5,
    "placements": [
      {
        "afterSection": "章節標題",
        "description": "圖片描述",
        "aiPrompt": "AI 繪圖指令"
      }
    ]
  },
  "targetWordCount": "2000-3000字",
  "faqs": [
    {
      "question": "常見問題",
      "answer": "回答",
      "rationale": "為何這個 FAQ 重要"
    }
  ]
}

語言：繁體中文。`;

    const raw = await chatCompletion([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ]);

    return JSON.parse(extractJSON(raw));
  }

  static async analyzeDraft(
    outline: ArticleOutline,
    draft: string,
    keywords: string
  ): Promise<DraftAnalysis> {
    const systemPrompt = `你是一位 SEO 審核專家。請以純 JSON 格式回應，不要包含 markdown code block。`;

    const userPrompt = `根據預定的 SEO 藍圖，分析使用者撰寫的草稿。

[SEO 藍圖]: ${JSON.stringify(outline)}
[草稿內容]: ${draft}
[核心關鍵詞]: ${keywords}

請輸出 JSON，結構如下：
{
  "score": 75,
  "missingSections": ["缺少的章節或核心觀點"],
  "keywordGaps": ["關鍵詞分佈建議"],
  "suggestions": ["具體優化建議"],
  "readabilityFeedback": "閱讀流暢度回饋"
}

語言：繁體中文。`;

    const raw = await chatCompletion([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ]);

    return JSON.parse(extractJSON(raw));
  }
}


import { ArticleOutline, DraftAnalysis, SearchIntentAnalysis, GoogleQuestionsAnalysis, WritingTemplateId, TemplateRecommendation, SEOMetadata, ArticleGenerationCallback, ArticleGenerationCheckpoint, ChapterCompleteCallback, FAQGeneratorResult, SerpTemplateAnalysis } from "../types";

const API_KEY = process.env.API_KEY as string;
const API_BASE = process.env.API_BASE as string;
const MODEL = "glm-5-turbo";

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

async function chatCompletion(messages: ChatMessage[], maxTokens: number = 16384): Promise<string> {
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
      max_tokens: maxTokens,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API Error ${res.status}: ${err}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content ?? "";
  const reasoning = data.choices?.[0]?.message?.reasoning_content ?? "";
  const finishReason = data.choices?.[0]?.finish_reason ?? "";
  console.log(`[AI] finish_reason=${finishReason}, content.length=${content.length}, reasoning.length=${reasoning.length}`);
  if (!content) {
    if (finishReason === "length") {
      throw new Error("AI 回應被截斷（推理耗盡 token 配額），請重試或簡化關鍵詞。");
    }
    throw new Error(`AI 回應為空（finish_reason=${finishReason}）。`);
  }
  if (finishReason === "length") {
    console.warn(`[AI] 回應因 token 上限被截斷（content.length=${content.length}），正在自動接續...`);
    let accumulated = content;
    let continued = true;
    let retryCount = 0;
    const maxRetries = 5;
    while (continued && retryCount < maxRetries) {
      retryCount++;
      const continueMessages: ChatMessage[] = [
        ...messages,
        { role: "assistant", content: accumulated },
        { role: "user", content: "請從你中斷的地方繼續輸出，不要重複已輸出的內容。" },
      ];
      const contRes = await fetch(`${API_BASE}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({
          model: MODEL,
          messages: continueMessages,
          temperature: 0.7,
          max_tokens: maxTokens,
        }),
      });
      if (!contRes.ok) break;
      const contData = await contRes.json();
      const contContent = contData.choices?.[0]?.message?.content ?? "";
      const contFinish = contData.choices?.[0]?.finish_reason ?? "";
      if (contContent) {
        accumulated += "\n" + contContent;
      }
      console.log(`[AI] 接續第 ${retryCount} 次：contFinish=${contFinish}, contLength=${contContent.length}`);
      continued = contFinish === "length" && contContent.length > 0;
    }
    return accumulated;
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
  console.warn("[AI] extractJSON: no braces found, returning raw text length=", text.length);
  return text.trim();
}

interface ChapterGroup {
  title: string;
  nodes: import("../types").OutlineNode[];
}

function groupOutlineByH2(outline: ArticleOutline): ChapterGroup[] {
  const groups: ChapterGroup[] = [];
  let current: ChapterGroup | null = null;

  for (const node of outline.structure) {
    if (node.level === "H2") {
      current = { title: node.title, nodes: [node] };
      groups.push(current);
    } else if (current) {
      current.nodes.push(node);
    }
  }

  if (outline.faqs.length > 0) {
    groups.push({
      title: "FAQ",
      nodes: outline.faqs.map(f => ({
        level: "H3" as const,
        title: f.question,
        description: f.answer,
        guidelines: f.rationale,
      })),
    });
  }

  return groups;
}

function pairGroups(groups: ChapterGroup[]): ChapterGroup[][] {
  const pairs: ChapterGroup[][] = [];
  for (let i = 0; i < groups.length; i += 2) {
    const pair = [groups[i]];
    if (i + 1 < groups.length) {
      pair.push(groups[i + 1]);
    }
    pairs.push(pair);
  }
  return pairs;
}

const WRITING_RULES = `
寫作規則（必遵守）：
1. 段落短、語氣自然專業，像真人官網文章
2. 小標題多用問句或明確名詞，不加括號旁白
3. 關鍵硬資訊（數字、統計、研究結論、法規期限）句尾用腳註號 [1][2][3]
4. 每個章節最後列出腳註對應來源（發布者＋年份或日期）
5. 查不到的硬資訊不得寫死，改用保守表述：「根據 XX 年公開資料」、「實際數字可能因 XX 而異，建議查閱 XX 確認」
6. 不得捏造數字、規範、期限、費率區間、統計
7. 若涉及金融/健康/法律/重大安全決策，於適當位置加入簡短限制聲明（如：「以上資訊僅供參考，不構成醫療/法律/財務建議，請諮詢專業人士」）

必備元素（本章節適用時加入）：
- 若涉及比較或分類，加入 Markdown 表格
- 若涉及準備事項，加入勾選清單（- [ ] 項目）
- 若涉及流程或操作，用 STEP 1、STEP 2 格式
- 若適合，加入一個簡短情境案例

用詞與標題規則（必遵守）：
- 章節標題、表格標題只用名詞或問句，不加括號旁白
- 括號只用於英文術語或必要補充
- 禁用句式：你可以、可直接、先想、至少符合其中幾點、照表做
- 中性寫法替代：下表整理、常見可分為、通常較適合、以下列出步驟與準備項目`;

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

  static async analyzeSerpTemplate(
    keywords: string,
    country: string,
    intent: SearchIntentAnalysis
  ): Promise<SerpTemplateAnalysis> {
    const systemPrompt = `你是一位 SEO 搜尋意圖分析專家，精通 Frank Chiu 的 SERP 歸納法。請根據關鍵字和搜尋意圖，判斷 Google SERP 前三名最可能的格式類型。

Frank 6 大搜尋意圖模板：

1. 問題資訊型
   - SERP 特徵：文章、百科、知識頁面佔多數
   - 使用者有明確問題，需要資訊解答
   - 範例關鍵字：「什麼是 PTSD」「EMDR 治療」「減脂怎麼吃」

2. 策展排名型
   - SERP 特徵：排名推薦文、評比文、「N大推薦」格式
   - 使用者想比較、找推薦、看排行榜
   - 內文結構必須包含 #1~#N 編號
   - 範例關鍵字：「口紅推薦」「台北牛肉麵」「床墊推薦」

3. 產品分類型
   - SERP 特徵：電商分類頁、產品列表頁、篩選頁
   - 使用者想看某一類產品的分類
   - 範例關鍵字：「牛皮沙發」「行動電源」「手機殼」

4. 單一產品型
   - SERP 特徵：產品詳情頁、規格價格頁
   - 使用者已鎖定特定產品
   - 範例關鍵字：「filco majestouch 3」「iPhone 16 Pro」

5. 首頁權威型
   - SERP 特徵：品牌官網首頁排名
   - 靠整體網站權威度獲得排名，最難 SEO 優化
   - 範例關鍵字：「健身房」「銀行」

6. 特殊功能型
   - SERP 特徵：工具頁面、計算機、表格、轉換器
   - 使用者需要一個特定功能或格式
   - 範例關鍵字：「鞋子尺寸」「貸款試算」「圖片壓縮」

好球帶概念：
- 內容要精準落在搜尋意圖範圍內（不多不少）
- 太少：沒有覆蓋完整搜尋意圖
- 太多：超出好球帶，反而稀釋匹配度
- 搜尋意圖不怕重複，只怕沒有匹配到

寫作模板對應：
- A（資訊解答型）、B（資訊解答型2）、D（流程步驟型）、E（好處列點型）→ 對應「問題資訊型」
- C（推薦列表型）→ 對應「策展排名型」
- 產品分類型/單一產品型/首頁權威型/特殊功能型 → 不需要 A-E 文章模板（但仍可選擇撰寫輔助文章）

請以純 JSON 格式回應，不要包含 markdown code block。`;

    const userPrompt = `請分析以下關鍵字的 SERP 模板類型：

關鍵字：${keywords}
目標地區：${country}
[搜尋意圖分析結果]
主要意圖：${intent.primaryIntent}
次要意圖：${intent.secondaryIntent}
使用者問題：${intent.userProblem}
漏斗階段：${intent.funnelStage}
適合的內容形式：${intent.suggestedContentFormats.join("、")}

請輸出 JSON：
{
  "serpTemplate": "問題資訊型 / 策展排名型 / 產品分類型 / 單一產品型 / 首頁權威型 / 特殊功能型",
  "confidence": 8,
  "serpFeatures": ["預期 SERP 前三名可能的頁面類型或格式，2-3個"],
  "strikeZone": {
    "must": ["內容必須涵蓋的核心要素1", "要素2", "要素3"],
    "nice": ["加分項目1", "加分項目2"],
    "avoid": ["應避免的內容1", "應避免的內容2"]
  },
  "matchAdvice": "匹配度建議（一句話，說明如何達到完全匹配）",
  "contentStrategy": "內容策略建議（2-3句話）",
  "requiresArticle": true,
  "suggestedWritingTemplates": ["A"]
}

說明：
- confidence：1-10，你對此判斷的信心度
- requiresArticle：是否需要進入 A-E 寫作模板流程（問題資訊型/策展排名型=true，其他=false）
- suggestedWritingTemplates：如果 requiresArticle=true，列出適合的 A-E 模板 ID 陣列

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
    questionsAnalysis?: GoogleQuestionsAnalysis,
    template?: WritingTemplateId
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

    const templateContext = template
      ? `\n[選定寫作模板]: ${template} — 請依據此模板的結構邏輯調整大綱章節排列。`
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
${templateContext}

請輸出 JSON，結構如下：
{
  "suggestedTitles": ["標題1", "標題2", "標題3"],
  "structure": [
    {
      "level": "H2",
      "title": "章節標題（必須包含「是什麼」「為什麼」「如何做」三個核心段落）",
      "description": "內容描述",
      "guidelines": "撰寫指南",
      "section": "what / why / how / who / when / where / whom / whose / howmany / howmuch（依據 7W3H 歸類，必須填寫）"
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
    ], 32768);

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

  static async generateArticle(
    outline: ArticleOutline,
    keywords: string,
    intent?: SearchIntentAnalysis,
    onProgress?: ArticleGenerationCallback,
    checkpoint?: ArticleGenerationCheckpoint,
    onChapterComplete?: ChapterCompleteCallback
  ): Promise<{ article: string; seoMetadata: SEOMetadata }> {
    const groups = groupOutlineByH2(outline);
    const pairs = pairGroups(groups);
    const totalPairs = pairs.length;

    const intentContext = intent
      ? `\n[搜尋意圖]: ${intent.primaryIntent} + ${intent.secondaryIntent}\n[目標讀者問題]: ${intent.userProblem}\n[建議 CTA]: ${intent.ctaSuggestion}`
      : "";

    const overallOutline = outline.structure
      .map(n => `${n.level}: ${n.title}`)
      .join("\n");

    const startIdx = checkpoint?.startPairIndex ?? 0;
    const chapters: string[] = [...(checkpoint?.completedChapters ?? [])];

    for (let i = startIdx; i < totalPairs; i++) {
      const pair = pairs[i];
      if (onProgress) {
        onProgress({
          phase: "writing",
          currentChapter: i + 1,
          totalChapters: totalPairs,
          statusMessage: `正在撰寫第 ${i + 1}/${totalPairs} 章：${pair.map(g => g.title).join(" + ")}`,
        });
      }

      const sectionDetails = pair
        .map(g =>
          g.nodes
            .map(n => `${n.level}: ${n.title}\n  描述：${n.description}\n  撰寫指引：${n.guidelines}`)
            .join("\n\n")
        )
        .join("\n\n---\n\n");

      const isFaqPair = pair.some(g => g.title === "FAQ");

      const systemPrompt = `你是一位專業的 SEO 內容撰稿人。請根據提供的大綱片段撰寫文章段落。

${WRITING_RULES}

${isFaqPair ? "本段為 FAQ 區塊，請用 Q&A 格式撰寫每個問題與回答，每個回答 80–150 字。" : ""}
使用 Markdown 格式輸出。語言：繁體中文。`;

      const userPrompt = `請根據以下大綱片段撰寫文章段落。

[核心關鍵詞]: ${keywords}
[整體文章架構（供參考）]:
${overallOutline}
${intentContext}

[本次要撰寫的章節]:
${sectionDetails}

請直接輸出 Markdown 格式的章節內容。每個章節用 ## 標題開始。`;

      const chapter = await chatCompletion([
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ], 16384);

      chapters.push(chapter);
      if (onChapterComplete) {
        onChapterComplete(i, chapter);
      }
    }

    const rawArticle = chapters.join("\n\n");

    if (onProgress) {
      onProgress({
        phase: "polishing",
        currentChapter: totalPairs,
        totalChapters: totalPairs,
        statusMessage: "總編審稿中，去除 AI 味與重複內容...",
      });
    }

    const polishedArticle = await SEOAIService.polishArticle(
      rawArticle,
      keywords,
      outline.targetWordCount,
      intent
    );

    if (onProgress) {
      onProgress({
        phase: "seo",
        currentChapter: totalPairs,
        totalChapters: totalPairs,
        statusMessage: "生成 SEO 交付物（標題、Meta、Schema）...",
      });
    }

    const seoMetadata = await SEOAIService.generateSEOMetadata(
      polishedArticle,
      keywords,
      outline.faqs
    );

    if (onProgress) {
      onProgress({
        phase: "done",
        currentChapter: totalPairs,
        totalChapters: totalPairs,
        statusMessage: "文章生成完成！",
      });
    }

    return { article: polishedArticle, seoMetadata };
  }

  static async polishArticle(
    article: string,
    keywords: string,
    targetWordCount: string,
    intent?: SearchIntentAnalysis
  ): Promise<string> {
    const systemPrompt = `你是「總編輯＋SEO 編輯＋風險審稿」。請審閱以下文章，進行最終審稿並輸出改善後的完整文章。

品質與安全規則：
- 刪除灌水、重複、過度 AI 口吻，讓節奏像真人官網文章
- 不得出現保證、誇大、暗示必然結果的話術
- 所有硬資訊要嘛有來源腳註，要嘛改成保守可驗證說法並提示確認方式
- 若涉及金融/健康/法律主題，加入限制聲明、風險揭露、不適用情境

用詞與標題規則（必遵守）：
- 章節標題與表格標題只用名詞或問句，不加括號旁白
- 禁用句式：你可以、可直接、先想、至少符合其中幾點、照表做
- 中性寫法：下表整理、常見可分為、通常較適合、以下列出流程與準備項目

必備元素檢查（缺少則補上）：
- 至少 2 張表格
- 至少 1 組勾選清單（- [ ] 格式）
- 至少 1 段 STEP 1–4 流程
- 至少 1 個情境案例
- 至少 8 題 FAQ

目標字數：${targetWordCount}，允許 ±10%。

直接輸出審稿後的完整 Markdown 文章。語言：繁體中文。`;

    const intentContext = intent
      ? `\n[搜尋意圖]: ${intent.primaryIntent}\n[讀者問題]: ${intent.userProblem}\n[建議 CTA]: ${intent.ctaSuggestion}`
      : "";

    const userPrompt = `請審稿以下關於「${keywords}」的文章，輸出改善後的完整版本。
${intentContext}

---

${article}

---

請輸出審稿後的完整 Markdown 文章，不要加任何額外說明。`;

    return await chatCompletion([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ], 32768);
  }

  static async generateSEOMetadata(
    article: string,
    keywords: string,
    faqs: Array<{ question: string; answer: string }>
  ): Promise<SEOMetadata> {
    const systemPrompt = `你是 SEO 專家。請為以下文章生成 SEO 交付物。以純 JSON 格式回應，不要包含 markdown code block。

輸出 JSON 格式：
{
  "titles": ["標題1（自然口吻，不硬塞關鍵字）", "標題2", "標題3"],
  "metaDescriptions": ["描述1（150 字以內，自然口吻）", "描述2", "描述3"],
  "urlSlug": "建議的-url-slug",
  "faqItems": [
    {"question": "問題1", "answer": "簡短回答1"},
    {"question": "問題2", "answer": "簡短回答2"}
  ],
  "checklist": ["上線前自檢項目1", "項目2", ..., "項目10"]
}

重要：
- faqItems 是一個物件陣列，每個物件有 question 和 answer 兩個字串欄位
- 不要把 faqItems 寫成字串，直接寫成 JSON 陣列
- checklist 範例方向：格式是否齊全、是否誇大、硬資訊是否可查核、表格/清單/STEP/案例/FAQ 是否完整、meta 標籤是否設定、圖片 alt 是否填寫等。`;

    const faqList = faqs
      .slice(0, 8)
      .map((f, i) => `${i + 1}. Q: ${f.question}\n   A: ${f.answer}`)
      .join("\n");

    const userPrompt = `以下文章的關鍵詞為「${keywords}」。

文章內容：
${article.substring(0, 4000)}

FAQ：
${faqList}

請生成 SEO 交付物 JSON。`;

    const raw = await chatCompletion([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ]);

    const parsed = JSON.parse(extractJSON(raw));
    const faqItems: Array<{ question: string; answer: string }> = Array.isArray(parsed.faqItems)
      ? parsed.faqItems
      : [];
    return {
      titles: parsed.titles ?? [],
      metaDescriptions: parsed.metaDescriptions ?? [],
      urlSlug: parsed.urlSlug ?? "",
      faqSchemaItems: faqItems,
      checklist: parsed.checklist ?? [],
    };
  }

  static async factCheckArticle(
    article: string,
    keywords: string
  ): Promise<string> {
    const systemPrompt = `請扮演獨立的事實查核員。閱讀提供的文章，找出最可能有誤或需要補充脈絡的「可驗證主張」（數字、日期、地點、人名職稱、引述、因果、研究結論）。

對每個主張：
1) 用可追溯的權威來源查證（優先 2025 年後的英文/國際來源：政府、國際組織、期刊、官方統計、主要媒體）
2) 給出結論：✅ 正確 / ❌ 錯誤 / ⚠️ 誤導或缺乏脈絡 / 🔍 無證據待查
3) 附上你實際用到的來源連結與引用重點

嚴格規則：
- 不得編造來源；找不到就明說「找不到權威來源」並建議該補什麼資訊才能查到
- 如果文章中的主張是你知識庫中無法驗證的，明確標示「🔍 無證據待查」
- 每個主張獨立評估，不要因為一個錯誤就全盤否定

最後給出：
- 整體可信度評估（高/中/低，附理由）
- 三個最需要修正的段落建議

輸出格式：Markdown，用標題和列表清楚結構化。語言：繁體中文。`;

    const userPrompt = `以下是關於「${keywords}」的文章，請進行事實查核：

---

${article}

---

請逐一查核上述文章中的可驗證主張。`;

    return await chatCompletion([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ], 32768);
  }

  static async auditUXWriting(
    article: string,
    keywords: string
  ): Promise<string> {
    const systemPrompt = `你是一位嚴格的「UX 寫作教練」與「SEO 內容審核員」。你的工作不是幫我寫作，而是像「閱卷老師」一樣，指出文章中影響閱讀體驗的問題。

任務：分析提供的文章，針對「可讀性 (Readability)」與「流暢度 (Flow)」進行診斷。請勿直接改寫整篇文章，請以「條列式報告」或「表格」的方式指出具體問題位置。

檢核標準（4 點掃描）：
1. 【過長句子 (Long Sentences)】：找出超過 40 個字、且中間缺乏標點或邏輯斷點的「長難句」。
2. 【文字牆 (Wall of Text)】：找出電腦版顯示可能超過 4 行，或結構過於密集的段落。
3. 【被動與冗詞 (Passive & Fluff)】：找出濫用「被動語態」或「無意義冗詞」（如：進行了、實際上）的句子。
4. 【邏輯斷裂 (Choppy Flow)】：指出段落之間缺乏「連接詞」或「轉折語」，導致閱讀卡頓的地方。

輸出格式（嚴格遵守 Markdown）：

## 1. 總體評分 (1-10分，並簡述原因)

## 2. 詳細問題清單

| 問題類型 | 原文片段 (引用出處) | 問題說明 (為什麼這裡不好讀？) | 優化建議 (僅提供修改方向，不需整段重寫) |
| :--- | :--- | :--- | :--- |
| (範例) 過長句子 | "由於但是在...的情況下..." | 子句套疊太多，主詞不明 | 建議拆成兩句 |

語言：繁體中文。`;

    const userPrompt = `以下是關於「${keywords}」的文章，請進行 UX 寫作品質審計：

---

${article}

---

請依照檢核標準輸出報告。`;

    return await chatCompletion([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ], 32768);
  }

  static async auditContentAuthority(
    article: string,
    keywords: string
  ): Promise<string> {
    const systemPrompt = `你是世界級的「內容權威性審計師 (Chief Content Authority Auditor)」。你的標準是學術期刊的嚴謹度加上頂級商業雜誌（如 HBR, Economist）的洞察力。你對「平庸」零容忍。你的核心任務是對提供的文章進行「3X 法則」的極限壓力測試。

3X Framework（絕對評核標準）：

1. **深度 (Depth - 資訊增益率)**
   - Signal-to-Noise Ratio：是否去除了所有廢話？
   - Insight：是否挖掘了底層邏輯 (First Principles)？是否提供了專家級洞察，而非大眾常識？
   - Mechanism：是否解釋了「為什麼 (Why)」和「怎麼運作 (How)」，而不僅是「是什麼 (What)」？

2. **廣度 (Breadth - MECE 結構化)**
   - MECE：是否符合「相互獨立、完全窮盡」原則？
   - Scenarios：是否覆蓋了邊緣案例 (Edge Cases)、失敗場景或不同受眾的適用性？
   - Counter-arguments：是否主動挑戰了自己的論點（預判反對意見）？

3. **信任度 (Trust - 可責性與證據)**
   - Evidence：所有主張是否有數據、研究或具體案例支持？
   - Precision：是否去除了模糊詞彙（如「很多」、「通常」），改用精確描述？
   - Objectivity：是否區分了事實陳述與主觀建議？

執行指令：
1. 分維度輸出，不要將三個維度混在一起。
2. 診斷量極大化：盡可能找出所有不符合 3X 的段落。
3. 建議具體化：禁止說「建議增加深度」，必須說「此處建議引入 XYZ 理論來解釋現象」。
4. 引用原文：所有的批評都必須基於原文的具體句子。

輸出格式（Markdown，5 部分）：

## 第一部分：3X 綜合記分板
| 維度 | 評分 | 一句話狠評 |
| :--- | :---: | :--- |
| **深度 (Depth)** | X/10 | ... |
| **廣度 (Breadth)** | X/10 | ... |
| **信任度 (Trust)** | X/10 | ... |

## 第二部分：深度極限深究
（淺層內容警示 + 邏輯斷裂點）

## 第三部分：廣度邊界掃描
（遺漏視角 + 必要反駁）

## 第四部分：信任度壓力測試
（模糊詞彙抓取 + 證據缺失標記）

## 第五部分：最高優先行動指令 (Top 3 Priorities)
1. **[針對深度]** ...
2. **[針對廣度]** ...
3. **[針對信任]** ...

語言：繁體中文。`;

    const userPrompt = `以下是關於「${keywords}」的文章，請進行 3X 內容權威性審計：

---

${article}

---

請嚴格依照 5 部分格式輸出報告。`;

    return await chatCompletion([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ], 32768);
  }
}

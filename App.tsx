import React, { useState, useRef, useEffect } from 'react';
import { AppStep, ArticleOutline, DraftAnalysis, SearchIntentAnalysis, GoogleQuestionsAnalysis } from './types';
import { SEOAIService } from './services/aiService';

const INTENT_COLORS: Record<string, string> = {
  '資訊型': 'bg-blue-500',
  '商業調查型': 'bg-purple-500',
  '交易型': 'bg-green-500',
  '導航型': 'bg-orange-500',
  '在地型': 'bg-red-500',
};

const FUNNEL_COLORS: Record<string, string> = {
  '認知階段': 'bg-sky-100 text-sky-700',
  '考慮階段': 'bg-violet-100 text-violet-700',
  '決策階段': 'bg-emerald-100 text-emerald-700',
};

const getIntentColor = (intent: string): string => {
  for (const [key, val] of Object.entries(INTENT_COLORS)) {
    if (intent.includes(key)) return val;
  }
  return 'bg-slate-500';
};

const getFunnelColor = (stage: string): string => {
  for (const [key, val] of Object.entries(FUNNEL_COLORS)) {
    if (stage.includes(key)) return val;
  }
  return 'bg-slate-100 text-slate-700';
};

const IMPORTANCE_STYLES: Record<string, string> = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-slate-100 text-slate-600',
};

const SECTION_LABELS: Record<string, { label: string; icon: string; color: string; keywords: string[] }> = {
  who:     { label: 'Who — 誰/負責人',          icon: 'fa-user',         color: 'bg-rose-500',    keywords: ['誰','負責','主體','誰來','誰是'] },
  what:    { label: 'What — 是什麼/內容',        icon: 'fa-book',         color: 'bg-blue-500',    keywords: ['是什麼','名詞解釋','定義','什麼是','什麼事','目的','目標'] },
  when:    { label: 'When — 何時/期限',          icon: 'fa-clock',        color: 'bg-cyan-500',    keywords: ['何時','什麼時候','期限','日期','時間','時機','開始','結束'] },
  where:   { label: 'Where — 哪裡/場所',         icon: 'fa-map-marker-alt',color: 'bg-teal-500',   keywords: ['哪裡','在哪','地點','場所','目的地','地區'] },
  why:     { label: 'Why — 為什麼/理由',          icon: 'fa-star',         color: 'bg-purple-500',  keywords: ['為什麼','理由','原因','重要性','為何','好處','影響'] },
  whom:    { label: 'Whom — 對象/受眾',           icon: 'fa-users',        color: 'bg-pink-500',    keywords: ['對象','受眾','給誰','目標族群','寫給','服務對象'] },
  whose:   { label: 'Whose — 參與者/關聯方',      icon: 'fa-handshake',    color: 'bg-indigo-500',  keywords: ['參與','關聯','協助','利害關係','哪些人'] },
  how:     { label: 'How — 如何做/方式',          icon: 'fa-list-ol',      color: 'bg-green-500',   keywords: ['如何','方法','步驟','流程','怎麼做','實施','方式'] },
  howmany: { label: 'How Many — 多少/數量',      icon: 'fa-sort-numeric-up',color: 'bg-amber-500', keywords: ['多少','數量','幾個','幾次','資源','人手'] },
  howmuch: { label: 'How Much — 多少錢/預算',    icon: 'fa-dollar-sign',  color: 'bg-yellow-500',  keywords: ['多少錢','費用','預算','成本','價格','收費'] },
};

const detectSection = (title: string): string | null => {
  for (const [key, meta] of Object.entries(SECTION_LABELS)) {
    for (const kw of meta.keywords) {
      if (title.includes(kw)) return key;
    }
  }
  return null;
};

const App: React.FC = () => {
  const [step, setStep] = useState<AppStep>(AppStep.SETUP);
  const [keywords, setKeywords] = useState('');
  const [country, setCountry] = useState('台灣');
  const [competitors, setCompetitors] = useState('');
  const [intent, setIntent] = useState<SearchIntentAnalysis | null>(null);
  const [googleQuestionsText, setGoogleQuestionsText] = useState('');
  const [questionsAnalysis, setQuestionsAnalysis] = useState<GoogleQuestionsAnalysis | null>(null);
  const [isAnalyzingQuestions, setIsAnalyzingQuestions] = useState(false);
  const [outline, setOutline] = useState<ArticleOutline | null>(null);
  const [analysis, setAnalysis] = useState<DraftAnalysis | null>(null);
  const [statusText, setStatusText] = useState('');
  const [progress, setProgress] = useState(0);
  const [isAnalyzingDraft, setIsAnalyzingDraft] = useState(false);

  const [liveStats, setLiveStats] = useState({
    words: 0, keywords: 0, density: 0,
    h1: 0, h2: 0, h3: 0, imgs: 0, readingTime: 0,
  });

  const editorRef = useRef<HTMLDivElement>(null);

  const updateStats = () => {
    if (!editorRef.current) return;
    const html = editorRef.current.innerHTML;
    const text = editorRef.current.innerText || '';
    const words = text.trim().length;
    const kwRegex = new RegExp(keywords, 'gi');
    const kwCount = keywords ? (text.match(kwRegex) || []).length : 0;
    const density = words > 0 ? (kwCount / words) * 100 : 0;
    const h1 = (html.match(/<h1/gi) || []).length;
    const h2 = (html.match(/<h2/gi) || []).length;
    const h3 = (html.match(/<h3/gi) || []).length;
    const imgs = (html.match(/<img/gi) || []).length;
    const readingTime = Math.ceil(words / 400);
    setLiveStats({ words, keywords: kwCount, density, h1, h2, h3, imgs, readingTime });
  };

  useEffect(() => {
    let interval: number | undefined;
    if (step === AppStep.INTENT_ANALYZING || step === AppStep.ANALYZING) {
      setProgress(0);
      const isIntent = step === AppStep.INTENT_ANALYZING;
      const messages = isIntent
        ? ["分析關鍵字搜尋意圖...", "判斷使用者需求類型...", "拆解行銷漏斗階段...", "生成意圖分析報告..."]
        : ["結合搜尋意圖 + 問題分析...", "套用 7W3H 寫作框架...", "分析競爭對手結構...", "生成完整大綱..."];
      let msgIdx = 0;
      setStatusText(messages[0]);
      interval = window.setInterval(() => {
        setProgress(prev => {
          const next = prev + (Math.random() * 2);
          if (next > 25 && msgIdx === 0) { msgIdx = 1; setStatusText(messages[1]); }
          if (next > 55 && msgIdx === 1) { msgIdx = 2; setStatusText(messages[2]); }
          if (next > 85 && msgIdx === 2) { msgIdx = 3; setStatusText(messages[3]); }
          return next > 98 ? 98 : next;
        });
      }, 500);
    } else {
      setProgress(100);
      if (interval) clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [step]);

  const startIntentAnalysis = async () => {
    if (!keywords) return;
    setStep(AppStep.INTENT_ANALYZING);
    try {
      const res = await SEOAIService.analyzeSearchIntent(keywords, country);
      setIntent(res);
      setStep(AppStep.INTENT_RESULT);
    } catch (e) {
      console.error(e);
      alert("搜尋意圖分析失敗，請檢查網路或 API 設定。");
      setStep(AppStep.SETUP);
    }
  };

  const handleAnalyzeQuestions = async () => {
    const questions = googleQuestionsText.split('\n').filter(q => q.trim() !== '');
    if (questions.length === 0) return;
    setIsAnalyzingQuestions(true);
    try {
      const res = await SEOAIService.analyzeGoogleQuestions(keywords, questions);
      setQuestionsAnalysis(res);
    } catch (e) {
      alert("問題分析失敗，請重試。");
    } finally {
      setIsAnalyzingQuestions(false);
    }
  };

  const startOutlineAnalysis = async () => {
    setStep(AppStep.ANALYZING);
    try {
      const urls = competitors.split('\n').filter(u => u.trim() !== '').slice(0, 10);
      const res = await SEOAIService.analyzeCompetitors(keywords, country, urls, intent ?? undefined, questionsAnalysis ?? undefined);
      setOutline(res);
      setStep(AppStep.OUTLINE_READY);
    } catch (e) {
      console.error(e);
      alert("大綱分析失敗，請檢查網路。");
      setStep(AppStep.QUESTIONS_INPUT);
    }
  };

  const runDraftAnalysis = async () => {
    if (!editorRef.current || !outline) return;
    setIsAnalyzingDraft(true);
    try {
      const draft = editorRef.current.innerText;
      const res = await SEOAIService.analyzeDraft(outline, draft, keywords);
      setAnalysis(res);
    } catch (e) {
      alert("分析草稿失敗。");
    } finally {
      setIsAnalyzingDraft(false);
    }
  };

  const execCommand = (cmd: string, value: string = '') => {
    document.execCommand(cmd, false, value);
    updateStats();
  };

  const copyArticleToClipboard = async () => {
    if (editorRef.current) {
      try {
        await navigator.clipboard.writeText(editorRef.current.innerText);
      } catch { alert("複製失敗"); }
    }
  };

  const renderSetup = () => (
    <div className="max-w-5xl mx-auto py-16 px-6 space-y-12">
      <div className="bg-white rounded-[3rem] shadow-2xl p-12 border border-slate-100 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-5"><i className="fas fa-tools text-9xl"></i></div>
        <div className="text-center mb-12">
          <span className="bg-amber-100 text-amber-700 px-4 py-1.5 rounded-full text-xs font-black uppercase mb-4 inline-block tracking-widest">Experimental Basic Simulator</span>
          <h1 className="text-5xl font-black text-slate-900 mb-6 tracking-tighter">SEO 基礎規劃模擬：<span className="text-amber-600 underline decoration-amber-200">搜尋意圖 + 7W3H</span></h1>
          <p className="text-slate-500 text-lg max-w-4xl mx-auto leading-relaxed">
            先拆解搜尋意圖，再貼上 Google 相關問題擷取子主題，最後生成 7W3H 結構大綱。
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-12 items-start">
          <div className="space-y-8 bg-slate-50 p-10 rounded-[2.5rem] border border-slate-100">
            <h2 className="text-xl font-black text-slate-800 flex items-center gap-2">
              <i className="fas fa-terminal text-amber-600"></i> 配置市場參數
            </h2>
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-400 uppercase">核心關鍵詞</label>
                  <input type="text" className="w-full bg-white px-5 py-4 rounded-2xl border-2 border-transparent focus:border-amber-500 outline-none shadow-sm" value={keywords} onChange={e=>setKeywords(e.target.value)} placeholder="如：台北搬家"/>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-400 uppercase">目標地區</label>
                  <input type="text" className="w-full bg-white px-5 py-4 rounded-2xl border-2 border-transparent focus:border-amber-500 outline-none shadow-sm" value={country} onChange={e=>setCountry(e.target.value)} placeholder="台灣"/>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 uppercase">競爭網址（選填，可稍後補充）</label>
                <textarea rows={2} className="w-full bg-white px-5 py-4 rounded-2xl border-2 border-transparent focus:border-amber-500 outline-none text-sm shadow-sm" value={competitors} onChange={e=>setCompetitors(e.target.value)} placeholder="請輸入對手網址，每行一個..."/>
              </div>
              <button onClick={startIntentAnalysis} disabled={!keywords} className="w-full py-5 bg-slate-900 text-white rounded-2xl font-black text-lg shadow-2xl hover:bg-amber-600 transition-all disabled:bg-slate-200 flex items-center justify-center gap-3">
                <i className="fas fa-search"></i> 分析搜尋意圖
              </button>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-slate-800 text-white p-10 rounded-[2.5rem] shadow-xl relative overflow-hidden">
              <div className="absolute -right-10 -bottom-10 opacity-10"><i className="fas fa-route text-[150px]"></i></div>
              <h3 className="text-lg font-black mb-4 flex items-center gap-2"><i className="fas fa-stream text-amber-300"></i> 完整流程</h3>
              <div className="space-y-3 text-sm text-slate-300 font-medium">
                <div className="flex gap-3 items-center"><span className="w-6 h-6 rounded-full bg-amber-500 text-white text-xs font-black flex items-center justify-center shrink-0">1</span> 分析搜尋意圖</div>
                <div className="flex gap-3 items-center"><span className="w-6 h-6 rounded-full bg-amber-500 text-white text-xs font-black flex items-center justify-center shrink-0">2</span> 貼上 Google 相關問題，擷取子主題</div>
                <div className="flex gap-3 items-center"><span className="w-6 h-6 rounded-full bg-amber-500 text-white text-xs font-black flex items-center justify-center shrink-0">3</span> 生成 7W3H 大綱</div>
                <div className="flex gap-3 items-center"><span className="w-6 h-6 rounded-full bg-amber-500 text-white text-xs font-black flex items-center justify-center shrink-0">4</span> 進入寫作實驗室</div>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-100 p-8 rounded-[2rem] space-y-3">
              <h4 className="text-amber-800 font-black text-sm flex items-center gap-2"><i className="fas fa-exclamation-triangle"></i> 注意事項</h4>
              <p className="text-amber-700 text-xs leading-relaxed">
                SEO 是動態的。本工具是基於經驗的模擬，不保證排名。<strong>嚴禁用於任何商業收費服務。</strong>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderLoading = () => (
    <div className="max-w-2xl mx-auto py-32 px-6">
      <div className="bg-white rounded-[3rem] shadow-2xl p-16 border border-slate-100 text-center space-y-8">
        <div className="relative w-32 h-32 mx-auto">
          <svg className="w-full h-full transform -rotate-90" viewBox="0 0 128 128">
            <circle cx="64" cy="64" r="60" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-slate-100" />
            <circle cx="64" cy="64" r="60" stroke="currentColor" strokeWidth="8" fill="transparent" strokeDasharray={377} strokeDashoffset={377 - (377 * progress) / 100} className="text-amber-600 transition-all duration-500" strokeLinecap="round" />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-2xl font-black text-slate-900">{Math.round(progress)}%</span>
          </div>
        </div>
        <div>
          <h2 className="text-2xl font-black text-slate-900 mb-2">
            {step === AppStep.INTENT_ANALYZING ? '正在分析搜尋意圖...' : '正在生成三段式大綱...'}
          </h2>
          <p className="text-slate-400 font-medium animate-pulse">{statusText}</p>
        </div>
      </div>
    </div>
  );

  const renderIntentResult = () => (
    <div className="max-w-6xl mx-auto py-12 px-6 space-y-10">
      <div className="bg-white rounded-[3rem] shadow-2xl overflow-hidden border border-slate-100">
        <div className="bg-slate-900 p-10 text-white flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="space-y-1">
            <h2 className="text-3xl font-black tracking-tight">搜尋意圖分析：{keywords}</h2>
            <p className="text-amber-400 font-bold text-sm">基於 Frank Chiu 搜尋意圖拆解框架</p>
          </div>
          <button onClick={() => setStep(AppStep.SETUP)} className="bg-slate-800 text-slate-400 px-6 py-4 rounded-2xl font-black">重新配置</button>
        </div>

        <div className="p-12 grid lg:grid-cols-3 gap-10">
          <div className="lg:col-span-2 space-y-8">
            <div className="flex items-center gap-4 border-b pb-6">
              <span className={`px-4 py-2 rounded-xl text-white text-sm font-black ${getIntentColor(intent?.primaryIntent ?? '')}`}>{intent?.primaryIntent}</span>
              <span className="text-slate-400 font-bold">+</span>
              <span className={`px-4 py-2 rounded-xl text-white text-sm font-black ${getIntentColor(intent?.secondaryIntent ?? '')}`}>{intent?.secondaryIntent}</span>
            </div>

            <div className="bg-slate-50 p-8 rounded-[2.5rem] border border-slate-100 space-y-4">
              <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><i className="fas fa-question-circle"></i> 使用者真正想解決的問題</h3>
              <p className="text-lg font-bold text-slate-800 leading-relaxed">{intent?.userProblem}</p>
              <div className="flex items-center gap-3 mt-4">
                <span className="text-xs font-black text-slate-400 uppercase">漏斗階段</span>
                <span className={`px-3 py-1 rounded-lg text-xs font-black ${getFunnelColor(intent?.funnelStage ?? '')}`}>{intent?.funnelStage}</span>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div className="bg-green-50 p-6 rounded-[2rem] border border-green-100 space-y-4">
                <h4 className="text-green-800 font-black text-sm flex items-center gap-2"><i className="fas fa-check-circle"></i> 適合的內容形式</h4>
                <ul className="space-y-2">
                  {intent?.suggestedContentFormats.map((f, i) => (
                    <li key={i} className="flex gap-2 text-sm text-green-700"><i className="fas fa-arrow-right text-green-400 mt-1 text-xs"></i> {f}</li>
                  ))}
                </ul>
              </div>
              <div className="bg-red-50 p-6 rounded-[2rem] border border-red-100 space-y-4">
                <h4 className="text-red-800 font-black text-sm flex items-center gap-2"><i className="fas fa-times-circle"></i> 不適合的內容形式</h4>
                <ul className="space-y-2">
                  {intent?.unsuitableFormats.map((f, i) => (
                    <li key={i} className="flex gap-2 text-sm text-red-600"><i className="fas fa-ban text-red-300 mt-1 text-xs"></i> {f}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          <div className="space-y-8">
            <div className="bg-slate-800 p-8 rounded-[2.5rem] shadow-xl text-white space-y-6">
              <h4 className="font-black border-b border-white/20 pb-4 flex items-center gap-2"><i className="fas fa-search text-amber-400"></i> 長尾關鍵字機會</h4>
              <div className="space-y-3">
                {intent?.longTailKeywords.map((kw, i) => (
                  <div key={i} className="bg-white/10 p-4 rounded-2xl border border-white/10">
                    <p className="text-sm font-bold text-white">{kw}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-amber-50 p-8 rounded-[2.5rem] border border-amber-100 space-y-4">
              <h4 className="font-black text-amber-800 flex items-center gap-2"><i className="fas fa-bullhorn text-amber-500"></i> CTA 建議</h4>
              <p className="text-amber-700 font-bold text-sm leading-relaxed">{intent?.ctaSuggestion}</p>
            </div>

            <button onClick={() => setStep(AppStep.QUESTIONS_INPUT)} className="w-full py-5 bg-amber-600 text-white rounded-2xl font-black text-lg shadow-2xl hover:bg-amber-500 transition-all flex items-center justify-center gap-3">
              <i className="fas fa-arrow-right"></i> 下一步：貼上 Google 相關問題
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  const renderQuestionsInput = () => (
    <div className="max-w-6xl mx-auto py-12 px-6 space-y-10">
      <div className="bg-white rounded-[3rem] shadow-2xl overflow-hidden border border-slate-100">
        <div className="bg-slate-900 p-10 text-white flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="space-y-1">
            <h2 className="text-3xl font-black tracking-tight">Google 相關問題分析</h2>
            <p className="text-amber-400 font-bold text-sm">貼上 Google「People Also Ask」問題，擷取子主題並歸類到 7W3H 結構</p>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setStep(AppStep.INTENT_RESULT)} className="bg-slate-800 text-slate-400 px-6 py-4 rounded-2xl font-black">回到意圖分析</button>
          </div>
        </div>

        <div className="p-12">
          <div className="grid lg:grid-cols-2 gap-10">
            <div className="space-y-6">
              <div className="bg-blue-50 p-6 rounded-[2rem] border border-blue-100 space-y-3">
                <h4 className="text-blue-800 font-black text-sm flex items-center gap-2"><i className="fas fa-info-circle"></i> 如何取得 Google 相關問題？</h4>
                <ol className="text-xs text-blue-700 space-y-2 list-decimal pl-4 leading-relaxed">
                  <li>在 Google 搜尋你的關鍵詞「{keywords}」</li>
                  <li>找到「人們還會問」(People Also Ask) 區塊</li>
                  <li>展開問題，複製問題文字</li>
                  <li>每行貼上一個問題到下方欄位</li>
                </ol>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 uppercase">貼上 Google 相關問題（每行一個）</label>
                <textarea
                  rows={12}
                  className="w-full bg-slate-50 px-5 py-4 rounded-2xl border-2 border-transparent focus:border-amber-500 outline-none text-sm shadow-sm leading-relaxed"
                  value={googleQuestionsText}
                  onChange={e => setGoogleQuestionsText(e.target.value)}
                  placeholder={`例如：\n${keywords}是什麼？\n為什麼需要${keywords}？\n${keywords}要多少錢？\n${keywords}有哪些方法？\n如何選擇${keywords}？`}
                />
              </div>

              <div className="flex gap-4">
                <button
                  onClick={handleAnalyzeQuestions}
                  disabled={!googleQuestionsText.trim() || isAnalyzingQuestions}
                  className="flex-1 py-4 bg-slate-900 text-white rounded-2xl font-black shadow-xl hover:bg-amber-600 transition-all disabled:bg-slate-200 flex items-center justify-center gap-2"
                >
                  <i className={`fas ${isAnalyzingQuestions ? 'fa-spinner fa-spin' : 'fa-brain'}`}></i>
                  {isAnalyzingQuestions ? '分析中...' : '擷取子主題'}
                </button>
                <button
                  onClick={startOutlineAnalysis}
                  className="flex-1 py-4 bg-amber-600 text-white rounded-2xl font-black shadow-xl hover:bg-amber-500 transition-all flex items-center justify-center gap-2"
                >
                  <i className="fas fa-magic"></i> 直接生成大綱
                </button>
              </div>
            </div>

            {questionsAnalysis ? (
              <div className="space-y-6">
                <div className="space-y-4">
                  <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 border-b pb-3"><i className="fas fa-th-list"></i> 子主題擷取結果</h3>
                  {questionsAnalysis.subTopics.map((st, i) => (
                    <div key={i} className="bg-slate-50 p-5 rounded-2xl border border-slate-100 space-y-2">
                      <div className="flex items-center justify-between">
                        <h4 className="font-black text-slate-800 text-sm">{st.topic}</h4>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-black ${IMPORTANCE_STYLES[st.importance]}`}>{st.importance === 'high' ? '高' : st.importance === 'medium' ? '中' : '低'}</span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {st.relatedQuestions.map((q, qi) => (
                          <span key={qi} className="bg-white px-2 py-1 rounded-lg text-[10px] text-slate-500 border border-slate-200">{q}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="space-y-4">
                  <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 border-b pb-3"><i className="fas fa-layer-group"></i> 7W3H 結構建議</h3>
                  {questionsAnalysis.suggestedSections.map((sec, i) => {
                    const meta = SECTION_LABELS[sec.section];
                    return (
                      <div key={i} className="bg-white p-5 rounded-2xl border-2 border-slate-100 space-y-3">
                        <div className="flex items-center gap-3">
                          <span className={`w-8 h-8 rounded-lg ${meta.color} text-white flex items-center justify-center`}><i className={`fas ${meta.icon} text-xs`}></i></span>
                          <div>
                            <p className="font-black text-slate-800 text-sm">{meta.label}</p>
                            <p className="text-xs text-slate-500">{sec.topic}</p>
                          </div>
                        </div>
                        <ul className="space-y-1 pl-11">
                          {sec.questions.map((q, qi) => (
                            <li key={qi} className="text-xs text-slate-600 flex gap-2"><i className="fas fa-chevron-right text-slate-300 mt-0.5 text-[8px]"></i> {q}</li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>

                {questionsAnalysis.commonThemes.length > 0 && (
                  <div className="bg-amber-50 p-5 rounded-2xl border border-amber-100 space-y-3">
                    <h4 className="font-black text-amber-800 text-xs flex items-center gap-2"><i className="fas fa-lightbulb"></i> 共同主題洞察</h4>
                    <ul className="space-y-1">
                      {questionsAnalysis.commonThemes.map((t, i) => (
                        <li key={i} className="text-xs text-amber-700 flex gap-2"><i className="fas fa-check text-amber-400 text-[8px] mt-1"></i> {t}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <button onClick={startOutlineAnalysis} className="w-full py-5 bg-amber-600 text-white rounded-2xl font-black text-lg shadow-2xl hover:bg-amber-500 transition-all flex items-center justify-center gap-3">
                  <i className="fas fa-magic"></i> 結合以上分析，生成 7W3H 大綱
                </button>
              </div>
            ) : (
              <div className="bg-slate-50 rounded-[2.5rem] p-10 border border-slate-100 flex flex-col items-center justify-center text-center space-y-4 min-h-[400px]">
                <i className="fas fa-clipboard-list text-6xl text-slate-200"></i>
                <p className="text-slate-400 font-bold text-sm">貼上問題後點擊「擷取子主題」<br/>或直接「生成大綱」跳過此步</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  const renderOutline = () => (
    <div className="max-w-6xl mx-auto py-12 px-6 space-y-10">
      {intent && (
        <div className="bg-white rounded-[2.5rem] shadow-xl p-8 border border-slate-100">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs font-black text-slate-400 uppercase">搜尋意圖</span>
            <span className={`px-3 py-1 rounded-lg text-white text-xs font-black ${getIntentColor(intent.primaryIntent)}`}>{intent.primaryIntent}</span>
            <span className={`px-3 py-1 rounded-lg text-white text-xs font-black ${getIntentColor(intent.secondaryIntent)}`}>{intent.secondaryIntent}</span>
            <span className="text-slate-300">|</span>
            <span className="text-xs font-bold text-slate-600">{intent.funnelStage}</span>
            <span className="text-slate-300">|</span>
            <span className="text-xs text-slate-500">{intent.userProblem}</span>
          </div>
        </div>
      )}

      <div className="bg-white rounded-[3rem] shadow-2xl overflow-hidden border border-slate-100">
        <div className="bg-slate-900 p-10 text-white flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="space-y-1">
            <h2 className="text-3xl font-black tracking-tight">三段式大綱：{keywords}</h2>
            <p className="text-amber-400 font-bold text-sm">7W3H 框架 + 搜尋意圖 + 競爭分析</p>
          </div>
          <div className="flex gap-4">
            <button onClick={() => setStep(AppStep.QUESTIONS_INPUT)} className="bg-slate-800 text-slate-400 px-6 py-4 rounded-2xl font-black">回到問題分析</button>
            <button onClick={() => setStep(AppStep.EDITOR)} className="bg-amber-500 text-white px-10 py-4 rounded-2xl font-black hover:bg-amber-400 shadow-xl transition-all">進入寫作實驗室</button>
          </div>
        </div>

        <div className="p-12 grid lg:grid-cols-3 gap-12">
          <div className="lg:col-span-2 space-y-8">
            <div className="flex items-center justify-between border-b pb-6">
              <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><i className="fas fa-sitemap"></i> 文章結構建議</h3>
              <span className="bg-slate-100 text-slate-600 px-3 py-1 rounded-lg text-xs font-black">建議字數：{outline?.targetWordCount}</span>
            </div>
            {outline?.structure.map((node, i) => {
              const sectionKey = detectSection(node.title);
              const sectionMeta = sectionKey ? SECTION_LABELS[sectionKey] : null;

              return (
                <div key={i} className={`p-8 rounded-[2.5rem] border-2 transition-all hover:border-amber-100 ${node.level === 'H2' ? 'bg-white border-slate-100 shadow-sm' : 'ml-12 bg-slate-50 border-transparent'}`}>
                  <div className="flex items-center gap-3 mb-4">
                    {sectionMeta && (
                      <span className={`w-7 h-7 rounded-lg ${sectionMeta.color} text-white flex items-center justify-center shrink-0`}>
                        <i className={`fas ${sectionMeta.icon} text-xs`}></i>
                      </span>
                    )}
                    <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black ${node.level === 'H2' ? 'bg-amber-600 text-white' : 'bg-slate-300 text-slate-600'}`}>{node.level}</span>
                    <h4 className="font-black text-slate-800 text-xl">{node.title}</h4>
                  </div>
                  <p className="text-sm text-slate-500 mb-6 leading-relaxed">{node.description}</p>
                  <div className="bg-amber-50/50 p-6 rounded-2xl border border-amber-100 text-xs text-amber-900 italic relative">
                    <i className="fas fa-quote-left absolute top-4 left-4 opacity-10 text-4xl"></i>
                    <div className="pl-6">「{node.guidelines}」</div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="space-y-8">
            <div className="bg-slate-800 p-8 rounded-[2.5rem] shadow-xl text-white space-y-6">
              <h4 className="font-black border-b border-white/20 pb-4 flex items-center gap-2"><i className="fas fa-camera text-amber-400"></i> 視覺佈局提示</h4>
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-slate-400 uppercase">建議張數</p>
                <span className="bg-amber-500 text-white px-3 py-1 rounded-full text-xs font-black">{outline?.imageStrategy.totalImages} 張</span>
              </div>
              <div className="space-y-4">
                {outline?.imageStrategy.placements.map((img, i) => (
                  <div key={i} className="bg-white/5 p-5 rounded-2xl border border-white/10 space-y-3">
                    <p className="text-[10px] font-black text-amber-400 uppercase tracking-widest">位置：{img.afterSection} 之後</p>
                    <p className="text-xs text-slate-300 leading-relaxed font-medium">📷 {img.description}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-slate-50 p-8 rounded-[2.5rem] space-y-6 border border-slate-100">
              <h4 className="font-black text-slate-800 flex items-center gap-2 border-b pb-4"><i className="fas fa-lightbulb text-amber-500"></i> 基礎 FAQ 補充</h4>
              <div className="space-y-4">
                {outline?.faqs.map((f, i) => (
                  <div key={i} className="p-5 bg-white rounded-2xl border border-slate-100 shadow-sm space-y-2">
                    <p className="font-black text-slate-800 text-xs">Q: {f.question}</p>
                    <p className="text-[11px] text-slate-500 leading-relaxed">{f.answer}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderEditor = () => (
    <div className="max-w-7xl mx-auto py-12 px-6">
      <style>{`
        .editor-container { min-height: 800px; padding: 4rem; outline: none; }
        .editor-container[contenteditable]:empty::before { content: attr(data-placeholder); color: #94a3b8; pointer-events: none; }
        .toolbar-btn { width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border-radius: 6px; transition: all 0.15s; color: #475569; }
        .toolbar-btn:hover { background: #f1f5f9; color: #0f172a; }
        .toolbar-group { display: flex; align-items: center; gap: 4px; padding: 0 12px; border-right: 1px solid #e2e8f0; }
        .toolbar-group:last-child { border-right: none; }
      `}</style>
      <div className="grid lg:grid-cols-4 gap-8">
        <div className="lg:col-span-3 space-y-6">
          <div className="bg-white rounded-[3rem] shadow-2xl border border-slate-100 overflow-hidden flex flex-col">
            <div className="bg-white/90 backdrop-blur-md border-b p-4 flex flex-wrap items-center gap-2 sticky top-0 z-50">
              <div className="toolbar-group">
                <select onChange={(e) => execCommand('formatBlock', e.target.value)} className="bg-slate-50 text-xs font-bold px-2 py-1 rounded outline-none border">
                  <option value="P">內文 (P)</option>
                  <option value="H1">主標題 (H1)</option>
                  <option value="H2">副標題 (H2)</option>
                  <option value="H3">小標題 (H3)</option>
                </select>
              </div>
              <div className="toolbar-group">
                <button onClick={() => execCommand('bold')} className="toolbar-btn"><i className="fas fa-bold"></i></button>
                <button onClick={() => execCommand('italic')} className="toolbar-btn"><i className="fas fa-italic"></i></button>
              </div>
              <div className="toolbar-group">
                <button onClick={() => execCommand('insertUnorderedList')} className="toolbar-btn"><i className="fas fa-list-ul"></i></button>
              </div>
              <div className="flex-1"></div>
              <div className="flex gap-2">
                <button onClick={runDraftAnalysis} disabled={isAnalyzingDraft} className="px-6 py-2 bg-amber-600 text-white rounded-xl text-xs font-black shadow-lg hover:bg-amber-700 disabled:opacity-50">
                  <i className={`fas ${isAnalyzingDraft ? 'fa-spinner fa-spin' : 'fa-check-double'} mr-2`}></i>
                  {isAnalyzingDraft ? '分析中...' : '提交基礎分析'}
                </button>
                <button onClick={copyArticleToClipboard} className="px-6 py-2 bg-slate-900 text-white rounded-xl text-xs font-black shadow-lg">複製</button>
              </div>
            </div>
            <div ref={editorRef} contentEditable onInput={updateStats} className="editor-container prose prose-slate max-w-none" data-placeholder="在此根據三段式大綱開始撰寫..."/>
          </div>
        </div>

        <div className="space-y-6 self-start sticky top-6">
          {intent && (
            <div className="bg-slate-800 p-6 rounded-[2.5rem] shadow-2xl text-white space-y-4">
              <h4 className="font-black text-xs border-b border-white/20 pb-3 flex items-center gap-2"><i className="fas fa-crosshairs text-amber-400"></i> 搜尋意圖提醒</h4>
              <div className="flex flex-wrap gap-2">
                <span className={`px-2 py-0.5 rounded text-[10px] font-black text-white ${getIntentColor(intent.primaryIntent)}`}>{intent.primaryIntent}</span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-black text-white ${getIntentColor(intent.secondaryIntent)}`}>{intent.secondaryIntent}</span>
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed">{intent.ctaSuggestion}</p>
            </div>
          )}

          <div className="bg-white p-5 rounded-[2rem] shadow-xl border border-slate-100 space-y-3">
            <h4 className="font-black text-slate-800 text-xs border-b pb-2 flex items-center gap-2"><i className="fas fa-layer-group text-amber-500"></i> 7W3H 寫作框架</h4>
            <div className="space-y-2">
              {Object.entries(SECTION_LABELS).map(([key, meta]) => (
                <div key={key} className="flex items-center gap-2">
                  <span className={`w-5 h-5 rounded ${meta.color} text-white flex items-center justify-center shrink-0`}><i className={`fas ${meta.icon} text-[8px]`}></i></span>
                  <span className="text-[10px] text-slate-600 font-medium">{meta.label}</span>
                </div>
              ))}
            </div>
          </div>

          {analysis && (
            <div className="bg-white p-8 rounded-[2.5rem] shadow-2xl border border-slate-100 space-y-6">
              <div className="text-center">
                <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest">基礎契合得分</p>
                <h4 className="text-6xl font-black text-slate-900 my-2">{analysis.score}</h4>
              </div>
              <div className="space-y-5">
                <div>
                  <h5 className="text-[11px] font-black text-slate-600 uppercase mb-2 border-b pb-1">缺少的基本元素</h5>
                  <ul className="text-xs space-y-2">
                    {analysis.missingSections.map((s, i) => <li key={i} className="flex gap-2 leading-relaxed"><i className="fas fa-times-circle text-amber-500 mt-1"></i> {s}</li>)}
                  </ul>
                </div>
                <div>
                  <h5 className="text-[11px] font-black text-slate-600 uppercase mb-2 border-b pb-1">優化建議</h5>
                  <ul className="text-xs space-y-3">
                    {analysis.suggestions.slice(0, 3).map((s, i) => <li key={i} className="bg-amber-50 p-3 rounded-xl leading-relaxed">{s}</li>)}
                  </ul>
                </div>
              </div>
            </div>
          )}

          <div className="bg-white p-8 rounded-[2.5rem] shadow-xl border border-slate-100 space-y-6">
            <h3 className="text-lg font-black text-slate-800 text-center border-b pb-4">即時數據看板</h3>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-4 bg-slate-50 rounded-2xl">
                  <p className="text-[9px] font-black text-slate-400">總字數</p>
                  <p className="text-xl font-black text-slate-800">{liveStats.words}</p>
                </div>
                <div className="p-4 bg-amber-50 rounded-2xl">
                  <p className="text-[9px] font-black text-amber-500">閱讀 (分)</p>
                  <p className="text-xl font-black text-amber-600">{liveStats.readingTime}</p>
                </div>
              </div>
              <div className="p-4 bg-slate-900 rounded-3xl text-white">
                <div className="flex justify-between items-center mb-2">
                  <p className="text-[10px] font-black text-slate-400 uppercase">關鍵詞密度</p>
                  <span className="text-xs font-black text-amber-400">{liveStats.density.toFixed(2)}%</span>
                </div>
                <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full bg-amber-500" style={{ width: `${Math.min(100, liveStats.density * 20)}%` }}></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col bg-slate-50/50 font-sans">
      <main className="flex-1">
        {step === AppStep.SETUP && renderSetup()}
        {(step === AppStep.INTENT_ANALYZING || step === AppStep.ANALYZING) && renderLoading()}
        {step === AppStep.INTENT_RESULT && renderIntentResult()}
        {step === AppStep.QUESTIONS_INPUT && renderQuestionsInput()}
        {step === AppStep.OUTLINE_READY && renderOutline()}
        {step === AppStep.EDITOR && renderEditor()}
      </main>
      <footer className="bg-white border-t border-slate-100 py-16 px-6 mt-20">
        <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-12 items-start">
          <div className="space-y-6">
            <h5 className="font-black text-slate-800 uppercase tracking-widest text-xs border-l-4 border-amber-600 pl-3">專案宣言與免責聲明</h5>
            <div className="space-y-4 text-[12px] text-slate-500 leading-relaxed">
              <p>本工具模擬的是<strong>低端但有效</strong>的 SEO 文章大綱邏輯。搜尋意圖分析基於 Frank Chiu 的拆解框架，7W3H 寫作框架確保內容結構完整覆蓋所有維度。</p>
              <p>專案開源免費，嚴禁用於商業營利。發布文章前確保內容符合最新 SEO 規範。</p>
            </div>
          </div>
          <div className="md:text-right space-y-6">
            <div className="flex flex-col md:items-end gap-3">
              <span className="text-sm font-black text-slate-800">發起人：AK (SEO 模擬者)</span>
              <div className="flex gap-4">
                <a href="https://www.threads.net/@darkseoking" target="_blank" rel="noopener noreferrer" className="text-xs font-black text-amber-600 hover:text-amber-700 flex items-center gap-1 transition-all">
                  <i className="fab fa-threads text-lg"></i> Threads 交流
                </a>
              </div>
            </div>
            <p className="text-[10px] text-slate-400 font-medium">© 2025 AK Lab. 致力於低門檻 SEO 教育。</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;

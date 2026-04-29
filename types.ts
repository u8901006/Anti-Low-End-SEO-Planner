
export interface SearchIntentAnalysis {
  primaryIntent: string;
  secondaryIntent: string;
  userProblem: string;
  funnelStage: string;
  suggestedContentFormats: string[];
  unsuitableFormats: string[];
  longTailKeywords: string[];
  ctaSuggestion: string;
  titleSuggestions: string[];
  serpFeaturePredictions: string[];
}

export interface GoogleQuestionsAnalysis {
  subTopics: Array<{
    topic: string;
    relatedQuestions: string[];
    importance: 'high' | 'medium' | 'low';
  }>;
  suggestedSections: Array<{
    section: 'who' | 'what' | 'when' | 'where' | 'why' | 'whom' | 'whose' | 'how' | 'howmany' | 'howmuch';
    topic: string;
    questions: string[];
  }>;
  commonThemes: string[];
}

export interface ArticleOutline {
  suggestedTitles: string[];
  structure: OutlineNode[];
  targetWordCount: string;
  imageStrategy: {
    totalImages: number;
    placements: Array<{
      afterSection: string;
      description: string;
      aiPrompt: string;
    }>;
  };
  faqs: Array<{
    question: string;
    answer: string;
    rationale: string;
  }>;
}

export interface OutlineNode {
  level: 'H2' | 'H3';
  title: string;
  description: string;
  guidelines: string;
  sourceCompetitor?: string;
}

export interface DraftAnalysis {
  score: number;
  missingSections: string[];
  keywordGaps: string[];
  suggestions: string[];
  readabilityFeedback: string;
}

export type WritingTemplateId = 'A' | 'B' | 'C' | 'D' | 'E';

export interface WritingTemplate {
  id: WritingTemplateId;
  name: string;
  description: string;
  outline: string[];
}

export interface TemplateRecommendation {
  recommended: WritingTemplateId;
  reason: string;
}

export const WRITING_TEMPLATES: Record<WritingTemplateId, WritingTemplate> = {
  A: {
    id: 'A',
    name: 'A 資訊解答型',
    description: '直接回答一個明確問題，用細節補充',
    outline: [
      'OOO 就是 XXX（核心定義一句話）',
      '解答細節 1',
      '解答細節 2',
      '解答細節 3',
      '解答細節 4',
    ],
  },
  B: {
    id: 'B',
    name: 'B 資訊解答型 2',
    description: '從定義、原因、好處到做法的完整說明',
    outline: [
      '什麼是 OOO',
      '為什麼需要 OOO',
      'OOO 的好處是什麼',
      '怎麼做到 OOO',
    ],
  },
  C: {
    id: 'C',
    name: 'C 推薦列表型',
    description: '適合比較、推薦、排行榜類關鍵字',
    outline: [
      'OOO 介紹',
      'OOO 挑選方法',
      '推薦 1',
      '推薦 2',
      '推薦 3',
      '推薦 N',
    ],
  },
  D: {
    id: 'D',
    name: 'D 流程步驟型',
    description: '適合教學、操作指南、步驟說明',
    outline: [
      '什麼是 OOO',
      'OOO 對我們有什麼好處？',
      '快速進入 OOO 的三個步驟',
      '步驟 1',
      '步驟 2',
      '步驟 3',
    ],
  },
  E: {
    id: 'E',
    name: 'E 好處列點型',
    description: '聚焦好處與優勢，適合吸引認知階段讀者',
    outline: [
      '什麼是 OOO',
      'OOO 的好處是什麼',
      '好處 1',
      '好處 2',
      '好處 3',
    ],
  },
};

export enum AppStep {
  SETUP,
  INTENT_ANALYZING,
  INTENT_RESULT,
  TEMPLATE_SELECTION,
  QUESTIONS_INPUT,
  ANALYZING,
  OUTLINE_READY,
  EDITOR
}

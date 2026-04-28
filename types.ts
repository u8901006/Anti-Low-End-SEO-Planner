
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

export enum AppStep {
  SETUP,
  INTENT_ANALYZING,
  INTENT_RESULT,
  QUESTIONS_INPUT,
  ANALYZING,
  OUTLINE_READY,
  EDITOR
}

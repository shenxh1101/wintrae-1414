export enum QuestionType {
  Choice = 'choice',
  FillBlank = 'fill_blank',
  ShortAnswer = 'short_answer',
  StepByStep = 'step_by_step',
}

export enum ErrorCategory {
  KnowledgePoint = 'knowledge_point',
  Misread = 'misread',
  Calculation = 'calculation',
  Expression = 'expression',
  Omission = 'omission',
}

export interface ChoiceOption {
  label: string;
  text: string;
  isCorrect: boolean;
}

export interface ChoiceQuestion {
  type: QuestionType.Choice;
  id: string;
  stem: string;
  options: ChoiceOption[];
  score: number;
  knowledgePoints: string[];
}

export interface FillBlankQuestion {
  type: QuestionType.FillBlank;
  id: string;
  stem: string;
  blanks: FillBlankItem[];
  score: number;
  knowledgePoints: string[];
}

export interface FillBlankItem {
  index: number;
  acceptableAnswers: string[];
  synonyms: string[][];
  disabledAnswers: string[];
  partialScores: PartialScoreEntry[];
}

export interface PartialScoreEntry {
  keywords: string[];
  score: number;
}

export interface ShortAnswerQuestion {
  type: QuestionType.ShortAnswer;
  id: string;
  stem: string;
  referenceAnswer: string;
  keywords: KeywordEntry[];
  synonyms: string[][];
  disabledAnswers: string[];
  partialScores: PartialScoreEntry[];
  score: number;
  knowledgePoints: string[];
}

export interface KeywordEntry {
  keyword: string;
  weight: number;
}

export interface StepQuestion {
  type: QuestionType.StepByStep;
  id: string;
  stem: string;
  steps: StepItem[];
  score: number;
  knowledgePoints: string[];
}

export interface StepItem {
  index: number;
  description: string;
  referenceAnswer: string;
  keywords: KeywordEntry[];
  synonyms: string[][];
  disabledAnswers: string[];
  partialScores: PartialScoreEntry[];
  score: number;
}

export type Question = ChoiceQuestion | FillBlankQuestion | ShortAnswerQuestion | StepQuestion;

export interface ChoiceAnswer {
  type: QuestionType.Choice;
  questionId: string;
  selectedLabels: string[];
}

export interface FillBlankAnswer {
  type: QuestionType.FillBlank;
  questionId: string;
  values: Record<number, string>;
}

export interface ShortAnswerAnswer {
  type: QuestionType.ShortAnswer;
  questionId: string;
  text: string;
}

export interface StepAnswer {
  type: QuestionType.StepByStep;
  questionId: string;
  steps: Record<number, string>;
}

export type StudentAnswer = ChoiceAnswer | FillBlankAnswer | ShortAnswerAnswer | StepAnswer;

export interface ComparisonDetail {
  matched: boolean;
  matchBasis: string;
  similarity: number;
}

export interface ComparisonResult {
  questionId: string;
  questionType: QuestionType;
  overallMatched: boolean;
  overallSimilarity: number;
  details: ComparisonDetail[];
}

export interface HitEvidence {
  rule: string;
  matchedContent: string;
  scoreAwarded: number;
}

export interface SuspiciousItem {
  type: 'possible_guess' | 'ambiguous_answer' | 'contradiction' | 'disabled_hit';
  description: string;
  content: string;
}

export interface ManualReviewReason {
  code: string;
  message: string;
}

export interface ScoreResult {
  questionId: string;
  totalScore: number;
  earnedScore: number;
  hitEvidences: HitEvidence[];
  suspiciousItems: SuspiciousItem[];
  manualReviewNeeded: boolean;
  manualReviewReasons: ManualReviewReason[];
}

export interface ErrorClassificationResult {
  questionId: string;
  categories: ErrorCategoryItem[];
  dominantCategory: ErrorCategory;
  reasoning: string;
}

export interface ErrorCategoryItem {
  category: ErrorCategory;
  confidence: number;
  evidence: string;
}

export interface StudentCommentary {
  questionId: string;
  summary: string;
  strengths: string[];
  improvements: string[];
  errorExplanation: string;
}

export interface ClassOverviewItem {
  questionId: string;
  avgScore: number;
  scoreDistribution: ScoreBand[];
  topErrors: ErrorCategoryItem[];
  commonMistakes: string[];
}

export interface ScoreBand {
  range: string;
  count: number;
  percentage: number;
}

export interface PracticeSuggestion {
  knowledgePoints: string[];
  questionType: QuestionType;
  difficulty: 'easier' | 'same' | 'harder';
  reason: string;
}

export interface CommentaryResult {
  studentCommentary: StudentCommentary;
  classOverview: ClassOverviewItem;
  practiceSuggestions: PracticeSuggestion[];
}

export interface CorrectionResult {
  questionId: string;
  comparison: ComparisonResult;
  score: ScoreResult;
  errorClassification: ErrorClassificationResult;
  commentary: StudentCommentary;
}

export interface BatchCorrectionResult {
  results: CorrectionResult[];
  classOverview: ClassOverviewItem[];
  practiceSuggestions: PracticeSuggestion[];
}

export interface SDKConfig {
  strictMode: boolean;
  similarityThreshold: number;
  manualReviewSimilarityFloor: number;
  defaultScoring: DefaultScoringConfig;
}

export interface DefaultScoringConfig {
  partialCreditEnabled: boolean;
  keywordMatchThreshold: number;
  synonymMatchBonus: number;
}

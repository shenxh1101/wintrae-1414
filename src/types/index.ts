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
  rubric?: RubricItem[];
  knowledgePoints: string[];
}

export interface FillBlankQuestion {
  type: QuestionType.FillBlank;
  id: string;
  stem: string;
  blanks: FillBlankItem[];
  rubric?: RubricItem[];
  score: number;
  knowledgePoints: string[];
}

export interface FillBlankItem {
  index: number;
  acceptableAnswers: string[];
  synonyms: string[][];
  disabledAnswers: DisabledAnswer[];
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
  disabledAnswers: DisabledAnswer[];
  partialScores: PartialScoreEntry[];
  rubric?: RubricItem[];
  score: number;
  knowledgePoints: string[];
}

export interface KeywordEntry {
  keyword: string;
  weight: number;
  synonyms?: string[];
}

export interface StepQuestion {
  type: QuestionType.StepByStep;
  id: string;
  stem: string;
  steps: StepItem[];
  rubric?: RubricItem[];
  score: number;
  knowledgePoints: string[];
}

export interface StepItem {
  index: number;
  description: string;
  referenceAnswer: string;
  keywords: KeywordEntry[];
  synonyms: string[][];
  disabledAnswers: DisabledAnswer[];
  partialScores: PartialScoreEntry[];
  score: number;
}

export type Question = ChoiceQuestion | FillBlankQuestion | ShortAnswerQuestion | StepQuestion;

export interface ChoiceAnswer {
  type: QuestionType.Choice;
  questionId: string;
  selectedLabels: string[];
  studentId?: string;
}

export interface FillBlankAnswer {
  type: QuestionType.FillBlank;
  questionId: string;
  values: Record<number, string>;
  studentId?: string;
}

export interface ShortAnswerAnswer {
  type: QuestionType.ShortAnswer;
  questionId: string;
  text: string;
  studentId?: string;
}

export interface StepAnswer {
  type: QuestionType.StepByStep;
  questionId: string;
  steps: Record<number, string>;
  studentId?: string;
}

export type StudentAnswer = ChoiceAnswer | FillBlankAnswer | ShortAnswerAnswer | StepAnswer;

export interface ComparisonDetail {
  matched: boolean;
  matchBasis: string;
  similarity: number;
  matchedSynonym?: { canonical: string; synonym: string };
}

export interface ComparisonResult {
  questionId: string;
  questionType: QuestionType;
  overallMatched: boolean;
  overallSimilarity: number;
  details: ComparisonDetail[];
  matchedSynonyms: { canonical: string; synonym: string }[];
}

export interface HitEvidence {
  rule: string;
  matchedContent: string;
  matchedViaSynonym?: { canonical: string; synonym: string };
  scoreAwarded: number;
  rubricItemId?: string;
}

export interface SuspiciousItem {
  type: 'possible_guess' | 'ambiguous_answer' | 'contradiction' | 'disabled_hit';
  description: string;
  content: string;
}

export interface ManualReviewReason {
  code: string;
  message: string;
  severity: 'warning' | 'error';
}

export interface DisabledAnswer {
  text: string;
  reason: string;
}

export interface RubricItem {
  id: string;
  name: string;
  description: string;
  weight: number;
  maxScore: number;
  allowPartialCredit: boolean;
  allOrNothing?: boolean;
  criteria: RubricCriterion[];
}

export interface RubricCriterion {
  id: string;
  description: string;
  keywords: KeywordEntry[];
  score: number;
}

export interface RubricScoreDetail {
  rubricItemId: string;
  rubricItemName: string;
  maxScore: number;
  earnedScore: number;
  allowPartialCredit: boolean;
  allOrNothing: boolean;
  passed: boolean;
  criteriaScores: { criterionId: string; earned: boolean; scoreAwarded: number }[];
  hitEvidences: HitEvidence[];
}

export interface ScoreResult {
  questionId: string;
  totalScore: number;
  earnedScore: number;
  hitEvidences: HitEvidence[];
  rubricScores: RubricScoreDetail[];
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
  rubricFeedback: { rubricItemName: string; feedback: string }[];
}

export interface ClassOverviewItem {
  questionId: string;
  avgScore: number;
  scoreDistribution: ScoreBand[];
  topErrors: ErrorCategoryItem[];
  commonMistakes: string[];
  rubricBreakdown: { rubricItemId: string; rubricItemName: string; avgScore: number; avgRatio: number; passRate: number }[];
  synonymStats: { canonical: string; synonym: string; hitCount: number }[];
  disabledAnswerStats: { text: string; reason: string; hitCount: number }[];
  studentCount: number;
}

export interface KnowledgePointOverview {
  knowledgePoint: string;
  questionCount: number;
  studentCount: number;
  avgScore: number;
  avgScoreRatio: number;
  topErrors: ErrorCategoryItem[];
  weakRubricItems: string[];
  practiceDirection: PracticeSuggestion;
  relatedQuestions: string[];
  typicalWrongAnswers: { answer: string; frequency: number; errorType: ErrorCategory }[];
  representativeEvidences: HitEvidence[];
  practiceTypeMix: { questionType: QuestionType; proportion: number; reason: string }[];
  synonymStats: { canonical: string; synonym: string; hitCount: number }[];
  disabledAnswerStats: { text: string; reason: string; hitCount: number }[];
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
  studentId?: string;
  comparison: ComparisonResult;
  score: ScoreResult;
  errorClassification: ErrorClassificationResult;
  commentary: StudentCommentary;
}

export interface StudentOverview {
  studentId: string;
  totalScore: number;
  totalEarned: number;
  avgScoreRatio: number;
  questionScores: { questionId: string; earned: number; total: number; ratio: number }[];
  weakKnowledgePoints: { knowledgePoint: string; avgRatio: number }[];
  topErrors: ErrorCategoryItem[];
  rubricBreakdown: { rubricItemName: string; avgRatio: number }[];
  needsReview: boolean;
  reviewReasons: string[];
}

export interface BatchCorrectionResult {
  results: CorrectionResult[];
  classOverview: ClassOverviewItem[];
  knowledgePointOverview: KnowledgePointOverview[];
  practiceSuggestions: PracticeSuggestion[];
  studentOverview: StudentOverview[];
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

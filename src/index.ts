export { CorrectionSDK, createSDK } from './sdk';
export { CorrectionSDKBuilder } from './sdk-builder';

export {
  QuestionType,
  ErrorCategory,
} from './types';

export type {
  ChoiceOption,
  ChoiceQuestion,
  FillBlankQuestion,
  FillBlankItem,
  FillBlankAnswer,
  PartialScoreEntry,
  ShortAnswerQuestion,
  KeywordEntry,
  StepQuestion,
  StepItem,
  Question,
  ChoiceAnswer,
  ShortAnswerAnswer,
  StepAnswer,
  StudentAnswer,
  ComparisonDetail,
  ComparisonResult,
  HitEvidence,
  SuspiciousItem,
  ManualReviewReason,
  ScoreResult,
  ErrorCategoryItem,
  ErrorClassificationResult,
  StudentCommentary,
  ClassOverviewItem,
  ScoreBand,
  PracticeSuggestion,
  CommentaryResult,
  CorrectionResult,
  BatchCorrectionResult,
  SDKConfig,
  DefaultScoringConfig,
} from './types';

export { compare, computeSimilarity, matchSynonyms } from './engine/comparator';
export { score } from './engine/scorer';
export { classifyError } from './classifier/error-classifier';
export {
  generateStudentCommentary,
  generateClassOverview,
  generatePracticeSuggestions,
  generateCommentary,
} from './generator/commentary';

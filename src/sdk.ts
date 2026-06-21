import {
  Question,
  StudentAnswer,
  ComparisonResult,
  ScoreResult,
  ErrorClassificationResult,
  StudentCommentary,
  ClassOverviewItem,
  PracticeSuggestion,
  CorrectionResult,
  BatchCorrectionResult,
  CommentaryResult,
  SDKConfig,
  DefaultScoringConfig,
} from './types';
import { compare } from './engine/comparator';
import { score } from './engine/scorer';
import { classifyError } from './classifier/error-classifier';
import {
  generateStudentCommentary,
  generateClassOverview,
  generatePracticeSuggestions,
  generateCommentary,
} from './generator/commentary';

const DEFAULT_CONFIG: SDKConfig = {
  strictMode: false,
  similarityThreshold: 0.7,
  manualReviewSimilarityFloor: 0.75,
  defaultScoring: {
    partialCreditEnabled: true,
    keywordMatchThreshold: 0.6,
    synonymMatchBonus: 0.1,
  },
};

export class CorrectionSDK {
  private config: SDKConfig;

  constructor(config: Partial<SDKConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    if (config.defaultScoring) {
      this.config.defaultScoring = { ...DEFAULT_CONFIG.defaultScoring, ...config.defaultScoring };
    }
  }

  importQuestion(question: Question): Question {
    return question;
  }

  importQuestions(questions: Question[]): Question[] {
    return questions;
  }

  compare(question: Question, answer: StudentAnswer): ComparisonResult {
    return compare(question, answer);
  }

  scoreQuestion(
    question: Question,
    answer: StudentAnswer,
    comparison?: ComparisonResult,
  ): ScoreResult {
    const comp = comparison ?? compare(question, answer);
    return score(question, answer, comp, this.config);
  }

  classifyError(
    question: Question,
    answer: StudentAnswer,
    comparison: ComparisonResult,
    scoreResult: ScoreResult,
  ): ErrorClassificationResult {
    return classifyError(question, answer, comparison, scoreResult);
  }

  generateCommentary(
    question: Question,
    scoreResult: ScoreResult,
    errorClassification: ErrorClassificationResult,
  ): StudentCommentary {
    return generateStudentCommentary(question, scoreResult, errorClassification);
  }

  generateClassOverview(
    question: Question,
    results: CorrectionResult[],
  ): ClassOverviewItem {
    return generateClassOverview(question, results);
  }

  generatePracticeSuggestions(
    question: Question,
    results: CorrectionResult[],
  ): PracticeSuggestion[] {
    return generatePracticeSuggestions(question, results);
  }

  correct(question: Question, answer: StudentAnswer): CorrectionResult {
    const comparison = compare(question, answer);
    const scoreResult = score(question, answer, comparison, this.config);
    const errorClassResult = classifyError(question, answer, comparison, scoreResult);
    const commentary = generateStudentCommentary(question, scoreResult, errorClassResult);

    return {
      questionId: question.id,
      comparison,
      score: scoreResult,
      errorClassification: errorClassResult,
      commentary,
    };
  }

  batchCorrect(
    questions: Question[],
    answers: StudentAnswer[],
  ): BatchCorrectionResult {
    const results: CorrectionResult[] = [];
    const questionMap = new Map(questions.map((q) => [q.id, q]));

    for (const answer of answers) {
      const question = questionMap.get(answer.questionId);
      if (!question) {
        throw new Error(`找不到题目: ${answer.questionId}`);
      }
      results.push(this.correct(question, answer));
    }

    const classOverviews: ClassOverviewItem[] = [];
    const allSuggestions: PracticeSuggestion[] = [];

    for (const question of questions) {
      const questionResults = results.filter((r) => r.questionId === question.id);
      if (questionResults.length > 0) {
        classOverviews.push(generateClassOverview(question, questionResults));
        allSuggestions.push(...generatePracticeSuggestions(question, questionResults));
      }
    }

    return {
      results,
      classOverview: classOverviews,
      practiceSuggestions: allSuggestions,
    };
  }

  getConfig(): SDKConfig {
    return { ...this.config };
  }
}

export function createSDK(config?: Partial<SDKConfig>): CorrectionSDK {
  return new CorrectionSDK(config);
}

export { CorrectionSDKBuilder } from './sdk-builder';

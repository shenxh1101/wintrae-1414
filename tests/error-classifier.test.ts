import { classifyError } from '../src/classifier/error-classifier';
import { compare } from '../src/engine/comparator';
import { score } from '../src/engine/scorer';
import { QuestionType, ErrorCategory, ChoiceQuestion, FillBlankQuestion, ShortAnswerQuestion, StepQuestion, ChoiceAnswer, FillBlankAnswer, ShortAnswerAnswer, StepAnswer, SDKConfig } from '../src/types';

const defaultConfig: SDKConfig = {
  strictMode: false,
  similarityThreshold: 0.7,
  manualReviewSimilarityFloor: 0.75,
  defaultScoring: {
    partialCreditEnabled: true,
    keywordMatchThreshold: 0.6,
    synonymMatchBonus: 0.1,
  },
};

describe('classifyError - correct answer', () => {
  const question: ChoiceQuestion = {
    type: QuestionType.Choice,
    id: 'q1',
    stem: '哪个是哺乳动物？',
    options: [
      { label: 'A', text: '鲨鱼', isCorrect: false },
      { label: 'B', text: '鲸鱼', isCorrect: true },
    ],
    score: 5,
    knowledgePoints: ['生物分类'],
  };

  it('correct answer has zero confidence on all errors', () => {
    const answer: ChoiceAnswer = { type: QuestionType.Choice, questionId: 'q1', selectedLabels: ['B'] };
    const comp = compare(question, answer);
    const sc = score(question, answer, comp, defaultConfig);
    const result = classifyError(question, answer, comp, sc);
    expect(result.categories.every((c) => c.confidence === 0)).toBe(true);
  });
});

describe('classifyError - omission', () => {
  const question: FillBlankQuestion = {
    type: QuestionType.FillBlank,
    id: 'q2',
    stem: '___是中国的首都，___是最大的城市。',
    blanks: [
      { index: 0, acceptableAnswers: ['北京'], synonyms: [], disabledAnswers: [], partialScores: [] },
      { index: 1, acceptableAnswers: ['上海'], synonyms: [], disabledAnswers: [], partialScores: [] },
    ],
    score: 4,
    knowledgePoints: ['地理'],
  };

  it('missing blanks classified as omission', () => {
    const answer: FillBlankAnswer = { type: QuestionType.FillBlank, questionId: 'q2', values: { 0: '北京' } };
    const comp = compare(question, answer);
    const sc = score(question, answer, comp, defaultConfig);
    const result = classifyError(question, answer, comp, sc);
    const omission = result.categories.find((c) => c.category === ErrorCategory.Omission);
    expect(omission!.confidence).toBeGreaterThan(0.5);
  });
});

describe('classifyError - knowledge point', () => {
  const question: ShortAnswerQuestion = {
    type: QuestionType.ShortAnswer,
    id: 'q3',
    stem: '简述光合作用。',
    referenceAnswer: '利用光能将二氧化碳和水转化为有机物和氧气',
    keywords: [
      { keyword: '光能', weight: 1 },
      { keyword: '二氧化碳', weight: 1 },
      { keyword: '有机物', weight: 1 },
    ],
    synonyms: [],
    disabledAnswers: [],
    partialScores: [],
    score: 10,
    knowledgePoints: ['光合作用'],
  };

  it('low score with no keywords triggers knowledge_point error', () => {
    const answer: ShortAnswerAnswer = {
      type: QuestionType.ShortAnswer,
      questionId: 'q3',
      text: '植物在阳光下生长',
    };
    const comp = compare(question, answer);
    const sc = score(question, answer, comp, defaultConfig);
    const result = classifyError(question, answer, comp, sc);
    const kp = result.categories.find((c) => c.category === ErrorCategory.KnowledgePoint);
    expect(kp!.confidence).toBeGreaterThan(0.3);
  });
});

describe('classifyError - calculation propagation', () => {
  const question: StepQuestion = {
    type: QuestionType.StepByStep,
    id: 'q4',
    stem: '计算 (3+5)×2',
    steps: [
      {
        index: 0,
        description: '计算括号',
        referenceAnswer: '3+5=8',
        keywords: [{ keyword: '8', weight: 1 }],
        synonyms: [],
        disabledAnswers: [],
        partialScores: [],
        score: 3,
      },
      {
        index: 1,
        description: '乘法',
        referenceAnswer: '8×2=16',
        keywords: [{ keyword: '16', weight: 1 }],
        synonyms: [],
        disabledAnswers: [],
        partialScores: [],
        score: 3,
      },
    ],
    score: 6,
    knowledgePoints: ['四则运算'],
  };

  it('early step correct but later wrong triggers calculation error', () => {
    const answer: StepAnswer = {
      type: QuestionType.StepByStep,
      questionId: 'q4',
      steps: { 0: '3+5=8', 1: '8×2=17' },
    };
    const comp = compare(question, answer);
    const sc = score(question, answer, comp, defaultConfig);
    const result = classifyError(question, answer, comp, sc);
    const calc = result.categories.find((c) => c.category === ErrorCategory.Calculation);
    expect(calc!.confidence).toBeGreaterThan(0.3);
  });
});

import { score } from '../src/engine/scorer';
import { compare } from '../src/engine/comparator';
import { QuestionType, ChoiceQuestion, FillBlankQuestion, ShortAnswerQuestion, StepQuestion, ChoiceAnswer, FillBlankAnswer, ShortAnswerAnswer, StepAnswer, SDKConfig } from '../src/types';

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

describe('score - Choice full mark', () => {
  const question: ChoiceQuestion = {
    type: QuestionType.Choice,
    id: 'q1',
    stem: '以下哪个是哺乳动物？',
    options: [
      { label: 'A', text: '鲨鱼', isCorrect: false },
      { label: 'B', text: '鲸鱼', isCorrect: true },
    ],
    score: 5,
    knowledgePoints: ['生物分类'],
  };

  it('correct choice gets full score', () => {
    const answer: ChoiceAnswer = { type: QuestionType.Choice, questionId: 'q1', selectedLabels: ['B'] };
    const comparison = compare(question, answer);
    const result = score(question, answer, comparison, defaultConfig);
    expect(result.earnedScore).toBe(5);
    expect(result.totalScore).toBe(5);
    expect(result.manualReviewNeeded).toBe(false);
  });

  it('wrong choice gets zero', () => {
    const answer: ChoiceAnswer = { type: QuestionType.Choice, questionId: 'q1', selectedLabels: ['A'] };
    const comparison = compare(question, answer);
    const result = score(question, answer, comparison, defaultConfig);
    expect(result.earnedScore).toBe(0);
  });
});

describe('score - FillBlank with partial scores', () => {
  const question: FillBlankQuestion = {
    type: QuestionType.FillBlank,
    id: 'q2',
    stem: '___是中国的首都。',
    blanks: [
      {
        index: 0,
        acceptableAnswers: ['北京'],
        synonyms: [['Beijing']],
        disabledAnswers: ['南京'],
        partialScores: [{ keywords: ['京'], score: 0.5 }],
      },
    ],
    score: 2,
    knowledgePoints: ['地理'],
  };

  it('exact match gets full score', () => {
    const answer: FillBlankAnswer = { type: QuestionType.FillBlank, questionId: 'q2', values: { 0: '北京' } };
    const comparison = compare(question, answer);
    const result = score(question, answer, comparison, defaultConfig);
    expect(result.earnedScore).toBe(2);
  });

  it('disabled answer gets zero', () => {
    const answer: FillBlankAnswer = { type: QuestionType.FillBlank, questionId: 'q2', values: { 0: '南京' } };
    const comparison = compare(question, answer);
    const result = score(question, answer, comparison, defaultConfig);
    expect(result.earnedScore).toBe(0);
    expect(result.suspiciousItems.some((s) => s.type === 'disabled_hit')).toBe(true);
  });
});

describe('score - ShortAnswer with keywords', () => {
  const question: ShortAnswerQuestion = {
    type: QuestionType.ShortAnswer,
    id: 'q3',
    stem: '简述光合作用。',
    referenceAnswer: '光合作用是植物利用光能将二氧化碳和水转化为有机物和氧气的过程。',
    keywords: [
      { keyword: '光能', weight: 2 },
      { keyword: '二氧化碳', weight: 2 },
      { keyword: '水', weight: 1 },
      { keyword: '有机物', weight: 2 },
      { keyword: '氧气', weight: 1 },
    ],
    synonyms: [],
    disabledAnswers: ['抄袭答案'],
    partialScores: [],
    score: 10,
    knowledgePoints: ['光合作用'],
  };

  it('full keyword match gets full score', () => {
    const answer: ShortAnswerAnswer = {
      type: QuestionType.ShortAnswer,
      questionId: 'q3',
      text: '植物利用光能将二氧化碳和水转化为有机物和氧气',
    };
    const comparison = compare(question, answer);
    const result = score(question, answer, comparison, defaultConfig);
    expect(result.earnedScore).toBe(10);
  });

  it('partial keywords gets partial score', () => {
    const answer: ShortAnswerAnswer = {
      type: QuestionType.ShortAnswer,
      questionId: 'q3',
      text: '植物利用光能将二氧化碳转化',
    };
    const comparison = compare(question, answer);
    const result = score(question, answer, comparison, defaultConfig);
    expect(result.earnedScore).toBeGreaterThan(0);
    expect(result.earnedScore).toBeLessThan(10);
  });

  it('disabled answer flagged', () => {
    const answer: ShortAnswerAnswer = {
      type: QuestionType.ShortAnswer,
      questionId: 'q3',
      text: '这是抄袭答案的内容',
    };
    const comparison = compare(question, answer);
    const result = score(question, answer, comparison, defaultConfig);
    expect(result.earnedScore).toBe(0);
    expect(result.manualReviewNeeded).toBe(true);
  });
});

describe('score - StepByStep', () => {
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

  it('all steps correct gets full score', () => {
    const answer: StepAnswer = {
      type: QuestionType.StepByStep,
      questionId: 'q4',
      steps: { 0: '3+5=8', 1: '8×2=16' },
    };
    const comparison = compare(question, answer);
    const result = score(question, answer, comparison, defaultConfig);
    expect(result.earnedScore).toBe(6);
  });

  it('first step wrong gives partial score', () => {
    const answer: StepAnswer = {
      type: QuestionType.StepByStep,
      questionId: 'q4',
      steps: { 0: '3+5=9', 1: '9×2=18' },
    };
    const comparison = compare(question, answer);
    const result = score(question, answer, comparison, defaultConfig);
    expect(result.earnedScore).toBeLessThan(6);
  });
});

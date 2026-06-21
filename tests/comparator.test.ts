import { compare, computeSimilarity, matchSynonyms } from '../src/engine/comparator';
import { QuestionType, ChoiceQuestion, FillBlankQuestion, ShortAnswerQuestion, StepQuestion, ChoiceAnswer, FillBlankAnswer, ShortAnswerAnswer, StepAnswer } from '../src/types';

describe('computeSimilarity', () => {
  it('identical strings return 1', () => {
    expect(computeSimilarity('hello', 'hello')).toBe(1);
  });

  it('empty strings return 1', () => {
    expect(computeSimilarity('', '')).toBe(1);
  });

  it('one empty string returns 0', () => {
    expect(computeSimilarity('abc', '')).toBe(0);
  });

  it('partial match returns value between 0 and 1', () => {
    const sim = computeSimilarity('abc', 'abd');
    expect(sim).toBeGreaterThan(0);
    expect(sim).toBeLessThan(1);
  });

  it('normalizes Chinese punctuation', () => {
    expect(computeSimilarity('你好，世界', '你好,世界')).toBe(1);
  });

  it('is case insensitive', () => {
    expect(computeSimilarity('Hello', 'hello')).toBe(1);
  });
});

describe('matchSynonyms', () => {
  it('matches exact synonym', () => {
    const r = matchSynonyms('细胞膜', [['细胞膜', '质膜', '生物膜']]);
    expect(r.matched).toBe(true);
    expect(r.canonical).toBe('细胞膜');
    expect(r.synonym).toBe('细胞膜');
  });

  it('matches alternative synonym', () => {
    const r = matchSynonyms('质膜', [['细胞膜', '质膜', '生物膜']]);
    expect(r.matched).toBe(true);
    expect(r.canonical).toBe('细胞膜');
    expect(r.synonym).toBe('质膜');
  });

  it('returns false when no match', () => {
    expect(matchSynonyms('细胞核', [['细胞膜', '质膜']]).matched).toBe(false);
  });
});

describe('compare - Choice', () => {
  const question: ChoiceQuestion = {
    type: QuestionType.Choice,
    id: 'q1',
    stem: '以下哪个是哺乳动物？',
    options: [
      { label: 'A', text: '鲨鱼', isCorrect: false },
      { label: 'B', text: '鲸鱼', isCorrect: true },
      { label: 'C', text: '鳄鱼', isCorrect: false },
      { label: 'D', text: '蜥蜴', isCorrect: false },
    ],
    score: 5,
    knowledgePoints: ['生物分类'],
  };

  it('correct answer returns matched=true', () => {
    const answer: ChoiceAnswer = { type: QuestionType.Choice, questionId: 'q1', selectedLabels: ['B'] };
    const result = compare(question, answer);
    expect(result.overallMatched).toBe(true);
    expect(result.overallSimilarity).toBe(1);
  });

  it('wrong answer returns matched=false', () => {
    const answer: ChoiceAnswer = { type: QuestionType.Choice, questionId: 'q1', selectedLabels: ['A'] };
    const result = compare(question, answer);
    expect(result.overallMatched).toBe(false);
  });
});

describe('compare - FillBlank', () => {
  const question: FillBlankQuestion = {
    type: QuestionType.FillBlank,
    id: 'q2',
    stem: '水的化学式是___，常温下为___态。',
    blanks: [
      {
        index: 0,
        acceptableAnswers: ['H2O', 'h2o'],
        synonyms: [['氢氧化合物']],
        disabledAnswers: [],
        partialScores: [],
      },
      {
        index: 1,
        acceptableAnswers: ['液', '液态'],
        synonyms: [['液体']],
        disabledAnswers: [],
        partialScores: [],
      },
    ],
    score: 4,
    knowledgePoints: ['化学基础'],
  };

  it('all blanks correct returns matched=true', () => {
    const answer: FillBlankAnswer = {
      type: QuestionType.FillBlank,
      questionId: 'q2',
      values: { 0: 'H2O', 1: '液' },
    };
    const result = compare(question, answer);
    expect(result.overallMatched).toBe(true);
  });

  it('synonym match works', () => {
    const answer: FillBlankAnswer = {
      type: QuestionType.FillBlank,
      questionId: 'q2',
      values: { 0: '氢氧化合物', 1: '液' },
    };
    const result = compare(question, answer);
    expect(result.details[0].matched).toBe(true);
  });

  it('partial match returns matched=false', () => {
    const answer: FillBlankAnswer = {
      type: QuestionType.FillBlank,
      questionId: 'q2',
      values: { 0: 'H2O', 1: '固态' },
    };
    const result = compare(question, answer);
    expect(result.overallMatched).toBe(false);
    expect(result.details[0].matched).toBe(true);
    expect(result.details[1].matched).toBe(false);
  });
});

describe('compare - ShortAnswer', () => {
  const question: ShortAnswerQuestion = {
    type: QuestionType.ShortAnswer,
    id: 'q3',
    stem: '简述光合作用的基本过程。',
    referenceAnswer: '光合作用是植物利用光能将二氧化碳和水转化为有机物和氧气的过程。',
    keywords: [
      { keyword: '光能', weight: 1 },
      { keyword: '二氧化碳', weight: 1 },
      { keyword: '水', weight: 1 },
      { keyword: '有机物', weight: 1 },
      { keyword: '氧气', weight: 1 },
    ],
    synonyms: [['光能', '太阳能', '光']],
    disabledAnswers: [],
    partialScores: [],
    score: 10,
    knowledgePoints: ['光合作用'],
  };

  it('all keywords hit returns matched=true', () => {
    const answer: ShortAnswerAnswer = {
      type: QuestionType.ShortAnswer,
      questionId: 'q3',
      text: '植物利用光能将二氧化碳和水转化为有机物和氧气',
    };
    const result = compare(question, answer);
    expect(result.overallMatched).toBe(true);
  });

  it('partial keywords returns matched=false', () => {
    const answer: ShortAnswerAnswer = {
      type: QuestionType.ShortAnswer,
      questionId: 'q3',
      text: '植物利用光能将二氧化碳转化',
    };
    const result = compare(question, answer);
    expect(result.overallMatched).toBe(false);
  });
});

describe('compare - StepByStep', () => {
  const question: StepQuestion = {
    type: QuestionType.StepByStep,
    id: 'q4',
    stem: '计算 (3+5)×2',
    steps: [
      {
        index: 0,
        description: '计算括号内',
        referenceAnswer: '3+5=8',
        keywords: [{ keyword: '8', weight: 1 }],
        synonyms: [],
        disabledAnswers: [],
        partialScores: [],
        score: 3,
      },
      {
        index: 1,
        description: '乘法运算',
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

  it('all steps correct returns matched=true', () => {
    const answer: StepAnswer = {
      type: QuestionType.StepByStep,
      questionId: 'q4',
      steps: { 0: '3+5=8', 1: '8×2=16' },
    };
    const result = compare(question, answer);
    expect(result.overallMatched).toBe(true);
  });

  it('first step wrong, second step correct', () => {
    const answer: StepAnswer = {
      type: QuestionType.StepByStep,
      questionId: 'q4',
      steps: { 0: '3+5=9', 1: '9×2=18' },
    };
    const result = compare(question, answer);
    expect(result.overallMatched).toBe(false);
    expect(result.details[0].matched).toBe(false);
  });
});

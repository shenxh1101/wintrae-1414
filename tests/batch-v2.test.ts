import { createSDK, CorrectionSDKBuilder } from '../src/index';
import { QuestionType, ErrorCategory } from '../src/types';
import type { ShortAnswerQuestion, ChoiceQuestion, FillBlankQuestion } from '../src/types';
import type { ShortAnswerAnswer, ChoiceAnswer, FillBlankAnswer } from '../src/types';

const sdk = createSDK();

describe('Rubric 全有全无模式 (allOrNothing)', () => {
  const question: ShortAnswerQuestion = {
    type: QuestionType.ShortAnswer,
    id: 'aon-1',
    stem: '简述光合作用的原料和产物',
    referenceAnswer: '原料是二氧化碳和水，产物是有机物和氧气',
    keywords: [],
    synonyms: [],
    disabledAnswers: [],
    partialScores: [],
    score: 10,
    knowledgePoints: ['光合作用'],
    rubric: [
      {
        id: 'r1',
        name: '原料识别',
        description: '必须同时提到二氧化碳和水',
        weight: 1,
        maxScore: 5,
        allowPartialCredit: false,
        allOrNothing: true,
        criteria: [
          {
            id: 'r1c1',
            description: '提到二氧化碳',
            keywords: [{ keyword: '二氧化碳', weight: 1, synonyms: ['CO2'] }],
            score: 2.5,
          },
          {
            id: 'r1c2',
            description: '提到水',
            keywords: [{ keyword: '水', weight: 1 }],
            score: 2.5,
          },
        ],
      },
      {
        id: 'r2',
        name: '产物识别',
        description: '必须同时提到有机物和氧气',
        weight: 1,
        maxScore: 5,
        allowPartialCredit: false,
        allOrNothing: true,
        criteria: [
          {
            id: 'r2c1',
            description: '提到有机物',
            keywords: [{ keyword: '有机物', weight: 1 }],
            score: 2.5,
          },
          {
            id: 'r2c2',
            description: '提到氧气',
            keywords: [{ keyword: '氧气', weight: 1 }],
            score: 2.5,
          },
        ],
      },
    ],
  };

  it('全有全无：只答对一部分得 0 分，整项不通过', () => {
    const answer: ShortAnswerAnswer = {
      type: QuestionType.ShortAnswer,
      questionId: 'aon-1',
      text: '原料是二氧化碳，产物是有机物',
    };
    const result = sdk.correct(question, answer);
    const r1 = result.score.rubricScores.find((r) => r.rubricItemId === 'r1')!;
    const r2 = result.score.rubricScores.find((r) => r.rubricItemId === 'r2')!;
    expect(r1.allOrNothing).toBe(true);
    expect(r1.passed).toBe(false);
    expect(r1.earnedScore).toBe(0);
    expect(r2.passed).toBe(false);
    expect(r2.earnedScore).toBe(0);
    expect(r1.hitEvidences.some((e) => e.rule === 'rubric_all_or_nothing_miss')).toBe(true);
  });

  it('全有全无：全部答对得满分，整项通过', () => {
    const answer: ShortAnswerAnswer = {
      type: QuestionType.ShortAnswer,
      questionId: 'aon-1',
      text: '原料是二氧化碳和水，产物是有机物和氧气',
    };
    const result = sdk.correct(question, answer);
    const r1 = result.score.rubricScores.find((r) => r.rubricItemId === 'r1')!;
    const r2 = result.score.rubricScores.find((r) => r.rubricItemId === 'r2')!;
    expect(r1.passed).toBe(true);
    expect(r2.passed).toBe(true);
    expect(r1.earnedScore).toBe(5);
    expect(r2.earnedScore).toBe(5);
    expect(result.score.earnedScore).toBe(10);
  });

  it('全有全无：同义词命中也算通过', () => {
    const answer: ShortAnswerAnswer = {
      type: QuestionType.ShortAnswer,
      questionId: 'aon-1',
      text: '原料是CO2和水，产物是有机物和氧气',
    };
    const result = sdk.correct(question, answer);
    const r1 = result.score.rubricScores.find((r) => r.rubricItemId === 'r1')!;
    expect(r1.passed).toBe(true);
    expect(r1.earnedScore).toBe(5);
  });
});

describe('学生维度汇总', () => {
  const q1: ShortAnswerQuestion = {
    type: QuestionType.ShortAnswer,
    id: 'stu-q1',
    stem: '光合作用的能量来源',
    referenceAnswer: '光能',
    keywords: [{ keyword: '光能', weight: 1 }],
    synonyms: [],
    disabledAnswers: [],
    partialScores: [],
    score: 5,
    knowledgePoints: ['光合作用', '能量转换'],
  };
  const q2: ChoiceQuestion = {
    type: QuestionType.Choice,
    id: 'stu-q2',
    stem: '水的化学式',
    options: [
      { label: 'A', text: 'H2O', isCorrect: true },
      { label: 'B', text: 'CO2', isCorrect: false },
    ],
    score: 5,
    knowledgePoints: ['化学基础'],
  };
  const q3: FillBlankQuestion = {
    type: QuestionType.FillBlank,
    id: 'stu-q3',
    stem: '___是中国的首都',
    blanks: [
      {
        index: 0,
        acceptableAnswers: ['北京'],
        synonyms: [],
        disabledAnswers: [{ text: '南京', reason: '混淆城市' }],
        partialScores: [],
      },
    ],
    score: 5,
    knowledgePoints: ['地理'],
  };

  const answers = [
    { type: QuestionType.ShortAnswer, questionId: 'stu-q1', text: '光能', studentId: 's1' } as ShortAnswerAnswer,
    { type: QuestionType.Choice, questionId: 'stu-q2', selectedLabels: ['A'], studentId: 's1' } as ChoiceAnswer,
    { type: QuestionType.FillBlank, questionId: 'stu-q3', values: { 0: '南京' }, studentId: 's1' } as FillBlankAnswer,
    { type: QuestionType.ShortAnswer, questionId: 'stu-q1', text: '不知道', studentId: 's2' } as ShortAnswerAnswer,
    { type: QuestionType.Choice, questionId: 'stu-q2', selectedLabels: ['B'], studentId: 's2' } as ChoiceAnswer,
    { type: QuestionType.FillBlank, questionId: 'stu-q3', values: { 0: '北京' }, studentId: 's2' } as FillBlankAnswer,
  ];

  it('batchCorrect 返回 studentOverview 数组', () => {
    const batch = sdk.batchCorrect([q1, q2, q3], answers);
    expect(batch.studentOverview).toBeDefined();
    expect(batch.studentOverview.length).toBe(2);
  });

  it('学生总分和平均得分率正确', () => {
    const batch = sdk.batchCorrect([q1, q2, q3], answers);
    const s1 = batch.studentOverview.find((s) => s.studentId === 's1')!;
    const s2 = batch.studentOverview.find((s) => s.studentId === 's2')!;
    expect(s1).toBeDefined();
    expect(s2).toBeDefined();
    expect(s1.totalScore).toBe(15);
    expect(s1.avgScoreRatio).toBeLessThan(100);
    expect(s1.avgScoreRatio).toBeGreaterThan(0);
    expect(s2.totalScore).toBe(15);
  });

  it('学生维度含每道题得分明细', () => {
    const batch = sdk.batchCorrect([q1, q2, q3], answers);
    const s1 = batch.studentOverview.find((s) => s.studentId === 's1')!;
    expect(s1.questionScores.length).toBe(3);
    const q1Score = s1.questionScores.find((q) => q.questionId === 'stu-q1')!;
    expect(q1Score.earned).toBe(5);
    expect(q1Score.total).toBe(5);
    expect(q1Score.ratio).toBe(100);
  });

  it('学生维度含薄弱知识点', () => {
    const batch = sdk.batchCorrect([q1, q2, q3], answers);
    const s2 = batch.studentOverview.find((s) => s.studentId === 's2')!;
    expect(s2.weakKnowledgePoints.length).toBeGreaterThan(0);
    expect(s2.weakKnowledgePoints.some((k) => k.knowledgePoint === '化学基础')).toBe(true);
  });

  it('命中禁用答案的学生 needsReview=true', () => {
    const batch = sdk.batchCorrect([q1, q2, q3], answers);
    const s1 = batch.studentOverview.find((s) => s.studentId === 's1')!;
    expect(s1.needsReview).toBe(true);
    expect(s1.reviewReasons.length).toBeGreaterThan(0);
    expect(s1.reviewReasons.some((r) => r.includes('stu-q3'))).toBe(true);
  });

  it('学生按平均分降序排列', () => {
    const batch = sdk.batchCorrect([q1, q2, q3], answers);
    expect(batch.studentOverview[0].avgScoreRatio).toBeGreaterThanOrEqual(
      batch.studentOverview[1].avgScoreRatio,
    );
  });
});

describe('知识点概览丰富字段', () => {
  const q1: ShortAnswerQuestion = {
    type: QuestionType.ShortAnswer,
    id: 'kp-r1',
    stem: '光合作用原料',
    referenceAnswer: '二氧化碳和水',
    keywords: [
      { keyword: '二氧化碳', weight: 1, synonyms: ['CO2'] },
      { keyword: '水', weight: 1 },
    ],
    synonyms: [],
    disabledAnswers: [{ text: '氮气', reason: '常见错误' }],
    partialScores: [],
    score: 10,
    knowledgePoints: ['光合作用'],
    rubric: [
      {
        id: 'r1',
        name: '原料掌握',
        description: '',
        weight: 1,
        maxScore: 10,
        allowPartialCredit: true,
        allOrNothing: false,
        criteria: [
          { id: 'c1', description: '识别原料', keywords: [{ keyword: '二氧化碳', weight: 1 }, { keyword: '水', weight: 1 }], score: 10 },
        ],
      },
    ],
  };

  const answers = [
    { type: QuestionType.ShortAnswer, questionId: 'kp-r1', text: '二氧化碳和水', studentId: 'a' } as ShortAnswerAnswer,
    { type: QuestionType.ShortAnswer, questionId: 'kp-r1', text: 'CO2和水', studentId: 'b' } as ShortAnswerAnswer,
    { type: QuestionType.ShortAnswer, questionId: 'kp-r1', text: '氧气和水', studentId: 'c' } as ShortAnswerAnswer,
    { type: QuestionType.ShortAnswer, questionId: 'kp-r1', text: '氮气', studentId: 'd' } as ShortAnswerAnswer,
  ];

  it('知识点概览含典型错误答案', () => {
    const batch = sdk.batchCorrect([q1], answers);
    const kp = batch.knowledgePointOverview.find((k) => k.knowledgePoint === '光合作用')!;
    expect(kp.typicalWrongAnswers.length).toBeGreaterThan(0);
    expect(kp.typicalWrongAnswers[0].frequency).toBeGreaterThan(0);
    expect(kp.typicalWrongAnswers[0].errorType).toBeDefined();
  });

  it('知识点概览含代表性命中依据', () => {
    const batch = sdk.batchCorrect([q1], answers);
    const kp = batch.knowledgePointOverview.find((k) => k.knowledgePoint === '光合作用')!;
    expect(kp.representativeEvidences.length).toBeGreaterThan(0);
    expect(kp.representativeEvidences[0].rule).toBeDefined();
    expect(kp.representativeEvidences[0].matchedContent).toBeDefined();
  });

  it('知识点概览含练习题型组合建议', () => {
    const batch = sdk.batchCorrect([q1], answers);
    const kp = batch.knowledgePointOverview.find((k) => k.knowledgePoint === '光合作用')!;
    expect(kp.practiceTypeMix.length).toBeGreaterThan(0);
    expect(kp.practiceTypeMix[0].questionType).toBe(QuestionType.ShortAnswer);
    expect(kp.practiceTypeMix[0].proportion).toBe(100);
  });

  it('知识点概览含同义词命中统计', () => {
    const batch = sdk.batchCorrect([q1], answers);
    const kp = batch.knowledgePointOverview.find((k) => k.knowledgePoint === '光合作用')!;
    expect(kp.synonymStats.length).toBeGreaterThan(0);
    const co2Syn = kp.synonymStats.find((s) => s.canonical === '二氧化碳' && s.synonym === 'CO2');
    expect(co2Syn).toBeDefined();
    expect(co2Syn!.hitCount).toBeGreaterThanOrEqual(1);
  });

  it('知识点概览含禁用答案触发统计', () => {
    const batch = sdk.batchCorrect([q1], answers);
    const kp = batch.knowledgePointOverview.find((k) => k.knowledgePoint === '光合作用')!;
    expect(kp.disabledAnswerStats.length).toBeGreaterThan(0);
    const nitrogen = kp.disabledAnswerStats.find((d) => d.text === '氮气');
    expect(nitrogen).toBeDefined();
    expect(nitrogen!.hitCount).toBe(1);
    expect(nitrogen!.reason).toContain('常见错误');
  });
});

describe('班级概览丰富字段', () => {
  const q: ShortAnswerQuestion = {
    type: QuestionType.ShortAnswer,
    id: 'cls-1',
    stem: '光合作用的能量来源',
    referenceAnswer: '光能',
    keywords: [{ keyword: '光能', weight: 1, synonyms: ['太阳能', '阳光'] }],
    synonyms: [],
    disabledAnswers: [{ text: '不知道', reason: '完全不会' }],
    partialScores: [],
    score: 10,
    knowledgePoints: ['光合作用'],
    rubric: [
      {
        id: 'r1',
        name: '基础概念',
        description: '',
        weight: 1,
        maxScore: 10,
        allowPartialCredit: false,
        allOrNothing: false,
        criteria: [{ id: 'c1', description: '识别光能', keywords: [{ keyword: '光能', weight: 1 }], score: 10 }],
      },
    ],
  };

  const answers = [
    { type: QuestionType.ShortAnswer, questionId: 'cls-1', text: '光能', studentId: 's1' } as ShortAnswerAnswer,
    { type: QuestionType.ShortAnswer, questionId: 'cls-1', text: '太阳能', studentId: 's2' } as ShortAnswerAnswer,
    { type: QuestionType.ShortAnswer, questionId: 'cls-1', text: '不知道', studentId: 's3' } as ShortAnswerAnswer,
  ];

  it('班级概览含学生人数（按 studentId 去重）', () => {
    const batch = sdk.batchCorrect([q], answers);
    const overview = batch.classOverview.find((o) => o.questionId === 'cls-1')!;
    expect(overview.studentCount).toBe(3);
  });

  it('班级概览含同义词统计', () => {
    const batch = sdk.batchCorrect([q], answers);
    const overview = batch.classOverview.find((o) => o.questionId === 'cls-1')!;
    expect(overview.synonymStats.length).toBeGreaterThan(0);
    const solar = overview.synonymStats.find((s) => s.canonical === '光能' && s.synonym === '太阳能');
    expect(solar).toBeDefined();
    expect(solar!.hitCount).toBe(1);
  });

  it('班级概览含禁用答案统计', () => {
    const batch = sdk.batchCorrect([q], answers);
    const overview = batch.classOverview.find((o) => o.questionId === 'cls-1')!;
    expect(overview.disabledAnswerStats.length).toBeGreaterThan(0);
    const dk = overview.disabledAnswerStats.find((d) => d.text === '不知道');
    expect(dk).toBeDefined();
    expect(dk!.hitCount).toBe(1);
  });

  it('班级概览 rubricBreakdown 含 passRate', () => {
    const batch = sdk.batchCorrect([q], answers);
    const overview = batch.classOverview.find((o) => o.questionId === 'cls-1')!;
    expect(overview.rubricBreakdown[0].passRate).toBeDefined();
    expect(overview.rubricBreakdown[0].passRate).toBeGreaterThan(0);
    expect(overview.rubricBreakdown[0].passRate).toBeLessThanOrEqual(100);
  });
});

describe('算分口径修正', () => {
  const q1: ShortAnswerQuestion = {
    type: QuestionType.ShortAnswer,
    id: 'sc-1',
    stem: '1+1',
    referenceAnswer: '2',
    keywords: [{ keyword: '2', weight: 1 }],
    synonyms: [],
    disabledAnswers: [],
    partialScores: [],
    score: 5,
    knowledgePoints: ['基础运算'],
  };
  const q2: ShortAnswerQuestion = {
    type: QuestionType.ShortAnswer,
    id: 'sc-2',
    stem: '2+2',
    referenceAnswer: '4',
    keywords: [{ keyword: '4', weight: 1 }],
    synonyms: [],
    disabledAnswers: [],
    partialScores: [],
    score: 15,
    knowledgePoints: ['基础运算'],
  };

  it('知识点平均得分率不超过 100%', () => {
    const answers = [
      { type: QuestionType.ShortAnswer, questionId: 'sc-1', text: '2', studentId: 's1' } as ShortAnswerAnswer,
      { type: QuestionType.ShortAnswer, questionId: 'sc-2', text: '4', studentId: 's1' } as ShortAnswerAnswer,
      { type: QuestionType.ShortAnswer, questionId: 'sc-1', text: '2', studentId: 's2' } as ShortAnswerAnswer,
      { type: QuestionType.ShortAnswer, questionId: 'sc-2', text: '4', studentId: 's2' } as ShortAnswerAnswer,
    ];
    const batch = sdk.batchCorrect([q1, q2], answers);
    const kp = batch.knowledgePointOverview.find((k) => k.knowledgePoint === '基础运算')!;
    expect(kp.avgScoreRatio).toBeLessThanOrEqual(100);
    expect(kp.avgScoreRatio).toBe(100);
  });

  it('学生人数按实际作答人数计算（同一学生答多题算 1 人）', () => {
    const answers = [
      { type: QuestionType.ShortAnswer, questionId: 'sc-1', text: '2', studentId: 's1' } as ShortAnswerAnswer,
      { type: QuestionType.ShortAnswer, questionId: 'sc-2', text: '4', studentId: 's1' } as ShortAnswerAnswer,
      { type: QuestionType.ShortAnswer, questionId: 'sc-1', text: '3', studentId: 's2' } as ShortAnswerAnswer,
      { type: QuestionType.ShortAnswer, questionId: 'sc-2', text: '5', studentId: 's2' } as ShortAnswerAnswer,
    ];
    const batch = sdk.batchCorrect([q1, q2], answers);
    const kp = batch.knowledgePointOverview.find((k) => k.knowledgePoint === '基础运算')!;
    expect(kp.studentCount).toBe(2);
    expect(kp.questionCount).toBe(2);
  });

  it('没有 studentId 时按答案数统计', () => {
    const answers = [
      { type: QuestionType.ShortAnswer, questionId: 'sc-1', text: '2' } as ShortAnswerAnswer,
      { type: QuestionType.ShortAnswer, questionId: 'sc-2', text: '4' } as ShortAnswerAnswer,
    ];
    const batch = sdk.batchCorrect([q1, q2], answers);
    const overview = batch.classOverview.find((o) => o.questionId === 'sc-1')!;
    expect(overview.studentCount).toBe(1);
  });
});

describe('Rubric 权重计算', () => {
  const question: ShortAnswerQuestion = {
    type: QuestionType.ShortAnswer,
    id: 'w-1',
    stem: '测试权重',
    referenceAnswer: 'ab',
    keywords: [],
    synonyms: [],
    disabledAnswers: [],
    partialScores: [],
    score: 100,
    knowledgePoints: ['测试'],
    rubric: [
      {
        id: 'heavy',
        name: '高权重项',
        description: '',
        weight: 3,
        maxScore: 10,
        allowPartialCredit: false,
        allOrNothing: false,
        criteria: [{ id: 'c1', description: 'a', keywords: [{ keyword: 'a', weight: 1 }], score: 10 }],
      },
      {
        id: 'light',
        name: '低权重项',
        description: '',
        weight: 1,
        maxScore: 10,
        allowPartialCredit: false,
        allOrNothing: false,
        criteria: [{ id: 'c2', description: 'b', keywords: [{ keyword: 'b', weight: 1 }], score: 10 }],
      },
    ],
  };

  it('高权重项占总分比例更大', () => {
    const answer: ShortAnswerAnswer = {
      type: QuestionType.ShortAnswer,
      questionId: 'w-1',
      text: 'a',
    };
    const result = sdk.correct(question, answer);
    const heavy = result.score.rubricScores.find((r) => r.rubricItemId === 'heavy')!;
    const light = result.score.rubricScores.find((r) => r.rubricItemId === 'light')!;
    expect(heavy.earnedScore).toBe(10);
    expect(light.earnedScore).toBe(0);
    expect(result.score.earnedScore).toBeGreaterThan(50);
    expect(result.score.earnedScore).toBeLessThan(100);
  });

  it('两项都对时满分', () => {
    const answer: ShortAnswerAnswer = {
      type: QuestionType.ShortAnswer,
      questionId: 'w-1',
      text: 'ab',
    };
    const result = sdk.correct(question, answer);
    expect(result.score.earnedScore).toBe(100);
  });
});

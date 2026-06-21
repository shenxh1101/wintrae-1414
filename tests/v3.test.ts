import { createSDK, CorrectionSDKBuilder } from '../src/index';
import { QuestionType, ErrorCategory } from '../src/types';
import type { ShortAnswerQuestion, FillBlankQuestion } from '../src/types';
import type { ShortAnswerAnswer, FillBlankAnswer } from '../src/types';

const sdk = createSDK();

describe('典型错误答案（带学生标识）', () => {
  const q: ShortAnswerQuestion = {
    type: QuestionType.ShortAnswer,
    id: 'twa-q1',
    stem: '光合作用的能量来源',
    referenceAnswer: '光能',
    keywords: [{ keyword: '光能', weight: 1 }],
    synonyms: [],
    disabledAnswers: [],
    partialScores: [],
    score: 10,
    knowledgePoints: ['光合作用', '能量转换'],
  };
  const answers = [
    { type: QuestionType.ShortAnswer, questionId: 'twa-q1', text: '不知道', studentId: 'alice' } as ShortAnswerAnswer,
    { type: QuestionType.ShortAnswer, questionId: 'twa-q1', text: '不知道', studentId: 'bob' } as ShortAnswerAnswer,
    { type: QuestionType.ShortAnswer, questionId: 'twa-q1', text: '热能', studentId: 'carol' } as ShortAnswerAnswer,
    { type: QuestionType.ShortAnswer, questionId: 'twa-q1', text: '光能', studentId: 'dave' } as ShortAnswerAnswer,
  ];

  it('典型错误答案含 studentIds', () => {
    const batch = sdk.batchCorrect([q], answers);
    const overview = batch.classOverview.find((o) => o.questionId === 'twa-q1')!;
    expect(overview.typicalWrongAnswers.length).toBeGreaterThan(0);
    const notKnow = overview.typicalWrongAnswers.find((t) => t.answer === '不知道')!;
    expect(notKnow).toBeDefined();
    expect(notKnow.frequency).toBe(2);
    expect(notKnow.studentIds).toEqual(expect.arrayContaining(['alice', 'bob']));
  });

  it('典型错误答案含 questionIds 和 knowledgePoints', () => {
    const batch = sdk.batchCorrect([q], answers);
    const kp = batch.knowledgePointOverview.find((k) => k.knowledgePoint === '光合作用')!;
    const notKnow = kp.typicalWrongAnswers.find((t) => t.answer === '不知道')!;
    expect(notKnow.questionIds).toEqual(['twa-q1']);
    expect(notKnow.knowledgePoints).toEqual(expect.arrayContaining(['光合作用']));
  });

  it('典型错误答案含 errorType', () => {
    const batch = sdk.batchCorrect([q], answers);
    const overview = batch.classOverview.find((o) => o.questionId === 'twa-q1')!;
    expect(overview.typicalWrongAnswers[0].errorType).toBeDefined();
  });

  it('buildTypicalWrongAnswers 可按知识点过滤', () => {
    const batch = sdk.batchCorrect([q], answers);
    const kpOnly = sdk.buildTypicalWrongAnswers(batch.results, [q], '光合作用');
    expect(kpOnly.length).toBeGreaterThan(0);
    const wrongKp = sdk.buildTypicalWrongAnswers(batch.results, [q], '不存在的知识点');
    expect(wrongKp.length).toBe(0);
  });
});

describe('复核工作台 ReviewWorkbench', () => {
  const q: FillBlankQuestion = {
    type: QuestionType.FillBlank,
    id: 'rw-q1',
    stem: '中国首都___',
    blanks: [
      {
        index: 0,
        acceptableAnswers: ['北京'],
        synonyms: [],
        disabledAnswers: [{ text: '南京', reason: '与正确答案混淆' }],
        partialScores: [],
      },
    ],
    score: 5,
    knowledgePoints: ['地理'],
  };
  const q2: ShortAnswerQuestion = {
    type: QuestionType.ShortAnswer,
    id: 'rw-q2',
    stem: '简述光合作用',
    referenceAnswer: '利用光能将二氧化碳和水合成有机物',
    keywords: [
      { keyword: '光能', weight: 1 },
      { keyword: '二氧化碳', weight: 1 },
      { keyword: '水', weight: 1 },
      { keyword: '有机物', weight: 1 },
    ],
    synonyms: [],
    disabledAnswers: [{ text: '作弊答案', reason: '疑似抄袭' }],
    partialScores: [],
    score: 10,
    knowledgePoints: ['光合作用'],
  };

  it('batchCorrect 返回 reviewWorkbench，按 status 区分待复核/已确认', () => {
    const answers = [
      { type: QuestionType.FillBlank, questionId: 'rw-q1', values: { 0: '南京' }, studentId: 's1' } as FillBlankAnswer,
      { type: QuestionType.FillBlank, questionId: 'rw-q1', values: { 0: '北京' }, studentId: 's2' } as FillBlankAnswer,
    ];
    const batch = sdk.batchCorrect([q], answers);
    expect(batch.reviewWorkbench).toBeDefined();
    expect(batch.reviewWorkbench.summary.totalCount).toBeGreaterThan(0);
    expect(batch.reviewWorkbench.summary.pendingCount).toBeGreaterThan(0);
    expect(batch.reviewWorkbench.pending.length).toBeGreaterThan(0);
  });

  it('复核条目含学生ID、题目ID、原始答案、严重级别', () => {
    const answers = [
      { type: QuestionType.FillBlank, questionId: 'rw-q1', values: { 0: '南京' }, studentId: 's1' } as FillBlankAnswer,
    ];
    const batch = sdk.batchCorrect([q], answers);
    const item = batch.reviewWorkbench.pending[0];
    expect(item.studentId).toBe('s1');
    expect(item.questionId).toBe('rw-q1');
    expect(item.type).toBe('disabled_hit');
    expect(item.severity).toBe('error');
    expect(item.status).toBe('pending');
    expect(item.content).toBe('南京');
    expect(item.originalAnswer).toBeDefined();
    expect(item.earnedScore).toBeDefined();
    expect(item.totalScore).toBeDefined();
  });

  it('复核工作台支持按学生和按题目索引', () => {
    const answers = [
      { type: QuestionType.FillBlank, questionId: 'rw-q1', values: { 0: '南京' }, studentId: 's1' } as FillBlankAnswer,
      { type: QuestionType.ShortAnswer, questionId: 'rw-q2', text: '作弊答案', studentId: 's1' } as ShortAnswerAnswer,
      { type: QuestionType.FillBlank, questionId: 'rw-q1', values: { 0: '南京' }, studentId: 's2' } as FillBlankAnswer,
    ];
    const batch = sdk.batchCorrect([q, q2], answers);
    expect(batch.reviewWorkbench.byStudent['s1'].length).toBe(2);
    expect(batch.reviewWorkbench.byStudent['s2'].length).toBe(1);
    expect(batch.reviewWorkbench.byQuestion['rw-q1'].length).toBe(2);
    expect(batch.reviewWorkbench.byQuestion['rw-q2'].length).toBe(1);
  });

  it('复核支持 initialStatuses 预设已确认有效/无效', () => {
    const answers = [
      { type: QuestionType.FillBlank, questionId: 'rw-q1', values: { 0: '南京' }, studentId: 's1' } as FillBlankAnswer,
    ];
    const batch = sdk.batchCorrect([q], answers);
    const pendingId = batch.reviewWorkbench.pending[0].id;
    const initialStatuses = { [pendingId]: 'confirmed_valid' as const };
    const wb = sdk.buildReviewWorkbench(batch.results, initialStatuses);
    expect(wb.summary.confirmedValidCount).toBe(1);
    expect(wb.confirmedValid[0].id).toBe(pendingId);
    expect(wb.pending.length).toBe(0);
  });

  it('summary.byType 给出不同复核类型的计数', () => {
    const answers = [
      { type: QuestionType.FillBlank, questionId: 'rw-q1', values: { 0: '南京' }, studentId: 's1' } as FillBlankAnswer,
      { type: QuestionType.FillBlank, questionId: 'rw-q1', values: { 0: '南京' }, studentId: 's2' } as FillBlankAnswer,
    ];
    const batch = sdk.batchCorrect([q], answers);
    expect(batch.reviewWorkbench.summary.byType['disabled_hit']).toBe(2);
  });
});

describe('Rubric 分值对齐', () => {
  const q: ShortAnswerQuestion = {
    type: QuestionType.ShortAnswer,
    id: 'align-q1',
    stem: '识别原料和产物',
    referenceAnswer: '原料：二氧化碳、水；产物：有机物、氧气',
    keywords: [],
    synonyms: [],
    disabledAnswers: [],
    partialScores: [],
    score: 20,
    knowledgePoints: ['光合作用'],
    rubric: [
      {
        id: 'raw',
        name: '原料识别',
        description: '',
        weight: 1,
        maxScore: 10,
        allowPartialCredit: true,
        allOrNothing: false,
        criteria: [
          {
            id: 'c1',
            description: '二氧化碳',
            keywords: [{ keyword: '二氧化碳', weight: 2, synonyms: ['CO2'] }],
            score: 5,
          },
          {
            id: 'c2',
            description: '水',
            keywords: [{ keyword: '水', weight: 1 }],
            score: 5,
          },
        ],
      },
      {
        id: 'product',
        name: '产物识别',
        description: '',
        weight: 1,
        maxScore: 10,
        allowPartialCredit: true,
        allOrNothing: false,
        criteria: [
          {
            id: 'c3',
            description: '有机物',
            keywords: [{ keyword: '有机物', weight: 1 }],
            score: 5,
          },
          {
            id: 'c4',
            description: '氧气',
            keywords: [{ keyword: '氧气', weight: 1 }],
            score: 5,
          },
        ],
      },
    ],
  };

  it('evidence.scoreAwarded 之和 ≈ rubric 项 earnedScore', () => {
    const answer: ShortAnswerAnswer = {
      type: QuestionType.ShortAnswer,
      questionId: 'align-q1',
      text: '原料有二氧化碳，产物有有机物',
    };
    const result = sdk.correct(q, answer);
    for (const rs of result.score.rubricScores) {
      const evSum = rs.hitEvidences
        .filter((e) => e.rule === 'keyword_match')
        .reduce((s, e) => s + e.scoreAwarded, 0);
      expect(Math.abs(evSum - rs.earnedScore)).toBeLessThan(0.02);
    }
  });

  it('evidence 含 criterionScore / criterionScoreRatio / rubricScore / rubricScoreRatio', () => {
    const answer: ShortAnswerAnswer = {
      type: QuestionType.ShortAnswer,
      questionId: 'align-q1',
      text: '原料有二氧化碳和水，产物有有机物',
    };
    const result = sdk.correct(q, answer);
    const kwEvs = result.score.hitEvidences.filter((e) => e.rule === 'keyword_match');
    expect(kwEvs.length).toBeGreaterThan(0);
    for (const ev of kwEvs) {
      expect(ev.criterionScore).toBeDefined();
      expect(ev.criterionScoreRatio).toBeDefined();
      expect(ev.rubricScore).toBeDefined();
      expect(ev.rubricScoreRatio).toBeDefined();
      expect(ev.weightedTotalContribution).toBeDefined();
    }
  });

  it('所有 rubric 项 weightedTotalContribution 之和 ≈ 总分', () => {
    const answer: ShortAnswerAnswer = {
      type: QuestionType.ShortAnswer,
      questionId: 'align-q1',
      text: '原料有二氧化碳和水，产物有有机物和氧气',
    };
    const result = sdk.correct(q, answer);
    const total = result.score.hitEvidences.reduce(
      (s, e) => s + (e.weightedTotalContribution ?? 0),
      0,
    );
    expect(Math.abs(total - result.score.earnedScore)).toBeLessThan(0.05);
  });

  it('同义词命中后，evidence 带 matchedViaSynonym 且分值对齐', () => {
    const answer: ShortAnswerAnswer = {
      type: QuestionType.ShortAnswer,
      questionId: 'align-q1',
      text: '原料有CO2和水，产物有有机物和氧气',
    };
    const result = sdk.correct(q, answer);
    const co2Ev = result.score.hitEvidences.find(
      (e) => e.matchedViaSynonym?.synonym === 'CO2',
    );
    expect(co2Ev).toBeDefined();
    expect(co2Ev!.scoreAwarded).toBeGreaterThan(0);
    expect(co2Ev!.criterionScoreRatio).toBe(100);
  });

  it('allOrNothing=false 时 60% 阈值标记 passed', () => {
    const answer: ShortAnswerAnswer = {
      type: QuestionType.ShortAnswer,
      questionId: 'align-q1',
      text: '原料有二氧化碳和水，产物有有机物',
    };
    const result = sdk.correct(q, answer);
    const raw = result.score.rubricScores.find((r) => r.rubricItemId === 'raw')!;
    const product = result.score.rubricScores.find((r) => r.rubricItemId === 'product')!;
    expect(raw.passed).toBe(true);
    expect(product.earnedScore).toBeGreaterThan(0);
    expect(product.earnedScore).toBeLessThan(product.maxScore);
  });
});

describe('跨题同义词/禁用答案合并统计', () => {
  const q1: ShortAnswerQuestion = {
    type: QuestionType.ShortAnswer,
    id: 'cq-1',
    stem: '光合作用的能量来源',
    referenceAnswer: '光能',
    keywords: [{ keyword: '光能', weight: 1, synonyms: ['太阳能', '阳光'] }],
    synonyms: [],
    disabledAnswers: [{ text: '不知道', reason: '未掌握概念' }],
    partialScores: [],
    score: 10,
    knowledgePoints: ['光合作用', '能量转换'],
  };
  const q2: ShortAnswerQuestion = {
    type: QuestionType.ShortAnswer,
    id: 'cq-2',
    stem: '太阳能电池板把什么能转化为电能',
    referenceAnswer: '光能',
    keywords: [{ keyword: '光能', weight: 1, synonyms: ['太阳能', '阳光'] }],
    synonyms: [],
    disabledAnswers: [{ text: '不知道', reason: '未掌握概念' }],
    partialScores: [],
    score: 10,
    knowledgePoints: ['能量转换', '电学'],
  };

  const answers = [
    { type: QuestionType.ShortAnswer, questionId: 'cq-1', text: '太阳能', studentId: 'a' } as ShortAnswerAnswer,
    { type: QuestionType.ShortAnswer, questionId: 'cq-2', text: '太阳能', studentId: 'b' } as ShortAnswerAnswer,
    { type: QuestionType.ShortAnswer, questionId: 'cq-2', text: '阳光', studentId: 'c' } as ShortAnswerAnswer,
    { type: QuestionType.ShortAnswer, questionId: 'cq-1', text: '不知道', studentId: 'd' } as ShortAnswerAnswer,
    { type: QuestionType.ShortAnswer, questionId: 'cq-2', text: '不知道', studentId: 'e' } as ShortAnswerAnswer,
  ];

  it('crossQuestionStats.synonymStats 汇总同一表达在不同题的命中', () => {
    const batch = sdk.batchCorrect([q1, q2], answers);
    const solar = batch.crossQuestionStats.synonymStats.find((s) => s.expression === '太阳能')!;
    expect(solar).toBeDefined();
    expect(solar.type).toBe('synonym');
    expect(solar.totalHitCount).toBe(2);
    expect(solar.byQuestion.length).toBe(2);
    expect(solar.byQuestion.map((q) => q.questionId)).toEqual(
      expect.arrayContaining(['cq-1', 'cq-2']),
    );
    expect(solar.metadata?.canonical).toBe('光能');
  });

  it('同义词跨题汇总含按知识点维度', () => {
    const batch = sdk.batchCorrect([q1, q2], answers);
    const solar = batch.crossQuestionStats.synonymStats.find((s) => s.expression === '太阳能')!;
    expect(solar.byKnowledgePoint.length).toBeGreaterThanOrEqual(1);
    const energyKp = solar.byKnowledgePoint.find((k) => k.knowledgePoint === '能量转换');
    expect(energyKp).toBeDefined();
    expect(energyKp!.hitCount).toBe(2);
  });

  it('禁用答案跨题汇总含原因和命中统计', () => {
    const batch = sdk.batchCorrect([q1, q2], answers);
    const dk = batch.crossQuestionStats.disabledAnswerStats.find((s) => s.expression === '不知道')!;
    expect(dk).toBeDefined();
    expect(dk.totalHitCount).toBe(2);
    expect(dk.byQuestion.length).toBe(2);
    expect(dk.metadata?.reason).toContain('未掌握');
  });

  it('buildCrossQuestionStats 可单独调用', () => {
    const batch = sdk.batchCorrect([q1, q2], answers);
    const stats = sdk.buildCrossQuestionStats([q1, q2], batch.results);
    expect(stats.synonymStats.length).toBeGreaterThan(0);
    expect(stats.disabledAnswerStats.length).toBeGreaterThan(0);
  });

  it('同一表达在不同知识点分别统计', () => {
    const batch = sdk.batchCorrect([q1, q2], answers);
    const solar = batch.crossQuestionStats.synonymStats.find((s) => s.expression === '太阳能')!;
    const kps = solar.byKnowledgePoint.map((k) => k.knowledgePoint);
    expect(kps).toEqual(expect.arrayContaining(['能量转换']));
  });
});

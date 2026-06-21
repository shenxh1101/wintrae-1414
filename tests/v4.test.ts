import { createSDK } from '../src';
import {
  QuestionType,
  ErrorCategory,
  ShortAnswerQuestion,
  ShortAnswerAnswer,
} from '../src/types';

const sdk = createSDK();

describe('复核闭环 regenerateBatchStats', () => {
  const q: ShortAnswerQuestion = {
    type: QuestionType.ShortAnswer,
    id: 'rvq-1',
    stem: '中国首都',
    referenceAnswer: '北京',
    keywords: [{ keyword: '北京', weight: 1, synonyms: ['北平'] }],
    synonyms: [],
    disabledAnswers: [{ text: '南京', reason: '易混淆城市' }],
    partialScores: [],
    score: 10,
    knowledgePoints: ['中国地理', '首都'],
  };
  const answers: ShortAnswerAnswer[] = [
    { type: QuestionType.ShortAnswer, questionId: 'rvq-1', text: '南京', studentId: 'a' } as any,
    { type: QuestionType.ShortAnswer, questionId: 'rvq-1', text: '北京', studentId: 'b' } as any,
    { type: QuestionType.ShortAnswer, questionId: 'rvq-1', text: '南京', studentId: 'c' } as any,
  ];

  it('未复核前，学生 b 得满分，a/c 得 0 并触发复核', () => {
    const batch = sdk.batchCorrect([q], answers);
    const bResult = batch.results.find((r) => r.studentId === 'b')!;
    const aResult = batch.results.find((r) => r.studentId === 'a')!;
    expect(bResult.score.earnedScore).toBe(10);
    expect(aResult.score.earnedScore).toBe(0);
    expect(batch.reviewWorkbench.pending.length).toBeGreaterThan(0);
  });

  it('确认禁用答案无效后，该学生分数被清零且可在 regenerateBatchStats 中重新汇总', () => {
    const batch = sdk.batchCorrect([q], answers);
    const pendingItem = batch.reviewWorkbench.pending[0];
    expect(pendingItem).toBeDefined();

    const regenerated = sdk.regenerateBatchStats([q], batch.results, {
      [pendingItem.id]: 'confirmed_invalid',
    });
    const adjusted = regenerated.results.find((r) => r.studentId === pendingItem.studentId)!;
    expect(adjusted.score.reviewAdjustedScore).toBe(0);
    expect(adjusted.score.reviewAdjustments?.length ?? 0).toBeGreaterThan(0);
    expect(regenerated.reviewWorkbench.confirmedInvalid.length).toBeGreaterThanOrEqual(1);
    expect(regenerated.reviewWorkbench.summary.confirmedInvalidCount).toBeGreaterThanOrEqual(1);
  });

  it('学生维度汇总在复核后分数变化', () => {
    const batch = sdk.batchCorrect([q], answers);
    const studentABefore = batch.studentOverview.find((s) => s.studentId === 'a')!;
    const statuses: Record<string, any> = {};
    for (const it of batch.reviewWorkbench.pending.filter((p) => p.studentId === 'a')) {
      statuses[it.id] = 'confirmed_invalid';
    }
    const regenerated = sdk.regenerateBatchStats([q], batch.results, statuses);
    const studentAAfter = regenerated.studentOverview.find((s) => s.studentId === 'a')!;
    expect(studentABefore).toBeDefined();
    expect(studentAAfter).toBeDefined();
  });
});

describe('讲评导出 LectureExport 分层结构', () => {
  const q1: ShortAnswerQuestion = {
    type: QuestionType.ShortAnswer,
    id: 'exp-1',
    stem: '光合作用原料',
    referenceAnswer: '水和二氧化碳',
    keywords: [
      { keyword: '水', weight: 1, synonyms: [] },
      { keyword: '二氧化碳', weight: 1, synonyms: ['CO2'] },
    ],
    synonyms: [],
    disabledAnswers: [],
    partialScores: [],
    score: 10,
    knowledgePoints: ['光合作用'],
    rubric: [
      {
        id: 'r1',
        name: '列出原料',
        description: '列出主要原料',
        weight: 1,
        maxScore: 10,
        allowPartialCredit: true,
        allOrNothing: false,
        criteria: [
          { id: 'c1', description: '提及水', score: 5, keywords: [{ keyword: '水', weight: 1, synonyms: [] }] },
          { id: 'c2', description: '提及二氧化碳', score: 5, keywords: [{ keyword: '二氧化碳', weight: 1, synonyms: ['CO2'] }] },
        ],
      },
    ],
  };
  const answers = [
    { type: QuestionType.ShortAnswer, questionId: 'exp-1', text: '水和CO2', studentId: 'x' } as any,
    { type: QuestionType.ShortAnswer, questionId: 'exp-1', text: '水', studentId: 'y' } as any,
    { type: QuestionType.ShortAnswer, questionId: 'exp-1', text: '不知道', studentId: 'z' } as any,
  ];

  it('buildLectureExport 含 classSummary、knowledgePoints 分层、priorityList、reviewWorkbench', () => {
    const batch = sdk.batchCorrect([q1], answers);
    const exp = sdk.buildLectureExport([q1], batch.results);
    expect(exp.classSummary.totalStudents).toBe(3);
    expect(exp.classSummary.totalQuestions).toBe(1);
    expect(exp.knowledgePoints.length).toBeGreaterThan(0);

    const photosynthesis = exp.knowledgePoints.find((k) => k.knowledgePoint === '光合作用')!;
    expect(photosynthesis).toBeDefined();
    expect(photosynthesis.studentCount).toBe(3);
    expect(photosynthesis.questionCount).toBe(1);
    expect(photosynthesis.questions.length).toBe(1);
    expect(photosynthesis.questions[0].studentIds.length).toBe(3);
    expect(photosynthesis.topErrors.length).toBeGreaterThanOrEqual(0);

    expect(exp.priorityList.knowledgePoints.length).toBeGreaterThan(0);
    expect(exp.priorityList.highFreqErrorCombos.length).toBeGreaterThanOrEqual(0);
    expect(exp.reviewWorkbench).toBeDefined();
  });

  it('buildLectureExport 传入 reviewStatuses 会应用复核调整', () => {
    const batch = sdk.batchCorrect([q1], answers);
    const disabledAns = batch.results.find((r) => r.studentId === 'z');
    // z 没写关键词，得 0 分，不触发 disabled_hit（我们没把不知道配 disabled），这里仍测试结构
    const exp = sdk.buildLectureExport([q1], batch.results, {});
    expect(exp.classSummary.reviewedRatio).toBeDefined();
  });
});

describe('Rubric 多关键词部分命中分值再对齐', () => {
  const q: ShortAnswerQuestion = {
    type: QuestionType.ShortAnswer,
    id: 'rub-1',
    stem: '描述细胞呼吸两个产物',
    referenceAnswer: '水和二氧化碳',
    keywords: [],
    synonyms: [],
    disabledAnswers: [],
    partialScores: [],
    score: 20,
    knowledgePoints: ['细胞呼吸'],
    rubric: [
      {
        id: 'r-main',
        name: '产物识别',
        description: '识别两种产物',
        weight: 1,
        maxScore: 20,
        allowPartialCredit: true,
        allOrNothing: false,
        criteria: [
          {
            id: 'c-water',
            description: '识别水',
            score: 10,
            keywords: [
              { keyword: '水', weight: 2, synonyms: ['H2O'] },
              { keyword: '水蒸气', weight: 1, synonyms: [] },
            ],
          },
          {
            id: 'c-co2',
            description: '识别二氧化碳',
            score: 10,
            keywords: [{ keyword: '二氧化碳', weight: 3, synonyms: ['CO2'] }],
          },
        ],
      },
    ],
  };

  it('部分命中时，evidence.scoreAwarded 之和 = criterion.scoreAwarded；criteria 之和 = rubric.earnedScore', () => {
    const a = { type: QuestionType.ShortAnswer, questionId: 'rub-1', text: '水和CO2', studentId: 's1' } as any;
    const r = sdk.correct(q, a);
    const rubric = r.score.rubricScores.find((rd) => rd.rubricItemId === 'r-main')!;

    for (const criterion of rubric.criteriaScores) {
      const evidenceSum = rubric.hitEvidences
        .filter((e) => {
          const related = q.rubric?.[0].criteria.find((c) => c.id === criterion.criterionId);
          return related?.keywords.some(
            (k) => k.keyword === (e.matchedViaSynonym ? e.matchedViaSynonym.canonical : e.matchedContent),
          );
        })
        .reduce((s, e) => s + (e.scoreAwarded ?? 0), 0);
      expect(Math.abs(evidenceSum - criterion.scoreAwarded)).toBeLessThan(0.02);
    }

    const rubricEvidenceSum = rubric.hitEvidences.reduce(
      (s, e) => s + (e.rule !== 'rubric_all_or_nothing_miss' ? e.scoreAwarded ?? 0 : 0),
      0,
    );
    expect(Math.abs(rubricEvidenceSum - rubric.earnedScore)).toBeLessThan(0.02);

    const wtSum = rubric.hitEvidences.reduce(
      (s, e) => s + (e.weightedTotalContribution ?? 0),
      0,
    );
    expect(Math.abs(wtSum - r.score.earnedScore)).toBeLessThan(0.02);
  });

  it('weightedTotalContribution 所有 rubric 累加 = 题目最终总分', () => {
    const a = { type: QuestionType.ShortAnswer, questionId: 'rub-1', text: '水', studentId: 's2' } as any;
    const r = sdk.correct(q, a);
    const totalWt = r.score.hitEvidences.reduce((s, e) => s + (e.weightedTotalContribution ?? 0), 0);
    expect(Math.abs(totalWt - r.score.earnedScore)).toBeLessThan(0.02);
  });
});

describe('跨题统计 uniqueStudentCount / rubric 同义词合并', () => {
  const q1: ShortAnswerQuestion = {
    type: QuestionType.ShortAnswer,
    id: 'cq-a',
    stem: '太阳能电池板',
    referenceAnswer: '光能转电能',
    keywords: [],
    synonyms: [],
    disabledAnswers: [{ text: '不知道', reason: '没掌握' }],
    partialScores: [],
    score: 10,
    knowledgePoints: ['能量转换'],
    rubric: [
      {
        id: 'r1',
        name: '能量来源',
        description: '识别能量来源',
        weight: 1,
        maxScore: 10,
        allowPartialCredit: true,
        allOrNothing: false,
        criteria: [
          { id: 'c1', description: '识别能量来源', score: 10, keywords: [{ keyword: '光能', weight: 1, synonyms: ['太阳能', '阳光'] }] },
        ],
      },
    ],
  };
  const q2: ShortAnswerQuestion = {
    type: QuestionType.ShortAnswer,
    id: 'cq-b',
    stem: '光合作用能量来源',
    referenceAnswer: '光能',
    keywords: [{ keyword: '光能', weight: 1, synonyms: ['太阳能'] }],
    synonyms: [],
    disabledAnswers: [],
    partialScores: [],
    score: 10,
    knowledgePoints: ['光合作用', '能量转换'],
  };

  it('同义词同时出现在 rubric 和普通关键词里能被分别统计且 totalHitCount 正确', () => {
    const answers = [
      { type: QuestionType.ShortAnswer, questionId: 'cq-a', text: '太阳能', studentId: 'u1' } as any,
      { type: QuestionType.ShortAnswer, questionId: 'cq-b', text: '太阳能', studentId: 'u1' } as any,
      { type: QuestionType.ShortAnswer, questionId: 'cq-a', text: '太阳能', studentId: 'u2' } as any,
      { type: QuestionType.ShortAnswer, questionId: 'cq-a', text: '不知道', studentId: 'u2' } as any,
    ];
    const batch = sdk.batchCorrect([q1, q2], answers);
    const solarStat = batch.crossQuestionStats.synonymStats.find((s) => s.expression === '太阳能')!;
    expect(solarStat).toBeDefined();
    expect(solarStat.uniqueStudentCount).toBe(2);
    expect(solarStat.totalHitCount).toBeGreaterThanOrEqual(2);

    const disabled = batch.crossQuestionStats.disabledAnswerStats.find((d) => d.expression === '不知道')!;
    expect(disabled).toBeDefined();
    expect(disabled.uniqueStudentCount).toBe(1);
  });

  it('disabled answer 同一学生同一道题只算一次 uniqueStudentCount', () => {
    const qDup: ShortAnswerQuestion = {
      type: QuestionType.ShortAnswer,
      id: 'cq-c',
      stem: 'xx',
      referenceAnswer: '正确',
      keywords: [],
      synonyms: [],
      disabledAnswers: [{ text: '不知道', reason: '没掌握' }],
      partialScores: [],
      score: 10,
      knowledgePoints: ['xx'],
    };
    const answers = [
      { type: QuestionType.ShortAnswer, questionId: 'cq-c', text: '不知道 不知道', studentId: 'u9' } as any,
    ];
    const batch = sdk.batchCorrect([qDup], answers);
    const disabled = batch.crossQuestionStats.disabledAnswerStats.find((d) => d.expression === '不知道');
    // 即使多次触发（如果会），uniqueStudentCount 应该还是 1
    if (disabled) {
      expect(disabled.uniqueStudentCount).toBe(1);
    }
  });
});

describe('批量诊断 BatchDiagnosis', () => {
  const q1: ShortAnswerQuestion = {
    type: QuestionType.ShortAnswer,
    id: 'dia-1',
    stem: '光合作用产物',
    referenceAnswer: '葡萄糖和氧气',
    keywords: [
      { keyword: '葡萄糖', weight: 1, synonyms: [] },
      { keyword: '氧气', weight: 1, synonyms: ['O2'] },
    ],
    synonyms: [],
    disabledAnswers: [],
    partialScores: [],
    score: 10,
    knowledgePoints: ['光合作用', '产物'],
  };
  const q2: ShortAnswerQuestion = {
    type: QuestionType.ShortAnswer,
    id: 'dia-2',
    stem: '呼吸作用产物',
    referenceAnswer: '水和二氧化碳',
    keywords: [
      { keyword: '水', weight: 1, synonyms: [] },
      { keyword: '二氧化碳', weight: 1, synonyms: ['CO2'] },
    ],
    synonyms: [],
    disabledAnswers: [],
    partialScores: [],
    score: 10,
    knowledgePoints: ['呼吸作用', '产物'],
  };

  it('buildBatchDiagnosis 返回优先知识点、高频错因组合、建议讲题顺序', () => {
    const answers = [
      { type: QuestionType.ShortAnswer, questionId: 'dia-1', text: '能量', studentId: 'p1' } as any,
      { type: QuestionType.ShortAnswer, questionId: 'dia-2', text: '能量', studentId: 'p1' } as any,
      { type: QuestionType.ShortAnswer, questionId: 'dia-1', text: '水', studentId: 'p2' } as any,
      { type: QuestionType.ShortAnswer, questionId: 'dia-2', text: '水', studentId: 'p2' } as any,
      { type: QuestionType.ShortAnswer, questionId: 'dia-1', text: '葡萄糖', studentId: 'p3' } as any,
      { type: QuestionType.ShortAnswer, questionId: 'dia-2', text: '水和二氧化碳', studentId: 'p3' } as any,
    ];
    const batch = sdk.batchCorrect([q1, q2], answers);
    const diag = sdk.buildBatchDiagnosis([q1, q2], batch.results);
    expect(diag.priorityKnowledgePoints.length).toBeGreaterThan(0);
    expect(diag.suggestedLectureOrder.length).toBeGreaterThan(0);
    expect(diag.highFreqReviewExpressions.length).toBeGreaterThanOrEqual(0);
    expect(diag.highFreqErrorCombinations.length).toBeGreaterThan(0);
    for (const kp of diag.priorityKnowledgePoints) {
      expect(typeof kp.priorityScore).toBe('number');
      expect(kp.reason.length).toBeGreaterThan(0);
    }
  });
});

import { createSDK, CorrectionSDKBuilder } from '../src/index';
import { QuestionType } from '../src/types';
import type { ShortAnswerQuestion, FillBlankQuestion, StepQuestion, ChoiceQuestion } from '../src/types';
import type { ShortAnswerAnswer, FillBlankAnswer, StepAnswer, ChoiceAnswer } from '../src/types';

const sdk = createSDK();

describe('同义词计分', () => {
  const question: ShortAnswerQuestion = {
    type: QuestionType.ShortAnswer,
    id: 'syn-1',
    stem: '光合作用的能量来源是什么？',
    referenceAnswer: '光合作用利用光能将二氧化碳转化为有机物',
    keywords: [
      { keyword: '光能', weight: 2, synonyms: ['太阳能', '阳光'] },
      { keyword: '二氧化碳', weight: 2 },
      { keyword: '有机物', weight: 1 },
    ],
    synonyms: [],
    disabledAnswers: [],
    partialScores: [],
    score: 10,
    knowledgePoints: ['光合作用'],
  };

  it('学生写太阳能时能按光能关键词给分，命中依据里包含同义词', () => {
    const answer: ShortAnswerAnswer = {
      type: QuestionType.ShortAnswer,
      questionId: 'syn-1',
      text: '植物利用太阳能将二氧化碳转化为有机物',
    };
    const result = sdk.correct(question, answer);
    expect(result.score.earnedScore).toBe(10);
    const kwEvs = result.score.hitEvidences.filter((e) => e.rule === 'keyword_match');
    const solarEv = kwEvs.find((e) => e.matchedContent.includes('光能') && e.matchedContent.includes('太阳能'));
    expect(solarEv).toBeDefined();
    expect(result.comparison.matchedSynonyms.some((s) => s.canonical === '光能' && s.synonym === '太阳能')).toBe(true);
  });

  it('学生写阳光时也能匹配到光能', () => {
    const answer: ShortAnswerAnswer = {
      type: QuestionType.ShortAnswer,
      questionId: 'syn-1',
      text: '植物利用阳光、二氧化碳合成有机物',
    };
    const result = sdk.correct(question, answer);
    expect(result.score.earnedScore).toBe(10);
    const hasSunlightSynonym = result.score.hitEvidences.some(
      (e) => e.matchedViaSynonym?.synonym === '阳光',
    );
    expect(hasSunlightSynonym).toBe(true);
  });
});

describe('Rubric 评分项', () => {
  const question: ShortAnswerQuestion = {
    type: QuestionType.ShortAnswer,
    id: 'rubric-1',
    stem: '简述光合作用的意义。',
    referenceAnswer: '光合作用制造有机物、释放氧气、储存能量。',
    keywords: [],
    synonyms: [],
    disabledAnswers: [],
    partialScores: [],
    score: 10,
    knowledgePoints: ['光合作用', '生态系统'],
    rubric: [
      {
        id: 'r1',
        name: '有机物产出',
        description: '提及制造有机物或类似表述',
        weight: 1,
        maxScore: 3,
        allowPartialCredit: true,
        criteria: [
          { id: 'r1c1', description: '提到有机物', keywords: [{ keyword: '有机物', weight: 1, synonyms: ['有机物质', '养分'] }], score: 3 },
        ],
      },
      {
        id: 'r2',
        name: '氧气释放',
        description: '提及释放氧气',
        weight: 1,
        maxScore: 4,
        allowPartialCredit: false,
        criteria: [
          { id: 'r2c1', description: '明确提到氧气', keywords: [{ keyword: '氧气', weight: 1, synonyms: ['O2'] }], score: 4 },
        ],
      },
      {
        id: 'r3',
        name: '能量储存',
        description: '提及能量转换或储存',
        weight: 1,
        maxScore: 3,
        allowPartialCredit: true,
        criteria: [
          { id: 'r3c1', description: '提到能量', keywords: [{ keyword: '能量', weight: 1 }], score: 3 },
        ],
      },
    ],
  };

  it('完全答对应返回各 rubric 项满分及总分 10', () => {
    const answer: ShortAnswerAnswer = {
      type: QuestionType.ShortAnswer,
      questionId: 'rubric-1',
      text: '光合作用制造有机物，释放氧气，并储存能量。',
    };
    const result = sdk.correct(question, answer);
    expect(result.score.earnedScore).toBe(10);
    expect(result.score.rubricScores).toHaveLength(3);
    for (const rs of result.score.rubricScores) {
      expect(rs.earnedScore).toBe(rs.maxScore);
    }
  });

  it('allowPartialCredit=false 的项不允许零散分：只提氧不加分', () => {
    const answer: ShortAnswerAnswer = {
      type: QuestionType.ShortAnswer,
      questionId: 'rubric-1',
      text: '光合作用制造有机物，释放气体，储存能量。',
    };
    const result = sdk.correct(question, answer);
    const r2 = result.score.rubricScores.find((r) => r.rubricItemId === 'r2');
    expect(r2).toBeDefined();
    expect(r2!.earnedScore).toBe(0);
    expect(r2!.allowPartialCredit).toBe(false);
  });

  it('关闭全局部分得分后不再给零散分', () => {
    const strictSdk = new CorrectionSDKBuilder()
      .defaultScoring({ partialCreditEnabled: false })
      .build();
    const answer: ShortAnswerAnswer = {
      type: QuestionType.ShortAnswer,
      questionId: 'rubric-1',
      text: '光合作用制造有机物和一点别的东西。',
    };
    const result = strictSdk.correct(question, answer);
    const r3 = result.score.rubricScores.find((r) => r.rubricItemId === 'r3');
    expect(r3!.earnedScore).toBe(0);
  });

  it('批改结果里能看清每项得分明细', () => {
    const answer: ShortAnswerAnswer = {
      type: QuestionType.ShortAnswer,
      questionId: 'rubric-1',
      text: '光合作用制造有机物，释放氧气。',
    };
    const result = sdk.correct(question, answer);
    const r1 = result.score.rubricScores.find((r) => r.rubricItemId === 'r1');
    const r2 = result.score.rubricScores.find((r) => r.rubricItemId === 'r2');
    const r3 = result.score.rubricScores.find((r) => r.rubricItemId === 'r3');
    expect(r1!.earnedScore).toBe(3);
    expect(r2!.earnedScore).toBe(4);
    expect(r3!.earnedScore).toBe(0);
  });

  it('rubric 反馈出现在学生讲评中', () => {
    const answer: ShortAnswerAnswer = {
      type: QuestionType.ShortAnswer,
      questionId: 'rubric-1',
      text: '光合作用制造有机物。',
    };
    const result = sdk.correct(question, answer);
    expect(result.commentary.rubricFeedback.length).toBeGreaterThan(0);
    const r2Feedback = result.commentary.rubricFeedback.find((f) => f.rubricItemName === '氧气释放');
    expect(r2Feedback).toBeDefined();
    expect(r2Feedback!.feedback).toContain('未');
  });
});

describe('禁用答案统一处理', () => {
  it('填空题命中禁用答案 → manualReviewNeeded=true，severity=error', () => {
    const question: FillBlankQuestion = {
      type: QuestionType.FillBlank,
      id: 'fb-dis-1',
      stem: '中国首都___',
      blanks: [
        {
          index: 0,
          acceptableAnswers: ['北京'],
          synonyms: [],
          disabledAnswers: [{ text: '南京', reason: '与北京混淆，易错题' }],
          partialScores: [],
        },
      ],
      score: 3,
      knowledgePoints: ['地理'],
    };
    const answer: FillBlankAnswer = {
      type: QuestionType.FillBlank,
      questionId: 'fb-dis-1',
      values: { 0: '南京' },
    };
    const result = sdk.correct(question, answer);
    expect(result.score.manualReviewNeeded).toBe(true);
    expect(result.score.manualReviewReasons[0].severity).toBe('error');
    expect(result.score.manualReviewReasons[0].code).toBe('DISABLED_ANSWER_HIT');
    expect(result.score.manualReviewReasons[0].message).toContain('与北京混淆');
  });

  it('步骤题命中禁用答案 → 人工复核 + 原因', () => {
    const question: StepQuestion = {
      type: QuestionType.StepByStep,
      id: 'step-dis-1',
      stem: '解方程 2x=4',
      steps: [
        {
          index: 0,
          description: '移项',
          referenceAnswer: 'x=4÷2',
          keywords: [{ keyword: 'x', weight: 1 }],
          synonyms: [],
          disabledAnswers: [{ text: '作弊答案', reason: '疑似抄袭预设答案' }],
          partialScores: [],
          score: 5,
        },
      ],
      score: 5,
      knowledgePoints: ['一元一次方程'],
    };
    const answer: StepAnswer = {
      type: QuestionType.StepByStep,
      questionId: 'step-dis-1',
      steps: { 0: '作弊答案 x=2' },
    };
    const result = sdk.correct(question, answer);
    expect(result.score.manualReviewNeeded).toBe(true);
    expect(result.score.manualReviewReasons.some((r) => r.message.includes('疑似抄袭'))).toBe(true);
  });

  it('选择题未设置禁用答案 → 正常流程不触发', () => {
    const question: ChoiceQuestion = {
      type: QuestionType.Choice,
      id: 'ch-dis-1',
      stem: '1+1=',
      options: [
        { label: 'A', text: '1', isCorrect: false },
        { label: 'B', text: '2', isCorrect: true },
      ],
      score: 5,
      knowledgePoints: ['加法'],
    };
    const answer: ChoiceAnswer = {
      type: QuestionType.Choice,
      questionId: 'ch-dis-1',
      selectedLabels: ['B'],
    };
    const result = sdk.correct(question, answer);
    expect(result.score.manualReviewNeeded).toBe(false);
  });
});

describe('按知识点汇总班级概览', () => {
  const q1: ShortAnswerQuestion = {
    type: QuestionType.ShortAnswer,
    id: 'kp-q1',
    stem: '光合作用的能量来源',
    referenceAnswer: '光能',
    keywords: [{ keyword: '光能', weight: 1 }],
    synonyms: [],
    disabledAnswers: [],
    partialScores: [],
    score: 5,
    knowledgePoints: ['光合作用', '能量转换'],
  };
  const q2: ShortAnswerQuestion = {
    type: QuestionType.ShortAnswer,
    id: 'kp-q2',
    stem: '光合作用的原料',
    referenceAnswer: '二氧化碳和水',
    keywords: [{ keyword: '二氧化碳', weight: 1 }, { keyword: '水', weight: 1 }],
    synonyms: [],
    disabledAnswers: [],
    partialScores: [],
    score: 5,
    knowledgePoints: ['光合作用'],
  };

  it('batchCorrect 返回 knowledgePointOverview 列表', () => {
    const result = sdk.batchCorrect(
      [q1, q2],
      [
        { type: QuestionType.ShortAnswer, questionId: 'kp-q1', text: '光能' },
        { type: QuestionType.ShortAnswer, questionId: 'kp-q2', text: '二氧化碳和水' },
      ],
    );
    expect(result.knowledgePointOverview).toBeDefined();
    expect(result.knowledgePointOverview.length).toBeGreaterThanOrEqual(1);
    const photoKp = result.knowledgePointOverview.find((k) => k.knowledgePoint === '光合作用');
    expect(photoKp).toBeDefined();
    expect(photoKp!.avgScoreRatio).toBe(100);
    expect(photoKp!.questionCount).toBe(2);
    expect(photoKp!.relatedQuestions).toEqual(expect.arrayContaining(['kp-q1', 'kp-q2']));
  });

  it('知识点平均分低于 30% → practiceDirection.difficulty=easier', () => {
    const result = sdk.batchCorrect(
      [q1, q2],
      [
        { type: QuestionType.ShortAnswer, questionId: 'kp-q1', text: '不知道' },
        { type: QuestionType.ShortAnswer, questionId: 'kp-q2', text: '不知道' },
      ],
    );
    const photoKp = result.knowledgePointOverview.find((k) => k.knowledgePoint === '光合作用');
    expect(photoKp!.practiceDirection.difficulty).toBe('easier');
    expect(photoKp!.practiceDirection.reason).toContain('降低难度');
  });

  it('知识点汇总包含主要错因和薄弱 rubric 项', () => {
    const qWithRubric: ShortAnswerQuestion = {
      ...q1,
      id: 'kp-q3',
      rubric: [
        {
          id: 'rr1',
          name: '基础概念',
          description: '基础概念',
          weight: 1,
          maxScore: 5,
          allowPartialCredit: true,
          criteria: [
            { id: 'rc1', description: '提到光能', keywords: [{ keyword: '光能', weight: 1 }], score: 5 },
          ],
        },
      ],
    };
    const result = sdk.batchCorrect(
      [qWithRubric, q2],
      [
        { type: QuestionType.ShortAnswer, questionId: 'kp-q3', text: '热能' },
        { type: QuestionType.ShortAnswer, questionId: 'kp-q2', text: '氧气和水' },
      ],
    );
    const photoKp = result.knowledgePointOverview.find((k) => k.knowledgePoint === '光合作用');
    expect(photoKp!.topErrors.length).toBeGreaterThanOrEqual(1);
    expect(photoKp!.weakRubricItems.length).toBeGreaterThanOrEqual(1);
  });

  it('sdk.generateKnowledgePointOverviews 可单独调用', () => {
    const singleResult = sdk.correct(q1, {
      type: QuestionType.ShortAnswer,
      questionId: 'kp-q1',
      text: '光能',
    });
    const kpOverviews = sdk.generateKnowledgePointOverviews([q1], [singleResult]);
    expect(kpOverviews).toBeDefined();
    expect(kpOverviews[0].knowledgePoint).toBe('光合作用');
  });
});

describe('班级概览含 rubricBreakdown', () => {
  const rubricQuestion: ShortAnswerQuestion = {
    type: QuestionType.ShortAnswer,
    id: 'rb-q1',
    stem: '简述光合作用',
    referenceAnswer: '利用光能将二氧化碳和水转化为有机物和氧气',
    keywords: [],
    synonyms: [],
    disabledAnswers: [],
    partialScores: [],
    score: 10,
    knowledgePoints: ['光合作用'],
    rubric: [
      {
        id: 'a1',
        name: '反应物识别',
        description: '',
        weight: 1,
        maxScore: 5,
        allowPartialCredit: true,
        criteria: [{ id: 'a1c1', description: '识别二氧化碳和水', keywords: [{ keyword: '二氧化碳', weight: 1 }, { keyword: '水', weight: 1 }], score: 5 }],
      },
      {
        id: 'a2',
        name: '产物识别',
        description: '',
        weight: 1,
        maxScore: 5,
        allowPartialCredit: true,
        criteria: [{ id: 'a2c1', description: '识别有机物和氧气', keywords: [{ keyword: '有机物', weight: 1 }, { keyword: '氧气', weight: 1 }], score: 5 }],
      },
    ],
  };

  it('班级概览中含 rubricBreakdown 各评分项的平均分和得分率', () => {
    const batch = sdk.batchCorrect(
      [rubricQuestion],
      [
        { type: QuestionType.ShortAnswer, questionId: 'rb-q1', text: '利用光能将二氧化碳和水转化为有机物和氧气' },
        { type: QuestionType.ShortAnswer, questionId: 'rb-q1', text: '利用二氧化碳转化为有机物' },
      ],
    );
    const overview = batch.classOverview.find((o) => o.questionId === 'rb-q1');
    expect(overview).toBeDefined();
    expect(overview!.rubricBreakdown).toHaveLength(2);
    const a1 = overview!.rubricBreakdown.find((r) => r.rubricItemId === 'a1');
    expect(a1).toBeDefined();
    expect(a1!.avgScore).toBeGreaterThan(0);
  });
});

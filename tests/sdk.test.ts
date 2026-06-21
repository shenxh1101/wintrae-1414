import { CorrectionSDK, createSDK, CorrectionSDKBuilder } from '../src/index';
import { QuestionType, ErrorCategory, ChoiceQuestion, FillBlankQuestion, ShortAnswerQuestion, StepQuestion, ChoiceAnswer, FillBlankAnswer, ShortAnswerAnswer, StepAnswer } from '../src/types';

describe('CorrectionSDK - full pipeline', () => {
  const sdk = createSDK();

  describe('choice question', () => {
    const question: ChoiceQuestion = {
      type: QuestionType.Choice,
      id: 'c1',
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

    it('correct answer returns full score', () => {
      const answer: ChoiceAnswer = { type: QuestionType.Choice, questionId: 'c1', selectedLabels: ['B'] };
      const result = sdk.correct(question, answer);
      expect(result.score.earnedScore).toBe(5);
      expect(result.comparison.overallMatched).toBe(true);
      expect(result.errorClassification.categories.every((c) => c.confidence === 0)).toBe(true);
      expect(result.commentary.summary).toContain('完全正确');
    });

    it('wrong answer returns zero and error classification', () => {
      const answer: ChoiceAnswer = { type: QuestionType.Choice, questionId: 'c1', selectedLabels: ['A'] };
      const result = sdk.correct(question, answer);
      expect(result.score.earnedScore).toBe(0);
      expect(result.comparison.overallMatched).toBe(false);
    });
  });

  describe('fill blank question', () => {
    const question: FillBlankQuestion = {
      type: QuestionType.FillBlank,
      id: 'f1',
      stem: '水的化学式是___。',
      blanks: [
        {
          index: 0,
          acceptableAnswers: ['H2O'],
          synonyms: [['h2o']],
          disabledAnswers: [],
          partialScores: [],
        },
      ],
      score: 3,
      knowledgePoints: ['化学基础'],
    };

    it('correct answer', () => {
      const answer: FillBlankAnswer = { type: QuestionType.FillBlank, questionId: 'f1', values: { 0: 'H2O' } };
      const result = sdk.correct(question, answer);
      expect(result.score.earnedScore).toBe(3);
    });
  });

  describe('short answer question', () => {
    const question: ShortAnswerQuestion = {
      type: QuestionType.ShortAnswer,
      id: 's1',
      stem: '简述光合作用。',
      referenceAnswer: '植物利用光能将二氧化碳和水转化为有机物和氧气',
      keywords: [
        { keyword: '光能', weight: 2 },
        { keyword: '二氧化碳', weight: 2 },
        { keyword: '水', weight: 1 },
        { keyword: '有机物', weight: 2 },
        { keyword: '氧气', weight: 1 },
      ],
      synonyms: [],
      disabledAnswers: [],
      partialScores: [],
      score: 10,
      knowledgePoints: ['光合作用'],
    };

    it('full keyword match', () => {
      const answer: ShortAnswerAnswer = {
        type: QuestionType.ShortAnswer,
        questionId: 's1',
        text: '植物利用光能将二氧化碳和水转化为有机物和氧气',
      };
      const result = sdk.correct(question, answer);
      expect(result.score.earnedScore).toBe(10);
    });

    it('partial keyword match gets partial score', () => {
      const answer: ShortAnswerAnswer = {
        type: QuestionType.ShortAnswer,
        questionId: 's1',
        text: '植物利用光能将二氧化碳转化',
      };
      const result = sdk.correct(question, answer);
      expect(result.score.earnedScore).toBeGreaterThan(0);
      expect(result.score.earnedScore).toBeLessThan(10);
    });
  });

  describe('step-by-step question', () => {
    const question: StepQuestion = {
      type: QuestionType.StepByStep,
      id: 'st1',
      stem: '解方程 2x+4=10',
      steps: [
        {
          index: 0,
          description: '移项',
          referenceAnswer: '2x=10-4=6',
          keywords: [{ keyword: '6', weight: 1 }],
          synonyms: [],
          disabledAnswers: [],
          partialScores: [],
          score: 5,
        },
        {
          index: 1,
          description: '求解',
          referenceAnswer: 'x=6÷2=3',
          keywords: [{ keyword: '3', weight: 1 }],
          synonyms: [],
          disabledAnswers: [],
          partialScores: [],
          score: 5,
        },
      ],
      score: 10,
      knowledgePoints: ['一元一次方程'],
    };

    it('all steps correct', () => {
      const answer: StepAnswer = {
        type: QuestionType.StepByStep,
        questionId: 'st1',
        steps: { 0: '2x=6', 1: 'x=3' },
      };
      const result = sdk.correct(question, answer);
      expect(result.score.earnedScore).toBe(10);
    });

    it('calculation error detected', () => {
      const answer: StepAnswer = {
        type: QuestionType.StepByStep,
        questionId: 'st1',
        steps: { 0: '2x=5', 1: 'x=2.5' },
      };
      const result = sdk.correct(question, answer);
      expect(result.score.earnedScore).toBeLessThan(10);
    });
  });
});

describe('CorrectionSDK - batch correct', () => {
  const sdk = createSDK();

  it('batch correct processes multiple answers', () => {
    const questions = [
      {
        type: QuestionType.Choice as const,
        id: 'b1',
        stem: '1+1=?',
        options: [
          { label: 'A', text: '1', isCorrect: false },
          { label: 'B', text: '2', isCorrect: true },
        ],
        score: 5,
        knowledgePoints: ['加法'],
      },
      {
        type: QuestionType.Choice as const,
        id: 'b2',
        stem: '2+2=?',
        options: [
          { label: 'A', text: '3', isCorrect: false },
          { label: 'B', text: '4', isCorrect: true },
        ],
        score: 5,
        knowledgePoints: ['加法'],
      },
    ];

    const answers = [
      { type: QuestionType.Choice as const, questionId: 'b1', selectedLabels: ['B'] },
      { type: QuestionType.Choice as const, questionId: 'b2', selectedLabels: ['B'] },
    ];

    const result = sdk.batchCorrect(questions, answers);
    expect(result.results).toHaveLength(2);
    expect(result.classOverview).toHaveLength(2);
    expect(result.results[0].score.earnedScore).toBe(5);
    expect(result.results[1].score.earnedScore).toBe(5);
  });
});

describe('CorrectionSDKBuilder', () => {
  it('builder creates SDK with custom config', () => {
    const sdk = new CorrectionSDKBuilder()
      .strictMode(true)
      .similarityThreshold(0.9)
      .manualReviewSimilarityFloor(0.85)
      .defaultScoring({ partialCreditEnabled: false })
      .build();

    const config = sdk.getConfig();
    expect(config.strictMode).toBe(true);
    expect(config.similarityThreshold).toBe(0.9);
    expect(config.manualReviewSimilarityFloor).toBe(0.85);
    expect(config.defaultScoring.partialCreditEnabled).toBe(false);
  });
});

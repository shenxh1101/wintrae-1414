import {
  Question,
  QuestionType,
  ComparisonResult,
  ScoreResult,
  HitEvidence,
  SuspiciousItem,
  ManualReviewReason,
  ChoiceQuestion,
  FillBlankQuestion,
  FillBlankItem,
  ShortAnswerQuestion,
  StepQuestion,
  StepItem,
  StudentAnswer,
  FillBlankAnswer,
  ShortAnswerAnswer,
  StepAnswer,
  ChoiceAnswer,
  SDKConfig,
} from '../types';
import { normalize } from './comparator';

function checkDisabledAnswers(
  studentText: string,
  disabledList: string[],
): { hit: boolean; hitContent: string } {
  const normalized = normalize(studentText);
  for (const dis of disabledList) {
    if (normalized.includes(normalize(dis))) {
      return { hit: true, hitContent: dis };
    }
  }
  return { hit: false, hitContent: '' };
}

function scorePartialEntries(
  studentText: string,
  entries: { keywords: string[]; score: number }[],
): { score: number; evidences: HitEvidence[] } {
  let totalScore = 0;
  const evidences: HitEvidence[] = [];
  const normalized = normalize(studentText);

  for (const entry of entries) {
    const allHit = entry.keywords.every((kw) => normalized.includes(normalize(kw)));
    if (allHit && entry.keywords.length > 0) {
      totalScore += entry.score;
      evidences.push({
        rule: 'partial_score',
        matchedContent: entry.keywords.join(' + '),
        scoreAwarded: entry.score,
      });
    }
  }

  return { score: totalScore, evidences };
}

function scoreChoiceQuestion(
  question: ChoiceQuestion,
  answer: ChoiceAnswer,
  comparison: ComparisonResult,
): ScoreResult {
  const hitEvidences: HitEvidence[] = [];
  const suspiciousItems: SuspiciousItem[] = [];
  const manualReviewReasons: ManualReviewReason[] = [];

  if (comparison.overallMatched) {
    hitEvidences.push({
      rule: 'choice_full_match',
      matchedContent: answer.selectedLabels.join(', '),
      scoreAwarded: question.score,
    });
    return {
      questionId: question.id,
      totalScore: question.score,
      earnedScore: question.score,
      hitEvidences,
      suspiciousItems,
      manualReviewNeeded: false,
      manualReviewReasons,
    };
  }

  const correctLabels = question.options.filter((o) => o.isCorrect).map((o) => o.label);
  const selected = new Set(answer.selectedLabels);
  const correct = new Set(correctLabels);

  let correctSelected = 0;
  for (const label of selected) {
    if (correct.has(label)) correctSelected++;
  }

  const isMultiAnswer = correctLabels.length > 1;
  if (isMultiAnswer && correctSelected > 0 && selected.size > correctSelected) {
    const partialScore = Math.round((correctSelected / correctLabels.length) * question.score * 0.5 * 100) / 100;
    hitEvidences.push({
      rule: 'choice_partial_match',
      matchedContent: `选中${correctSelected}/${correctLabels.length}个正确选项，但含错误选项`,
      scoreAwarded: partialScore,
    });
    suspiciousItems.push({
      type: 'possible_guess',
      description: '多选题部分正确且含错误选项',
      content: answer.selectedLabels.join(', '),
    });
    return {
      questionId: question.id,
      totalScore: question.score,
      earnedScore: partialScore,
      hitEvidences,
      suspiciousItems,
      manualReviewNeeded: false,
      manualReviewReasons,
    };
  }

  return {
    questionId: question.id,
    totalScore: question.score,
    earnedScore: 0,
    hitEvidences,
    suspiciousItems,
    manualReviewNeeded: false,
    manualReviewReasons,
  };
}

function scoreFillBlankItem(
  blank: FillBlankItem,
  studentValue: string,
  detailIndex: number,
  comparisonDetail: { similarity: number; matched: boolean },
): { score: number; evidences: HitEvidence[]; suspicious: SuspiciousItem[]; reviewNeeded: ManualReviewReason[] } {
  const evidences: HitEvidence[] = [];
  const suspicious: SuspiciousItem[] = [];
  const reviewNeeded: ManualReviewReason[] = [];

  const disabled = checkDisabledAnswers(studentValue, blank.disabledAnswers);
  if (disabled.hit) {
    evidences.push({
      rule: 'disabled_answer',
      matchedContent: disabled.hitContent,
      scoreAwarded: 0,
    });
    suspicious.push({
      type: 'disabled_hit',
      description: `空${detailIndex + 1}命中禁用答案`,
      content: disabled.hitContent,
    });
    return { score: 0, evidences, suspicious, reviewNeeded };
  }

  if (comparisonDetail.matched) {
    evidences.push({
      rule: 'fill_blank_exact_match',
      matchedContent: studentValue,
      scoreAwarded: blank.partialScores.length > 0
        ? Math.max(...blank.partialScores.map((p) => p.score))
        : 1,
    });
    return { score: blank.partialScores.length > 0 ? Math.max(...blank.partialScores.map((p) => p.score)) : 1, evidences, suspicious, reviewNeeded };
  }

  const partialResult = scorePartialEntries(studentValue, blank.partialScores);
  evidences.push(...partialResult.evidences);

  if (comparisonDetail.similarity >= 0.7 && comparisonDetail.similarity < 1) {
    suspicious.push({
      type: 'ambiguous_answer',
      description: `空${detailIndex + 1}答案与参考答案高度相似但不完全匹配`,
      content: studentValue,
    });
    reviewNeeded.push({
      code: 'SIMILAR_BUT_NOT_MATCH',
      message: `空${detailIndex + 1}: 相似度 ${comparisonDetail.similarity.toFixed(2)}，建议人工复核`,
    });
  }

  return { score: partialResult.score, evidences, suspicious, reviewNeeded };
}

function scoreFillBlankQuestion(
  question: FillBlankQuestion,
  answer: FillBlankAnswer,
  comparison: ComparisonResult,
): ScoreResult {
  const hitEvidences: HitEvidence[] = [];
  const suspiciousItems: SuspiciousItem[] = [];
  const manualReviewReasons: ManualReviewReason[] = [];
  let earnedScore = 0;

  const maxPossiblePerBlank = question.blanks.map((b) =>
    b.partialScores.length > 0 ? Math.max(...b.partialScores.map((p) => p.score)) : 1,
  );
  const totalMaxScore = maxPossiblePerBlank.reduce((s, v) => s + v, 0);
  const scale = totalMaxScore > 0 ? question.score / totalMaxScore : 1;

  for (let i = 0; i < question.blanks.length; i++) {
    const blank = question.blanks[i];
    const studentValue = answer.values[blank.index] ?? '';
    const detail = comparison.details[i] ?? { similarity: 0, matched: false };
    const result = scoreFillBlankItem(blank, studentValue, i, detail);

    earnedScore += result.score * scale;
    hitEvidences.push(...result.evidences);
    suspiciousItems.push(...result.suspicious);
    manualReviewReasons.push(...result.reviewNeeded);
  }

  earnedScore = Math.round(earnedScore * 100) / 100;
  const manualReviewNeeded = manualReviewReasons.length > 0;

  return {
    questionId: question.id,
    totalScore: question.score,
    earnedScore,
    hitEvidences,
    suspiciousItems,
    manualReviewNeeded,
    manualReviewReasons,
  };
}

function scoreShortAnswerQuestion(
  question: ShortAnswerQuestion,
  answer: ShortAnswerAnswer,
  comparison: ComparisonResult,
  config: SDKConfig,
): ScoreResult {
  const hitEvidences: HitEvidence[] = [];
  const suspiciousItems: SuspiciousItem[] = [];
  const manualReviewReasons: ManualReviewReason[] = [];

  const disabled = checkDisabledAnswers(answer.text, question.disabledAnswers);
  if (disabled.hit) {
    hitEvidences.push({
      rule: 'disabled_answer',
      matchedContent: disabled.hitContent,
      scoreAwarded: 0,
    });
    suspiciousItems.push({
      type: 'disabled_hit',
      description: '命中禁用答案',
      content: disabled.hitContent,
    });
    return {
      questionId: question.id,
      totalScore: question.score,
      earnedScore: 0,
      hitEvidences,
      suspiciousItems,
      manualReviewNeeded: true,
      manualReviewReasons: [{ code: 'DISABLED_ANSWER', message: '答案命中禁用词表，需人工确认是否抄袭或违规' }],
    };
  }

  if (comparison.overallMatched) {
    hitEvidences.push({
      rule: 'short_answer_full_match',
      matchedContent: answer.text,
      scoreAwarded: question.score,
    });
    return {
      questionId: question.id,
      totalScore: question.score,
      earnedScore: question.score,
      hitEvidences,
      suspiciousItems,
      manualReviewNeeded: false,
      manualReviewReasons,
    };
  }

  let earnedScore = 0;

  const keywordEvidences: HitEvidence[] = [];
  const normalized = normalize(answer.text);
  let totalWeight = 0;
  let hitWeight = 0;
  for (const kw of question.keywords) {
    totalWeight += kw.weight;
    if (normalized.includes(normalize(kw.keyword))) {
      hitWeight += kw.weight;
      keywordEvidences.push({
        rule: 'keyword_match',
        matchedContent: kw.keyword,
        scoreAwarded: 0,
      });
    }
  }

  if (totalWeight > 0) {
    const keywordRatio = hitWeight / totalWeight;
    const keywordScore = Math.round(keywordRatio * question.score * 100) / 100;
    earnedScore += keywordScore;
    for (const ev of keywordEvidences) {
      ev.scoreAwarded = Math.round((keywordScore / keywordEvidences.length) * 100) / 100;
    }
    hitEvidences.push(...keywordEvidences);
  }

  const partialResult = scorePartialEntries(answer.text, question.partialScores);
  if (partialResult.score > 0) {
    earnedScore += partialResult.score;
    hitEvidences.push(...partialResult.evidences);
  }

  earnedScore = Math.min(Math.round(earnedScore * 100) / 100, question.score);

  if (comparison.overallSimilarity >= config.manualReviewSimilarityFloor && comparison.overallSimilarity < 1) {
    suspiciousItems.push({
      type: 'ambiguous_answer',
      description: '答案与参考答案高度相似但不完全匹配',
      content: answer.text,
    });
    manualReviewReasons.push({
      code: 'SIMILAR_BUT_NOT_MATCH',
      message: `相似度 ${comparison.overallSimilarity.toFixed(2)}，建议人工复核`,
    });
  }

  if (earnedScore > 0 && earnedScore < question.score * 0.5) {
    suspiciousItems.push({
      type: 'possible_guess',
      description: '得分较低但获得部分分数，可能存在猜测',
      content: answer.text,
    });
  }

  return {
    questionId: question.id,
    totalScore: question.score,
    earnedScore,
    hitEvidences,
    suspiciousItems,
    manualReviewNeeded: manualReviewReasons.length > 0,
    manualReviewReasons,
  };
}

function scoreStepItem(
  step: StepItem,
  studentStep: string,
  detail: { similarity: number; matched: boolean },
): { score: number; evidences: HitEvidence[]; suspicious: SuspiciousItem[]; reviewNeeded: ManualReviewReason[] } {
  const evidences: HitEvidence[] = [];
  const suspicious: SuspiciousItem[] = [];
  const reviewNeeded: ManualReviewReason[] = [];

  const disabled = checkDisabledAnswers(studentStep, step.disabledAnswers);
  if (disabled.hit) {
    evidences.push({
      rule: 'disabled_answer',
      matchedContent: disabled.hitContent,
      scoreAwarded: 0,
    });
    suspicious.push({
      type: 'disabled_hit',
      description: `步骤${step.index}命中禁用答案`,
      content: disabled.hitContent,
    });
    return { score: 0, evidences, suspicious, reviewNeeded };
  }

  if (detail.matched) {
    evidences.push({
      rule: 'step_full_match',
      matchedContent: studentStep,
      scoreAwarded: step.score,
    });
    return { score: step.score, evidences, suspicious, reviewNeeded };
  }

  let earnedScore = 0;
  const normalized = normalize(studentStep);
  let totalWeight = 0;
  let hitWeight = 0;

  for (const kw of step.keywords) {
    totalWeight += kw.weight;
    if (normalized.includes(normalize(kw.keyword))) {
      hitWeight += kw.weight;
      evidences.push({
        rule: 'step_keyword_match',
        matchedContent: kw.keyword,
        scoreAwarded: 0,
      });
    }
  }

  if (totalWeight > 0 && hitWeight > 0) {
    earnedScore = Math.round((hitWeight / totalWeight) * step.score * 100) / 100;
    for (const ev of evidences) {
      if (ev.rule === 'step_keyword_match') {
        ev.scoreAwarded = Math.round((earnedScore / evidences.filter((e) => e.rule === 'step_keyword_match').length) * 100) / 100;
      }
    }
  }

  const partialResult = scorePartialEntries(studentStep, step.partialScores);
  earnedScore += partialResult.score;
  evidences.push(...partialResult.evidences);

  earnedScore = Math.min(Math.round(earnedScore * 100) / 100, step.score);

  if (detail.similarity >= 0.7 && detail.similarity < 1) {
    suspicious.push({
      type: 'ambiguous_answer',
      description: `步骤${step.index}与参考答案相似但不完全匹配`,
      content: studentStep,
    });
    reviewNeeded.push({
      code: 'STEP_SIMILAR_NOT_MATCH',
      message: `步骤${step.index}: 相似度 ${detail.similarity.toFixed(2)}`,
    });
  }

  return { score: earnedScore, evidences, suspicious, reviewNeeded };
}

function scoreStepByStepQuestion(
  question: StepQuestion,
  answer: StepAnswer,
  comparison: ComparisonResult,
): ScoreResult {
  const hitEvidences: HitEvidence[] = [];
  const suspiciousItems: SuspiciousItem[] = [];
  const manualReviewReasons: ManualReviewReason[] = [];
  let earnedScore = 0;

  for (let i = 0; i < question.steps.length; i++) {
    const step = question.steps[i];
    const studentStep = answer.steps[step.index] ?? '';
    const detail = comparison.details[i] ?? { similarity: 0, matched: false };
    const result = scoreStepItem(step, studentStep, detail);

    earnedScore += result.score;
    hitEvidences.push(...result.evidences);
    suspiciousItems.push(...result.suspicious);
    manualReviewReasons.push(...result.reviewNeeded);
  }

  earnedScore = Math.min(Math.round(earnedScore * 100) / 100, question.score);

  return {
    questionId: question.id,
    totalScore: question.score,
    earnedScore,
    hitEvidences,
    suspiciousItems,
    manualReviewNeeded: manualReviewReasons.length > 0,
    manualReviewReasons,
  };
}

export function score(
  question: Question,
  answer: StudentAnswer,
  comparison: ComparisonResult,
  config: SDKConfig,
): ScoreResult {
  switch (question.type) {
    case QuestionType.Choice:
      return scoreChoiceQuestion(question as ChoiceQuestion, answer as ChoiceAnswer, comparison);
    case QuestionType.FillBlank:
      return scoreFillBlankQuestion(question as FillBlankQuestion, answer as FillBlankAnswer, comparison);
    case QuestionType.ShortAnswer:
      return scoreShortAnswerQuestion(question as ShortAnswerQuestion, answer as ShortAnswerAnswer, comparison, config);
    case QuestionType.StepByStep:
      return scoreStepByStepQuestion(question as StepQuestion, answer as StepAnswer, comparison);
    default:
      throw new Error(`不支持的题目类型: ${(question as Question).type}`);
  }
}

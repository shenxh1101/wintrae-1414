import {
  Question,
  QuestionType,
  ComparisonResult,
  ScoreResult,
  HitEvidence,
  SuspiciousItem,
  ManualReviewReason,
  RubricItem,
  RubricScoreDetail,
  RubricCriterion,
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
  DisabledAnswer,
  KeywordEntry,
} from '../types';
import { normalize, matchKeywordWithSynonyms } from './comparator';

const DISABLED_HIT_CODE = 'DISABLED_ANSWER_HIT';

function checkDisabledAnswers(
  studentText: string,
  disabledList: DisabledAnswer[],
): { hit: boolean; disabledAnswer?: DisabledAnswer } {
  const normalized = normalize(studentText);
  for (const dis of disabledList) {
    if (normalized.includes(normalize(typeof dis === 'string' ? dis : dis.text))) {
      const item = typeof dis === 'string' ? { text: dis, reason: '命中禁用答案词表' } : dis;
      return { hit: true, disabledAnswer: item };
    }
  }
  return { hit: false };
}

function toDisabledList(list: (DisabledAnswer | string)[] | undefined): DisabledAnswer[] {
  if (!list) return [];
  return list.map((d) => (typeof d === 'string' ? { text: d, reason: '命中禁用答案词表' } : d));
}

function scorePartialEntries(
  studentText: string,
  entries: { keywords: string[]; score: number }[],
  rubricItemId?: string,
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
        rubricItemId,
      });
    }
  }

  return { score: totalScore, evidences };
}

function scoreKeywords(
  studentText: string,
  keywords: KeywordEntry[],
  rubricItemId?: string,
): {
  totalWeight: number;
  hitWeight: number;
  scoreRatio: number;
  evidences: HitEvidence[];
} {
  let totalWeight = 0;
  let hitWeight = 0;
  const evidences: HitEvidence[] = [];

  for (const kw of keywords) {
    totalWeight += kw.weight;
    const kwMatch = matchKeywordWithSynonyms(studentText, kw);
    if (kwMatch.matched) {
      hitWeight += kw.weight;
      const evidence: HitEvidence = {
        rule: 'keyword_match',
        matchedContent: kwMatch.synonym
          ? `${kw.keyword} ← 同义词 "${kwMatch.synonym}"`
          : kw.keyword,
        scoreAwarded: 0,
        rubricItemId,
      };
      if (kwMatch.synonym) {
        evidence.matchedViaSynonym = { canonical: kw.keyword, synonym: kwMatch.synonym };
      }
      evidences.push(evidence);
    }
  }

  const scoreRatio = totalWeight > 0 ? hitWeight / totalWeight : 0;
  for (const ev of evidences) {
    const kw = keywords.find(
      (k) => k.keyword === ev.matchedContent.split(' ← ')[0] || k.keyword === ev.matchedContent,
    );
    if (kw) {
      ev.scoreAwarded = Math.round((kw.weight / totalWeight) * 100) / 100;
    }
  }

  return { totalWeight, hitWeight, scoreRatio, evidences };
}

function applyRubric(
  studentText: string,
  rubricItems: RubricItem[] | undefined,
  maxTotalScore: number,
  defaultPartialCreditEnabled: boolean,
): { rubricScores: RubricScoreDetail[]; totalEarned: number; allEvidences: HitEvidence[] } {
  const rubricScores: RubricScoreDetail[] = [];
  let totalEarned = 0;
  const allEvidences: HitEvidence[] = [];

  if (!rubricItems || rubricItems.length === 0) {
    return { rubricScores, totalEarned, allEvidences };
  }

  const totalRubricMax = rubricItems.reduce((s, r) => s + r.maxScore, 0) || 1;

  for (const rubric of rubricItems) {
    const allowPartial = rubric.allowPartialCredit ?? defaultPartialCreditEnabled;
    const criterionScores: { criterionId: string; earned: boolean; scoreAwarded: number }[] = [];
    const rubricEvidences: HitEvidence[] = [];
    let rubricEarned = 0;

    for (const criterion of rubric.criteria) {
      const kwResult = scoreKeywords(studentText, criterion.keywords, rubric.id);
      const allKeywordsHit = kwResult.hitWeight === kwResult.totalWeight && kwResult.totalWeight > 0;
      const partialHit = kwResult.scoreRatio > 0;

      let earned = false;
      let awarded = 0;

      if (allowPartial) {
        awarded = Math.round(criterion.score * kwResult.scoreRatio * 100) / 100;
        earned = partialHit;
      } else {
        awarded = allKeywordsHit ? criterion.score : 0;
        earned = allKeywordsHit;
      }

      criterionScores.push({ criterionId: criterion.id, earned, scoreAwarded: awarded });
      rubricEarned += awarded;

      for (const ev of kwResult.evidences) {
        ev.scoreAwarded = Math.round(awarded * (kwResult.scoreRatio > 0 ? kwResult.scoreRatio : 1) * 100) / 100;
        rubricEvidences.push(ev);
        allEvidences.push(ev);
      }

      if (earned && kwResult.evidences.length === 0) {
        const perfectEv: HitEvidence = {
          rule: 'rubric_criterion_full',
          matchedContent: criterion.description,
          scoreAwarded: awarded,
          rubricItemId: rubric.id,
        };
        rubricEvidences.push(perfectEv);
        allEvidences.push(perfectEv);
      }
    }

    rubricEarned = Math.min(rubricEarned, rubric.maxScore);

    const detail: RubricScoreDetail = {
      rubricItemId: rubric.id,
      rubricItemName: rubric.name,
      maxScore: rubric.maxScore,
      earnedScore: rubricEarned,
      allowPartialCredit: allowPartial,
      criteriaScores: criterionScores,
      hitEvidences: rubricEvidences,
    };
    rubricScores.push(detail);
    totalEarned += (rubricEarned / totalRubricMax) * maxTotalScore;
  }

  return {
    rubricScores,
    totalEarned: Math.round(totalEarned * 100) / 100,
    allEvidences,
  };
}

function scoreChoiceQuestion(
  question: ChoiceQuestion,
  answer: ChoiceAnswer,
  comparison: ComparisonResult,
  config: SDKConfig,
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
    const rubric = applyRubric(
      answer.selectedLabels.join(' '),
      question.rubric,
      question.score,
      config.defaultScoring.partialCreditEnabled,
    );
    return {
      questionId: question.id,
      totalScore: question.score,
      earnedScore: Math.max(question.score, rubric.totalEarned),
      hitEvidences: [...hitEvidences, ...rubric.allEvidences],
      rubricScores: rubric.rubricScores,
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
      rubricScores: [],
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
    rubricScores: [],
    suspiciousItems,
    manualReviewNeeded: false,
    manualReviewReasons,
  };
}

function scoreFillBlankItem(
  blank: FillBlankItem,
  studentValue: string,
  detailIndex: number,
  comparisonDetail: { similarity: number; matched: boolean; matchedSynonym?: { canonical: string; synonym: string } },
  config: SDKConfig,
): { score: number; evidences: HitEvidence[]; suspicious: SuspiciousItem[]; reviewNeeded: ManualReviewReason[] } {
  const evidences: HitEvidence[] = [];
  const suspicious: SuspiciousItem[] = [];
  const reviewNeeded: ManualReviewReason[] = [];

  const disabledList = toDisabledList(blank.disabledAnswers as any);
  const disabled = checkDisabledAnswers(studentValue, disabledList);
  if (disabled.hit && disabled.disabledAnswer) {
    evidences.push({
      rule: 'disabled_answer',
      matchedContent: disabled.disabledAnswer.text,
      scoreAwarded: 0,
    });
    suspicious.push({
      type: 'disabled_hit',
      description: `空${detailIndex + 1}命中禁用答案：${disabled.disabledAnswer.reason}`,
      content: disabled.disabledAnswer.text,
    });
    reviewNeeded.push({
      code: DISABLED_HIT_CODE,
      message: `空${detailIndex + 1}命中禁用答案 "${disabled.disabledAnswer.text}"，原因：${disabled.disabledAnswer.reason}，需人工确认是否违规`,
      severity: 'error',
    });
    return { score: 0, evidences, suspicious, reviewNeeded };
  }

  if (comparisonDetail.matched) {
    const matchedContent = comparisonDetail.matchedSynonym
      ? `${studentValue} ← 同义词 "${comparisonDetail.matchedSynonym.synonym}"（规范为 "${comparisonDetail.matchedSynonym.canonical}"）`
      : studentValue;
    const evidence: HitEvidence = {
      rule: 'fill_blank_exact_match',
      matchedContent,
      scoreAwarded: blank.partialScores.length > 0
        ? Math.max(...blank.partialScores.map((p) => p.score))
        : 1,
    };
    if (comparisonDetail.matchedSynonym) {
      evidence.matchedViaSynonym = comparisonDetail.matchedSynonym;
    }
    evidences.push(evidence);
    return {
      score: blank.partialScores.length > 0 ? Math.max(...blank.partialScores.map((p) => p.score)) : 1,
      evidences,
      suspicious,
      reviewNeeded,
    };
  }

  if (config.defaultScoring.partialCreditEnabled) {
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
        severity: 'warning',
      });
    }
    return { score: partialResult.score, evidences, suspicious, reviewNeeded };
  }

  return { score: 0, evidences, suspicious, reviewNeeded };
}

function scoreFillBlankQuestion(
  question: FillBlankQuestion,
  answer: FillBlankAnswer,
  comparison: ComparisonResult,
  config: SDKConfig,
): ScoreResult {
  const hitEvidences: HitEvidence[] = [];
  const suspiciousItems: SuspiciousItem[] = [];
  const manualReviewReasons: ManualReviewReason[] = [];
  let earnedScore = 0;

  const disabledList = toDisabledList(question.blanks.flatMap((b) => (b.disabledAnswers as any) ?? []));
  const allAnswersText = Object.values(answer.values).join(' ');
  const globalDisabled = checkDisabledAnswers(allAnswersText, disabledList);
  if (globalDisabled.hit && globalDisabled.disabledAnswer) {
    manualReviewReasons.push({
      code: DISABLED_HIT_CODE,
      message: `填空题命中禁用答案 "${globalDisabled.disabledAnswer.text}"，原因：${globalDisabled.disabledAnswer.reason}，需人工确认`,
      severity: 'error',
    });
    suspiciousItems.push({
      type: 'disabled_hit',
      description: globalDisabled.disabledAnswer.reason,
      content: globalDisabled.disabledAnswer.text,
    });
  }

  const maxPossiblePerBlank = question.blanks.map((b) =>
    b.partialScores.length > 0 ? Math.max(...b.partialScores.map((p) => p.score)) : 1,
  );
  const totalMaxScore = maxPossiblePerBlank.reduce((s, v) => s + v, 0);
  const scale = totalMaxScore > 0 ? question.score / totalMaxScore : 1;

  for (let i = 0; i < question.blanks.length; i++) {
    const blank = question.blanks[i];
    const studentValue = answer.values[blank.index] ?? '';
    const detail = comparison.details[i] ?? { similarity: 0, matched: false };
    const result = scoreFillBlankItem(blank, studentValue, i, detail, config);

    earnedScore += result.score * scale;
    hitEvidences.push(...result.evidences);
    suspiciousItems.push(...result.suspicious);
    manualReviewReasons.push(...result.reviewNeeded);
  }

  const rubric = applyRubric(
    allAnswersText,
    question.rubric,
    question.score,
    config.defaultScoring.partialCreditEnabled,
  );

  earnedScore = Math.max(Math.round(earnedScore * 100) / 100, rubric.totalEarned);
  hitEvidences.push(...rubric.allEvidences);
  const manualReviewNeeded = manualReviewReasons.length > 0;

  return {
    questionId: question.id,
    totalScore: question.score,
    earnedScore: Math.min(earnedScore, question.score),
    hitEvidences,
    rubricScores: rubric.rubricScores,
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

  const disabledList = toDisabledList(question.disabledAnswers as any);
  const disabled = checkDisabledAnswers(answer.text, disabledList);
  if (disabled.hit && disabled.disabledAnswer) {
    hitEvidences.push({
      rule: 'disabled_answer',
      matchedContent: disabled.disabledAnswer.text,
      scoreAwarded: 0,
    });
    suspiciousItems.push({
      type: 'disabled_hit',
      description: disabled.disabledAnswer.reason,
      content: disabled.disabledAnswer.text,
    });
    manualReviewReasons.push({
      code: DISABLED_HIT_CODE,
      message: `简答题命中禁用答案 "${disabled.disabledAnswer.text}"，原因：${disabled.disabledAnswer.reason}，需人工确认是否抄袭或违规`,
      severity: 'error',
    });
    const rubric = applyRubric(
      answer.text,
      question.rubric,
      question.score,
      config.defaultScoring.partialCreditEnabled,
    );
    return {
      questionId: question.id,
      totalScore: question.score,
      earnedScore: 0,
      hitEvidences: [...hitEvidences, ...rubric.allEvidences],
      rubricScores: rubric.rubricScores,
      suspiciousItems,
      manualReviewNeeded: true,
      manualReviewReasons,
    };
  }

  if (comparison.overallMatched) {
    const ev: HitEvidence = {
      rule: 'short_answer_full_match',
      matchedContent: answer.text,
      scoreAwarded: question.score,
    };
    if (comparison.matchedSynonyms && comparison.matchedSynonyms.length > 0) {
      ev.matchedContent += `（通过同义词命中：${comparison.matchedSynonyms.map((s) => s.synonym).join('、')}）`;
    }
    hitEvidences.push(ev);
    const kwResult = scoreKeywords(answer.text, question.keywords);
    hitEvidences.push(...kwResult.evidences);
    const rubric = applyRubric(
      answer.text,
      question.rubric,
      question.score,
      config.defaultScoring.partialCreditEnabled,
    );
    return {
      questionId: question.id,
      totalScore: question.score,
      earnedScore: question.score,
      hitEvidences: [...hitEvidences, ...rubric.allEvidences],
      rubricScores: rubric.rubricScores,
      suspiciousItems,
      manualReviewNeeded: manualReviewReasons.length > 0,
      manualReviewReasons,
    };
  }

  let earnedScore = 0;

  if (config.defaultScoring.partialCreditEnabled) {
    const kwResult = scoreKeywords(answer.text, question.keywords);
    const keywordScore = kwResult.totalWeight > 0
      ? Math.round((kwResult.hitWeight / kwResult.totalWeight) * question.score * 100) / 100
      : 0;
    earnedScore += keywordScore;
    hitEvidences.push(...kwResult.evidences);
  }

  if (config.defaultScoring.partialCreditEnabled) {
    const partialResult = scorePartialEntries(answer.text, question.partialScores);
    if (partialResult.score > 0) {
      earnedScore += partialResult.score;
      hitEvidences.push(...partialResult.evidences);
    }
  }

  const rubric = applyRubric(
    answer.text,
    question.rubric,
    question.score,
    config.defaultScoring.partialCreditEnabled,
  );
  earnedScore = Math.max(earnedScore, rubric.totalEarned);
  hitEvidences.push(...rubric.allEvidences);

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
      severity: 'warning',
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
    rubricScores: rubric.rubricScores,
    suspiciousItems,
    manualReviewNeeded: manualReviewReasons.length > 0,
    manualReviewReasons,
  };
}

function scoreStepItem(
  step: StepItem,
  studentStep: string,
  detail: { similarity: number; matched: boolean; matchedSynonym?: { canonical: string; synonym: string } },
  config: SDKConfig,
): { score: number; evidences: HitEvidence[]; suspicious: SuspiciousItem[]; reviewNeeded: ManualReviewReason[] } {
  const evidences: HitEvidence[] = [];
  const suspicious: SuspiciousItem[] = [];
  const reviewNeeded: ManualReviewReason[] = [];

  const disabledList = toDisabledList(step.disabledAnswers as any);
  const disabled = checkDisabledAnswers(studentStep, disabledList);
  if (disabled.hit && disabled.disabledAnswer) {
    evidences.push({
      rule: 'disabled_answer',
      matchedContent: disabled.disabledAnswer.text,
      scoreAwarded: 0,
    });
    suspicious.push({
      type: 'disabled_hit',
      description: `步骤${step.index}命中禁用答案：${disabled.disabledAnswer.reason}`,
      content: disabled.disabledAnswer.text,
    });
    reviewNeeded.push({
      code: DISABLED_HIT_CODE,
      message: `步骤${step.index}命中禁用答案 "${disabled.disabledAnswer.text}"，原因：${disabled.disabledAnswer.reason}，需人工确认`,
      severity: 'error',
    });
    return { score: 0, evidences, suspicious, reviewNeeded };
  }

  if (detail.matched) {
    const ev: HitEvidence = {
      rule: 'step_full_match',
      matchedContent: detail.matchedSynonym
        ? `${studentStep} ← 同义词 "${detail.matchedSynonym.synonym}"`
        : studentStep,
      scoreAwarded: step.score,
    };
    if (detail.matchedSynonym) ev.matchedViaSynonym = detail.matchedSynonym;
    evidences.push(ev);
    return { score: step.score, evidences, suspicious, reviewNeeded };
  }

  let earnedScore = 0;

  if (config.defaultScoring.partialCreditEnabled) {
    const kwResult = scoreKeywords(studentStep, step.keywords);
    if (kwResult.totalWeight > 0) {
      earnedScore = Math.round((kwResult.hitWeight / kwResult.totalWeight) * step.score * 100) / 100;
    }
    evidences.push(...kwResult.evidences);
  }

  if (config.defaultScoring.partialCreditEnabled) {
    const partialResult = scorePartialEntries(studentStep, step.partialScores);
    earnedScore += partialResult.score;
    evidences.push(...partialResult.evidences);
  }

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
      severity: 'warning',
    });
  }

  return { score: earnedScore, evidences, suspicious, reviewNeeded };
}

function scoreStepByStepQuestion(
  question: StepQuestion,
  answer: StepAnswer,
  comparison: ComparisonResult,
  config: SDKConfig,
): ScoreResult {
  const hitEvidences: HitEvidence[] = [];
  const suspiciousItems: SuspiciousItem[] = [];
  const manualReviewReasons: ManualReviewReason[] = [];
  let earnedScore = 0;

  const allStepsText = Object.values(answer.steps).join(' ');
  const disabledList = toDisabledList(question.steps.flatMap((s) => (s.disabledAnswers as any) ?? []));
  const globalDisabled = checkDisabledAnswers(allStepsText, disabledList);
  if (globalDisabled.hit && globalDisabled.disabledAnswer) {
    manualReviewReasons.push({
      code: DISABLED_HIT_CODE,
      message: `步骤题命中禁用答案 "${globalDisabled.disabledAnswer.text}"，原因：${globalDisabled.disabledAnswer.reason}，需人工确认`,
      severity: 'error',
    });
    suspiciousItems.push({
      type: 'disabled_hit',
      description: globalDisabled.disabledAnswer.reason,
      content: globalDisabled.disabledAnswer.text,
    });
  }

  for (let i = 0; i < question.steps.length; i++) {
    const step = question.steps[i];
    const studentStep = answer.steps[step.index] ?? '';
    const detail = comparison.details[i] ?? { similarity: 0, matched: false };
    const result = scoreStepItem(step, studentStep, detail, config);

    earnedScore += result.score;
    hitEvidences.push(...result.evidences);
    suspiciousItems.push(...result.suspicious);
    manualReviewReasons.push(...result.reviewNeeded);
  }

  const rubric = applyRubric(
    allStepsText,
    question.rubric,
    question.score,
    config.defaultScoring.partialCreditEnabled,
  );
  earnedScore = Math.max(earnedScore, rubric.totalEarned);
  hitEvidences.push(...rubric.allEvidences);

  earnedScore = Math.min(Math.round(earnedScore * 100) / 100, question.score);

  return {
    questionId: question.id,
    totalScore: question.score,
    earnedScore,
    hitEvidences,
    rubricScores: rubric.rubricScores,
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
      return scoreChoiceQuestion(question as ChoiceQuestion, answer as ChoiceAnswer, comparison, config);
    case QuestionType.FillBlank:
      return scoreFillBlankQuestion(question as FillBlankQuestion, answer as FillBlankAnswer, comparison, config);
    case QuestionType.ShortAnswer:
      return scoreShortAnswerQuestion(question as ShortAnswerQuestion, answer as ShortAnswerAnswer, comparison, config);
    case QuestionType.StepByStep:
      return scoreStepByStepQuestion(question as StepQuestion, answer as StepAnswer, comparison, config);
    default:
      throw new Error(`不支持的题目类型: ${(question as Question).type}`);
  }
}

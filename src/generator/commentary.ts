import {
  Question,
  QuestionType,
  ScoreResult,
  ErrorClassificationResult,
  ErrorCategory,
  StudentCommentary,
  ClassOverviewItem,
  ScoreBand,
  PracticeSuggestion,
  CommentaryResult,
  CorrectionResult,
  KnowledgePointOverview,
  RubricScoreDetail,
} from '../types';

function buildStudentSummary(
  scoreResult: ScoreResult,
  errorClassification: ErrorClassificationResult,
): string {
  const ratio = scoreResult.totalScore > 0 ? scoreResult.earnedScore / scoreResult.totalScore : 0;

  if (ratio >= 1) {
    return '回答完全正确，表现出色！';
  }
  if (ratio >= 0.8) {
    return `获得${scoreResult.earnedScore}/${scoreResult.totalScore}分，接近满分，${errorLabel(errorClassification.dominantCategory)}方面还需注意。`;
  }
  if (ratio >= 0.5) {
    return `获得${scoreResult.earnedScore}/${scoreResult.totalScore}分，基本思路正确，但${errorLabel(errorClassification.dominantCategory)}存在不足。`;
  }
  if (ratio > 0) {
    return `获得${scoreResult.earnedScore}/${scoreResult.totalScore}分，主要问题在于${errorLabel(errorClassification.dominantCategory)}，建议重点复习相关知识点。`;
  }
  return `未得分，${errorLabel(errorClassification.dominantCategory)}问题突出，需要系统学习后重新练习。`;
}

function errorLabel(cat: ErrorCategory): string {
  const labels: Record<ErrorCategory, string> = {
    [ErrorCategory.KnowledgePoint]: '知识点掌握',
    [ErrorCategory.Misread]: '审题',
    [ErrorCategory.Calculation]: '计算',
    [ErrorCategory.Expression]: '表达',
    [ErrorCategory.Omission]: '漏答',
  };
  return labels[cat];
}

function buildStrengths(scoreResult: ScoreResult): string[] {
  const strengths: string[] = [];
  const keywordHits = scoreResult.hitEvidences.filter(
    (e) => e.rule === 'keyword_match' || e.rule === 'step_keyword_match',
  );
  if (keywordHits.length > 0) {
    strengths.push(`关键词命中：${keywordHits.map((e) => e.matchedContent).join('、')}`);
  }
  const synonymHits = scoreResult.hitEvidences.filter((e) => e.matchedViaSynonym);
  if (synonymHits.length > 0) {
    strengths.push(`同义表达识别：${synonymHits.map((e) => `${e.matchedViaSynonym!.canonical} ← ${e.matchedViaSynonym!.synonym}`).join('；')}`);
  }
  const partialHits = scoreResult.hitEvidences.filter((e) => e.rule === 'partial_score');
  if (partialHits.length > 0) {
    strengths.push(`部分得分项：${partialHits.map((e) => e.matchedContent).join('；')}`);
  }
  const stepHits = scoreResult.hitEvidences.filter((e) => e.rule === 'step_full_match');
  if (stepHits.length > 0) {
    strengths.push(`正确步骤：${stepHits.map((e) => e.matchedContent).join('；')}`);
  }
  const fullHits = scoreResult.hitEvidences.filter(
    (e) => e.rule === 'choice_full_match' || e.rule === 'short_answer_full_match' || e.rule === 'fill_blank_exact_match',
  );
  if (fullHits.length > 0) {
    strengths.push(`完全匹配得分：${fullHits.map((e) => e.matchedContent).slice(0, 3).join('；')}`);
  }
  if (strengths.length === 0 && scoreResult.earnedScore > 0) {
    strengths.push('获得了部分分数，说明有一定基础');
  }
  return strengths;
}

function buildImprovements(
  scoreResult: ScoreResult,
  errorClassification: ErrorClassificationResult,
): string[] {
  const improvements: string[] = [];
  const topErrors = errorClassification.categories
    .filter((c) => c.confidence >= 0.3)
    .sort((a, b) => b.confidence - a.confidence);

  for (const err of topErrors.slice(0, 3)) {
    improvements.push(`${errorLabel(err.category)}：${err.evidence}`);
  }

  if (scoreResult.suspiciousItems.length > 0) {
    for (const s of scoreResult.suspiciousItems) {
      improvements.push(`[${suspicionLabel(s.type)}] ${s.description}`);
    }
  }

  if (scoreResult.manualReviewNeeded) {
    improvements.push(`需人工复核：${scoreResult.manualReviewReasons.map((r) => r.message).join('；')}`);
  }

  return improvements;
}

function suspicionLabel(type: string): string {
  const map: Record<string, string> = {
    possible_guess: '疑似猜测',
    ambiguous_answer: '答案存疑',
    contradiction: '自相矛盾',
    disabled_hit: '禁用词命中',
  };
  return map[type] ?? type;
}

function buildErrorExplanation(errorClassification: ErrorClassificationResult): string {
  if (errorClassification.categories.every((c) => c.confidence === 0)) {
    return '作答正确，无需错因分析。';
  }
  return errorClassification.reasoning;
}

function buildRubricFeedback(rubricScores: RubricScoreDetail[]): { rubricItemName: string; feedback: string }[] {
  return rubricScores.map((rubric) => {
    const ratio = rubric.maxScore > 0 ? rubric.earnedScore / rubric.maxScore : 0;
    let feedback = '';
    if (ratio >= 1) {
      feedback = `满分（${rubric.earnedScore}/${rubric.maxScore}），${rubric.rubricItemName}表现优秀`;
    } else if (ratio >= 0.8) {
      feedback = `接近满分（${rubric.earnedScore}/${rubric.maxScore}），${rubric.allowPartialCredit ? '继续保持' : '注意全部标准都要满足'}`;
    } else if (ratio >= 0.5) {
      feedback = `得分中等（${rubric.earnedScore}/${rubric.maxScore}），${rubric.allowPartialCredit ? '仍有提升空间' : '未满足全部标准，建议逐项检查'}`;
    } else if (ratio > 0) {
      feedback = `得分较低（${rubric.earnedScore}/${rubric.maxScore}），${rubric.allowPartialCredit ? '建议重点复习' : '此评分项未达标，需要加强'}`;
    } else {
      feedback = `未得分（0/${rubric.maxScore}），${rubric.allowPartialCredit ? '该维度需要重点学习' : '该评分项不允许部分得分，建议系统性复习'}`;
    }
    return { rubricItemName: rubric.rubricItemName, feedback };
  });
}

export function generateStudentCommentary(
  question: Question,
  scoreResult: ScoreResult,
  errorClassification: ErrorClassificationResult,
): StudentCommentary {
  return {
    questionId: question.id,
    summary: buildStudentSummary(scoreResult, errorClassification),
    strengths: buildStrengths(scoreResult),
    improvements: buildImprovements(scoreResult, errorClassification),
    errorExplanation: buildErrorExplanation(errorClassification),
    rubricFeedback: buildRubricFeedback(scoreResult.rubricScores ?? []),
  };
}

export function generateClassOverview(
  question: Question,
  results: CorrectionResult[],
): ClassOverviewItem {
  const scores = results.map((r) => r.score.earnedScore);
  const total = results[0]?.score.totalScore ?? question.score;

  const avgScore = scores.length > 0
    ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100
    : 0;

  const bands: ScoreBand[] = [
    { range: '90-100%', count: 0, percentage: 0 },
    { range: '70-89%', count: 0, percentage: 0 },
    { range: '50-69%', count: 0, percentage: 0 },
    { range: '30-49%', count: 0, percentage: 0 },
    { range: '0-29%', count: 0, percentage: 0 },
  ];

  for (const s of scores) {
    const ratio = total > 0 ? s / total : 0;
    if (ratio >= 0.9) bands[0].count++;
    else if (ratio >= 0.7) bands[1].count++;
    else if (ratio >= 0.5) bands[2].count++;
    else if (ratio >= 0.3) bands[3].count++;
    else bands[4].count++;
  }

  for (const band of bands) {
    band.percentage = scores.length > 0
      ? Math.round((band.count / scores.length) * 10000) / 100
      : 0;
  }

  const errorCounts: Record<string, number> = {};
  for (const r of results) {
    const dominant = r.errorClassification.dominantCategory;
    errorCounts[dominant] = (errorCounts[dominant] ?? 0) + 1;
  }

  const topErrors = Object.entries(errorCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([cat, count]) => ({
      category: cat as ErrorCategory,
      confidence: count / results.length,
      evidence: `${count}名学生表现为${errorLabel(cat as ErrorCategory)}错误`,
    }));

  const commonMistakes = results
    .flatMap((r) => r.score.suspiciousItems.map((s) => s.description))
    .reduce<Record<string, number>>((acc, desc) => {
      acc[desc] = (acc[desc] ?? 0) + 1;
      return acc;
    }, {});

  const sortedMistakes = Object.entries(commonMistakes)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([desc]) => desc);

  const rubricBreakdown: ClassOverviewItem['rubricBreakdown'] = [];
  const firstResult = results[0];
  if (firstResult && firstResult.score.rubricScores && firstResult.score.rubricScores.length > 0) {
    for (const rubric of firstResult.score.rubricScores) {
      const rubricEarned = results
        .map((r) => r.score.rubricScores?.find((rs) => rs.rubricItemId === rubric.rubricItemId)?.earnedScore ?? 0)
        .reduce((a, b) => a + b, 0);
      const avgRubric = results.length > 0
        ? Math.round((rubricEarned / results.length) * 100) / 100
        : 0;
      rubricBreakdown.push({
        rubricItemId: rubric.rubricItemId,
        rubricItemName: rubric.rubricItemName,
        avgScore: avgRubric,
        avgRatio: rubric.maxScore > 0 ? Math.round((avgRubric / rubric.maxScore) * 10000) / 100 : 0,
      });
    }
  }

  return {
    questionId: question.id,
    avgScore,
    scoreDistribution: bands,
    topErrors,
    commonMistakes: sortedMistakes,
    rubricBreakdown,
  };
}

export function generateKnowledgePointOverviews(
  questions: Question[],
  allResults: CorrectionResult[],
): KnowledgePointOverview[] {
  const kpQuestionMap = new Map<string, Question[]>();
  const kpResultMap = new Map<string, CorrectionResult[]>();

  for (const q of questions) {
    for (const kp of q.knowledgePoints) {
      if (!kpQuestionMap.has(kp)) {
        kpQuestionMap.set(kp, []);
      }
      kpQuestionMap.get(kp)!.push(q);
    }
  }

  for (const r of allResults) {
    const q = questions.find((qq) => qq.id === r.questionId);
    if (!q) continue;
    for (const kp of q.knowledgePoints) {
      if (!kpResultMap.has(kp)) {
        kpResultMap.set(kp, []);
      }
      kpResultMap.get(kp)!.push(r);
    }
  }

  const allKps = new Set([...kpQuestionMap.keys(), ...kpResultMap.keys()]);
  const overviews: KnowledgePointOverview[] = [];

  for (const kp of allKps) {
    const kpQuestions = kpQuestionMap.get(kp) ?? [];
    const kpResults = kpResultMap.get(kp) ?? [];

    const totalScore = kpQuestions.reduce((s, q) => s + q.score, 0);
    const earnedScore = kpResults.reduce((s, r) => s + r.score.earnedScore, 0);
    const studentCount = kpResults.length > 0
      ? new Set(kpResults.map((r) => `${r.questionId}-${r.score.earnedScore}`)).size
      : 0;

    const errorCounts: Record<string, number> = {};
    for (const r of kpResults) {
      for (const cat of r.errorClassification.categories) {
        if (cat.confidence >= 0.3) {
          errorCounts[cat.category] = (errorCounts[cat.category] ?? 0) + 1;
        }
      }
    }

    const topErrors = Object.entries(errorCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([cat, count]) => ({
        category: cat as ErrorCategory,
        confidence: kpResults.length > 0 ? count / kpResults.length : 0,
        evidence: `${count}次命中${errorLabel(cat as ErrorCategory)}错误`,
      }));

    const weakRubricItems: string[] = [];
    for (const r of kpResults) {
      for (const rs of r.score.rubricScores ?? []) {
        const ratio = rs.maxScore > 0 ? rs.earnedScore / rs.maxScore : 0;
        if (ratio < 0.5 && !weakRubricItems.includes(rs.rubricItemName)) {
          weakRubricItems.push(rs.rubricItemName);
        }
      }
    }

    const avgRatio = totalScore > 0 && kpResults.length > 0 ? earnedScore / totalScore : 0;
    const difficulty: PracticeSuggestion['difficulty'] =
      avgRatio < 0.3 ? 'easier' : avgRatio < 0.7 ? 'same' : 'harder';

    const dominantCat = topErrors[0]?.category;
    const questionType = kpQuestions.length > 0 ? kpQuestions[0].type : QuestionType.ShortAnswer;

    const reason = avgRatio < 0.3
      ? `知识点"${kp}"平均得分率仅${(avgRatio * 100).toFixed(0)}%，建议降低难度巩固基础`
      : avgRatio < 0.7
        ? `知识点"${kp}"平均得分率${(avgRatio * 100).toFixed(0)}%，建议同难度强化练习`
        : `知识点"${kp}"掌握良好（${(avgRatio * 100).toFixed(0)}%），可以挑战更高难度`;

    overviews.push({
      knowledgePoint: kp,
      questionCount: kpQuestions.length,
      studentCount,
      avgScore: kpResults.length > 0 ? Math.round((earnedScore / kpResults.length) * 100) / 100 : 0,
      avgScoreRatio: Math.round(avgRatio * 10000) / 100,
      topErrors,
      weakRubricItems,
      practiceDirection: {
        knowledgePoints: [kp],
        questionType,
        difficulty,
        reason: dominantCat ? `${reason}；主要错误类型：${errorLabel(dominantCat)}` : reason,
      },
      relatedQuestions: kpQuestions.map((q) => q.id),
    });
  }

  return overviews;
}

export function generatePracticeSuggestions(
  question: Question,
  results: CorrectionResult[],
): PracticeSuggestion[] {
  const suggestions: PracticeSuggestion[] = [];
  const scoreRatio = results.length > 0
    ? results.reduce((sum, r) => sum + (r.score.totalScore > 0 ? r.score.earnedScore / r.score.totalScore : 0), 0) / results.length
    : 0;

  const errorCounts: Record<string, number> = {};
  for (const r of results) {
    for (const cat of r.errorClassification.categories) {
      if (cat.confidence >= 0.3) {
        errorCounts[cat.category] = (errorCounts[cat.category] ?? 0) + 1;
      }
    }
  }

  const dominantErrors = Object.entries(errorCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([cat]) => cat as ErrorCategory);

  if (question.knowledgePoints.length > 0) {
    const difficulty: PracticeSuggestion['difficulty'] =
      scoreRatio < 0.3 ? 'easier' : scoreRatio < 0.7 ? 'same' : 'harder';

    suggestions.push({
      knowledgePoints: question.knowledgePoints,
      questionType: question.type,
      difficulty,
      reason: scoreRatio < 0.3
        ? `班级平均得分率仅${(scoreRatio * 100).toFixed(0)}%，建议降低难度巩固基础`
        : scoreRatio < 0.7
          ? `班级平均得分率${(scoreRatio * 100).toFixed(0)}%，建议同难度强化练习`
          : `班级表现良好，得分率${(scoreRatio * 100).toFixed(0)}%，可以挑战更高难度`,
    });
  }

  if (dominantErrors.includes(ErrorCategory.Calculation)) {
    suggestions.push({
      knowledgePoints: question.knowledgePoints,
      questionType: QuestionType.StepByStep,
      difficulty: 'same',
      reason: '计算错误较为普遍，建议增加分步计算专项练习',
    });
  }

  if (dominantErrors.includes(ErrorCategory.Expression)) {
    suggestions.push({
      knowledgePoints: question.knowledgePoints,
      questionType: QuestionType.ShortAnswer,
      difficulty: 'same',
      reason: '表达不准确较为普遍，建议增加简答和论述练习',
    });
  }

  if (dominantErrors.includes(ErrorCategory.Misread)) {
    suggestions.push({
      knowledgePoints: question.knowledgePoints,
      questionType: question.type,
      difficulty: 'easier',
      reason: '审题错误较多，建议练习审题技巧和题目关键词标注',
    });
  }

  if (dominantErrors.includes(ErrorCategory.KnowledgePoint)) {
    suggestions.push({
      knowledgePoints: question.knowledgePoints,
      questionType: question.type,
      difficulty: 'easier',
      reason: '知识点掌握不足较多，建议先回顾相关知识点再练习',
    });
  }

  return suggestions;
}

export function generateCommentary(
  question: Question,
  scoreResult: ScoreResult,
  errorClassification: ErrorClassificationResult,
  allResults: CorrectionResult[],
): CommentaryResult {
  return {
    studentCommentary: generateStudentCommentary(question, scoreResult, errorClassification),
    classOverview: generateClassOverview(question, allResults),
    practiceSuggestions: generatePracticeSuggestions(question, allResults),
  };
}

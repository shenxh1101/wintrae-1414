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
} from '../types';

function buildStudentSummary(
  scoreResult: ScoreResult,
  errorClassification: ErrorClassificationResult,
): string {
  const ratio = scoreResult.earnedScore / scoreResult.totalScore;

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
  const partialHits = scoreResult.hitEvidences.filter((e) => e.rule === 'partial_score');
  if (partialHits.length > 0) {
    strengths.push(`部分得分项：${partialHits.map((e) => e.matchedContent).join('；')}`);
  }
  const stepHits = scoreResult.hitEvidences.filter((e) => e.rule === 'step_full_match');
  if (stepHits.length > 0) {
    strengths.push(`正确步骤：${stepHits.map((e) => e.matchedContent).join('；')}`);
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
    improvements.push(`可疑项：${scoreResult.suspiciousItems.map((s) => s.description).join('；')}`);
  }

  return improvements;
}

function buildErrorExplanation(errorClassification: ErrorClassificationResult): string {
  if (errorClassification.categories.every((c) => c.confidence === 0)) {
    return '作答正确，无需错因分析。';
  }
  return errorClassification.reasoning;
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

  return {
    questionId: question.id,
    avgScore,
    scoreDistribution: bands,
    topErrors,
    commonMistakes: sortedMistakes,
  };
}

export function generatePracticeSuggestions(
  question: Question,
  results: CorrectionResult[],
): PracticeSuggestion[] {
  const suggestions: PracticeSuggestion[] = [];
  const scoreRatio = results.length > 0
    ? results.reduce((sum, r) => sum + r.score.earnedScore / r.score.totalScore, 0) / results.length
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

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
  StudentOverview,
  HitEvidence,
  ErrorCategoryItem,
  TypicalWrongAnswer,
  ReviewWorkbench,
  ReviewItem,
  ReviewStatus,
  StudentAnswer,
  CrossQuestionStat,
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

function extractAnswerText(result: CorrectionResult): string {
  const ans = result.originalAnswer;
  if (!ans) return result.commentary.summary;
  if ('text' in ans && typeof ans.text === 'string') return ans.text;
  if ('values' in ans && typeof ans.values === 'object') {
    return Object.values(ans.values as Record<number, string>).join(' | ');
  }
  if ('selectedLabels' in ans && Array.isArray(ans.selectedLabels)) {
    return ans.selectedLabels.join(',');
  }
  if ('steps' in ans && typeof ans.steps === 'object') {
    return Object.values(ans.steps as Record<number, string>).join(' | ');
  }
  return result.commentary.summary;
}

export function buildTypicalWrongAnswers(
  results: CorrectionResult[],
  questions: Question[],
  scopeKnowledgePoint?: string,
): TypicalWrongAnswer[] {
  const wrongMap = new Map<
    string,
    {
      frequency: number;
      errorType: ErrorCategory;
      studentIds: Set<string>;
      questionIds: Set<string>;
      knowledgePoints: Set<string>;
    }
  >();

  for (const r of results) {
    const ratio = r.score.totalScore > 0 ? r.score.earnedScore / r.score.totalScore : 0;
    if (ratio >= 0.6) continue;
    const q = questions.find((qq) => qq.id === r.questionId);
    if (!q) continue;
    if (scopeKnowledgePoint && !q.knowledgePoints.includes(scopeKnowledgePoint)) continue;

    const answerText = extractAnswerText(r) || r.questionId;
    const key = answerText;
    const existing = wrongMap.get(key);
    if (existing) {
      existing.frequency++;
      if (r.studentId) existing.studentIds.add(r.studentId);
      existing.questionIds.add(r.questionId);
      for (const kp of q.knowledgePoints) existing.knowledgePoints.add(kp);
    } else {
      wrongMap.set(key, {
        frequency: 1,
        errorType: r.errorClassification.dominantCategory,
        studentIds: new Set(r.studentId ? [r.studentId] : []),
        questionIds: new Set([r.questionId]),
        knowledgePoints: new Set(q.knowledgePoints),
      });
    }
  }

  return [...wrongMap.entries()]
    .sort((a, b) => b[1].frequency - a[1].frequency)
    .slice(0, 5)
    .map(([answer, data]) => ({
      answer,
      frequency: data.frequency,
      errorType: data.errorType,
      studentIds: [...data.studentIds],
      questionIds: [...data.questionIds],
      knowledgePoints: [...data.knowledgePoints],
    }));
}

export function buildReviewWorkbench(
  results: CorrectionResult[],
  initialStatuses?: Record<string, ReviewStatus>,
): ReviewWorkbench {
  const items: ReviewItem[] = [];
  const seen = new Set<string>();
  let itemSeq = 0;

  const pushItem = (
    studentId: string,
    questionId: string,
    type: ReviewItem['type'],
    content: string,
    reason: string,
    severity: 'warning' | 'error',
    originalAnswer: StudentAnswer,
    earnedScore: number,
    totalScore: number,
  ) => {
    const dedupKey = `${questionId}::${studentId}::${type}::${content}`;
    if (seen.has(dedupKey)) return;
    seen.add(dedupKey);
    const id = `rv-${questionId}-${studentId}-${type}-${++itemSeq}`;
    items.push({
      id,
      studentId,
      questionId,
      type,
      status: initialStatuses?.[id] ?? 'pending',
      content,
      reason,
      severity,
      createdAt: Date.now(),
      originalAnswer,
      earnedScore,
      totalScore,
    });
  };

  for (const r of results) {
    const studentId = r.studentId ?? 'unknown';
    const totalScore = r.score.totalScore;
    const earnedScore = r.score.earnedScore;

    for (const si of r.score.suspiciousItems) {
      const type = si.type as ReviewItem['type'];
      pushItem(
        studentId,
        r.questionId,
        type,
        si.content,
        si.description,
        type === 'disabled_hit' || type === 'contradiction' ? 'error' : 'warning',
        r.originalAnswer,
        earnedScore,
        totalScore,
      );
    }

    for (const mr of r.score.manualReviewReasons) {
      const type: ReviewItem['type'] =
        mr.code === 'DISABLED_ANSWER_HIT'
          ? 'disabled_hit'
          : mr.code?.includes('SIMILARITY') || mr.message.includes('相似')
            ? 'ambiguous_answer'
            : 'possible_guess';
      if (type === 'disabled_hit') continue;
      const content = mr.message.slice(0, 60);
      pushItem(
        studentId,
        r.questionId,
        type,
        content,
        mr.message,
        mr.severity,
        r.originalAnswer,
        earnedScore,
        totalScore,
      );
    }
  }

  const pending: ReviewItem[] = [];
  const confirmedValid: ReviewItem[] = [];
  const confirmedInvalid: ReviewItem[] = [];
  const byStudent: Record<string, ReviewItem[]> = {};
  const byQuestion: Record<string, ReviewItem[]> = {};
  const byType: Record<string, number> = {};

  for (const item of items) {
    if (item.status === 'pending') pending.push(item);
    else if (item.status === 'confirmed_valid') confirmedValid.push(item);
    else confirmedInvalid.push(item);

    if (!byStudent[item.studentId]) byStudent[item.studentId] = [];
    byStudent[item.studentId].push(item);

    if (!byQuestion[item.questionId]) byQuestion[item.questionId] = [];
    byQuestion[item.questionId].push(item);

    byType[item.type] = (byType[item.type] ?? 0) + 1;
  }

  return {
    pending,
    confirmedValid,
    confirmedInvalid,
    byStudent,
    byQuestion,
    summary: {
      totalCount: items.length,
      pendingCount: pending.length,
      confirmedValidCount: confirmedValid.length,
      confirmedInvalidCount: confirmedInvalid.length,
      byType,
    },
  };
}

export function buildCrossQuestionStats(
  questions: Question[],
  results: CorrectionResult[],
): { synonymStats: CrossQuestionStat[]; disabledAnswerStats: CrossQuestionStat[] } {
  const synonymMap = new Map<
    string,
    {
      expression: string;
      canonical: string;
      byQuestion: Map<string, { hitCount: number; knowledgePoints: Set<string> }>;
    }
  >();
  const disabledMap = new Map<
    string,
    {
      expression: string;
      reason: string;
      byQuestion: Map<string, { hitCount: number; knowledgePoints: Set<string> }>;
    }
  >();

  for (const r of results) {
    const q = questions.find((qq) => qq.id === r.questionId);
    if (!q) continue;
    const kps = q.knowledgePoints;

    for (const syn of r.comparison.matchedSynonyms ?? []) {
      const key = syn.synonym;
      const existing = synonymMap.get(key);
      if (existing) {
        existing.canonical = existing.canonical || syn.canonical;
        const qEntry = existing.byQuestion.get(r.questionId);
        if (qEntry) {
          qEntry.hitCount++;
          for (const kp of kps) qEntry.knowledgePoints.add(kp);
        } else {
          existing.byQuestion.set(r.questionId, {
            hitCount: 1,
            knowledgePoints: new Set(kps),
          });
        }
      } else {
        synonymMap.set(key, {
          expression: key,
          canonical: syn.canonical,
          byQuestion: new Map([
            [r.questionId, { hitCount: 1, knowledgePoints: new Set(kps) }],
          ]),
        });
      }
    }

    for (const si of r.score.suspiciousItems ?? []) {
      if (si.type !== 'disabled_hit') continue;
      const key = si.content;
      const existing = disabledMap.get(key);
      if (existing) {
        const qEntry = existing.byQuestion.get(r.questionId);
        if (qEntry) {
          qEntry.hitCount++;
          for (const kp of kps) qEntry.knowledgePoints.add(kp);
        } else {
          existing.byQuestion.set(r.questionId, {
            hitCount: 1,
            knowledgePoints: new Set(kps),
          });
        }
      } else {
        disabledMap.set(key, {
          expression: key,
          reason: si.description,
          byQuestion: new Map([
            [r.questionId, { hitCount: 1, knowledgePoints: new Set(kps) }],
          ]),
        });
      }
    }
  }

  const toStat = (
    type: 'synonym' | 'disabled',
    entry: { expression: string; byQuestion: Map<string, { hitCount: number; knowledgePoints: Set<string> }>; canonical?: string; reason?: string },
  ): CrossQuestionStat => {
    const byQuestion = [...entry.byQuestion.entries()].map(([qid, data]) => ({
      questionId: qid,
      hitCount: data.hitCount,
      knowledgePoints: [...data.knowledgePoints],
    }));
    const kpMap = new Map<string, { hitCount: number; questionIds: Set<string> }>();
    for (const [qid, data] of entry.byQuestion.entries()) {
      for (const kp of data.knowledgePoints) {
        const existing = kpMap.get(kp);
        if (existing) {
          existing.hitCount += data.hitCount;
          existing.questionIds.add(qid);
        } else {
          kpMap.set(kp, { hitCount: data.hitCount, questionIds: new Set([qid]) });
        }
      }
    }
    const byKnowledgePoint = [...kpMap.entries()].map(([kp, data]) => ({
      knowledgePoint: kp,
      hitCount: data.hitCount,
      questionIds: [...data.questionIds],
    }));
    const totalHitCount = byQuestion.reduce((s, q) => s + q.hitCount, 0);
    return {
      expression: entry.expression,
      type,
      totalHitCount,
      byQuestion,
      byKnowledgePoint,
      metadata:
        type === 'synonym'
          ? { canonical: (entry as any).canonical }
          : { reason: (entry as any).reason },
    };
  };

  return {
    synonymStats: [...synonymMap.values()]
      .map((e) => toStat('synonym', e))
      .sort((a, b) => b.totalHitCount - a.totalHitCount),
    disabledAnswerStats: [...disabledMap.values()]
      .map((e) => toStat('disabled', e))
      .sort((a, b) => b.totalHitCount - a.totalHitCount),
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
      confidence: results.length > 0 ? count / results.length : 0,
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
      const rubricScores = results.map(
        (r) => r.score.rubricScores?.find((rs) => rs.rubricItemId === rubric.rubricItemId)?.earnedScore ?? 0,
      );
      const avgRubric = results.length > 0
        ? Math.round((rubricScores.reduce((a, b) => a + b, 0) / results.length) * 100) / 100
        : 0;
      const passCount = results.filter((r) => {
        const rs = r.score.rubricScores?.find((x) => x.rubricItemId === rubric.rubricItemId);
        return rs?.passed ?? false;
      }).length;
      rubricBreakdown.push({
        rubricItemId: rubric.rubricItemId,
        rubricItemName: rubric.rubricItemName,
        avgScore: avgRubric,
        avgRatio: rubric.maxScore > 0 ? Math.round((avgRubric / rubric.maxScore) * 10000) / 100 : 0,
        passRate: results.length > 0 ? Math.round((passCount / results.length) * 10000) / 100 : 0,
      });
    }
  }

  const synonymMap = new Map<string, { canonical: string; synonym: string; hitCount: number }>();
  for (const r of results) {
    for (const syn of r.comparison.matchedSynonyms ?? []) {
      const key = `${syn.canonical}::${syn.synonym}`;
      const existing = synonymMap.get(key);
      if (existing) {
        existing.hitCount++;
      } else {
        synonymMap.set(key, { canonical: syn.canonical, synonym: syn.synonym, hitCount: 1 });
      }
    }
  }
  const synonymStats = [...synonymMap.values()]
    .sort((a, b) => b.hitCount - a.hitCount)
    .slice(0, 10);

  const disabledMap = new Map<string, { text: string; reason: string; hitCount: number }>();
  for (const r of results) {
    for (const mr of r.score.manualReviewReasons ?? []) {
      if (mr.code === 'DISABLED_ANSWER_HIT') {
        const match = mr.message.match(/命中禁用答案"([^"]+)"/);
        const text = match ? match[1] : '未知禁用词';
        const existing = disabledMap.get(text);
        if (existing) {
          existing.hitCount++;
        } else {
          const reasonMatch = mr.message.match(/原因：([^，]+)/);
          const reason = reasonMatch ? reasonMatch[1] : '禁用答案命中';
          disabledMap.set(text, { text, reason, hitCount: 1 });
        }
      }
    }
    for (const si of r.score.suspiciousItems ?? []) {
      if (si.type === 'disabled_hit') {
        const text = si.content;
        const existing = disabledMap.get(text);
        if (existing) {
          existing.hitCount++;
        } else {
          disabledMap.set(text, { text, reason: si.description, hitCount: 1 });
        }
      }
    }
  }
  const disabledAnswerStats = [...disabledMap.values()]
    .sort((a, b) => b.hitCount - a.hitCount)
    .slice(0, 10);

  const studentIds = new Set<string>();
  for (const r of results) {
    if (r.studentId) studentIds.add(r.studentId);
  }
  const studentCount = studentIds.size > 0 ? studentIds.size : results.length;

  const typicalWrongAnswers = buildTypicalWrongAnswers(results, [question]);

  return {
    questionId: question.id,
    avgScore,
    scoreDistribution: bands,
    topErrors,
    commonMistakes: sortedMistakes,
    rubricBreakdown,
    synonymStats,
    disabledAnswerStats,
    studentCount,
    typicalWrongAnswers,
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

    const studentIds = new Set<string>();
    const studentScoreMap = new Map<string, { earned: number; total: number }>();

    for (const r of kpResults) {
      const sid = r.studentId ?? `__anonymous_${r.questionId}`;
      studentIds.add(sid);
      const q = kpQuestions.find((qq) => qq.id === r.questionId);
      const total = q?.score ?? 0;
      const existing = studentScoreMap.get(sid);
      if (existing) {
        existing.earned += r.score.earnedScore;
        existing.total += total;
      } else {
        studentScoreMap.set(sid, { earned: r.score.earnedScore, total });
      }
    }

    const studentCount = studentIds.size;

    let totalRatioSum = 0;
    let ratioCount = 0;
    for (const { earned, total } of studentScoreMap.values()) {
      if (total > 0) {
        totalRatioSum += Math.min(earned / total, 1);
        ratioCount++;
      }
    }
    const avgScoreRatio = ratioCount > 0
      ? Math.min(Math.round((totalRatioSum / ratioCount) * 10000) / 100, 100)
      : 0;

    const totalMaxScore = kpQuestions.reduce((s, q) => s + q.score, 0);
    const avgScore = studentCount > 0
      ? Math.round((kpResults.reduce((s, r) => s + r.score.earnedScore, 0) / studentCount) * 100) / 100
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

    const weakRubricItems: { name: string; avgRatio: number }[] = [];
    const rubricScoreMap = new Map<string, { earned: number; max: number; count: number }>();
    for (const r of kpResults) {
      for (const rs of r.score.rubricScores ?? []) {
        const existing = rubricScoreMap.get(rs.rubricItemName);
        if (existing) {
          existing.earned += rs.earnedScore;
          existing.max += rs.maxScore;
          existing.count++;
        } else {
          rubricScoreMap.set(rs.rubricItemName, { earned: rs.earnedScore, max: rs.maxScore, count: 1 });
        }
      }
    }
    for (const [name, data] of rubricScoreMap.entries()) {
      const ratio = data.max > 0 ? data.earned / data.max : 0;
      if (ratio < 0.5) {
        weakRubricItems.push({ name, avgRatio: Math.round(ratio * 10000) / 100 });
      }
    }
    weakRubricItems.sort((a, b) => a.avgRatio - b.avgRatio);
    const weakRubricNames = weakRubricItems.map((w) => w.name);

    const typicalWrongAnswers = buildTypicalWrongAnswers(kpResults, questions, kp);

    const representativeEvidences: HitEvidence[] = [];
    const evKeyMap = new Map<string, number>();
    for (const r of kpResults) {
      for (const ev of r.score.hitEvidences) {
        if (ev.scoreAwarded === 0 && ev.rule !== 'disabled_answer') continue;
        const key = `${ev.rule}::${ev.matchedContent}`;
        evKeyMap.set(key, (evKeyMap.get(key) ?? 0) + 1);
      }
    }
    const topEvKeys = [...evKeyMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    for (const [key] of topEvKeys) {
      const [rule, matchedContent] = key.split('::');
      const sample = kpResults
        .flatMap((r) => r.score.hitEvidences)
        .find((e) => e.rule === rule && e.matchedContent === matchedContent);
      if (sample) {
        representativeEvidences.push(sample);
      }
    }

    const typeCount: Record<string, number> = {};
    for (const q of kpQuestions) {
      typeCount[q.type] = (typeCount[q.type] ?? 0) + 1;
    }
    const totalQ = kpQuestions.length || 1;
    const practiceTypeMix: { questionType: QuestionType; proportion: number; reason: string }[] = [];
    for (const [t, c] of Object.entries(typeCount)) {
      const proportion = Math.round((c / totalQ) * 10000) / 100;
      let reason = '当前题型分布';
      if (avgScoreRatio < 40 && t === QuestionType.ShortAnswer) reason = '基础较弱，先减少简答比重';
      if (avgScoreRatio > 70 && t === QuestionType.StepByStep) reason = '掌握良好，可增加步骤题挑战';
      practiceTypeMix.push({ questionType: t as QuestionType, proportion, reason });
    }

    const difficulty: PracticeSuggestion['difficulty'] =
      avgScoreRatio < 30 ? 'easier' : avgScoreRatio < 70 ? 'same' : 'harder';

    const dominantCat = topErrors[0]?.category;
    const questionType = kpQuestions.length > 0 ? kpQuestions[0].type : QuestionType.ShortAnswer;

    const reason = avgScoreRatio < 30
      ? `知识点"${kp}"平均得分率仅${avgScoreRatio.toFixed(0)}%，建议降低难度巩固基础`
      : avgScoreRatio < 70
        ? `知识点"${kp}"平均得分率${avgScoreRatio.toFixed(0)}%，建议同难度强化练习`
        : `知识点"${kp}"掌握良好（${avgScoreRatio.toFixed(0)}%），可以挑战更高难度`;

    const synonymMap = new Map<string, { canonical: string; synonym: string; hitCount: number }>();
    for (const r of kpResults) {
      for (const syn of r.comparison.matchedSynonyms ?? []) {
        const key = `${syn.canonical}::${syn.synonym}`;
        const existing = synonymMap.get(key);
        if (existing) {
          existing.hitCount++;
        } else {
          synonymMap.set(key, { canonical: syn.canonical, synonym: syn.synonym, hitCount: 1 });
        }
      }
    }
    const synonymStats = [...synonymMap.values()]
      .sort((a, b) => b.hitCount - a.hitCount)
      .slice(0, 10);

    const disabledMap = new Map<string, { text: string; reason: string; hitCount: number }>();
    for (const r of kpResults) {
      for (const si of r.score.suspiciousItems ?? []) {
        if (si.type === 'disabled_hit') {
          const existing = disabledMap.get(si.content);
          if (existing) {
            existing.hitCount++;
          } else {
            disabledMap.set(si.content, { text: si.content, reason: si.description, hitCount: 1 });
          }
        }
      }
    }
    const disabledAnswerStats = [...disabledMap.values()]
      .sort((a, b) => b.hitCount - a.hitCount)
      .slice(0, 10);

    overviews.push({
      knowledgePoint: kp,
      questionCount: kpQuestions.length,
      studentCount,
      avgScore,
      avgScoreRatio,
      topErrors,
      weakRubricItems: weakRubricNames,
      practiceDirection: {
        knowledgePoints: [kp],
        questionType,
        difficulty,
        reason: dominantCat ? `${reason}；主要错误类型：${errorLabel(dominantCat)}` : reason,
      },
      relatedQuestions: kpQuestions.map((q) => q.id),
      typicalWrongAnswers,
      representativeEvidences,
      practiceTypeMix,
      synonymStats,
      disabledAnswerStats,
    });
  }

  return overviews;
}

export function generateStudentOverviews(
  questions: Question[],
  allResults: CorrectionResult[],
): StudentOverview[] {
  const studentResultMap = new Map<string, CorrectionResult[]>();

  for (const r of allResults) {
    const sid = r.studentId ?? '__anonymous';
    if (!studentResultMap.has(sid)) {
      studentResultMap.set(sid, []);
    }
    studentResultMap.get(sid)!.push(r);
  }

  const overviews: StudentOverview[] = [];

  for (const [studentId, results] of studentResultMap.entries()) {
    let totalEarned = 0;
    let totalScore = 0;
    const questionScores: { questionId: string; earned: number; total: number; ratio: number }[] = [];
    const reviewReasons: string[] = [];
    let needsReview = false;

    const kpMap = new Map<string, { earned: number; total: number }>();
    const rubricMap = new Map<string, { earned: number; max: number; count: number }>();
    const errorCounts: Record<string, number> = {};

    for (const r of results) {
      const q = questions.find((qq) => qq.id === r.questionId);
      if (!q) continue;

      totalEarned += r.score.earnedScore;
      totalScore += q.score;
      questionScores.push({
        questionId: r.questionId,
        earned: r.score.earnedScore,
        total: q.score,
        ratio: q.score > 0 ? Math.round((r.score.earnedScore / q.score) * 10000) / 100 : 0,
      });

      if (r.score.manualReviewNeeded) {
        needsReview = true;
        for (const mr of r.score.manualReviewReasons) {
          reviewReasons.push(`[${r.questionId}] ${mr.message}`);
        }
      }

      for (const kp of q.knowledgePoints) {
        const existing = kpMap.get(kp);
        if (existing) {
          existing.earned += r.score.earnedScore;
          existing.total += q.score;
        } else {
          kpMap.set(kp, { earned: r.score.earnedScore, total: q.score });
        }
      }

      for (const rs of r.score.rubricScores ?? []) {
        const existing = rubricMap.get(rs.rubricItemName);
        if (existing) {
          existing.earned += rs.earnedScore;
          existing.max += rs.maxScore;
          existing.count++;
        } else {
          rubricMap.set(rs.rubricItemName, { earned: rs.earnedScore, max: rs.maxScore, count: 1 });
        }
      }

      for (const cat of r.errorClassification.categories) {
        if (cat.confidence >= 0.3) {
          errorCounts[cat.category] = (errorCounts[cat.category] ?? 0) + 1;
        }
      }
    }

    const avgScoreRatio = totalScore > 0 ? Math.min(Math.round((totalEarned / totalScore) * 10000) / 100, 100) : 0;

    const weakKnowledgePoints = [...kpMap.entries()]
      .map(([kp, data]) => ({
        knowledgePoint: kp,
        avgRatio: data.total > 0 ? Math.min(Math.round((data.earned / data.total) * 10000) / 100, 100) : 0,
      }))
      .filter((k) => k.avgRatio < 60)
      .sort((a, b) => a.avgRatio - b.avgRatio);

    const rubricBreakdown = [...rubricMap.entries()]
      .map(([name, data]) => ({
        rubricItemName: name,
        avgRatio: data.max > 0 ? Math.min(Math.round((data.earned / data.max) * 10000) / 100, 100) : 0,
      }))
      .sort((a, b) => a.avgRatio - b.avgRatio);

    const topErrors = Object.entries(errorCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([cat, count]) => ({
        category: cat as ErrorCategory,
        confidence: results.length > 0 ? count / results.length : 0,
        evidence: `${count}次${errorLabel(cat as ErrorCategory)}错误`,
      }));

    overviews.push({
      studentId: studentId === '__anonymous' ? 'unknown' : studentId,
      totalScore,
      totalEarned: Math.round(totalEarned * 100) / 100,
      avgScoreRatio,
      questionScores,
      weakKnowledgePoints,
      topErrors,
      rubricBreakdown,
      needsReview,
      reviewReasons,
    });
  }

  overviews.sort((a, b) => b.avgScoreRatio - a.avgScoreRatio);

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

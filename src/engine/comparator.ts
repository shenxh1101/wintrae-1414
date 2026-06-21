import {
  Question,
  QuestionType,
  StudentAnswer,
  ComparisonResult,
  ComparisonDetail,
  ChoiceQuestion,
  FillBlankQuestion,
  ShortAnswerQuestion,
  StepQuestion,
  ChoiceAnswer,
  FillBlankAnswer,
  ShortAnswerAnswer,
  StepAnswer,
  KeywordEntry,
} from '../types';

export function normalize(text: string): string {
  const punctuationMap: [string, string][] = [
    ['\uFF0C', ','], ['\u3002', '.'], ['\uFF01', '!'], ['\uFF1F', '?'],
    ['\u3001', ','], ['\uFF1B', ';'], ['\uFF1A', ':'],
    ['\u201C', '\u0022'], ['\u201D', '\u0022'],
    ['\u2018', '\u0027'], ['\u2019', '\u0027'],
    ['\u3010', '['], ['\u3011', ']'],
    ['\uFF08', '('], ['\uFF09', ')'],
    ['\u300A', '<'], ['\u300B', '>'],
  ];
  let result = text.trim().toLowerCase().replace(/\s+/g, ' ');
  for (const [from, to] of punctuationMap) {
    result = result.split(from).join(to);
  }
  return result;
}

function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0) as number[]);
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

export function computeSimilarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return 1;
  if (na.length === 0 || nb.length === 0) return 0;
  const dist = levenshteinDistance(na, nb);
  const maxLen = Math.max(na.length, nb.length);
  return Math.max(0, 1 - dist / maxLen);
}

export function matchSynonyms(text: string, synonymGroups: string[][]): { matched: boolean; canonical?: string; synonym?: string } {
  const normalized = normalize(text);
  for (const group of synonymGroups) {
    for (const synonym of group) {
      if (normalize(synonym) === normalized) {
        return { matched: true, canonical: group[0], synonym };
      }
    }
  }
  return { matched: false };
}

export function matchKeywordWithSynonyms(
  text: string,
  keyword: KeywordEntry,
): { matched: boolean; canonical?: string; synonym?: string } {
  const normalizedText = normalize(text);
  const canonical = normalize(keyword.keyword);
  if (normalizedText.includes(canonical)) {
    return { matched: true, canonical: keyword.keyword, synonym: undefined };
  }
  if (keyword.synonyms) {
    for (const syn of keyword.synonyms) {
      if (normalizedText.includes(normalize(syn))) {
        return { matched: true, canonical: keyword.keyword, synonym: syn };
      }
    }
  }
  return { matched: false };
}

function computeSetSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let intersection = 0;
  for (const item of a) {
    if (b.has(item)) intersection++;
  }
  return intersection / Math.max(a.size, b.size);
}

function compareChoice(
  question: ChoiceQuestion,
  answer: ChoiceAnswer,
): ComparisonResult {
  const correctLabels = question.options
    .filter((o) => o.isCorrect)
    .map((o) => o.label);
  const selected = [...answer.selectedLabels].sort();
  const correct = [...correctLabels].sort();
  const matched = JSON.stringify(selected) === JSON.stringify(correct);

  const details: ComparisonDetail[] = [
    {
      matched,
      matchBasis: matched
        ? '完全匹配正确选项'
        : `选择了 [${selected.join(', ')}]，正确答案为 [${correct.join(', ')}]`,
      similarity: matched ? 1 : computeSetSimilarity(new Set(selected), new Set(correct)),
    },
  ];

  return {
    questionId: question.id,
    questionType: QuestionType.Choice,
    overallMatched: matched,
    overallSimilarity: details[0].similarity,
    details,
    matchedSynonyms: [],
  };
}

function compareFillBlank(
  question: FillBlankQuestion,
  answer: FillBlankAnswer,
): ComparisonResult {
  const details: ComparisonDetail[] = [];
  let totalSim = 0;
  const allSynonyms: { canonical: string; synonym: string }[] = [];

  for (const blank of question.blanks) {
    const studentValue = answer.values[blank.index] ?? '';
    const normalizedStudent = normalize(studentValue);
    let bestSim = 0;
    let bestBasis = '';
    let matchedSyn: { canonical: string; synonym: string } | undefined;

    for (const ref of blank.acceptableAnswers) {
      const sim = computeSimilarity(studentValue, ref);
      if (sim > bestSim) {
        bestSim = sim;
        bestBasis = sim >= 1 ? `空${blank.index + 1}: 精确匹配 "${ref}"` : `空${blank.index + 1}: 与 "${ref}" 相似度 ${sim.toFixed(2)}`;
      }
    }

    if (bestSim < 1 && blank.synonyms.length > 0) {
      const synMatch = matchSynonyms(studentValue, blank.synonyms);
      if (synMatch.matched) {
        bestSim = 1;
        bestBasis = `空${blank.index + 1}: 同义匹配 "${synMatch.synonym}"（规范为 "${synMatch.canonical}"）`;
        matchedSyn = { canonical: synMatch.canonical!, synonym: synMatch.synonym! };
      }
    }

    if (matchedSyn) allSynonyms.push(matchedSyn);

    details.push({
      matched: bestSim >= 1,
      matchBasis: bestBasis || `空${blank.index + 1}: 未匹配 (学生作答 "${studentValue}")`,
      similarity: bestSim,
      matchedSynonym: matchedSyn,
    });
    totalSim += bestSim;
  }

  const avgSim = question.blanks.length > 0 ? totalSim / question.blanks.length : 0;
  return {
    questionId: question.id,
    questionType: QuestionType.FillBlank,
    overallMatched: details.every((d) => d.matched),
    overallSimilarity: avgSim,
    details,
    matchedSynonyms: allSynonyms,
  };
}

function compareShortAnswer(
  question: ShortAnswerQuestion,
  answer: ShortAnswerAnswer,
): ComparisonResult {
  const studentText = answer.text;
  const normalizedStudent = normalize(studentText);

  let sim = computeSimilarity(studentText, question.referenceAnswer);

  let matchBasis = '';
  if (sim >= 1) {
    matchBasis = '精确匹配参考答案';
  } else if (sim >= 0.8) {
    matchBasis = `与参考答案高度相似 (${sim.toFixed(2)})`;
  } else {
    matchBasis = `与参考答案相似度较低 (${sim.toFixed(2)})`;
  }

  let keywordHitCount = 0;
  const allSynonyms: { canonical: string; synonym: string }[] = [];
  let matchedSynDetail: { canonical: string; synonym: string } | undefined;

  for (const kw of question.keywords) {
    const kwMatch = matchKeywordWithSynonyms(studentText, kw);
    if (kwMatch.matched) {
      keywordHitCount++;
      if (kwMatch.synonym) {
        matchedSynDetail = { canonical: kwMatch.canonical!, synonym: kwMatch.synonym };
        allSynonyms.push(matchedSynDetail);
      }
    }
  }

  if (sim < 1 && question.synonyms.length > 0) {
    for (const group of question.synonyms) {
      for (const syn of group) {
        if (normalizedStudent.includes(normalize(syn))) {
          sim = Math.max(sim, 0.9);
          matchBasis = `包含同义表达 "${syn}"（规范为 "${group[0]}"）`;
          allSynonyms.push({ canonical: group[0], synonym: syn });
          break;
        }
      }
      if (sim >= 0.9) break;
    }
  }

  const matched = sim >= 1 || (keywordHitCount === question.keywords.length && question.keywords.length > 0);
  const overallSim = matched ? Math.max(sim, 0.95) : sim;

  const details: ComparisonDetail[] = [
    {
      matched,
      matchBasis,
      similarity: overallSim,
      matchedSynonym: matchedSynDetail,
    },
  ];

  return {
    questionId: question.id,
    questionType: QuestionType.ShortAnswer,
    overallMatched: matched,
    overallSimilarity: overallSim,
    details,
    matchedSynonyms: allSynonyms,
  };
}

function compareStepByStep(
  question: StepQuestion,
  answer: StepAnswer,
): ComparisonResult {
  const details: ComparisonDetail[] = [];
  let totalSim = 0;
  const allSynonyms: { canonical: string; synonym: string }[] = [];

  for (const step of question.steps) {
    const studentStep = answer.steps[step.index] ?? '';
    const normalizedStudent = normalize(studentStep);

    let sim = computeSimilarity(studentStep, step.referenceAnswer);

    let matched = sim >= 1;
    let matchBasis = '';

    if (sim >= 1) {
      matchBasis = `步骤${step.index}: 精确匹配`;
    } else if (sim >= 0.8) {
      matchBasis = `步骤${step.index}: 高度相似 (${sim.toFixed(2)})`;
    } else {
      matchBasis = `步骤${step.index}: 相似度 ${sim.toFixed(2)}`;
    }

    let keywordHitCount = 0;
    let stepMatchedSyn: { canonical: string; synonym: string } | undefined;

    for (const kw of step.keywords) {
      const kwMatch = matchKeywordWithSynonyms(studentStep, kw);
      if (kwMatch.matched) {
        keywordHitCount++;
        if (kwMatch.synonym) {
          stepMatchedSyn = { canonical: kwMatch.canonical!, synonym: kwMatch.synonym };
          allSynonyms.push(stepMatchedSyn);
        }
      }
    }

    if (sim < 1 && step.synonyms.length > 0) {
      for (const group of step.synonyms) {
        for (const syn of group) {
          if (normalizedStudent.includes(normalize(syn))) {
            sim = Math.max(sim, 0.9);
            matchBasis = `步骤${step.index}: 包含同义表达 "${syn}"`;
            allSynonyms.push({ canonical: group[0], synonym: syn });
            break;
          }
        }
        if (sim >= 0.9) break;
      }
    }

    if (!matched && keywordHitCount === step.keywords.length && step.keywords.length > 0) {
      matched = true;
      sim = Math.max(sim, 0.95);
      matchBasis = `步骤${step.index}: 关键词全部命中`;
    }

    details.push({ matched, matchBasis, similarity: sim, matchedSynonym: stepMatchedSyn });
    totalSim += sim;
  }

  const avgSim = question.steps.length > 0 ? totalSim / question.steps.length : 0;
  return {
    questionId: question.id,
    questionType: QuestionType.StepByStep,
    overallMatched: details.every((d) => d.matched),
    overallSimilarity: avgSim,
    details,
    matchedSynonyms: allSynonyms,
  };
}

export function compare(
  question: Question,
  answer: StudentAnswer,
): ComparisonResult {
  switch (question.type) {
    case QuestionType.Choice:
      return compareChoice(question as ChoiceQuestion, answer as ChoiceAnswer);
    case QuestionType.FillBlank:
      return compareFillBlank(question as FillBlankQuestion, answer as FillBlankAnswer);
    case QuestionType.ShortAnswer:
      return compareShortAnswer(question as ShortAnswerQuestion, answer as ShortAnswerAnswer);
    case QuestionType.StepByStep:
      return compareStepByStep(question as StepQuestion, answer as StepAnswer);
    default:
      throw new Error(`不支持的题目类型: ${(question as Question).type}`);
  }
}

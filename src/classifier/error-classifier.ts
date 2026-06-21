import {
  Question,
  QuestionType,
  ComparisonResult,
  ScoreResult,
  ErrorCategory,
  ErrorClassificationResult,
  ErrorCategoryItem,
  ChoiceQuestion,
  FillBlankQuestion,
  StepQuestion,
  StudentAnswer,
  ChoiceAnswer,
  FillBlankAnswer,
  StepAnswer,
  ShortAnswerAnswer,
} from '../types';

function classifyKnowledgePoint(
  question: Question,
  comparison: ComparisonResult,
  scoreResult: ScoreResult,
): ErrorCategoryItem {
  const scoreRatio = scoreResult.totalScore > 0 ? scoreResult.earnedScore / scoreResult.totalScore : 0;
  const hasKeywordHits = scoreResult.hitEvidences.some((e) => e.rule === 'keyword_match' || e.rule === 'step_keyword_match');
  const hasPartialScore = scoreResult.hitEvidences.some((e) => e.rule === 'partial_score');

  let confidence = 0;
  let evidence = '';

  if (scoreRatio <= 0.3 && !hasKeywordHits && !hasPartialScore) {
    confidence = 0.85;
    evidence = '几乎未得分且无关键词命中，大概率是知识点掌握不足';
  } else if (scoreRatio <= 0.5 && !hasKeywordHits) {
    confidence = 0.6;
    evidence = '得分较低且无关键词命中，可能存在知识点缺失';
  } else if (scoreRatio < 1 && hasPartialScore) {
    confidence = 0.4;
    evidence = '获得部分得分，知识点掌握不完整';
  } else {
    confidence = 0.15;
    evidence = '得分较高，知识点掌握基本正常';
  }

  return { category: ErrorCategory.KnowledgePoint, confidence, evidence };
}

function classifyMisread(
  question: Question,
  answer: StudentAnswer,
  comparison: ComparisonResult,
): ErrorCategoryItem {
  let confidence = 0;
  let evidence = '';

  if (question.type === QuestionType.Choice) {
    const choiceQ = question as ChoiceQuestion;
    const choiceA = answer as ChoiceAnswer;
    const correctLabels = choiceQ.options.filter((o) => o.isCorrect).map((o) => o.label);
    if (comparison.details[0] && !comparison.overallMatched) {
      const selectedSet = new Set<string>(choiceA.selectedLabels);
      const correctSet = new Set<string>(correctLabels);
      let overlap = 0;
      for (const l of selectedSet) {
        if (correctSet.has(l)) overlap++;
      }
      if (overlap > 0 && selectedSet.size !== correctLabels.length) {
        confidence = 0.7;
        evidence = '选择题部分选项匹配，可能审题时遗漏了多选要求';
      } else if (overlap === 0) {
        confidence = 0.5;
        evidence = '选择题完全未命中正确选项，可能审题出错';
      }
    }
  }

  if (question.type === QuestionType.FillBlank) {
    const fbAnswer = answer as FillBlankAnswer;
    const fbQuestion = question as FillBlankQuestion;
    let emptyBlanks = 0;
    for (const blank of fbQuestion.blanks) {
      const val = fbAnswer.values[blank.index];
      if (!val || val.trim().length === 0) emptyBlanks++;
    }
    if (emptyBlanks > 0 && emptyBlanks < fbQuestion.blanks.length) {
      confidence = 0.6;
      evidence = `有${emptyBlanks}个空未作答，可能审题时遗漏`;
    }
  }

  if (question.type === QuestionType.StepByStep) {
    const stepQ = question as StepQuestion;
    const stepA = answer as StepAnswer;
    const answeredSteps = Object.keys(stepA.steps).length;
    if (answeredSteps > 0 && answeredSteps < stepQ.steps.length) {
      confidence = 0.55;
      evidence = `只回答了${answeredSteps}/${stepQ.steps.length}个步骤，可能审题不完整`;
    }
  }

  if (confidence === 0) {
    confidence = 0.1;
    evidence = '无明显审题错误迹象';
  }

  return { category: ErrorCategory.Misread, confidence, evidence };
}

function classifyCalculation(
  question: Question,
  comparison: ComparisonResult,
): ErrorCategoryItem {
  let confidence = 0;
  let evidence = '';

  if (question.type === QuestionType.StepByStep) {
    const stepQ = question as StepQuestion;
    let earlyStepsCorrect = 0;
    let laterStepsWrong = 0;

    for (let i = 0; i < stepQ.steps.length; i++) {
      const detail = comparison.details[i];
      if (detail && detail.matched) {
        earlyStepsCorrect++;
      } else if (earlyStepsCorrect > 0 && detail && !detail.matched) {
        laterStepsWrong++;
      }
    }

    if (earlyStepsCorrect > 0 && laterStepsWrong > 0) {
      confidence = 0.8;
      evidence = '前面步骤正确但后续步骤出错，典型计算错误传播';
    } else if (laterStepsWrong > 0) {
      confidence = 0.5;
      evidence = '后续步骤有误，可能存在计算错误';
    }
  }

  if (question.type === QuestionType.FillBlank) {
    for (const detail of comparison.details) {
      if (detail.similarity >= 0.5 && detail.similarity < 1) {
        confidence = Math.max(confidence, 0.5);
        evidence = '填空答案部分相似，可能存在计算偏差';
      }
    }
  }

  if (confidence === 0) {
    confidence = 0.1;
    evidence = '无明显计算错误迹象';
  }

  return { category: ErrorCategory.Calculation, confidence, evidence };
}

function classifyExpression(
  question: Question,
  comparison: ComparisonResult,
  scoreResult: ScoreResult,
): ErrorCategoryItem {
  let confidence = 0;
  let evidence = '';

  if (question.type === QuestionType.ShortAnswer || question.type === QuestionType.StepByStep) {
    const hasKeywordHits = scoreResult.hitEvidences.some(
      (e) => e.rule === 'keyword_match' || e.rule === 'step_keyword_match',
    );
    const scoreRatio = scoreResult.totalScore > 0 ? scoreResult.earnedScore / scoreResult.totalScore : 0;

    if (hasKeywordHits && scoreRatio < 1 && comparison.overallSimilarity < 0.7) {
      confidence = 0.75;
      evidence = '关键词命中但整体表述与参考答案差异较大，表达不准确';
    } else if (scoreRatio > 0.5 && comparison.overallSimilarity < 0.8) {
      confidence = 0.5;
      evidence = '得分尚可但表述与参考答案差异较大，表达需改进';
    } else if (comparison.overallSimilarity >= 0.7 && !comparison.overallMatched) {
      confidence = 0.6;
      evidence = '答案相近但不完全匹配，可能是表述问题';
    }
  }

  if (confidence === 0) {
    confidence = 0.1;
    evidence = '无明显表达问题';
  }

  return { category: ErrorCategory.Expression, confidence, evidence };
}

function classifyOmission(
  question: Question,
  answer: StudentAnswer,
  comparison: ComparisonResult,
): ErrorCategoryItem {
  let confidence = 0;
  let evidence = '';

  if (question.type === QuestionType.Choice) {
    const choiceA = answer as ChoiceAnswer;
    const choiceQ = question as ChoiceQuestion;
    const correctCount = choiceQ.options.filter((o) => o.isCorrect).length;
    if (choiceA.selectedLabels.length < correctCount && !comparison.overallMatched) {
      confidence = 0.8;
      evidence = `多选题仅选了${choiceA.selectedLabels.length}项，正确应为${correctCount}项，存在漏答`;
    }
  }

  if (question.type === QuestionType.FillBlank) {
    const fbA = answer as FillBlankAnswer;
    const fbQ = question as FillBlankQuestion;
    const answeredBlanks = Object.keys(fbA.values).length;
    if (answeredBlanks < fbQ.blanks.length) {
      confidence = 0.85;
      evidence = `填空题有${fbQ.blanks.length - answeredBlanks}个空未作答`;
    }
  }

  if (question.type === QuestionType.StepByStep) {
    const stepA = answer as StepAnswer;
    const stepQ = question as StepQuestion;
    const answeredSteps = Object.keys(stepA.steps).length;
    if (answeredSteps < stepQ.steps.length) {
      confidence = 0.85;
      evidence = `步骤题有${stepQ.steps.length - answeredSteps}个步骤未作答`;
    }
  }

  if (question.type === QuestionType.ShortAnswer) {
    const saA = answer as ShortAnswerAnswer;
    if (saA.text.trim().length === 0) {
      confidence = 0.95;
      evidence = '简答题未作答';
    }
  }

  if (confidence === 0) {
    confidence = 0.05;
    evidence = '无漏答迹象';
  }

  return { category: ErrorCategory.Omission, confidence, evidence };
}

export function classifyError(
  question: Question,
  answer: StudentAnswer,
  comparison: ComparisonResult,
  scoreResult: ScoreResult,
): ErrorClassificationResult {
  if (scoreResult.earnedScore >= scoreResult.totalScore) {
    return {
      questionId: question.id,
      categories: Object.values(ErrorCategory).map((cat) => ({
        category: cat,
        confidence: 0,
        evidence: '作答正确，无错因',
      })),
      dominantCategory: ErrorCategory.KnowledgePoint,
      reasoning: '满分作答，无需错因归类',
    };
  }

  const categories: ErrorCategoryItem[] = [
    classifyKnowledgePoint(question, comparison, scoreResult),
    classifyMisread(question, answer, comparison),
    classifyCalculation(question, comparison),
    classifyExpression(question, comparison, scoreResult),
    classifyOmission(question, answer, comparison),
  ];

  const sorted = [...categories].sort((a, b) => b.confidence - a.confidence);
  const dominant = sorted[0];

  const topCategories = categories
    .filter((c) => c.confidence >= 0.3)
    .sort((a, b) => b.confidence - a.confidence);

  const reasoning = topCategories.length === 0
    ? '无明显错因，建议人工复核'
    : topCategories
        .map((c) => `${categoryLabel(c.category)}(置信度${c.confidence.toFixed(2)}): ${c.evidence}`)
        .join('\uFF1B');

  return {
    questionId: question.id,
    categories,
    dominantCategory: dominant.category,
    reasoning,
  };
}

function categoryLabel(cat: ErrorCategory): string {
  const labels: Record<ErrorCategory, string> = {
    [ErrorCategory.KnowledgePoint]: '\u77E5\u8BC6\u70B9',
    [ErrorCategory.Misread]: '\u5BA1\u9898',
    [ErrorCategory.Calculation]: '\u8BA1\u7B97',
    [ErrorCategory.Expression]: '\u8868\u8FBE',
    [ErrorCategory.Omission]: '\u6F0F\u7B54',
  };
  return labels[cat];
}

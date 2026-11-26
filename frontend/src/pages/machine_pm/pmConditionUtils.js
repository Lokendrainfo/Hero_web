export const ANSWER_TYPE_OPTIONS = [
  { value: 'YES_NO', label: 'Yes / No' },
  { value: 'DROPDOWN', label: 'Dropdown' },
  { value: 'RADIO', label: 'Radio Button' },
  { value: 'MULTI_SELECT', label: 'Multiple Selection' },
  { value: 'NUMBER', label: 'Number' },
  { value: 'TEXT', label: 'Text' },
];

export const OPTION_ANSWER_TYPES = new Set(['DROPDOWN', 'RADIO', 'CHECKBOX', 'MULTI_SELECT']);

export const OPERATOR_LABELS = {
  EQUALS: 'Equals',
  NOT_EQUALS: 'Does Not Equal',
  GREATER_THAN: 'Greater Than',
  LESS_THAN: 'Less Than',
  CONTAINS: 'Contains',
};

const OPERATORS_BY_TYPE = {
  YES_NO: ['EQUALS', 'NOT_EQUALS'],
  DROPDOWN: ['EQUALS', 'NOT_EQUALS', 'CONTAINS'],
  RADIO: ['EQUALS', 'NOT_EQUALS'],
  MULTI_SELECT: ['CONTAINS', 'EQUALS', 'NOT_EQUALS'],
  CHECKBOX: ['CONTAINS', 'EQUALS', 'NOT_EQUALS'],
  NUMBER: ['EQUALS', 'NOT_EQUALS', 'GREATER_THAN', 'LESS_THAN'],
  DATE: ['EQUALS', 'NOT_EQUALS', 'GREATER_THAN', 'LESS_THAN'],
  TIME: ['EQUALS', 'NOT_EQUALS', 'GREATER_THAN', 'LESS_THAN'],
  TEXT: ['EQUALS', 'NOT_EQUALS', 'CONTAINS'],
  TEXTAREA: ['EQUALS', 'NOT_EQUALS', 'CONTAINS'],
};

export const getCompatibleOperators = (answerType) => {
  const ops = OPERATORS_BY_TYPE[(answerType || 'TEXT').toUpperCase()] || OPERATORS_BY_TYPE.TEXT;
  return ops.map((op) => ({ value: op, label: OPERATOR_LABELS[op] || op }));
};

export const isEmptyAnswer = (val) => {
  if (val === undefined || val === null) return true;
  if (typeof val === 'boolean') return false;
  if (Array.isArray(val)) return val.length === 0;
  return String(val).trim() === '';
};

const tryFloat = (val) => {
  if (val === null || val === undefined || typeof val === 'boolean' || String(val).trim() === '') return null;
  const num = Number(val);
  return Number.isNaN(num) ? null : num;
};

export const evaluateSingleRule = (rule, answerVal) => {
  if (isEmptyAnswer(answerVal)) return false;

  const op = String(rule?.operator || 'EQUALS').trim().toUpperCase();
  const expectedStr = rule?.expected_value === undefined || rule?.expected_value === null ? '' : String(rule.expected_value).trim();
  const expectedLower = expectedStr.toLowerCase();

  if (Array.isArray(answerVal)) {
    const normItems = answerVal.map((x) => String(x).trim().toLowerCase()).filter(Boolean);
    if (normItems.length === 0) return false;
    if (op === 'CONTAINS') return normItems.includes(expectedLower) || normItems.some((x) => x.includes(expectedLower));
    if (op === 'EQUALS') return (normItems.length === 1 && normItems[0] === expectedLower) || normItems.includes(expectedLower);
    if (op === 'NOT_EQUALS') return !normItems.includes(expectedLower);
    return false;
  }

  const ansStr = String(answerVal).trim();
  const ansLower = ansStr.toLowerCase();
  const ansNum = tryFloat(ansStr);
  const expNum = tryFloat(expectedStr);

  if (op === 'EQUALS') {
    if (ansNum !== null && expNum !== null) return ansNum === expNum;
    return ansLower === expectedLower;
  }
  if (op === 'NOT_EQUALS') {
    if (ansNum !== null && expNum !== null) return ansNum !== expNum;
    return ansLower !== expectedLower;
  }
  if (op === 'GREATER_THAN') {
    if (ansNum !== null && expNum !== null) return ansNum > expNum;
    return ansStr > expectedStr;
  }
  if (op === 'LESS_THAN') {
    if (ansNum !== null && expNum !== null) return ansNum < expNum;
    return ansStr < expectedStr;
  }
  if (op === 'CONTAINS') {
    return ansLower.includes(expectedLower);
  }
  return false;
};

export const evaluateCondition = (conditionMode, conditionLogic, conditionRules, answersMap) => {
  if (String(conditionMode || 'ALWAYS').toUpperCase() !== 'CONDITIONAL') return true;
  const rules = Array.isArray(conditionRules) ? conditionRules : [];
  if (rules.length === 0) return true;

  const logic = String(conditionLogic || 'AND').toUpperCase();
  const results = rules.map((r) => {
    const qId = r?.source_question_id ?? r?.question_id;
    const qName = r?.source_question_name;
    let ans;
    if (qId !== undefined && qId !== null && Object.prototype.hasOwnProperty.call(answersMap, String(qId))) {
      ans = answersMap[String(qId)];
    } else if (qName && Object.prototype.hasOwnProperty.call(answersMap, qName)) {
      ans = answersMap[qName];
    }
    return evaluateSingleRule(r, ans);
  });

  return logic === 'OR' ? results.some(Boolean) : results.every(Boolean);
};

export const evaluateActivityVisibility = (item, rawAnswersById = {}) => {
  const allQuestions = (item?.custom_fields || [])
    .filter((q) => q.is_active !== false)
    .slice()
    .sort((a, b) => (a.display_order || 0) - (b.display_order || 0) || a.id - b.id);

  const visibleQuestions = [];
  const effectiveAnswers = {};

  allQuestions.forEach((q) => {
    const isVis = evaluateCondition(q.condition_mode, q.condition_logic, q.condition_rules, effectiveAnswers);
    if (isVis) {
      visibleQuestions.push(q);
      const val = Object.prototype.hasOwnProperty.call(rawAnswersById, String(q.id))
        ? rawAnswersById[String(q.id)]
        : rawAnswersById[q.field_name];
      effectiveAnswers[String(q.id)] = val;
      if (q.field_name) effectiveAnswers[q.field_name] = val;
    }
  });

  const visibleQuestionIds = new Set(visibleQuestions.map((q) => String(q.id)));

  const isParentQuestionVisible = (req) => {
    if (req?.question_id === null || req?.question_id === undefined || req?.question_id === '') {
      return true;
    }
    return visibleQuestionIds.has(String(req.question_id));
  };

  const allPhotos = (item?.photo_requirements || [])
    .filter((p) => p.is_active !== false && p.is_required !== false)
    .slice()
    .sort((a, b) => (a.display_order || 0) - (b.display_order || 0) || a.id - b.id);

  const visiblePhotos = allPhotos.filter(
    (p) =>
      isParentQuestionVisible(p) &&
      evaluateCondition(p.condition_mode, p.condition_logic, p.condition_rules, effectiveAnswers)
  );

  const allVideos = (item?.video_requirements || [])
    .filter((v) => v.is_active !== false && v.is_required !== false)
    .slice()
    .sort((a, b) => (a.display_order || 0) - (b.display_order || 0) || a.id - b.id);

  const visibleVideos = allVideos.filter(
    (v) =>
      isParentQuestionVisible(v) &&
      evaluateCondition(v.condition_mode, v.condition_logic, v.condition_rules, effectiveAnswers)
  );

  const allLocations = (item?.location_requirements || [])
    .filter((l) => l.is_active !== false && l.is_required !== false)
    .slice()
    .sort((a, b) => (a.display_order || 0) - (b.display_order || 0) || a.id - b.id);

  const visibleLocations = allLocations.filter(
    (l) =>
      isParentQuestionVisible(l) &&
      evaluateCondition(l.condition_mode, l.condition_logic, l.condition_rules, effectiveAnswers)
  );

  return {
    allQuestions,
    visibleQuestions,
    allPhotos,
    visiblePhotos,
    allVideos,
    visibleVideos,
    allLocations,
    visibleLocations,
  };
};

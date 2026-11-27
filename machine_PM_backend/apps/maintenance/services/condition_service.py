from apps.maintenance.models import ChecklistConditionRule, ChecklistCustomFieldConfig

ALLOWED_OPERATORS_BY_TYPE = {
    ChecklistCustomFieldConfig.TYPE_YES_NO: ('EQUALS', 'NOT_EQUALS'),
    ChecklistCustomFieldConfig.TYPE_DROPDOWN: ('EQUALS', 'NOT_EQUALS', 'CONTAINS'),
    ChecklistCustomFieldConfig.TYPE_RADIO: ('EQUALS', 'NOT_EQUALS'),
    ChecklistCustomFieldConfig.TYPE_CHECKBOX: ('CONTAINS', 'EQUALS', 'NOT_EQUALS'),
    ChecklistCustomFieldConfig.TYPE_MULTI_SELECT: ('CONTAINS', 'EQUALS', 'NOT_EQUALS'),
    ChecklistCustomFieldConfig.TYPE_NUMBER: ('EQUALS', 'NOT_EQUALS', 'GREATER_THAN', 'LESS_THAN'),
    ChecklistCustomFieldConfig.TYPE_TEXT: ('EQUALS', 'NOT_EQUALS', 'CONTAINS'),
    ChecklistCustomFieldConfig.TYPE_TEXTAREA: ('EQUALS', 'NOT_EQUALS', 'CONTAINS'),
    ChecklistCustomFieldConfig.TYPE_DATE: ('EQUALS', 'NOT_EQUALS', 'GREATER_THAN', 'LESS_THAN'),
    ChecklistCustomFieldConfig.TYPE_TIME: ('EQUALS', 'NOT_EQUALS', 'GREATER_THAN', 'LESS_THAN'),
    ChecklistCustomFieldConfig.TYPE_EVIDENCE_ONLY: (),
}


def is_answer_empty(val) -> bool:
    if val is None:
        return True
    if isinstance(val, bool):
        return False
    if isinstance(val, list):
        return len(val) == 0
    return str(val).strip() == ''


def _try_float(val):
    if isinstance(val, bool) or val is None:
        return None
    try:
        return float(str(val).strip())
    except (TypeError, ValueError):
        return None


def evaluate_single_rule(rule: dict, answer_val) -> bool:
    if is_answer_empty(answer_val):
        return False

    op = str(rule.get('operator') or ChecklistConditionRule.OP_EQUALS).strip().upper()
    expected_raw = rule.get('expected_value')
    expected_str = '' if expected_raw is None else str(expected_raw).strip()
    expected_lower = expected_str.lower()

    if isinstance(answer_val, list):
        norm_items = [str(item).strip().lower() for item in answer_val if str(item).strip() != '']
        if not norm_items:
            return False
        if op == ChecklistConditionRule.OP_CONTAINS:
            return expected_lower in norm_items or any(expected_lower in it for it in norm_items)
        if op == ChecklistConditionRule.OP_EQUALS:
            return norm_items == [expected_lower] or expected_lower in norm_items
        if op == ChecklistConditionRule.OP_NOT_EQUALS:
            return expected_lower not in norm_items
        return False

    ans_str = str(answer_val).strip()
    ans_lower = ans_str.lower()
    ans_num = _try_float(ans_str)
    exp_num = _try_float(expected_str)

    if op == ChecklistConditionRule.OP_EQUALS:
        if ans_num is not None and exp_num is not None:
            return ans_num == exp_num
        return ans_lower == expected_lower
    if op == ChecklistConditionRule.OP_NOT_EQUALS:
        if ans_num is not None and exp_num is not None:
            return ans_num != exp_num
        return ans_lower != expected_lower
    if op == ChecklistConditionRule.OP_GREATER_THAN:
        if ans_num is not None and exp_num is not None:
            return ans_num > exp_num
        return ans_str > expected_str
    if op == ChecklistConditionRule.OP_LESS_THAN:
        if ans_num is not None and exp_num is not None:
            return ans_num < exp_num
        return ans_str < expected_str
    if op == ChecklistConditionRule.OP_CONTAINS:
        return expected_lower in ans_lower
    return False


def evaluate_condition(
    condition_mode: str,
    condition_logic: str,
    condition_rules: list,
    answers_by_question: dict,
) -> bool:
    mode = str(condition_mode or 'ALWAYS').strip().upper()
    if mode != 'CONDITIONAL':
        return True
    rules = condition_rules or []
    if not rules:
        return True

    logic = str(condition_logic or 'AND').strip().upper()
    results = []
    for r in rules:
        if not isinstance(r, dict):
            continue
        q_id = r.get('source_question_id') or r.get('question_id')
        q_name = r.get('source_question_name')
        ans = None
        if q_id is not None and str(q_id) in answers_by_question:
            ans = answers_by_question.get(str(q_id))
        elif q_name and str(q_name) in answers_by_question:
            ans = answers_by_question.get(str(q_name))
        results.append(evaluate_single_rule(r, ans))

    if not results:
        return True
    return any(results) if logic == 'OR' else all(results)


def evaluate_activity_visibility(
    questions: list,
    photo_reqs: list,
    video_reqs: list,
    raw_answers_map: dict,
    location_reqs: list | None = None,
):
    """
    Iteratively resolves Question visibility in display_order, then evaluates Photo, Video, and Location visibility.
    Any child evidence attached to a hidden Question is automatically hidden as well.
    """
    active_questions = sorted(
        [
            q for q in questions
            if q.is_active and (getattr(q, 'section_id', None) is None or (getattr(q, 'section', None) and q.section.is_active))
        ],
        key=lambda x: (
            x.section.display_order if getattr(x, 'section', None) else 0,
            x.display_order,
            x.id,
        ),
    )

    visible_questions = []
    question_visibility = {}
    effective_answers = {}

    for q in active_questions:
        is_vis = evaluate_condition(
            q.condition_mode,
            q.condition_logic,
            q.condition_rules,
            effective_answers,
        )
        question_visibility[q.id] = is_vis
        if is_vis:
            visible_questions.append(q)
            if q.field_type != ChecklistCustomFieldConfig.TYPE_EVIDENCE_ONLY:
                val = raw_answers_map.get(str(q.id))
                if val is None and str(q.id) not in raw_answers_map:
                    val = raw_answers_map.get(q.field_name)
                effective_answers[str(q.id)] = val
                effective_answers[q.field_name] = val

    def _is_parent_question_visible(req_obj) -> bool:
        qid = getattr(req_obj, 'question_id', None)
        if not qid:
            return True
        return bool(question_visibility.get(qid, False))

    visible_photos = []
    photo_visibility = {}
    for pr in sorted(
        [p for p in photo_reqs if p.is_active and p.is_required],
        key=lambda x: (x.display_order, x.id),
    ):
        is_vis = _is_parent_question_visible(pr) and evaluate_condition(
            pr.condition_mode,
            pr.condition_logic,
            pr.condition_rules,
            effective_answers,
        )
        photo_visibility[pr.id] = is_vis
        if is_vis:
            visible_photos.append(pr)

    visible_videos = []
    video_visibility = {}
    for vr in sorted(
        [v for v in video_reqs if v.is_active and v.is_required],
        key=lambda x: (x.display_order, x.id),
    ):
        is_vis = _is_parent_question_visible(vr) and evaluate_condition(
            vr.condition_mode,
            vr.condition_logic,
            vr.condition_rules,
            effective_answers,
        )
        video_visibility[vr.id] = is_vis
        if is_vis:
            visible_videos.append(vr)

    if location_reqs is None:
        return (
            visible_questions,
            visible_photos,
            visible_videos,
            effective_answers,
            question_visibility,
            photo_visibility,
            video_visibility,
        )

    visible_locations = []
    location_visibility = {}
    for lr in sorted(
        [l for l in location_reqs if l.is_active and l.is_required],
        key=lambda x: (x.display_order, x.id),
    ):
        is_vis = _is_parent_question_visible(lr) and evaluate_condition(
            lr.condition_mode,
            lr.condition_logic,
            lr.condition_rules,
            effective_answers,
        )
        location_visibility[lr.id] = is_vis
        if is_vis:
            visible_locations.append(lr)

    return (
        visible_questions,
        visible_photos,
        visible_videos,
        visible_locations,
        effective_answers,
        question_visibility,
        photo_visibility,
        video_visibility,
        location_visibility,
    )

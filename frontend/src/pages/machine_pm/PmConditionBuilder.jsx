import React from 'react';
import { LucideAlertTriangle, LucideGitBranch, LucidePlus, LucideTrash2 } from 'lucide-react';
import { getCompatibleOperators } from './pmConditionUtils';

const inputStyle = {
  width: '100%',
  height: '34px',
  padding: '0 8px',
  border: '1px solid var(--border-strong)',
  borderRadius: 'var(--radius)',
  fontSize: '0.8rem',
  background: '#fff',
};

const getQuestionKey = (q) => String(q.id || q.temp_key || '');

export const PmConditionBuilder = ({
  ownerLabel,
  conditionMode,
  conditionLogic,
  conditionRules = [],
  availableQuestions = [],
  excludeQuestionKey = null,
  onChange,
}) => {
  const eligibleQuestions = availableQuestions.filter(
    (q) =>
      q.is_active !== false &&
      String(q.answer_type || '').toUpperCase() !== 'EVIDENCE_ONLY' &&
      getQuestionKey(q) !== String(excludeQuestionKey || '')
  );

  const findQuestionByRule = (rule) => {
    const key = String(rule?.source_question_key ?? rule?.source_question_id ?? '');
    return availableQuestions.find((q) => getQuestionKey(q) === key || String(q.id) === key);
  };

  const handleModeChange = (nextMode) => {
    if (nextMode === 'ALWAYS') {
      onChange({ condition_mode: 'ALWAYS', condition_logic: conditionLogic || 'AND', condition_rules: [] });
      return;
    }
    const defaultQ = eligibleQuestions[0];
    const defaultOps = defaultQ ? getCompatibleOperators(defaultQ.answer_type) : [{ value: 'EQUALS' }];
    const initialRules =
      conditionRules.length > 0
        ? conditionRules
        : defaultQ
          ? [
              {
                source_question_key: getQuestionKey(defaultQ),
                source_question_id: defaultQ.id || null,
                operator: defaultOps[0].value,
                expected_value:
                  defaultQ.answer_type === 'YES_NO'
                    ? 'Yes'
                    : defaultQ.options?.[0] || '',
              },
            ]
          : [];
    onChange({
      condition_mode: 'CONDITIONAL',
      condition_logic: conditionLogic || 'AND',
      condition_rules: initialRules,
    });
  };

  const handleAddRule = () => {
    const defaultQ = eligibleQuestions[0];
    if (!defaultQ) return;
    const defaultOps = getCompatibleOperators(defaultQ.answer_type);
    onChange({
      condition_mode: 'CONDITIONAL',
      condition_logic: conditionLogic || 'AND',
      condition_rules: [
        ...conditionRules,
        {
          source_question_key: getQuestionKey(defaultQ),
          source_question_id: defaultQ.id || null,
          operator: defaultOps[0].value,
          expected_value: defaultQ.answer_type === 'YES_NO' ? 'Yes' : defaultQ.options?.[0] || '',
        },
      ],
    });
  };

  const handleUpdateRule = (idx, patch) => {
    const next = conditionRules.map((r, i) => (i === idx ? { ...r, ...patch } : r));
    onChange({
      condition_mode: conditionMode,
      condition_logic: conditionLogic || 'AND',
      condition_rules: next,
    });
  };

  const handleRemoveRule = (idx) => {
    const next = conditionRules.filter((_, i) => i !== idx);
    if (next.length === 0) {
      onChange({ condition_mode: 'ALWAYS', condition_logic: 'AND', condition_rules: [] });
      return;
    }
    onChange({
      condition_mode: 'CONDITIONAL',
      condition_logic: conditionLogic || 'AND',
      condition_rules: next,
    });
  };

  return (
    <div
      style={{
        padding: '10px 12px',
        borderRadius: 'var(--radius)',
        border: '1px dashed var(--border-strong)',
        background: '#ffffff',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
        <span style={{ fontSize: '0.76rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '5px', color: 'var(--text-primary)' }}>
          <LucideGitBranch size={13} /> Trigger Condition
        </span>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '0.76rem', fontWeight: 600, cursor: 'pointer' }}>
            <input
              type="radio"
              checked={conditionMode !== 'CONDITIONAL'}
              onChange={() => handleModeChange('ALWAYS')}
            />
            No Condition – Always Display
          </label>
          <label
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              fontSize: '0.76rem',
              fontWeight: 600,
              cursor: eligibleQuestions.length > 0 ? 'pointer' : 'not-allowed',
              opacity: eligibleQuestions.length > 0 ? 1 : 0.55,
            }}
          >
            <input
              type="radio"
              checked={conditionMode === 'CONDITIONAL'}
              disabled={eligibleQuestions.length === 0}
              onChange={() => handleModeChange('CONDITIONAL')}
            />
            Conditional Display – Based on Question Answers
          </label>
        </div>
      </div>

      {conditionMode === 'CONDITIONAL' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {conditionRules.length > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem' }}>
              <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>Match Logic:</span>
              <select
                value={conditionLogic || 'AND'}
                onChange={(e) =>
                  onChange({ condition_mode: 'CONDITIONAL', condition_logic: e.target.value, condition_rules: conditionRules })
                }
                style={{ ...inputStyle, width: 'auto', minWidth: '160px', height: '30px' }}
              >
                <option value="AND">ALL conditions (AND)</option>
                <option value="OR">ANY condition (OR)</option>
              </select>
            </div>
          )}

          {conditionRules.map((rule, rIdx) => {
            const matchedQ = findQuestionByRule(rule);
            const isBroken = !matchedQ || matchedQ.is_active === false || getQuestionKey(matchedQ) === String(excludeQuestionKey || '');
            const compatOps = matchedQ ? getCompatibleOperators(matchedQ.answer_type) : getCompatibleOperators('TEXT');
            const qOpts = matchedQ?.options || [];

            return (
              <div
                key={`rule-${rIdx}`}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  padding: '8px',
                  borderRadius: '6px',
                  border: isBroken ? '1px solid #dc2626' : '1px solid var(--border)',
                  background: isBroken ? '#fef2f2' : 'var(--bg-subtle)',
                }}
              >
                {isBroken && (
                  <div style={{ fontSize: '0.72rem', color: '#dc2626', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <LucideAlertTriangle size={12} /> Referenced question was deleted or deactivated. Update or remove this condition.
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(160px, 1.3fr) minmax(130px, 0.9fr) minmax(140px, 1fr) auto', gap: '8px', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: '2px' }}>IF Question</div>
                    <select
                      value={matchedQ ? getQuestionKey(matchedQ) : ''}
                      onChange={(e) => {
                        const newQ = eligibleQuestions.find((q) => getQuestionKey(q) === e.target.value);
                        if (!newQ) return;
                        const newOps = getCompatibleOperators(newQ.answer_type);
                        handleUpdateRule(rIdx, {
                          source_question_key: getQuestionKey(newQ),
                          source_question_id: newQ.id || null,
                          operator: newOps[0].value,
                          expected_value: newQ.answer_type === 'YES_NO' ? 'Yes' : newQ.options?.[0] || '',
                        });
                      }}
                      style={inputStyle}
                    >
                      <option value="">-- Select Question --</option>
                      {eligibleQuestions.map((q, qIdx) => (
                        <option key={getQuestionKey(q)} value={getQuestionKey(q)}>
                          {q.question_name || `Question ${qIdx + 1}`}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: '2px' }}>CONDITION</div>
                    <select
                      value={rule.operator || 'EQUALS'}
                      onChange={(e) => handleUpdateRule(rIdx, { operator: e.target.value })}
                      style={inputStyle}
                    >
                      {compatOps.map((op) => (
                        <option key={op.value} value={op.value}>{op.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: '2px' }}>ANSWER</div>
                    {matchedQ?.answer_type === 'YES_NO' ? (
                      <select
                        value={rule.expected_value || 'Yes'}
                        onChange={(e) => handleUpdateRule(rIdx, { expected_value: e.target.value })}
                        style={inputStyle}
                      >
                        <option value="Yes">Yes</option>
                        <option value="No">No</option>
                      </select>
                    ) : qOpts.length > 0 ? (
                      <select
                        value={rule.expected_value || ''}
                        onChange={(e) => handleUpdateRule(rIdx, { expected_value: e.target.value })}
                        style={inputStyle}
                      >
                        <option value="">-- Select Option --</option>
                        {qOpts.map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={matchedQ?.answer_type === 'NUMBER' ? 'number' : 'text'}
                        step="any"
                        value={rule.expected_value || ''}
                        onChange={(e) => handleUpdateRule(rIdx, { expected_value: e.target.value })}
                        placeholder="Expected value..."
                        style={inputStyle}
                      />
                    )}
                  </div>

                  <div style={{ paddingTop: '14px' }}>
                    <button
                      type="button"
                      className="btn-danger"
                      style={{ padding: '4px 8px', fontSize: '0.72rem' }}
                      onClick={() => handleRemoveRule(rIdx)}
                      title={`Remove rule on ${ownerLabel}`}
                    >
                      <LucideTrash2 size={12} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {eligibleQuestions.length > 0 && (
            <div>
              <button type="button" className="btn-secondary" style={{ fontSize: '0.74rem', padding: '4px 10px' }} onClick={handleAddRule}>
                <LucidePlus size={12} /> Add Another Condition Rule
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

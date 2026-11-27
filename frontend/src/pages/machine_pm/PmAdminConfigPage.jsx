import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LucideArrowDown,
  LucideArrowUp,
  LucideCamera,
  LucideChevronDown,
  LucideChevronUp,
  LucideCopy,
  LucideEdit2,
  LucideHelpCircle,
  LucideLayers,
  LucideMapPin,
  LucidePlus,
  LucideRotateCcw,
  LucideSave,
  LucideTrash2,
  LucideVideo,
  LucideX,
} from 'lucide-react';
import { pmService } from '../../services/pmService';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../context/ToastContext';
import { SearchableSelect } from '../../components/common/Select';
import { PmLayoutHeader } from './PmLayoutHeader';
import { PmConditionBuilder } from './PmConditionBuilder';
import { ANSWER_TYPE_OPTIONS, OPTION_ANSWER_TYPES } from './pmConditionUtils';
import { parsePolygonCoordinateRows } from './pmGeofenceUtils';
import {
  PmFrequencyScheduleEditor,
  SCHEDULE_FREQUENCY_OPTIONS,
  createDefaultScheduleForFrequency,
  hydrateScheduleFromApi,
  serializeSchedulePayload,
  validateScheduleClient,
} from './PmFrequencyScheduleEditor';

const CALENDAR_FREQUENCY_OPTIONS = SCHEDULE_FREQUENCY_OPTIONS;

const CALENDAR_FREQ_CODES = new Set(CALENDAR_FREQUENCY_OPTIONS.map((f) => f.code));

let localSeq = 1;
const nextTempKey = (prefix = 'item') => {
  localSeq += 1;
  return `${prefix}-${Date.now()}-${localSeq}`;
};

const getQuestionKey = (q) => String(q.id || q.temp_key || '');
const getSectionKey = (s) => String(s.id || s.temp_key || '');

const createEmptyPhotoRow = (order = 1) => ({
  id: null,
  local_key: nextTempKey('photo'),
  photo_name: '',
  photo_description: '',
  is_mandatory: false,
  display_order: order,
  is_active: true,
  condition_mode: 'ALWAYS',
  condition_logic: 'AND',
  condition_rules: [],
});

const createEmptyVideoRow = (order = 1) => ({
  id: null,
  local_key: nextTempKey('video'),
  video_name: '',
  video_description: '',
  min_videos: 0,
  max_videos: 1,
  max_duration_seconds: 60,
  is_mandatory: false,
  display_order: order,
  is_active: true,
  condition_mode: 'ALWAYS',
  condition_logic: 'AND',
  condition_rules: [],
});

const createEmptyLocationRow = (order = 1) => ({
  id: null,
  local_key: nextTempKey('loc'),
  location_name: 'GPS Location',
  location_description: '',
  capture_latitude: true,
  capture_longitude: true,
  accuracy_threshold_meters: '',
  capture_timestamp: true,
  capture_rule: 'LIVE_GPS',
  is_mandatory: false,
  is_geofence_required: false,
  geofence_type: 'CIRCLE',
  geofence_reference_name: '',
  geofence_latitude: '',
  geofence_longitude: '',
  geofence_radius_meters: '',
  geofence_polygon: [],
  display_order: order,
  is_active: true,
  condition_mode: 'ALWAYS',
  condition_logic: 'AND',
  condition_rules: [],
});

const createEmptyQuestionRow = (order = 1) => ({
  id: null,
  temp_key: nextTempKey('q'),
  question_name: '',
  question_description: '',
  answer_type: 'YES_NO',
  optionInput: '',
  options: [],
  is_mandatory: false,
  display_order: order,
  is_active: true,
  condition_mode: 'ALWAYS',
  condition_logic: 'AND',
  condition_rules: [],
  is_photo_required: false,
  photos: [],
  is_video_required: false,
  videos: [],
  is_location_required: false,
  locations: [],
});

const createEmptySectionRow = (order = 1) => ({
  id: null,
  temp_key: nextTempKey('sec'),
  section_name: '',
  section_description: '',
  display_order: order,
  is_active: true,
  questions: [],
});

const createInitialFormState = (defaultCategoryId = '') => ({
  activity_name: '',
  description: '',
  item_code: '',
  category: defaultCategoryId,
  frequency: '',
  frequency_schedule: null,
  questions_enabled: false,
  sections: [],
});

const cleanRulesByKeys = (rules = [], removedKeys) =>
  rules.filter((r) => !removedKeys.has(String(r?.source_question_key ?? r?.source_question_id ?? '')));

const stripRemovedQuestionRulesFromSections = (sections = [], removedKeys) =>
  sections.map((sec) => ({
    ...sec,
    questions: (sec.questions || []).map((q) => {
      const remQ = cleanRulesByKeys(q.condition_rules, removedKeys);
      return {
        ...q,
        condition_rules: remQ,
        condition_mode: remQ.length === 0 ? 'ALWAYS' : q.condition_mode,
        photos: (q.photos || []).map((p) => {
          const remP = cleanRulesByKeys(p.condition_rules, removedKeys);
          return { ...p, condition_rules: remP, condition_mode: remP.length === 0 ? 'ALWAYS' : p.condition_mode };
        }),
        videos: (q.videos || []).map((v) => {
          const remV = cleanRulesByKeys(v.condition_rules, removedKeys);
          return { ...v, condition_rules: remV, condition_mode: remV.length === 0 ? 'ALWAYS' : v.condition_mode };
        }),
        locations: (q.locations || []).map((l) => {
          const remL = cleanRulesByKeys(l.condition_rules, removedKeys);
          return { ...l, condition_rules: remL, condition_mode: remL.length === 0 ? 'ALWAYS' : l.condition_mode };
        }),
      };
    }),
  }));

const hydrateQuestionFromApi = (q, idx = 0) => ({
  id: q.id,
  temp_key: q.temp_key || `q-${q.id}`,
  question_name: q.question_name || '',
  question_description: q.question_description || '',
  answer_type: q.answer_type || 'TEXT',
  optionInput: '',
  options: Array.isArray(q.options) ? q.options : [],
  is_mandatory: Boolean(q.is_mandatory),
  display_order: q.display_order ?? idx + 1,
  is_active: q.is_active !== false,
  condition_mode: q.condition_mode || 'ALWAYS',
  condition_logic: q.condition_logic || 'AND',
  condition_rules: Array.isArray(q.condition_rules) ? q.condition_rules : [],
  is_photo_required: Boolean(q.is_photo_required && q.photos && q.photos.length > 0),
  photos: (q.photos || []).map((p, pIdx) => ({
    id: p.id,
    local_key: `photo-${p.id}`,
    photo_name: p.photo_name || '',
    photo_description: p.photo_description || '',
    is_mandatory: Boolean(p.is_mandatory),
    display_order: p.display_order ?? pIdx + 1,
    is_active: p.is_active !== false,
    condition_mode: p.condition_mode || 'ALWAYS',
    condition_logic: p.condition_logic || 'AND',
    condition_rules: Array.isArray(p.condition_rules) ? p.condition_rules : [],
  })),
  is_video_required: Boolean(q.is_video_required && q.videos && q.videos.length > 0),
  videos: (q.videos || []).map((v, vIdx) => ({
    id: v.id,
    local_key: `video-${v.id}`,
    video_name: v.video_name || '',
    video_description: v.video_description || '',
    min_videos: v.min_videos ?? 0,
    max_videos: v.max_videos ?? 1,
    max_duration_seconds: Number(v.max_duration_seconds || 60),
    is_mandatory: Boolean(v.is_mandatory),
    display_order: v.display_order ?? vIdx + 1,
    is_active: v.is_active !== false,
    condition_mode: v.condition_mode || 'ALWAYS',
    condition_logic: v.condition_logic || 'AND',
    condition_rules: Array.isArray(v.condition_rules) ? v.condition_rules : [],
  })),
  is_location_required: Boolean(q.is_location_required && q.locations && q.locations.length > 0),
  locations: (q.locations || []).map((l, lIdx) => ({
    id: l.id,
    local_key: `loc-${l.id}`,
    location_name: l.location_name || 'GPS Location',
    location_description: l.location_description || '',
    capture_latitude: l.capture_latitude !== false,
    capture_longitude: l.capture_longitude !== false,
    accuracy_threshold_meters:
      l.accuracy_threshold_meters !== null && l.accuracy_threshold_meters !== undefined
        ? String(l.accuracy_threshold_meters)
        : '',
    capture_timestamp: l.capture_timestamp !== false,
    capture_rule: l.capture_rule || 'LIVE_GPS',
    is_mandatory: Boolean(l.is_mandatory),
    is_geofence_required: Boolean(l.is_geofence_required),
    geofence_type: l.geofence_type || 'CIRCLE',
    geofence_reference_name: l.geofence_reference_name || '',
    geofence_latitude:
      l.geofence_latitude !== null && l.geofence_latitude !== undefined ? String(l.geofence_latitude) : '',
    geofence_longitude:
      l.geofence_longitude !== null && l.geofence_longitude !== undefined ? String(l.geofence_longitude) : '',
    geofence_radius_meters:
      l.geofence_radius_meters !== null && l.geofence_radius_meters !== undefined
        ? String(l.geofence_radius_meters)
        : '',
    geofence_polygon: parsePolygonCoordinateRows(l.geofence_polygon || []),
    display_order: l.display_order ?? lIdx + 1,
    is_active: l.is_active !== false,
    condition_mode: l.condition_mode || 'ALWAYS',
    condition_logic: l.condition_logic || 'AND',
    condition_rules: Array.isArray(l.condition_rules) ? l.condition_rules : [],
  })),
});

const inputStyle = {
  width: '100%',
  height: '38px',
  padding: '0 10px',
  border: '1px solid var(--border-strong)',
  borderRadius: 'var(--radius)',
  fontSize: '0.84rem',
  background: '#fff',
};

const smallInputStyle = {
  ...inputStyle,
  height: '34px',
  fontSize: '0.8rem',
};

const textareaStyle = {
  width: '100%',
  padding: '8px 10px',
  border: '1px solid var(--border-strong)',
  borderRadius: 'var(--radius)',
  fontSize: '0.84rem',
  background: '#fff',
  resize: 'vertical',
};

const labelStyle = {
  fontSize: '0.78rem',
  fontWeight: 600,
  display: 'block',
  marginBottom: '4px',
  color: 'var(--text-primary)',
};

const unwrap = (res) => {
  if (Array.isArray(res)) return res;
  if (Array.isArray(res?.data)) return res.data;
  if (Array.isArray(res?.results)) return res.results;
  return [];
};

const EvidenceConditionEditor = ({
  ownerLabel,
  parentQuestion,
  allQuestions,
  conditionMode,
  conditionLogic,
  conditionRules = [],
  onChange,
}) => {
  const parentKey = getQuestionKey(parentQuestion);
  const rules = Array.isArray(conditionRules) ? conditionRules : [];
  const cleanOpts = (parentQuestion.options || []).map((o) => String(o).trim()).filter(Boolean);

  const isSingleParentEq =
    conditionMode === 'CONDITIONAL' &&
    rules.length === 1 &&
    String(rules[0]?.source_question_key ?? rules[0]?.source_question_id ?? '') === parentKey &&
    String(rules[0]?.operator || 'EQUALS').toUpperCase() === 'EQUALS';

  let activePreset = 'ALWAYS';
  if (conditionMode === 'CONDITIONAL') {
    if (isSingleParentEq && parentQuestion.answer_type === 'YES_NO') {
      const expLower = String(rules[0]?.expected_value || '').trim().toLowerCase();
      if (expLower === 'yes') activePreset = 'WHEN_YES';
      else if (expLower === 'no') activePreset = 'WHEN_NO';
      else activePreset = 'CUSTOM';
    } else if (isSingleParentEq && OPTION_ANSWER_TYPES.has(parentQuestion.answer_type) && cleanOpts.length > 0) {
      activePreset = 'WHEN_OPTION';
    } else {
      activePreset = 'CUSTOM';
    }
  }

  const applyParentRule = (expectedVal) => {
    onChange({
      condition_mode: 'CONDITIONAL',
      condition_logic: 'AND',
      condition_rules: [
        {
          source_question_key: parentKey,
          source_question_id: parentQuestion.id || null,
          operator: 'EQUALS',
          expected_value: expectedVal,
        },
      ],
    });
  };

  const handlePresetChange = (preset) => {
    if (preset === 'ALWAYS') {
      onChange({ condition_mode: 'ALWAYS', condition_logic: 'AND', condition_rules: [] });
      return;
    }
    if (preset === 'WHEN_YES') {
      applyParentRule('Yes');
      return;
    }
    if (preset === 'WHEN_NO') {
      applyParentRule('No');
      return;
    }
    if (preset === 'WHEN_OPTION') {
      applyParentRule(cleanOpts[0] || '');
      return;
    }
    // CUSTOM
    const defaultOps = [{ value: 'EQUALS' }];
    onChange({
      condition_mode: 'CONDITIONAL',
      condition_logic: conditionLogic || 'AND',
      condition_rules:
        rules.length > 0
          ? rules
          : [
              {
                source_question_key: parentKey,
                source_question_id: parentQuestion.id || null,
                operator: defaultOps[0].value,
                expected_value: parentQuestion.answer_type === 'YES_NO' ? 'Yes' : cleanOpts[0] || '',
              },
            ],
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
          Condition Trigger:
        </span>
        <select
          value={activePreset}
          onChange={(e) => handlePresetChange(e.target.value)}
          style={{ ...smallInputStyle, width: 'auto', minWidth: '230px' }}
        >
          <option value="ALWAYS">Always Show (No Condition)</option>
          {parentQuestion.answer_type === 'YES_NO' && (
            <>
              <option value="WHEN_YES">Show When Answer = Yes</option>
              <option value="WHEN_NO">Show When Answer = No</option>
            </>
          )}
          {OPTION_ANSWER_TYPES.has(parentQuestion.answer_type) && cleanOpts.length > 0 && (
            <option value="WHEN_OPTION">Show When Answer = Selected Option</option>
          )}
          <option value="CUSTOM">Custom Multi-Question Rules (AND / OR)</option>
        </select>

        {activePreset === 'WHEN_OPTION' && cleanOpts.length > 0 && (
          <select
            value={rules[0]?.expected_value || cleanOpts[0]}
            onChange={(e) => applyParentRule(e.target.value)}
            style={{ ...smallInputStyle, width: 'auto', minWidth: '170px' }}
          >
            {cleanOpts.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        )}
      </div>

      {activePreset === 'CUSTOM' && (
        <PmConditionBuilder
          ownerLabel={ownerLabel}
          conditionMode={conditionMode}
          conditionLogic={conditionLogic}
          conditionRules={conditionRules}
          availableQuestions={allQuestions}
          excludeQuestionKey={null}
          onChange={onChange}
        />
      )}
    </div>
  );
};

export const PmAdminConfigPage = () => {
  const { isAdmin } = useAuth();
  const { showToast } = useToast();
  const showToastRef = useRef(showToast);
  showToastRef.current = showToast;
  const navigate = useNavigate();

  const [roleInfo, setRoleInfo] = useState(null);
  const [categories, setCategories] = useState([]);
  const [siteMachines, setSiteMachines] = useState([]);
  const [savedConfigs, setSavedConfigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(() => createInitialFormState(''));
  const [scheduleDraftsByFreq, setScheduleDraftsByFreq] = useState({});
  const [collapsedSections, setCollapsedSections] = useState({});
  const [collapsedQuestions, setCollapsedQuestions] = useState({});

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [fRes, catRes, cfgRes, machRes] = await Promise.all([
        pmService.getFrequencies(),
        pmService.getAdminCategories({ page_size: 50 }),
        pmService.getAdminActivityConfigurations(),
        pmService.getMachines({ page_size: 100 }).catch(() => null),
      ]);
      setRoleInfo(fRes?.data?.role_info || null);
      const catList = unwrap(catRes).filter((c) => c.is_checkable !== false);
      setCategories(catList);
      setSavedConfigs(unwrap(cfgRes));
      setSiteMachines(unwrap(machRes));

      const defaultCatId = catList[0] ? String(catList[0].id) : '';
      setForm((prev) => (prev.category ? prev : { ...prev, category: defaultCatId }));
    } catch (err) {
      showToastRef.current(err?.message || 'Admin permission required to access maintenance configuration.', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (!isAdmin && roleInfo && !roleInfo.is_admin) {
    return (
      <div className="screen-container">
        <PmLayoutHeader title="Maintenance Configuration" roleInfo={roleInfo} />
        <div className="empty-state" style={{ marginTop: '16px' }}>
          <h3>Admin Access Required</h3>
          <p>Only Administrators can configure preventive maintenance questions, photos, videos, GPS, and conditions.</p>
        </div>
      </div>
    );
  }

  const defaultCatId = categories[0] ? String(categories[0].id) : '';

  const resetForm = () => {
    setEditingId(null);
    setScheduleDraftsByFreq({});
    setCollapsedSections({});
    setCollapsedQuestions({});
    setForm(createInitialFormState(defaultCatId));
  };

  const handleSelectFrequency = (code) => {
    const nextDrafts = form.frequency && form.frequency_schedule
      ? { ...scheduleDraftsByFreq, [form.frequency]: form.frequency_schedule }
      : scheduleDraftsByFreq;
    if (form.frequency && form.frequency_schedule) {
      setScheduleDraftsByFreq(nextDrafts);
    }
    setForm((prev) => ({
      ...prev,
      frequency: code,
      frequency_schedule: nextDrafts[code] || createDefaultScheduleForFrequency(code),
    }));
  };

  const handleScheduleChange = (code, nextSched) => {
    setScheduleDraftsByFreq((prev) => ({ ...prev, [code]: nextSched }));
    setForm((prev) => ({
      ...prev,
      frequency_schedule: nextSched,
    }));
  };

  const toggleSectionCollapse = (secKey) => {
    setCollapsedSections((prev) => ({
      ...prev,
      [secKey]: !prev[secKey],
    }));
  };

  const toggleQuestionCollapse = (qKey) => {
    setCollapsedQuestions((prev) => ({
      ...prev,
      [qKey]: !prev[qKey],
    }));
  };

  const getAllFlatQuestions = (sections = form.sections) =>
    (sections || []).flatMap((sec) => sec.questions || []);

  // Find any question or nested evidence rule referencing any of the target question keys
  const findDependentRulesForKeys = (targetKeysSet, sections = form.sections) => {
    const deps = [];
    const checkRuleList = (rules = []) =>
      rules.some((r) => targetKeysSet.has(String(r?.source_question_key ?? r?.source_question_id ?? '')));

    (sections || []).forEach((sec, sIdx) => {
      const secLabel = sec.section_name || `Section ${sIdx + 1}`;
      (sec.questions || []).forEach((q, idx) => {
        const isTarget = targetKeysSet.has(getQuestionKey(q));
        if (!isTarget && q.condition_mode === 'CONDITIONAL' && checkRuleList(q.condition_rules)) {
          deps.push(`${secLabel} -> Question "${q.question_name || `#${idx + 1}`}"`);
        }
        if (!isTarget && q.is_photo_required) {
          (q.photos || []).forEach((p, pIdx) => {
            if (p.condition_mode === 'CONDITIONAL' && checkRuleList(p.condition_rules)) {
              deps.push(`${secLabel} -> Q${idx + 1} Photo "${p.photo_name || `#${pIdx + 1}`}"`);
            }
          });
        }
        if (!isTarget && q.is_video_required) {
          (q.videos || []).forEach((v, vIdx) => {
            if (v.condition_mode === 'CONDITIONAL' && checkRuleList(v.condition_rules)) {
              deps.push(`${secLabel} -> Q${idx + 1} Video "${v.video_name || `#${vIdx + 1}`}"`);
            }
          });
        }
        if (!isTarget && q.is_location_required) {
          (q.locations || []).forEach((l, lIdx) => {
            if (l.condition_mode === 'CONDITIONAL' && checkRuleList(l.condition_rules)) {
              deps.push(`${secLabel} -> Q${idx + 1} GPS "${l.location_name || `#${lIdx + 1}`}"`);
            }
          });
        }
      });
    });
    return deps;
  };

  // SECTION 3: Section & Question Handlers
  const handleQuestionsEnabledToggle = (enabled) => {
    setForm((prev) => ({
      ...prev,
      questions_enabled: enabled,
    }));
  };

  const handleAddSection = () => {
    setForm((prev) => ({
      ...prev,
      questions_enabled: true,
      sections: [...(prev.sections || []), createEmptySectionRow((prev.sections || []).length + 1)],
    }));
  };

  const handleSectionChange = (secIdx, patch) => {
    const targetSec = (form.sections || [])[secIdx];
    if (patch.is_active === false && targetSec && (targetSec.questions || []).length > 0) {
      const targetKeys = new Set(targetSec.questions.map((q) => getQuestionKey(q)));
      const deps = findDependentRulesForKeys(targetKeys);
      if (deps.length > 0) {
        showToast(
          `Alert: ${deps.join(', ')} depend(s) on questions inside "${targetSec.section_name || `Section ${secIdx + 1}`}". Update or remove those conditions before saving.`,
          'error'
        );
      }
    }
    setForm((prev) => ({
      ...prev,
      sections: (prev.sections || []).map((sec, idx) => (idx === secIdx ? { ...sec, ...patch } : sec)),
    }));
  };

  const handleMoveSection = (secIdx, delta) => {
    setForm((prev) => {
      const list = [...(prev.sections || [])];
      const nextIdx = secIdx + delta;
      if (nextIdx < 0 || nextIdx >= list.length) return prev;
      const [moved] = list.splice(secIdx, 1);
      list.splice(nextIdx, 0, moved);
      return {
        ...prev,
        sections: list.map((s, idx) => ({ ...s, display_order: idx + 1 })),
      };
    });
  };

  const handleDuplicateSection = (secIdx) => {
    const srcSec = (form.sections || [])[secIdx];
    if (!srcSec) return;
    const keyMap = {};
    (srcSec.questions || []).forEach((q) => {
      keyMap[getQuestionKey(q)] = nextTempKey('q');
    });
    const remapClonedRule = (rules = []) =>
      rules.map((r) => {
        const ref = String(r?.source_question_key ?? r?.source_question_id ?? '');
        if (ref && keyMap[ref]) {
          return { ...r, source_question_key: keyMap[ref], source_question_id: null };
        }
        return { ...r };
      });

    const clonedSec = {
      ...srcSec,
      id: null,
      temp_key: nextTempKey('sec'),
      section_name: srcSec.section_name ? `${srcSec.section_name} (Copy)` : '',
      display_order: (form.sections || []).length + 1,
      questions: (srcSec.questions || []).map((q, qIdx) => ({
        ...q,
        id: null,
        temp_key: keyMap[getQuestionKey(q)],
        display_order: q.display_order ?? qIdx + 1,
        condition_rules: remapClonedRule(q.condition_rules),
        photos: (q.photos || []).map((p) => ({
          ...p,
          id: null,
          local_key: nextTempKey('photo'),
          condition_rules: remapClonedRule(p.condition_rules),
        })),
        videos: (q.videos || []).map((v) => ({
          ...v,
          id: null,
          local_key: nextTempKey('video'),
          condition_rules: remapClonedRule(v.condition_rules),
        })),
        locations: (q.locations || []).map((l) => ({
          ...l,
          id: null,
          local_key: nextTempKey('loc'),
          condition_rules: remapClonedRule(l.condition_rules),
        })),
      })),
    };

    setForm((prev) => {
      const next = [...(prev.sections || [])];
      next.splice(secIdx + 1, 0, clonedSec);
      return {
        ...prev,
        sections: next.map((s, idx) => ({ ...s, display_order: idx + 1 })),
      };
    });
  };

  const handleRemoveSection = (secIdx) => {
    const targetSec = (form.sections || [])[secIdx];
    if (!targetSec) return;
    const removedKeys = new Set((targetSec.questions || []).map((q) => getQuestionKey(q)));
    const deps = removedKeys.size > 0 ? findDependentRulesForKeys(removedKeys) : [];
    if (deps.length > 0) {
      const proceed = window.confirm(
        `Warning: ${deps.join(', ')} depend(s) on question(s) in section "${targetSec.section_name || `#${secIdx + 1}`}".\n\nClick OK to remove this section and clear affected condition rules.`
      );
      if (!proceed) return;
    }
    setForm((prev) => {
      const filtered = (prev.sections || []).filter((_, idx) => idx !== secIdx);
      const cleaned = removedKeys.size > 0 ? stripRemovedQuestionRulesFromSections(filtered, removedKeys) : filtered;
      return {
        ...prev,
        sections: cleaned.map((s, idx) => ({ ...s, display_order: idx + 1 })),
      };
    });
  };

  const handleAddQuestionToSection = (secIdx) => {
    const targetSec = (form.sections || [])[secIdx];
    if (targetSec) {
      const secKey = getSectionKey(targetSec);
      setCollapsedSections((prev) => ({ ...prev, [secKey]: false }));
    }
    setForm((prev) => ({
      ...prev,
      questions_enabled: true,
      sections: (prev.sections || []).map((sec, idx) =>
        idx === secIdx
          ? {
              ...sec,
              questions: [...(sec.questions || []), createEmptyQuestionRow((sec.questions || []).length + 1)],
            }
          : sec
      ),
    }));
  };

  const updateQuestionInSection = (secIdx, qIdx, updater) => {
    setForm((prev) => ({
      ...prev,
      sections: (prev.sections || []).map((sec, sIdx) =>
        sIdx === secIdx
          ? {
              ...sec,
              questions: (sec.questions || []).map((row, idx) =>
                idx === qIdx ? (typeof updater === 'function' ? updater(row) : { ...row, ...updater }) : row
              ),
            }
          : sec
      ),
    }));
  };

  const handleQuestionChange = (secIdx, qIdx, patch) => {
    const targetQ = (form.sections || [])[secIdx]?.questions?.[qIdx];
    if (patch.is_active === false && targetQ) {
      const deps = findDependentRulesForKeys(new Set([getQuestionKey(targetQ)]));
      if (deps.length > 0) {
        showToast(
          `Alert: ${deps.join(', ')} depend(s) on "${targetQ.question_name || 'this question'}". Please update or remove those conditions before saving.`,
          'error'
        );
      }
    }
    updateQuestionInSection(secIdx, qIdx, patch);
  };

  const handleMoveQuestionRow = (secIdx, qIdx, delta) => {
    setForm((prev) => ({
      ...prev,
      sections: (prev.sections || []).map((sec, sIdx) => {
        if (sIdx !== secIdx) return sec;
        const list = [...(sec.questions || [])];
        const nextIdx = qIdx + delta;
        if (nextIdx < 0 || nextIdx >= list.length) return sec;
        const [moved] = list.splice(qIdx, 1);
        list.splice(nextIdx, 0, moved);
        return {
          ...sec,
          questions: list.map((q, idx) => ({ ...q, display_order: idx + 1 })),
        };
      }),
    }));
  };

  const handleDuplicateQuestionRow = (secIdx, qIdx) => {
    const sec = (form.sections || [])[secIdx];
    const src = sec?.questions?.[qIdx];
    if (!src) return;
    const oldKey = getQuestionKey(src);
    const newKey = nextTempKey('q');

    const remapSelfRule = (rules = []) =>
      rules.map((r) => {
        const ref = String(r?.source_question_key ?? r?.source_question_id ?? '');
        if (ref === oldKey) {
          return { ...r, source_question_key: newKey, source_question_id: null };
        }
        return { ...r };
      });

    const cloned = {
      ...src,
      id: null,
      temp_key: newKey,
      question_name: src.question_name ? `${src.question_name} (Copy)` : '',
      display_order: (sec.questions || []).length + 1,
      condition_rules: (src.condition_rules || []).map((r) => ({ ...r })),
      photos: (src.photos || []).map((p) => ({
        ...p,
        id: null,
        local_key: nextTempKey('photo'),
        condition_rules: remapSelfRule(p.condition_rules),
      })),
      videos: (src.videos || []).map((v) => ({
        ...v,
        id: null,
        local_key: nextTempKey('video'),
        condition_rules: remapSelfRule(v.condition_rules),
      })),
      locations: (src.locations || []).map((l) => ({
        ...l,
        id: null,
        local_key: nextTempKey('loc'),
        condition_rules: remapSelfRule(l.condition_rules),
      })),
    };

    setForm((prev) => ({
      ...prev,
      sections: (prev.sections || []).map((s, idx) => {
        if (idx !== secIdx) return s;
        const nextQs = [...(s.questions || [])];
        nextQs.splice(qIdx + 1, 0, cloned);
        return {
          ...s,
          questions: nextQs.map((q, qOrder) => ({ ...q, display_order: qOrder + 1 })),
        };
      }),
    }));
  };

  const handleRemoveQuestionRow = (secIdx, qIdx) => {
    const targetQ = (form.sections || [])[secIdx]?.questions?.[qIdx];
    if (!targetQ) return;
    const removedKeys = new Set([getQuestionKey(targetQ)]);
    const deps = findDependentRulesForKeys(removedKeys);
    if (deps.length > 0) {
      const proceed = window.confirm(
        `Warning: ${deps.join(', ')} depend(s) on question "${targetQ.question_name || `#${qIdx + 1}`}".\n\nClick OK to remove this question and clear the affected condition rules.`
      );
      if (!proceed) return;
    }

    setForm((prev) => {
      const updated = (prev.sections || []).map((s, sIdx) =>
        sIdx === secIdx
          ? {
              ...s,
              questions: (s.questions || [])
                .filter((_, idx) => idx !== qIdx)
                .map((q, qOrder) => ({ ...q, display_order: qOrder + 1 })),
            }
          : s
      );
      return {
        ...prev,
        sections: stripRemovedQuestionRulesFromSections(updated, removedKeys),
      };
    });
  };

  const handleAddQuestionOption = (secIdx, qIdx) => {
    const q = (form.sections || [])[secIdx]?.questions?.[qIdx];
    if (!q) return;
    const val = (q.optionInput || '').trim();
    if (!val) return;
    if ((q.options || []).includes(val)) {
      showToast('Option already exists.', 'info');
      return;
    }
    updateQuestionInSection(secIdx, qIdx, { options: [...(q.options || []), val], optionInput: '' });
  };

  const handleEditQuestionOption = (secIdx, qIdx, optIdx, newValue) => {
    const q = (form.sections || [])[secIdx]?.questions?.[qIdx];
    if (!q) return;
    const nextOpts = (q.options || []).map((o, idx) => (idx === optIdx ? newValue : o));
    updateQuestionInSection(secIdx, qIdx, { options: nextOpts });
  };

  const handleRemoveQuestionOption = (secIdx, qIdx, optIdx) => {
    const q = (form.sections || [])[secIdx]?.questions?.[qIdx];
    if (!q) return;
    updateQuestionInSection(secIdx, qIdx, {
      options: (q.options || []).filter((_, idx) => idx !== optIdx),
    });
  };

  // Nested Question Evidence Handlers (Photos / Videos / GPS)
  const handleQuestionPhotoToggle = (secIdx, qIdx, enabled) => {
    const q = (form.sections || [])[secIdx]?.questions?.[qIdx];
    const existing = q?.photos || [];
    updateQuestionInSection(secIdx, qIdx, {
      is_photo_required: enabled,
      photos: enabled && existing.length === 0 ? [createEmptyPhotoRow(1)] : existing,
    });
  };

  const handleAddQuestionPhoto = (secIdx, qIdx) => {
    const q = (form.sections || [])[secIdx]?.questions?.[qIdx];
    const existing = q?.photos || [];
    updateQuestionInSection(secIdx, qIdx, {
      is_photo_required: true,
      photos: [...existing, createEmptyPhotoRow(existing.length + 1)],
    });
  };

  const handleUpdateQuestionPhoto = (secIdx, qIdx, pIdx, patch) => {
    updateQuestionInSection(secIdx, qIdx, (q) => ({
      ...q,
      photos: (q.photos || []).map((row, idx) => (idx === pIdx ? { ...row, ...patch } : row)),
    }));
  };

  const handleRemoveQuestionPhoto = (secIdx, qIdx, pIdx) => {
    updateQuestionInSection(secIdx, qIdx, (q) => ({
      ...q,
      photos: (q.photos || []).filter((_, idx) => idx !== pIdx),
    }));
  };

  const handleQuestionVideoToggle = (secIdx, qIdx, enabled) => {
    const q = (form.sections || [])[secIdx]?.questions?.[qIdx];
    const existing = q?.videos || [];
    updateQuestionInSection(secIdx, qIdx, {
      is_video_required: enabled,
      videos: enabled && existing.length === 0 ? [createEmptyVideoRow(1)] : existing,
    });
  };

  const handleAddQuestionVideo = (secIdx, qIdx) => {
    const q = (form.sections || [])[secIdx]?.questions?.[qIdx];
    const existing = q?.videos || [];
    updateQuestionInSection(secIdx, qIdx, {
      is_video_required: true,
      videos: [...existing, createEmptyVideoRow(existing.length + 1)],
    });
  };

  const handleUpdateQuestionVideo = (secIdx, qIdx, vIdx, patch) => {
    updateQuestionInSection(secIdx, qIdx, (q) => ({
      ...q,
      videos: (q.videos || []).map((row, idx) => (idx === vIdx ? { ...row, ...patch } : row)),
    }));
  };

  const handleRemoveQuestionVideo = (secIdx, qIdx, vIdx) => {
    updateQuestionInSection(secIdx, qIdx, (q) => ({
      ...q,
      videos: (q.videos || []).filter((_, idx) => idx !== vIdx),
    }));
  };

  const handleQuestionLocationToggle = (secIdx, qIdx, enabled) => {
    const q = (form.sections || [])[secIdx]?.questions?.[qIdx];
    const existing = q?.locations || [];
    updateQuestionInSection(secIdx, qIdx, {
      is_location_required: enabled,
      locations: enabled && existing.length === 0 ? [createEmptyLocationRow(1)] : existing,
    });
  };

  const handleAddQuestionLocation = (secIdx, qIdx) => {
    const q = (form.sections || [])[secIdx]?.questions?.[qIdx];
    const existing = q?.locations || [];
    updateQuestionInSection(secIdx, qIdx, {
      is_location_required: true,
      locations: [...existing, createEmptyLocationRow(existing.length + 1)],
    });
  };

  const handleUpdateQuestionLocation = (secIdx, qIdx, lIdx, patch) => {
    updateQuestionInSection(secIdx, qIdx, (q) => ({
      ...q,
      locations: (q.locations || []).map((row, idx) => (idx === lIdx ? { ...row, ...patch } : row)),
    }));
  };

  const handleRemoveQuestionLocation = (secIdx, qIdx, lIdx) => {
    updateQuestionInSection(secIdx, qIdx, (q) => ({
      ...q,
      locations: (q.locations || []).filter((_, idx) => idx !== lIdx),
    }));
  };

  const handleEditExisting = (cfg) => {
    const rawFreq = cfg.frequency || (Array.isArray(cfg.frequencies) ? cfg.frequencies[0] : '') || '';
    const selectedFreq = CALENDAR_FREQ_CODES.has(rawFreq) ? rawFreq : '';
    const rawSched = cfg.frequency_schedule || (cfg.frequency_schedules || {})[selectedFreq] || null;
    setEditingId(cfg.id);
    setCollapsedSections({});
    setCollapsedQuestions({});

    let hydratedSections = [];
    if (Array.isArray(cfg.sections) && cfg.sections.length > 0) {
      hydratedSections = cfg.sections.map((sec, sIdx) => ({
        id: sec.id || null,
        temp_key: sec.temp_key || (sec.id ? `sec-${sec.id}` : nextTempKey('sec')),
        section_name: sec.section_name || '',
        section_description: sec.section_description || '',
        display_order: sec.display_order ?? sIdx + 1,
        is_active: sec.is_active !== false,
        questions: (sec.questions || []).map((q, qIdx) => hydrateQuestionFromApi(q, qIdx)),
      }));
    } else if (Array.isArray(cfg.questions) && cfg.questions.length > 0) {
      hydratedSections = [
        {
          id: null,
          temp_key: nextTempKey('sec'),
          section_name: 'General Inspection',
          section_description: '',
          display_order: 1,
          is_active: true,
          questions: cfg.questions.map((q, qIdx) => hydrateQuestionFromApi(q, qIdx)),
        },
      ];
    }

    const hydratedSched = selectedFreq ? hydrateScheduleFromApi(selectedFreq, rawSched) : null;
    setScheduleDraftsByFreq(selectedFreq && hydratedSched ? { [selectedFreq]: hydratedSched } : {});
    setForm({
      activity_name: cfg.activity_name || '',
      description: cfg.description || cfg.activity_name || '',
      item_code: cfg.item_code || '',
      category: String(cfg.category || defaultCatId),
      frequency: selectedFreq,
      frequency_schedule: hydratedSched,
      questions_enabled: Boolean(cfg.questions_enabled && hydratedSections.length > 0),
      sections: hydratedSections,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleToggleActiveConfig = async (cfg) => {
    try {
      await pmService.updateAdminChecklistItem(cfg.id, { is_active: !cfg.is_active });
      showToast(`Activity "${cfg.activity_name}" ${cfg.is_active ? 'disabled' : 'enabled'}.`, 'success');
      loadData();
    } catch (err) {
      showToast(err?.message || 'Failed to update activity status.', 'error');
    }
  };

  const validateConditionRulesList = (ownerLabel, mode, rules, activeQuestionKeys) => {
    if (mode !== 'CONDITIONAL') return null;
    if (!rules || rules.length === 0) {
      return `${ownerLabel}: Add at least one condition rule or select "Always Show".`;
    }
    for (let i = 0; i < rules.length; i += 1) {
      const r = rules[i];
      const ref = String(r.source_question_key ?? r.source_question_id ?? '');
      if (!ref || !activeQuestionKeys.has(ref)) {
        return `${ownerLabel}: Condition rule #${i + 1} references a deleted or inactive question.`;
      }
      if (String(r.expected_value ?? '').trim() === '') {
        return `${ownerLabel}: Answer value is required in condition rule #${i + 1}.`;
      }
    }
    return null;
  };

  const handleSaveConfiguration = async (e) => {
    e.preventDefault();

    if (!form.activity_name.trim()) {
      showToast('Maintenance Activity Name is required.', 'error');
      return;
    }
    if (!form.description.trim()) {
      showToast('Description is required.', 'error');
      return;
    }
    if (!form.frequency) {
      showToast('Select one Maintenance Frequency (Daily, Weekly, Every 15 Days, Monthly, Quarterly, or Yearly).', 'error');
      return;
    }

    const schedErr = validateScheduleClient(form.frequency, form.frequency_schedule);
    if (schedErr) {
      showToast(schedErr, 'error');
      return;
    }

    const activeQKeys = new Set(
      form.questions_enabled
        ? (form.sections || [])
            .filter((sec) => sec.is_active !== false)
            .flatMap((sec) => (sec.questions || []).filter((q) => q.is_active !== false).map((q) => getQuestionKey(q)))
        : []
    );

    if (form.questions_enabled) {
      const sectionsList = form.sections || [];
      if (sectionsList.length === 0) {
        showToast('Add at least one Section or set Enable Questions to No.', 'error');
        return;
      }
      const seenSecNames = new Set();
      for (let sIdx = 0; sIdx < sectionsList.length; sIdx += 1) {
        const sec = sectionsList[sIdx];
        const secNameTrimmed = (sec.section_name || '').trim();
        if (!secNameTrimmed) {
          showToast(`Please enter Section Name for Section ${sIdx + 1}.`, 'error');
          return;
        }
        const secLower = secNameTrimmed.toLowerCase();
        if (seenSecNames.has(secLower)) {
          showToast(`Duplicate Section Name "${secNameTrimmed}" in this activity.`, 'error');
          return;
        }
        seenSecNames.add(secLower);

        const secQuestions = sec.questions || [];
        for (let i = 0; i < secQuestions.length; i += 1) {
          const q = secQuestions[i];
          const qTitle = `${secNameTrimmed} -> ${q.question_name.trim() || `Question #${i + 1}`}`;
          if (!q.question_name.trim()) {
            showToast(`Section "${secNameTrimmed}": Please enter Question Name for Question ${i + 1}.`, 'error');
            return;
          }
          if (OPTION_ANSWER_TYPES.has(q.answer_type)) {
            const cleanOpts = (q.options || []).map((o) => o.trim()).filter(Boolean);
            if (cleanOpts.length === 0) {
              showToast(`Add at least one Answer Option for ${qTitle}.`, 'error');
              return;
            }
          }
          const qCondErr = validateConditionRulesList(`Question "${qTitle}"`, q.condition_mode, q.condition_rules, activeQKeys);
          if (qCondErr) {
            showToast(qCondErr, 'error');
            return;
          }

          if (q.is_photo_required) {
            if (!q.photos || q.photos.length === 0) {
              showToast(`${qTitle}: Click "+ Add Photo" or set Photo Required to No.`, 'error');
              return;
            }
            for (let pIdx = 0; pIdx < q.photos.length; pIdx += 1) {
              const p = q.photos[pIdx];
              if (!p.photo_name.trim()) {
                showToast(`${qTitle}: Please enter Photo Name for Photo ${pIdx + 1}.`, 'error');
                return;
              }
              const pCondErr = validateConditionRulesList(`${qTitle} -> Photo "${p.photo_name}"`, p.condition_mode, p.condition_rules, activeQKeys);
              if (pCondErr) {
                showToast(pCondErr, 'error');
                return;
              }
            }
          }

          if (q.is_video_required) {
            if (!q.videos || q.videos.length === 0) {
              showToast(`${qTitle}: Click "+ Add Video" or set Video Required to No.`, 'error');
              return;
            }
            for (let vIdx = 0; vIdx < q.videos.length; vIdx += 1) {
              const v = q.videos[vIdx];
              if (!v.video_name.trim()) {
                showToast(`${qTitle}: Please enter Video Name for Video ${vIdx + 1}.`, 'error');
                return;
              }
              const dur = Number(v.max_duration_seconds);
              const minV = Number(v.min_videos ?? (v.is_mandatory ? 1 : 0));
              const maxV = Number(v.max_videos ?? 1);
              if (!dur || Number.isNaN(dur) || dur < 3 || dur > 300) {
                showToast(`${qTitle}: Maximum Duration for Video "${v.video_name}" must be between 3 and 300 seconds.`, 'error');
                return;
              }
              if (minV < 0 || maxV < 1 || maxV < minV) {
                showToast(`${qTitle}: Invalid Min/Max Video Count for Video "${v.video_name}".`, 'error');
                return;
              }
              const vCondErr = validateConditionRulesList(`${qTitle} -> Video "${v.video_name}"`, v.condition_mode, v.condition_rules, activeQKeys);
              if (vCondErr) {
                showToast(vCondErr, 'error');
                return;
              }
            }
          }

          if (q.is_location_required) {
            if (!q.locations || q.locations.length === 0) {
              showToast(`${qTitle}: Add GPS requirement settings or set Location Required to No.`, 'error');
              return;
            }
            for (let lIdx = 0; lIdx < q.locations.length; lIdx += 1) {
              const l = q.locations[lIdx];
              if (!l.location_name.trim()) {
                showToast(`${qTitle}: Please enter Location Name for GPS requirement ${lIdx + 1}.`, 'error');
                return;
              }
              if (l.accuracy_threshold_meters !== '' && l.accuracy_threshold_meters !== null && l.accuracy_threshold_meters !== undefined) {
                const accNum = Number(l.accuracy_threshold_meters);
                if (Number.isNaN(accNum) || accNum <= 0) {
                  showToast(`${qTitle}: GPS Accuracy Threshold must be a positive number (meters).`, 'error');
                  return;
                }
              }
              if (l.is_geofence_required) {
                if (l.capture_latitude === false || l.capture_longitude === false) {
                  showToast(`${qTitle} -> GPS "${l.location_name}": Enable both Capture Latitude and Capture Longitude when Geofence is Yes.`, 'error');
                  return;
                }
                const gType = String(l.geofence_type || 'CIRCLE').toUpperCase();
                if (gType === 'POLYGON') {
                  const pts = l.geofence_polygon || [];
                  if (pts.length < 3) {
                    showToast(`${qTitle} -> GPS "${l.location_name}": Polygon geofence requires at least 3 boundary coordinate points.`, 'error');
                    return;
                  }
                  const distinct = new Set();
                  for (let ptIdx = 0; ptIdx < pts.length; ptIdx += 1) {
                    const pt = pts[ptIdx];
                    const ptLat = pt.latitude === '' || pt.latitude === null || pt.latitude === undefined ? NaN : Number(pt.latitude);
                    const ptLng = pt.longitude === '' || pt.longitude === null || pt.longitude === undefined ? NaN : Number(pt.longitude);
                    if (Number.isNaN(ptLat) || ptLat < -90 || ptLat > 90) {
                      showToast(`${qTitle} -> GPS "${l.location_name}": Polygon point #${ptIdx + 1} has an invalid latitude (-90 to 90).`, 'error');
                      return;
                    }
                    if (Number.isNaN(ptLng) || ptLng < -180 || ptLng > 180) {
                      showToast(`${qTitle} -> GPS "${l.location_name}": Polygon point #${ptIdx + 1} has an invalid longitude (-180 to 180).`, 'error');
                      return;
                    }
                    distinct.add(`${ptLat.toFixed(6)},${ptLng.toFixed(6)}`);
                  }
                  if (distinct.size < 3) {
                    showToast(`${qTitle} -> GPS "${l.location_name}": Polygon geofence requires at least 3 distinct coordinates.`, 'error');
                    return;
                  }
                } else {
                  const gLat = l.geofence_latitude === '' || l.geofence_latitude === null || l.geofence_latitude === undefined ? NaN : Number(l.geofence_latitude);
                  const gLng = l.geofence_longitude === '' || l.geofence_longitude === null || l.geofence_longitude === undefined ? NaN : Number(l.geofence_longitude);
                  const gRad = l.geofence_radius_meters === '' || l.geofence_radius_meters === null || l.geofence_radius_meters === undefined ? NaN : Number(l.geofence_radius_meters);
                  if (Number.isNaN(gLat) || gLat < -90 || gLat > 90) {
                    showToast(`${qTitle} -> GPS "${l.location_name}": Enter a valid Geofence Center Latitude (-90 to 90).`, 'error');
                    return;
                  }
                  if (Number.isNaN(gLng) || gLng < -180 || gLng > 180) {
                    showToast(`${qTitle} -> GPS "${l.location_name}": Enter a valid Geofence Center Longitude (-180 to 180).`, 'error');
                    return;
                  }
                  if (Number.isNaN(gRad) || gRad <= 0) {
                    showToast(`${qTitle} -> GPS "${l.location_name}": Geofence Radius must be greater than 0 meters.`, 'error');
                    return;
                  }
                }
              }
              const lCondErr = validateConditionRulesList(`${qTitle} -> GPS "${l.location_name}"`, l.condition_mode, l.condition_rules, activeQKeys);
              if (lCondErr) {
                showToast(lCondErr, 'error');
                return;
              }
            }
          }
        }
      }
    }

    const serializeQuestionForSave = (q, idx) => ({
      id: q.id || null,
      temp_key: getQuestionKey(q),
      question_name: q.question_name.trim(),
      question_description: (q.question_description || '').trim(),
      answer_type: q.answer_type,
      options: OPTION_ANSWER_TYPES.has(q.answer_type)
        ? (q.options || []).map((o) => o.trim()).filter(Boolean)
        : [],
      is_mandatory: Boolean(q.is_mandatory),
      display_order: Number(q.display_order || idx + 1),
      is_active: q.is_active !== false,
      condition_mode: q.condition_mode || 'ALWAYS',
      condition_logic: q.condition_logic || 'AND',
      condition_rules: q.condition_mode === 'CONDITIONAL' ? q.condition_rules : [],
      is_photo_required: Boolean(q.is_photo_required),
      photos: q.is_photo_required
        ? (q.photos || []).map((p, pIdx) => ({
            id: p.id || null,
            photo_name: p.photo_name.trim(),
            photo_description: (p.photo_description || '').trim(),
            is_mandatory: Boolean(p.is_mandatory),
            display_order: Number(p.display_order || pIdx + 1),
            is_active: p.is_active !== false,
            condition_mode: p.condition_mode || 'ALWAYS',
            condition_logic: p.condition_logic || 'AND',
            condition_rules: p.condition_mode === 'CONDITIONAL' ? p.condition_rules : [],
          }))
        : [],
      is_video_required: Boolean(q.is_video_required),
      videos: q.is_video_required
        ? (q.videos || []).map((v, vIdx) => {
            const isMand = Boolean(v.is_mandatory);
            const minV = Number(v.min_videos ?? (isMand ? 1 : 0));
            const maxV = Number(v.max_videos ?? Math.max(1, minV));
            return {
              id: v.id || null,
              video_name: v.video_name.trim(),
              video_description: (v.video_description || '').trim(),
              min_videos: isMand ? Math.max(1, minV) : minV,
              max_videos: Math.max(1, maxV),
              max_duration_seconds: Number(v.max_duration_seconds || 60),
              is_mandatory: isMand,
              display_order: Number(v.display_order || vIdx + 1),
              is_active: v.is_active !== false,
              condition_mode: v.condition_mode || 'ALWAYS',
              condition_logic: v.condition_logic || 'AND',
              condition_rules: v.condition_mode === 'CONDITIONAL' ? v.condition_rules : [],
            };
          })
        : [],
      is_location_required: Boolean(q.is_location_required),
      locations: q.is_location_required
        ? (q.locations || []).map((l, lIdx) => ({
            id: l.id || null,
            location_name: l.location_name.trim(),
            location_description: (l.location_description || '').trim(),
            capture_latitude: l.capture_latitude !== false,
            capture_longitude: l.capture_longitude !== false,
            accuracy_threshold_meters:
              l.accuracy_threshold_meters !== '' && l.accuracy_threshold_meters !== null && l.accuracy_threshold_meters !== undefined
                ? Number(l.accuracy_threshold_meters)
                : null,
            capture_timestamp: l.capture_timestamp !== false,
            capture_rule: l.capture_rule || 'LIVE_GPS',
            is_mandatory: Boolean(l.is_mandatory),
            is_geofence_required: Boolean(l.is_geofence_required),
            geofence_type: l.geofence_type || 'CIRCLE',
            geofence_reference_name: (l.geofence_reference_name || '').trim(),
            geofence_latitude:
              l.is_geofence_required && l.geofence_type !== 'POLYGON' && l.geofence_latitude !== '' && l.geofence_latitude !== null
                ? Number(l.geofence_latitude)
                : null,
            geofence_longitude:
              l.is_geofence_required && l.geofence_type !== 'POLYGON' && l.geofence_longitude !== '' && l.geofence_longitude !== null
                ? Number(l.geofence_longitude)
                : null,
            geofence_radius_meters:
              l.is_geofence_required && l.geofence_type !== 'POLYGON' && l.geofence_radius_meters !== '' && l.geofence_radius_meters !== null
                ? Number(l.geofence_radius_meters)
                : null,
            geofence_polygon:
              l.is_geofence_required && l.geofence_type === 'POLYGON'
                ? (l.geofence_polygon || []).map((pt) => [Number(pt.latitude), Number(pt.longitude)])
                : [],
            display_order: Number(l.display_order || lIdx + 1),
            is_active: l.is_active !== false,
            condition_mode: l.condition_mode || 'ALWAYS',
            condition_logic: l.condition_logic || 'AND',
            condition_rules: l.condition_mode === 'CONDITIONAL' ? l.condition_rules : [],
          }))
        : [],
    });

    const payload = {
      activity_name: form.activity_name.trim(),
      description: form.description.trim(),
      item_code: form.item_code.trim().toUpperCase(),
      category: form.category ? Number(form.category) : Number(defaultCatId),
      frequency: form.frequency,
      frequency_schedule: serializeSchedulePayload(form.frequency, form.frequency_schedule),
      questions_enabled: Boolean(form.questions_enabled),
      sections: form.questions_enabled
        ? (form.sections || []).map((sec, sIdx) => ({
            id: sec.id || null,
            temp_key: getSectionKey(sec),
            section_name: sec.section_name.trim(),
            section_description: (sec.section_description || '').trim(),
            display_order: Number(sec.display_order || sIdx + 1),
            is_active: sec.is_active !== false,
            questions: (sec.questions || []).map((q, qIdx) => serializeQuestionForSave(q, qIdx)),
          }))
        : [],
      questions: [],
      is_photo_required: false,
      photos: [],
      is_video_required: false,
      videos: [],
      is_location_required: false,
      locations: [],
      is_active: true,
    };

    try {
      setSaving(true);
      if (editingId) {
        await pmService.updateAdminActivityConfiguration(editingId, payload);
        showToast(`Configuration "${payload.activity_name}" updated successfully.`, 'success');
      } else {
        await pmService.saveAdminActivityConfiguration(payload);
        showToast(`Configuration "${payload.activity_name}" saved successfully.`, 'success');
      }
      resetForm();
      loadData();
    } catch (err) {
      showToast(err?.message || 'Failed to save maintenance configuration.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="screen-container" style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <PmLayoutHeader
        title="Machine Maintenance Configuration"
        subtitle="Configure maintenance details, frequencies, questions, and per-question Photo, Video, and GPS evidence"
        roleInfo={roleInfo}
      />

      <form onSubmit={handleSaveConfiguration} className="app-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              {editingId ? `Edit Maintenance Activity Configuration (${form.item_code})` : 'Configure Maintenance Activity'}
            </h2>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
              Everything starts unchecked and optional by default — add questions and attach only the Photo, Video, or GPS evidence needed for each question.
            </div>
          </div>
          {editingId ? (
            <button type="button" className="btn-secondary" onClick={resetForm}>
              + Configure New Activity
            </button>
          ) : null}
        </div>

        {/* SECTION 1 – Maintenance Activity Details */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <h3 style={{ margin: 0, fontSize: '0.94rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            SECTION 1 – Maintenance Activity Details
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
            <div>
              <label style={labelStyle}>Maintenance Activity Name *</label>
              <input
                required
                value={form.activity_name}
                onChange={(e) => setForm((p) => ({ ...p, activity_name: e.target.value }))}
                placeholder="Enter activity name"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Item Code</label>
              <input
                value={form.item_code}
                onChange={(e) => setForm((p) => ({ ...p, item_code: e.target.value.toUpperCase() }))}
                placeholder="Optional (auto-generated if blank)"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Category</label>
              <SearchableSelect
                value={form.category}
                onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
              >
                {categories.map((c) => (
                  <option key={c.id} value={String(c.id)}>{c.name}</option>
                ))}
              </SearchableSelect>
            </div>
          </div>
          <div>
            <label style={labelStyle}>Description *</label>
            <textarea
              required
              rows={2}
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              placeholder="Enter maintenance activity instructions or description"
              style={textareaStyle}
            />
          </div>
        </div>

        <div style={{ height: '1px', background: 'var(--border)' }} />

        {/* SECTION 2 – Frequency Configuration */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
            <h3 style={{ margin: 0, fontSize: '0.94rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              SECTION 2 – Frequency Configuration *
            </h3>
            <span className="badge-pill badge-blue">
              {form.frequency
                ? CALENDAR_FREQUENCY_OPTIONS.find((f) => f.code === form.frequency)?.label || form.frequency
                : 'Select 1 frequency'}
            </span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
            {CALENDAR_FREQUENCY_OPTIONS.map((freq) => {
              const selected = form.frequency === freq.code;
              return (
                <label
                  key={freq.code}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 14px',
                    borderRadius: 'var(--radius)',
                    border: selected ? '1.5px solid #2563eb' : '1px solid var(--border-strong)',
                    background: selected ? '#eff6ff' : '#ffffff',
                    fontWeight: selected ? 700 : 500,
                    fontSize: '0.84rem',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="radio"
                    name="pm_activity_frequency"
                    checked={selected}
                    onChange={() => handleSelectFrequency(freq.code)}
                  />
                  <span>{freq.label}</span>
                </label>
              );
            })}
          </div>
          {form.frequency && (
            <PmFrequencyScheduleEditor
              freqCode={form.frequency}
              freqLabel={CALENDAR_FREQUENCY_OPTIONS.find((f) => f.code === form.frequency)?.label || form.frequency}
              schedule={form.frequency_schedule}
              onChange={handleScheduleChange}
            />
          )}
        </div>

        <div style={{ height: '1px', background: 'var(--border)' }} />

        {/* SECTION 3 – Questions & Evidence Configuration */}
        {(() => {
          const allQuestionsFlat = getAllFlatQuestions(form.sections);
          const sectionsList = form.sections || [];
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <LucideHelpCircle size={17} />
                  <h3 style={{ margin: 0, fontSize: '0.94rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    SECTION 3 – Questions &amp; Evidence Configuration
                  </h3>
                </div>
                {form.questions_enabled && (
                  <button type="button" className="btn-secondary" onClick={handleAddSection}>
                    <LucidePlus size={14} /> + Add Section
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.84rem', fontWeight: 700 }}>Enable Questions:</span>
                {[
                  { label: 'Yes', value: true },
                  { label: 'No', value: false },
                ].map((opt) => {
                  const active = form.questions_enabled === opt.value;
                  return (
                    <label
                      key={opt.label}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 14px',
                        borderRadius: 'var(--radius)',
                        border: active ? '1.5px solid #047857' : '1px solid var(--border-strong)',
                        background: active ? '#ecfdf5' : '#fff',
                        fontWeight: 600,
                        fontSize: '0.82rem',
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="radio"
                        name="questions_enabled"
                        checked={active}
                        onChange={() => handleQuestionsEnabledToggle(opt.value)}
                      />
                      {opt.label}
                    </label>
                  );
                })}
              </div>

              {!form.questions_enabled ? (
                <div style={{ padding: '12px', borderRadius: 'var(--radius)', background: 'var(--bg-subtle)', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Questions are disabled. Save this activity directly as a standard checklist activity, or switch Enable Questions to Yes to configure sections, questions, Photo, Video, and GPS evidence.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {sectionsList.length === 0 ? (
                    <div style={{ padding: '14px', border: '1px dashed var(--border-strong)', borderRadius: 'var(--radius)', fontSize: '0.82rem', color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                      <span>No sections added yet. Click &quot;+ Add Section&quot; to organize questions into logical sections.</span>
                      <button type="button" className="btn-primary" onClick={handleAddSection}>
                        <LucidePlus size={14} /> + Add Section
                      </button>
                    </div>
                  ) : (
                    sectionsList.map((secRow, secIdx) => {
                      const secKey = getSectionKey(secRow);
                      const isSecCollapsed = Boolean(collapsedSections[secKey]);
                      const secQuestions = secRow.questions || [];

                      return (
                        <div
                          key={secKey}
                          style={{
                            padding: '14px',
                            border: '2px solid var(--border-strong)',
                            borderRadius: 'var(--radius)',
                            background: '#fff',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '12px',
                          }}
                        >
                          {/* Section Header */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', borderBottom: '1px solid var(--border)', paddingBottom: '10px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                              <button
                                type="button"
                                className="btn-secondary"
                                style={{ padding: '3px 7px', fontSize: '0.72rem' }}
                                onClick={() => toggleSectionCollapse(secKey)}
                                title={isSecCollapsed ? 'Expand Section' : 'Collapse Section'}
                              >
                                {isSecCollapsed ? <LucideChevronDown size={14} /> : <LucideChevronUp size={14} />}
                              </button>
                              <LucideLayers size={15} />
                              <strong style={{ fontSize: '0.94rem' }}>
                                Section {secIdx + 1}{secRow.section_name ? ` – ${secRow.section_name}` : ''}
                              </strong>
                              <span className={`badge-pill ${secRow.is_active !== false ? 'badge-green' : 'badge-neutral'}`}>
                                {secRow.is_active !== false ? 'Active' : 'Inactive'}
                              </span>
                              <span className="badge-pill badge-blue">
                                {secQuestions.length} Question(s)
                              </span>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                              <button
                                type="button"
                                className="btn-secondary"
                                style={{ padding: '4px 7px', fontSize: '0.72rem' }}
                                disabled={secIdx === 0}
                                onClick={() => handleMoveSection(secIdx, -1)}
                                title="Move Section Up"
                              >
                                <LucideArrowUp size={12} />
                              </button>
                              <button
                                type="button"
                                className="btn-secondary"
                                style={{ padding: '4px 7px', fontSize: '0.72rem' }}
                                disabled={secIdx === sectionsList.length - 1}
                                onClick={() => handleMoveSection(secIdx, 1)}
                                title="Move Section Down"
                              >
                                <LucideArrowDown size={12} />
                              </button>
                              <button
                                type="button"
                                className="btn-secondary"
                                style={{ padding: '4px 9px', fontSize: '0.74rem' }}
                                onClick={() => handleDuplicateSection(secIdx)}
                              >
                                <LucideCopy size={12} /> Duplicate Section
                              </button>
                              <button
                                type="button"
                                className="btn-primary"
                                style={{ padding: '4px 10px', fontSize: '0.74rem' }}
                                onClick={() => handleAddQuestionToSection(secIdx)}
                              >
                                <LucidePlus size={12} /> + Add Question
                              </button>
                              <button
                                type="button"
                                className="btn-danger"
                                style={{ padding: '4px 10px', fontSize: '0.74rem' }}
                                onClick={() => handleRemoveSection(secIdx)}
                              >
                                <LucideTrash2 size={12} /> Remove Section
                              </button>
                            </div>
                          </div>

                          {!isSecCollapsed && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                              {/* Section Details */}
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '10px', padding: '10px', background: 'var(--bg-subtle)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
                                <div>
                                  <label style={labelStyle}>Section Name *</label>
                                  <input
                                    value={secRow.section_name}
                                    onChange={(e) => handleSectionChange(secIdx, { section_name: e.target.value })}
                                    placeholder="e.g. Engine Oil Inspection"
                                    style={inputStyle}
                                  />
                                </div>
                                <div>
                                  <label style={labelStyle}>Display Order</label>
                                  <input
                                    type="number"
                                    min={1}
                                    value={secRow.display_order}
                                    onChange={(e) => handleSectionChange(secIdx, { display_order: e.target.value })}
                                    style={inputStyle}
                                  />
                                </div>
                                <div>
                                  <label style={labelStyle}>Section Status</label>
                                  <select
                                    value={secRow.is_active !== false ? 'ACTIVE' : 'INACTIVE'}
                                    onChange={(e) => handleSectionChange(secIdx, { is_active: e.target.value === 'ACTIVE' })}
                                    style={inputStyle}
                                  >
                                    <option value="ACTIVE">Active</option>
                                    <option value="INACTIVE">Inactive</option>
                                  </select>
                                </div>
                                <div style={{ gridColumn: '1 / -1' }}>
                                  <label style={labelStyle}>Section Description (Optional)</label>
                                  <input
                                    value={secRow.section_description}
                                    onChange={(e) => handleSectionChange(secIdx, { section_description: e.target.value })}
                                    placeholder="Optional guidance or scope for this section"
                                    style={inputStyle}
                                  />
                                </div>
                              </div>

                              {/* Nested Questions List inside this Section */}
                              {secQuestions.length === 0 ? (
                                <div style={{ padding: '12px', border: '1px dashed var(--border-strong)', borderRadius: 'var(--radius)', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                  No questions in this section yet. Click &quot;+ Add Question&quot; in the section header above to add one.
                                </div>
                              ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', paddingLeft: '10px', borderLeft: '3px solid var(--border-strong)' }}>
                                  {secQuestions.map((qRow, qIdx) => {
                                    const qKey = getQuestionKey(qRow);
                                    const isCollapsed = Boolean(collapsedQuestions[qKey]);
                                    const photoCount = qRow.is_photo_required ? (qRow.photos || []).length : 0;
                                    const videoCount = qRow.is_video_required ? (qRow.videos || []).length : 0;
                                    const locCount = qRow.is_location_required ? (qRow.locations || []).length : 0;

                                    return (
                                      <div
                                        key={qKey}
                                        style={{
                                          padding: '14px',
                                          border: '1.5px solid var(--border-strong)',
                                          borderRadius: 'var(--radius)',
                                          background: 'var(--bg-subtle)',
                                          display: 'flex',
                                          flexDirection: 'column',
                                          gap: '12px',
                                        }}
                                      >
                                        {/* Question Header */}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                            <button
                                              type="button"
                                              className="btn-secondary"
                                              style={{ padding: '3px 7px', fontSize: '0.72rem' }}
                                              onClick={() => toggleQuestionCollapse(qKey)}
                                              title={isCollapsed ? 'Expand Question' : 'Collapse Question'}
                                            >
                                              {isCollapsed ? <LucideChevronDown size={14} /> : <LucideChevronUp size={14} />}
                                            </button>
                                            <strong style={{ fontSize: '0.9rem' }}>
                                              Question {qIdx + 1}{qRow.question_name ? `: ${qRow.question_name}` : ''}
                                            </strong>
                                            <span className={`badge-pill ${qRow.is_mandatory ? 'badge-red' : 'badge-neutral'}`}>
                                              {qRow.is_mandatory ? 'Mandatory' : 'Optional'}
                                            </span>
                                            <span className={`badge-pill ${qRow.is_active !== false ? 'badge-green' : 'badge-neutral'}`}>
                                              {qRow.is_active !== false ? 'Active' : 'Inactive'}
                                            </span>
                                            {photoCount > 0 && <span className="badge-pill badge-blue">{photoCount} Photo(s)</span>}
                                            {videoCount > 0 && <span className="badge-pill badge-blue">{videoCount} Video(s)</span>}
                                            {locCount > 0 && <span className="badge-pill badge-blue">GPS ({locCount})</span>}
                                          </div>
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                            <button
                                              type="button"
                                              className="btn-secondary"
                                              style={{ padding: '4px 7px', fontSize: '0.72rem' }}
                                              disabled={qIdx === 0}
                                              onClick={() => handleMoveQuestionRow(secIdx, qIdx, -1)}
                                              title="Move Question Up"
                                            >
                                              <LucideArrowUp size={12} />
                                            </button>
                                            <button
                                              type="button"
                                              className="btn-secondary"
                                              style={{ padding: '4px 7px', fontSize: '0.72rem' }}
                                              disabled={qIdx === secQuestions.length - 1}
                                              onClick={() => handleMoveQuestionRow(secIdx, qIdx, 1)}
                                              title="Move Question Down"
                                            >
                                              <LucideArrowDown size={12} />
                                            </button>
                                            <button
                                              type="button"
                                              className="btn-secondary"
                                              style={{ padding: '4px 9px', fontSize: '0.74rem' }}
                                              onClick={() => handleDuplicateQuestionRow(secIdx, qIdx)}
                                            >
                                              <LucideCopy size={12} /> Duplicate
                                            </button>
                                            <button
                                              type="button"
                                              className="btn-danger"
                                              style={{ padding: '4px 10px', fontSize: '0.74rem' }}
                                              onClick={() => handleRemoveQuestionRow(secIdx, qIdx)}
                                            >
                                              <LucideTrash2 size={12} /> Remove
                                            </button>
                                          </div>
                                        </div>

                                        {!isCollapsed && (
                                          <>
                                            {/* Question Configuration Grid */}
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '10px' }}>
                                              <div>
                                                <label style={labelStyle}>Question Name *</label>
                                                <input
                                                  value={qRow.question_name}
                                                  onChange={(e) => handleQuestionChange(secIdx, qIdx, { question_name: e.target.value })}
                                                  placeholder="e.g. Is hydraulic oil level OK?"
                                                  style={inputStyle}
                                                />
                                              </div>
                                              <div>
                                                <label style={labelStyle}>Answer Type *</label>
                                                <select
                                                  value={qRow.answer_type}
                                                  onChange={(e) => handleQuestionChange(secIdx, qIdx, { answer_type: e.target.value })}
                                                  style={inputStyle}
                                                >
                                                  {ANSWER_TYPE_OPTIONS.map((t) => (
                                                    <option key={t.value} value={t.value}>{t.label}</option>
                                                  ))}
                                                </select>
                                              </div>
                                              <div>
                                                <label style={labelStyle}>Requirement</label>
                                                <select
                                                  value={qRow.is_mandatory ? 'MANDATORY' : 'OPTIONAL'}
                                                  onChange={(e) => handleQuestionChange(secIdx, qIdx, { is_mandatory: e.target.value === 'MANDATORY' })}
                                                  style={inputStyle}
                                                >
                                                  <option value="OPTIONAL">Optional</option>
                                                  <option value="MANDATORY">Mandatory</option>
                                                </select>
                                              </div>
                                              <div>
                                                <label style={labelStyle}>Display Order</label>
                                                <input
                                                  type="number"
                                                  min={1}
                                                  value={qRow.display_order}
                                                  onChange={(e) => handleQuestionChange(secIdx, qIdx, { display_order: e.target.value })}
                                                  style={inputStyle}
                                                />
                                              </div>
                                              <div>
                                                <label style={labelStyle}>Status</label>
                                                <select
                                                  value={qRow.is_active !== false ? 'ACTIVE' : 'INACTIVE'}
                                                  onChange={(e) => handleQuestionChange(secIdx, qIdx, { is_active: e.target.value === 'ACTIVE' })}
                                                  style={inputStyle}
                                                >
                                                  <option value="ACTIVE">Active</option>
                                                  <option value="INACTIVE">Inactive</option>
                                                </select>
                                              </div>
                                            </div>

                                            <div>
                                              <label style={labelStyle}>Question Description</label>
                                              <input
                                                value={qRow.question_description}
                                                onChange={(e) => handleQuestionChange(secIdx, qIdx, { question_description: e.target.value })}
                                                placeholder="Optional guidance for operator"
                                                style={inputStyle}
                                              />
                                            </div>

                                            {OPTION_ANSWER_TYPES.has(qRow.answer_type) && (
                                              <div style={{ padding: '10px', background: '#fff', borderRadius: '6px', border: '1px solid var(--border)' }}>
                                                <label style={labelStyle}>Answer Options *</label>
                                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                                                  <input
                                                    value={qRow.optionInput || ''}
                                                    onChange={(e) => handleQuestionChange(secIdx, qIdx, { optionInput: e.target.value })}
                                                    onKeyDown={(e) => {
                                                      if (e.key === 'Enter') {
                                                        e.preventDefault();
                                                        handleAddQuestionOption(secIdx, qIdx);
                                                      }
                                                    }}
                                                    placeholder="Type an answer option and click Add Option"
                                                    style={{ ...inputStyle, flex: '1 1 220px' }}
                                                  />
                                                  <button type="button" className="btn-secondary" onClick={() => handleAddQuestionOption(secIdx, qIdx)}>
                                                    <LucidePlus size={13} /> Add Option
                                                  </button>
                                                </div>
                                                {(qRow.options || []).length > 0 && (
                                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
                                                    {qRow.options.map((opt, optIdx) => (
                                                      <div key={`sec-${secIdx}-q-${qIdx}-opt-${optIdx}`} style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                                        <input
                                                          value={opt}
                                                          onChange={(e) => handleEditQuestionOption(secIdx, qIdx, optIdx, e.target.value)}
                                                          style={{ ...inputStyle, height: '32px', maxWidth: '320px' }}
                                                        />
                                                        <button
                                                          type="button"
                                                          className="btn-danger"
                                                          style={{ padding: '4px 8px', fontSize: '0.72rem' }}
                                                          onClick={() => handleRemoveQuestionOption(secIdx, qIdx, optIdx)}
                                                        >
                                                          <LucideX size={12} />
                                                        </button>
                                                      </div>
                                                    ))}
                                                  </div>
                                                )}
                                              </div>
                                            )}

                                            <PmConditionBuilder
                                              ownerLabel={`Question "${qRow.question_name || `#${qIdx + 1}`}"`}
                                              conditionMode={qRow.condition_mode}
                                              conditionLogic={qRow.condition_logic}
                                              conditionRules={qRow.condition_rules}
                                              availableQuestions={allQuestionsFlat}
                                              excludeQuestionKey={qKey}
                                              onChange={(condPatch) => handleQuestionChange(secIdx, qIdx, condPatch)}
                                            />

                                            {/* Nested Evidence Block inside Question Card */}
                                            <div
                                              style={{
                                                padding: '12px',
                                                borderRadius: '6px',
                                                background: '#fff',
                                                border: '1px solid var(--border-strong)',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: '14px',
                                              }}
                                            >
                                              <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)', borderBottom: '1px solid var(--border)', paddingBottom: '6px' }}>
                                                Evidence Requirements for Question {qIdx + 1}
                                              </div>

                                              {/* A. Photo Requirements */}
                                              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                                                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', fontWeight: 700 }}>
                                                      <LucideCamera size={15} /> A. Photo Requirement:
                                                    </span>
                                                    {[
                                                      { label: 'Yes', value: true },
                                                      { label: 'No', value: false },
                                                    ].map((opt) => {
                                                      const active = Boolean(qRow.is_photo_required) === opt.value;
                                                      return (
                                                        <label
                                                          key={`sec-${secIdx}-q-${qIdx}-photo-req-${opt.label}`}
                                                          style={{
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '5px',
                                                            padding: '4px 12px',
                                                            borderRadius: 'var(--radius)',
                                                            border: active ? '1.5px solid #047857' : '1px solid var(--border-strong)',
                                                            background: active ? '#ecfdf5' : '#fff',
                                                            fontWeight: 600,
                                                            fontSize: '0.78rem',
                                                            cursor: 'pointer',
                                                          }}
                                                        >
                                                          <input
                                                            type="radio"
                                                            name={`q_${qKey}_photo_req`}
                                                            checked={active}
                                                            onChange={() => handleQuestionPhotoToggle(secIdx, qIdx, opt.value)}
                                                          />
                                                          {opt.label}
                                                        </label>
                                                      );
                                                    })}
                                                  </div>
                                                  {qRow.is_photo_required && (
                                                    <button type="button" className="btn-secondary" style={{ fontSize: '0.76rem', padding: '5px 10px' }} onClick={() => handleAddQuestionPhoto(secIdx, qIdx)}>
                                                      <LucidePlus size={13} /> + Add Photo
                                                    </button>
                                                  )}
                                                </div>

                                                {qRow.is_photo_required && (
                                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingLeft: '8px', borderLeft: '3px solid #93c5fd' }}>
                                                    {(qRow.photos || []).map((pRow, pIdx) => (
                                                      <div
                                                        key={pRow.id ? `p-${pRow.id}` : pRow.local_key || `p-idx-${pIdx}`}
                                                        style={{
                                                          padding: '10px',
                                                          border: '1px solid var(--border)',
                                                          borderRadius: '6px',
                                                          background: 'var(--bg-subtle)',
                                                          display: 'flex',
                                                          flexDirection: 'column',
                                                          gap: '8px',
                                                        }}
                                                      >
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                                                          <strong style={{ fontSize: '0.8rem' }}>
                                                            Photo {pIdx + 1} ({pRow.is_mandatory ? 'Mandatory' : 'Optional'})
                                                          </strong>
                                                          <button
                                                            type="button"
                                                            className="btn-danger"
                                                            style={{ padding: '3px 8px', fontSize: '0.72rem' }}
                                                            onClick={() => handleRemoveQuestionPhoto(secIdx, qIdx, pIdx)}
                                                          >
                                                            <LucideTrash2 size={12} /> Remove
                                                          </button>
                                                        </div>
                                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '8px' }}>
                                                          <div>
                                                            <label style={labelStyle}>Photo Name *</label>
                                                            <input
                                                              value={pRow.photo_name}
                                                              onChange={(e) => handleUpdateQuestionPhoto(secIdx, qIdx, pIdx, { photo_name: e.target.value })}
                                                              placeholder="e.g. Hydraulic Sight Glass Photo"
                                                              style={smallInputStyle}
                                                            />
                                                          </div>
                                                          <div>
                                                            <label style={labelStyle}>Requirement</label>
                                                            <select
                                                              value={pRow.is_mandatory ? 'MANDATORY' : 'OPTIONAL'}
                                                              onChange={(e) => handleUpdateQuestionPhoto(secIdx, qIdx, pIdx, { is_mandatory: e.target.value === 'MANDATORY' })}
                                                              style={smallInputStyle}
                                                            >
                                                              <option value="OPTIONAL">Optional</option>
                                                              <option value="MANDATORY">Mandatory</option>
                                                            </select>
                                                          </div>
                                                          <div>
                                                            <label style={labelStyle}>Display Order</label>
                                                            <input
                                                              type="number"
                                                              min={1}
                                                              value={pRow.display_order}
                                                              onChange={(e) => handleUpdateQuestionPhoto(secIdx, qIdx, pIdx, { display_order: e.target.value })}
                                                              style={smallInputStyle}
                                                            />
                                                          </div>
                                                          <div>
                                                            <label style={labelStyle}>Status</label>
                                                            <select
                                                              value={pRow.is_active !== false ? 'ACTIVE' : 'INACTIVE'}
                                                              onChange={(e) => handleUpdateQuestionPhoto(secIdx, qIdx, pIdx, { is_active: e.target.value === 'ACTIVE' })}
                                                              style={smallInputStyle}
                                                            >
                                                              <option value="ACTIVE">Active</option>
                                                              <option value="INACTIVE">Inactive</option>
                                                            </select>
                                                          </div>
                                                        </div>
                                                        <div>
                                                          <label style={labelStyle}>Photo Description</label>
                                                          <input
                                                            value={pRow.photo_description}
                                                            onChange={(e) => handleUpdateQuestionPhoto(secIdx, qIdx, pIdx, { photo_description: e.target.value })}
                                                            placeholder="Describe what to photograph clearly"
                                                            style={smallInputStyle}
                                                          />
                                                        </div>
                                                        <EvidenceConditionEditor
                                                          ownerLabel={`Photo "${pRow.photo_name || `#${pIdx + 1}`}"`}
                                                          parentQuestion={qRow}
                                                          allQuestions={allQuestionsFlat}
                                                          conditionMode={pRow.condition_mode}
                                                          conditionLogic={pRow.condition_logic}
                                                          conditionRules={pRow.condition_rules}
                                                          onChange={(condPatch) => handleUpdateQuestionPhoto(secIdx, qIdx, pIdx, condPatch)}
                                                        />
                                                      </div>
                                                    ))}
                                                  </div>
                                                )}
                                              </div>

                                              <div style={{ height: '1px', background: 'var(--border)' }} />

                                              {/* B. Video Requirements */}
                                              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                                                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', fontWeight: 700 }}>
                                                      <LucideVideo size={15} /> B. Video Requirement:
                                                    </span>
                                                    {[
                                                      { label: 'Yes', value: true },
                                                      { label: 'No', value: false },
                                                    ].map((opt) => {
                                                      const active = Boolean(qRow.is_video_required) === opt.value;
                                                      return (
                                                        <label
                                                          key={`sec-${secIdx}-q-${qIdx}-video-req-${opt.label}`}
                                                          style={{
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '5px',
                                                            padding: '4px 12px',
                                                            borderRadius: 'var(--radius)',
                                                            border: active ? '1.5px solid #047857' : '1px solid var(--border-strong)',
                                                            background: active ? '#ecfdf5' : '#fff',
                                                            fontWeight: 600,
                                                            fontSize: '0.78rem',
                                                            cursor: 'pointer',
                                                          }}
                                                        >
                                                          <input
                                                            type="radio"
                                                            name={`q_${qKey}_video_req`}
                                                            checked={active}
                                                            onChange={() => handleQuestionVideoToggle(secIdx, qIdx, opt.value)}
                                                          />
                                                          {opt.label}
                                                        </label>
                                                      );
                                                    })}
                                                  </div>
                                                  {qRow.is_video_required && (
                                                    <button type="button" className="btn-secondary" style={{ fontSize: '0.76rem', padding: '5px 10px' }} onClick={() => handleAddQuestionVideo(secIdx, qIdx)}>
                                                      <LucidePlus size={13} /> + Add Video
                                                    </button>
                                                  )}
                                                </div>

                                                {qRow.is_video_required && (
                                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingLeft: '8px', borderLeft: '3px solid #c4b5fd' }}>
                                                    {(qRow.videos || []).map((vRow, vIdx) => (
                                                      <div
                                                        key={vRow.id ? `v-${vRow.id}` : vRow.local_key || `v-idx-${vIdx}`}
                                                        style={{
                                                          padding: '10px',
                                                          border: '1px solid var(--border)',
                                                          borderRadius: '6px',
                                                          background: 'var(--bg-subtle)',
                                                          display: 'flex',
                                                          flexDirection: 'column',
                                                          gap: '8px',
                                                        }}
                                                      >
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                                                          <strong style={{ fontSize: '0.8rem' }}>
                                                            Video {vIdx + 1} ({vRow.is_mandatory ? 'Mandatory' : 'Optional'})
                                                          </strong>
                                                          <button
                                                            type="button"
                                                            className="btn-danger"
                                                            style={{ padding: '3px 8px', fontSize: '0.72rem' }}
                                                            onClick={() => handleRemoveQuestionVideo(secIdx, qIdx, vIdx)}
                                                          >
                                                            <LucideTrash2 size={12} /> Remove
                                                          </button>
                                                        </div>
                                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))', gap: '8px' }}>
                                                          <div>
                                                            <label style={labelStyle}>Video Name *</label>
                                                            <input
                                                              value={vRow.video_name}
                                                              onChange={(e) => handleUpdateQuestionVideo(secIdx, qIdx, vIdx, { video_name: e.target.value })}
                                                              placeholder="e.g. Pump Running Sound Video"
                                                              style={smallInputStyle}
                                                            />
                                                          </div>
                                                          <div>
                                                            <label style={labelStyle}>Max Duration (sec)</label>
                                                            <input
                                                              type="number"
                                                              min={3}
                                                              max={300}
                                                              value={vRow.max_duration_seconds}
                                                              onChange={(e) => handleUpdateQuestionVideo(secIdx, qIdx, vIdx, { max_duration_seconds: e.target.value })}
                                                              style={smallInputStyle}
                                                            />
                                                          </div>
                                                          <div>
                                                            <label style={labelStyle}>Min / Max Count</label>
                                                            <div style={{ display: 'flex', gap: '6px' }}>
                                                              <input
                                                                type="number"
                                                                min={0}
                                                                max={10}
                                                                value={vRow.min_videos}
                                                                onChange={(e) => handleUpdateQuestionVideo(secIdx, qIdx, vIdx, { min_videos: e.target.value })}
                                                                title="Min Videos"
                                                                style={smallInputStyle}
                                                              />
                                                              <input
                                                                type="number"
                                                                min={1}
                                                                max={10}
                                                                value={vRow.max_videos}
                                                                onChange={(e) => handleUpdateQuestionVideo(secIdx, qIdx, vIdx, { max_videos: e.target.value })}
                                                                title="Max Videos"
                                                                style={smallInputStyle}
                                                              />
                                                            </div>
                                                          </div>
                                                          <div>
                                                            <label style={labelStyle}>Requirement</label>
                                                            <select
                                                              value={vRow.is_mandatory ? 'MANDATORY' : 'OPTIONAL'}
                                                              onChange={(e) => {
                                                                const isMand = e.target.value === 'MANDATORY';
                                                                handleUpdateQuestionVideo(secIdx, qIdx, vIdx, {
                                                                  is_mandatory: isMand,
                                                                  min_videos: isMand ? Math.max(1, Number(vRow.min_videos || 1)) : Number(vRow.min_videos || 0),
                                                                });
                                                              }}
                                                              style={smallInputStyle}
                                                            >
                                                              <option value="OPTIONAL">Optional</option>
                                                              <option value="MANDATORY">Mandatory</option>
                                                            </select>
                                                          </div>
                                                          <div>
                                                            <label style={labelStyle}>Status</label>
                                                            <select
                                                              value={vRow.is_active !== false ? 'ACTIVE' : 'INACTIVE'}
                                                              onChange={(e) => handleUpdateQuestionVideo(secIdx, qIdx, vIdx, { is_active: e.target.value === 'ACTIVE' })}
                                                              style={smallInputStyle}
                                                            >
                                                              <option value="ACTIVE">Active</option>
                                                              <option value="INACTIVE">Inactive</option>
                                                            </select>
                                                          </div>
                                                        </div>
                                                        <div>
                                                          <label style={labelStyle}>Video Description</label>
                                                          <input
                                                            value={vRow.video_description}
                                                            onChange={(e) => handleUpdateQuestionVideo(secIdx, qIdx, vIdx, { video_description: e.target.value })}
                                                            placeholder="Describe inspection motion/sound to record"
                                                            style={smallInputStyle}
                                                          />
                                                        </div>
                                                        <EvidenceConditionEditor
                                                          ownerLabel={`Video "${vRow.video_name || `#${vIdx + 1}`}"`}
                                                          parentQuestion={qRow}
                                                          allQuestions={allQuestionsFlat}
                                                          conditionMode={vRow.condition_mode}
                                                          conditionLogic={vRow.condition_logic}
                                                          conditionRules={vRow.condition_rules}
                                                          onChange={(condPatch) => handleUpdateQuestionVideo(secIdx, qIdx, vIdx, condPatch)}
                                                        />
                                                      </div>
                                                    ))}
                                                  </div>
                                                )}
                                              </div>

                                              <div style={{ height: '1px', background: 'var(--border)' }} />

                                              {/* C. GPS / Latitude & Longitude Requirements */}
                                              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                                                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', fontWeight: 700 }}>
                                                      <LucideMapPin size={15} /> C. GPS / Latitude &amp; Longitude Requirement:
                                                    </span>
                                                    {[
                                                      { label: 'Yes', value: true },
                                                      { label: 'No', value: false },
                                                    ].map((opt) => {
                                                      const active = Boolean(qRow.is_location_required) === opt.value;
                                                      return (
                                                        <label
                                                          key={`sec-${secIdx}-q-${qIdx}-loc-req-${opt.label}`}
                                                          style={{
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '5px',
                                                            padding: '4px 12px',
                                                            borderRadius: 'var(--radius)',
                                                            border: active ? '1.5px solid #047857' : '1px solid var(--border-strong)',
                                                            background: active ? '#ecfdf5' : '#fff',
                                                            fontWeight: 600,
                                                            fontSize: '0.78rem',
                                                            cursor: 'pointer',
                                                          }}
                                                        >
                                                          <input
                                                            type="radio"
                                                            name={`q_${qKey}_loc_req`}
                                                            checked={active}
                                                            onChange={() => handleQuestionLocationToggle(secIdx, qIdx, opt.value)}
                                                          />
                                                          {opt.label}
                                                        </label>
                                                      );
                                                    })}
                                                  </div>
                                                  {qRow.is_location_required && (
                                                    <button type="button" className="btn-secondary" style={{ fontSize: '0.76rem', padding: '5px 10px' }} onClick={() => handleAddQuestionLocation(secIdx, qIdx)}>
                                                      <LucidePlus size={13} /> + Add GPS Point
                                                    </button>
                                                  )}
                                                </div>

                                                {qRow.is_location_required && (
                                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingLeft: '8px', borderLeft: '3px solid #6ee7b7' }}>
                                                    {(qRow.locations || []).map((lRow, lIdx) => (
                                                      <div
                                                        key={lRow.id ? `l-${lRow.id}` : lRow.local_key || `l-idx-${lIdx}`}
                                                        style={{
                                                          padding: '10px',
                                                          border: '1px solid var(--border)',
                                                          borderRadius: '6px',
                                                          background: 'var(--bg-subtle)',
                                                          display: 'flex',
                                                          flexDirection: 'column',
                                                          gap: '8px',
                                                        }}
                                                      >
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                                                          <strong style={{ fontSize: '0.8rem' }}>
                                                            GPS Requirement {lIdx + 1} ({lRow.is_mandatory ? 'Mandatory' : 'Optional'})
                                                          </strong>
                                                          <button
                                                            type="button"
                                                            className="btn-danger"
                                                            style={{ padding: '3px 8px', fontSize: '0.72rem' }}
                                                            onClick={() => handleRemoveQuestionLocation(secIdx, qIdx, lIdx)}
                                                          >
                                                            <LucideTrash2 size={12} /> Remove
                                                          </button>
                                                        </div>

                                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '8px' }}>
                                                          <div>
                                                            <label style={labelStyle}>Location Name *</label>
                                                            <input
                                                              value={lRow.location_name}
                                                              onChange={(e) => handleUpdateQuestionLocation(secIdx, qIdx, lIdx, { location_name: e.target.value })}
                                                              placeholder="e.g. Machine Inspection GPS Point"
                                                              style={smallInputStyle}
                                                            />
                                                          </div>
                                                          <div>
                                                            <label style={labelStyle}>Requirement</label>
                                                            <select
                                                              value={lRow.is_mandatory ? 'MANDATORY' : 'OPTIONAL'}
                                                              onChange={(e) => handleUpdateQuestionLocation(secIdx, qIdx, lIdx, { is_mandatory: e.target.value === 'MANDATORY' })}
                                                              style={smallInputStyle}
                                                            >
                                                              <option value="OPTIONAL">Optional</option>
                                                              <option value="MANDATORY">Mandatory</option>
                                                            </select>
                                                          </div>
                                                          <div>
                                                            <label style={labelStyle}>Capture Rule</label>
                                                            <select
                                                              value={lRow.capture_rule || 'LIVE_GPS'}
                                                              onChange={(e) => handleUpdateQuestionLocation(secIdx, qIdx, lIdx, { capture_rule: e.target.value })}
                                                              style={smallInputStyle}
                                                            >
                                                              <option value="LIVE_GPS">Live Device GPS</option>
                                                              <option value="HIGH_ACCURACY">High Accuracy GPS</option>
                                                            </select>
                                                          </div>
                                                          <div>
                                                            <label style={labelStyle}>Accuracy Threshold (m)</label>
                                                            <input
                                                              type="number"
                                                              min={1}
                                                              step="any"
                                                              value={lRow.accuracy_threshold_meters}
                                                              onChange={(e) => handleUpdateQuestionLocation(secIdx, qIdx, lIdx, { accuracy_threshold_meters: e.target.value })}
                                                              placeholder="Optional (e.g. 50)"
                                                              style={smallInputStyle}
                                                            />
                                                          </div>
                                                          <div>
                                                            <label style={labelStyle}>Status</label>
                                                            <select
                                                              value={lRow.is_active !== false ? 'ACTIVE' : 'INACTIVE'}
                                                              onChange={(e) => handleUpdateQuestionLocation(secIdx, qIdx, lIdx, { is_active: e.target.value === 'ACTIVE' })}
                                                              style={smallInputStyle}
                                                            >
                                                              <option value="ACTIVE">Active</option>
                                                              <option value="INACTIVE">Inactive</option>
                                                            </select>
                                                          </div>
                                                        </div>

                                                        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center', fontSize: '0.78rem' }}>
                                                          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontWeight: 600 }}>
                                                            <input
                                                              type="checkbox"
                                                              checked={lRow.capture_latitude !== false}
                                                              onChange={(e) => handleUpdateQuestionLocation(secIdx, qIdx, lIdx, { capture_latitude: e.target.checked })}
                                                            />
                                                            Capture Latitude
                                                          </label>
                                                          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontWeight: 600 }}>
                                                            <input
                                                              type="checkbox"
                                                              checked={lRow.capture_longitude !== false}
                                                              onChange={(e) => handleUpdateQuestionLocation(secIdx, qIdx, lIdx, { capture_longitude: e.target.checked })}
                                                            />
                                                            Capture Longitude
                                                          </label>
                                                          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontWeight: 600 }}>
                                                            <input
                                                              type="checkbox"
                                                              checked={lRow.capture_timestamp !== false}
                                                              onChange={(e) => handleUpdateQuestionLocation(secIdx, qIdx, lIdx, { capture_timestamp: e.target.checked })}
                                                            />
                                                            Capture Timestamp
                                                          </label>
                                                        </div>

                                                        <div>
                                                          <label style={labelStyle}>Location Description</label>
                                                          <input
                                                            value={lRow.location_description}
                                                            onChange={(e) => handleUpdateQuestionLocation(secIdx, qIdx, lIdx, { location_description: e.target.value })}
                                                            placeholder="Optional note on where GPS coordinates must be recorded"
                                                            style={smallInputStyle}
                                                          />
                                                        </div>

                                                        {/* Geofence Requirement Configuration */}
                                                        <div
                                                          style={{
                                                            padding: '10px',
                                                            borderRadius: '6px',
                                                            background: '#fff',
                                                            border: '1px solid var(--border)',
                                                            display: 'flex',
                                                            flexDirection: 'column',
                                                            gap: '8px',
                                                          }}
                                                        >
                                                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                                              <span style={{ fontSize: '0.79rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                                                                Geofence Requirement:
                                                              </span>
                                                              {[
                                                                { label: 'Yes', value: true },
                                                                { label: 'No', value: false },
                                                              ].map((opt) => {
                                                                const active = Boolean(lRow.is_geofence_required) === opt.value;
                                                                return (
                                                                  <label
                                                                    key={`sec-${secIdx}-q-${qIdx}-loc-${lIdx}-geo-${opt.label}`}
                                                                    style={{
                                                                      display: 'inline-flex',
                                                                      alignItems: 'center',
                                                                      gap: '5px',
                                                                      padding: '3px 11px',
                                                                      borderRadius: 'var(--radius)',
                                                                      border: active ? '1.5px solid #047857' : '1px solid var(--border-strong)',
                                                                      background: active ? '#ecfdf5' : '#fff',
                                                                      fontWeight: 600,
                                                                      fontSize: '0.76rem',
                                                                      cursor: 'pointer',
                                                                    }}
                                                                  >
                                                                    <input
                                                                      type="radio"
                                                                      name={`q_${qKey}_loc_${lIdx}_geofence_req`}
                                                                      checked={active}
                                                                      onChange={() => {
                                                                        const nextPts =
                                                                          opt.value && lRow.geofence_type === 'POLYGON' && (!lRow.geofence_polygon || lRow.geofence_polygon.length === 0)
                                                                            ? [
                                                                                { latitude: '', longitude: '' },
                                                                                { latitude: '', longitude: '' },
                                                                                { latitude: '', longitude: '' },
                                                                              ]
                                                                            : lRow.geofence_polygon || [];
                                                                        handleUpdateQuestionLocation(secIdx, qIdx, lIdx, {
                                                                          is_geofence_required: opt.value,
                                                                          geofence_polygon: nextPts,
                                                                        });
                                                                      }}
                                                                    />
                                                                    {opt.label}
                                                                  </label>
                                                                );
                                                              })}
                                                            </div>
                                                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                                              {lRow.is_geofence_required
                                                                ? 'Coordinates validated against configured boundary'
                                                                : 'Live GPS captured without geofence boundary check'}
                                                            </span>
                                                          </div>

                                                          {lRow.is_geofence_required && (
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '6px', borderTop: '1px dashed var(--border)' }}>
                                                              {siteMachines.length > 0 && (
                                                                <div>
                                                                  <label style={labelStyle}>Prefill from HERO Site / Machine (Optional)</label>
                                                                  <select
                                                                    value=""
                                                                    onChange={(e) => {
                                                                      const m = siteMachines.find((itemM) => String(itemM.id) === e.target.value);
                                                                      if (!m) return;
                                                                      const refLabel = m.site_name || m.location_name || `${m.machine_number} Site`;
                                                                      handleUpdateQuestionLocation(secIdx, qIdx, lIdx, {
                                                                        geofence_reference_name: refLabel,
                                                                        ...(m.current_latitude !== null && m.current_latitude !== undefined
                                                                          ? { geofence_latitude: String(m.current_latitude) }
                                                                          : {}),
                                                                        ...(m.current_longitude !== null && m.current_longitude !== undefined
                                                                          ? { geofence_longitude: String(m.current_longitude) }
                                                                          : {}),
                                                                      });
                                                                    }}
                                                                    style={smallInputStyle}
                                                                  >
                                                                    <option value="">-- Copy site / coordinates from HERO Machine --</option>
                                                                    {siteMachines.map((m) => (
                                                                      <option key={m.id} value={String(m.id)}>
                                                                        {m.machine_number} · {m.site_name || m.location_name || m.name}
                                                                        {m.current_latitude != null && m.current_longitude != null
                                                                          ? ` (${m.current_latitude}, ${m.current_longitude})`
                                                                          : ''}
                                                                      </option>
                                                                    ))}
                                                                  </select>
                                                                </div>
                                                              )}

                                                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '8px' }}>
                                                                <div>
                                                                  <label style={labelStyle}>Geofence Type *</label>
                                                                  <select
                                                                    value={lRow.geofence_type || 'CIRCLE'}
                                                                    onChange={(e) => {
                                                                      const nextType = e.target.value;
                                                                      const curPts = lRow.geofence_polygon || [];
                                                                      handleUpdateQuestionLocation(secIdx, qIdx, lIdx, {
                                                                        geofence_type: nextType,
                                                                        geofence_polygon:
                                                                          nextType === 'POLYGON' && curPts.length === 0
                                                                            ? [
                                                                                { latitude: '', longitude: '' },
                                                                                { latitude: '', longitude: '' },
                                                                                { latitude: '', longitude: '' },
                                                                              ]
                                                                            : curPts,
                                                                      });
                                                                    }}
                                                                    style={smallInputStyle}
                                                                  >
                                                                    <option value="CIRCLE">Circle (Center + Radius)</option>
                                                                    <option value="POLYGON">Polygon (Boundary Coordinates)</option>
                                                                  </select>
                                                                </div>
                                                                <div>
                                                                  <label style={labelStyle}>Reference Location / Site</label>
                                                                  <input
                                                                    value={lRow.geofence_reference_name || ''}
                                                                    onChange={(e) => handleUpdateQuestionLocation(secIdx, qIdx, lIdx, { geofence_reference_name: e.target.value })}
                                                                    placeholder="e.g. Anupgarh HDD Yard"
                                                                    style={smallInputStyle}
                                                                  />
                                                                </div>
                                                                {lRow.geofence_type !== 'POLYGON' && (
                                                                  <>
                                                                    <div>
                                                                      <label style={labelStyle}>Latitude *</label>
                                                                      <input
                                                                        type="number"
                                                                        step="any"
                                                                        value={lRow.geofence_latitude ?? ''}
                                                                        onChange={(e) => handleUpdateQuestionLocation(secIdx, qIdx, lIdx, { geofence_latitude: e.target.value })}
                                                                        placeholder="e.g. 28.4595"
                                                                        style={smallInputStyle}
                                                                      />
                                                                    </div>
                                                                    <div>
                                                                      <label style={labelStyle}>Longitude *</label>
                                                                      <input
                                                                        type="number"
                                                                        step="any"
                                                                        value={lRow.geofence_longitude ?? ''}
                                                                        onChange={(e) => handleUpdateQuestionLocation(secIdx, qIdx, lIdx, { geofence_longitude: e.target.value })}
                                                                        placeholder="e.g. 77.0266"
                                                                        style={smallInputStyle}
                                                                      />
                                                                    </div>
                                                                    <div>
                                                                      <label style={labelStyle}>Radius (meters) *</label>
                                                                      <input
                                                                        type="number"
                                                                        min={1}
                                                                        step="any"
                                                                        value={lRow.geofence_radius_meters ?? ''}
                                                                        onChange={(e) => handleUpdateQuestionLocation(secIdx, qIdx, lIdx, { geofence_radius_meters: e.target.value })}
                                                                        placeholder="e.g. 200"
                                                                        style={smallInputStyle}
                                                                      />
                                                                    </div>
                                                                  </>
                                                                )}
                                                              </div>

                                                              {lRow.geofence_type === 'POLYGON' && (
                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '8px', background: 'var(--bg-subtle)', borderRadius: '6px', border: '1px solid var(--border)' }}>
                                                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                                                                    <span style={{ fontSize: '0.76rem', fontWeight: 700 }}>
                                                                      Boundary Coordinates (minimum 3 points)
                                                                    </span>
                                                                    <button
                                                                      type="button"
                                                                      className="btn-secondary"
                                                                      style={{ padding: '3px 9px', fontSize: '0.73rem' }}
                                                                      onClick={() => {
                                                                        const curPts = lRow.geofence_polygon || [];
                                                                        handleUpdateQuestionLocation(secIdx, qIdx, lIdx, {
                                                                          geofence_polygon: [...curPts, { latitude: '', longitude: '' }],
                                                                        });
                                                                      }}
                                                                    >
                                                                      <LucidePlus size={12} /> + Add Boundary Point
                                                                    </button>
                                                                  </div>
                                                                  {(lRow.geofence_polygon || []).map((pt, ptIdx) => (
                                                                    <div key={`geo-pt-${ptIdx}`} style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                                                                      <span style={{ fontSize: '0.73rem', fontWeight: 600, minWidth: '52px', fontFamily: 'var(--font-mono)' }}>
                                                                        Pt {ptIdx + 1}:
                                                                      </span>
                                                                      <input
                                                                        type="number"
                                                                        step="any"
                                                                        value={pt.latitude ?? ''}
                                                                        onChange={(e) => {
                                                                          const nextPts = (lRow.geofence_polygon || []).map((row, idx) =>
                                                                            idx === ptIdx ? { ...row, latitude: e.target.value } : row
                                                                          );
                                                                          handleUpdateQuestionLocation(secIdx, qIdx, lIdx, { geofence_polygon: nextPts });
                                                                        }}
                                                                        placeholder="Latitude"
                                                                        style={{ ...smallInputStyle, flex: '1 1 130px' }}
                                                                      />
                                                                      <input
                                                                        type="number"
                                                                        step="any"
                                                                        value={pt.longitude ?? ''}
                                                                        onChange={(e) => {
                                                                          const nextPts = (lRow.geofence_polygon || []).map((row, idx) =>
                                                                            idx === ptIdx ? { ...row, longitude: e.target.value } : row
                                                                          );
                                                                          handleUpdateQuestionLocation(secIdx, qIdx, lIdx, { geofence_polygon: nextPts });
                                                                        }}
                                                                        placeholder="Longitude"
                                                                        style={{ ...smallInputStyle, flex: '1 1 130px' }}
                                                                      />
                                                                      <button
                                                                        type="button"
                                                                        className="btn-danger"
                                                                        style={{ padding: '4px 8px', fontSize: '0.72rem' }}
                                                                        disabled={(lRow.geofence_polygon || []).length <= 3}
                                                                        onClick={() => {
                                                                          const nextPts = (lRow.geofence_polygon || []).filter((_, idx) => idx !== ptIdx);
                                                                          handleUpdateQuestionLocation(secIdx, qIdx, lIdx, { geofence_polygon: nextPts });
                                                                        }}
                                                                      >
                                                                        <LucideX size={12} />
                                                                      </button>
                                                                    </div>
                                                                  ))}
                                                                </div>
                                                              )}
                                                            </div>
                                                          )}
                                                        </div>

                                                        <EvidenceConditionEditor
                                                          ownerLabel={`GPS "${lRow.location_name || `#${lIdx + 1}`}"`}
                                                          parentQuestion={qRow}
                                                          allQuestions={allQuestionsFlat}
                                                          conditionMode={lRow.condition_mode}
                                                          conditionLogic={lRow.condition_logic}
                                                          conditionRules={lRow.condition_rules}
                                                          onChange={(condPatch) => handleUpdateQuestionLocation(secIdx, qIdx, lIdx, condPatch)}
                                                        />
                                                      </div>
                                                    ))}
                                                  </div>
                                                )}
                                              </div>
                                            </div>
                                          </>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          );
        })()}

        {/* SECTION 4 – Save Configuration */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '10px',
            paddingTop: '14px',
            borderTop: '1px solid var(--border)',
          }}
        >
          <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
            SECTION 4 – Save Configuration
          </span>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => navigate('/operations/machine-maintenance')}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={resetForm}
              disabled={saving}
            >
              <LucideRotateCcw size={14} /> Reset Form
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              <LucideSave size={14} />
              {saving
                ? 'Saving Configuration...'
                : editingId
                  ? 'Update Maintenance Configuration'
                  : 'Save Maintenance Configuration'}
            </button>
          </div>
        </div>
      </form>

      {/* Configured Activities Table */}
      <div className="app-card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
          <h3 style={{ margin: 0, fontSize: '0.94rem', fontWeight: 700 }}>
            Configured Maintenance Activities ({savedConfigs.length})
          </h3>
          <span style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
            Click Edit to load full questions along with nested Photo, Video, GPS, and conditional rules into the form above.
          </span>
        </div>

        {loading ? (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
            Loading saved configurations...
          </div>
        ) : (
          <div className="table-container" style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Item Code</th>
                  <th>Activity &amp; Description</th>
                  <th>Frequencies</th>
                  <th>Sections &amp; Questions</th>
                  <th>Photos</th>
                  <th>Videos</th>
                  <th>GPS / Location</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {savedConfigs.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>
                      No maintenance configurations saved yet.
                    </td>
                  </tr>
                ) : (
                  savedConfigs.map((cfg) => {
                    const displayPhotos = cfg.all_photos || cfg.photos || [];
                    const displayVideos = cfg.all_videos || cfg.videos || [];
                    const displayLocations = cfg.all_locations || cfg.locations || [];
                    return (
                      <tr key={cfg.id}>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
                          {cfg.item_code}
                          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 500 }}>v{cfg.config_version || 1}</div>
                        </td>
                        <td style={{ minWidth: '200px' }}>
                          <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{cfg.activity_name}</div>
                          <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                            {cfg.description || '-'}
                          </div>
                        </td>
                        <td style={{ fontSize: '0.74rem', minWidth: '170px' }}>
                          {cfg.frequency ? (
                            <div>
                              <strong>{cfg.frequency_name || CALENDAR_FREQUENCY_OPTIONS.find((o) => o.code === cfg.frequency)?.label || cfg.frequency}</strong>
                              {cfg.frequency_schedule_summary && cfg.frequency_schedule_summary !== cfg.frequency_name ? (
                                <div style={{ color: 'var(--text-secondary)', fontSize: '0.71rem', marginTop: '2px' }}>
                                  {cfg.frequency_schedule_summary}
                                </div>
                              ) : null}
                            </div>
                          ) : 'Unmapped'}
                        </td>
                        <td style={{ fontSize: '0.74rem', minWidth: '210px' }}>
                          {cfg.sections && cfg.sections.length > 0
                            ? cfg.sections.map((sec, sIdx) => (
                                <div key={sec.id || sIdx} style={{ marginBottom: sIdx < cfg.sections.length - 1 ? '6px' : 0 }}>
                                  <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                                    S{sIdx + 1}: {sec.section_name}{sec.is_active === false ? ' (Inactive)' : ''}
                                  </div>
                                  {(sec.questions || []).length > 0 ? (
                                    (sec.questions || []).map((q, qIdx) => (
                                      <div key={q.id || qIdx} style={{ paddingLeft: '8px', color: 'var(--text-secondary)' }}>
                                        {qIdx + 1}. {q.question_name} ({q.answer_type}{q.condition_mode === 'CONDITIONAL' ? ' · Cond.' : ''})
                                      </div>
                                    ))
                                  ) : (
                                    <div style={{ paddingLeft: '8px', color: 'var(--text-muted)' }}>No questions</div>
                                  )}
                                </div>
                              ))
                            : cfg.questions && cfg.questions.length > 0
                              ? cfg.questions.map((q, i) => (
                                  <div key={q.id || i}>
                                    {i + 1}. {q.question_name} ({q.answer_type}{q.condition_mode === 'CONDITIONAL' ? ' · Cond.' : ''})
                                  </div>
                                ))
                              : <span className="badge-pill badge-neutral">None</span>}
                        </td>
                        <td style={{ fontSize: '0.74rem' }}>
                          {displayPhotos.length > 0
                            ? displayPhotos.map((p, i) => (
                                <div key={p.id || i}>
                                  {i + 1}. {p.photo_name} ({p.is_mandatory ? 'Mandatory' : 'Optional'}{p.condition_mode === 'CONDITIONAL' ? ' · Cond.' : ''})
                                </div>
                              ))
                            : cfg.is_photo_required
                              ? <span className="badge-pill badge-green">Photo Required</span>
                              : <span className="badge-pill badge-neutral">None</span>}
                        </td>
                        <td style={{ fontSize: '0.74rem' }}>
                          {displayVideos.length > 0
                            ? displayVideos.map((v, i) => (
                                <div key={v.id || i}>
                                  {i + 1}. {v.video_name} ({v.max_duration_seconds}s · {v.is_mandatory ? 'Mandatory' : 'Optional'}{v.condition_mode === 'CONDITIONAL' ? ' · Cond.' : ''})
                                </div>
                              ))
                            : <span className="badge-pill badge-neutral">None</span>}
                        </td>
                        <td style={{ fontSize: '0.74rem' }}>
                          {displayLocations.length > 0
                            ? displayLocations.map((l, i) => (
                                <div key={l.id || i}>
                                  {i + 1}. {l.location_name} ({l.is_mandatory ? 'Mandatory' : 'Optional'}
                                  {l.is_geofence_required
                                    ? ` · Geofence ${l.geofence_type === 'POLYGON' ? `Polygon (${(l.geofence_polygon || []).length} pts)` : `${l.geofence_radius_meters}m`}`
                                    : ''}
                                  {l.condition_mode === 'CONDITIONAL' ? ' · Cond.' : ''})
                                </div>
                              ))
                            : <span className="badge-pill badge-neutral">None</span>}
                        </td>
                        <td>
                          <span className={`badge-pill ${cfg.is_active ? 'badge-green' : 'badge-neutral'}`}>
                            {cfg.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <button
                            type="button"
                            className="btn-secondary"
                            style={{ padding: '4px 8px', fontSize: '0.74rem', marginRight: '6px' }}
                            onClick={() => handleEditExisting(cfg)}
                          >
                            <LucideEdit2 size={12} /> Edit
                          </button>
                          <button
                            type="button"
                            className="btn-secondary"
                            style={{ padding: '4px 8px', fontSize: '0.74rem' }}
                            onClick={() => handleToggleActiveConfig(cfg)}
                          >
                            {cfg.is_active ? 'Disable' : 'Enable'}
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

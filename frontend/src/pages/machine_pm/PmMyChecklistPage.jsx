import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LucideCheckCircle2, LucideLock, LucideWrench } from 'lucide-react';
import { pmService } from '../../services/pmService';
import { useToast } from '../../context/ToastContext';
import { PmLayoutHeader } from './PmLayoutHeader';

const describeItemRules = (it) => {
  const secCount = (it.sections || []).length;
  const qCount = (it.custom_fields || []).length;
  const pReqs = (it.photo_requirements || []).filter((p) => p.is_required !== false && p.is_active !== false);
  const vReqs = (it.video_requirements || []).filter((v) => v.is_required !== false && v.is_active !== false);
  const lReqs = (it.location_requirements || []).filter((l) => l.is_required !== false && l.is_active !== false);

  const sText = secCount > 0 ? `${secCount} Section(s) · ` : '';
  const qText = qCount > 0 ? `${qCount} Question(s)` : 'No Questions';
  const pText = pReqs.length > 0
    ? `${pReqs.length} Photo(s)`
    : it.requires_photo
      ? '1 Photo (Mandatory)'
      : 'No Photos';
  const vText = vReqs.length > 0 ? `${vReqs.length} Video(s)` : 'No Videos';
  const lText = lReqs.length > 0 ? ` · ${lReqs.length} GPS` : '';
  return `${sText}${qText} · ${pText} · ${vText}${lText}`;
};

export const PmMyChecklistPage = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const showToastRef = useRef(showToast);
  showToastRef.current = showToast;

  const [roleInfo, setRoleInfo] = useState(null);
  const [frequencies, setFrequencies] = useState([]);
  const [selectedFreq, setSelectedFreq] = useState('');
  const [checklistData, setChecklistData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    pmService.getFrequencies()
      .then((res) => {
        const d = res?.data || {};
        setRoleInfo(d.role_info || null);
        const list = d.frequencies || [];
        setFrequencies(list);
        const firstAllowed = list.find((f) => f.can_view);
        if (firstAllowed) {
          setSelectedFreq(firstAllowed.code);
        }
      })
      .catch((err) => showToastRef.current(err?.message || 'Failed to load assigned frequencies.', 'error'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedFreq) return;
    setLoading(true);
    pmService.getChecklist(selectedFreq)
      .then((res) => setChecklistData(res?.data || null))
      .catch((err) => {
        setChecklistData(null);
        showToastRef.current(err?.message || 'Access denied or failed to load checklist.', 'error');
      })
      .finally(() => setLoading(false));
  }, [selectedFreq]);

  const categoryGroups = Array.isArray(checklistData?.category_groups)
    ? checklistData.category_groups.filter((g) => Array.isArray(g.items) && g.items.length > 0)
    : Object.entries(checklistData?.categories || {})
        .filter(([, rows]) => Array.isArray(rows) && rows.length > 0)
        .map(([code, rows]) => ({
          category_code: code,
          category_name: rows[0]?.category_name || code,
          items: rows,
        }));

  const renderCategoryTable = (title, rows) => (
    <div>
      <h4 style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '8px' }}>
        {title} ({rows.length})
      </h4>
      <table className="data-table">
        <thead>
          <tr>
            <th>Code</th>
            <th>Activity Name &amp; Sections</th>
            <th>Description</th>
            <th>Configured Rules</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((it) => {
            const secs = Array.isArray(it.sections) ? it.sections : [];
            return (
              <tr key={it.id}>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.76rem' }}>{it.item_code}</td>
                <td>
                  <div style={{ fontWeight: 600 }}>{it.description}</div>
                  {secs.length > 0 && (
                    <div style={{ fontSize: '0.73rem', color: 'var(--text-secondary)', marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      {secs.map((sec, sIdx) => (
                        <div key={sec.id || sIdx}>
                          Section {sIdx + 1}: <strong>{sec.section_name}</strong> ({(sec.questions || []).length} Question(s))
                        </div>
                      ))}
                    </div>
                  )}
                </td>
                <td style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                  {it.special_instructions || it.remarks || '-'}
                </td>
                <td>
                  <span className="badge-pill badge-neutral">{describeItemRules(it)}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="screen-container" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <PmLayoutHeader
        title="My Maintenance Checklist"
        subtitle="Dynamic preventive maintenance checklists generated from Admin configuration"
        roleInfo={roleInfo}
      />

      {/* Dynamic Frequency Selector Cards */}
      <div className="app-card" style={{ padding: '14px 16px' }}>
        <div style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '10px', color: 'var(--text-secondary)' }}>
          Configured Maintenance Frequencies ({frequencies.length})
        </div>
        {frequencies.length === 0 && !loading ? (
          <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            No maintenance frequencies have configured checklist activities yet.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))', gap: '10px' }}>
            {frequencies.map((freq) => {
              const isSelected = selectedFreq === freq.code;
              const assignedNames = (freq.assigned_roles || [])
                .filter((r) => r.role_code !== 'ADMIN')
                .map((r) => r.role_name)
                .join(', ');
              return (
                <button
                  key={freq.code}
                  type="button"
                  disabled={!freq.can_view}
                  onClick={() => freq.can_view && setSelectedFreq(freq.code)}
                  style={{
                    textAlign: 'left',
                    padding: '12px',
                    borderRadius: 'var(--radius)',
                    border: isSelected ? '2px solid var(--accent)' : '1px solid var(--border)',
                    background: !freq.can_view ? 'var(--bg-subtle)' : isSelected ? '#f9fafb' : 'var(--bg-surface)',
                    opacity: freq.can_view ? 1 : 0.55,
                    cursor: freq.can_view ? 'pointer' : 'not-allowed',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <strong style={{ fontSize: '0.88rem' }}>{freq.name}</strong>
                    {freq.can_view ? <LucideCheckCircle2 size={14} color="var(--live)" /> : <LucideLock size={14} />}
                  </div>
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                    Role: {assignedNames || 'Admin'} · {freq.checklist_item_count} activities
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Checklist Preview & Launch */}
      {loading ? (
        <div className="app-card" style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
          Loading checklist activities...
        </div>
      ) : checklistData ? (
        <div className="app-card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>
                {checklistData.frequency?.name} Checklist ({checklistData.total_items} Configured Activities)
              </h3>
              <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Questions, photo requirements, and video requirements reflect the live Admin configuration.
              </p>
            </div>
            {checklistData.can_submit ? (
              <button
                type="button"
                className="btn-primary"
                onClick={() => navigate(`/operations/machine-maintenance/perform/select/${checklistData.frequency.code}`)}
              >
                <LucideWrench size={14} /> Start {checklistData.frequency.name} Check
              </button>
            ) : null}
          </div>

          {categoryGroups.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.84rem' }}>
              No activities are configured for {checklistData.frequency?.name}.
            </div>
          ) : (
            categoryGroups.map((group, idx) => (
              <React.Fragment key={group.category_code || idx}>
                {renderCategoryTable(`Category ${idx + 1}: ${group.category_name}`, group.items)}
              </React.Fragment>
            ))
          )}
        </div>
      ) : (
        <div className="empty-state">
          <h3>No accessible checklist</h3>
          <p>Your account does not have an assigned maintenance checklist frequency with configured activities.</p>
        </div>
      )}
    </div>
  );
};

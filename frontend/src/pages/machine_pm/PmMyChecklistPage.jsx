import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LucideCamera, LucideCheckCircle2, LucideLock, LucideWrench } from 'lucide-react';
import { pmService } from '../../services/pmService';
import { useToast } from '../../context/ToastContext';
import { PmLayoutHeader } from './PmLayoutHeader';

export const PmMyChecklistPage = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
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
      .catch((err) => showToast(err?.message || 'Failed to load assigned frequencies.', 'error'))
      .finally(() => setLoading(false));
  }, [showToast]);

  useEffect(() => {
    if (!selectedFreq) return;
    setLoading(true);
    pmService.getChecklist(selectedFreq)
      .then((res) => setChecklistData(res?.data || null))
      .catch((err) => {
        setChecklistData(null);
        showToast(err?.message || 'Access denied or failed to load checklist.', 'error');
      })
      .finally(() => setLoading(false));
  }, [selectedFreq, showToast]);

  const machineItems = checklistData?.categories?.MACHINE || [];
  const engineItems = checklistData?.categories?.ENGINE || [];
  const asRequired = checklistData?.as_required_reference_items || [];

  return (
    <div className="screen-container" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <PmLayoutHeader
        title="My Maintenance Checklist"
        subtitle="Role-assigned preventive maintenance checklists and activity specifications"
        roleInfo={roleInfo}
      />

      {/* Frequency Selector Cards */}
      <div className="app-card" style={{ padding: '14px 16px' }}>
        <div style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '10px', color: 'var(--text-secondary)' }}>
          Maintenance Frequencies & Role Assignments
        </div>
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
                {checklistData.frequency?.name} Checklist ({checklistData.total_items} Mandatory Activities)
              </h3>
              <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Each activity requires its own individual photograph as proof of completion.
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

          <div>
            <h4 style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '8px' }}>
              Category 1: Machine ({machineItems.length})
            </h4>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Activity Description</th>
                  <th>Service Interval</th>
                  <th>Remarks / Special Instructions</th>
                  <th>Photo Rule</th>
                </tr>
              </thead>
              <tbody>
                {machineItems.map((it) => (
                  <tr key={it.id}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.76rem' }}>{it.item_code}</td>
                    <td style={{ fontWeight: 600 }}>{it.description}</td>
                    <td>{it.service_interval || checklistData.frequency.name}</td>
                    <td style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                      {it.remarks || it.special_instructions || '-'}
                    </td>
                    <td>
                      <span className="badge-pill badge-amber">
                        <LucideCamera size={11} /> Mandatory Unique Photo
                      </span>
                    </td>
                  </tr>
                ))}
                {machineItems.length === 0 ? (
                  <tr><td colSpan={5} style={{ color: 'var(--text-muted)' }}>No Machine items in this frequency.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div>
            <h4 style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '8px' }}>
              Category 2: Engine ({engineItems.length})
            </h4>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Activity Description</th>
                  <th>Service Interval</th>
                  <th>Remarks / Special Instructions</th>
                  <th>Photo Rule</th>
                </tr>
              </thead>
              <tbody>
                {engineItems.map((it) => (
                  <tr key={it.id}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.76rem' }}>{it.item_code}</td>
                    <td style={{ fontWeight: 600 }}>{it.description}</td>
                    <td>{it.service_interval || checklistData.frequency.name}</td>
                    <td style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                      {it.remarks || it.special_instructions || '-'}
                    </td>
                    <td>
                      <span className="badge-pill badge-amber">
                        <LucideCamera size={11} /> Mandatory Unique Photo
                      </span>
                    </td>
                  </tr>
                ))}
                {engineItems.length === 0 ? (
                  <tr><td colSpan={5} style={{ color: 'var(--text-muted)' }}>No Engine items in this frequency.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>

          {asRequired.length > 0 ? (
            <div style={{ padding: '12px', background: 'var(--bg-subtle)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
              <strong style={{ fontSize: '0.82rem', display: 'block', marginBottom: '6px' }}>
                Condition-Based / As-Required Schedule Reference (Apollo HDD A600V2 SOP)
              </strong>
              <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                {asRequired.map((ar) => (
                  <li key={ar.id}>
                    <strong>{ar.description}</strong> — {ar.remarks || ar.service_interval}
                    {ar.special_instructions ? ` (${ar.special_instructions})` : ''}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="empty-state">
          <h3>No accessible checklist</h3>
          <p>Your account does not have an assigned maintenance checklist frequency.</p>
        </div>
      )}
    </div>
  );
};


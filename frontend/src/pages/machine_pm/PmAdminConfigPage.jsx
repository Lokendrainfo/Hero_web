import React, { useCallback, useEffect, useState } from 'react';
import { LucidePlus, LucideTrash2 } from 'lucide-react';
import { pmService } from '../../services/pmService';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../context/ToastContext';
import { SearchableSelect } from '../../components/common/Select';
import { PmLayoutHeader } from './PmLayoutHeader';

const unwrap = (res) => {
  if (Array.isArray(res)) return res;
  if (Array.isArray(res?.data)) return res.data;
  if (Array.isArray(res?.results)) return res.results;
  return [];
};

export const PmAdminConfigPage = () => {
  const { isAdmin } = useAuth();
  const { showToast } = useToast();

  const [roleInfo, setRoleInfo] = useState(null);
  const [tab, setTab] = useState('items'); // 'items' | 'mappings' | 'roles' | 'audit'
  const [categories, setCategories] = useState([]);
  const [frequencies, setFrequencies] = useState([]);
  const [items, setItems] = useState([]);
  const [freqMappings, setFreqMappings] = useState([]);
  const [roleMappings, setRoleMappings] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  const [newItem, setNewItem] = useState({
    item_code: '',
    category: '',
    description: '',
    remarks: '',
    service_interval: '',
    sort_order: 50,
  });

  const [newFreqMap, setNewFreqMap] = useState({
    checklist_item: '',
    frequency: '',
    is_mandatory: true,
    sort_order: 50,
  });

  const [newRoleMap, setNewRoleMap] = useState({
    role_code: 'OPERATOR',
    role_name: 'Operator',
    frequency: '',
    can_view: true,
    can_submit: true,
  });

  const loadConfig = useCallback(async () => {
    try {
      setLoading(true);
      const [fRes, catRes, freqRes, itemRes, mapRes, roleRes, auditRes] = await Promise.all([
        pmService.getFrequencies(),
        pmService.getAdminCategories({ page_size: 50 }),
        pmService.getAdminFrequencies({ page_size: 50 }),
        pmService.getAdminChecklistItems({ page_size: 100 }),
        pmService.getAdminFrequencyMappings({ page_size: 100 }),
        pmService.getAdminRoleMappings({ page_size: 100 }),
        pmService.getAuditLogs({ page_size: 30 }),
      ]);
      setRoleInfo(fRes?.data?.role_info || null);
      const catList = unwrap(catRes);
      const freqList = unwrap(freqRes);
      const itemList = unwrap(itemRes);
      setCategories(catList);
      setFrequencies(freqList);
      setItems(itemList);
      setFreqMappings(unwrap(mapRes));
      setRoleMappings(unwrap(roleRes));
      setAuditLogs(unwrap(auditRes));

      if (catList.length && !newItem.category) {
        setNewItem((p) => ({ ...p, category: String(catList[0].id) }));
      }
      if (itemList.length && !newFreqMap.checklist_item) {
        setNewFreqMap((p) => ({ ...p, checklist_item: String(itemList[0].id) }));
      }
      if (freqList.length && !newFreqMap.frequency) {
        setNewFreqMap((p) => ({ ...p, frequency: String(freqList[0].id) }));
      }
      if (freqList.length && !newRoleMap.frequency) {
        setNewRoleMap((p) => ({ ...p, frequency: String(freqList[0].id) }));
      }
    } catch (err) {
      showToast(err?.message || 'Admin permission required to access configuration.', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  if (!isAdmin && roleInfo && !roleInfo.is_admin) {
    return (
      <div className="screen-container">
        <PmLayoutHeader title="Maintenance Configuration" roleInfo={roleInfo} />
        <div className="empty-state" style={{ marginTop: '16px' }}>
          <h3>Admin Access Required</h3>
          <p>Only Administrators can modify checklist masters, frequency mappings, or role assignments.</p>
        </div>
      </div>
    );
  }

  const handleCreateItem = async (e) => {
    e.preventDefault();
    try {
      await pmService.createAdminChecklistItem({
        ...newItem,
        category: Number(newItem.category),
        sort_order: Number(newItem.sort_order || 50),
        requires_photo: true,
        requires_remarks_if_not_completed: true,
        is_active: true,
      });
      showToast('Checklist item created.', 'success');
      setNewItem((p) => ({ ...p, item_code: '', description: '', remarks: '', service_interval: '' }));
      loadConfig();
    } catch (err) {
      showToast(err?.message || 'Failed to create checklist item.', 'error');
    }
  };

  const handleToggleItemActive = async (item) => {
    try {
      await pmService.updateAdminChecklistItem(item.id, { is_active: !item.is_active });
      showToast(`Item ${item.item_code} ${item.is_active ? 'disabled' : 'enabled'}.`, 'success');
      loadConfig();
    } catch (err) {
      showToast(err?.message || 'Failed to update checklist item.', 'error');
    }
  };

  const handleCreateFreqMap = async (e) => {
    e.preventDefault();
    try {
      await pmService.createAdminFrequencyMapping({
        checklist_item: Number(newFreqMap.checklist_item),
        frequency: Number(newFreqMap.frequency),
        is_mandatory: Boolean(newFreqMap.is_mandatory),
        sort_order: Number(newFreqMap.sort_order || 50),
        is_active: true,
      });
      showToast('Frequency mapping added.', 'success');
      loadConfig();
    } catch (err) {
      showToast(err?.message || 'Failed to map checklist item.', 'error');
    }
  };

  const handleDeleteFreqMap = async (id) => {
    try {
      await pmService.deleteAdminFrequencyMapping(id);
      showToast('Frequency mapping removed.', 'info');
      loadConfig();
    } catch (err) {
      showToast(err?.message || 'Failed to remove mapping.', 'error');
    }
  };

  const handleCreateRoleMap = async (e) => {
    e.preventDefault();
    try {
      await pmService.createAdminRoleMapping({
        ...newRoleMap,
        frequency: Number(newRoleMap.frequency),
        is_active: true,
      });
      showToast('Role-frequency mapping saved.', 'success');
      loadConfig();
    } catch (err) {
      showToast(err?.message || 'Failed to add role mapping.', 'error');
    }
  };

  const handleToggleRoleMap = async (rm) => {
    try {
      await pmService.updateAdminRoleMapping(rm.id, { is_active: !rm.is_active });
      showToast('Role mapping updated.', 'success');
      loadConfig();
    } catch (err) {
      showToast(err?.message || 'Failed to update role mapping.', 'error');
    }
  };

  return (
    <div className="screen-container" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <PmLayoutHeader
        title="Maintenance Configuration (Admin)"
        subtitle="Configure checklist master items, frequency mappings, role assignments, and audit logs"
        roleInfo={roleInfo}
      />

      <div className="filter-row">
        {[
          { key: 'items', label: `Checklist Master (${items.length})` },
          { key: 'mappings', label: `Frequency Mappings (${freqMappings.length})` },
          { key: 'roles', label: `Role Assignments (${roleMappings.length})` },
          { key: 'audit', label: `Audit Logs (${auditLogs.length})` },
        ].map((t) => (
          <button
            key={t.key}
            type="button"
            className={`filter-chip${tab === t.key ? ' active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="app-card" style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading configuration...</div>
      ) : tab === 'items' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <form onSubmit={handleCreateItem} className="app-card" style={{ padding: '16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))', gap: '10px', alignItems: 'end' }}>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Item Code *</label>
              <input required value={newItem.item_code} onChange={(e) => setNewItem({ ...newItem, item_code: e.target.value })} placeholder="e.g. SOP-MCH-029" style={{ width: '100%', height: '36px', padding: '0 10px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)' }} />
            </div>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Category *</label>
              <SearchableSelect value={newItem.category} onChange={(e) => setNewItem({ ...newItem, category: e.target.value })}>
                {categories.map((c) => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
              </SearchableSelect>
            </div>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Activity Description *</label>
              <input required value={newItem.description} onChange={(e) => setNewItem({ ...newItem, description: e.target.value })} placeholder="Activity description" style={{ width: '100%', height: '36px', padding: '0 10px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)' }} />
            </div>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Remarks / Interval</label>
              <input value={newItem.remarks} onChange={(e) => setNewItem({ ...newItem, remarks: e.target.value })} placeholder="Optional SOP remarks" style={{ width: '100%', height: '36px', padding: '0 10px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)' }} />
            </div>
            <button type="submit" className="btn-primary" style={{ height: '36px' }}>
              <LucidePlus size={14} /> Add Checklist Item
            </button>
          </form>

          <div className="table-container app-card">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Category</th>
                  <th>Description</th>
                  <th>Mapped Frequencies</th>
                  <th>Remarks</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Toggle</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.76rem' }}>{it.item_code}</td>
                    <td>{it.category_name}</td>
                    <td style={{ fontWeight: 600 }}>{it.description}</td>
                    <td>{(it.mapped_frequencies || []).join(', ') || 'Unmapped'}</td>
                    <td style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{it.remarks || it.service_interval || '-'}</td>
                    <td><span className={`badge-pill ${it.is_active ? 'badge-green' : 'badge-neutral'}`}>{it.is_active ? 'Active' : 'Inactive'}</span></td>
                    <td style={{ textAlign: 'right' }}>
                      <button type="button" className="btn-secondary" style={{ padding: '4px 10px', fontSize: '0.74rem' }} onClick={() => handleToggleItemActive(it)}>
                        {it.is_active ? 'Disable' : 'Enable'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : tab === 'mappings' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <form onSubmit={handleCreateFreqMap} className="app-card" style={{ padding: '16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', alignItems: 'end' }}>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Checklist Activity</label>
              <SearchableSelect value={newFreqMap.checklist_item} onChange={(e) => setNewFreqMap({ ...newFreqMap, checklist_item: e.target.value })}>
                {items.map((it) => <option key={it.id} value={String(it.id)}>{it.item_code} — {it.description}</option>)}
              </SearchableSelect>
            </div>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Frequency</label>
              <SearchableSelect value={newFreqMap.frequency} onChange={(e) => setNewFreqMap({ ...newFreqMap, frequency: e.target.value })}>
                {frequencies.map((f) => <option key={f.id} value={String(f.id)}>{f.name}</option>)}
              </SearchableSelect>
            </div>
            <button type="submit" className="btn-primary" style={{ height: '36px' }}>
              <LucidePlus size={14} /> Map Activity to Frequency
            </button>
          </form>

          <div className="table-container app-card">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Frequency</th>
                  <th>Item Code</th>
                  <th>Checklist Activity</th>
                  <th>Mandatory</th>
                  <th style={{ textAlign: 'right' }}>Remove</th>
                </tr>
              </thead>
              <tbody>
                {freqMappings.map((m) => (
                  <tr key={m.id}>
                    <td><span className="badge-pill badge-blue">{m.frequency_name}</span></td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.76rem' }}>{m.checklist_item_code}</td>
                    <td style={{ fontWeight: 600 }}>{m.checklist_description}</td>
                    <td>{m.is_mandatory ? 'Yes' : 'No'}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button type="button" className="btn-danger" style={{ padding: '4px 8px', fontSize: '0.74rem' }} onClick={() => handleDeleteFreqMap(m.id)}>
                        <LucideTrash2 size={12} /> Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : tab === 'roles' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <form onSubmit={handleCreateRoleMap} className="app-card" style={{ padding: '16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', alignItems: 'end' }}>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Role Code</label>
              <input required value={newRoleMap.role_code} onChange={(e) => setNewRoleMap({ ...newRoleMap, role_code: e.target.value.toUpperCase() })} style={{ width: '100%', height: '36px', padding: '0 10px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)' }} />
            </div>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Role Display Name</label>
              <input required value={newRoleMap.role_name} onChange={(e) => setNewRoleMap({ ...newRoleMap, role_name: e.target.value })} style={{ width: '100%', height: '36px', padding: '0 10px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)' }} />
            </div>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Frequency</label>
              <SearchableSelect value={newRoleMap.frequency} onChange={(e) => setNewRoleMap({ ...newRoleMap, frequency: e.target.value })}>
                {frequencies.map((f) => <option key={f.id} value={String(f.id)}>{f.name}</option>)}
              </SearchableSelect>
            </div>
            <button type="submit" className="btn-primary" style={{ height: '36px' }}>
              <LucidePlus size={14} /> Assign Role
            </button>
          </form>

          <div className="table-container app-card">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Role Code</th>
                  <th>Role Name</th>
                  <th>Frequency</th>
                  <th>View / Submit</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Toggle</th>
                </tr>
              </thead>
              <tbody>
                {roleMappings.map((rm) => (
                  <tr key={rm.id}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{rm.role_code}</td>
                    <td>{rm.role_name}</td>
                    <td><span className="badge-pill badge-blue">{rm.frequency_name}</span></td>
                    <td>{rm.can_view ? 'View' : '-'} / {rm.can_submit ? 'Submit' : '-'}</td>
                    <td><span className={`badge-pill ${rm.is_active ? 'badge-green' : 'badge-neutral'}`}>{rm.is_active ? 'Active' : 'Inactive'}</span></td>
                    <td style={{ textAlign: 'right' }}>
                      <button type="button" className="btn-secondary" style={{ padding: '4px 10px', fontSize: '0.74rem' }} onClick={() => handleToggleRoleMap(rm)}>
                        {rm.is_active ? 'Disable' : 'Enable'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="table-container app-card">
          <table className="data-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Entity</th>
                <th>Action</th>
                <th>Actor</th>
                <th>Frequency</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.map((log) => (
                <tr key={log.id}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.76rem' }}>{new Date(log.created_at).toLocaleString()}</td>
                  <td>{log.entity_type} #{log.entity_id}</td>
                  <td><span className="badge-pill badge-neutral">{log.action}</span></td>
                  <td>{log.actor_username} ({log.actor_role})</td>
                  <td>{log.frequency_code || '-'}</td>
                  <td style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', maxWidth: '320px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {JSON.stringify(log.details)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};


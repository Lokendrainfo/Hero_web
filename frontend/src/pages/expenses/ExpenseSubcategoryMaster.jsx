import React, { useEffect, useState, useMemo } from 'react';
import { expenseService } from '../../services/expenseService';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../context/ToastContext';
import {
  LucideTag, LucidePlus, LucideSearch, LucideRefreshCw,
  LucideEdit, LucideTrash2, LucideCheckCircle, LucideXCircle,
  LucideX, LucideSave, LucideShieldAlert, LucideLayers, LucideFilter
} from 'lucide-react';
import '../../styles/components.css';
import { SearchableSelect } from '../../components/common/Select';

const ensureArray = (val) => {
  if (Array.isArray(val)) return val;
  if (val && Array.isArray(val.results)) return val.results;
  if (val && Array.isArray(val.data)) return val.data;
  if (val && val.data && Array.isArray(val.data.results)) return val.data.results;
  return [];
};

export const ExpenseSubcategoryMaster = () => {
  const { user, isAdmin, hasPermission } = useAuth();
  const { showToast } = useToast();

  const [subcategories, setSubcategories] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [editSubcategory, setEditSubcategory] = useState(null);
  const [formState, setFormState] = useState({
    category: '',
    name: '',
    code: '',
    order: 0,
    is_active: true
  });
  const [submitting, setSubmitting] = useState(false);

  const isAuthorized = isAdmin || hasPermission('expenses.manage');

  // Load Parent Categories & Subcategories
  const fetchMasterData = React.useCallback(() => {
    setLoading(true);

    const categoriesPromise = expenseService.getCategories({ all: 'true' });
    const subcatParams = { all: 'true' };
    if (selectedCategoryId !== 'ALL') {
      subcatParams.category_id = selectedCategoryId;
    }
    const subcategoriesPromise = expenseService.getSubcategories(subcatParams);

    Promise.all([categoriesPromise, subcategoriesPromise])
      .then(([catRes, subRes]) => {
        const catList = ensureArray(catRes);
        setCategories(catList);

        const subList = ensureArray(subRes);
        setSubcategories(subList);
      })
      .catch(err => {
        console.error("Error fetching subcategory master:", err);
        showToast("Failed to fetch subcategory master data", "error");
      })
      .finally(() => setLoading(false));
  }, [selectedCategoryId, showToast]);

  useEffect(() => {
    fetchMasterData();
  }, [fetchMasterData]);

  const handleOpenAddModal = () => {
    setEditSubcategory(null);
    const defaultCat = selectedCategoryId !== 'ALL' ? selectedCategoryId : (categories.length > 0 ? categories[0].id : '');
    setFormState({
      category: defaultCat,
      name: '',
      code: '',
      order: subcategories.length + 1,
      is_active: true
    });
    setShowModal(true);
  };

  const handleOpenEditModal = (sub) => {
    setEditSubcategory(sub);
    setFormState({
      category: sub.category,
      name: sub.name || '',
      code: sub.code || '',
      order: sub.order || 0,
      is_active: sub.is_active !== false
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!formState.category) {
      showToast("Please select a parent Category", "error");
      return;
    }
    if (!formState.name.trim() || !formState.code.trim()) {
      showToast("Subcategory Name and Code are required", "error");
      return;
    }

    setSubmitting(true);
    try {
      if (editSubcategory) {
        await expenseService.updateSubcategory(editSubcategory.id, formState);
        showToast("✓ Subcategory updated successfully!", "success");
      } else {
        await expenseService.createSubcategory(formState);
        showToast("✓ Subcategory created successfully!", "success");
      }
      setShowModal(false);
      fetchMasterData();
    } catch (err) {
      console.error("Subcategory save error:", err);
      showToast(err?.response?.data?.message || "Failed to save subcategory", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (sub) => {
    if (!window.confirm(`Are you sure you want to delete subcategory "${sub.name}"? This action cannot be undone.`)) {
      return;
    }

    try {
      await expenseService.deleteSubcategory(sub.id);
      showToast(`✓ Subcategory "${sub.name}" removed successfully`, "success");
      fetchMasterData();
    } catch (err) {
      console.error("Delete subcategory error:", err);
      showToast(err?.response?.data?.message || "Failed to delete subcategory", "error");
    }
  };

  const filteredSubcategories = useMemo(() => {
    if (!searchQuery.trim()) return subcategories;
    const q = searchQuery.toLowerCase();
    return subcategories.filter(s => {
      return (s.name && s.name.toLowerCase().includes(q)) ||
             (s.code && s.code.toLowerCase().includes(q)) ||
             (s.category_name && s.category_name.toLowerCase().includes(q));
    });
  }, [subcategories, searchQuery]);

  if (!isAuthorized) {
    return (
      <div className="app-card" style={{ padding: '40px', textAlign: 'center', margin: '20px auto', maxWidth: '500px' }}>
        <LucideShieldAlert size={48} color="#ef4444" style={{ margin: '0 auto 12px' }} />
        <h2 style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#111827' }}>Access Restricted</h2>
        <p style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: '6px' }}>
          Subcategory Master management is restricted strictly to Admin users.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%', boxSizing: 'border-box' }}>
      
      {/* Header Banner */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '34px', height: '34px', borderRadius: '10px', background: '#111827', color: 'var(--live)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <LucideTag size={20} />
            </div>
            <h1 style={{ fontSize: '1.4rem', fontFamily: 'inherit', fontWeight: '700', color: '#0f172a', margin: 0 }}>
              Expense Subcategory Master
            </h1>
            <span className="badge-pill badge-role-admin">
              Admin master
            </span>
          </div>
          <p style={{ fontSize: '0.82rem', color: '#64748b', marginTop: '4px', margin: 0 }}>
            Manage category-dependent subcategories, detailed operational item codes, and active line item definitions
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button
            onClick={fetchMasterData}
            style={{
              padding: '9px 16px',
              borderRadius: '10px',
              border: '1px solid #cbd5e1',
              background: '#ffffff',
              color: '#334155',
              fontWeight: '600',
              fontSize: '0.82rem',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer'
            }}
          >
            <LucideRefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh Master
          </button>

          <button
            onClick={handleOpenAddModal}
            className="btn-primary"
            style={{
              padding: '9px 18px',
              fontSize: '0.85rem',
              borderRadius: '10px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: 'none'
            }}
          >
            <LucidePlus size={18} /> + Add New Subcategory
          </button>
        </div>
      </div>

      {/* Control Bar: Parent Category Selector & Search */}
      <div className="app-card" style={{ padding: '14px 18px', background: '#ffffff', borderRadius: '14px', border: '1px solid #e2e8f0', display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', justifyContent: 'space-between' }}>
        
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', flex: 1 }}>
          
          {/* Dependent Category Dropdown Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '260px' }}>
            <LucideLayers size={16} color="#111827" />
            <label style={{ fontSize: '0.82rem', fontWeight: '700', color: '#334155' }}>Parent Category:</label>
            <SearchableSelect
              value={selectedCategoryId}
              onChange={(e) => setSelectedCategoryId(e.target.value)}
              style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '0.83rem',
                fontWeight: '600',
                color: '#0f172a',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="ALL">All Categories ({categories.length})</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.code})
                </option>
              ))}
            </SearchableSelect>
          </div>

          {/* Search Bar */}
          <div style={{ position: 'relative', minWidth: '220px', flex: 1 }}>
            <LucideSearch size={16} color="#94a3b8" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              placeholder="Search subcategory name or code..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px 8px 34px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '0.83rem',
                outline: 'none',
                background: '#f8fafc',
                boxSizing: 'border-box'
              }}
            />
          </div>

        </div>

        <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
          Showing <strong style={{ color: '#0f172a' }}>{filteredSubcategories.length}</strong> subcategories
        </div>
      </div>

      {/* Subcategory Master Data Table */}
      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ paddingLeft: '20px' }}>Sort Order</th>
              <th>Subcategory Name</th>
              <th>Subcategory Code</th>
              <th>Parent Category</th>
              <th>Status</th>
              <th style={{ textAlign: 'right', paddingRight: '20px' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredSubcategories.map(sub => (
              <tr key={sub.id}>
                <td style={{ paddingLeft: '20px', fontWeight: '700', color: '#64748b' }}>
                  #{sub.order}
                </td>

                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '30px', height: '30px', borderRadius: '8px', background: '#f5f3ff', border: '1px solid #ddd6fe', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7c3aed' }}>
                      <LucideTag size={15} />
                    </div>
                    <div style={{ fontWeight: '700', color: '#0f172a', fontSize: '0.88rem' }}>
                      {sub.name}
                    </div>
                  </div>
                </td>

                <td>
                  <code style={{ background: '#f1f5f9', padding: '3px 8px', borderRadius: '6px', fontSize: '0.82rem', fontWeight: '700', color: '#0f172a' }}>
                    {sub.code}
                  </code>
                </td>

                <td>
                  <span className="badge-pill badge-green" style={{ fontSize: '0.78rem', fontWeight: '700' }}>
                    <LucideLayers size={12} />
                    {sub.category_name || (categories.find(c => c.id === sub.category)?.name) || `Category #${sub.category}`}
                  </span>
                </td>

                <td>
                  {sub.is_active !== false ? (
                    <span className="badge-pill badge-green" style={{ fontSize: '0.75rem' }}>
                      <LucideCheckCircle size={12} /> ACTIVE
                    </span>
                  ) : (
                    <span className="badge-pill" style={{ background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca', fontSize: '0.75rem' }}>
                      <LucideXCircle size={12} /> INACTIVE
                    </span>
                  )}
                </td>

                <td style={{ textAlign: 'right', paddingRight: '20px' }}>
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    <button
                      onClick={() => handleOpenEditModal(sub)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '8px',
                        border: '1px solid #cbd5e1',
                        background: '#ffffff',
                        color: '#334155',
                        fontSize: '0.78rem',
                        fontWeight: '700',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        cursor: 'pointer'
                      }}
                    >
                      <LucideEdit size={13} /> Edit
                    </button>

                    <button
                      onClick={() => handleDelete(sub)}
                      style={{
                        padding: '6px 10px',
                        borderRadius: '8px',
                        border: '1px solid #fecaca',
                        background: '#fef2f2',
                        color: '#dc2626',
                        fontSize: '0.78rem',
                        fontWeight: '700',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        cursor: 'pointer'
                      }}
                    >
                      <LucideTrash2 size={13} /> Remove
                    </button>
                  </div>
                </td>
              </tr>
            ))}

            {filteredSubcategories.length === 0 && (
              <tr>
                <td colSpan="6" style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                  {loading ? 'Fetching master subcategories...' : 'No subcategories found for selected category filter.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Add / Edit Subcategory Modal (Dependent on Category) */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: '480px' }}>
            
            <div style={{ padding: '18px 22px', background: 'var(--bg-subtle)', color: 'var(--text-primary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <LucideTag size={20} color="var(--live)" />
                <h3 style={{ fontSize: '1.05rem', fontFamily: 'inherit', fontWeight: '700', margin: 0, color: 'var(--text-primary)' }}>
                  {editSubcategory ? 'Edit Subcategory Master' : '+ Add Dependent Subcategory'}
                </h3>
              </div>
              <button
                onClick={() => setShowModal(false)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                <LucideX size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} style={{ padding: '22px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              
              {/* Parent Category Selector (Dependent!) */}
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#334155', marginBottom: '6px' }}>
                  Parent Expense Category <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <SearchableSelect
                  value={formState.category}
                  onChange={(e) => setFormState(prev => ({ ...prev, category: e.target.value }))}
                  required
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.85rem',
                    fontWeight: '600',
                    color: '#0f172a',
                    outline: 'none',
                    background: '#ffffff'
                  }}
                >
                  <option value="">Select Parent Category...</option>
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.code})
                    </option>
                  ))}
                </SearchableSelect>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#334155', marginBottom: '6px' }}>
                  Subcategory Name <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. DIESEL_DIESEL_PURCHASE"
                  value={formState.name}
                  onChange={(e) => {
                    const val = e.target.value;
                    const autoCode = val.toUpperCase().replace(/[^A-Z0-9]/g, '_');
                    setFormState(prev => ({
                      ...prev,
                      name: val,
                      code: editSubcategory ? prev.code : autoCode
                    }));
                  }}
                  required
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.85rem',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#334155', marginBottom: '6px' }}>
                  Subcategory Code <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. DIESEL_PURCHASE"
                  value={formState.code}
                  onChange={(e) => setFormState(prev => ({ ...prev, code: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_') }))}
                  required
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.85rem',
                    outline: 'none',
                    boxSizing: 'border-box',
                    fontFamily: 'monospace',
                    fontWeight: '700'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#334155', marginBottom: '6px' }}>
                  Display Order
                </label>
                <input
                  type="number"
                  value={formState.order}
                  onChange={(e) => setFormState(prev => ({ ...prev, order: parseInt(e.target.value) || 0 }))}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.85rem',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                <input
                  type="checkbox"
                  id="subcategory_is_active"
                  checked={formState.is_active}
                  onChange={(e) => setFormState(prev => ({ ...prev, is_active: e.target.checked }))}
                  style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                />
                <label htmlFor="subcategory_is_active" style={{ fontSize: '0.85rem', fontWeight: '600', color: '#1e293b', cursor: 'pointer' }}>
                  Is Active (Visible under selected category in expense form)
                </label>
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  style={{
                    flex: 1,
                    padding: '11px',
                    borderRadius: '10px',
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    color: '#475569',
                    fontWeight: '600',
                    fontSize: '0.85rem',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="btn-primary"
                  style={{
                    flex: 1.5,
                    padding: '11px',
                    borderRadius: '10px',
                    fontSize: '0.85rem'
                  }}
                >
                  {submitting ? 'Saving...' : 'Save Subcategory Master'}
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

    </div>
  );
};

export default ExpenseSubcategoryMaster;

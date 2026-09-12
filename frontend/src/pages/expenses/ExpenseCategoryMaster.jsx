import React, { useEffect, useState, useMemo } from 'react';
import { expenseService } from '../../services/expenseService';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../context/ToastContext';
import {
  LucideLayers, LucidePlus, LucideSearch, LucideRefreshCw,
  LucideEdit, LucideTrash2, LucideCheckCircle, LucideXCircle,
  LucideX, LucideSave, LucideShieldAlert, LucideTag, LucideDollarSign,
  LucideFileCheck
} from 'lucide-react';
import '../../styles/components.css';

const ensureArray = (val) => {
  if (Array.isArray(val)) return val;
  if (val && Array.isArray(val.results)) return val.results;
  if (val && Array.isArray(val.data)) return val.data;
  if (val && val.data && Array.isArray(val.data.results)) return val.data.results;
  return [];
};

export const ExpenseCategoryMaster = () => {
  const { user, isAdmin, hasPermission } = useAuth();
  const { showToast } = useToast();

  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [paymentTypeFilter, setPaymentTypeFilter] = useState('ALL');

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [editCategory, setEditCategory] = useState(null);
  const [formState, setFormState] = useState({
    name: '',
    code: '',
    payment_type: 'FIXED_MONTHLY',
    uom: '',
    default_quantity: '',
    default_rate: '',
    requires_proof: false,
    order: 0,
    is_active: true
  });
  const [submitting, setSubmitting] = useState(false);

  const isAuthorized = isAdmin || hasPermission('expenses.manage');

  const fetchCategories = React.useCallback(() => {
    setLoading(true);
    expenseService.getCategories({ all: 'true' })
      .then(res => {
        const list = ensureArray(res);
        setCategories(list);
      })
      .catch(err => {
        console.error("Error fetching categories master:", err);
        showToast("Failed to fetch expense categories", "error");
      })
      .finally(() => setLoading(false));
  }, [showToast]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  const handleOpenAddModal = () => {
    setEditCategory(null);
    setFormState({
      name: '',
      code: '',
      payment_type: 'FIXED_MONTHLY',
      uom: '',
      default_quantity: '',
      default_rate: '',
      requires_proof: false,
      order: categories.length + 1,
      is_active: true
    });
    setShowModal(true);
  };

  const handleOpenEditModal = (cat) => {
    setEditCategory(cat);
    setFormState({
      name: cat.name || '',
      code: cat.code || '',
      payment_type: cat.payment_type || 'FIXED_MONTHLY',
      uom: cat.uom || '',
      default_quantity: cat.default_quantity !== null && cat.default_quantity !== undefined ? cat.default_quantity : '',
      default_rate: cat.default_rate !== null && cat.default_rate !== undefined ? cat.default_rate : '',
      requires_proof: Boolean(cat.requires_proof),
      order: cat.order || 0,
      is_active: cat.is_active !== false
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!formState.name.trim() || !formState.code.trim()) {
      showToast("Category Name and Code are required", "error");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        name: formState.name,
        code: formState.code,
        payment_type: formState.payment_type,
        uom: formState.uom.trim() || null,
        default_quantity: formState.default_quantity !== '' ? parseFloat(formState.default_quantity) : null,
        default_rate: formState.default_rate !== '' ? parseFloat(formState.default_rate) : null,
        requires_proof: Boolean(formState.requires_proof),
        order: parseInt(formState.order) || 0,
        is_active: Boolean(formState.is_active)
      };

      if (editCategory) {
        await expenseService.updateCategory(editCategory.id, payload);
        showToast("✓ Expense Master updated successfully!", "success");
      } else {
        await expenseService.createCategory(payload);
        showToast("✓ Expense Master created successfully!", "success");
      }
      setShowModal(false);
      fetchCategories();
    } catch (err) {
      console.error("Category save error:", err);
      showToast(err?.response?.data?.message || "Failed to save category", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (cat) => {
    if (!window.confirm(`Are you sure you want to delete category "${cat.name}"? This action cannot be undone.`)) {
      return;
    }

    try {
      await expenseService.deleteCategory(cat.id);
      showToast(`✓ Category "${cat.name}" removed successfully`, "success");
      fetchCategories();
    } catch (err) {
      console.error("Delete category error:", err);
      const errMsg = err?.response?.data?.message || err?.response?.data?.detail || err?.message || "Failed to delete category";
      showToast(typeof errMsg === 'string' ? errMsg : JSON.stringify(errMsg), "error");
    }
  };

  const filteredCategories = useMemo(() => {
    return categories.filter(c => {
      if (statusFilter === 'ACTIVE' && !c.is_active) return false;
      if (statusFilter === 'INACTIVE' && c.is_active) return false;
      if (paymentTypeFilter !== 'ALL' && c.payment_type !== paymentTypeFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (c.name && c.name.toLowerCase().includes(q)) || (c.code && c.code.toLowerCase().includes(q));
      }
      return true;
    });
  }, [categories, searchQuery, statusFilter, paymentTypeFilter]);

  const activeCount = useMemo(() => categories.filter(c => c.is_active).length, [categories]);
  
  // Total Defined Fixed Monthly Cost (Excludes items with missing/undefined monthly_cost)
  const totalDefinedMonthlyCost = useMemo(() => {
    return categories.reduce((acc, c) => {
      if (c.payment_type === 'FIXED_MONTHLY' && c.monthly_cost !== null && c.monthly_cost !== undefined) {
        return acc + Number(c.monthly_cost);
      }
      return acc;
    }, 0);
  }, [categories]);

  if (!isAuthorized) {
    return (
      <div className="app-card" style={{ padding: '40px', textAlign: 'center', margin: '20px auto', maxWidth: '500px' }}>
        <LucideShieldAlert size={48} color="#ef4444" style={{ margin: '0 auto 12px' }} />
        <h2 style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#111827' }}>Access Restricted</h2>
        <p style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: '6px' }}>
          Expense Category Master management is restricted strictly to Admin users.
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
            <div style={{ width: '34px', height: '34px', borderRadius: '10px', background: '#0a2d23', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <LucideLayers size={20} />
            </div>
            <h1 style={{ fontSize: '1.4rem', fontFamily: 'Outfit, sans-serif', fontWeight: '700', color: '#0f172a', margin: 0 }}>
              Expense Master & Predefined Config
            </h1>
            <span className="badge-pill badge-green" style={{ fontSize: '0.72rem', fontWeight: '700' }}>
              Admin Master Control
            </span>
          </div>
          <p style={{ fontSize: '0.82rem', color: '#64748b', marginTop: '4px', margin: 0 }}>
            Manage predefined monthly expenses, rate calculations, proof requirements & payment classifications
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button
            onClick={fetchCategories}
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
              boxShadow: '0 2px 8px rgba(10,45,35,0.25)'
            }}
          >
            <LucidePlus size={18} /> + Add Expense Master
          </button>
        </div>
      </div>

      {/* KPI Metric Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
        <div className="app-card" style={{ padding: '16px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Total Master Records</div>
          <div style={{ fontSize: '1.4rem', fontWeight: '800', color: '#0f172a', marginTop: '2px' }}>{categories.length}</div>
          <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Master expense definitions</div>
        </div>

        <div className="app-card" style={{ padding: '16px', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '14px' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: '700', color: '#166534', textTransform: 'uppercase' }}>Active Masters</div>
          <div style={{ fontSize: '1.4rem', fontWeight: '800', color: '#047857', marginTop: '2px' }}>{activeCount}</div>
          <div style={{ fontSize: '0.72rem', color: '#15803d' }}>Available for transactions</div>
        </div>

        <div className="app-card" style={{ padding: '16px', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '14px' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: '700', color: '#0369a1', textTransform: 'uppercase' }}>Defined Fixed Monthly Total</div>
          <div style={{ fontSize: '1.4rem', fontWeight: '800', color: '#0284c7', marginTop: '2px' }}>
            ₹{totalDefinedMonthlyCost.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / mo
          </div>
          <div style={{ fontSize: '0.72rem', color: '#0284c7' }}>Predefined monthly fixed budget</div>
        </div>
      </div>

      {/* Control Bar: Search & Status Filter */}
      <div className="app-card" style={{ padding: '14px 18px', background: '#ffffff', borderRadius: '14px', border: '1px solid #e2e8f0', display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', justifyContent: 'space-between' }}>
        
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', flex: 1 }}>
          <div style={{ position: 'relative', minWidth: '240px', flex: 1 }}>
            <LucideSearch size={16} color="#94a3b8" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              placeholder="Search expense master name or code..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '9px 12px 9px 34px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '0.85rem',
                outline: 'none',
                background: '#f8fafc',
                boxSizing: 'border-box'
              }}
            />
          </div>

          <select
            value={paymentTypeFilter}
            onChange={(e) => setPaymentTypeFilter(e.target.value)}
            style={{
              padding: '9px 14px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              fontSize: '0.85rem',
              fontWeight: '600',
              color: '#0f172a',
              outline: 'none',
              cursor: 'pointer'
            }}
          >
            <option value="ALL">All Payment Types</option>
            <option value="FIXED_MONTHLY">Fixed Monthly</option>
            <option value="ACTUAL_WITH_PROOF">Actuals / As per Proof</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{
              padding: '9px 14px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              fontSize: '0.85rem',
              fontWeight: '600',
              color: '#0f172a',
              outline: 'none',
              cursor: 'pointer'
            }}
          >
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">Active Only</option>
            <option value="INACTIVE">Inactive Only</option>
          </select>
        </div>

        <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
          Showing <strong style={{ color: '#0f172a' }}>{filteredCategories.length}</strong> master items
        </div>

      </div>

      {/* Category Master Table */}
      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ paddingLeft: '20px' }}>Sort Order</th>
              <th>Expense Name & Code</th>
              <th>Payment Type</th>
              <th>UoM</th>
              <th>Qty</th>
              <th>Rate</th>
              <th>Monthly Cost</th>
              <th>Proof Required</th>
              <th>Status</th>
              <th style={{ textAlign: 'right', paddingRight: '20px' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredCategories.map(cat => {
              const hasDefinedMonthly = cat.monthly_cost !== null && cat.monthly_cost !== undefined;
              return (
                <tr key={cat.id}>
                  <td style={{ paddingLeft: '20px', fontWeight: '700', color: '#64748b' }}>
                    #{cat.order}
                  </td>

                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#f0fdf4', border: '1px solid #bbf7d0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#16a34a' }}>
                        <LucideLayers size={16} />
                      </div>
                      <div>
                        <div style={{ fontWeight: '700', color: '#0f172a', fontSize: '0.88rem' }}>
                          {cat.name}
                        </div>
                        <code style={{ fontSize: '0.72rem', color: '#64748b', fontFamily: 'monospace' }}>
                          {cat.code}
                        </code>
                      </div>
                    </div>
                  </td>

                  <td>
                    {cat.payment_type === 'ACTUAL_WITH_PROOF' ? (
                      <span className="badge-pill badge-purple" style={{ fontSize: '0.72rem' }}>
                        Actuals / As per Proof
                      </span>
                    ) : (
                      <span className="badge-pill badge-blue" style={{ fontSize: '0.72rem' }}>
                        Fixed Monthly
                      </span>
                    )}
                  </td>

                  <td>
                    <span style={{ fontSize: '0.82rem', fontWeight: '600', color: '#334155' }}>
                      {cat.uom || '—'}
                    </span>
                  </td>

                  <td>
                    <span style={{ fontSize: '0.82rem', fontWeight: '600', color: '#334155' }}>
                      {cat.default_quantity !== null && cat.default_quantity !== undefined ? Number(cat.default_quantity) : '—'}
                    </span>
                  </td>

                  <td>
                    <span style={{ fontSize: '0.82rem', fontWeight: '600', color: '#334155' }}>
                      {cat.default_rate !== null && cat.default_rate !== undefined ? `₹${Number(cat.default_rate).toLocaleString('en-IN')}` : '—'}
                    </span>
                  </td>

                  <td>
                    <span style={{ fontSize: '0.88rem', fontWeight: '800', color: hasDefinedMonthly ? '#047857' : '#94a3b8' }}>
                      {hasDefinedMonthly ? `₹${Number(cat.monthly_cost).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'}
                    </span>
                  </td>

                  <td>
                    {cat.requires_proof ? (
                      <span className="badge-pill badge-amber" style={{ fontSize: '0.72rem' }}>
                        <LucideFileCheck size={12} /> YES
                      </span>
                    ) : (
                      <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>NO</span>
                    )}
                  </td>

                  <td>
                    {cat.is_active !== false ? (
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
                        onClick={() => handleOpenEditModal(cat)}
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
                        onClick={() => handleDelete(cat)}
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
              );
            })}

            {filteredCategories.length === 0 && (
              <tr>
                <td colSpan="10" style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                  {loading ? 'Fetching master expense definitions...' : 'No expense categories found.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Add / Edit Category Modal */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: '560px' }}>
            
            <div style={{ padding: '18px 22px', background: '#0a2d23', color: '#ffffff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <LucideLayers size={20} color="#10b981" />
                <h3 style={{ fontSize: '1.05rem', fontFamily: 'Outfit, sans-serif', fontWeight: '700', margin: 0, color: '#ffffff' }}>
                  {editCategory ? 'Edit Expense Master' : '+ Add New Expense Master'}
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
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#334155', marginBottom: '6px' }}>
                    Expense Name <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Water Charges"
                    value={formState.name}
                    onChange={(e) => {
                      const val = e.target.value;
                      const autoCode = val.toUpperCase().replace(/[^A-Z0-9]/g, '_');
                      setFormState(prev => ({
                        ...prev,
                        name: val,
                        code: editCategory ? prev.code : autoCode
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
                    Expense Code <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. HDD_WATER_CHARGES"
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
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#334155', marginBottom: '6px' }}>
                    Payment Type <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <select
                    value={formState.payment_type}
                    onChange={(e) => setFormState(prev => ({ ...prev, payment_type: e.target.value }))}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '10px',
                      border: '1px solid #cbd5e1',
                      fontSize: '0.85rem',
                      fontWeight: '600',
                      outline: 'none'
                    }}
                  >
                    <option value="FIXED_MONTHLY">Fixed Monthly</option>
                    <option value="ACTUAL_WITH_PROOF">Actuals / As per Proof</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#334155', marginBottom: '6px' }}>
                    Unit of Measurement (UoM)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Lumpsum, Per Shot, Monthly, 8 Km"
                    value={formState.uom}
                    onChange={(e) => setFormState(prev => ({ ...prev, uom: e.target.value }))}
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
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#334155', marginBottom: '6px' }}>
                    Default Quantity
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Leave blank if undefined"
                    value={formState.default_quantity}
                    onChange={(e) => setFormState(prev => ({ ...prev, default_quantity: e.target.value }))}
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
                    Default Rate (₹)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Leave blank if undefined"
                    value={formState.default_rate}
                    onChange={(e) => setFormState(prev => ({ ...prev, default_rate: e.target.value }))}
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
              </div>

              {/* Calculated Monthly Cost Preview */}
              {formState.default_quantity !== '' && formState.default_rate !== '' && !isNaN(formState.default_quantity) && !isNaN(formState.default_rate) ? (
                <div style={{ background: '#f0fdf4', padding: '10px 14px', borderRadius: '10px', border: '1px solid #bbf7d0', fontSize: '0.83rem', fontWeight: '700', color: '#166534' }}>
                  💡 Calculated Monthly Cost: ₹{(Number(formState.default_quantity) * Number(formState.default_rate)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </div>
              ) : (
                <div style={{ background: '#f8fafc', padding: '10px 14px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '0.78rem', color: '#64748b' }}>
                  ℹ️ Monthly cost will remain undefined (-) because quantity or rate is missing.
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '4px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="checkbox"
                    id="requires_proof"
                    checked={formState.requires_proof}
                    onChange={(e) => setFormState(prev => ({ ...prev, requires_proof: e.target.checked }))}
                    style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                  />
                  <label htmlFor="requires_proof" style={{ fontSize: '0.83rem', fontWeight: '600', color: '#1e293b', cursor: 'pointer' }}>
                    Requires Bill / Receipt Proof
                  </label>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="checkbox"
                    id="category_is_active"
                    checked={formState.is_active}
                    onChange={(e) => setFormState(prev => ({ ...prev, is_active: e.target.checked }))}
                    style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                  />
                  <label htmlFor="category_is_active" style={{ fontSize: '0.83rem', fontWeight: '600', color: '#1e293b', cursor: 'pointer' }}>
                    Is Active (Visible in forms)
                  </label>
                </div>
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
                  {submitting ? 'Saving...' : 'Save Master Definition'}
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

    </div>
  );
};

export default ExpenseCategoryMaster;

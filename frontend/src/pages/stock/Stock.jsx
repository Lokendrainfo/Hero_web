import React, { useEffect, useState } from 'react';
import { stockService } from '../../services/stockService';
import { vendorService } from '../../services/vendorService';
import { useAuth } from '../../hooks/useAuth';
import {
  LucidePackage,
  LucideSearch,
  LucideRefreshCw,
  LucideLayers,
  LucideCheckCircle,
  LucideBuilding2,
  LucideMapPin,
  LucideFileText,
  LucideFilter,
  LucideShieldCheck
} from 'lucide-react';
import '../../styles/screens.css';
import { SearchableSelect } from '../../components/common/Select';

export const Stock = () => {
  const { user, isAdmin, vendors } = useAuth();
  const [activeTab, setActiveTab] = useState('drum_items'); // 'drum_items', 'circle_summary', 'issues'
  const [search, setSearch] = useState('');
  const [selectedVendor, setSelectedVendor] = useState('all');
  const [selectedCircle, setSelectedCircle] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all', 'ISSUED', 'RESERVED'

  const [issueItems, setIssueItems] = useState([]);
  const [issues, setIssues] = useState([]);
  const [vendorList, setVendorList] = useState([]);
  const [loading, setLoading] = useState(true);

  // Fetch Vendor options for Admin filter dropdown
  useEffect(() => {
    if (isAdmin) {
      vendorService.getVendors({ page: 0, size: 50 })
        .then(res => {
          const list = res.data?.data?.results || res.data?.results || res.data?.data || res.data?.content || res.data || [];
          setVendorList(Array.isArray(list) ? list : []);
        })
        .catch(err => console.error("Error fetching vendors for stock filter:", err));
    }
  }, [isAdmin]);

  const fetchStockData = () => {
    setLoading(true);
    const params = {};
    if (selectedVendor && selectedVendor !== 'all') {
      params.vendor_id = selectedVendor;
    }

    Promise.all([
      stockService.searchIssueItems({}, params),
      stockService.searchIssues({}, params)
    ])
      .then(([itemsRes, issuesRes]) => {
        const itemList = itemsRes.data?.data?.content || itemsRes.data?.content || [];
        const issueList = issuesRes.data?.data?.content || issuesRes.data?.content || [];
        setIssueItems(Array.isArray(itemList) ? itemList : []);
        setIssues(Array.isArray(issueList) ? issueList : []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchStockData();
  }, [selectedVendor]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchStockData();
  };

  // Filter issue items based on local search, circle, and status
  const filteredItems = issueItems.filter(it => {
    if (selectedCircle !== 'all' && it.fromWarehouseCode !== selectedCircle) return false;
    if (statusFilter !== 'all' && it.itemStatus !== statusFilter) return false;
    if (!search.trim()) return true;
    
    const q = search.toLowerCase();
    return (
      (it.serialNo && it.serialNo.toLowerCase().includes(q)) ||
      (it.issueNumber && it.issueNumber.toLowerCase().includes(q)) ||
      (it.materialDescription && it.materialDescription.toLowerCase().includes(q)) ||
      (it.issueeName && it.issueeName.toLowerCase().includes(q)) ||
      (it.fromWarehouseCode && it.fromWarehouseCode.toLowerCase().includes(q))
    );
  });

  // Calculate Circle-wise stock summary metrics
  const circlesMap = {};
  issueItems.forEach(it => {
    const code = it.fromWarehouseCode || 'UNASSIGNED-CIRCLE';
    const name = it.fromWarehouseName || 'Circle Warehouse';
    if (!circlesMap[code]) {
      circlesMap[code] = {
        code,
        name,
        totalQuantity: 0,
        totalDrums: 0,
        totalReservedQty: 0,
        vendorsSet: new Set(),
        itemsList: []
      };
    }
    circlesMap[code].totalQuantity += (Number(it.unitCount || it.quantity) || 0);
    circlesMap[code].totalDrums += 1;
    circlesMap[code].totalReservedQty += (Number(it.reservedQuantity) || 0);
    if (it.issueeName) circlesMap[code].vendorsSet.add(it.issueeName);
    circlesMap[code].itemsList.push(it);
  });
  const circleSummaries = Object.values(circlesMap);

  // Overall totals
  const totalMeters = filteredItems.reduce((sum, it) => sum + (Number(it.unitCount || it.quantity) || 0), 0);
  const totalReservedMeters = filteredItems.reduce((sum, it) => sum + (Number(it.reservedQuantity) || 0), 0);
  const totalDrums = filteredItems.length;

  const activeVendorName = vendors && vendors.length > 0 ? (vendors[0].name || vendors[0].partnerName) : 'Your Vendor Account';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%', boxSizing: 'border-box' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: '1.4rem', fontFamily: 'inherit', fontWeight: '700', color: '#111827' }}>
              Stock & Inventory Management
            </h1>
            {isAdmin ? (
              <span className="badge-pill badge-role-admin">
                Admin master view
              </span>
            ) : (
              <span className="badge-pill badge-role-vendor">
                {activeVendorName}
              </span>
            )}
          </div>
          <p style={{ fontSize: '0.8rem', color: '#6b7280' }}>
            {isAdmin
              ? 'Circle-wise stock allocation, drum serial tracking, and vendor stock issues'
              : `Stock items, drum inventory, and materials issued to ${activeVendorName}`
            }
          </p>
        </div>

        <button onClick={fetchStockData} className="app-card" style={{ padding: '8px 14px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', cursor: 'pointer', fontWeight: '600' }}>
          <LucideRefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh Inventory
        </button>
      </div>

      {/* KPI Overview Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
        <div className="app-card" style={{ padding: '14px 18px', borderLeft: '4px solid #111827' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Total Issued Material</div>
          <div style={{ fontSize: '1.3rem', fontWeight: '800', color: '#111827', marginTop: '4px' }}>
            {totalMeters.toLocaleString('en-IN')} <span style={{ fontSize: '0.8rem', color: '#111827', fontWeight: '600' }}>Meters</span>
          </div>
          <div style={{ fontSize: '0.72rem', color: '#059669', marginTop: '4px' }}>● PLB HDPE Telecom Duct (40/33mm)</div>
        </div>

        <div className="app-card" style={{ padding: '14px 18px', borderLeft: '4px solid #0284c7' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Drums Inventory</div>
          <div style={{ fontSize: '1.3rem', fontWeight: '800', color: '#111827', marginTop: '4px' }}>
            {totalDrums} <span style={{ fontSize: '0.8rem', color: '#0284c7', fontWeight: '600' }}>Drums</span>
          </div>
          <div style={{ fontSize: '0.72rem', color: '#0284c7', marginTop: '4px' }}>● Serialized Drums Logged</div>
        </div>

        <div className="app-card" style={{ padding: '14px 18px', borderLeft: '4px solid #d97706' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Reserved Quantity</div>
          <div style={{ fontSize: '1.3rem', fontWeight: '800', color: '#111827', marginTop: '4px' }}>
            {totalReservedMeters.toLocaleString('en-IN')} <span style={{ fontSize: '0.8rem', color: '#d97706', fontWeight: '600' }}>Meters</span>
          </div>
          <div style={{ fontSize: '0.72rem', color: '#d97706', marginTop: '4px' }}>● Reserved for Trenching & Ducting</div>
        </div>

        {isAdmin && (
          <div className="app-card" style={{ padding: '14px 18px', borderLeft: '4px solid #7c3aed' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Active Circles</div>
            <div style={{ fontSize: '1.3rem', fontWeight: '800', color: '#111827', marginTop: '4px' }}>
              {circleSummaries.length} <span style={{ fontSize: '0.8rem', color: '#7c3aed', fontWeight: '600' }}>Circles</span>
            </div>
            <div style={{ fontSize: '0.72rem', color: '#7c3aed', marginTop: '4px' }}>● RAJ-WH-CIR-0001 Warehouses</div>
          </div>
        )}
      </div>

      {/* Circle Summary Cards Section for Admin */}
      {isAdmin && (
        <div style={{ marginTop: '4px' }}>
          <div style={{ fontSize: '0.92rem', fontWeight: '700', color: '#111827', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <LucideMapPin size={18} color="#111827" />
            Circle-Wise Stock Summary (Admin View)
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
            {circleSummaries.map(c => (
              <div key={c.code} className="app-card" style={{ padding: '16px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <span className="badge-pill badge-neutral">
                      {c.code}
                    </span>
                    <div style={{ fontSize: '1.05rem', fontWeight: '700', color: '#111827', marginTop: '6px' }}>
                      {c.name}
                    </div>
                  </div>
                  <LucidePackage size={22} color="#111827" />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '14px', background: '#ffffff', padding: '10px', borderRadius: '8px', border: '1px solid #f3f4f6' }}>
                  <div>
                    <div style={{ fontSize: '0.7rem', color: '#6b7280' }}>Total Material</div>
                    <div style={{ fontSize: '0.95rem', fontWeight: '700', color: '#111827' }}>{c.totalQuantity.toLocaleString('en-IN')} M</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.7rem', color: '#6b7280' }}>Drums Count</div>
                    <div style={{ fontSize: '0.95rem', fontWeight: '700', color: '#0284c7' }}>{c.totalDrums} Drums</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.7rem', color: '#6b7280' }}>Reserved Qty</div>
                    <div style={{ fontSize: '0.95rem', fontWeight: '700', color: '#d97706' }}>{c.totalReservedQty.toLocaleString('en-IN')} M</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.7rem', color: '#6b7280' }}>Vendors Issued</div>
                    <div style={{ fontSize: '0.95rem', fontWeight: '700', color: '#059669' }}>{c.vendorsSet.size} Vendors</div>
                  </div>
                </div>

                {c.vendorsSet.size > 0 && (
                  <div style={{ marginTop: '10px', fontSize: '0.74rem', color: '#4b5563' }}>
                    <strong>Vendors:</strong> {Array.from(c.vendorsSet).join(', ')}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabs & Filter Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', borderBottom: '1px solid #e5e7eb', paddingBottom: '10px' }}>
        {/* Navigation Tabs */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setActiveTab('drum_items')}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              fontSize: '0.85rem',
              fontWeight: activeTab === 'drum_items' ? '700' : '500',
              background: activeTab === 'drum_items' ? '#111827' : '#ffffff',
              color: activeTab === 'drum_items' ? '#ffffff' : '#4b5563',
              border: '1px solid #d1d5db',
              cursor: 'pointer'
            }}
          >
            🛢️ Stock Drums & Items ({filteredItems.length})
          </button>

          <button
            onClick={() => setActiveTab('issues')}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              fontSize: '0.85rem',
              fontWeight: activeTab === 'issues' ? '700' : '500',
              background: activeTab === 'issues' ? '#111827' : '#ffffff',
              color: activeTab === 'issues' ? '#ffffff' : '#4b5563',
              border: '1px solid #d1d5db',
              cursor: 'pointer'
            }}
          >
            📋 Stock Issue Logs ({issues.length})
          </button>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Status Filter */}
          <SearchableSelect
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{
              padding: '6px 12px',
              borderRadius: '8px',
              border: '1px solid #d1d5db',
              background: '#ffffff',
              fontSize: '0.82rem',
              fontWeight: '600',
              color: '#374151',
              outline: 'none',
              cursor: 'pointer'
            }}
          >
            <option value="all">⚡ All Item Statuses</option>
            <option value="ISSUED">✅ ISSUED Only</option>
            <option value="RESERVED">🔒 RESERVED Only</option>
          </SearchableSelect>

          {/* Admin Circle Filter Dropdown */}
          {isAdmin && (
            <SearchableSelect
              value={selectedCircle}
              onChange={(e) => setSelectedCircle(e.target.value)}
              style={{
                padding: '6px 12px',
                borderRadius: '8px',
                border: '1px solid #d1d5db',
                background: '#ffffff',
                fontSize: '0.82rem',
                fontWeight: '600',
                color: '#374151',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="all">📍 All Circles</option>
              {circleSummaries.map(c => (
                <option key={c.code} value={c.code}>
                  {c.code} ({c.name})
                </option>
              ))}
            </SearchableSelect>
          )}

          {/* Admin Vendor Filter Dropdown */}
          {isAdmin && (
            <SearchableSelect
              value={selectedVendor}
              onChange={(e) => setSelectedVendor(e.target.value)}
              style={{
                padding: '6px 12px',
                borderRadius: '8px',
                border: '1px solid #d1d5db',
                background: '#ffffff',
                fontSize: '0.82rem',
                fontWeight: '600',
                color: '#374151',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="all">🏢 All Vendors</option>
              {vendorList.map(v => (
                <option key={v.id || v.external_vendor_id} value={v.id || v.external_vendor_id}>
                  {v.partnerName || v.name}
                </option>
              ))}
            </SearchableSelect>
          )}
        </div>
      </div>

      {/* Search Bar */}
      <form onSubmit={handleSearchSubmit} style={{ position: 'relative', width: '100%' }}>
        <input
          type="text"
          placeholder="Search by drum serial no (DRUM1010365), issue # (ISS-0026), material description, or warehouse..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: '100%',
            padding: '11px 14px 11px 40px',
            borderRadius: '10px',
            border: '1px solid #d1d5db',
            background: '#ffffff',
            fontSize: '0.88rem',
            outline: 'none',
            boxSizing: 'border-box'
          }}
        />
        <LucideSearch size={18} color="#9ca3af" style={{ position: 'absolute', left: '14px', top: '12px' }} />
      </form>

      {/* Stock Drums & Items Tab Table */}
      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280', fontSize: '0.9rem' }}>
          Fetching live inventory and drum items...
        </div>
      ) : activeTab === 'drum_items' ? (
        filteredItems.length === 0 ? (
          <div className="app-card" style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>
            <LucidePackage size={32} style={{ margin: '0 auto 8px', color: '#9ca3af' }} />
            <div style={{ fontSize: '0.95rem', fontWeight: '600' }}>No drum stock items found</div>
            <div style={{ fontSize: '0.8rem', color: '#9ca3af' }}>Try clearing filters or search query.</div>
          </div>
        ) : (
          <div className="table-container app-card" style={{ padding: 0, overflowX: 'auto' }}>
            <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ background: '#f9fafb', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>
                  <th style={{ padding: '12px 16px' }}>Drum Serial No</th>
                  <th style={{ padding: '12px 16px' }}>Issue Number</th>
                  <th style={{ padding: '12px 16px' }}>Material Description</th>
                  <th style={{ padding: '12px 16px' }}>Issued Qty (Meters)</th>
                  <th style={{ padding: '12px 16px' }}>Item Status</th>
                  <th style={{ padding: '12px 16px' }}>Reserved Qty</th>
                  <th style={{ padding: '12px 16px' }}>Warehouse Code</th>
                  <th style={{ padding: '12px 16px' }}>Issued Vendor</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((it, idx) => (
                  <tr key={it.id || idx} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontWeight: '700', color: '#0369a1' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <LucidePackage size={14} color="#0369a1" />
                        {it.serialNo || 'DRUM-N/A'}
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px', fontWeight: '700', color: '#111827' }}>
                      {it.issueNumber || 'ISS-N/A'}
                    </td>
                    <td style={{ padding: '12px 16px', fontWeight: '600', color: '#374151' }}>
                      {it.materialDescription}
                    </td>
                    <td style={{ padding: '12px 16px', fontWeight: '700', color: '#111827' }}>
                      {(Number(it.unitCount || it.quantity) || 0).toLocaleString('en-IN')} {it.unitOfMeasurement || 'METER'}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span className={`badge-pill ${it.itemStatus === 'RESERVED' ? 'badge-amber' : 'badge-running'}`}>
                        {it.itemStatus || 'ISSUED'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', color: it.reservedQuantity ? '#d97706' : '#9ca3af', fontWeight: it.reservedQuantity ? '700' : 'normal' }}>
                      {it.reservedQuantity ? `${it.reservedQuantity} M` : '-'}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span className="badge-pill badge-neutral">
                        {it.fromWarehouseCode || '—'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', fontWeight: '600', color: '#111827' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <LucideBuilding2 size={13} color="#6b7280" />
                        {it.issueeName || 'Gurukripa Enterprises'}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : (
        /* Stock Issues Log Tab */
        <div className="table-container app-card" style={{ padding: 0, overflowX: 'auto' }}>
          <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ background: '#f9fafb', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>
                <th style={{ padding: '12px 16px' }}>Issue ID / Number</th>
                <th style={{ padding: '12px 16px' }}>From Warehouse</th>
                <th style={{ padding: '12px 16px' }}>Issued To (Vendor)</th>
                <th style={{ padding: '12px 16px' }}>Items Count</th>
                <th style={{ padding: '12px 16px' }}>Issue Date</th>
                <th style={{ padding: '12px 16px' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {issues.map(iss => (
                <tr key={iss.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontWeight: '700', color: '#0369a1' }}>
                    {iss.issueNumber || iss.id}
                  </td>
                  <td style={{ padding: '12px 16px', fontWeight: '600', color: '#111827' }}>
                    {iss.fromWarehouseName || iss.fromWarehouseCode}
                  </td>
                  <td style={{ padding: '12px 16px', fontWeight: '600', color: '#374151' }}>
                    {iss.issueeName}
                  </td>
                  <td style={{ padding: '12px 16px', fontWeight: '700', color: '#111827' }}>
                    {Array.isArray(iss.items) ? iss.items.length : 0} items
                  </td>
                  <td style={{ padding: '12px 16px', color: '#6b7280' }}>
                    {iss.issuedAt ? new Date(iss.issuedAt).toLocaleDateString() : 'Recent'}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <span className="badge-pill badge-running">• {iss.status || 'ISSUED'}</span>
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

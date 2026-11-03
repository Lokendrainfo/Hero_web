import React, { useEffect, useState, useMemo } from 'react';
import { stockService } from '../../services/stockService';
import { vendorService } from '../../services/vendorService';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../context/ToastContext';
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
  LucideShieldCheck,
  LucideFileSpreadsheet,
  LucideDownload,
  LucideWarehouse,
  LucideCheckCircle2,
  LucideBoxes,
  LucideBarChart3
} from 'lucide-react';
import '../../styles/screens.css';
import { SearchableSelect } from '../../components/common/Select';

export const Stock = () => {
  const { user, isAdmin, vendors } = useAuth();
  const toastCtx = useToast();
  const showToast = toastCtx?.showToast || console.log;

  // Active view tab: 'summary', 'available', 'drum_items', 'issues', 'circle_summary'
  const [activeTab, setActiveTab] = useState('summary');
  const [search, setSearch] = useState('');
  const [selectedVendor, setSelectedVendor] = useState('all');
  const [selectedCircle, setSelectedCircle] = useState('all');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all', 'AVAILABLE', 'ISSUED', 'RESERVED'

  // Data states
  const [issueItems, setIssueItems] = useState([]);
  const [issues, setIssues] = useState([]);
  const [balances, setBalances] = useState([]);
  const [vendorList, setVendorList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

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
      stockService.searchIssues({}, params),
      stockService.searchBalance({}, params)
    ])
      .then(([itemsRes, issuesRes, balRes]) => {
        const itemList = itemsRes.data?.data?.content || itemsRes.data?.content || [];
        const issueList = issuesRes.data?.data?.content || issuesRes.data?.content || [];
        const balList = balRes.data?.data?.content || balRes.data?.content || [];
        setIssueItems(Array.isArray(itemList) ? itemList : []);
        setIssues(Array.isArray(issueList) ? issueList : []);
        setBalances(Array.isArray(balList) ? balList : []);
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

  // Export Complete 6-Sheet Excel Report
  const handleExportExcel = async () => {
    setExporting(true);
    try {
      const params = {};
      if (selectedVendor && selectedVendor !== 'all') {
        params.vendor_id = selectedVendor;
      }
      if (selectedCircle && selectedCircle !== 'all') {
        params.circle = selectedCircle;
      }

      const res = await stockService.exportCompleteStockExcel(params);
      const blob = res instanceof Blob ? res : new Blob([res], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const dateStr = new Date().toISOString().slice(0, 10);
      const vendorTag = selectedVendor && selectedVendor !== 'all' ? `_Vendor_${selectedVendor}` : '';
      link.setAttribute('download', `Hero_Complete_Stock_Inventory_Export${vendorTag}_${dateStr}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      showToast("✓ Complete 6-sheet Stock & Inventory Excel exported successfully!", "success");
    } catch (err) {
      console.error("Export Excel error:", err);
      showToast("Failed to export Stock Excel: " + (err.message || "Network error"), "error");
    } finally {
      setExporting(false);
    }
  };

  // Helper to resolve circle name from warehouse code / name
  const resolveCircle = (code = '', name = '') => {
    const c = String(code || '').toUpperCase();
    if (c.startsWith('ASS')) return 'Assam';
    if (c.startsWith('HAR')) return 'Haryana';
    if (c.startsWith('RAJ')) return 'Rajasthan';
    if (c.startsWith('PUN')) return 'Punjab';
    if (c.startsWith('DEL')) return 'Delhi';
    const n = String(name || '').toLowerCase();
    if (n.includes('assam') || n.includes('guwahati')) return 'Assam';
    if (n.includes('haryana') || n.includes('ambala')) return 'Haryana';
    if (n.includes('rajasthan') || n.includes('bagru')) return 'Rajasthan';
    return c.split('-')[0] || 'Central';
  };

  // Categorize materials cleanly
  const inferCategory = (desc = '', mid = '') => {
    const d = (desc + ' ' + mid).toLowerCase();
    if (d.includes('duct') || d.includes('plb')) return 'PLB-Duct';
    if (d.includes('ofc') || d.includes('fiber') || d.includes('armoured') || d.includes('cable')) return 'Optical Fiber Cable (OFC)';
    if (d.includes('jc') || d.includes('closure')) return 'Joint Closures & Splicing';
    if (d.includes('fdms')) return 'FDMS Systems';
    if (d.includes('plug') || d.includes('simplex')) return 'Duct Accessories (Plugs)';
    if (d.includes('coupler')) return 'Duct Accessories (Couplers)';
    if (d.includes('cap')) return 'Duct Accessories (End Caps)';
    return 'Other Telecom Material';
  };

  // Pre-calculate issued quantities by (warehouseCode, matId)
  const issuedAgg = useMemo(() => {
    const map = {};
    const vendorsMap = {};
    issueItems.forEach(it => {
      const wcode = it.fromWarehouseCode || 'UNASSIGNED';
      const mid = it.matId || it.materialDescription || 'UNKNOWN';
      const k = `${wcode}__${mid}`;
      const qty = Number(it.quantity || it.unitCount) || 0;
      map[k] = (map[k] || 0) + qty;
      if (!vendorsMap[k]) vendorsMap[k] = new Set();
      const recip = it.issuedTo || it.issueeName;
      if (recip) vendorsMap[k].add(recip);
    });
    return { map, vendorsMap };
  }, [issueItems]);

  // Combined Stock Summary (Balances + Issues)
  const combinedStockSummary = useMemo(() => {
    const list = [];
    const seen = new Set();

    balances.forEach(b => {
      const wcode = b.warehouseCode || '';
      const mid = b.matId || '';
      const k = `${wcode}__${mid}`;
      seen.add(k);

      const avail = Number(b.quantity) || 0;
      const issued = issuedAgg.map[k] || 0;
      const total = avail + issued;
      const desc = b.materialDescription || b.name || '';
      const cat = inferCategory(desc, mid);
      const vendorsSet = issuedAgg.vendorsMap[k] || new Set();

      list.push({
        id: b.id || k,
        name: b.name || desc,
        description: desc,
        code: mid,
        category: cat,
        warehouseCode: wcode,
        warehouseName: b.warehouseName || wcode,
        circle: resolveCircle(wcode, b.warehouseName),
        uom: b.unitOfMeasurement || 'NOS',
        available: avail,
        issued: issued,
        total: total,
        reserved: 0,
        vendors: Array.from(vendorsSet).join(', ') || 'In Warehouse',
        status: avail > 0 && issued > 0 ? 'PARTIALLY ISSUED' : (avail > 0 ? 'AVAILABLE' : 'FULLY ISSUED'),
        lastUpdated: b.lastUpdatedAt
      });
    });

    return list;
  }, [balances, issuedAgg]);

  // Filtered lists for each tab
  const qLower = search.trim().toLowerCase();

  const filteredSummary = useMemo(() => {
    return combinedStockSummary.filter(it => {
      if (selectedCircle !== 'all' && it.circle !== selectedCircle && it.warehouseCode !== selectedCircle) return false;
      if (selectedCategory !== 'all' && it.category !== selectedCategory) return false;
      if (statusFilter !== 'all' && it.status !== statusFilter) return false;
      if (!qLower) return true;
      return (
        it.name.toLowerCase().includes(qLower) ||
        it.description.toLowerCase().includes(qLower) ||
        it.code.toLowerCase().includes(qLower) ||
        it.warehouseName.toLowerCase().includes(qLower) ||
        it.warehouseCode.toLowerCase().includes(qLower) ||
        it.vendors.toLowerCase().includes(qLower)
      );
    });
  }, [combinedStockSummary, selectedCircle, selectedCategory, statusFilter, qLower]);

  const filteredBalances = useMemo(() => {
    return balances.filter(b => {
      const wcode = b.warehouseCode || '';
      const circle = resolveCircle(wcode, b.warehouseName);
      const cat = inferCategory(b.materialDescription || b.name, b.matId);
      if (selectedCircle !== 'all' && circle !== selectedCircle && wcode !== selectedCircle) return false;
      if (selectedCategory !== 'all' && cat !== selectedCategory) return false;
      if (!qLower) return true;
      return (
        (b.name && b.name.toLowerCase().includes(qLower)) ||
        (b.materialDescription && b.materialDescription.toLowerCase().includes(qLower)) ||
        (b.warehouseName && b.warehouseName.toLowerCase().includes(qLower)) ||
        (wcode && wcode.toLowerCase().includes(qLower))
      );
    });
  }, [balances, selectedCircle, selectedCategory, qLower]);

  const filteredItems = useMemo(() => {
    return issueItems.filter(it => {
      const circle = resolveCircle(it.fromWarehouseCode, it.fromWarehouseName);
      const cat = inferCategory(it.materialDescription, it.matId);
      if (selectedCircle !== 'all' && it.fromWarehouseCode !== selectedCircle && circle !== selectedCircle) return false;
      if (selectedCategory !== 'all' && cat !== selectedCategory) return false;
      if (statusFilter !== 'all' && it.itemStatus !== statusFilter) return false;
      if (!qLower) return true;
      return (
        (it.serialNo && it.serialNo.toLowerCase().includes(qLower)) ||
        (it.issueNumber && it.issueNumber.toLowerCase().includes(qLower)) ||
        (it.materialDescription && it.materialDescription.toLowerCase().includes(qLower)) ||
        (it.issuedTo && it.issuedTo.toLowerCase().includes(qLower)) ||
        (it.recipientPerson && it.recipientPerson.toLowerCase().includes(qLower)) ||
        (it.issueeName && it.issueeName.toLowerCase().includes(qLower)) ||
        (it.fromWarehouseCode && it.fromWarehouseCode.toLowerCase().includes(qLower))
      );
    });
  }, [issueItems, selectedCircle, selectedCategory, statusFilter, qLower]);

  // Circle summary metrics
  const circleSummaries = useMemo(() => {
    const map = {};
    issueItems.forEach(it => {
      const code = it.fromWarehouseCode || 'UNASSIGNED-CIRCLE';
      const name = it.fromWarehouseName || 'Circle Warehouse';
      const circle = resolveCircle(code, name);
      if (!map[code]) {
        map[code] = {
          code,
          name,
          circle,
          totalQuantity: 0,
          totalDrums: 0,
          totalReservedQty: 0,
          vendorsSet: new Set(),
          materialsSet: new Set()
        };
      }
      map[code].totalQuantity += (Number(it.unitCount || it.quantity) || 0);
      map[code].totalDrums += 1;
      map[code].totalReservedQty += (Number(it.reservedQuantity) || 0);
      if (it.issueeName) map[code].vendorsSet.add(it.issueeName);
      if (it.materialDescription) map[code].materialsSet.add(it.materialDescription);
    });
    return Object.values(map);
  }, [issueItems]);

  // Overall totals across datasets
  const totalIssuedQty = issueItems.reduce((sum, it) => sum + (Number(it.unitCount || it.quantity) || 0), 0);
  const totalAvailableStock = balances.reduce((sum, b) => sum + (Number(b.quantity) || 0), 0);
  const totalDrums = issueItems.filter(it => it.serialNo).length;
  const uniqueMaterialTypes = new Set([
    ...balances.map(b => b.name || b.materialDescription),
    ...issueItems.map(it => it.materialDescription)
  ]).size;

  const activeVendorName = vendors && vendors.length > 0 ? (vendors[0].name || vendors[0].partnerName) : 'Your Vendor Account';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%', boxSizing: 'border-box' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: '1.4rem', fontFamily: 'inherit', fontWeight: '700', color: '#111827', margin: 0 }}>
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
          <p style={{ fontSize: '0.8rem', color: '#6b7280', margin: '4px 0 0 0' }}>
            {isAdmin
              ? 'Complete multi-circle stock balances, warehouse inventories, vendor dispatches, and serialized items'
              : `Stock balance, available materials, drum inventory, and dispatches for ${activeVendorName}`
            }
          </p>
        </div>

        {/* Action Buttons: Export Complete Stock (Excel) + Refresh */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={handleExportExcel}
            disabled={exporting}
            className="btn-primary"
            style={{
              padding: '8px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '0.82rem',
              fontWeight: '650',
              cursor: exporting ? 'not-allowed' : 'pointer',
              background: '#059669',
              borderColor: '#059669',
              boxShadow: '0 1px 3px rgba(5, 150, 105, 0.3)'
            }}
            title="Download complete 6-sheet Excel report covering all materials, warehouses, circles, issues, and drums"
          >
            <LucideFileSpreadsheet size={16} className={exporting ? 'animate-spin' : ''} />
            <span>{exporting ? 'Exporting Complete Excel…' : 'Export Complete Stock (Excel)'}</span>
          </button>

          <button
            type="button"
            onClick={fetchStockData}
            className="app-card"
            style={{
              padding: '8px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.8rem',
              cursor: 'pointer',
              fontWeight: '600'
            }}
          >
            <LucideRefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* KPI Overview Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
        <div className="app-card" style={{ padding: '14px 18px', borderLeft: '4px solid #059669' }}>
          <div style={{ fontSize: '0.74rem', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Available Warehouse Stock</div>
          <div style={{ fontSize: '1.35rem', fontWeight: '800', color: '#111827', marginTop: '4px' }}>
            {totalAvailableStock.toLocaleString('en-IN')} <span style={{ fontSize: '0.78rem', color: '#059669', fontWeight: '600' }}>Units in Stock</span>
          </div>
          <div style={{ fontSize: '0.72rem', color: '#6b7280', marginTop: '4px' }}>
            ● Across {balances.length} warehouse material balances
          </div>
        </div>

        <div className="app-card" style={{ padding: '14px 18px', borderLeft: '4px solid #111827' }}>
          <div style={{ fontSize: '0.74rem', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Total Issued / Dispatched</div>
          <div style={{ fontSize: '1.35rem', fontWeight: '800', color: '#111827', marginTop: '4px' }}>
            {totalIssuedQty.toLocaleString('en-IN')} <span style={{ fontSize: '0.78rem', color: '#111827', fontWeight: '600' }}>Units Dispatched</span>
          </div>
          <div style={{ fontSize: '0.72rem', color: '#059669', marginTop: '4px' }}>
            ● In {issues.length} stock issues to vendors
          </div>
        </div>

        <div className="app-card" style={{ padding: '14px 18px', borderLeft: '4px solid #0284c7' }}>
          <div style={{ fontSize: '0.74rem', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Drums & Serials Logged</div>
          <div style={{ fontSize: '1.35rem', fontWeight: '800', color: '#111827', marginTop: '4px' }}>
            {totalDrums} <span style={{ fontSize: '0.78rem', color: '#0284c7', fontWeight: '600' }}>Drums Logged</span>
          </div>
          <div style={{ fontSize: '0.72rem', color: '#0284c7', marginTop: '4px' }}>
            ● Serialized OFC & PLB Duct drums
          </div>
        </div>

        <div className="app-card" style={{ padding: '14px 18px', borderLeft: '4px solid #7c3aed' }}>
          <div style={{ fontSize: '0.74rem', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Material Categories</div>
          <div style={{ fontSize: '1.35rem', fontWeight: '800', color: '#111827', marginTop: '4px' }}>
            {uniqueMaterialTypes} <span style={{ fontSize: '0.78rem', color: '#7c3aed', fontWeight: '600' }}>Material Types</span>
          </div>
          <div style={{ fontSize: '0.72rem', color: '#7c3aed', marginTop: '4px' }}>
            ● Ducts, Cables, Couplers, Plugs, Closures, FDMS
          </div>
        </div>
      </div>

      {/* Tabs & Filters Navigation Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', borderBottom: '1px solid #e5e7eb', paddingBottom: '10px' }}>
        {/* Navigation Tabs */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setActiveTab('summary')}
            style={{
              padding: '7px 14px',
              borderRadius: '8px',
              fontSize: '0.82rem',
              fontWeight: activeTab === 'summary' ? '700' : '500',
              background: activeTab === 'summary' ? '#111827' : '#ffffff',
              color: activeTab === 'summary' ? '#ffffff' : '#4b5563',
              border: '1px solid #d1d5db',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <LucideBoxes size={14} />
            <span>Complete Stock Summary ({filteredSummary.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('available')}
            style={{
              padding: '7px 14px',
              borderRadius: '8px',
              fontSize: '0.82rem',
              fontWeight: activeTab === 'available' ? '700' : '500',
              background: activeTab === 'available' ? '#111827' : '#ffffff',
              color: activeTab === 'available' ? '#ffffff' : '#4b5563',
              border: '1px solid #d1d5db',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <LucideWarehouse size={14} />
            <span>Available Warehouse Stock ({filteredBalances.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('drum_items')}
            style={{
              padding: '7px 14px',
              borderRadius: '8px',
              fontSize: '0.82rem',
              fontWeight: activeTab === 'drum_items' ? '700' : '500',
              background: activeTab === 'drum_items' ? '#111827' : '#ffffff',
              color: activeTab === 'drum_items' ? '#ffffff' : '#4b5563',
              border: '1px solid #d1d5db',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <LucidePackage size={14} />
            <span>Drum &amp; Serial Items ({filteredItems.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('issues')}
            style={{
              padding: '7px 14px',
              borderRadius: '8px',
              fontSize: '0.82rem',
              fontWeight: activeTab === 'issues' ? '700' : '500',
              background: activeTab === 'issues' ? '#111827' : '#ffffff',
              color: activeTab === 'issues' ? '#ffffff' : '#4b5563',
              border: '1px solid #d1d5db',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <LucideFileText size={14} />
            <span>Stock Issue Details ({issues.length})</span>
          </button>

          {isAdmin && (
            <button
              type="button"
              onClick={() => setActiveTab('circle_summary')}
              style={{
                padding: '7px 14px',
                borderRadius: '8px',
                fontSize: '0.82rem',
                fontWeight: activeTab === 'circle_summary' ? '700' : '500',
                background: activeTab === 'circle_summary' ? '#111827' : '#ffffff',
                color: activeTab === 'circle_summary' ? '#ffffff' : '#4b5563',
                border: '1px solid #d1d5db',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <LucideMapPin size={14} />
              <span>Circle Summary ({circleSummaries.length})</span>
            </button>
          )}
        </div>

        {/* Filter Dropdowns */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Material Category Filter */}
          <SearchableSelect
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            style={{
              padding: '6px 10px',
              borderRadius: '8px',
              border: '1px solid #d1d5db',
              background: '#ffffff',
              fontSize: '0.8rem',
              fontWeight: '600',
              color: '#374151',
              cursor: 'pointer'
            }}
          >
            <option value="all">📦 All Material Categories</option>
            <option value="PLB-Duct">PLB-Duct</option>
            <option value="Optical Fiber Cable (OFC)">Optical Fiber Cable (OFC)</option>
            <option value="Joint Closures & Splicing">Joint Closures &amp; Splicing</option>
            <option value="FDMS Systems">FDMS Systems</option>
            <option value="Duct Accessories (Plugs)">Duct Plugs</option>
            <option value="Duct Accessories (Couplers)">Duct Couplers</option>
            <option value="Duct Accessories (End Caps)">End Caps</option>
            <option value="Other Telecom Material">Other Materials</option>
          </SearchableSelect>

          {/* Status Filter */}
          <SearchableSelect
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{
              padding: '6px 10px',
              borderRadius: '8px',
              border: '1px solid #d1d5db',
              background: '#ffffff',
              fontSize: '0.8rem',
              fontWeight: '600',
              color: '#374151',
              cursor: 'pointer'
            }}
          >
            <option value="all">⚡ All Statuses</option>
            <option value="AVAILABLE">✅ AVAILABLE Only</option>
            <option value="ISSUED">📦 ISSUED Only</option>
            <option value="PARTIALLY ISSUED">🔄 Partially Issued</option>
            <option value="RESERVED">🔒 RESERVED Only</option>
          </SearchableSelect>

          {/* Admin Circle Filter Dropdown */}
          {isAdmin && (
            <SearchableSelect
              value={selectedCircle}
              onChange={(e) => setSelectedCircle(e.target.value)}
              style={{
                padding: '6px 10px',
                borderRadius: '8px',
                border: '1px solid #d1d5db',
                background: '#ffffff',
                fontSize: '0.8rem',
                fontWeight: '600',
                color: '#374151',
                cursor: 'pointer'
              }}
            >
              <option value="all">📍 All Circles</option>
              <option value="Assam">Assam</option>
              <option value="Haryana">Haryana</option>
              <option value="Rajasthan">Rajasthan</option>
              <option value="Punjab">Punjab</option>
              <option value="Delhi">Delhi</option>
            </SearchableSelect>
          )}

          {/* Admin Vendor Filter Dropdown */}
          {isAdmin && (
            <SearchableSelect
              value={selectedVendor}
              onChange={(e) => setSelectedVendor(e.target.value)}
              style={{
                padding: '6px 10px',
                borderRadius: '8px',
                border: '1px solid #d1d5db',
                background: '#ffffff',
                fontSize: '0.8rem',
                fontWeight: '600',
                color: '#374151',
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

      {/* Global Search Bar */}
      <form onSubmit={handleSearchSubmit} style={{ position: 'relative', width: '100%' }}>
        <input
          type="text"
          placeholder="Search by material name, category, warehouse, vendor, drum serial (DRUM1010365), issue number (ISS-0268)..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: '100%',
            padding: '10px 14px 10px 38px',
            borderRadius: '8px',
            border: '1px solid #d1d5db',
            background: '#ffffff',
            fontSize: '0.85rem',
            outline: 'none',
            boxSizing: 'border-box'
          }}
        />
        <LucideSearch size={16} color="#9ca3af" style={{ position: 'absolute', left: '12px', top: '11px' }} />
      </form>

      {/* Tab Contents */}
      {loading ? (
        <div style={{ padding: '60px', textAlign: 'center', color: '#6b7280', fontSize: '0.9rem' }}>
          <LucideRefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 10px', display: 'block', color: '#0284c7' }} />
          Fetching live inventory, stock balances, and dispatch records...
        </div>
      ) : activeTab === 'summary' ? (
        /* TAB 1: Complete Stock Summary */
        <div className="table-container app-card" style={{ padding: 0, overflowX: 'auto' }}>
          <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
            <thead>
              <tr style={{ background: '#f8fafc', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ padding: '12px 14px' }}>Material Name</th>
                <th style={{ padding: '12px 14px' }}>Category</th>
                <th style={{ padding: '12px 14px' }}>Material Code</th>
                <th style={{ padding: '12px 14px', textAlign: 'right' }}>Total Stock</th>
                <th style={{ padding: '12px 14px', textAlign: 'right' }}>Available Qty</th>
                <th style={{ padding: '12px 14px', textAlign: 'right' }}>Issued Qty</th>
                <th style={{ padding: '12px 14px' }}>UOM</th>
                <th style={{ padding: '12px 14px' }}>Warehouse</th>
                <th style={{ padding: '12px 14px' }}>Circle</th>
                <th style={{ padding: '12px 14px' }}>Vendors / Location</th>
                <th style={{ padding: '12px 14px' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredSummary.length === 0 ? (
                <tr>
                  <td colSpan={11} style={{ padding: '30px', textAlign: 'center', color: '#64748b' }}>
                    No stock records match the selected filters.
                  </td>
                </tr>
              ) : (
                filteredSummary.map(row => (
                  <tr key={row.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '10px 14px', fontWeight: '700', color: '#0f172a' }}>
                      {row.name}
                    </td>
                    <td style={{ padding: '10px 14px', color: '#475569' }}>
                      <span className="badge-pill badge-neutral">{row.category}</span>
                    </td>
                    <td style={{ padding: '10px 14px', fontFamily: 'monospace', color: '#0284c7' }}>
                      {row.code || '—'}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: '700', color: '#0f172a' }}>
                      {row.total.toLocaleString('en-IN')}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: '700', color: '#16a34a' }}>
                      {row.available.toLocaleString('en-IN')}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: '600', color: '#0284c7' }}>
                      {row.issued.toLocaleString('en-IN')}
                    </td>
                    <td style={{ padding: '10px 14px', color: '#64748b' }}>
                      {row.uom}
                    </td>
                    <td style={{ padding: '10px 14px', color: '#334155' }}>
                      {row.warehouseName}
                      <span style={{ fontSize: '0.72rem', color: '#94a3b8', display: 'block' }}>{row.warehouseCode}</span>
                    </td>
                    <td style={{ padding: '10px 14px', fontWeight: '600', color: '#475569' }}>
                      {row.circle}
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: '0.78rem', color: '#475569', maxWidth: '180px' }}>
                      {row.vendors}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <span className={`badge-pill ${row.status === 'AVAILABLE' ? 'badge-running' : (row.status === 'PARTIALLY ISSUED' ? 'badge-amber' : 'badge-neutral')}`}>
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : activeTab === 'available' ? (
        /* TAB 2: Available Warehouse Stock */
        <div className="table-container app-card" style={{ padding: 0, overflowX: 'auto' }}>
          <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
            <thead>
              <tr style={{ background: '#f8fafc', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ padding: '12px 14px' }}>Material Name</th>
                <th style={{ padding: '12px 14px' }}>Category</th>
                <th style={{ padding: '12px 14px' }}>Material Code</th>
                <th style={{ padding: '12px 14px' }}>Warehouse</th>
                <th style={{ padding: '12px 14px' }}>Circle</th>
                <th style={{ padding: '12px 14px', textAlign: 'right' }}>Available Quantity</th>
                <th style={{ padding: '12px 14px' }}>UOM</th>
                <th style={{ padding: '12px 14px' }}>Last Updated</th>
                <th style={{ padding: '12px 14px' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredBalances.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ padding: '30px', textAlign: 'center', color: '#64748b' }}>
                    No available warehouse stock records found.
                  </td>
                </tr>
              ) : (
                filteredBalances.map((b, idx) => {
                  const circle = resolveCircle(b.warehouseCode, b.warehouseName);
                  const cat = inferCategory(b.materialDescription || b.name, b.matId);
                  return (
                    <tr key={b.id || idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '10px 14px', fontWeight: '700', color: '#0f172a' }}>
                        {b.name || b.materialDescription}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span className="badge-pill badge-neutral">{cat}</span>
                      </td>
                      <td style={{ padding: '10px 14px', fontFamily: 'monospace', color: '#0284c7' }}>
                        {b.matId || '—'}
                      </td>
                      <td style={{ padding: '10px 14px', color: '#334155' }}>
                        {b.warehouseName || b.warehouseCode}
                        <span style={{ fontSize: '0.72rem', color: '#94a3b8', display: 'block' }}>{b.warehouseCode}</span>
                      </td>
                      <td style={{ padding: '10px 14px', fontWeight: '600', color: '#475569' }}>
                        {circle}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: '800', color: '#16a34a' }}>
                        {(Number(b.quantity) || 0).toLocaleString('en-IN')}
                      </td>
                      <td style={{ padding: '10px 14px', color: '#64748b' }}>
                        {b.unitOfMeasurement || 'NOS'}
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: '0.78rem', color: '#64748b' }}>
                        {b.lastUpdatedAt ? new Date(b.lastUpdatedAt).toLocaleDateString() : 'Active'}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span className="badge-pill badge-running">● IN STOCK</span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      ) : activeTab === 'drum_items' ? (
        /* TAB 3: Drum & Serialized Items */
        <div className="table-container app-card" style={{ padding: 0, overflowX: 'auto' }}>
          <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
            <thead>
              <tr style={{ background: '#f8fafc', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ padding: '12px 14px' }}>Drum Serial No</th>
                <th style={{ padding: '12px 14px' }}>Issue Number</th>
                <th style={{ padding: '12px 14px' }}>Material Description</th>
                <th style={{ padding: '12px 14px' }}>Category</th>
                <th style={{ padding: '12px 14px', textAlign: 'right' }}>Issued Length</th>
                <th style={{ padding: '12px 14px' }}>Status</th>
                <th style={{ padding: '12px 14px' }}>Issued To (Person / Vendor Name)</th>
                <th style={{ padding: '12px 14px' }}>Recipient Person</th>
                <th style={{ padding: '12px 14px' }}>Warehouse Code</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ padding: '30px', textAlign: 'center', color: '#64748b' }}>
                    No drum stock items found. Try clearing filters or search query.
                  </td>
                </tr>
              ) : (
                filteredItems.map((it, idx) => {
                  const cat = inferCategory(it.materialDescription, it.matId);
                  const issuedToDisplay = it.issuedTo || it.issueeName || '—';
                  const personDisplay = it.recipientPerson || '—';
                  return (
                    <tr key={it.id || idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontWeight: '700', color: '#0369a1' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <LucidePackage size={13} color="#0369a1" />
                          {it.serialNo || 'DRUM-N/A'}
                        </div>
                      </td>
                      <td style={{ padding: '10px 14px', fontWeight: '700', color: '#0f172a' }}>
                        {it.issueNumber || 'ISS-N/A'}
                      </td>
                      <td style={{ padding: '10px 14px', fontWeight: '600', color: '#334155' }}>
                        {it.materialDescription}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span className="badge-pill badge-neutral">{cat}</span>
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: '700', color: '#0f172a' }}>
                        {(Number(it.unitCount || it.quantity) || 0).toLocaleString('en-IN')} {it.unitOfMeasurement || 'M'}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span className={`badge-pill ${it.itemStatus === 'RESERVED' ? 'badge-amber' : 'badge-running'}`}>
                          {it.itemStatus || 'ISSUED'}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', fontWeight: '600', color: '#0f172a' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <LucideBuilding2 size={13} color="#0284c7" />
                          {issuedToDisplay}
                        </div>
                      </td>
                      <td style={{ padding: '10px 14px', color: '#475569' }}>
                        {personDisplay}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span className="badge-pill badge-neutral">
                          {it.fromWarehouseCode || '—'}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      ) : activeTab === 'issues' ? (
        /* TAB 4: Stock Issues Details */
        <div className="table-container app-card" style={{ padding: 0, overflowX: 'auto' }}>
          <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
            <thead>
              <tr style={{ background: '#f8fafc', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ padding: '12px 14px' }}>Issue Number</th>
                <th style={{ padding: '12px 14px' }}>Stock Transfer #</th>
                <th style={{ padding: '12px 14px' }}>From Warehouse</th>
                <th style={{ padding: '12px 14px' }}>Circle</th>
                <th style={{ padding: '12px 14px' }}>Issued To (Person / Vendor Name)</th>
                <th style={{ padding: '12px 14px' }}>Recipient Contact Person</th>
                <th style={{ padding: '12px 14px' }}>Vendor / Emp ID</th>
                <th style={{ padding: '12px 14px', textAlign: 'right' }}>Items Count</th>
                <th style={{ padding: '12px 14px' }}>Issue Date</th>
                <th style={{ padding: '12px 14px' }}>Issued By</th>
                <th style={{ padding: '12px 14px' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {issues.length === 0 ? (
                <tr>
                  <td colSpan={11} style={{ padding: '30px', textAlign: 'center', color: '#64748b' }}>
                    No stock issues found.
                  </td>
                </tr>
              ) : (
                issues.map(iss => {
                  const circle = resolveCircle(iss.fromWarehouseCode, iss.fromWarehouseName);
                  const issuedToVal = iss.issuedTo || iss.issueeName || '—';
                  const recipientVal = iss.recipientPerson || '—';
                  const empIdVal = iss.vendorOrEmpId || '—';
                  const issuedByVal = iss.issuedByName || 'Store Admin';
                  return (
                    <tr key={iss.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontWeight: '700', color: '#0284c7' }}>
                        {iss.issueNumber || iss.id}
                      </td>
                      <td style={{ padding: '10px 14px', color: '#64748b', fontFamily: 'monospace' }}>
                        {iss.stockTransferNumber || '-'}
                      </td>
                      <td style={{ padding: '10px 14px', fontWeight: '600', color: '#0f172a' }}>
                        {iss.fromWarehouseName || iss.fromWarehouseCode}
                      </td>
                      <td style={{ padding: '10px 14px', color: '#475569' }}>
                        {circle}
                      </td>
                      <td style={{ padding: '10px 14px', fontWeight: '700', color: '#0f172a' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <LucideBuilding2 size={13} color="#0284c7" />
                          {issuedToVal}
                        </div>
                      </td>
                      <td style={{ padding: '10px 14px', color: '#334155', fontWeight: '600' }}>
                        {recipientVal}
                      </td>
                      <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontSize: '0.78rem', color: '#64748b' }}>
                        {empIdVal}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: '700', color: '#0f172a' }}>
                        {Array.isArray(iss.items) ? iss.items.length : 0} items
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: '0.78rem', color: '#64748b' }}>
                        {iss.issuedAt ? new Date(iss.issuedAt).toLocaleDateString() : 'Recent'}
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: '0.8rem', color: '#475569', fontWeight: '500' }}>
                        {issuedByVal}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span className="badge-pill badge-running">• {iss.status || 'ISSUED'}</span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      ) : (
        /* TAB 5: Circle Summary */
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
          {circleSummaries.map(c => (
            <div key={c.code} className="app-card" style={{ padding: '16px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <span className="badge-pill badge-neutral">
                    {c.code}
                  </span>
                  <div style={{ fontSize: '1.05rem', fontWeight: '700', color: '#0f172a', marginTop: '6px' }}>
                    {c.name}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Circle: {c.circle}</div>
                </div>
                <LucideWarehouse size={22} color="#0284c7" />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '14px', background: '#ffffff', padding: '10px', borderRadius: '8px', border: '1px solid #f1f5f9' }}>
                <div>
                  <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Total Dispatched</div>
                  <div style={{ fontSize: '0.95rem', fontWeight: '700', color: '#0f172a' }}>{c.totalQuantity.toLocaleString('en-IN')} M</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Drums Count</div>
                  <div style={{ fontSize: '0.95rem', fontWeight: '700', color: '#0284c7' }}>{c.totalDrums} Drums</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Reserved Qty</div>
                  <div style={{ fontSize: '0.95rem', fontWeight: '700', color: '#d97706' }}>{c.totalReservedQty.toLocaleString('en-IN')} M</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Vendors Issued</div>
                  <div style={{ fontSize: '0.95rem', fontWeight: '700', color: '#059669' }}>{c.vendorsSet.size} Vendors</div>
                </div>
              </div>

              {c.vendorsSet.size > 0 && (
                <div style={{ marginTop: '10px', fontSize: '0.74rem', color: '#475569' }}>
                  <strong>Vendors:</strong> {Array.from(c.vendorsSet).join(', ')}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Stock;

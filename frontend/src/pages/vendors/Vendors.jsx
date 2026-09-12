import React, { useEffect, useState } from 'react';
import { vendorService } from '../../services/vendorService';
import { useAuth } from '../../hooks/useAuth';
import { useVendorContext } from '../../context/VendorContext';
import { NoVendorBanner } from '../../components/common/NoVendorBanner';
import { LucideBuilding, LucideSearch, LucideRefreshCw, LucideMail, LucidePhone, LucideTruck, LucideUser, LucideFileText, LucideCreditCard, LucideX, LucideChevronLeft, LucideChevronRight, LucideCheckCircle } from 'lucide-react';
import '../../styles/screens.css';

export const Vendors = () => {
  const { user, isAdmin, hasNoVendors, selectedVendorId, vendors: authVendors } = useAuth();
  const { activeVendor, vendorMachines, vendorUsers, loadingVendor, refreshVendor } = useVendorContext();
  const [vendors, setVendors] = useState([]);
  const [pagination, setPagination] = useState({ page: 0, size: 10, total: 0, total_pages: 1 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedVendor, setSelectedVendor] = useState(null);

  const displayVendors = (!isAdmin && authVendors && authVendors.length > 0)
    ? vendors.filter(v => {
        const vId = String(v.id || '').toLowerCase();
        const vExtId = String(v.external_vendor_id || v.external_id || '').toLowerCase();
        const vName = String(v.partnerName || v.name || '').toLowerCase();
        return authVendors.some(av => {
          const avId = String(av.id || '').toLowerCase();
          const avExtId = String(av.external_vendor_id || av.external_id || '').toLowerCase();
          const avName = String(av.partnerName || av.name || '').toLowerCase();
          return (vId && avId && vId === avId) || (vExtId && avExtId && vExtId === avExtId) || (vName && avName && (vName.includes(avName) || avName.includes(vName)));
        });
      })
    : vendors;

  const fetchVendors = (page = 0, searchQuery = search) => {
    if (hasNoVendors) {
      setVendors([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const params = { page: 0, size: 100, search: searchQuery };
    if (selectedVendorId && selectedVendorId !== 'all') {
      params.vendor_id = selectedVendorId;
    }

    vendorService.getIntegrationsVendors(params)
      .then(res => {
        const payload = res.data?.data || res.data || {};
        const list = payload.results || payload.content || (Array.isArray(payload) ? payload : (payload.vendors || []));
        if (list.length > 0) {
          setVendors(list);
          setPagination({ page: 0, size: list.length, total: list.length, total_pages: 1 });
        } else {
          return vendorService.getVendors({ page: 0, size: 100, search: searchQuery }).then(dbRes => {
            const dbPayload = dbRes.data?.data || dbRes.data || {};
            const dbList = dbPayload.results || dbPayload.vendors || (Array.isArray(dbPayload) ? dbPayload : []);
            setVendors(dbList);
            setPagination({ page: 0, size: dbList.length, total: dbList.length, total_pages: 1 });
          });
        }
      })
      .catch(err => {
        console.error(err);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchVendors(0, search);
  }, [hasNoVendors, selectedVendorId]);

  const renderVendorDetailSections = (v) => {
    if (!v) return null;
    const machinesList = v.machines || v.assigned_machines || vendorMachines || [];
    const usersList = v.users || vendorUsers || [];
    const bank = v.bankAccount || {};
    const turnOver = v.turnOverList || [];
    const serviceAreas = v.serviceAreas || [];

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', fontSize: '0.85rem' }}>
        <div style={{ background: '#f9fafb', padding: '16px', borderRadius: '10px', border: '1px solid #e5e7eb' }}>
          <div style={{ fontSize: '0.82rem', fontWeight: '800', color: '#111827', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.03em', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <LucideBuilding size={16} color="#059669" /> A. Basic Information
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
            <div><span style={{ color: '#6b7280' }}>Partner Name:</span> <strong style={{ color: '#111827' }}>{v.partnerName || v.name || 'N/A'}</strong></div>
            <div><span style={{ color: '#6b7280' }}>Contact Name:</span> <strong>{v.contactName || v.contact_person || 'N/A'}</strong></div>
            <div><span style={{ color: '#6b7280' }}>Designation:</span> <strong>{v.designation || 'Vendor'}</strong></div>
            <div><span style={{ color: '#6b7280' }}>Legal Entity Type:</span> <strong>{v.legalEntityType || 'COMPANY'}</strong></div>
            <div><span style={{ color: '#6b7280' }}>Business Unit:</span> <strong>{v.businessUnit || 'PROJECT_WORK'}</strong></div>
            <div><span style={{ color: '#6b7280' }}>Phone Number:</span> <strong>{v.phoneNumber || v.phone || 'N/A'}</strong></div>
            <div><span style={{ color: '#6b7280' }}>Email:</span> <strong>{v.email || 'N/A'}</strong></div>
            <div><span style={{ color: '#6b7280' }}>Active Status:</span> <span style={{ background: '#dcfce7', color: '#166534', padding: '2px 8px', borderRadius: '10px', fontWeight: '700', fontSize: '0.75rem' }}>● ACTIVE</span></div>
            <div><span style={{ color: '#6b7280' }}>HDD Hero:</span> <strong>{v.hddHero ? 'YES' : 'NO'}</strong></div>
          </div>
        </div>

        <div style={{ background: '#ffffff', padding: '16px', borderRadius: '10px', border: '1px solid #e5e7eb' }}>
          <div style={{ fontSize: '0.82rem', fontWeight: '800', color: '#111827', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
            📍 B. Address Information
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
            <div><span style={{ color: '#6b7280' }}>Registered Address:</span> <br/><strong>{v.registeredAddress?.trim() || 'Sujangarh Site'}</strong></div>
            <div><span style={{ color: '#6b7280' }}>Communication Address:</span> <br/><strong>{v.communicationAddress?.trim() || v.registeredAddress?.trim() || 'Sujangarh Site'}</strong></div>
            <div><span style={{ color: '#6b7280' }}>PIN Code:</span> <br/><strong>{v.pinCode || '302019'}</strong></div>
          </div>
        </div>

        <div style={{ background: '#faf5ff', padding: '16px', borderRadius: '10px', border: '1px solid #e9d5ff' }}>
          <div style={{ fontSize: '0.82rem', fontWeight: '800', color: '#6b21a8', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.03em', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <LucideCreditCard size={16} color="#9333ea" /> C. Bank Account Details
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
            <div><span style={{ color: '#7e22ce' }}>Account Holder Name:</span> <br/><strong>{bank.accountHolderName || v.partnerName || 'N/A'}</strong></div>
            <div><span style={{ color: '#7e22ce' }}>Bank Name:</span> <br/><strong>{bank.bankName || 'AU Small Finance Bank'}</strong></div>
            <div><span style={{ color: '#7e22ce' }}>Account Number:</span> <br/><code>{bank.accountNumber || '2121218033061250'}</code></div>
            <div><span style={{ color: '#7e22ce' }}>IFSC Code:</span> <br/><code>{bank.ifscCode || 'AUBL0002180'}</code></div>
          </div>
        </div>

        <div style={{ background: '#fff7ed', padding: '16px', borderRadius: '10px', border: '1px solid #fed7aa' }}>
          <div style={{ fontSize: '0.82rem', fontWeight: '800', color: '#9a3412', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.03em', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <LucideFileText size={16} color="#ea580c" /> D. Tax & Registration Details
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
            <div><span style={{ color: '#c2410c' }}>PAN Card:</span> <br/><strong>{v.panCard || 'NEEDED TO REPLACE'}</strong></div>
            <div><span style={{ color: '#c2410c' }}>GST Number:</span> <br/><strong>{v.gstNumber || 'N/A'}</strong></div>
            <div><span style={{ color: '#c2410c' }}>GST Registered:</span> <br/><strong>{v.gstDocUrl || v.gstNumber ? 'YES' : 'NO'}</strong></div>
            <div><span style={{ color: '#c2410c' }}>MSME Number:</span> <br/><strong>{v.msmeNumber || 'N/A'}</strong></div>
            <div><span style={{ color: '#c2410c' }}>TDS Amount:</span> <br/><strong>{v.tdsAmount || '₹0'}</strong></div>
            <div><span style={{ color: '#c2410c' }}>Low TDS Certificate:</span> <br/><strong>{v.lowTdsCertificateUrl ? 'AVAILABLE' : 'N/A'}</strong></div>
          </div>
        </div>

        <div style={{ background: '#ecfeff', padding: '14px 16px', borderRadius: '10px', border: '1px solid #a5f3fc' }}>
          <div style={{ fontSize: '0.82rem', fontWeight: '800', color: '#0e7490', marginBottom: '6px', textTransform: 'uppercase' }}>
            🌐 E. Service Areas
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {(serviceAreas.length > 0 ? serviceAreas : [{ serviceAreaType: 'FIBER' }]).map((sa, idx) => (
              <span key={idx} style={{ background: '#0891b2', color: '#ffffff', padding: '4px 12px', borderRadius: '6px', fontWeight: '700', fontSize: '0.78rem' }}>
                {sa.serviceAreaType || sa}
              </span>
            ))}
          </div>
        </div>

        <div style={{ background: '#f0f9ff', padding: '16px', borderRadius: '10px', border: '1px solid #bae6fd' }}>
          <div style={{ fontSize: '0.82rem', fontWeight: '800', color: '#0369a1', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <LucideTruck size={16} color="#0284c7" /> F. Assigned Machines ({machinesList.length})
          </div>
          {machinesList.length === 0 ? (
            <div style={{ padding: '16px', textAlign: 'center', color: '#6b7280', fontSize: '0.85rem', background: '#ffffff', borderRadius: '8px', border: '1px dashed #cbd5e1' }}>
              No machines assigned
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {machinesList.map((m, idx) => (
                <div key={idx} style={{ background: '#ffffff', padding: '12px 14px', borderRadius: '8px', border: '1px solid #e0f2fe', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                  <div>
                    <div style={{ fontWeight: '800', color: '#0c4a6e', fontSize: '0.92rem' }}>
                      Machine No: {m.machineNo || m.machine_no || m.name} ({m.code || m.model_code || 'A600'})
                    </div>
                    <div style={{ fontSize: '0.78rem', color: '#0369a1', marginTop: '2px' }}>
                      Engine No: <strong>{m.engineNo || m.engine_no || 'TPHM106451'}</strong> | ID: <code>{m.id}</code>
                    </div>
                  </div>
                  <span style={{ fontSize: '0.72rem', background: '#0284c7', color: '#ffffff', padding: '3px 10px', borderRadius: '6px', fontWeight: '700' }}>
                    {m.status || 'COMMISSIONED'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ background: '#ecfdf5', padding: '16px', borderRadius: '10px', border: '1px solid #a7f3d0' }}>
          <div style={{ fontSize: '0.82rem', fontWeight: '800', color: '#047857', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <LucideUser size={16} color="#059669" /> G. Vendor Users & Operators ({usersList.length})
          </div>
          {usersList.length === 0 ? (
            <div style={{ padding: '16px', textAlign: 'center', color: '#6b7280', fontSize: '0.85rem', background: '#ffffff', borderRadius: '8px', border: '1px dashed #cbd5e1' }}>
              No users found
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {usersList.map((u, idx) => (
                <div key={idx} style={{ background: '#ffffff', padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1fae5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <strong style={{ fontSize: '0.9rem', color: '#064e3b' }}>{u.name}</strong>
                    <div style={{ fontSize: '0.78rem', color: '#047857', marginTop: '2px' }}>📧 {u.email || 'N/A'}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: '0.7rem', background: '#047857', color: '#ffffff', padding: '2px 8px', borderRadius: '6px', fontWeight: '700' }}>
                      {u.designation || 'OPERATOR'}
                    </span>
                    <div style={{ fontSize: '0.78rem', color: '#047857', marginTop: '2px', fontWeight: '600' }}>📞 {u.mobile}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h1 style={{ fontSize: '1.4rem', fontFamily: 'Outfit, sans-serif', fontWeight: '700', color: '#111827' }}>
              Vendor & Partner Management
            </h1>
            <span style={{ fontSize: '0.72rem', background: '#0a2d23', color: '#6ee7b7', padding: '2px 8px', borderRadius: '12px', fontWeight: '600' }}>
              ● Django ILYNC Proxy (/api/vendor)
            </span>
          </div>
          <p style={{ fontSize: '0.8rem', color: '#6b7280' }}>
            Authenticated server-side vendor data scope (https://ilync.tech/api/vendor)
          </p>
        </div>

        <button onClick={() => { refreshVendor(); fetchVendors(0, search); }} className="app-card" style={{ padding: '8px 14px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', cursor: 'pointer' }}>
          <LucideRefreshCw size={14} className={loading || loadingVendor ? 'animate-spin' : ''} /> Refresh Vendor Data
        </button>
      </div>

      {hasNoVendors && <NoVendorBanner />}

      {!isAdmin ? (
        <div className="app-card" style={{ padding: '20px' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: '800', color: '#111827', marginBottom: '16px' }}>
            🏢 My Authorized Vendor Profile
          </h2>
          {renderVendorDetailSections(activeVendor)}
        </div>
      ) : (
        <>
          <div className="app-card" style={{ padding: '14px', display: 'flex', gap: '12px', alignItems: 'center' }}>
            <form onSubmit={(e) => { e.preventDefault(); fetchVendors(0, search); }} style={{ position: 'relative', flex: 1 }}>
              <input
                type="text"
                placeholder="Search vendor by partner name, code, contact person..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ width: '100%', padding: '8px 12px 8px 34px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '0.82rem', outline: 'none', boxSizing: 'border-box' }}
              />
              <LucideSearch size={16} color="#9ca3af" style={{ position: 'absolute', left: '10px', top: '10px' }} />
            </form>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
            {displayVendors.map(v => (
              <div key={v.id} className="app-card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <span style={{ fontSize: '0.68rem', background: '#0a2d23', color: '#6ee7b7', padding: '2px 6px', borderRadius: '4px', fontWeight: '700' }}>
                      {v.legalEntityType || 'COMPANY'}
                    </span>
                    <h3 style={{ fontSize: '1.05rem', fontWeight: '700', color: '#111827', marginTop: '4px' }}>
                      {v.partnerName || v.name}
                    </h3>
                  </div>
                  <button onClick={() => setSelectedVendor(v)} style={{ padding: '4px 10px', fontSize: '0.75rem', background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: '6px', fontWeight: '700', cursor: 'pointer' }}>
                    Inspect
                  </button>
                </div>
                <div style={{ fontSize: '0.78rem', color: '#4b5563', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div>👤 Contact: <strong>{v.contactName || v.contact_person || 'Sh Sukhram'}</strong> ({v.designation || 'Vendor'})</div>
                  <div>📞 Phone: <strong>{v.phoneNumber || v.phone || 'N/A'}</strong></div>
                  <div>📧 Email: <strong>{v.email || 'N/A'}</strong></div>
                  <div>🚜 Assigned Machines: <strong>{v.machines?.length || v.assigned_machines?.length || 0}</strong></div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {selectedVendor && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div className="app-card" style={{ width: '100%', maxWidth: '680px', maxHeight: '88vh', overflowY: 'auto', position: 'relative', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #e5e7eb', paddingBottom: '12px' }}>
              <h2 style={{ fontSize: '1.2rem', fontWeight: '700', color: '#111827' }}>
                🏢 {selectedVendor.partnerName || selectedVendor.name} - Vendor Details
              </h2>
              <LucideX size={22} onClick={() => setSelectedVendor(null)} style={{ cursor: 'pointer', color: '#6b7280' }} />
            </div>

            {renderVendorDetailSections(selectedVendor)}

            <button onClick={() => setSelectedVendor(null)} className="btn-primary" style={{ width: '100%', marginTop: '20px' }}>
              Close Details
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

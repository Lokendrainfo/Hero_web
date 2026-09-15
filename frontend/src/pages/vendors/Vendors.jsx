import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { vendorService } from '../../services/vendorService';
import { useAuth } from '../../hooks/useAuth';
import { useVendorContext } from '../../context/VendorContext';
import { NoVendorBanner } from '../../components/common/NoVendorBanner';
import { PageHeader } from '../../components/common/PageHeader';
import { EmptyState } from '../../components/common/EmptyState';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { LucideRefreshCw, LucideSearch, LucideX } from 'lucide-react';

const display = (value) => {
  if (value == null) return '—';
  const text = String(value).trim();
  return text ? text : '—';
};

const hasValue = (...values) => values.some((v) => v != null && String(v).trim() !== '');

const Field = ({ label, children }) => (
  <div>
    <dt>{label}</dt>
    <dd>{children}</dd>
  </div>
);

export const Vendors = () => {
  const { isAdmin, hasNoVendors, selectedVendorId, vendors: authVendors } = useAuth();
  const { activeVendor, vendorMachines, vendorUsers, loadingVendor, refreshVendor } = useVendorContext();
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedVendor, setSelectedVendor] = useState(null);
  const [vendorDetail, setVendorDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    if (!selectedVendor) {
      setVendorDetail(null);
      setLoadingDetail(false);
      return;
    }

    setVendorDetail(selectedVendor);
    setLoadingDetail(true);

    const vendorId = selectedVendor.id || selectedVendor.external_vendor_id || selectedVendor.external_id;
    if (!vendorId) {
      setLoadingDetail(false);
      return;
    }

    Promise.allSettled([
      vendorService.getVendorById(vendorId),
      vendorService.getIntegrationsVendorById
        ? vendorService.getIntegrationsVendorById(vendorId)
        : Promise.resolve(null)
    ])
      .then(([dbRes, intRes]) => {
        const dbData = dbRes.status === 'fulfilled' ? (dbRes.value?.data?.data || dbRes.value?.data) : null;
        const intData = intRes.status === 'fulfilled' ? (intRes.value?.data?.data || intRes.value?.data) : null;

        const merged = {
          ...selectedVendor,
          ...(intData && typeof intData === 'object' ? intData : {}),
          ...(dbData && typeof dbData === 'object' ? dbData : {})
        };

        const rawMachines = [
          ...(selectedVendor.machines || []),
          ...(intData?.machines || []),
          ...(dbData?.machines || []),
          ...(dbData?.assigned_machines || [])
        ];
        merged.machines = rawMachines;

        const rawUsers = [
          ...(selectedVendor.users || []),
          ...(intData?.users || []),
          ...(dbData?.users || [])
        ];
        merged.users = rawUsers;

        setVendorDetail(merged);
      })
      .catch((err) => {
        console.error('Failed to load full vendor detail:', err);
      })
      .finally(() => {
        setLoadingDetail(false);
      });
  }, [selectedVendor]);

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

  const filteredVendors = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return displayVendors;
    return displayVendors.filter((v) => {
      const hay = [
        v.partnerName, v.name, v.contactName, v.contact_person,
        v.email, v.phoneNumber, v.phone, v.legalEntityType,
      ].map((x) => String(x || '').toLowerCase()).join(' ');
      return hay.includes(q);
    });
  }, [displayVendors, search]);

  const fetchVendors = (searchQuery = search) => {
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
        } else {
          return vendorService.getVendors({ page: 0, size: 100, search: searchQuery }).then(dbRes => {
            const dbPayload = dbRes.data?.data || dbRes.data || {};
            const dbList = dbPayload.results || dbPayload.vendors || (Array.isArray(dbPayload) ? dbPayload : []);
            setVendors(dbList);
          });
        }
      })
      .catch(err => {
        console.error(err);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchVendors(search);
  }, [hasNoVendors, selectedVendorId]);

  const renderVendorDetail = (v, extras = {}) => {
    if (!v) return null;

    const rawMachines = [
      ...(Array.isArray(v.machines) ? v.machines : []),
      ...(Array.isArray(v.assigned_machines) ? v.assigned_machines : []),
      ...(Array.isArray(extras.machines) ? extras.machines : [])
    ];

    const machineMap = new Map();
    rawMachines.forEach((m) => {
      if (!m) return;
      const key = String(
        m.machineNo || m.machine_no || m.serial_number || m.machine_chassis_no || m.name || m.id || ''
      ).trim().toLowerCase();
      if (!key) return;

      const existing = machineMap.get(key) || {};
      machineMap.set(key, {
        ...existing,
        ...m,
        id: m.id || existing.id,
        code: m.code || m.model_code || m.model || existing.code,
        machineNo: m.machineNo || m.machine_no || m.machine_chassis_no || m.serial_number || m.name || existing.machineNo,
        engineNo: m.engineNo || m.engine_no || existing.engineNo,
        status: m.status || existing.status || 'COMMISSIONED',
        model_name: m.model_name || m.name || existing.model_name
      });
    });

    const machinesList = Array.from(machineMap.values());
    const usersList = v.users || extras.users || [];
    const bank = v.bankAccount || v.bank_account || v.bank_details || {};
    const serviceAreas = v.serviceAreas || v.service_areas || (v.businessUnit ? [v.businessUnit] : ['FIBER']);
    const isActive = v.isActive ?? v.is_active ?? v.active ?? (v.status ? String(v.status).toUpperCase() === 'ACTIVE' : true);

    const partnerName = v.partnerName || v.name || v.partner_name;
    const contact = v.contactName || v.contact_person || v.owner_name || 'N/A';
    const codeVal = v.code || v.vendor_code || v.external_vendor_id || v.external_id || v.id;
    const legalType = v.legalEntityType || v.legal_entity_type || v.vendor_type || 'FIRM';
    const bizUnit = v.businessUnit || v.business_unit || 'PROJECT_WORK';
    const phoneVal = v.phoneNumber || v.phone || v.contact_phone || v.contactNumber || 'N/A';
    const emailVal = v.email || 'N/A';
    const desigVal = v.designation || 'Vendor';

    const regAddress = v.registeredAddress || v.address || v.registered_address || 'Sujangarh Site';
    const commAddress = v.communicationAddress || v.communication_address || regAddress;
    const pinVal = v.pinCode || v.pincode || v.pin_code || '302019';
    const geoInfo = [v.circle, v.district, v.state].filter(Boolean).join(' · ');

    const holderName = bank.accountHolderName || bank.account_holder_name || bank.holder_name || partnerName;
    const bankNameVal = bank.bankName || bank.bank_name || 'AU Small Finance Bank';
    const accNum = bank.accountNumber || bank.account_number || '2121218033061250';
    const ifscVal = bank.ifscCode || bank.ifsc_code || bank.ifsc || 'AUBL0002180';

    const panVal = v.panCard || v.pan_card || v.pan || v.pan_number || 'NEEDED TO REPLACE';
    const gstVal = v.gstNumber || v.gst_number || v.gstin || v.gst || 'N/A';
    const isGstReg = Boolean(v.gstDocUrl || v.gstNumber || v.gstin || v.gst);
    const msmeVal = v.msmeNumber || v.msme_number || v.msme || 'N/A';
    const tdsVal = v.tdsAmount || v.tds_amount || v.tds || 0;
    const lowTdsCert = v.lowTdsCertificateUrl ? 'AVAILABLE' : 'N/A';

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

        {/* A. BASIC INFORMATION */}
        <section style={{ background: '#f8fafc', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '18px 20px' }}>
          <div style={{ color: '#047857', fontSize: '0.85rem', fontWeight: '800', marginBottom: '14px', letterSpacing: '0.02em', display: 'flex', alignItems: 'center', gap: '6px' }}>
            🏢 A. BASIC INFORMATION
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px 20px' }}>
            <div>
              <div style={{ color: '#059669', fontSize: '0.82rem', fontWeight: '500' }}>Partner Name:</div>
              <div style={{ fontSize: '0.92rem', fontWeight: '700', color: '#0f172a', marginTop: '2px' }}>{display(partnerName)}</div>
            </div>
            <div>
              <div style={{ color: '#059669', fontSize: '0.82rem', fontWeight: '500' }}>Contact Name:</div>
              <div style={{ fontSize: '0.92rem', fontWeight: '700', color: '#0f172a', marginTop: '2px' }}>{display(contact)}</div>
            </div>
            {hasValue(codeVal) && (
              <div>
                <div style={{ color: '#059669', fontSize: '0.82rem', fontWeight: '500' }}>Vendor Code / ID:</div>
                <div style={{ fontSize: '0.92rem', fontWeight: '700', color: '#0f172a', marginTop: '2px' }}>{display(codeVal)}</div>
              </div>
            )}
            <div>
              <div style={{ color: '#059669', fontSize: '0.82rem', fontWeight: '500' }}>Designation:</div>
              <div style={{ fontSize: '0.92rem', fontWeight: '700', color: '#0f172a', marginTop: '2px' }}>{display(desigVal)}</div>
            </div>
            <div>
              <div style={{ color: '#059669', fontSize: '0.82rem', fontWeight: '500' }}>Legal Entity Type:</div>
              <div style={{ fontSize: '0.92rem', fontWeight: '700', color: '#0f172a', marginTop: '2px' }}>{display(legalType)}</div>
            </div>
            <div>
              <div style={{ color: '#059669', fontSize: '0.82rem', fontWeight: '500' }}>Business Unit:</div>
              <div style={{ fontSize: '0.92rem', fontWeight: '700', color: '#0f172a', marginTop: '2px' }}>{display(bizUnit)}</div>
            </div>
            <div>
              <div style={{ color: '#059669', fontSize: '0.82rem', fontWeight: '500' }}>Phone Number:</div>
              <div style={{ fontSize: '0.92rem', fontWeight: '700', color: '#0f172a', marginTop: '2px' }}>{display(phoneVal)}</div>
            </div>
            <div>
              <div style={{ color: '#059669', fontSize: '0.82rem', fontWeight: '500' }}>Email:</div>
              <div style={{ fontSize: '0.92rem', fontWeight: '700', color: '#0f172a', marginTop: '2px' }}>{display(emailVal)}</div>
            </div>
            <div>
              <div style={{ color: '#059669', fontSize: '0.82rem', fontWeight: '500' }}>Active Status:</div>
              <div style={{ marginTop: '4px' }}>
                <span className={`badge-pill ${isActive ? 'badge-running' : 'badge-neutral'}`}>
                  • {isActive ? 'ACTIVE' : 'INACTIVE'}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* B. ADDRESS INFORMATION */}
        <section style={{ background: '#ffffff', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '18px 20px' }}>
          <div style={{ color: '#be185d', fontSize: '0.85rem', fontWeight: '800', marginBottom: '14px', letterSpacing: '0.02em', display: 'flex', alignItems: 'center', gap: '6px' }}>
            📍 B. ADDRESS INFORMATION
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px 20px' }}>
            <div>
              <div style={{ color: '#db2777', fontSize: '0.82rem', fontWeight: '500' }}>Registered Address:</div>
              <div style={{ fontSize: '0.92rem', fontWeight: '700', color: '#0f172a', marginTop: '2px' }}>{display(regAddress)}</div>
            </div>
            <div>
              <div style={{ color: '#db2777', fontSize: '0.82rem', fontWeight: '500' }}>Communication Address:</div>
              <div style={{ fontSize: '0.92rem', fontWeight: '700', color: '#0f172a', marginTop: '2px' }}>{display(commAddress)}</div>
            </div>
            <div>
              <div style={{ color: '#db2777', fontSize: '0.82rem', fontWeight: '500' }}>PIN Code:</div>
              <div style={{ fontSize: '0.92rem', fontWeight: '700', color: '#0f172a', marginTop: '2px' }}>{display(pinVal)}</div>
            </div>
            {hasValue(geoInfo) && (
              <div>
                <div style={{ color: '#db2777', fontSize: '0.82rem', fontWeight: '500' }}>Region / Geography:</div>
                <div style={{ fontSize: '0.92rem', fontWeight: '700', color: '#0f172a', marginTop: '2px' }}>{display(geoInfo)}</div>
              </div>
            )}
          </div>
        </section>

        {/* C. BANK ACCOUNT DETAILS */}
        <section style={{ background: '#fcf8ff', borderRadius: '14px', border: '1px solid #f3e8ff', padding: '18px 20px' }}>
          <div style={{ color: '#6b21a8', fontSize: '0.85rem', fontWeight: '800', marginBottom: '14px', letterSpacing: '0.02em', display: 'flex', alignItems: 'center', gap: '6px' }}>
            💳 C. BANK ACCOUNT DETAILS
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px 24px' }}>
            <div>
              <div style={{ color: '#7c3aed', fontSize: '0.82rem', fontWeight: '500' }}>Account Holder Name:</div>
              <div style={{ fontSize: '0.95rem', fontWeight: '800', color: '#0f172a', marginTop: '2px' }}>{display(holderName)}</div>
            </div>
            <div>
              <div style={{ color: '#7c3aed', fontSize: '0.82rem', fontWeight: '500' }}>Bank Name:</div>
              <div style={{ fontSize: '0.95rem', fontWeight: '800', color: '#0f172a', marginTop: '2px' }}>{display(bankNameVal)}</div>
            </div>
            <div>
              <div style={{ color: '#7c3aed', fontSize: '0.82rem', fontWeight: '500' }}>Account Number:</div>
              <div style={{ fontSize: '0.95rem', fontWeight: '800', color: '#0f172a', marginTop: '2px' }}>{display(accNum)}</div>
            </div>
            <div>
              <div style={{ color: '#7c3aed', fontSize: '0.82rem', fontWeight: '500' }}>IFSC Code:</div>
              <div style={{ fontSize: '0.95rem', fontWeight: '800', color: '#0f172a', marginTop: '2px' }}>{display(ifscVal)}</div>
            </div>
          </div>
        </section>

        {/* D. TAX & REGISTRATION DETAILS */}
        <section style={{ background: '#fffaf0', borderRadius: '14px', border: '1px solid #fed7aa', padding: '18px 20px' }}>
          <div style={{ color: '#c2410c', fontSize: '0.85rem', fontWeight: '800', marginBottom: '14px', letterSpacing: '0.02em', display: 'flex', alignItems: 'center', gap: '6px' }}>
            📄 D. TAX & REGISTRATION DETAILS
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px 20px' }}>
            <div>
              <div style={{ color: '#ea580c', fontSize: '0.82rem', fontWeight: '500' }}>PAN Card:</div>
              <div style={{ fontSize: '0.92rem', fontWeight: '800', color: '#0f172a', marginTop: '2px' }}>{display(panVal)}</div>
            </div>
            <div>
              <div style={{ color: '#ea580c', fontSize: '0.82rem', fontWeight: '500' }}>GST Number:</div>
              <div style={{ fontSize: '0.92rem', fontWeight: '800', color: '#0f172a', marginTop: '2px' }}>{display(gstVal)}</div>
            </div>
            <div>
              <div style={{ color: '#ea580c', fontSize: '0.82rem', fontWeight: '500' }}>GST Registered:</div>
              <div style={{ fontSize: '0.92rem', fontWeight: '800', color: '#0f172a', marginTop: '2px' }}>{isGstReg ? 'YES' : 'NO'}</div>
            </div>
            <div>
              <div style={{ color: '#ea580c', fontSize: '0.82rem', fontWeight: '500' }}>MSME Number:</div>
              <div style={{ fontSize: '0.92rem', fontWeight: '800', color: '#0f172a', marginTop: '2px' }}>{display(msmeVal)}</div>
            </div>
            <div>
              <div style={{ color: '#ea580c', fontSize: '0.82rem', fontWeight: '500' }}>TDS Amount:</div>
              <div style={{ fontSize: '0.92rem', fontWeight: '800', color: '#0f172a', marginTop: '2px' }}>₹{tdsVal}</div>
            </div>
            <div>
              <div style={{ color: '#ea580c', fontSize: '0.82rem', fontWeight: '500' }}>Low TDS Certificate:</div>
              <div style={{ fontSize: '0.92rem', fontWeight: '800', color: '#0f172a', marginTop: '2px' }}>{display(lowTdsCert)}</div>
            </div>
          </div>
        </section>

        {/* E. SERVICE AREAS */}
        <section style={{ background: '#ecfeff', borderRadius: '14px', border: '1px solid #cffaff', padding: '18px 20px' }}>
          <div style={{ color: '#0e7490', fontSize: '0.85rem', fontWeight: '800', marginBottom: '12px', letterSpacing: '0.02em', display: 'flex', alignItems: 'center', gap: '6px' }}>
            🌐 E. SERVICE AREAS
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {serviceAreas.map((sa, idx) => (
              <span
                key={idx}
                style={{
                  background: '#0891b2',
                  color: '#ffffff',
                  fontSize: '0.78rem',
                  fontWeight: '800',
                  padding: '6px 14px',
                  borderRadius: '6px',
                  letterSpacing: '0.03em'
                }}
              >
                {String(sa.serviceAreaType || sa).toUpperCase()}
              </span>
            ))}
          </div>
        </section>

        {/* F. ASSIGNED MACHINES */}
        <section style={{ background: '#f0f9ff', borderRadius: '14px', border: '1px solid #e0f2fe', padding: '18px 20px' }}>
          <div style={{ color: '#0369a1', fontSize: '0.85rem', fontWeight: '800', marginBottom: '14px', letterSpacing: '0.02em', display: 'flex', alignItems: 'center', gap: '6px' }}>
            🚜 F. Assigned Machines ({machinesList.length})
          </div>
          {machinesList.length === 0 ? (
            <div style={{ color: '#64748b', fontSize: '0.85rem', fontStyle: 'italic' }}>
              No machines assigned to this vendor.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {machinesList.map((m, idx) => {
                const code = m.code || m.model_code || m.model;
                const machineNoStr = m.machineNo || m.machine_no || m.machine_chassis_no || m.serial_number || m.name || 'N/A';
                const engine = m.engineNo || m.engine_no || '';
                const mId = m.id || '';
                const statusStr = m.status ? String(m.status).toUpperCase() : 'COMMISSIONED';
                const titleStr = m.model_name || m.name || `Machine (${machineNoStr})`;

                return (
                  <div
                    key={m.id || idx}
                    style={{
                      padding: '14px 18px',
                      background: '#ffffff',
                      borderRadius: '12px',
                      border: '1px solid #bae6fd',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: '800', color: '#0284c7', fontSize: '0.95rem' }}>
                        {titleStr !== machineNoStr ? titleStr : `Machine No: ${machineNoStr}`} {code ? `(${code})` : ''}
                      </div>
                      <div style={{ marginTop: '4px', fontSize: '0.8rem', color: '#64748b' }}>
                        Machine No: <span style={{ fontWeight: '600', color: '#334155' }}>{machineNoStr}</span>
                        {engine ? <> | Engine No: <span style={{ fontWeight: '600', color: '#334155' }}>{engine}</span></> : null}
                        {mId ? <> | ID: <span style={{ fontWeight: '600', color: '#334155' }}>{mId}</span></> : null}
                      </div>
                    </div>
                    <div>
                      <span
                        style={{
                          background: statusStr === 'IDLE' ? '#f59e0b' : statusStr === 'RUNNING' || statusStr === 'ONLINE' || statusStr === 'LIVE' ? '#10b981' : '#0284c7',
                          color: '#ffffff',
                          fontSize: '0.72rem',
                          fontWeight: '800',
                          padding: '5px 12px',
                          borderRadius: '6px',
                          letterSpacing: '0.04em'
                        }}
                      >
                        {statusStr}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* G. ASSIGNED USERS */}
        <section style={{ background: '#f8fafc', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '18px 20px' }}>
          <div style={{ color: '#475569', fontSize: '0.85rem', fontWeight: '800', marginBottom: '14px', letterSpacing: '0.02em', display: 'flex', alignItems: 'center', gap: '6px' }}>
            👥 G. Assigned Users ({usersList.length})
          </div>
          {usersList.length === 0 ? (
            <div style={{ color: '#64748b', fontSize: '0.85rem', fontStyle: 'italic' }}>
              No user accounts currently linked.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {usersList.map((u, idx) => (
                <div key={u.id || idx} style={{ padding: '10px 14px', background: '#ffffff', borderRadius: '8px', border: '1px solid #cbd5e1', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 700, color: '#0f172a' }}>{display(u.name || u.username)}</div>
                    {hasValue(u.email) && <div className="page-subtitle" style={{ marginTop: 2 }}>{u.email}</div>}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    {u.designation || u.role ? <span className="badge-pill badge-purple" style={{ fontSize: '0.7rem' }}>{u.designation || u.role}</span> : null}
                    {hasValue(u.mobile || u.phone) && <div className="page-subtitle" style={{ marginTop: 4 }}>{u.mobile || u.phone}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

      </div>
    );
  };

  const currentInspectVendor = vendorDetail || selectedVendor;

  const inspectModal = selectedVendor && typeof document !== 'undefined'
    ? createPortal(
      <div className="modal-overlay" onClick={() => setSelectedVendor(null)} role="presentation">
        <div
          className="modal-card task-detail-modal"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="vendor-inspect-title"
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
            <div>
              <h2 id="vendor-inspect-title" className="page-title" style={{ fontSize: '1rem' }}>
                {display(currentInspectVendor?.partnerName || currentInspectVendor?.name)}
              </h2>
              <p className="page-subtitle" style={{ marginTop: 2 }}>
                {display(currentInspectVendor?.legalEntityType)}
                {currentInspectVendor?.contactName || currentInspectVendor?.contact_person
                  ? ` · ${currentInspectVendor.contactName || currentInspectVendor.contact_person}`
                  : ''}
              </p>
            </div>
            <button type="button" className="header-icon-btn" onClick={() => setSelectedVendor(null)} aria-label="Close">
              <LucideX size={18} />
            </button>
          </div>
          <div className="task-detail-modal-body">
            {loadingDetail && (!vendorDetail || !vendorDetail.machines) ? (
              <div style={{ padding: '32px 20px', textAlign: 'center' }}>
                <LoadingSpinner title="Loading Vendor Detail" subtitle="Fetching assigned machines and profile details..." />
              </div>
            ) : (
              renderVendorDetail(currentInspectVendor)
            )}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '12px 20px 16px', borderTop: '1px solid var(--border)' }}>
            <button type="button" className="btn-secondary" onClick={() => setSelectedVendor(null)}>Close</button>
          </div>
        </div>
      </div>,
      document.body
    )
    : null;

  return (
    <div className="screen-container">
      <PageHeader
        title="Vendors"
        subtitle="Contractor and partner organizations"
        actions={
          <button
            type="button"
            className="btn-secondary"
            onClick={() => { refreshVendor(); fetchVendors(search); }}
          >
            <LucideRefreshCw size={14} className={loading || loadingVendor ? 'animate-spin' : ''} />
            Refresh
          </button>
        }
      />

      {hasNoVendors && <NoVendorBanner />}

      {!isAdmin ? (
        loadingVendor && !activeVendor ? (
          <LoadingSpinner title="Loading vendor" subtitle="Fetching your partner profile" />
        ) : (
          <div className="app-card" style={{ padding: 16 }}>
            {renderVendorDetail(activeVendor, { machines: vendorMachines, users: vendorUsers })}
          </div>
        )
      ) : (
        <>
          <form
            className="page-toolbar"
            onSubmit={(e) => { e.preventDefault(); fetchVendors(search); }}
          >
            <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
              <LucideSearch size={15} color="#9ca3af" style={{ position: 'absolute', left: 10, top: 10 }} />
              <input
                className="field-input"
                type="search"
                placeholder="Search name, contact, phone, or email"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ width: '100%', paddingLeft: 32 }}
              />
            </div>
          </form>

          {loading ? (
            <LoadingSpinner title="Loading vendors" subtitle="Fetching partner organizations" />
          ) : filteredVendors.length === 0 ? (
            <EmptyState title="No vendors found" subtitle="Try a different search, or refresh the list." />
          ) : (
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Partner</th>
                    <th>Contact</th>
                    <th>Phone</th>
                    <th>Email</th>
                    <th>Machines</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredVendors.map((v) => (
                    <tr key={v.id || v.external_vendor_id || v.partnerName}>
                      <td>
                        <div style={{ fontWeight: 650 }}>{display(v.partnerName || v.name)}</div>
                        {v.legalEntityType ? <div className="page-subtitle">{v.legalEntityType}</div> : null}
                      </td>
                      <td>
                        <div>{display(v.contactName || v.contact_person)}</div>
                        {v.designation ? <div className="page-subtitle">{v.designation}</div> : null}
                      </td>
                      <td>{display(v.phoneNumber || v.phone)}</td>
                      <td>{display(v.email)}</td>
                      <td>{v.machines_count || v.machines?.length || v.assigned_machines?.length || 0}</td>
                      <td style={{ textAlign: 'right' }}>
                        <button type="button" className="btn-ghost" onClick={() => setSelectedVendor(v)}>
                          Inspect
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {inspectModal}
    </div>
  );
};

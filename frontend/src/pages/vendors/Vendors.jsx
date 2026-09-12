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
    const machinesList = v.machines || v.assigned_machines || extras.machines || [];
    const usersList = v.users || extras.users || [];
    const bank = v.bankAccount || {};
    const serviceAreas = v.serviceAreas || [];
    const isActive = v.isActive ?? v.is_active ?? v.active;

    return (
      <div>
        <section className="vendor-section">
          <div className="vendor-section-title">Basic information</div>
          <dl className="vendor-dl">
            <Field label="Partner">{display(v.partnerName || v.name)}</Field>
            {hasValue(v.contactName || v.contact_person) && (
              <Field label="Contact">{display(v.contactName || v.contact_person)}</Field>
            )}
            {hasValue(v.designation) && <Field label="Designation">{display(v.designation)}</Field>}
            {hasValue(v.legalEntityType) && <Field label="Legal entity">{display(v.legalEntityType)}</Field>}
            {hasValue(v.businessUnit) && <Field label="Business unit">{display(v.businessUnit)}</Field>}
            {hasValue(v.phoneNumber || v.phone) && <Field label="Phone">{display(v.phoneNumber || v.phone)}</Field>}
            {hasValue(v.email) && <Field label="Email">{display(v.email)}</Field>}
            {isActive != null && (
              <Field label="Status">
                <span className={`badge-pill ${isActive ? 'badge-running' : 'badge-neutral'}`}>
                  {isActive ? 'Active' : 'Inactive'}
                </span>
              </Field>
            )}
            {v.hddHero != null && <Field label="HDD Hero">{v.hddHero ? 'Yes' : 'No'}</Field>}
          </dl>
        </section>

        {hasValue(v.registeredAddress, v.communicationAddress, v.pinCode) && (
          <section className="vendor-section">
            <div className="vendor-section-title">Address</div>
            <dl className="vendor-dl">
              <Field label="Registered">{display(v.registeredAddress)}</Field>
              <Field label="Communication">{display(v.communicationAddress || v.registeredAddress)}</Field>
              <Field label="PIN">{display(v.pinCode)}</Field>
            </dl>
          </section>
        )}

        {hasValue(bank.accountHolderName, bank.bankName, bank.accountNumber, bank.ifscCode) && (
          <section className="vendor-section">
            <div className="vendor-section-title">Bank</div>
            <dl className="vendor-dl">
              <Field label="Account holder">{display(bank.accountHolderName)}</Field>
              <Field label="Bank">{display(bank.bankName)}</Field>
              <Field label="Account number">{display(bank.accountNumber)}</Field>
              <Field label="IFSC">{display(bank.ifscCode)}</Field>
            </dl>
          </section>
        )}

        {hasValue(v.panCard, v.gstNumber, v.gstDocUrl, v.msmeNumber, v.tdsAmount, v.lowTdsCertificateUrl) && (
          <section className="vendor-section">
            <div className="vendor-section-title">Tax & registration</div>
            <dl className="vendor-dl">
              <Field label="PAN">{display(v.panCard)}</Field>
              <Field label="GST">{display(v.gstNumber)}</Field>
              <Field label="GST registered">{v.gstDocUrl || v.gstNumber ? 'Yes' : '—'}</Field>
              <Field label="MSME">{display(v.msmeNumber)}</Field>
              <Field label="TDS">{display(v.tdsAmount)}</Field>
              <Field label="Low TDS certificate">{v.lowTdsCertificateUrl ? 'Available' : '—'}</Field>
            </dl>
          </section>
        )}

        {serviceAreas.length > 0 && (
          <section className="vendor-section">
            <div className="vendor-section-title">Service areas</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {serviceAreas.map((sa, idx) => (
                <span key={idx} className="vendor-chip">{sa.serviceAreaType || sa}</span>
              ))}
            </div>
          </section>
        )}

        {machinesList.length > 0 && (
          <section className="vendor-section">
            <div className="vendor-section-title">Machines ({machinesList.length})</div>
            {machinesList.map((m, idx) => {
              const code = m.code || m.model_code;
              const engine = m.engineNo || m.engine_no;
              return (
                <div key={m.id || idx} className="vendor-item">
                  <div>
                    <div style={{ fontWeight: 650 }}>{display(m.machineNo || m.machine_no || m.name)}</div>
                    {(code || engine) && (
                      <div className="page-subtitle" style={{ marginTop: 2 }}>
                        {[code, engine ? `Engine ${engine}` : null].filter(Boolean).join(' · ')}
                      </div>
                    )}
                  </div>
                  {m.status ? <span className="badge-pill badge-neutral">{m.status}</span> : null}
                </div>
              );
            })}
          </section>
        )}

        {usersList.length > 0 && (
          <section className="vendor-section">
            <div className="vendor-section-title">Users ({usersList.length})</div>
            {usersList.map((u, idx) => (
              <div key={u.id || idx} className="vendor-item">
                <div>
                  <div style={{ fontWeight: 650 }}>{display(u.name)}</div>
                  {hasValue(u.email) && <div className="page-subtitle" style={{ marginTop: 2 }}>{u.email}</div>}
                </div>
                <div style={{ textAlign: 'right' }}>
                  {u.designation ? <span className="badge-pill badge-neutral">{u.designation}</span> : null}
                  {hasValue(u.mobile) && <div className="page-subtitle" style={{ marginTop: 4 }}>{u.mobile}</div>}
                </div>
              </div>
            ))}
          </section>
        )}
      </div>
    );
  };

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
                {display(selectedVendor.partnerName || selectedVendor.name)}
              </h2>
              <p className="page-subtitle" style={{ marginTop: 2 }}>
                {display(selectedVendor.legalEntityType)}
                {selectedVendor.contactName || selectedVendor.contact_person
                  ? ` · ${selectedVendor.contactName || selectedVendor.contact_person}`
                  : ''}
              </p>
            </div>
            <button type="button" className="header-icon-btn" onClick={() => setSelectedVendor(null)} aria-label="Close">
              <LucideX size={18} />
            </button>
          </div>
          <div className="task-detail-modal-body">
            {renderVendorDetail(selectedVendor)}
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
                      <td>{v.machines?.length || v.assigned_machines?.length || 0}</td>
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

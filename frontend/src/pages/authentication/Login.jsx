import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { extractErrorMessage } from '../../services/api';
import { getDefaultRoute } from '../../utils/permissions';
import {
  LucideTruck,
  LucideShieldCheck,
  LucideUser,
  LucideLock,
  LucideEye,
  LucideEyeOff,
  LucideArrowRight,
  LucideActivity,
  LucideFuel,
  LucideCalendarCheck,
  LucideAlertCircle
} from 'lucide-react';
import '../../styles/globals.css';
import '../../styles/components.css';

export const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const userProfile = await login(username, password);
      const targetRoute = getDefaultRoute(
        userProfile?.permissions,
        userProfile?.is_superuser || (userProfile?.roles || []).includes('ADMIN')
      );
      navigate(targetRoute);
    } catch (err) {
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      const msg = extractErrorMessage(err);
      setError(msg || 'Invalid username/phone/ID or password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justify: 'center',
        background: 'radial-gradient(circle at 50% 30%, #0d382c 0%, #061a14 60%, #030d0a 100%)',
        padding: '24px',
        boxSizing: 'border-box',
        position: 'relative',
        overflow: 'hidden'
      }}
    >
      {/* Background Ambient Decorative Light Orbs */}
      <div
        style={{
          position: 'absolute',
          top: '-15%',
          left: '-10%',
          width: '500px',
          height: '500px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(16, 185, 129, 0.15) 0%, rgba(0,0,0,0) 70%)',
          pointerEvents: 'none'
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: '-20%',
          right: '-10%',
          width: '600px',
          height: '600px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(5, 150, 105, 0.12) 0%, rgba(0,0,0,0) 70%)',
          pointerEvents: 'none'
        }}
      />

      {/* Center Container Card */}
      <div
        style={{
          width: '100%',
          maxWidth: '1020px',
          borderRadius: '24px',
          background: 'rgba(15, 23, 42, 0.75)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(16, 185, 129, 0.25)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6), 0 0 40px rgba(16, 185, 129, 0.1)',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
          overflow: 'hidden',
          zIndex: 10
        }}
      >
        {/* Left Side: Enterprise Platform Showcase */}
        <div
          style={{
            padding: '44px 38px',
            background: 'linear-gradient(135deg, rgba(10, 45, 35, 0.9) 0%, rgba(6, 26, 20, 0.95) 100%)',
            borderRight: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            flexDirection: 'column',
            justify: 'space-between',
            gap: '32px'
          }}
        >
          <div>
            {/* Logo Badge */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
              <div
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '12px',
                  background: 'linear-gradient(135deg, #10b981 0%, #047857 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justify: 'center',
                  color: '#ffffff',
                  boxShadow: '0 4px 14px rgba(16, 185, 129, 0.4)'
                }}
              >
                <LucideTruck size={24} />
              </div>
              <div>
                <h1
                  style={{
                    fontFamily: 'Outfit, sans-serif',
                    fontSize: '1.75rem',
                    fontWeight: '800',
                    color: '#ffffff',
                    letterSpacing: '-0.02em',
                    margin: 0,
                    lineHeight: 1.1
                  }}
                >
                  HERO <span style={{ color: '#10b981' }}>WEB</span>
                </h1>
                <span style={{ fontSize: '0.72rem', color: '#6ee7b7', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  HDD & Fleet Operations
                </span>
              </div>
            </div>
          </div>

          {/* Feature Highlights Grid */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px', borderRadius: '12px', background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#ecfdf5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#059669', flexShrink: 0 }}>
                <LucideActivity size={18} />
              </div>
              <div>
                <div style={{ fontSize: '0.82rem', fontWeight: '700', color: '#f1f5f9' }}>Live Machinery Telemetry</div>
                <div style={{ fontSize: '0.73rem', color: '#94a3b8' }}>Real-time GPS, engine hours & status</div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px', borderRadius: '12px', background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563eb', flexShrink: 0 }}>
                <LucideFuel size={18} />
              </div>
              <div>
                <div style={{ fontSize: '0.82rem', fontWeight: '700', color: '#f1f5f9' }}>Refuel & Diesel Logs</div>
                <div style={{ fontSize: '0.73rem', color: '#94a3b8' }}>Site refuel entries & consumption tracking</div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px', borderRadius: '12px', background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#f5f3ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7c3aed', flexShrink: 0 }}>
                <LucideCalendarCheck size={18} />
              </div>
              <div>
                <div style={{ fontSize: '0.82rem', fontWeight: '700', color: '#f1f5f9' }}>Vendor Team & Attendance</div>
                <div style={{ fontSize: '0.73rem', color: '#94a3b8' }}>Vendor-scoped shift rosters & check-ins</div>
              </div>
            </div>
          </div>

          {/* System Status Ticker */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: '#6ee7b7', fontWeight: '600', background: 'rgba(16, 185, 129, 0.1)', padding: '8px 14px', borderRadius: '20px', border: '1px solid rgba(16, 185, 129, 0.2)', width: 'fit-content' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981', boxShadow: '0 0 8px #10b981' }} />
            System Secure & Active • Version 2.4
          </div>
        </div>

        {/* Right Side: Sign-In Form */}
        <div style={{ padding: '44px 38px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          
          <div style={{ marginBottom: '28px' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(16, 185, 129, 0.12)', border: '1px solid rgba(16, 185, 129, 0.25)', color: '#34d399', padding: '4px 12px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: '700', marginBottom: '10px' }}>
              <LucideShieldCheck size={14} /> Secure Access
            </div>
            <h3 style={{ fontSize: '1.5rem', fontFamily: 'Outfit, sans-serif', fontWeight: '800', color: '#ffffff', margin: 0 }}>
              Sign In to Account
            </h3>
            <p style={{ fontSize: '0.82rem', color: '#94a3b8', marginTop: '4px', margin: 0 }}>
              Enter your authorized user credentials to access your dashboard.
            </p>
          </div>

          {/* Error Banner */}
          {error && (
            <div
              style={{
                padding: '12px 14px',
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.4)',
                borderRadius: '10px',
                color: '#fca5a5',
                fontSize: '0.82rem',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '20px'
              }}
            >
              <LucideAlertCircle size={16} color="#ef4444" style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            
            {/* Username / Phone / Emp ID */}
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#cbd5e1', marginBottom: '6px' }}>
                Username / Phone / Employee ID
              </label>
              <div style={{ position: 'relative' }}>
                <LucideUser size={18} color="#64748b" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  placeholder="e.g. admin, 8764129290, or EMP-101"
                  style={{
                    width: '100%',
                    padding: '12px 14px 12px 40px',
                    borderRadius: '10px',
                    background: '#0f172a',
                    border: '1px solid #334155',
                    color: '#ffffff',
                    fontSize: '0.88rem',
                    outline: 'none',
                    boxSizing: 'border-box',
                    transition: 'border-color 0.2s ease, box-shadow 0.2s ease'
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = '#10b981';
                    e.target.style.boxShadow = '0 0 0 3px rgba(16, 185, 129, 0.2)';
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = '#334155';
                    e.target.style.boxShadow = 'none';
                  }}
                />
              </div>
              <span style={{ fontSize: '0.73rem', color: '#34d399', marginTop: '5px', display: 'block', fontWeight: '600' }}>
                ✦ Supports ILYNC Field Surveyors & Supervisors login via Phone / Emp ID
              </span>
            </div>

            {/* Password */}
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#cbd5e1', marginBottom: '6px' }}>
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <LucideLock size={18} color="#64748b" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  style={{
                    width: '100%',
                    padding: '12px 42px 12px 40px',
                    borderRadius: '10px',
                    background: '#0f172a',
                    border: '1px solid #334155',
                    color: '#ffffff',
                    fontSize: '0.88rem',
                    outline: 'none',
                    boxSizing: 'border-box',
                    transition: 'border-color 0.2s ease, box-shadow 0.2s ease'
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = '#10b981';
                    e.target.style.boxShadow = '0 0 0 3px rgba(16, 185, 129, 0.2)';
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = '#334155';
                    e.target.style.boxShadow = 'none';
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'transparent',
                    border: 'none',
                    color: '#64748b',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                >
                  {showPassword ? <LucideEyeOff size={18} /> : <LucideEye size={18} />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                padding: '13px',
                borderRadius: '10px',
                border: 'none',
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                color: '#ffffff',
                fontSize: '0.92rem',
                fontWeight: '700',
                cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justify: 'center',
                gap: '8px',
                boxShadow: '0 4px 16px rgba(16, 185, 129, 0.35)',
                transition: 'transform 0.15s ease, background 0.2s ease',
                marginTop: '6px'
              }}
            >
              {loading ? (
                <>
                  <span className="animate-spin" style={{ display: 'inline-block', width: '16px', height: '16px', border: '2px solid #fff', borderTopColor: 'transparent', borderRadius: '50%' }} />
                  Authenticating...
                </>
              ) : (
                <>
                  Sign In to Dashboard <LucideArrowRight size={18} />
                </>
              )}
            </button>

          </form>

          <div style={{ textAlign: 'center', marginTop: '24px', fontSize: '0.72rem', color: '#64748b' }}>
            HERO Infrastructure & HDD Operations © 2026. All rights reserved.
          </div>

        </div>
      </div>
    </div>
  );
};

export default Login;

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { extractErrorMessage } from '../../services/api';
import { getDefaultRoute } from '../../utils/permissions';
import {
  LucideAlertCircle,
  LucideUser,
  LucideLock,
  LucideEye,
  LucideEyeOff,
  LucideArrowRight
} from 'lucide-react';
import './Login.css';
import { IndiaTelecomCanvas } from '../../components/auth/IndiaTelecomCanvas';

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
      setError(extractErrorMessage(err) || 'Invalid username, phone, ID, or password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-fullscreen-container">
      {/* Animated India Telecom Network Canvas Layer */}
      <IndiaTelecomCanvas />

      {/* Subtle background tech grid & vignette */}
      <div className="login-bg-overlay" aria-hidden="true" />

      {/* Lower-left blended HDD Machinery & Telecom field crew */}
      <div className="login-machinery-backdrop" aria-hidden="true" />

      {/* Main Content Wrapper */}
      <div className="login-content-wrapper">
        {/* Left Side: Brand Hero */}
        <aside className="login-brand-hero">
          <div className="login-brand-top">
            <div className="login-brand-mark" aria-hidden="true">
              H
              <span className="login-live-pulse-dot" />
            </div>
            <div className="login-brand-title-wrap">
              <div className="login-brand-wordmark">
                HERO
              </div>
            </div>
          </div>

          <div className="login-hero-header">
            <h1 className="login-main-headline">
              Connecting India.<br />
              <span>Building what's next.</span>
            </h1>
          </div>
        </aside>

        {/* Right Side: Clean White Login Card */}
        <main className="login-white-card">
          <form onSubmit={handleSubmit} noValidate>
            <div className="login-panel-header">
              <div className="login-brand-accent-line" aria-hidden="true" />
              <h2 className="login-card-title">Welcome back</h2>
              <p className="login-card-subtitle">Sign in to HERO Operations</p>
            </div>

            {error && (
              <div className="login-card-error" role="alert">
                <LucideAlertCircle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
                <span>{error}</span>
              </div>
            )}

            <div className="login-form-group">
              <label className="login-field-label" htmlFor="login-username">Account</label>
              <div className="login-input-wrap">
                <LucideUser className="login-input-icon" size={18} aria-hidden="true" />
                <input
                  id="login-username"
                  name="username"
                  className="login-input login-input-with-icon"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  autoComplete="username"
                  placeholder="admin · 8764129290 · EMP-101"
                />
              </div>
            </div>

            <div className="login-form-group">
              <label className="login-field-label" htmlFor="login-password">Password</label>
              <div className="login-input-wrap">
                <LucideLock className="login-input-icon" size={18} aria-hidden="true" />
                <input
                  id="login-password"
                  name="password"
                  className="login-input login-input-with-icon login-input-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  placeholder="Your password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="login-eye-toggle"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <LucideEyeOff size={18} /> : <LucideEye size={18} />}
                </button>
              </div>
            </div>

            <button type="submit" className="login-submit-button" disabled={loading}>
              {loading ? 'Signing in…' : (
                <>
                  <span>Sign in</span>
                  <LucideArrowRight size={17} />
                </>
              )}
            </button>

            <div className="login-card-divider" />

            <div className="login-panel-footer">
              HERO HDD Operations · 2026
            </div>
          </form>
        </main>
      </div>
    </div>
  );
};

export default Login;

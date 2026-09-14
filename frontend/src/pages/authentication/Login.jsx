import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { extractErrorMessage } from '../../services/api';
import { getDefaultRoute } from '../../utils/permissions';
import {
  LucideActivity,
  LucideMapPin,
  LucideUsers,
  LucideAlertCircle,
  LucideUser,
  LucideLock,
  LucideEye,
  LucideEyeOff,
  LucideArrowRight
} from 'lucide-react';

const features = [
  { icon: LucideMapPin, title: 'Live GIS execution', text: 'Pits, trenches, and depth captures on map' },
  { icon: LucideActivity, title: 'Machine telemetry', text: 'GPS, engine hours, and fuel in one view' },
  { icon: LucideUsers, title: 'Crew & attendance', text: 'Vendor-scoped shifts, tasks, and approvals' },
];

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
    <div className="login-page">
      <div className="login-shell">
        <aside className="login-aside">
          <div className="login-brand">
            <div className="login-mark" aria-hidden="true">
              H
              <span className="login-mark-live" />
            </div>
            <div className="login-wordmark">
              HERO
            </div>
          </div>

          <div>
            <p className="login-kicker">Operations console</p>
            <h1 className="login-headline">Fleet work,<br />seen clearly.</h1>
            <p className="login-lead">
              Machines, trenches, attendance, and site spend — scoped to your vendor and role.
            </p>
          </div>

          <ul className="login-features">
            {features.map(({ icon: Icon, title, text }) => (
              <li key={title} className="login-feature">
                <span className="login-feature-icon"><Icon size={16} /></span>
                <div>
                  <strong>{title}</strong>
                  <span>{text}</span>
                </div>
              </li>
            ))}
          </ul>
        </aside>

        <main className="login-main">
          <form className="login-form" onSubmit={handleSubmit}>
            <h2 className="login-form-title">Sign in</h2>
            <p className="login-form-sub">Username, phone, or employee ID</p>

            {error ? (
              <div className="login-error" role="alert">
                <LucideAlertCircle size={15} />
                <span>{error}</span>
              </div>
            ) : null}

            <label className="field-label" htmlFor="login-username">Account</label>
            <div className="input-wrap">
              <LucideUser size={16} className="input-icon" />
              <input
                id="login-username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="username"
                placeholder="admin · 8764129290 · EMP-101"
              />
            </div>

            <label className="field-label" htmlFor="login-password">Password</label>
            <div className="input-wrap">
              <LucideLock size={16} className="input-icon" />
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                placeholder="Your password"
                style={{ paddingRight: 40 }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="login-eye"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <LucideEyeOff size={16} /> : <LucideEye size={16} />}
              </button>
            </div>

            <button type="submit" className="btn-primary login-submit" disabled={loading}>
              {loading ? 'Signing in…' : <>Sign in <LucideArrowRight size={16} /></>}
            </button>

            <p className="login-foot">HERO HDD operations · 2026</p>
          </form>
        </main>
      </div>
    </div>
  );
};

export default Login;

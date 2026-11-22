import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  User,
  X,
} from 'lucide-react';
import { BrandText } from '../components/BrandText';
import { LoginTopDocsCard } from '../components/docs/LoginTopDocsCard';
import { PageDocsButton } from '../components/docs/PageDocsButton';
import { SsfLogo } from '../components/SsfLogo';
import { getHomeRouteForRole, useAuth } from '../context/AuthContext';
import { useRegisterPageDocs } from '../context/DocsContext';
import { supabase } from '../lib/supabase';

export default function LoginPage() {
  const { session, login, loading, authNotice, clearAuthNotice } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const uidParam = searchParams.get('uid')?.trim() ?? '';

  const [username, setUsername] = useState<string>(uidParam);
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Forgot Password / Request Reset Modal State (plain User ID text input)
  const [resetModalOpen, setResetModalOpen] = useState<boolean>(false);
  const [resetUsername, setResetUsername] = useState<string>('');
  const [resetSubmitting, setResetSubmitting] = useState<boolean>(false);
  const [resetSuccessMsg, setResetSuccessMsg] = useState<string | null>(null);
  const [resetErrorMsg, setResetErrorMsg] = useState<string | null>(null);

  const passwordInputRef = useRef<HTMLInputElement | null>(null);

  // WhatsApp deep-link ?uid=... pre-fill + auto-focus Password
  useEffect(() => {
    if (uidParam) {
      setUsername(uidParam);
      window.setTimeout(() => {
        passwordInputRef.current?.focus();
      }, 40);
    }
  }, [uidParam]);

  useRegisterPageDocs(session ? null : 'login', {
    theme: 'plum',
    mode: 'inline-top',
    suspendAutoOpen: Boolean(session) || resetModalOpen,
  });

  if (session) {
    if (session.must_change_password) {
      return <Navigate to="/setup-password" replace />;
    }
    return <Navigate to={getHomeRouteForRole(session.role)} replace />;
  }

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    clearAuthNotice();

    const trimmedUser = username.trim();
    const trimmedPass = password.trim();

    if (!trimmedUser || !trimmedPass) {
      setError('User ID and password are required.');
      return;
    }

    const res = await login(trimmedUser, trimmedPass);
    if (res.ok && res.role) {
      if (res.must_change_password) {
        navigate('/setup-password', { replace: true });
      } else {
        navigate(getHomeRouteForRole(res.role), { replace: true });
      }
      return;
    }

    setError(res.error ?? 'Invalid credentials. Please try again.');
  };

  const openResetModal = () => {
    setResetModalOpen(true);
    setResetSuccessMsg(null);
    setResetErrorMsg(null);
    setResetUsername(username.trim());
  };

  const handleRequestReset = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setResetErrorMsg(null);
    setResetSuccessMsg(null);

    const target = resetUsername.trim();
    if (!target) {
      setResetErrorMsg('Please enter your Sector or Unit User ID.');
      return;
    }

    setResetSubmitting(true);
    try {
      const { data, error: rpcError } = await supabase.rpc(
        'request_password_reset',
        { p_username: target }
      );
      if (rpcError) {
        setResetErrorMsg(
          rpcError.message || 'Unable to submit reset request.'
        );
        return;
      }
      const res = data as { success?: boolean; message?: string } | null;
      setResetSuccessMsg(
        res?.message || 'Password reset request sent to Division Admin.'
      );
    } catch (err) {
      setResetErrorMsg(
        err instanceof Error ? err.message : 'Unable to submit reset request.'
      );
    } finally {
      setResetSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-transparent flex flex-col items-center justify-center px-4 pt-14 pb-8 sm:p-6 sm:pt-16 text-ink-900">
      {/* Top-Right Docs Toggle Button */}
      <div className="fixed top-[max(0.75rem,env(safe-area-inset-top))] right-3 sm:top-5 sm:right-5 z-40">
        <PageDocsButton
          theme="plum"
          pageKey="login"
          action="toggle"
          labelBreakpoint="sm"
        />
      </div>

      {/* Mode A: Non-Blocking Top Malayalam Docs Card */}
      <LoginTopDocsCard />

      {/* Centered SSF Logo Squircle Badge */}
      <Link
        to="/"
        title="Go to Leaderboard"
        className="w-16 h-16 rounded-2xl glass-card flex items-center justify-center mb-3 hover:scale-105 transition-transform"
      >
        <SsfLogo className="h-8 w-auto" />
      </Link>

      {/* Brand Title */}
      <div className="text-center mb-6">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-plum-950 tracking-tight">
          <BrandText text="SSF Wandoor Division" />
        </h1>
        <p className="text-xs sm:text-sm text-ink-600 mt-1">
          Payasam Challenge Portal
        </p>
      </div>

      {/* Plum & Milk Glass Auth Card */}
      <div className="w-full max-w-[430px] glass-card rounded-3xl p-6 sm:p-8 space-y-5">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-plum-950 leading-tight">
            Sign in
          </h2>
          <p className="text-xs sm:text-sm text-ink-600 mt-1">
            Enter your User ID and password to continue.
          </p>
        </div>

        {authNotice && !error && (
          <div
            role="status"
            className="text-xs font-medium text-vibrant-amber bg-vibrant-amberSoft/70 border border-vibrant-amber/30 rounded-xl px-3.5 py-2.5 flex items-center gap-2"
          >
            <AlertCircle className="w-4 h-4 shrink-0 text-vibrant-amber" />
            <span>{authNotice}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Plain User ID Field */}
          <div>
            <label
              htmlFor="login-user-id"
              className="block text-xs font-semibold text-ink-900 mb-1.5"
            >
              User ID
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-ink-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="login-user-id"
                name="username"
                type="text"
                autoComplete="username"
                placeholder="Enter your User ID"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  if (error) setError(null);
                }}
                disabled={loading}
                className="w-full pl-10 pr-4 py-2.5 sm:py-3 text-sm rounded-xl border border-milk-border bg-white/90 text-ink-900 placeholder:text-ink-400 focus:bg-white transition-all font-medium"
              />
            </div>
          </div>

          {/* Password Field */}
          <div>
            <label
              htmlFor="login-password"
              className="block text-xs font-semibold text-ink-900 mb-1.5"
            >
              Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-ink-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                ref={passwordInputRef}
                id="login-password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError(null);
                }}
                disabled={loading}
                className="w-full pl-10 pr-10 py-2.5 sm:py-3 text-sm rounded-xl border border-milk-border bg-white/90 text-ink-900 placeholder:text-ink-400 focus:bg-white transition-all font-medium"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                tabIndex={-1}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 hover:text-plum-900 transition-colors p-1"
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          {/* Error Alert */}
          {error && (
            <div
              role="alert"
              className="text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3.5 py-2.5 flex items-center gap-2"
            >
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading || !username.trim() || !password.trim()}
            className="w-full py-3 px-4 rounded-xl text-sm font-semibold text-white glass-plum hover:opacity-95 disabled:opacity-50 transition-opacity flex items-center justify-center gap-2"
          >
            <span>{loading ? 'Signing in...' : 'Sign in'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        {/* Forgot Password + Public Link */}
        <div className="pt-1 space-y-2.5 text-center border-t border-milk-border/70">
          <button
            type="button"
            onClick={openResetModal}
            className="text-xs font-semibold text-plum-900 hover:text-plum-950 hover:underline inline-flex items-center gap-1.5 pt-2"
          >
            <KeyRound className="w-3.5 h-3.5" />
            Forgot password? Request reset
          </button>

          <div>
            <Link
              to="/"
              className="text-xs font-medium text-ink-600 hover:text-plum-900 hover:underline inline-flex items-center gap-1"
            >
              Public Leaderboard? View Live Challenge
            </Link>
          </div>
        </div>
      </div>

      {/* Password Reset Request Modal (Plain User ID Input) */}
      {resetModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-plum-950/45 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reset-modal-title"
        >
          <div className="w-full max-w-md glass-card bg-white/95 rounded-3xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3
                  id="reset-modal-title"
                  className="text-base font-bold text-plum-950"
                >
                  Request Password Reset
                </h3>
                <p className="text-xs text-ink-600 mt-0.5">
                  Enter your Sector or Unit User ID. Division Admin will reset
                  your password and send updated credentials.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setResetModalOpen(false)}
                aria-label="Close modal"
                className="p-1.5 rounded-full text-ink-600 hover:text-plum-900 hover:bg-milk-100 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleRequestReset} className="space-y-3.5">
              <div>
                <label
                  htmlFor="reset-username-input"
                  className="block text-xs font-semibold text-ink-900 mb-1"
                >
                  Sector or Unit User ID
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-ink-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="reset-username-input"
                    type="text"
                    required
                    placeholder="Enter your Sector or Unit User ID"
                    value={resetUsername}
                    onChange={(e) => setResetUsername(e.target.value)}
                    disabled={resetSubmitting}
                    className="w-full pl-9 pr-3 py-2.5 text-sm rounded-xl border border-milk-border bg-white text-ink-900"
                  />
                </div>
              </div>

              {resetErrorMsg && (
                <div className="text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{resetErrorMsg}</span>
                </div>
              )}

              {resetSuccessMsg && (
                <div className="text-xs font-medium text-teal-800 bg-teal-50 border border-teal-200 rounded-xl px-3 py-2 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-teal-600" />
                  <span>{resetSuccessMsg}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setResetModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-ink-600 hover:bg-milk-100 border border-milk-border transition-colors"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={resetSubmitting || !resetUsername.trim()}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-white glass-plum hover:opacity-95 disabled:opacity-50 transition-opacity"
                >
                  {resetSubmitting ? 'Sending...' : 'Send Reset Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

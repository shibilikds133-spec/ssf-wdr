import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  Lock,
  LogOut,
  ShieldCheck,
  User,
} from 'lucide-react';
import { BrandText } from '../components/BrandText';
import { PageDocsButton } from '../components/docs/PageDocsButton';
import { SsfLogo } from '../components/SsfLogo';
import { getHomeRouteForRole, useAuth } from '../context/AuthContext';
import { useRegisterPageDocs } from '../context/DocsContext';

export default function FirstLoginSetupPage() {
  const { session, completeFirstLogin, logout } = useAuth();
  const navigate = useNavigate();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [newUsername, setNewUsername] = useState(session?.username ?? '');
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSetupActive = Boolean(session && session.must_change_password);
  useRegisterPageDocs(isSetupActive ? 'setup_password' : null, {
    theme: 'plum',
    suspendAutoOpen: !isSetupActive,
  });

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (!session.must_change_password) {
    return <Navigate to={getHomeRouteForRole(session.role)} replace />;
  }

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    const trimmedPass = newPassword.trim();
    const trimmedConfirm = confirmPassword.trim();
    const trimmedUser = newUsername.trim();

    if (trimmedPass.length < 6) {
      setError('New password must be at least 6 characters.');
      return;
    }

    if (trimmedPass.toUpperCase() === session.login_code.toUpperCase()) {
      setError('New password cannot be the same as your default code.');
      return;
    }

    if (trimmedPass !== trimmedConfirm) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      const optionalUsername =
        trimmedUser && trimmedUser !== session.username
          ? trimmedUser
          : undefined;
      const res = await completeFirstLogin(trimmedPass, optionalUsername);
      if (!res.ok) {
        setError(res.error ?? 'Unable to save new password.');
        return;
      }
      navigate(getHomeRouteForRole(res.role ?? session.role), {
        replace: true,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-[100dvh] bg-transparent flex flex-col items-center justify-center pl-[calc(1rem+env(safe-area-inset-left,0px))] pr-[calc(1rem+env(safe-area-inset-right,0px))] pt-[calc(3.5rem+env(safe-area-inset-top,0px))] pb-[calc(2rem+env(safe-area-inset-bottom,0px))] sm:pl-[calc(1.5rem+env(safe-area-inset-left,0px))] sm:pr-[calc(1.5rem+env(safe-area-inset-right,0px))] sm:pt-[calc(4rem+env(safe-area-inset-top,0px))] sm:pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] text-ink-900">
      <div className="fixed top-[calc(0.75rem+env(safe-area-inset-top,0px))] right-[calc(0.75rem+env(safe-area-inset-right,0px))] sm:top-[calc(1.25rem+env(safe-area-inset-top,0px))] sm:right-[calc(1.25rem+env(safe-area-inset-right,0px))] z-40">
        <PageDocsButton
          theme="plum"
          pageKey="setup_password"
          labelBreakpoint="sm"
        />
      </div>

      <div className="w-16 h-16 rounded-2xl glass-card flex items-center justify-center mb-3">
        <SsfLogo className="h-8 w-auto" />
      </div>

      <div className="text-center mb-6">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-plum-950 tracking-tight">
          <BrandText text="SSF Wandoor Division" />
        </h1>
        <p className="text-xs sm:text-sm text-ink-600 mt-1">
          First-Login Security Setup
        </p>
      </div>

      <div className="w-full max-w-[440px] glass-card rounded-3xl p-6 sm:p-8 space-y-5">
        <div className="bg-vibrant-amberSoft/70 border border-vibrant-amber/30 rounded-2xl p-3.5 flex items-start gap-2.5">
          <ShieldCheck className="w-5 h-5 text-vibrant-amber shrink-0 mt-0.5" />
          <div className="text-xs text-ink-900 leading-relaxed">
            <span className="font-bold block">
              Welcome, <BrandText text={session.name} />.
            </span>
            You must set a new password before continuing.
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* New Password */}
          <div>
            <label
              htmlFor="setup-new-password"
              className="block text-xs font-semibold text-ink-900 mb-1.5"
            >
              New Password *
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-ink-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="setup-new-password"
                type={showNew ? 'text' : 'password'}
                required
                minLength={6}
                placeholder="At least 6 characters"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={submitting}
                className="w-full pl-10 pr-10 py-2.5 text-sm rounded-xl border border-milk-border bg-white/90 text-ink-900"
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowNew((prev) => !prev)}
                aria-label={showNew ? 'Hide password' : 'Show password'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 hover:text-plum-900 p-1"
              >
                {showNew ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          {/* Confirm New Password */}
          <div>
            <label
              htmlFor="setup-confirm-password"
              className="block text-xs font-semibold text-ink-900 mb-1.5"
            >
              Confirm New Password *
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-ink-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="setup-confirm-password"
                type={showConfirm ? 'text' : 'password'}
                required
                minLength={6}
                placeholder="Re-enter new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={submitting}
                className="w-full pl-10 pr-10 py-2.5 text-sm rounded-xl border border-milk-border bg-white/90 text-ink-900"
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowConfirm((prev) => !prev)}
                aria-label={showConfirm ? 'Hide password' : 'Show password'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 hover:text-plum-900 p-1"
              >
                {showConfirm ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          {/* Optional User ID */}
          <div>
            <label
              htmlFor="setup-username"
              className="block text-xs font-semibold text-ink-900 mb-1.5"
            >
              User ID (Optional)
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-ink-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="setup-username"
                type="text"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                disabled={submitting}
                className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl border border-milk-border bg-white/90 text-ink-900"
              />
            </div>
            <p className="text-[11px] text-ink-600 mt-1">
              Keep as is, or customize your login User ID.
            </p>
          </div>

          {error && (
            <div
              role="alert"
              className="text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3.5 py-2.5 flex items-center gap-2"
            >
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 px-4 rounded-xl text-sm font-semibold text-white glass-plum hover:opacity-95 disabled:opacity-50 transition-opacity flex items-center justify-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>
              {submitting ? 'Saving...' : 'Save Password & Continue'}
            </span>
          </button>
        </form>

        <div className="pt-2 border-t border-milk-border/70 text-center">
          <button
            type="button"
            onClick={handleLogout}
            className="text-xs font-semibold text-ink-600 hover:text-vibrant-coral inline-flex items-center gap-1.5 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            Logout &amp; switch account
          </button>
        </div>
      </div>
    </div>
  );
}

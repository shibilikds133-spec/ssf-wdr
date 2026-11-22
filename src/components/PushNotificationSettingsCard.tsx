import { useCallback, useEffect, useState } from 'react';
import {
  Bell,
  BellOff,
  CheckCircle2,
  Loader2,
  Megaphone,
  RefreshCw,
  Send,
  Settings2,
  Smartphone,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { DOCS_THEME_STYLES, type DocsPortalTheme } from '../utils/docsConfig';
import {
  getAdminAutoUpdatePushEnabled,
  getAppBuildVersion,
  getDeviceNotificationGuide,
  getExistingPushSubscription,
  getNotificationPermission,
  getVapidPublicKey,
  isIosNonStandalone,
  isPushSupported,
  resolveVapidPublicKey,
  sendTestPush,
  setAdminAutoUpdatePushEnabled,
  subscribePushUiState,
  subscribeToPush,
  triggerAppUpdatePush,
  unsubscribeFromPush,
  watchNotificationPermissionChange,
} from '../utils/pushNotifications';

interface PushNotificationSettingsCardProps {
  portal: 'ADMIN' | 'SECTOR' | 'UNIT';
}

const PORTAL_META: Record<
  'ADMIN' | 'SECTOR' | 'UNIT',
  {
    theme: DocsPortalTheme;
    cardClass: string;
    primaryBtn: string;
    secondaryBtn: string;
    subtitle: string;
    toggleActiveBg: string;
  }
> = {
  ADMIN: {
    theme: 'plum',
    cardClass: 'glass-card',
    primaryBtn: 'glass-plum text-white hover:opacity-95',
    secondaryBtn:
      'border border-milk-border bg-white/90 text-plum-950 hover:bg-white',
    subtitle:
      'ഓരോ 50 ഡിവിഷൻ ഓർഡർ മൈൽസ്റ്റോണുകളും ആപ്പ് അപ്‌ഡേറ്റുകളും തൽക്ഷണം ലഭിക്കും.',
    toggleActiveBg: 'bg-plum-900',
  },
  SECTOR: {
    theme: 'forest',
    cardClass: 'glass-leaf-card',
    primaryBtn: 'glass-forest text-white hover:opacity-95',
    secondaryBtn:
      'border border-leaf-border bg-white/90 text-forest-950 hover:bg-white',
    subtitle:
      'സെക്ടറിലെ ഓരോ 10 ഓർഡർ മൈൽസ്റ്റോണുകളും ആപ്പ് അപ്‌ഡേറ്റുകളും തൽക്ഷണം ലഭിക്കും.',
    toggleActiveBg: 'bg-forest-900',
  },
  UNIT: {
    theme: 'orange',
    cardClass: 'glass-cream-card',
    primaryBtn: 'glass-orange text-white hover:opacity-95',
    secondaryBtn:
      'border border-cream-border bg-white/90 text-[#261812] hover:bg-white',
    subtitle:
      'യൂണിറ്റിലെ ഓരോ 10 ഓർഡറുകളും (പോർട്ടലിലും പബ്ലിക് പേജിലും) ആപ്പ് അപ്‌ഡേറ്റുകളും ലഭിക്കും.',
    toggleActiveBg: 'bg-[#EC5E27]',
  },
};

export function PushNotificationSettingsCard({
  portal,
}: PushNotificationSettingsCardProps) {
  const { session } = useAuth();
  const meta = PORTAL_META[portal];
  const styles = DOCS_THEME_STYLES[meta.theme];
  const sessionToken = session?.token || session?.code || '';

  const [supported] = useState(() => isPushSupported());
  const [iosNeedsInstall] = useState(() => isIosNonStandalone());
  const [hasVapid, setHasVapid] = useState(() => Boolean(getVapidPublicKey()));
  const [permission, setPermission] = useState(() =>
    getNotificationPermission()
  );
  const [subscribed, setSubscribed] = useState(false);
  const [loadingSub, setLoadingSub] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [testing, setTesting] = useState(false);

  // Admin app update broadcast state
  const [autoUpdatePush, setAutoUpdatePush] = useState(() =>
    getAdminAutoUpdatePushEnabled()
  );
  const [customUpdateMsg, setCustomUpdateMsg] = useState('');
  const [broadcasting, setBroadcasting] = useState(false);

  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const buildVersion = getAppBuildVersion();

  const refreshState = useCallback(async () => {
    setPermission(getNotificationPermission());
    setAutoUpdatePush(getAdminAutoUpdatePushEnabled());
    if (!supported || iosNeedsInstall) {
      setSubscribed(false);
      setLoadingSub(false);
      return;
    }
    const existing = await getExistingPushSubscription();
    setSubscribed(
      Boolean(existing) && getNotificationPermission() === 'granted'
    );
    setLoadingSub(false);
  }, [supported, iosNeedsInstall]);

  useEffect(() => {
    void refreshState();
    if (!hasVapid) {
      void resolveVapidPublicKey().then((key) => {
        if (key) setHasVapid(true);
      });
    }
    const unsubUi = subscribePushUiState(() => {
      void refreshState();
    });
    const unsubPerm = watchNotificationPermissionChange(() => {
      void refreshState();
    });
    return () => {
      unsubUi();
      unsubPerm();
    };
  }, [refreshState, hasVapid]);

  const handleToggle = async () => {
    if (toggling) return;
    setFeedback(null);
    setToggling(true);

    if (subscribed) {
      const res = await unsubscribeFromPush({ userInitiated: true });
      await refreshState();
      setToggling(false);
      if (res.ok) {
        setFeedback({
          type: 'success',
          text: 'ഈ ഉപകരണത്തിലെ പുഷ് നോട്ടിഫിക്കേഷൻ ഓഫ് ചെയ്തു.',
        });
      } else {
        setFeedback({
          type: 'error',
          text: res.error || 'നോട്ടിഫിക്കേഷൻ ഓഫ് ചെയ്യാൻ കഴിഞ്ഞില്ല.',
        });
      }
      return;
    }

    const res = await subscribeToPush(sessionToken);
    await refreshState();
    setToggling(false);

    if (res.ok) {
      setFeedback({
        type: 'success',
        text: 'പുഷ് നോട്ടിഫിക്കേഷനുകൾ വിജയകരമായി ഓൺ ചെയ്തു!',
      });
    } else {
      setFeedback({
        type: 'error',
        text: res.error || 'നോട്ടിഫിക്കേഷൻ ഓൺ ചെയ്യാൻ കഴിഞ്ഞില്ല.',
      });
    }
  };

  const handleSendTest = async () => {
    if (testing || !subscribed) return;
    setFeedback(null);
    setTesting(true);
    const res = await sendTestPush(sessionToken);
    setTesting(false);
    if (res.ok) {
      setFeedback({
        type: 'success',
        text: 'ടെസ്റ്റ് നോട്ടിഫിക്കേഷൻ അയച്ചു — ഏതാനും നിമിഷങ്ങൾക്കുള്ളിൽ ലഭിക്കും.',
      });
    } else {
      setFeedback({
        type: 'error',
        text: res.error || 'ടെസ്റ്റ് നോട്ടിഫിക്കേഷൻ അയക്കാൻ കഴിഞ്ഞില്ല.',
      });
    }
  };

  const handleToggleAutoUpdate = () => {
    const next = !autoUpdatePush;
    setAdminAutoUpdatePushEnabled(next);
    setAutoUpdatePush(next);
  };

  const handleManualUpdateBroadcast = async () => {
    if (broadcasting || !sessionToken) return;
    setFeedback(null);
    setBroadcasting(true);
    const res = await triggerAppUpdatePush(sessionToken, {
      version: buildVersion,
      force: true,
      customMessage: customUpdateMsg.trim() || undefined,
    });
    setBroadcasting(false);

    if (res.ok) {
      setCustomUpdateMsg('');
      setFeedback({
        type: 'success',
        text: `എല്ലാ ഉപയോക്താക്കൾക്കും അപ്‌ഡേറ്റ് സന്ദേശം അയച്ചു (അയച്ചത്: ${res.sent ?? 0}, പരാജയപ്പെട്ടത്: ${res.failed ?? 0}).`,
      });
    } else {
      setFeedback({
        type: 'error',
        text: res.error || 'അപ്‌ഡേറ്റ് നോട്ടിഫിക്കേഷൻ അയക്കാൻ കഴിഞ്ഞില്ല.',
      });
    }
  };

  const isBlocked = permission === 'denied';
  const statusLabel = !supported || !hasVapid
    ? 'ലഭ്യമല്ല'
    : isBlocked
    ? 'ബ്ലോക്ക് ചെയ്തു'
    : subscribed
    ? 'ഓൺ ആണ്'
    : 'ഓഫ് ആണ്';

  const statusBadgeClass = !supported || !hasVapid
    ? 'bg-black/5 text-ink-600 border border-black/10'
    : isBlocked
    ? 'bg-rose-50 text-rose-800 border border-rose-200'
    : subscribed
    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
    : 'bg-amber-50 text-amber-900 border border-amber-200';

  return (
    <section
      aria-label="Push Notifications Settings"
      className={`${meta.cardClass} rounded-2xl p-4 sm:p-5 space-y-3.5`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div
            className={`w-10 h-10 rounded-xl ${styles.iconBadge} flex items-center justify-center shrink-0 shadow-sm`}
          >
            {subscribed ? (
              <Bell className="w-5 h-5" />
            ) : (
              <BellOff className="w-5 h-5" />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3
                className={`font-ml text-sm sm:text-base font-bold ${styles.headingText}`}
              >
                പുഷ് നോട്ടിഫിക്കേഷനുകൾ
              </h3>
              <span
                className={`font-ml inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${statusBadgeClass}`}
              >
                {loadingSub ? 'പരിശോധിക്കുന്നു...' : statusLabel}
              </span>
            </div>
            <p className={`font-ml text-xs mt-1 ${styles.bodyText}`}>
              {meta.subtitle}
            </p>
          </div>
        </div>
      </div>

      {iosNeedsInstall && (
        <div
          className={`rounded-xl px-3.5 py-2.5 flex items-start gap-2.5 ${styles.tipStrip}`}
        >
          <Smartphone className="w-4 h-4 shrink-0 mt-0.5" />
          <p className="font-ml text-xs font-medium">
            ഐഫോണിൽ നോട്ടിഫിക്കേഷൻ ലഭിക്കാൻ ആദ്യം Safari-യിലെ &apos;Add to Home Screen&apos; വഴി ആപ്പ് ഇൻസ്റ്റാൾ ചെയ്യുക.
          </p>
        </div>
      )}

      {isBlocked && !iosNeedsInstall && (() => {
        const guide = getDeviceNotificationGuide();
        return (
          <div className="rounded-xl px-3.5 py-3 bg-rose-50/90 border border-rose-200 text-rose-950 space-y-2">
            <div className="flex items-center gap-1.5 font-ml text-xs font-bold">
              <Settings2 className="w-4 h-4 text-rose-700 shrink-0" />
              <span>സിസ്റ്റം / ബ്രൗസർ നോട്ടിഫിക്കേഷൻ ബ്ലോക്ക് ചെയ്തിരിക്കുകയാണ് ({guide.platformLabel})</span>
            </div>
            <ol className="font-ml text-[11px] sm:text-xs space-y-1 list-decimal list-inside text-rose-900">
              {guide.steps.map((step, idx) => (
                <li key={idx}>{step}</li>
              ))}
            </ol>
          </div>
        );
      })()}

      {!iosNeedsInstall && supported && hasVapid && (
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            disabled={toggling || loadingSub}
            onClick={() => void handleToggle()}
            className={`${
              subscribed ? meta.secondaryBtn : meta.primaryBtn
            } font-ml px-4 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 shadow-sm transition-opacity disabled:opacity-50`}
          >
            {toggling ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
            ) : subscribed ? (
              <BellOff className="w-3.5 h-3.5 shrink-0" />
            ) : isBlocked ? (
              <RefreshCw className="w-3.5 h-3.5 shrink-0" />
            ) : (
              <Bell className="w-3.5 h-3.5 shrink-0" />
            )}
            <span>
              {subscribed
                ? 'നോട്ടിഫിക്കേഷൻ ഓഫ് ചെയ്യുക'
                : isBlocked
                ? 'Allow ചെയ്തു — വീണ്ടും ശ്രമിക്കുക'
                : 'നോട്ടിഫിക്കേഷൻ ഓൺ ചെയ്യുക'}
            </span>
          </button>

          <button
            type="button"
            disabled={!subscribed || testing || toggling}
            onClick={() => void handleSendTest()}
            className={`${meta.secondaryBtn} font-ml px-4 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors disabled:opacity-45`}
          >
            {testing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
            ) : (
              <Send className="w-3.5 h-3.5 shrink-0" />
            )}
            <span>ടെസ്റ്റ് നോട്ടിഫിക്കേഷൻ അയക്കുക</span>
          </button>
        </div>
      )}

      {portal === 'ADMIN' && (
        <div className="pt-3 border-t border-milk-border/80 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className={`font-ml text-xs font-bold ${styles.headingText}`}>
                പുതിയ അപ്‌ഡേറ്റ് വരുമ്പോൾ ഓട്ടോമാറ്റിക് പുഷ് അയക്കുക
              </p>
              <p className="text-[11px] text-ink-600 mt-0.5 num">
                Build Version: {buildVersion}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={autoUpdatePush}
              aria-label="പുതിയ അപ്‌ഡേറ്റ് വരുമ്പോൾ ഓട്ടോമാറ്റിക് പുഷ് അയക്കുക"
              onClick={handleToggleAutoUpdate}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                autoUpdatePush ? meta.toggleActiveBg : 'bg-ink-400/40'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  autoUpdatePush ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={customUpdateMsg}
              onChange={(e) => setCustomUpdateMsg(e.target.value)}
              disabled={broadcasting}
              placeholder="അപ്‌ഡേറ്റ് സന്ദേശം (ഓപ്ഷണൽ)"
              className="flex-1 px-3 py-2 text-xs font-ml rounded-xl border border-milk-border bg-white/90 text-[#210B1D] placeholder:text-ink-400"
            />
            <button
              type="button"
              disabled={broadcasting}
              onClick={() => void handleManualUpdateBroadcast()}
              className={`${meta.primaryBtn} font-ml px-4 py-2 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5 shadow-sm transition-opacity disabled:opacity-60 shrink-0`}
            >
              {broadcasting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
              ) : (
                <Megaphone className="w-3.5 h-3.5 shrink-0" />
              )}
              <span>അപ്‌ഡേറ്റ് നോട്ടിഫിക്കേഷൻ എല്ലാവർക്കും അയക്കുക</span>
            </button>
          </div>
        </div>
      )}

      {feedback && (
        <div
          role="status"
          className={`rounded-xl px-3.5 py-2 text-xs font-ml font-medium flex items-center gap-2 ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border border-rose-200 text-rose-900'
          }`}
        >
          {feedback.type === 'success' && (
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}
    </section>
  );
}

export default PushNotificationSettingsCard;

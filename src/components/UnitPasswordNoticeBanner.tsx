import { useEffect, useState } from 'react';
import { AlertCircle, X } from 'lucide-react';

const NOTICE_STORAGE_KEY = 'wdr_unit_pwd_notice_dismissed_v1';

// Strict 1-day (24-hour) display window:
// Active from 2026-11-23T19:20:00+05:30 until 2026-11-24T19:30:00+05:30 (24 hours)
const NOTICE_START_MS = Date.parse('2026-11-23T00:00:00+05:30');
const NOTICE_EXPIRY_MS = Date.parse('2026-11-24T19:30:00+05:30');

const NOTICE_MALAYALAM_TEXT =
  'ശ്രദ്ധിക്കുക: യൂണിറ്റ് പോർട്ടലിന്റെ പാസ്വേഡ് മാറ്റിയിട്ടുണ്ട് — നിങ്ങളുടെ യൂണിറ്റ് ഓർഡർ കോഡ് തന്നെയാണ് നിലവിലെ ലോഗിൻ പാസ്വേഡ്.';

function isWithinNoticeWindow(nowMs = Date.now()): boolean {
  return nowMs >= NOTICE_START_MS && nowMs <= NOTICE_EXPIRY_MS;
}

function isNoticeDismissed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(NOTICE_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

interface UnitPasswordNoticeBannerProps {
  variant?: 'login' | 'unit';
  className?: string;
}

export function UnitPasswordNoticeBanner({
  variant = 'unit',
  className = '',
}: UnitPasswordNoticeBannerProps) {
  const [visible, setVisible] = useState<boolean>(() => {
    if (!isWithinNoticeWindow()) return false;
    return !isNoticeDismissed();
  });

  useEffect(() => {
    if (!visible) return;
    const now = Date.now();
    if (!isWithinNoticeWindow(now)) {
      setVisible(false);
      return;
    }
    const remainingMs = NOTICE_EXPIRY_MS - now;
    if (remainingMs <= 0) {
      setVisible(false);
      return;
    }
    // Automatically hide when the 3-day window expires
    const timeoutDelay = Math.min(remainingMs + 250, 2_147_483_647);
    const timer = window.setTimeout(() => {
      setVisible(false);
    }, timeoutDelay);
    return () => window.clearTimeout(timer);
  }, [visible]);

  if (!visible) {
    return null;
  }

  const handleDismiss = () => {
    try {
      window.localStorage.setItem(NOTICE_STORAGE_KEY, '1');
    } catch {
      // Ignore storage access errors in private mode
    }
    setVisible(false);
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className={`w-full ${
        variant === 'login' ? 'max-w-[430px] mb-3.5' : ''
      } ${className}`.trim()}
    >
      <div className="relative overflow-hidden rounded-2xl bg-white/85 backdrop-blur-md border border-red-500/25 shadow-xs px-3.5 py-2.5 sm:px-4 sm:py-3 flex items-start gap-2.5 transform-gpu">
        <span className="w-6 h-6 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center shrink-0 mt-0.5">
          <AlertCircle className="w-3.5 h-3.5 text-red-600" />
        </span>

        <p
          lang="ml"
          className="flex-1 min-w-0 font-ml text-xs sm:text-[13px] font-semibold text-red-600 leading-relaxed"
        >
          {NOTICE_MALAYALAM_TEXT}
        </p>

        <button
          type="button"
          onClick={handleDismiss}
          aria-label="അറിയിപ്പ് ഒഴിവാക്കുക"
          title="Dismiss notice"
          className="w-6 h-6 rounded-full text-red-600/80 hover:text-red-700 hover:bg-red-500/10 flex items-center justify-center shrink-0 transition-colors -mr-1 -mt-0.5"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

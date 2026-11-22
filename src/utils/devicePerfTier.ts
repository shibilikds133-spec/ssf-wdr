/**
 * Lightweight (< 1 KB) zero-dependency hardware tier detector.
 * Executed once at startup in main.tsx to toggle `.perf-lite` on <html>
 * so low-RAM / budget Android phones stay locked at 60fps while keeping
 * the signature Deep Crimson + Rose-Milk frosted glass aesthetic.
 */
export function initDevicePerfTier(): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return false;
  }

  const nav = navigator as Navigator & {
    deviceMemory?: number;
    connection?: { saveData?: boolean };
  };

  const cores = nav.hardwareConcurrency || 4;
  const memory = nav.deviceMemory || 4;
  const reducedMotion =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const saveData = Boolean(nav.connection?.saveData);

  const isLiteDevice = reducedMotion || saveData || cores <= 4 || memory <= 4;

  if (isLiteDevice) {
    document.documentElement.classList.add('perf-lite');
  }

  return isLiteDevice;
}

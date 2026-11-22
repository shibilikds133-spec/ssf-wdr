export const WHATSAPP_MAX_URI_LENGTH = 3800;

export interface WhatsAppDeliveryResult {
  method: 'wa_url' | 'web_share' | 'clipboard_fallback';
  encodedLength: number;
  message: string;
}

/**
 * Deliver a formatted WhatsApp report reliably across Mobile PWA, iOS Safari, and Desktop:
 * - `<= 3,800` URI-encoded chars: opens `https://wa.me/?text=...` directly
 * - `> 3,800` URI-encoded chars (e.g. 92-unit detailed reports): attempts Web Share API
 *   for untruncated WhatsApp sharing, or copies full text to clipboard and opens `wa.me`.
 */
export async function deliverWhatsAppReport(
  message: string,
  title = 'SSF Wandoor Division Report'
): Promise<WhatsAppDeliveryResult> {
  const encoded = encodeURIComponent(message);
  const encodedLength = encoded.length;

  if (encodedLength <= WHATSAPP_MAX_URI_LENGTH) {
    const waUrl = `https://wa.me/?text=${encoded}`;
    openExternalWhatsAppUrl(waUrl);
    return { method: 'wa_url', encodedLength, message };
  }

  // Long message safety: prefer navigator.share on mobile/PWA so text isn't truncated
  if (
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function'
  ) {
    try {
      await navigator.share({ title, text: message });
      return { method: 'web_share', encodedLength, message };
    } catch (err) {
      // If user explicitly cancelled the native share sheet, rethrow cancel-free or ignore AbortError
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error('Share cancelled.');
      }
      // Fall through to clipboard + wa.me fallback
    }
  }

  // Desktop / fallback when > 3,800 URI chars: copy full report and open WhatsApp
  if (
    typeof navigator !== 'undefined' &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === 'function'
  ) {
    await navigator.clipboard.writeText(message);
  }
  openExternalWhatsAppUrl('https://wa.me/');
  return { method: 'clipboard_fallback', encodedLength, message };
}

export async function copyWhatsAppReportText(message: string): Promise<void> {
  if (
    typeof navigator === 'undefined' ||
    !navigator.clipboard ||
    typeof navigator.clipboard.writeText !== 'function'
  ) {
    throw new Error('Clipboard access is unavailable in this browser.');
  }
  await navigator.clipboard.writeText(message);
}

function openExternalWhatsAppUrl(url: string): void {
  if (typeof window === 'undefined') return;
  const popup = window.open(url, '_blank', 'noopener,noreferrer');
  if (!popup) {
    window.location.href = url;
  }
}

import { jsonResponse } from './_webpush.js';

export async function onRequestGet(context) {
  const publicKey = String(
    context.env.VAPID_PUBLIC_KEY || context.env.VITE_VAPID_PUBLIC_KEY || ''
  ).trim();

  if (!publicKey) {
    return jsonResponse(
      { ok: false, error: 'Push VAPID public key is not configured.' },
      503
    );
  }

  return jsonResponse({ ok: true, publicKey });
}

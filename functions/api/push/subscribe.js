import {
  extractSessionToken,
  jsonResponse,
  readJsonBody,
  supabaseRest,
  validateSession,
} from './_webpush.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const body = await readJsonBody(request);
    const token = extractSessionToken(request, body);
    if (!token) {
      return jsonResponse({ error: 'Authentication required' }, 401);
    }

    const session = await validateSession(env, token);
    if (!session) {
      return jsonResponse({ error: 'Invalid or expired session' }, 401);
    }

    const subscription = body.subscription;
    const endpoint =
      subscription && typeof subscription.endpoint === 'string'
        ? subscription.endpoint.trim()
        : '';
    const p256dh =
      subscription?.keys && typeof subscription.keys.p256dh === 'string'
        ? subscription.keys.p256dh.trim()
        : '';
    const auth =
      subscription?.keys && typeof subscription.keys.auth === 'string'
        ? subscription.keys.auth.trim()
        : '';

    if (!endpoint.startsWith('https://') || !p256dh || !auth) {
      return jsonResponse({ error: 'Invalid Web Push subscription payload' }, 400);
    }

    const userAgent = (
      request.headers.get('user-agent') ||
      (typeof body.userAgent === 'string' ? body.userAgent : '')
    ).slice(0, 500);

    await supabaseRest(env, 'push_subscriptions?on_conflict=endpoint', {
      method: 'POST',
      headers: {
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({
        endpoint,
        p256dh,
        auth,
        account_id: session.account_id,
        role: session.role,
        sector_id: session.sector_id ?? null,
        unit_id: session.unit_id ?? null,
        user_agent: userAgent || null,
        updated_at: new Date().toISOString(),
      }),
    });

    return jsonResponse({
      ok: true,
      role: session.role,
      accountId: session.account_id,
    });
  } catch (err) {
    return jsonResponse(
      {
        error:
          err instanceof Error ? err.message : 'Unable to save subscription',
      },
      500
    );
  }
}

import {
  jsonResponse,
  readJsonBody,
  supabaseRest,
} from './_webpush.js';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_REQUEST_IDS = 10;
const MAX_REQUEST_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const body = await readJsonBody(request);
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
      return jsonResponse(
        { error: 'Invalid Web Push subscription payload' },
        400
      );
    }

    const userAgent = (
      request.headers.get('user-agent') ||
      (typeof body.userAgent === 'string' ? body.userAgent : '')
    ).slice(0, 500);

    // Ensure /order customer endpoint is removed from role='public' leaderboard/app-update broadcasts,
    // while strictly preserving any authenticated portal role ('division', 'sector', 'unit').
    await supabaseRest(
      env,
      `push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}&role=eq.public`,
      {
        method: 'DELETE',
        headers: { Prefer: 'return=minimal' },
      }
    ).catch(() => undefined);

    const rawIds = [];
    if (typeof body.requestId === 'string') {
      rawIds.push(body.requestId.trim());
    }
    if (Array.isArray(body.requestIds)) {
      for (const item of body.requestIds) {
        if (typeof item === 'string') {
          rawIds.push(item.trim());
        }
      }
    }

    const normalizedIds = Array.from(
      new Set(rawIds.filter((id) => UUID_RE.test(id)))
    ).slice(0, MAX_REQUEST_IDS);

    let attached = 0;
    const nowIso = new Date().toISOString();
    const minCreatedMs = Date.now() - MAX_REQUEST_AGE_MS;

    for (const reqId of normalizedIds) {
      const rows = await supabaseRest(
        env,
        `public_order_requests?id=eq.${encodeURIComponent(reqId)}&status=eq.pending&select=id,created_at`,
        { method: 'GET' }
      );
      const reqRow = Array.isArray(rows) ? rows[0] : null;
      if (!reqRow || !reqRow.created_at) continue;

      const createdMs = Date.parse(reqRow.created_at);
      if (!Number.isFinite(createdMs) || createdMs < minCreatedMs) continue;

      await supabaseRest(
        env,
        'public_order_push_subscriptions?on_conflict=request_id,endpoint',
        {
          method: 'POST',
          headers: {
            Prefer: 'resolution=merge-duplicates,return=minimal',
          },
          body: JSON.stringify({
            request_id: reqId,
            endpoint,
            p256dh,
            auth,
            user_agent: userAgent || null,
            updated_at: nowIso,
          }),
        }
      );
      attached += 1;
    }

    return jsonResponse({
      ok: true,
      attached,
    });
  } catch (err) {
    return jsonResponse(
      {
        error:
          err instanceof Error
            ? err.message
            : 'Unable to save order approval push subscription',
      },
      500
    );
  }
}

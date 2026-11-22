import {
  fetchSubscriptionsByTarget,
  jsonResponse,
  readJsonBody,
  supabaseRest,
} from './_webpush.js';

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

    // Avoid overwriting an authenticated portal device subscription (division/sector/unit)
    const existingRows = await fetchSubscriptionsByTarget(env, { endpoint });
    const existing = existingRows[0];
    if (existing && existing.role && existing.role !== 'public') {
      await supabaseRest(
        env,
        `push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}`,
        {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({
            p256dh,
            auth,
            user_agent: userAgent || null,
            updated_at: new Date().toISOString(),
          }),
        }
      );

      return jsonResponse({
        ok: true,
        role: existing.role,
      });
    }

    await supabaseRest(env, 'push_subscriptions?on_conflict=endpoint', {
      method: 'POST',
      headers: {
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({
        endpoint,
        p256dh,
        auth,
        account_id: null,
        role: 'public',
        sector_id: null,
        unit_id: null,
        user_agent: userAgent || null,
        updated_at: new Date().toISOString(),
      }),
    });

    return jsonResponse({
      ok: true,
      role: 'public',
    });
  } catch (err) {
    return jsonResponse(
      {
        error:
          err instanceof Error
            ? err.message
            : 'Unable to save public push subscription',
      },
      500
    );
  }
}

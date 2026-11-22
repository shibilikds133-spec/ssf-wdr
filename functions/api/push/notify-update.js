import {
  extractSessionToken,
  fetchSubscriptionsByTarget,
  jsonResponse,
  readJsonBody,
  sendToSubscriptions,
  supabaseRpc,
  timingSafeEqualString,
  validateSession,
} from './_webpush.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const body = await readJsonBody(request);

    const webhookSecret = String(env.PUSH_WEBHOOK_SECRET || '').trim();
    const headerSecret = (request.headers.get('x-push-secret') || '').trim();
    const hasWebhookAuth =
      Boolean(webhookSecret) &&
      Boolean(headerSecret) &&
      timingSafeEqualString(headerSecret, webhookSecret);

    if (!hasWebhookAuth) {
      const token = extractSessionToken(request, body);
      if (!token) {
        return jsonResponse({ error: 'Unauthorized' }, 401);
      }
      const session = await validateSession(env, token);
      if (!session) {
        return jsonResponse({ error: 'Invalid or expired session' }, 401);
      }
      if (session.role !== 'division') {
        return jsonResponse(
          { error: 'Only Division Admin can broadcast app updates' },
          403
        );
      }
    }

    const version =
      typeof body.version === 'string' && body.version.trim()
        ? body.version.trim()
        : 'manual';
    const force = body.force === true;
    const customMessage =
      typeof body.customMessage === 'string' && body.customMessage.trim()
        ? body.customMessage.trim()
        : null;

    const claim = await supabaseRpc(env, 'claim_app_update_push', {
      p_version: version,
      p_force: force,
      p_custom_message: customMessage,
    });

    if (!claim || claim.claimed !== true) {
      return jsonResponse({
        ok: true,
        claimed: false,
        alreadyNotified: true,
        eventKey: claim?.event_key ?? null,
        sent: 0,
        failed: 0,
        pruned: 0,
      });
    }

    const subscriptions = await fetchSubscriptionsByTarget(env, { all: true });
    const stats = await sendToSubscriptions(env, subscriptions, claim.payload);

    return jsonResponse({
      ok: true,
      claimed: true,
      alreadyNotified: false,
      eventKey: claim.event_key,
      totalSubscribers: subscriptions.length,
      ...stats,
    });
  } catch (err) {
    return jsonResponse(
      {
        error:
          err instanceof Error
            ? err.message
            : 'Unable to send app update notification',
      },
      500
    );
  }
}

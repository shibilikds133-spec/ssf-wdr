import {
  extractSessionToken,
  jsonResponse,
  readJsonBody,
  sendToSubscriptions,
  supabaseRpc,
  validateSession,
} from './_webpush.js';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const body = await readJsonBody(request);
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
        { error: 'Only Division Admin can dispatch approval notifications' },
        403
      );
    }

    const requestId =
      typeof body.requestId === 'string' ? body.requestId.trim() : '';
    if (!UUID_RE.test(requestId)) {
      return jsonResponse({ error: 'Valid requestId UUID is required' }, 400);
    }

    const claim = await supabaseRpc(env, 'claim_public_order_approved_push', {
      p_request_id: requestId,
    });

    const claimed = claim?.claimed === true;
    const subscriptions = Array.isArray(claim?.subscriptions)
      ? claim.subscriptions
      : [];

    if (!claimed || subscriptions.length === 0 || !claim?.notification) {
      return jsonResponse({
        ok: true,
        claimed,
        recipients: 0,
      });
    }

    const dispatch = async () => {
      try {
        await sendToSubscriptions(env, subscriptions, claim.notification, {
          tableName: 'public_order_push_subscriptions',
        });
      } catch (err) {
        console.error('Public order approval push dispatch failed:', err);
      }
    };

    if (typeof context.waitUntil === 'function') {
      context.waitUntil(dispatch());
    } else {
      await dispatch();
    }

    return jsonResponse({
      ok: true,
      claimed: true,
      recipients: subscriptions.length,
    });
  } catch (err) {
    return jsonResponse(
      {
        error:
          err instanceof Error
            ? err.message
            : 'Unable to dispatch public order approval push',
      },
      500
    );
  }
}

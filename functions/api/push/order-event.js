import {
  fetchSubscriptionsByTarget,
  jsonResponse,
  readJsonBody,
  sendToSubscriptions,
  supabaseRpc,
} from './_webpush.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const body = await readJsonBody(request);
    const orderId = Number(body.orderId);
    const source = body.source === 'public' ? 'public' : 'portal';

    if (!Number.isInteger(orderId) || orderId <= 0) {
      return jsonResponse({ error: 'Valid orderId is required' }, 400);
    }

    const events = await supabaseRpc(env, 'claim_order_push_events', {
      p_order_id: orderId,
      p_source: source,
    });

    if (!Array.isArray(events) || events.length === 0) {
      return jsonResponse({ ok: true, claimed: 0 });
    }

    const dispatchAll = async () => {
      for (const job of events) {
        try {
          if (!job || !job.target || !job.notification) continue;
          const subscriptions = await fetchSubscriptionsByTarget(env, job.target);
          if (subscriptions.length > 0) {
            await sendToSubscriptions(env, subscriptions, job.notification);
          }
        } catch (err) {
          console.error('Order milestone push dispatch failed:', err);
        }
      }
    };

    if (typeof context.waitUntil === 'function') {
      context.waitUntil(dispatchAll());
    } else {
      await dispatchAll();
    }

    return jsonResponse({ ok: true, claimed: events.length });
  } catch (err) {
    return jsonResponse(
      {
        error:
          err instanceof Error
            ? err.message
            : 'Unable to process order push event',
      },
      500
    );
  }
}

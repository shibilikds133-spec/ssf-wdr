import {
  extractSessionToken,
  fetchSubscriptionsByTarget,
  jsonResponse,
  readJsonBody,
  sendToSubscriptions,
  validateSession,
} from './_webpush.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const body = await readJsonBody(request);
    const token = extractSessionToken(request, body);
    if (!token) {
      return jsonResponse(
        { ok: false, sent: 0, failed: 0, error: 'Authentication required' },
        401
      );
    }

    const session = await validateSession(env, token);
    if (!session) {
      return jsonResponse(
        { ok: false, sent: 0, failed: 0, error: 'Invalid or expired session' },
        401
      );
    }

    const requestedEndpoint =
      typeof body.endpoint === 'string' && body.endpoint.startsWith('https://')
        ? body.endpoint.trim()
        : undefined;

    let subscriptions = await fetchSubscriptionsByTarget(env, {
      account_id: session.account_id,
      ...(requestedEndpoint ? { endpoint: requestedEndpoint } : {}),
    });

    if (subscriptions.length === 0 && requestedEndpoint) {
      subscriptions = await fetchSubscriptionsByTarget(env, {
        account_id: session.account_id,
      });
    }

    if (subscriptions.length === 0) {
      return jsonResponse(
        {
          ok: false,
          sent: 0,
          failed: 0,
          error:
            'No active push subscription found for this account. Please enable notifications first.',
        },
        404
      );
    }

    const urlByRole =
      session.role === 'division'
        ? '/admin'
        : session.role === 'sector'
        ? '/sector'
        : '/dashboard';

    const stats = await sendToSubscriptions(env, subscriptions, {
      title: 'നോട്ടിഫിക്കേഷൻ സജ്ജമാണ്! ✅',
      body: 'SSF വണ്ടൂർ പായസം ചലഞ്ച് പോർട്ടൽ പുഷ് നോട്ടിഫിക്കേഷനുകൾ കൃത്യമായി പ്രവർത്തിക്കുന്നുണ്ട്.',
      url: urlByRole,
      type: 'test',
      tag: `test:${session.account_id}`,
    });

    if (stats.sent <= 0) {
      return jsonResponse(
        {
          ok: false,
          sent: stats.sent,
          failed: stats.failed,
          pruned: stats.pruned,
          error:
            stats.error ||
            'Push service did not accept delivery for any active subscription. Please re-enable notifications.',
        },
        502
      );
    }

    return jsonResponse({
      ok: true,
      sent: stats.sent,
      failed: stats.failed,
      pruned: stats.pruned,
      error: null,
    });
  } catch (err) {
    return jsonResponse(
      {
        ok: false,
        sent: 0,
        failed: 0,
        error:
          err instanceof Error
            ? err.message
            : 'Unable to send test notification',
      },
      500
    );
  }
}

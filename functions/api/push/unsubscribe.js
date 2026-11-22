import { jsonResponse, readJsonBody, supabaseRest } from './_webpush.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const body = await readJsonBody(request);
    const endpoint =
      typeof body.endpoint === 'string' ? body.endpoint.trim() : '';

    if (!endpoint.startsWith('https://')) {
      return jsonResponse({ error: 'Valid push endpoint is required' }, 400);
    }

    await supabaseRest(
      env,
      `push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}`,
      {
        method: 'DELETE',
        headers: { Prefer: 'return=minimal' },
      }
    );

    return jsonResponse({ ok: true });
  } catch (err) {
    return jsonResponse(
      {
        error:
          err instanceof Error ? err.message : 'Unable to remove subscription',
      },
      500
    );
  }
}

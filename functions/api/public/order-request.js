export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const supabaseUrl = String(
      env.SUPABASE_URL || env.VITE_SUPABASE_URL || ''
    )
      .trim()
      .replace(/\/+$/, '');
    const supabaseKey = String(
      env.VITE_SUPABASE_ANON_KEY ||
        env.SUPABASE_ANON_KEY ||
        env.SUPABASE_SERVICE_ROLE_KEY ||
        ''
    ).trim();

    if (!supabaseUrl || !supabaseKey) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: 'Supabase environment variables are not configured.',
        }),
        {
          status: 503,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
          },
        }
      );
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return new Response(
        JSON.stringify({ ok: false, error: 'Invalid JSON request body.' }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
          },
        }
      );
    }

    const rpcResponse = await fetch(
      `${supabaseUrl}/rest/v1/rpc/submit_public_order_request`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({
          p_customer_name: body.p_customer_name ?? body.customer_name ?? '',
          p_mobile: body.p_mobile ?? body.mobile ?? '',
          p_quantity: body.p_quantity ?? body.quantity ?? null,
          p_unit_id: body.p_unit_id ?? body.unit_id ?? null,
        }),
      }
    );

    const responseText = await rpcResponse.text().catch(() => '');
    if (!rpcResponse.ok) {
      let message = `Unable to submit order (${rpcResponse.status})`;
      try {
        const parsedErr = JSON.parse(responseText);
        if (parsedErr?.message) message = parsedErr.message;
      } catch {
        if (responseText) message = responseText;
      }
      return new Response(
        JSON.stringify({ ok: false, error: message }),
        {
          status: rpcResponse.status >= 400 && rpcResponse.status < 500 ? 400 : 502,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
          },
        }
      );
    }

    return new Response(responseText, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({
        ok: false,
        error:
          err instanceof Error
            ? err.message
            : 'Unable to submit public order request.',
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
        },
      }
    );
  }
}

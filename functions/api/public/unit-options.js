export async function onRequestGet(context) {
  const { env } = context;

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

    const rpcResponse = await fetch(
      `${supabaseUrl}/rest/v1/rpc/get_public_unit_options`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
        },
        body: '{}',
      }
    );

    if (!rpcResponse.ok) {
      const errText = await rpcResponse.text().catch(() => '');
      return new Response(
        JSON.stringify({
          ok: false,
          error: errText || `Supabase RPC failed (${rpcResponse.status})`,
        }),
        {
          status: 502,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
          },
        }
      );
    }

    const payloadText = await rpcResponse.text();
    return new Response(payloadText, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=30, s-maxage=60, stale-while-revalidate=120',
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({
        ok: false,
        error:
          err instanceof Error
            ? err.message
            : 'Unable to fetch public unit options.',
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

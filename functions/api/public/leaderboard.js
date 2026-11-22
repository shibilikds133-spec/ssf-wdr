export async function onRequestGet(context) {
  const { request, env } = context;

  try {
    const reqUrl = new URL(request.url);
    const rawPage = Number(reqUrl.searchParams.get('page') || '1');
    const rawLimit = Number(
      reqUrl.searchParams.get('limit') ||
        reqUrl.searchParams.get('pageSize') ||
        '10'
    );
    const search = (reqUrl.searchParams.get('search') || '').trim();
    const rawSectorId = (reqUrl.searchParams.get('sectorId') || '').trim();
    const fresh = reqUrl.searchParams.get('fresh') === '1';

    const p_page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
    const p_page_size =
      Number.isInteger(rawLimit) && rawLimit > 0
        ? Math.min(rawLimit, 100)
        : 10;
    const parsedSectorId = Number(rawSectorId);
    const p_sector_id =
      rawSectorId !== '' &&
      rawSectorId !== 'ALL' &&
      Number.isInteger(parsedSectorId) &&
      parsedSectorId > 0
        ? parsedSectorId
        : null;

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
      `${supabaseUrl}/rest/v1/rpc/get_public_leaderboard_page`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({
          p_page,
          p_page_size,
          p_search: search,
          p_sector_id,
        }),
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
    const cacheHeader = fresh
      ? 'no-store'
      : 'public, max-age=5, s-maxage=15, stale-while-revalidate=30';

    return new Response(payloadText, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': cacheHeader,
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({
        ok: false,
        error:
          err instanceof Error
            ? err.message
            : 'Unable to fetch public leaderboard page.',
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

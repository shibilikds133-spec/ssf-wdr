import { buildPushPayload } from '@block65/webcrypto-web-push';

export function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

export async function readJsonBody(request) {
  try {
    const parsed = await request.json();
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function extractSessionToken(request, body) {
  const authHeader = request.headers.get('authorization') || '';
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim();
  }
  if (body && typeof body.sessionToken === 'string') {
    return body.sessionToken.trim();
  }
  return '';
}

export function timingSafeEqualString(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function getSupabaseConfig(env) {
  const url = String(env.SUPABASE_URL || env.VITE_SUPABASE_URL || '')
    .trim()
    .replace(/\/+$/, '');
  const serviceRoleKey = String(env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

  if (!url) {
    throw new Error('Missing SUPABASE_URL environment variable');
  }
  if (!serviceRoleKey) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY environment variable');
  }

  return { url, serviceRoleKey };
}

export async function supabaseRest(env, path, init = {}) {
  const { url, serviceRoleKey } = getSupabaseConfig(env);
  const headers = new Headers(init.headers || {});
  headers.set('apikey', serviceRoleKey);
  headers.set('Authorization', `Bearer ${serviceRoleKey}`);
  if (!headers.has('Content-Type') && init.body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers,
  });

  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!response.ok) {
    const detail =
      data && typeof data === 'object' && 'message' in data
        ? data.message
        : text || `HTTP ${response.status}`;
    throw new Error(`Supabase REST error (${response.status}): ${detail}`);
  }

  return data;
}

export async function supabaseRpc(env, fnName, params = {}) {
  return supabaseRest(env, `rpc/${fnName}`, {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function validateSession(env, token) {
  if (!token || typeof token !== 'string') {
    return null;
  }
  const res = await supabaseRpc(env, 'push_verify_session', {
    p_token: token.trim(),
  });
  if (!res || res.valid !== true) {
    return null;
  }
  return res;
}

export async function fetchSubscriptionsByTarget(env, target = {}) {
  const filters = [];

  if (target.all === true) {
    // No extra filters
  } else {
    if (typeof target.role === 'string' && target.role) {
      filters.push(`role=eq.${encodeURIComponent(target.role)}`);
    }
    if (target.unit_id !== undefined && target.unit_id !== null) {
      filters.push(`unit_id=eq.${encodeURIComponent(String(target.unit_id))}`);
    }
    if (target.sector_id !== undefined && target.sector_id !== null) {
      filters.push(
        `sector_id=eq.${encodeURIComponent(String(target.sector_id))}`
      );
    }
    if (typeof target.account_id === 'string' && target.account_id) {
      filters.push(
        `account_id=eq.${encodeURIComponent(target.account_id)}`
      );
    }
    if (typeof target.endpoint === 'string' && target.endpoint) {
      filters.push(`endpoint=eq.${encodeURIComponent(target.endpoint)}`);
    }
  }

  const query = [
    'select=id,endpoint,p256dh,auth,role,account_id',
    ...filters,
  ].join('&');

  const rows = await supabaseRest(env, `push_subscriptions?${query}`, {
    method: 'GET',
  });
  return Array.isArray(rows) ? rows : [];
}

function getVapidConfig(env) {
  const publicKey = String(
    env.VAPID_PUBLIC_KEY || env.VITE_VAPID_PUBLIC_KEY || ''
  ).trim();
  const privateKey = String(env.VAPID_PRIVATE_KEY || '').trim();
  const subject = String(
    env.VAPID_SUBJECT || 'mailto:admin@ssfwandoor.org'
  ).trim();

  if (!publicKey || !privateKey) {
    throw new Error('Missing VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY');
  }

  return { subject, publicKey, privateKey };
}

async function pruneExpiredEndpoints(env, endpoints) {
  if (!Array.isArray(endpoints) || endpoints.length === 0) return 0;

  let pruned = 0;
  const results = await Promise.allSettled(
    endpoints.map((endpoint) =>
      supabaseRest(
        env,
        `push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}`,
        {
          method: 'DELETE',
          headers: { Prefer: 'return=minimal' },
        }
      )
    )
  );

  for (const res of results) {
    if (res.status === 'fulfilled') {
      pruned += 1;
    }
  }
  return pruned;
}

export async function sendToSubscriptions(env, subscriptions, payloadObj) {
  if (!Array.isArray(subscriptions) || subscriptions.length === 0) {
    return { sent: 0, failed: 0, pruned: 0 };
  }

  const vapid = getVapidConfig(env);
  const message = {
    data: payloadObj,
    options: {
      ttl: 86400,
      urgency: 'high',
    },
  };

  const expiredEndpoints = [];
  let sent = 0;
  let failed = 0;
  let firstError = null;

  const results = await Promise.allSettled(
    subscriptions.map(async (sub) => {
      const subscription = {
        endpoint: sub.endpoint,
        expirationTime: null,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth,
        },
      };
      const pushPayload = await buildPushPayload(message, subscription, vapid);
      const response = await fetch(sub.endpoint, pushPayload);
      if (response.ok) {
        return { ok: true };
      }
      if (response.status === 404 || response.status === 410) {
        expiredEndpoints.push(sub.endpoint);
      }
      const errBody = await response.text().catch(() => '');
      const detail = errBody ? errBody.trim().slice(0, 180) : response.statusText;
      return {
        ok: false,
        status: response.status,
        error: `Push service HTTP ${response.status}${detail ? `: ${detail}` : ''}`,
      };
    })
  );

  for (const result of results) {
    if (result.status === 'fulfilled' && result.value.ok) {
      sent += 1;
    } else {
      failed += 1;
      if (!firstError) {
        if (result.status === 'rejected') {
          firstError =
            result.reason instanceof Error
              ? result.reason.message
              : 'Push delivery failed.';
        } else if (result.value && result.value.error) {
          firstError = result.value.error;
        }
      }
    }
  }

  const pruned = await pruneExpiredEndpoints(env, expiredEndpoints);
  return {
    sent,
    failed,
    pruned,
    ...(firstError ? { error: firstError } : {}),
  };
}

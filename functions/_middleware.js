export async function onRequest(context) {
  const response = await context.next();

  if (context.request.method !== 'GET') {
    return response;
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('text/html')) {
    return response;
  }

  const html = await response.text();
  if (!html.includes('__SITE_ORIGIN__')) {
    return new Response(html, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  }

  const reqUrl = new URL(context.request.url);
  const isLocal =
    reqUrl.hostname === 'localhost' ||
    reqUrl.hostname === '127.0.0.1' ||
    reqUrl.hostname.endsWith('.local');
  const origin = isLocal ? reqUrl.origin : `https://${reqUrl.host}`;

  const rewrittenHtml = html.replaceAll('__SITE_ORIGIN__', origin);
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.delete('etag');

  return new Response(rewrittenHtml, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

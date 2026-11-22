export async function onRequest(context) {
  const reqUrl = new URL(context.request.url);
  if (reqUrl.pathname.startsWith('/api/')) {
    return context.next();
  }

  const response = await context.next();

  if (context.request.method !== 'GET') {
    return response;
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('text/html')) {
    return response;
  }

  const html = await response.text();
  const isLocal =
    reqUrl.hostname === 'localhost' ||
    reqUrl.hostname === '127.0.0.1' ||
    reqUrl.hostname.endsWith('.local');
  const origin = isLocal ? reqUrl.origin : `https://${reqUrl.host}`;

  let rewrittenHtml = html.replaceAll('__SITE_ORIGIN__', origin);

  const normalizedPath = reqUrl.pathname || '/';
  const isPublicRoute = normalizedPath === '/' || normalizedPath === '/index.html';
  if (isPublicRoute) {
    rewrittenHtml = rewrittenHtml
      .replace(
        '<link rel="manifest" href="/manifest.webmanifest" />',
        '<link rel="manifest" href="/manifest-public.webmanifest" />'
      )
      .replace(
        '<meta name="theme-color" content="#381932" />',
        '<meta name="theme-color" content="#FFF8F6" />'
      );
  }

  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.delete('etag');

  return new Response(rewrittenHtml, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

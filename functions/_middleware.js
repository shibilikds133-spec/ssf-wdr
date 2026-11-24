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
  const canonicalUrl = `${origin}${normalizedPath === '/index.html' ? '/' : normalizedPath}`;
  rewrittenHtml = rewrittenHtml.replace(
    `<meta property="og:url" content="${origin}/" />`,
    `<meta property="og:url" content="${canonicalUrl}" />`
  );

  const isPublicRoute =
    normalizedPath === '/' ||
    normalizedPath === '/index.html' ||
    normalizedPath === '/order' ||
    normalizedPath === '/public-order';
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

  if (normalizedPath === '/order' || normalizedPath === '/public-order') {
    rewrittenHtml = rewrittenHtml
      .replace(
        '<meta property="og:title" content="SSF Wandoor Payasam Challenge" />',
        '<meta property="og:title" content="SSF Wandoor Payasam Challenge — Order Online" />'
      )
      .replace(
        '<meta name="twitter:title" content="SSF Wandoor Payasam Challenge" />',
        '<meta name="twitter:title" content="SSF Wandoor Payasam Challenge — Order Online" />'
      )
      .replaceAll(
        'SSF വണ്ടൂർ ഡിവിഷൻ പായസം ചലഞ്ച് — ഔദ്യോഗിക പോർട്ടൽ & ലൈവ് അപ്ഡേറ്റുകൾ.',
        'ഓർഡർ കോഡ് ഇല്ലാതെ ഓൺലൈനിൽ പായസം ഓർഡർ ചെയ്യാം • 1 ലിറ്റർ ₹250 • SSF വണ്ടൂർ ഡിവിഷൻ.'
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

import type { PageMeta } from './text';

export function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function metaTagsHtml(meta: PageMeta, pathname: string, origin: string): string {
  const imageUrl = meta.imagePath ? `${origin}${meta.imagePath}` : `${origin}/og/${meta.image}.png`;
  const pageUrl = `${origin}${pathname}`;
  const siteName = 'CoinCrew (Tiền Đâu)';

  // An empty description leaves its tags out, so the preview shows only the title.
  const description = meta.description
    ? [
        `<meta name="description" content="${escapeHtml(meta.description)}">`,
        `<meta property="og:description" content="${escapeHtml(meta.description)}">`,
        `<meta name="twitter:description" content="${escapeHtml(meta.description)}">`,
      ]
    : [];

  const tags = [
    ...description,
    `<meta property="og:title" content="${escapeHtml(meta.title)}">`,
    `<meta property="og:image" content="${escapeHtml(imageUrl)}">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta property="og:image:type" content="image/png">`,
    `<meta property="og:url" content="${escapeHtml(pageUrl)}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="${escapeHtml(siteName)}">`,
    `<meta property="og:locale" content="${escapeHtml(meta.locale)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${escapeHtml(meta.title)}">`,
    `<meta name="twitter:image" content="${escapeHtml(imageUrl)}">`,
    `<meta name="robots" content="noindex, nofollow">`,
  ];

  return tags.join('\n');
}

export function injectMeta(res: Response, meta: PageMeta, pathname: string, origin: string): Response {
  const transformed = new HTMLRewriter()
    .on('title', {
      element(el) {
        el.setInnerContent(meta.title);
      },
    })
    .on('meta[name="description"]', {
      element(el) {
        el.remove();
      },
    })
    .on('meta[property^="og:"]', {
      element(el) {
        el.remove();
      },
    })
    .on('meta[name^="twitter:"]', {
      element(el) {
        el.remove();
      },
    })
    .on('meta[name="robots"]', {
      element(el) {
        el.remove();
      },
    })
    .on('head', {
      element(el) {
        el.append(metaTagsHtml(meta, pathname, origin), { html: true });
      },
    })
    .transform(res);

  const headers = new Headers(res.headers);
  headers.delete('etag');
  headers.delete('content-length');
  headers.set('content-type', 'text/html; charset=utf-8');
  headers.set('cache-control', 'no-cache');
  headers.set('x-robots-tag', 'noindex, nofollow');

  return new Response(transformed.body, {
    status: res.status,
    headers,
  });
}

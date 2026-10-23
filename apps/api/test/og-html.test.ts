import { describe, it, expect } from 'vitest';
import { escapeHtml, metaTagsHtml, injectMeta } from '../src/og/html';
import type { PageMeta } from '../src/og/text';
import { INDEX_HTML } from './fixtures/indexHtml';

const ORIGIN = 'https://coin-crew.example.workers.dev';

describe('og/html', () => {
  it('escapes the five characters', () => {
    expect(escapeHtml('<a href="x">\'&\'</a>')).toBe(
      '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;',
    );
  });

  it('renders every tag with absolute URLs', () => {
    const meta: PageMeta = {
      title: 'T',
      description: 'D',
      image: 'sport',
      locale: 'vi_VN',
    };
    const html = metaTagsHtml(meta, '/j/gtok-1', ORIGIN);

    expect(html).toContain('<meta property="og:image" content="https://coin-crew.example.workers.dev/og/sport.png">');
    expect(html).toContain('<meta property="og:image:width" content="1200">');
    expect(html).toContain('<meta property="og:image:height" content="630">');
    expect(html).toContain('<meta property="og:image:type" content="image/png">');
    expect(html).toContain(`<meta property="og:url" content="${ORIGIN}/j/gtok-1">`);
    expect(html).toContain('<meta property="og:locale" content="vi_VN">');
    expect(html).toContain('<meta property="og:site_name" content="CoinCrew (Tiền Đâu)">');
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image">');
    expect(html).toContain('<meta name="twitter:image" content="https://coin-crew.example.workers.dev/og/sport.png">');
    expect(html).toContain('<meta name="robots" content="noindex, nofollow">');
    expect(html).toContain('<meta name="description" content="D">');
    expect(html).toContain('<meta property="og:title" content="T">');
    expect(html).toContain('<meta property="og:description" content="D">');
    expect(html).toContain('<meta property="og:type" content="website">');
    expect(html).toContain('<meta name="twitter:title" content="T">');
    expect(html).toContain('<meta name="twitter:description" content="D">');
  });

  it('replaces the default tags and the title', async () => {
    const meta: PageMeta = {
      title: 'T',
      description: 'D',
      image: 'sport',
      locale: 'vi_VN',
    };
    const res = new Response(INDEX_HTML, {
      headers: { 'content-type': 'text/html', etag: '"1"' },
    });
    const text = await injectMeta(res, meta, '/j/gtok-1', ORIGIN).text();

    expect(text.match(/og:title/g)).toHaveLength(1);
    expect(text.match(/name="description"/g)).toHaveLength(1);
    expect(text).toContain('<title>T</title>');
    expect(text).not.toContain('content="x"');
  });

  it('a hostile name cannot break out', async () => {
    const meta: PageMeta = {
      title: '"><script>alert(1)</script>',
      description: 'D',
      image: 'sport',
      locale: 'vi_VN',
    };
    const res = new Response(INDEX_HTML, {
      headers: { 'content-type': 'text/html' },
    });
    const body = await injectMeta(res, meta, '/j/gtok-1', ORIGIN).text();

    expect(body).not.toContain('<script>alert(1)');
    expect(body).toContain('&lt;script&gt;');
  });

  it('sets the headers', () => {
    const meta: PageMeta = {
      title: 'T',
      description: 'D',
      image: 'sport',
      locale: 'vi_VN',
    };
    const res = new Response(INDEX_HTML, {
      headers: {
        'content-type': 'text/html',
        etag: '"1"',
        'content-length': '123',
      },
    });
    const injected = injectMeta(res, meta, '/j/gtok-1', ORIGIN);

    expect(injected.headers.get('etag')).toBeNull();
    expect(injected.headers.get('content-length')).toBeNull();
    expect(injected.headers.get('x-robots-tag')).toBe('noindex, nofollow');
    expect(injected.headers.get('cache-control')).toBe('no-cache');
    expect(injected.headers.get('content-type')?.startsWith('text/html')).toBe(true);
  });
});

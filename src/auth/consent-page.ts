import type { ClientInfo } from '@cloudflare/workers-oauth-provider';

export interface ConsentPageOptions {
    requestUrl: string;
    clientInfo: ClientInfo | null;
    csrfToken: string;
    consentCookie: string;
    redirectUri: string;
}

export function renderConsentPage(options: ConsentPageOptions): Response {
    const approveUrl = new URL(options.requestUrl);
    approveUrl.searchParams.set('approve', '1');
    approveUrl.searchParams.delete('csrf_token');
    const approvePathAndQuery = `${approveUrl.pathname}${approveUrl.search}`;

    const clientName = getClientDisplayName(options.clientInfo, 'this AI assistant');

    return new Response(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Connect Bkper MCP</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 42rem; margin: 4rem auto; padding: 0 1rem; color: #1f2937; }
    .card { border: 1px solid #d1d5db; border-radius: 12px; padding: 2rem; }
    .client { font-weight: 600; }
    .actions { margin-top: 1.5rem; }
    button { background: #2563eb; color: white; padding: 0.75rem 1rem; border: 0; border-radius: 8px; cursor: pointer; font: inherit; }
    .warning { color: #92400e; }
  </style>
</head>
<body>
  <main class="card">
    <h1>Connect Bkper MCP</h1>
    <p>You are allowing <span class="client">${escapeHtml(clientName)}</span> to use Bkper on your behalf.</p>
    <p>It can read and change data that your Bkper account can access, using the same permissions you have in Bkper.</p>
    <p>Actions are recorded in Bkper activity and attributed to <strong>Bkper MCP</strong>.</p>
    <p class="warning">Only connect assistants you trust.</p>
    <form class="actions" method="post" action="${escapeHtml(approvePathAndQuery)}">
      <input type="hidden" name="csrf_token" value="${escapeHtml(options.csrfToken)}">
      <button type="submit">Connect Bkper MCP</button>
    </form>
  </main>
</body>
</html>`, {
        status: 200,
        headers: getConsentPageHeaders(options.consentCookie, options.redirectUri),
    });
}

function getConsentPageHeaders(consentCookie: string, redirectUri: string): HeadersInit {
    const allowedFormActions = ["'self'", getUrlOrigin(redirectUri)].filter((source): source is string => source !== null);
    return {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy': [
            "default-src 'none'",
            "style-src 'unsafe-inline'",
            `form-action ${allowedFormActions.join(' ')}`,
            "frame-ancestors 'none'",
            "base-uri 'self'",
        ].join('; '),
        'Set-Cookie': consentCookie,
        'X-Frame-Options': 'DENY',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
        'Cache-Control': 'no-store',
    };
}

function getUrlOrigin(value: string): string | null {
    try {
        const url = new URL(value);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
            return null;
        }
        return url.origin;
    } catch {
        return null;
    }
}

function getClientDisplayName(clientInfo: ClientInfo | null, fallback: string): string {
    return clientInfo?.clientName || clientInfo?.clientUri || fallback;
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';

/** Hachages CSP des scripts en ligne d'une page HTML (SvelteKit en insère un pour démarrer). */
export function hachagesScriptsEnLigne(html: string): string[] {
  const hachages: string[] = [];
  for (const m of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)) {
    const contenu = m[1] ?? '';
    if (contenu.trim() === '') continue;
    hachages.push(`'sha256-${createHash('sha256').update(contenu).digest('base64')}'`);
  }
  return hachages;
}

export function construireCsp(origine: string, hachagesScripts: string[] = []): string {
  const ws = origine.replace(/^http/, 'ws');
  return [
    "default-src 'self'",
    `script-src 'self' ${hachagesScripts.join(' ')}`.trim(),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "font-src 'self'",
    `connect-src 'self' ${ws} blob:`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

/** En-têtes de sécurité sur toutes les réponses. */
export function installerEntetesSecurite(app: FastifyInstance, hachagesScripts: string[]): void {
  const csp = construireCsp(app.config.origine, hachagesScripts);
  const https = app.config.https;
  app.addHook('onSend', async (_req, reply, charge) => {
    reply.header('Content-Security-Policy', csp);
    reply.header('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=(), payment=(), fullscreen=(self)');
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Cross-Origin-Opener-Policy', 'same-origin');
    if (https) reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    return charge;
  });
}

'use client';

import React, { useMemo } from 'react';

interface EmailHtmlViewerProps {
  html: string;
  className?: string;
}

/**
 * Strips script tags, inline event handlers, and javascript: pseudo-protocols
 * so sandboxed iframes don't trigger "Blocked script execution in 'about:srcdoc'" errors.
 */
function sanitizeEmailHtml(rawHtml: string): string {
  if (!rawHtml) return '';
  return rawHtml
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script\s*>/gi, '')
    .replace(/<script\b[^>]*>/gi, '')
    .replace(/<\/script>/gi, '')
    .replace(/\s+on[a-zA-Z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src)\s*=\s*(?:"javascript:[^"]*"|'javascript:[^']*'|javascript:[^\s>]*)/gi, '$1="#"');
}

export default function EmailHtmlViewer({ html, className = '' }: EmailHtmlViewerProps) {
  const sanitizedSrcDoc = useMemo(() => {
    if (!html) return '';

    const cleanHtml = sanitizeEmailHtml(html);

    const baseStyle = `
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <base target="_blank">
      <style>
        html, body {
          margin: 0;
          padding: 20px;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          font-size: 14px;
          line-height: 1.6;
          color: #1e293b;
          background-color: #ffffff;
          word-break: break-word;
          overflow-x: auto;
        }
        img { max-width: 100% !important; height: auto !important; }
        table { max-width: 100% !important; }
        a { color: #4f46e5; }
      </style>
    `;

    if (cleanHtml.includes('<head>')) {
      return cleanHtml.replace('<head>', `<head>${baseStyle}`);
    }
    return `<!DOCTYPE html><html><head>${baseStyle}</head><body>${cleanHtml}</body></html>`;
  }, [html]);

  return (
    <iframe
      srcDoc={sanitizedSrcDoc}
      title="Email Preview"
      sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin"
      className={`w-full h-full min-h-[460px] border-0 rounded-xl bg-white shadow-sm ${className}`}
    />
  );
}

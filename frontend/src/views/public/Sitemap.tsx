/**
 * @file Sitemap.tsx
 * @description Human-readable sitemap page auto-generated from the shared nav-config.
 *
 * This page is intentionally PUBLIC (no auth guard) so automated agents can
 * access it to discover all available pages and their URLs before navigating
 * the application.
 *
 * The content is driven by SITEMAP_SECTIONS in `@/lib/nav-config.ts` —
 * update that file to keep both the sidebar and this page in sync.
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { Map, ExternalLink, ChevronRight } from 'lucide-react';
import { SITEMAP_SECTIONS } from '@/lib/nav-config';

function Sitemap() {
  const BASE_URL = window.location.origin;

  return (
    <div className="h-full overflow-y-auto bg-background text-foreground">
      {/* ── Header ── */}
      <div className="border-b bg-card/50">
        <div className="max-w-5xl mx-auto px-6 py-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
              <Map className="w-5 h-5 text-primary" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Site Map</h1>
          </div>
          <p className="text-muted-foreground text-sm max-w-xl">
            A complete index of all pages and sections available in this application.
            Use this reference to discover navigation paths and available features.
          </p>
          <p className="text-xs text-muted-foreground/60 mt-2 font-mono">
            Base URL: <span className="text-muted-foreground">{BASE_URL}</span>
          </p>
        </div>
      </div>

      {/* ── Sections ── */}
      <div className="max-w-5xl mx-auto px-6 py-10 space-y-10">
        {SITEMAP_SECTIONS.map((section) => (
          <section key={section.group} aria-labelledby={`section-${section.group.replace(/\s+/g, '-').toLowerCase()}`}>
            {/* Group heading */}
            <div className="flex items-center gap-2 mb-4">
              <h2
                id={`section-${section.group.replace(/\s+/g, '-').toLowerCase()}`}
                className="text-xs font-semibold uppercase tracking-widest text-muted-foreground"
              >
                {section.group}
              </h2>
              <div className="flex-1 h-px bg-border" />
            </div>

            {/* Item grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {section.items.map((item) => {
                const isDynamic = item.href.includes(':');
                const fullUrl = isDynamic
                  ? `${BASE_URL}${item.href}`
                  : `${BASE_URL}${item.href}`;

                return (
                  <div
                    key={item.href}
                    className="group relative flex flex-col gap-1 p-4 rounded-lg border bg-card hover:bg-accent/50 hover:border-primary/30 transition-all duration-150"
                  >
                    {/* Page title + link */}
                    <div className="flex items-start justify-between gap-2">
                      {isDynamic ? (
                        <span className="text-sm font-medium text-foreground leading-tight">
                          {item.label}
                        </span>
                      ) : (
                        <Link
                          to={item.href}
                          className="text-sm font-medium text-foreground hover:text-primary leading-tight flex items-center gap-1 group/link"
                        >
                          {item.label}
                          <ChevronRight className="w-3 h-3 opacity-0 group-hover/link:opacity-100 transition-opacity" />
                        </Link>
                      )}

                      {/* External link icon for easy copy */}
                      {!isDynamic && (
                        <a
                          href={fullUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Open in new tab"
                          className="shrink-0 opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity"
                        >
                          <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
                        </a>
                      )}
                    </div>

                    {/* Description */}
                    {item.description && (
                      <p className="text-xs text-muted-foreground leading-snug">
                        {item.description}
                      </p>
                    )}

                    {/* URL pill */}
                    <p className="text-xs font-mono text-muted-foreground/50 mt-auto pt-2 truncate">
                      {item.href}
                    </p>

                    {isDynamic && (
                      <span className="absolute top-3 right-3 text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20">
                        dynamic
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))}

        {/* Footer note */}
        <div className="border-t pt-8 text-xs text-muted-foreground/50 space-y-1">
          <p>
            Page count: <strong className="text-muted-foreground">{SITEMAP_SECTIONS.reduce((acc, s) => acc + s.items.length, 0)}</strong> routes across{' '}
            <strong className="text-muted-foreground">{SITEMAP_SECTIONS.length}</strong> groups.
          </p>
          <p>
            This sitemap is auto-generated from{' '}
            <code className="text-[11px] bg-muted px-1 py-0.5 rounded">src/lib/nav-config.ts</code>{' '}
            and always reflects the current sidebar structure.
          </p>
        </div>
      </div>
    </div>
  );
}

export default Sitemap;

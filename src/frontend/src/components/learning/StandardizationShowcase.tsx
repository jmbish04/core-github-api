import React, { useState } from 'react';

// Static list of known agent rules — in production these could be fetched
const KNOWN_RULES = [
  { name: 'Durable Objects', file: 'durable_objects.md', summary: 'Always use new_sqlite_classes for SQLite-backed DOs. Never new_classes.' },
  { name: 'AI Providers', file: 'ai-providers.md', summary: 'Use Workers AI via env.AI.run(). Do not use Vercel AI SDK.' },
  { name: 'UI Standards', file: 'ui-standards.md', summary: 'No border classes. Hierarchy via bg-zinc-* backgrounds.' },
  { name: 'Security Standards', file: 'security-standards.md', summary: 'All secrets via Secrets Store. No plaintext env vars.' },
  { name: 'Logging Standards', file: 'logging-standards.md', summary: 'Use Logger class from @lib/logger. No bare console.log in production.' },
  { name: 'Jules', file: 'jules.md', summary: 'All Jules interactions via JulesService.getInstance(). Never import @google/jules-sdk directly.' },
  { name: 'Architecture', file: 'architecture.md', summary: 'Hono for routing, Drizzle for D1, BaseAgent for DOs.' },
  { name: 'Realtime', file: 'realtime.md', summary: 'Use JulesWebhookBroadcaster for WS fan-out. Tag sockets with projectId + system:all.' },
];

interface RuleCardProps {
  name: string;
  file: string;
  summary: string;
  apiBase: string;
}

function RuleCard({ name, file, summary, apiBase }: RuleCardProps) {
  const [triggering, setTriggering] = useState(false);
  const [done, setDone] = useState(false);

  const triggerUpscale = async () => {
    setTriggering(true);
    try {
      await fetch(`${apiBase}/upscale`, { method: 'POST' });
      setDone(true);
    } catch {
      // ignore
    } finally {
      setTriggering(false);
    }
  };

  return (
    <div className="bg-zinc-900 p-5 rounded-sm">
      <div className="flex items-start justify-between mb-2">
        <h3 className="text-zinc-50 font-semibold tracking-tighter">{name}</h3>
        <span className="text-zinc-500 text-xs font-mono">{file}</span>
      </div>
      <p className="text-zinc-400 text-sm mb-4">{summary}</p>
      {done ? (
        <span className="text-green-400 text-xs">Upscale triggered.</span>
      ) : (
        <button
          className="bg-zinc-800 hover:bg-zinc-700 text-zinc-50 text-xs px-3 py-1.5 rounded-sm transition-colors disabled:opacity-40"
          onClick={triggerUpscale}
          disabled={triggering}
        >
          {triggering ? 'Triggering...' : 'Trigger Standardization Upscale'}
        </button>
      )}
    </div>
  );
}

export function StandardizationShowcase({ apiBase = '/api/learning' }: { apiBase?: string }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {KNOWN_RULES.map(rule => (
        <RuleCard key={rule.file} {...rule} apiBase={apiBase} />
      ))}
    </div>
  );
}

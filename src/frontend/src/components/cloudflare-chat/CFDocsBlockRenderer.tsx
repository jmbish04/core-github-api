/**
 * @file frontend/src/components/cloudflare-chat/CFDocsBlockRenderer.tsx
 * @description Renders the agent's typed ContentBlock[] as rich UI.
 * Handles section_header (h3 with accent), text (markdown prose), and
 * codeblock (syntax-highlighted panel with copy button).
 */

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter';
import oneDark from 'react-syntax-highlighter/dist/esm/styles/prism/one-dark';
import { Check, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ContentBlock {
  type: 'section_header' | 'text' | 'codeblock';
  text: string;
  language?: string;
}

// ─── Copy Button ──────────────────────────────────────────────────────────────

function CopyButton({ text, className }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard unavailable */ }
  };

  return (
    <button
      onClick={handleCopy}
      aria-label="Copy code"
      className={cn(
        'flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-all',
        copied
          ? 'text-emerald-400 bg-emerald-500/10'
          : 'text-muted-foreground hover:text-foreground hover:bg-white/5',
        className
      )}
    >
      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

// ─── Block renderers ──────────────────────────────────────────────────────────

function SectionHeader({ text }: { text: string }) {
  return (
    <h3 className="flex items-center gap-2 text-base font-semibold text-foreground mt-5 mb-2 first:mt-0">
      <span className="inline-block w-1 h-5 rounded-full bg-orange-500/70 shrink-0" />
      {text}
    </h3>
  );
}

function TextBlock({ text }: { text: string }) {
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none text-sm text-foreground/90 leading-relaxed">
      <ReactMarkdown
        components={{
          // Render inline code nicely
          code: ({ className, children, ...props }: any) => {
            const isBlock = className?.includes('language-');
            if (isBlock) return <code className={className} {...props}>{children}</code>;
            return (
              <code className="px-1.5 py-0.5 rounded bg-muted text-orange-400 text-[0.8em] font-mono" {...props}>
                {children}
              </code>
            );
          },
          // Numbered list items
          ol: ({ children, ...props }: any) => (
            <ol className="list-decimal list-inside space-y-1 my-2" {...props}>{children}</ol>
          ),
          ul: ({ children, ...props }: any) => (
            <ul className="list-disc list-inside space-y-1 my-2" {...props}>{children}</ul>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

function CodeBlock({ text, language }: { text: string; language?: string }) {
  const lang = language || 'text';
  return (
    <div className="relative group my-3 rounded-lg overflow-hidden border border-border/40 bg-[#1a1a2e]">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/5 bg-white/[0.03]">
        <span className="text-[10px] font-mono font-semibold uppercase tracking-widest text-orange-400/80">
          {lang}
        </span>
        <CopyButton text={text} />
      </div>
      {/* Syntax highlighted code */}
      <SyntaxHighlighter
        language={lang}
        style={oneDark}
        customStyle={{
          margin: 0,
          padding: '1rem',
          fontSize: '0.8rem',
          lineHeight: 1.6,
          background: 'transparent',
          overflowX: 'auto',
        }}
        wrapLongLines={false}
        showLineNumbers={text.split('\n').length > 5}
      >
        {text}
      </SyntaxHighlighter>
    </div>
  );
}

// ─── Main Renderer ────────────────────────────────────────────────────────────

interface CFDocsBlockRendererProps {
  blocks: ContentBlock[];
  modelUsed?: string;
}

export function CFDocsBlockRenderer({ blocks, modelUsed }: CFDocsBlockRendererProps) {
  if (!blocks || blocks.length === 0) return null;

  return (
    <div className="space-y-1 min-w-0 w-full">
      {blocks.map((block, i) => {
        if (block.type === 'section_header') return <SectionHeader key={i} text={block.text} />;
        if (block.type === 'codeblock') return <CodeBlock key={i} text={block.text} language={block.language} />;
        return <TextBlock key={i} text={block.text} />;
      })}
      {modelUsed && (
        <div className="pt-3 text-[10px] text-muted-foreground/50 font-mono">
          ↳ {modelUsed}
        </div>
      )}
    </div>
  );
}

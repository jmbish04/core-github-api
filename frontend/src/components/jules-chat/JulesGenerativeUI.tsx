import React from 'react';
import { Bot, CheckCircle2, ChevronRight, PlayCircle, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import ReactMarkdown from 'react-markdown';
import { SyntaxHighlighter } from "@/components/assistant-ui/shiki-highlighter";

export function JulesBlockContent({ blocks }: { blocks: any[] }) {
  if (!blocks || blocks.length === 0) return null;

  return (
    <div className="flex flex-col gap-3 my-2 text-sm text-foreground/90">
      {blocks.map((block, idx) => {
        if (block.type === 'text') {
          return (
            <div key={idx} className="prose prose-sm dark:prose-invert">
              <ReactMarkdown
                components={{
                  code({ node, inline, className, children, ...props }: any) {
                    const match = /language-(\w+)/.exec(className || '');
                    return !inline && match ? (
                      <SyntaxHighlighter
                        code={String(children).replace(/\n$/, '')}
                        language={match[1]}
                        {...props}
                      />
                    ) : (
                      <code className={cn("bg-muted px-1 py-0.5 rounded text-xs", className)} {...props}>
                        {children}
                      </code>
                    )
                  }
                }}
              >
                {block.text}
              </ReactMarkdown>
            </div>
          );
        }

        if (block.type === 'toolUse') {
          return (
            <div key={idx} className="border border-border rounded-md bg-muted/30 overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 border-b border-border">
                <Bot className="w-4 h-4 text-primary" />
                <span className="font-mono text-xs font-semibold">Tool Run: {block.name}</span>
              </div>
              <div className="p-3">
                <SyntaxHighlighter
                  language="json"
                  code={JSON.stringify(block.input, null, 2)}
                />
              </div>
            </div>
          );
        }

        if (block.type === 'toolResult') {
          return (
            <div key={idx} className="border border-border/50 rounded-md bg-muted/10 overflow-hidden mt-1">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/20 border-b border-border/50">
                <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                <span className="font-mono text-xs text-muted-foreground">Result: {block.toolName || 'Tool'}</span>
              </div>
              <div className="p-2 max-h-40 overflow-y-auto">
                <SyntaxHighlighter
                  language="json"
                  code={typeof block.result === 'string' ? block.result : JSON.stringify(block.result, null, 2)}
                />
              </div>
            </div>
          );
        }

        return null;
      })}
    </div>
  );
}

export function JulesPlan({ plan }: { plan: string[] }) {
  if (!plan || plan.length === 0) return null;

  return (
    <div className="my-3 border border-border rounded-lg bg-card overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/40 border-b border-border">
        <PlayCircle className="w-4 h-4 text-blue-500" />
        <h4 className="font-semibold text-sm">Execution Plan</h4>
      </div>
      <div className="p-4 flex flex-col gap-2">
        {plan.map((step, idx) => (
          <div key={idx} className="flex items-start gap-2">
            <div className="flex-shrink-0 w-5 h-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold mt-0.5">
              {idx + 1}
            </div>
            <div className="text-sm text-muted-foreground">{step}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function JulesStatus({ status, message }: { status: 'stuck' | 'thinking' | 'working', message?: string }) {
  if (status === 'thinking') return null; // Let the default assistant-ui handle loading states

  if (status === 'stuck') {
    return (
      <div className="my-2 p-3 border border-orange-500/30 bg-orange-500/10 rounded-lg flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-orange-500 shrink-0 mt-0.5" />
        <div>
          <h4 className="text-sm font-semibold text-orange-600 dark:text-orange-400">Jules is Stuck</h4>
          <p className="text-xs text-orange-600/80 dark:text-orange-400/80 mt-1">
            {message || "The agent has encountered an issue and requires your assistance to proceed."}
          </p>
        </div>
      </div>
    );
  }

  return null;
}

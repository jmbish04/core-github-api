import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Bot, Loader2, SendHorizonal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { consultReverseEngineeringSnapshot } from './api';

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

interface ConsultantPanelProps {
  snapshotId: string;
}

export function ConsultantPanel({ snapshotId }: ConsultantPanelProps) {
  const [role, setRole] = useState<'general' | 'product' | 'ux' | 'frontend' | 'backend' | 'cloudflare'>(
    'general',
  );
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const mutation = useMutation({
    mutationFn: async (nextMessage: string) => {
      return consultReverseEngineeringSnapshot(snapshotId, {
        role,
        message: nextMessage,
        history: messages.map((entry) => ({
          role: entry.role,
          content: entry.content,
        })),
        sessionId: `${snapshotId}:${role}`,
      });
    },
    onSuccess: (data, nextMessage) => {
      setMessages((current) => [
        ...current,
        { role: 'user', content: nextMessage },
        { role: 'assistant', content: data.response || 'No response returned.' },
      ]);
      setMessage('');
    },
  });

  const placeholder = useMemo(() => {
    switch (role) {
      case 'product':
        return 'Ask about product requirements, PRD gaps, or epic structure';
      case 'ux':
        return 'Ask about user journeys, screenshots, or UX inconsistencies';
      case 'frontend':
        return 'Ask about route structure, components, and client architecture';
      case 'backend':
        return 'Ask about APIs, schema, auth, or deployment architecture';
      case 'cloudflare':
        return 'Ask about Workers, Assets, D1, AI Gateway, or Browser Rendering';
      default:
        return 'Ask the consultant about this reverse-engineering snapshot';
    }
  }, [role]);

  const handleSend = async () => {
    const trimmed = message.trim();
    if (!trimmed || mutation.isPending) {
      return;
    }

    await mutation.mutateAsync(trimmed);
  };

  return (
    <Card className="border-zinc-800 bg-zinc-950/70">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Bot className="h-4 w-4 text-cyan-400" />
          Reverse-Engineering Consultant
        </CardTitle>
        <CardDescription>
          Query the Honi consultant against the live snapshot, Cloudflare guidance, and synthesized findings.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Consultant role</Label>
          <Select value={role} onValueChange={(value) => setRole(value as typeof role)}>
            <SelectTrigger>
              <SelectValue placeholder="Choose a consultant role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="general">General</SelectItem>
              <SelectItem value="product">Product</SelectItem>
              <SelectItem value="ux">UX</SelectItem>
              <SelectItem value="frontend">Frontend</SelectItem>
              <SelectItem value="backend">Backend</SelectItem>
              <SelectItem value="cloudflare">Cloudflare</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <ScrollArea className="h-80 rounded-md border border-zinc-800 bg-zinc-900/40 p-4">
          <div className="space-y-3">
            {messages.length === 0 && (
              <div className="rounded-lg border border-dashed border-zinc-700 p-4 text-sm text-zinc-400">
                No consultant messages yet. Start with a focused question about product, UX, frontend, backend, or
                Cloudflare implementation.
              </div>
            )}
            {messages.map((entry, index) => (
              <div
                key={`${entry.role}-${index}`}
                className={cn(
                  'rounded-lg border p-3 text-sm',
                  entry.role === 'assistant'
                    ? 'border-cyan-500/30 bg-cyan-500/10 text-zinc-100'
                    : 'border-zinc-700 bg-zinc-900 text-zinc-300',
                )}
              >
                <div className="mb-1 text-[11px] uppercase tracking-wide text-zinc-500">{entry.role}</div>
                <div className="whitespace-pre-wrap">{entry.content}</div>
              </div>
            ))}
            {mutation.isPending && (
              <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-3 text-sm text-zinc-400">
                <Loader2 className="mr-2 inline-block h-4 w-4 animate-spin" />
                Consultant is responding…
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="flex gap-2">
          <Input
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void handleSend();
              }
            }}
            placeholder={placeholder}
          />
          <Button onClick={() => void handleSend()} disabled={mutation.isPending || !message.trim()}>
            {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizonal className="h-4 w-4" />}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

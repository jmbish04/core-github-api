import { useState } from 'react';
import { Bot, Loader2, MessageSquare, SendHorizonal } from 'lucide-react';
import { toast } from 'sonner';
import { consultReverseEngineeringSnapshot } from '@/components/reverse-engineering/api';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

type ConsultantRole = 'general' | 'product' | 'ux' | 'frontend' | 'backend' | 'cloudflare';

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

const DEFAULT_MESSAGES: ChatMessage[] = [
  {
    id: 'intro',
    role: 'assistant',
    content:
      'Ask about a reverse-engineering snapshot. Provide a snapshot ID, choose a role, and I will answer against the stored repo analysis, UX evidence, backend architecture, and Cloudflare context.',
  },
];

export function GlobalConsultantModal() {
  const [open, setOpen] = useState(false);
  const [snapshotId, setSnapshotId] = useState('');
  const [role, setRole] = useState<ConsultantRole>('general');
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>(DEFAULT_MESSAGES);
  const [isRunning, setIsRunning] = useState(false);

  const appendMessage = (next: ChatMessage) => {
    setMessages((current) => [...current, next]);
  };

  const handleSend = async () => {
    const trimmedSnapshotId = snapshotId.trim();
    const trimmedMessage = message.trim();

    if (!trimmedSnapshotId) {
      toast.error('Provide a reverse-engineering snapshot ID first.');
      return;
    }

    if (!trimmedMessage || isRunning) {
      return;
    }

    const history = messages
      .filter((entry) => entry.id !== 'intro')
      .map((entry) => ({ role: entry.role, content: entry.content }));

    appendMessage({
      id: crypto.randomUUID(),
      role: 'user',
      content: trimmedMessage,
    });
    setMessage('');
    setIsRunning(true);

    try {
      const result = await consultReverseEngineeringSnapshot(trimmedSnapshotId, {
        role,
        message: trimmedMessage,
        history,
        sessionId: `${trimmedSnapshotId}:${role}:global`,
      });

      appendMessage({
        id: crypto.randomUUID(),
        role: 'assistant',
        content: result.response || 'No response returned.',
      });
    } catch (error) {
      const nextMessage = error instanceof Error ? error.message : 'Consultant request failed.';
      appendMessage({
        id: crypto.randomUUID(),
        role: 'assistant',
        content: nextMessage,
      });
      toast.error(nextMessage);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <>
      <Button
        className="fixed bottom-6 right-6 z-40 h-12 rounded-full px-4 shadow-lg"
        onClick={() => setOpen(true)}
      >
        <MessageSquare className="mr-2 h-4 w-4" />
        Consultant
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl border-zinc-800 bg-zinc-950 text-zinc-50">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-cyan-400" />
              Global Reverse-Engineering Consultant
            </DialogTitle>
            <DialogDescription className="text-zinc-400">
              Use any snapshot ID from the reverse-engineering queue to query the consultant from anywhere in the app.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 md:grid-cols-[1fr_220px]">
            <div className="space-y-2">
              <Label>Snapshot ID</Label>
              <Input
                value={snapshotId}
                onChange={(event) => setSnapshotId(event.target.value)}
                placeholder="Paste reverse-engineering snapshot ID"
              />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={role} onValueChange={(value) => setRole(value as ConsultantRole)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a role" />
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
          </div>

          <div className="rounded-md border border-zinc-800 bg-zinc-900/40">
            <ScrollArea className="h-[320px] px-3 py-3">
              <div className="space-y-3">
                {messages.map((entry) => (
                  <div
                    key={entry.id}
                    className={cn(
                      'rounded-md border px-3 py-2 text-sm',
                      entry.role === 'assistant'
                        ? 'border-cyan-500/20 bg-cyan-500/10'
                        : 'ml-8 border-zinc-700 bg-zinc-900',
                    )}
                  >
                    <div className="mb-1 text-[11px] uppercase tracking-wide text-zinc-500">{entry.role}</div>
                    <div className="whitespace-pre-wrap leading-relaxed">{entry.content}</div>
                  </div>
                ))}
                {isRunning && (
                  <div className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-400">
                    <Loader2 className="mr-2 inline-block h-4 w-4 animate-spin" />
                    Consultant is responding…
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>

          <div className="space-y-2">
            <Label>Question</Label>
            <Textarea
              rows={4}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Ask about the PRD, UX journeys, frontend architecture, backend routes, or Cloudflare fit."
            />
          </div>

          <div className="flex justify-end">
            <Button onClick={() => void handleSend()} disabled={isRunning || !message.trim()}>
              {isRunning ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Running
                </>
              ) : (
                <>
                  <SendHorizonal className="mr-2 h-4 w-4" />
                  Send
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

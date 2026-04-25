import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { JulesSession } from '@/hooks/jules/useJulesSession';
import { Textarea } from '@/components/ui/textarea';
import { Send, Loader2, MessageSquareWarning } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

export function TaskFeedbackView({ sessionId, session }: { sessionId: string; session: JulesSession }) {
  const [feedback, setFeedback] = useState('');
  const queryClient = useQueryClient();

  const feedbackMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/julius/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          action: 'feedback',
          message: feedback,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to send feedback');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['jules-session', sessionId]);
      setFeedback('');
    }
  });

  return (
    <div className="space-y-6">
      <Card className="p-8 bg-zinc-900 border-zinc-800">
        <div className="flex items-center gap-4 mb-6">
          <MessageSquareWarning className="h-8 w-8 text-amber-500" />
          <h2 className="text-2xl font-semibold tracking-tighter text-white">Agent Blocked</h2>
        </div>

        <div className="bg-amber-950/20 border border-amber-900/50 rounded-lg p-6 mb-8 text-zinc-300">
          <h3 className="text-sm font-semibold tracking-wide uppercase text-amber-600/70 mb-3">
            Message from Agent
          </h3>
          <p className="leading-relaxed">
            {session.blocker_message || 'The agent paused execution and is waiting for your input.'}
          </p>
        </div>

        <div className="space-y-4 border-t border-zinc-800 pt-6">
          <Textarea 
            placeholder="Type your response here..."
            className="bg-zinc-950 border-zinc-700 min-h-[120px] text-zinc-200 resize-none focus-visible:ring-1 focus-visible:ring-zinc-600"
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
          />
          <div className="flex justify-end">
            <Button 
              onClick={() => feedbackMutation.mutate()} 
              disabled={!feedback.trim() || feedbackMutation.isLoading}
              className="bg-zinc-100 text-zinc-900 hover:bg-white transition-colors"
            >
              {feedbackMutation.isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Send Feedback
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

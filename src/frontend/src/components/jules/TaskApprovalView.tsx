import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { JulesSession } from '@/hooks/jules/useJulesSession';
import { Textarea } from '@/components/ui/textarea';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Check, X, Edit3, Loader2 } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

export function TaskApprovalView({ sessionId, session }: { sessionId: string; session: JulesSession }) {
  const [isEditing, setIsEditing] = useState(false);
  const [revision, setRevision] = useState('');
  const queryClient = useQueryClient();

  const approvalMutation = useMutation({
    mutationFn: async (action: 'approve' | 'reject' | 'revise') => {
      const response = await fetch('/api/julius/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          action,
          message: action === 'revise' ? revision : undefined
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to ${action} plan`);
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['jules-session', sessionId]);
    }
  });

  const handleApprove = () => approvalMutation.mutate('approve');
  const handleReject = () => approvalMutation.mutate('reject');
  const handleRevise = () => approvalMutation.mutate('revise');

  return (
    <div className="space-y-6">
      <Card className="p-8 bg-zinc-900 border-zinc-800">
        <h2 className="text-2xl font-semibold tracking-tighter text-white mb-6">Plan Approval Required</h2>
        
        <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-6 mb-8">
          <h3 className="text-sm font-semibold tracking-wide uppercase text-zinc-500 mb-4">Proposed Steps</h3>
          <ul className="space-y-3 list-decimal list-inside text-zinc-300">
            {session.plan_steps?.map((step, idx) => (
              <li key={idx} className="leading-relaxed">{step}</li>
            )) || <li className="text-zinc-600">No steps provided by the agent.</li>}
          </ul>
        </div>

        {isEditing ? (
          <div className="space-y-4">
            <Textarea 
              placeholder="Describe the changes you want..."
              className="bg-zinc-950 border-zinc-700 min-h-[120px] text-zinc-200"
              value={revision}
              onChange={(e) => setRevision(e.target.value)}
            />
            <div className="flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setIsEditing(false)} className="text-zinc-400">Cancel</Button>
              <Button 
                onClick={handleRevise} 
                disabled={!revision.trim() || approvalMutation.isLoading}
                className="bg-zinc-100 text-zinc-900 hover:bg-white"
              >
                {approvalMutation.isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Submit Revision
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex gap-4 items-center justify-end border-t border-zinc-800 pt-6">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="border-red-900/30 text-red-500 hover:bg-red-900/20 hover:text-red-400">
                  <X className="mr-2 h-4 w-4" /> Reject
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="bg-zinc-900 border-zinc-800">
                <AlertDialogHeader>
                  <AlertDialogTitle className="text-zinc-100">Reject this plan?</AlertDialogTitle>
                  <AlertDialogDescription className="text-zinc-400">
                    This will mark the task as failed and the agent will stop working on it.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="bg-zinc-800 text-zinc-200 hover:bg-zinc-700 hover:text-white border-zinc-700">Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleReject} className="bg-red-600 hover:bg-red-700 text-white">
                    Yes, reject plan
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <Button variant="outline" onClick={() => setIsEditing(true)} className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white">
              <Edit3 className="mr-2 h-4 w-4" /> Request Changes
            </Button>
            
            <Button onClick={handleApprove} disabled={approvalMutation.isLoading} className="bg-green-600 hover:bg-green-500 text-white">
              {approvalMutation.isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
              Approve Plan
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}

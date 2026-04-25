import { AlertTriangle, RefreshCcw } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { JulesSession } from '@/hooks/jules/useJulesSession';

export function TaskFailedView({ session }: { session: JulesSession }) {
  const handleRetry = async () => {
    // Retry logic endpoint call goes here
    console.log('Retrying session:', session.id);
  };

  return (
    <div className="space-y-6">
      <Card className="p-8 bg-zinc-900 border-red-900/50 flex flex-col items-center justify-center text-center">
        <AlertTriangle className="h-16 w-16 text-red-500 mb-6" />
        <h2 className="text-3xl font-semibold tracking-tighter text-white mb-2">Task Failed</h2>
        <p className="text-zinc-400 max-w-lg mb-8">
          The task encountered an error that prevented it from completing successfully.
        </p>

        <div className="w-full max-w-2xl bg-zinc-950 p-6 rounded-md border border-zinc-800 text-left overflow-hidden">
          <h3 className="text-sm font-semibold tracking-wide uppercase text-zinc-500 mb-3">
            Error Details
          </h3>
          <p className="font-mono text-sm text-red-400 whitespace-pre-wrap break-words">
            {session.error_message || 'An unknown error occurred during execution.'}
          </p>
        </div>

        <div className="mt-8 flex gap-4">
          <Button onClick={handleRetry} className="bg-red-600 hover:bg-red-700 text-white">
            <RefreshCcw className="mr-2 h-4 w-4" /> Retry Task
          </Button>
          <Button variant="outline" className="border-zinc-700 text-zinc-300 hover:text-white">
            View Logs
          </Button>
        </div>
      </Card>
    </div>
  );
}

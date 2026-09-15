import { CheckCircle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { JulesSession } from '@/hooks/jules/useJulesSession';

export function TaskCompletedView({ session }: { session: JulesSession }) {
  return (
    <div className="space-y-6">
      <Card className="p-8 bg-zinc-900 border-zinc-800 flex flex-col items-center justify-center text-center">
        <CheckCircle className="h-16 w-16 text-green-500 mb-6" />
        <h2 className="text-3xl font-semibold tracking-tighter text-white mb-2">Task Completed</h2>
        <p className="text-zinc-400 max-w-lg">
          {session.summary || 'The task was successfully completed with no outstanding issues.'}
        </p>
      </Card>

      {session.evaluation && (
        <Card className="p-6 bg-zinc-950 border-zinc-800">
          <h3 className="text-lg font-medium text-zinc-100 mb-4 tracking-tight">Evaluation Metrics</h3>
          <div className="flex gap-4 items-center">
            <div className="text-4xl font-bold tracking-tighter text-blue-400">
              {session.evaluation.score}/100
            </div>
            <p className="text-zinc-400 border-l border-zinc-800 pl-4">
              {session.evaluation.feedback || 'No detailed feedback provided.'}
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}

import { useParams } from 'react-router-dom';
import { useJulesSession } from '@/hooks/jules/useJulesSession';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { TaskActiveView } from '@/components/jules/TaskActiveView';
import { TaskCompletedView } from '@/components/jules/TaskCompletedView';
import { TaskFailedView } from '@/components/jules/TaskFailedView';
import { TaskApprovalView } from '@/components/jules/TaskApprovalView';
import { TaskFeedbackView } from '@/components/jules/TaskFeedbackView';
import { TaskTimeline } from '@/components/jules/TaskTimeline';
import { Skeleton } from '@/components/ui/skeleton';

export function TaskDetailPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { session, isLoading, error } = useJulesSession(sessionId);

  if (!sessionId) {
    return <div className="p-8 text-center text-zinc-400">No session ID provided.</div>;
  }

  if (isLoading) {
    return (
      <div className="p-8 space-y-4">
        <Skeleton className="h-10 w-1/3 bg-zinc-800" />
        <Skeleton className="h-[400px] w-full bg-zinc-800" />
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="p-8 text-center text-red-400">
        Failed to load session details. {error instanceof Error ? error.message : ''}
      </div>
    );
  }

  const renderOverview = () => {
    switch (session.status) {
      case 'active':
        return <TaskActiveView sessionId={sessionId} session={session} />;
      case 'completed':
        return <TaskCompletedView session={session} />;
      case 'failed':
        return <TaskFailedView session={session} />;
      case 'waiting_for_user':
        // Distinguish between plan approval and general feedback
        if (session.waiting_reason === 'plan_approval') {
          return <TaskApprovalView sessionId={sessionId} session={session} />;
        }
        return <TaskFeedbackView sessionId={sessionId} session={session} />;
      default:
        return (
          <Card className="p-8 text-center bg-zinc-900 border-zinc-800 text-zinc-400">
            Unknown session status: {session.status}
          </Card>
        );
    }
  };

  return (
    <div className="flex-1 min-h-screen bg-zinc-950 text-zinc-100 p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-semibold tracking-tighter">Task: {session.title || sessionId}</h1>
          <p className="text-zinc-400 mt-2">{session.description || 'No description provided.'}</p>
        </div>

        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="bg-zinc-900 border border-zinc-800 mb-6">
            <TabsTrigger value="overview" className="data-[state=active]:bg-zinc-800">Overview</TabsTrigger>
            <TabsTrigger value="activity" className="data-[state=active]:bg-zinc-800">Activity</TabsTrigger>
            <TabsTrigger value="files" className="data-[state=active]:bg-zinc-800">Files Changed</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-0">
            {renderOverview()}
          </TabsContent>

          <TabsContent value="activity" className="mt-0">
            <TaskTimeline sessionId={sessionId} />
          </TabsContent>

          <TabsContent value="files" className="mt-0">
            <Card className="p-8 text-center bg-zinc-900 border-zinc-800 text-zinc-400">
              No files modified yet.
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

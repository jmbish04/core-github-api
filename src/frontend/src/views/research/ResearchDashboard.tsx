import React, { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api-client';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function ResearchDashboard() {
  const [candidates, setCandidates] = useState<any[]>([]);
  const [feedback, setFeedback] = useState<Record<string, { rating: number, context: string }>>({});
  const [topic, setTopic] = useState('topic:cloudflare-worker OR topic:cloudflare-pages');
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  const fetchCandidates = async () => {
    try {
      // Use the newly mounted /api/daily-research endpoint
      const res = await api['daily-research'].candidates.$get();
      if (res.ok) {
        const data = (await res.json()) as any;
        setCandidates(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setInitialLoading(false);
    }
  };

  useEffect(() => { fetchCandidates(); }, []);

  const handleTrigger = async () => {
    setLoading(true);
    try {
      await api['daily-research'].trigger.$post({
        json: { topic }
      });
      toast.success("Swarm dispatched! It will analyze and email you shortly.");
    } catch (err) {
      console.error(err);
      toast.error("Failed to trigger research swarm.");
    } finally {
      setLoading(false);
    }
  };

  const submitFeedback = async (id: string) => {
    const data = feedback[id];
    if (!data?.rating) {
      toast.error("Please provide a rating from 1 to 5.");
      return;
    }

    try {
      await api['daily-research'].feedback[':id'].$post({
        param: { id: encodeURIComponent(id) },
        json: { userRating: data.rating, userFeedback: data.context }
      });
      
      setCandidates(prev => prev.filter((c: any) => c.id !== id));
    } catch (err) {
      console.error(err);
      toast.error("Failed to save feedback.");
    }
  };

  if (initialLoading) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto text-white">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold">Daily Trends (Deep Research)</h1>
          <p className="text-zinc-400">Review AI-surfaced repositories and train the swarm.</p>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <Input 
            value={topic} 
            onChange={e => setTopic(e.target.value)} 
            placeholder="Custom search topic..."
            className="w-full md:w-64 bg-zinc-900 border-zinc-800 text-white"
          />
          <Button onClick={handleTrigger} disabled={loading} className="bg-purple-600 hover:bg-purple-500">
            {loading ? 'Orchestrating...' : 'Run Research'}
          </Button>
        </div>
      </div>

      {candidates.length === 0 ? (
        <div className="py-12 text-center text-zinc-500 border border-dashed border-zinc-800 rounded-lg">
          No new candidates pending review. Trigger a new search!
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {candidates.map((repo: any) => (
            <Card key={repo.id} className="bg-black border border-zinc-800 flex flex-col">
              <CardHeader>
                <CardTitle className="flex justify-between items-center text-lg">
                  <a href={repo.repoUrl} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">
                    {repo.repoName}
                  </a>
                  <span className="text-sm font-normal text-yellow-500">⭐ {repo.stars}</span>
                </CardTitle>
                <p className="text-sm text-zinc-400 mt-2">{repo.description}</p>
              </CardHeader>
              
              <CardContent className="flex-grow">
                <div className="bg-zinc-900 border border-zinc-800 p-3 rounded-md mb-4">
                  <h4 className="text-xs font-bold text-green-400 mb-1 uppercase tracking-wider">🤖 Judge Score: {repo.aiScore}/10</h4>
                  <p className="text-sm text-zinc-300 italic">"{repo.aiReasoning}"</p>
                </div>
                
                <div className="space-y-3 pt-2 border-t border-zinc-800">
                  <label className="text-xs text-zinc-400 font-semibold uppercase tracking-wider">Human in the Loop</label>
                  <div className="flex items-center gap-3">
                    <span className="text-sm">Interest (1-5):</span>
                    <Input 
                      type="number" min="1" max="5" 
                      className="w-20 bg-zinc-900 border-zinc-700 h-8 text-white"
                      onChange={(e) => setFeedback({ ...feedback, [repo.id]: { ...feedback[repo.id], rating: parseInt(e.target.value) } })}
                    />
                  </div>
                  <Textarea 
                    placeholder="Context: Why do you like/dislike this repo? (Trains future AI runs)"
                    className="bg-zinc-900 border-zinc-700 text-sm h-20 text-white"
                    onChange={(e) => setFeedback({ ...feedback, [repo.id]: { ...feedback[repo.id], context: e.target.value } })}
                  />
                </div>
              </CardContent>

              <CardFooter>
                <Button onClick={() => submitFeedback(repo.id)} className="w-full bg-zinc-800 hover:bg-zinc-700 text-white">
                  Save Feedback & Train
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { handleGlobalError } from '@/lib/error-handler';
import { handleGlobalSuccess } from '@/lib/success-handler';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Loader2, Sparkles, Check, X, RotateCcw, Search, GitBranch } from 'lucide-react';

interface NewTaskModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface GithubRepo {
  id: number;
  full_name: string;
  default_branch: string;
  description: string | null;
}

export function NewTaskModal({ open, onOpenChange }: NewTaskModalProps) {
  const navigate = useNavigate();
  const { owner, repo } = useParams();
  const isRepoRoute = Boolean(owner && repo);

  // Form state
  const [prompt, setPrompt] = useState('');
  const [repoless, setRepoless] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState(isRepoRoute ? `${owner}/${repo}` : '');
  const [repoSearch, setRepoSearch] = useState('');
  const [autoPr, setAutoPr] = useState(false);
  const [branch, setBranch] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // AI Enhancement state
  const [enhancedPrompt, setEnhancedPrompt] = useState<string | null>(null);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [enhanceError, setEnhanceError] = useState<string | null>(null);

  // Fetch repos from GitHub API
  const { data: repos, isLoading: reposLoading } = useQuery<GithubRepo[]>({
    queryKey: ['github-repos-search', repoSearch],
    queryFn: async () => {
      const url = new URL('/api/repos', window.location.origin);
      if (repoSearch.trim()) {
        url.searchParams.append('q', repoSearch.trim());
      }
      url.searchParams.append('limit', '20');
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error('Failed to fetch repos');
      const data = await res.json();
      return data.repos ?? data ?? [];
    },
    enabled: !repoless && open,
    staleTime: 30000,
  });

  // Filter repos by search
  const filteredRepos = useMemo(() => {
    if (!repos) return [];
    if (!repoSearch.trim()) return repos;
    const q = repoSearch.toLowerCase();
    return repos.filter(r => r.full_name.toLowerCase().includes(q));
  }, [repos, repoSearch]);

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      setPrompt('');
      setEnhancedPrompt(null);
      setEnhanceError(null);
      setIsSubmitting(false);
      setIsEnhancing(false);
      setRepoless(false);
      setSelectedRepo(isRepoRoute ? `${owner}/${repo}` : '');
      setRepoSearch('');
      setAutoPr(false);
      setBranch('');
    }
  }, [open, isRepoRoute, owner, repo]);

  const handleEnhancePrompt = useCallback(async () => {
    if (!prompt.trim() || prompt.length < 10) return;
    setIsEnhancing(true);
    setEnhanceError(null);

    try {
      const res = await fetch('/api/ai/gateway', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: `You are an expert software engineering prompt enhancer and guardrail enforcer. Take the following task description and rewrite it to be clearer, more specific, and include best practices. Add guardrails, edge cases to handle, and coding standards to follow. Keep it concise but thorough.\n\nOriginal prompt:\n${prompt}\n\nEnhanced prompt:`,
          model: '@cf/meta/llama-3.1-8b-instruct',
          max_tokens: 1024,
        }),
      });

      if (!res.ok) throw new Error('AI enhancement failed');
      const data = await res.json();
      const enhanced = data.result?.response || data.response || data.text || '';
      if (enhanced) {
        setEnhancedPrompt(enhanced);
      } else {
        setEnhanceError('No enhanced prompt returned. Try again.');
      }
    } catch (error) {
      console.error('Enhancement failed:', error);
      setEnhanceError('Failed to enhance prompt. The AI service may be unavailable.');
    } finally {
      setIsEnhancing(false);
    }
  }, [prompt]);

  const handleAcceptEnhanced = () => {
    if (enhancedPrompt) {
      setPrompt(enhancedPrompt);
      setEnhancedPrompt(null);
    }
  };

  const handleRejectEnhanced = () => {
    setEnhancedPrompt(null);
  };

  const handleSubmit = async () => {
    if (!prompt.trim() || prompt.length < 10) return;
    if (!repoless && !selectedRepo) return;

    setIsSubmitting(true);

    try {
      const body: Record<string, unknown> = {
        prompt,
        inject_standards: true,
      };

      if (repoless) {
        body.mode = 'run';
      } else {
        body.repoUrl = `https://github.com/${selectedRepo}`;
        body.autoPr = autoPr;
        body.mode = 'session';
        if (branch.trim()) body.branch = branch.trim();
      }

      const response = await fetch('/api/jules/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error('Failed to start task');
      }

      const result = await response.json();
      const baseUrl = isRepoRoute ? `/repos/${owner}/${repo}/jules` : '/jules';

      handleGlobalSuccess('Task Started', 'Jules is working on your task.');
      onOpenChange(false);

      if (result.sessionId) {
        navigate(`${baseUrl}/tasks/${result.sessionId}`);
      } else {
        navigate(`${baseUrl}/tasks`);
      }
    } catch (error) {
      console.error(error);
      handleGlobalError('Failed to start task. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const canSubmit = prompt.trim().length >= 10 && (repoless || selectedRepo) && !isSubmitting;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl bg-zinc-950 border-zinc-800 text-zinc-100 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">New Task</DialogTitle>
          <DialogDescription className="text-zinc-400">
            Create a new task for Jules to execute.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 mt-2">
          {/* Prompt */}
          <div className="space-y-2">
            <Label className="text-zinc-200">Task Prompt</Label>
            <div className="relative">
              <Textarea
                placeholder="Describe the task you want Jules to perform... (min. 10 chars)"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="min-h-[120px] max-h-[300px] resize-y bg-zinc-900 border-zinc-800 text-zinc-200 pr-12"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute bottom-2 right-2 text-amber-400 hover:text-amber-300 hover:bg-amber-500/10"
                onClick={handleEnhancePrompt}
                disabled={isEnhancing || prompt.trim().length < 10}
                title="Enhance prompt with AI"
              >
                {isEnhancing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
              </Button>
            </div>
            {prompt.length > 0 && prompt.length < 10 && (
              <p className="text-xs text-amber-500">Prompt must be at least 10 characters.</p>
            )}
          </div>

          {/* Enhanced Prompt Proposal */}
          {enhancedPrompt && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <Badge variant="outline" className="text-amber-400 border-amber-500/30">
                  <Sparkles className="w-3 h-3 mr-1" />
                  AI Enhanced Proposal
                </Badge>
              </div>
              <p className="text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed">{enhancedPrompt}</p>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={handleAcceptEnhanced}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <Check className="w-3 h-3 mr-1" />
                  Accept
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setEnhancedPrompt(null)}
                  className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                >
                  <RotateCcw className="w-3 h-3 mr-1" />
                  Revise
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleRejectEnhanced}
                  className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                >
                  <X className="w-3 h-3 mr-1" />
                  Reject
                </Button>
              </div>
            </div>
          )}
          {enhanceError && (
            <p className="text-xs text-red-400">{enhanceError}</p>
          )}

          {/* Repoless Toggle */}
          <div className="flex items-center justify-between rounded-lg border border-zinc-800 p-4">
            <div className="space-y-0.5">
              <Label className="text-zinc-200">Repoless Task</Label>
              <p className="text-xs text-zinc-500">
                Run without a GitHub repository (fire-and-forget mode).
              </p>
            </div>
            <Switch checked={repoless} onCheckedChange={setRepoless} disabled={isRepoRoute} />
          </div>

          {/* Repo Selector */}
          {!repoless && (
            <div className="space-y-2">
              <Label className="text-zinc-200">Repository</Label>
              {isRepoRoute ? (
                <div className="flex items-center gap-2 p-3 rounded-lg border border-zinc-800 bg-zinc-900">
                  <GitBranch className="w-4 h-4 text-zinc-500" />
                  <span className="text-sm text-zinc-200 font-mono">{owner}/{repo}</span>
                  <Badge variant="secondary" className="ml-auto text-[10px]">From route</Badge>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                    <Input
                      placeholder="Search repositories..."
                      value={repoSearch}
                      onChange={(e) => setRepoSearch(e.target.value)}
                      className="pl-9 bg-zinc-900 border-zinc-800 text-zinc-200"
                    />
                  </div>
                  <div className="max-h-48 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-900">
                    {reposLoading ? (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="w-4 h-4 animate-spin text-zinc-500" />
                      </div>
                    ) : filteredRepos.length === 0 ? (
                      <p className="text-sm text-zinc-500 text-center py-4">
                        {repoSearch ? 'No matching repos found.' : 'No repositories available.'}
                      </p>
                    ) : (
                      filteredRepos.map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => setSelectedRepo(r.full_name)}
                          className={`w-full text-left px-3 py-2.5 flex items-center justify-between hover:bg-zinc-800 transition-colors border-b border-zinc-800/50 last:border-b-0 ${
                            selectedRepo === r.full_name ? 'bg-zinc-800' : ''
                          }`}
                        >
                          <div className="min-w-0">
                            <p className="text-sm text-zinc-200 font-mono truncate">{r.full_name}</p>
                            {r.description && (
                              <p className="text-xs text-zinc-500 truncate mt-0.5">{r.description}</p>
                            )}
                          </div>
                          {selectedRepo === r.full_name && (
                            <Check className="w-4 h-4 text-emerald-400 shrink-0 ml-2" />
                          )}
                        </button>
                      ))
                    )}
                  </div>
                  {selectedRepo && (
                    <p className="text-xs text-zinc-400">
                      Selected: <span className="font-mono text-zinc-200">{selectedRepo}</span>
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Advanced Options */}
          {!repoless && (
            <Accordion type="single" className="w-full border border-zinc-800 rounded-lg px-4">
              <AccordionItem value="options" className="border-b-0">
                <AccordionTrigger className="hover:no-underline py-3 text-sm text-zinc-300">
                  Advanced Options
                </AccordionTrigger>
                <AccordionContent className="space-y-4 pb-4">
                  <div className="flex items-center justify-between rounded-lg border border-zinc-800 p-3">
                    <div className="space-y-0.5">
                      <Label className="text-sm text-zinc-200">Auto-PR</Label>
                      <p className="text-xs text-zinc-500">
                        Automatically create a pull request on completion.
                      </p>
                    </div>
                    <Switch checked={autoPr} onCheckedChange={setAutoPr} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm text-zinc-200">Starting Branch (Optional)</Label>
                    <Input
                      placeholder="main"
                      value={branch}
                      onChange={(e) => setBranch(e.target.value)}
                      className="bg-zinc-900 border-zinc-800 text-zinc-200"
                    />
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          )}

          {/* Submit */}
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white"
          >
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {repoless ? 'Run Task' : 'Start Task'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

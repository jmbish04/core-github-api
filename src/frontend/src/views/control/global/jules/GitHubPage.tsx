import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion';
import { RepoSessionList } from '@/components/jules/RepoSessionList';
import { Link } from 'react-router-dom';
import { Github, Plus, GitBranch, Loader2 } from 'lucide-react';
import { useJulesGitHub } from '@/hooks/jules/useJulesGitHub';

export function GitHubPage() {
  const { repos, isLoading, error } = useJulesGitHub();

  return (
    <div className="container max-w-7xl mx-auto py-6 px-4 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100">GitHub Repos</h1>
          <p className="text-sm text-zinc-400 mt-1">
            Connected repositories and recent Jules sessions.
          </p>
        </div>
      </div>

      {/* Loading / Error states */}
      {isLoading && (
        <div className="flex items-center justify-center py-12 text-zinc-500 gap-2">
          <Loader2 className="w-5 h-5 animate-spin" />
          Loading repositories...
        </div>
      )}
      {error ? (
        <div className="text-sm text-red-400 bg-red-950/30 border border-red-900 rounded-md p-3">
          Failed to load repositories: {error instanceof Error ? error.message : String(error)}
        </div>
      ) : null}

      {!isLoading && !error && repos.length === 0 && (
        <div className="text-center py-12 text-zinc-500">
          <Github className="h-8 w-8 mx-auto mb-3 text-zinc-600" />
          <p className="text-sm">No repositories with Jules sessions found.</p>
          <p className="text-xs text-zinc-600 mt-1">Start a Jules task on a repo to see it here.</p>
        </div>
      )}

      {/* Repo list */}
      <Accordion type="single" className="space-y-3">
        {repos.map((repo) => (
          <AccordionItem key={repo.fullName} value={repo.fullName}>
            <Card className="bg-zinc-950 border-zinc-800">
              <CardHeader className="pb-0">
                <AccordionTrigger className="hover:no-underline w-full">
                  <div className="flex items-center justify-between w-full pr-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <Github className="h-5 w-5 text-zinc-400 shrink-0" />
                      <div className="text-left min-w-0">
                        <CardTitle className="text-base font-medium text-zinc-100">
                          {repo.fullName}
                        </CardTitle>
                        <div className="flex items-center gap-2 mt-0.5">
                          <GitBranch className="h-3 w-3 text-zinc-500" />
                          <span className="text-xs text-zinc-500 font-mono">{repo.defaultBranch}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <Badge variant="secondary" className="bg-zinc-800 text-zinc-300 border-zinc-700 text-xs">
                        {repo.sessions.length} sessions
                      </Badge>
                      <Button
                        asChild
                        size="sm"
                        variant="outline"
                        className="border-zinc-700 hover:bg-zinc-800 text-zinc-300 text-xs"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Link to={`/repos/${repo.fullName}/jules/tasks/new`}>
                          <Plus className="h-3 w-3 mr-1" />
                          New Task
                        </Link>
                      </Button>
                    </div>
                  </div>
                </AccordionTrigger>
              </CardHeader>
              <AccordionContent>
                <CardContent className="pt-4">
                  <RepoSessionList sessions={repo.sessions} />
                </CardContent>
              </AccordionContent>
            </Card>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}

export default GitHubPage;

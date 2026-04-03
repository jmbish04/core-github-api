import React from 'react';
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
import { Github, Plus, GitBranch } from 'lucide-react';

interface RepoSession {
  id: string;
  prompt: string;
  status: 'active' | 'completed' | 'failed' | 'waiting_for_user';
  createdAt: string;
  duration?: string;
}

interface ConnectedRepo {
  name: string;
  fullName: string;
  defaultBranch: string;
  sessions: RepoSession[];
}

const mockRepos: ConnectedRepo[] = [
  {
    name: 'core-github-api',
    fullName: 'jmbish04/core-github-api',
    defaultBranch: 'main',
    sessions: [
      {
        id: 'sess-gh-01',
        prompt: 'Refactor the authentication middleware to use JWT refresh tokens',
        status: 'completed',
        createdAt: '2 hours ago',
        duration: '12m 34s',
      },
      {
        id: 'sess-gh-02',
        prompt: 'Fix CORS headers on the API routes for production deployment',
        status: 'active',
        createdAt: '15 mins ago',
        duration: '3m 12s',
      },
    ],
  },
  {
    name: 'jules-dashboard',
    fullName: 'google/jules-dashboard',
    defaultBranch: 'main',
    sessions: [
      {
        id: 'sess-gh-03',
        prompt: 'Add dark mode toggle to the settings panel',
        status: 'completed',
        createdAt: '1 day ago',
        duration: '8m 55s',
      },
      {
        id: 'sess-gh-04',
        prompt: 'Implement real-time notifications using WebSocket',
        status: 'failed',
        createdAt: '3 hours ago',
        duration: '5m 01s',
      },
      {
        id: 'sess-gh-05',
        prompt: 'Write Playwright E2E tests for the onboarding flow',
        status: 'completed',
        createdAt: '5 hours ago',
        duration: '22m 10s',
      },
    ],
  },
  {
    name: 'genai-sdk',
    fullName: 'google/genai-sdk',
    defaultBranch: 'develop',
    sessions: [
      {
        id: 'sess-gh-06',
        prompt: 'Add streaming support for multi-turn conversations',
        status: 'completed',
        createdAt: '6 hours ago',
        duration: '15m 42s',
      },
      {
        id: 'sess-gh-07',
        prompt: 'Update TypeScript types for the new API response format',
        status: 'waiting_for_user',
        createdAt: '1 hour ago',
        duration: '2m 30s',
      },
    ],
  },
  {
    name: 'infra-terraform',
    fullName: 'jmbish04/infra-terraform',
    defaultBranch: 'main',
    sessions: [
      {
        id: 'sess-gh-08',
        prompt: 'Add CloudFront distribution module for static assets',
        status: 'completed',
        createdAt: '2 days ago',
        duration: '18m 03s',
      },
    ],
  },
];

export function GitHubPage() {
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

      {/* Repo list */}
      <Accordion type="single" className="space-y-3">
        {mockRepos.map((repo) => (
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
                        <Link to={`/jules/tasks/new?repo=${encodeURIComponent(repo.fullName)}`}>
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

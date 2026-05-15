/**
 * @file views/session/SessionMonitor.tsx
 * @description Global active-sessions list with three accordion sections.
 *   Filter row, sortable, mobile responsive, dark theme.
 */

'use client';

import { useState, useEffect } from 'react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Search, ArrowUpDown } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface Session {
  id: string;
  kind: string;
  title: string;
  status: 'active' | 'completed' | 'failed';
  createdAt: number;
  completedAt?: number;
  ownerUserId?: string;
}

interface SessionMonitorProps {
  /** Optional API key for fetching sessions */
  apiKey?: string;
  /** Base URL (defaults to window.location.origin) */
  baseUrl?: string;
}

export function SessionMonitor({ apiKey, baseUrl }: SessionMonitorProps) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [filterText, setFilterText] = useState('');
  const [sortBy, setSortBy] = useState<'createdAt' | 'title'>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const base = baseUrl || (typeof window !== 'undefined' ? window.location.origin : '');

  // Fetch sessions on mount
  useEffect(() => {
    fetchSessions();
    const interval = setInterval(fetchSessions, 5000); // Poll every 5s
    return () => clearInterval(interval);
  }, []);

  const fetchSessions = async () => {
    try {
      const response = await fetch(`${base}/api/sessions`, {
        headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      });

      if (response.ok) {
        const data = await response.json();
        setSessions(data.sessions || []);
      }
    } catch (err) {
      console.error('[SessionMonitor] Failed to fetch sessions:', err);
    }
  };

  // Filter and sort sessions
  const filtered = sessions.filter((s) => {
    if (!filterText) return true;
    const lower = filterText.toLowerCase();
    return (
      s.title.toLowerCase().includes(lower) ||
      s.kind.toLowerCase().includes(lower) ||
      s.id.toLowerCase().includes(lower)
    );
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'createdAt') {
      return sortOrder === 'asc'
        ? a.createdAt - b.createdAt
        : b.createdAt - a.createdAt;
    }
    return sortOrder === 'asc'
      ? a.title.localeCompare(b.title)
      : b.title.localeCompare(a.title);
  });

  const active = sorted.filter((s) => s.status === 'active');
  const completed = sorted.filter((s) => s.status === 'completed');
  const failed = sorted.filter((s) => s.status === 'failed');

  const toggleSort = () => {
    setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
  };

  return (
    <Card className="ring-1 ring-border/40">
      <CardHeader>
        <CardTitle>Session Monitor</CardTitle>
        <div className="flex flex-col sm:flex-row gap-2 mt-4">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Filter sessions..."
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              className="pl-8"
            />
          </div>

          <Button variant="outline" size="sm" onClick={toggleSort}>
            <ArrowUpDown className="h-4 w-4 mr-2" />
            {sortBy === 'createdAt' ? 'Date' : 'Title'}
            {sortOrder === 'asc' ? ' ↑' : ' ↓'}
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        <Accordion type="multiple" defaultValue={['active']} className="w-full">
          {/* Active */}
          <AccordionItem value="active">
            <AccordionTrigger>
              Active <Badge variant="outline" className="ml-2">{active.length}</Badge>
            </AccordionTrigger>
            <AccordionContent>
              {active.length === 0 ? (
                <p className="text-sm text-muted-foreground">No active sessions</p>
              ) : (
                <div className="space-y-2">
                  {active.map((session) => (
                    <SessionRow key={session.id} session={session} />
                  ))}
                </div>
              )}
            </AccordionContent>
          </AccordionItem>

          {/* Completed */}
          <AccordionItem value="completed">
            <AccordionTrigger>
              Completed <Badge variant="outline" className="ml-2">{completed.length}</Badge>
            </AccordionTrigger>
            <AccordionContent>
              {completed.length === 0 ? (
                <p className="text-sm text-muted-foreground">No completed sessions</p>
              ) : (
                <div className="space-y-2">
                  {completed.map((session) => (
                    <SessionRow key={session.id} session={session} />
                  ))}
                </div>
              )}
            </AccordionContent>
          </AccordionItem>

          {/* Failed */}
          <AccordionItem value="failed">
            <AccordionTrigger>
              Failed <Badge variant="outline" className="ml-2">{failed.length}</Badge>
            </AccordionTrigger>
            <AccordionContent>
              {failed.length === 0 ? (
                <p className="text-sm text-muted-foreground">No failed sessions</p>
              ) : (
                <div className="space-y-2">
                  {failed.map((session) => (
                    <SessionRow key={session.id} session={session} />
                  ))}
                </div>
              )}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  );
}

function SessionRow({ session }: { session: Session }) {
  const timeAgo = formatDistanceToNow(new Date(session.createdAt), { addSuffix: true });

  return (
    <a
      href={`/sessions/${session.id}`}
      className="flex items-center justify-between p-3 rounded-lg bg-card hover:bg-accent transition-colors ring-1 ring-border/40"
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{session.title}</p>
        <div className="flex items-center gap-2 mt-1">
          <Badge variant="secondary" className="text-xs">
            {session.kind}
          </Badge>
          <span className="text-xs text-muted-foreground">{timeAgo}</span>
        </div>
      </div>

      <div className="ml-4">
        {session.status === 'active' && (
          <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
        )}
        {session.status === 'completed' && (
          <div className="h-2 w-2 rounded-full bg-blue-500" />
        )}
        {session.status === 'failed' && (
          <div className="h-2 w-2 rounded-full bg-red-500" />
        )}
      </div>
    </a>
  );
}

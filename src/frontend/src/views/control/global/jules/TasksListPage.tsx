import React, { useState, useEffect } from 'react';
import { useJulesSessions } from '@/hooks/jules/useJulesSessions';
import { TaskCard } from '@/components/jules/TaskCard';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Search, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';

export interface TasksListPageProps {
  projectId?: string;
  baseUrl?: string;
}

export function TasksListPage({ projectId, baseUrl = '/jules/tasks' }: TasksListPageProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[] | null>(null);
  
  const { sessions, isLoading, error } = useJulesSessions({ projectId });

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch search results when debounced query changes
  useEffect(() => {
    const fetchSearchResults = async () => {
      if (!debouncedSearchQuery.trim()) {
        setSearchResults(null);
        return;
      }
      
      try {
        const url = new URL('/api/julius/search', window.location.origin);
        url.searchParams.append('q', debouncedSearchQuery);
        if (projectId) {
          url.searchParams.append('projectId', projectId);
        }
        
        const res = await fetch(url.toString());
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data);
        }
      } catch (err) {
        console.error('Failed to search tasks:', err);
      }
    };

    fetchSearchResults();
  }, [debouncedSearchQuery, projectId]);

  // Helper to filter sessions
  const getFilteredSessions = (status?: string) => {
    const dataSource = searchResults !== null ? searchResults : sessions;
    if (!status) return dataSource;
    return dataSource.filter((s) => s.status === status);
  };

  const renderSessionGrid = (sessionsToRender: any[]) => {
    if (isLoading) {
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-32 bg-zinc-900 animate-pulse rounded-xl border border-zinc-800" />
          ))}
        </div>
      );
    }

    if (error) {
      return (
        <div className="text-center py-12 text-red-500 bg-red-500/10 rounded-xl border border-red-500/20">
          Failed to load tasks. Please try again.
        </div>
      );
    }

    if (sessionsToRender.length === 0) {
      return (
        <div className="text-center py-16 px-4 bg-zinc-900/50 rounded-xl border border-zinc-800/50">
          <p className="text-zinc-400 mb-4">No tasks found matching your criteria.</p>
          <Button asChild variant="outline" className="border-zinc-700 hover:bg-zinc-800">
            <Link to={`${baseUrl}/new`}>
              <Plus className="w-4 h-4 mr-2" />
              Create a Task
            </Link>
          </Button>
        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sessionsToRender.map((session) => (
          <TaskCard key={session.id} session={session} baseUrl={baseUrl} />
        ))}
      </div>
    );
  };

  return (
    <div className="container max-w-7xl mx-auto py-6 px-4 space-y-8">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100">Tasks</h1>
          <p className="text-sm text-zinc-400 mt-1">
            Manage and monitor your automated engineering tasks.
          </p>
        </div>
        
        <Button asChild className="shrink-0 bg-blue-600 hover:bg-blue-700 text-white">
          <Link to={`${baseUrl}/new`}>
            <Plus className="w-4 h-4 mr-2" />
            New Task
          </Link>
        </Button>
      </div>

      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
        <Input
          placeholder="Search tasks by prompt or ID..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 bg-zinc-950 border-zinc-800 focus-visible:ring-zinc-700 text-zinc-200"
        />
      </div>

      {/* Tabs and Content */}
      <Tabs defaultValue="all" className="w-full">
        <TabsList className="bg-zinc-900 border border-zinc-800 p-1 w-full justify-start overflow-x-auto rounded-lg">
          <TabsTrigger value="all" className="data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-100 px-4 py-1.5 rounded-md">
            All
          </TabsTrigger>
          <TabsTrigger value="active" className="data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-100 px-4 py-1.5 rounded-md">
            Active
          </TabsTrigger>
          <TabsTrigger value="completed" className="data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-100 px-4 py-1.5 rounded-md">
            Completed
          </TabsTrigger>
          <TabsTrigger value="needs_attention" className="data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-100 px-4 py-1.5 rounded-md">
            Needs Attention
          </TabsTrigger>
          <TabsTrigger value="failed" className="data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-100 px-4 py-1.5 rounded-md">
            Failed
          </TabsTrigger>
        </TabsList>

        <div className="mt-6">
          <TabsContent value="all" className="mt-0 outline-none">
            {renderSessionGrid(getFilteredSessions())}
          </TabsContent>
          <TabsContent value="active" className="mt-0 outline-none">
            {renderSessionGrid(getFilteredSessions('active'))}
          </TabsContent>
          <TabsContent value="completed" className="mt-0 outline-none">
            {renderSessionGrid(getFilteredSessions('completed'))}
          </TabsContent>
          <TabsContent value="needs_attention" className="mt-0 outline-none">
            {renderSessionGrid(getFilteredSessions('waiting_for_user'))}
          </TabsContent>
          <TabsContent value="failed" className="mt-0 outline-none">
            {renderSessionGrid(getFilteredSessions('failed'))}
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

export default TasksListPage;

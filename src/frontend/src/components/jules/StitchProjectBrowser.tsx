import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, MonitorSmartphone, Plus, Sparkles, RefreshCw } from 'lucide-react';

interface StitchProject {
  id: string;
  title?: string;
}

interface StitchScreen {
  id: string;
  data?: {
    thumbnailScreenshot?: { downloadUrl?: string };
    htmlContent?: string;
  };
}

interface StitchProjectBrowserProps {
  onSelectScreen: (screenId: string, projectId: string) => void;
}

export function StitchProjectBrowser({ onSelectScreen }: StitchProjectBrowserProps) {
  const [projects, setProjects] = useState<StitchProject[]>([]);
  const [screensMap, setScreensMap] = useState<Record<string, StitchScreen[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [newProjectTitle, setNewProjectTitle] = useState('');
  const [creatingProject, setCreatingProject] = useState(false);
  
  // Generate screen state
  const [genPrompt, setGenPrompt] = useState('');
  const [genProjectId, setGenProjectId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const fetchProjects = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/jules/examples/stitch/projects');
      if (!res.ok) throw new Error('Failed to fetch projects');
      const data = await res.json();
      setProjects(data.projects || []);
    } catch (error) {
      console.error('Failed to fetch Stitch projects:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const fetchScreens = async (projectId: string) => {
    if (screensMap[projectId]) return; // Already loaded
    try {
      const res = await fetch(`/api/jules/examples/stitch/projects/${projectId}/screens`);
      if (!res.ok) throw new Error('Failed to fetch screens');
      const data = await res.json();
      setScreensMap(prev => ({ ...prev, [projectId]: data.screens || [] }));
    } catch (error) {
      console.error(`Failed to fetch screens for project ${projectId}:`, error);
    }
  };

  const handleCreateProject = async () => {
    if (!newProjectTitle.trim()) return;
    setCreatingProject(true);
    try {
      const res = await fetch('/api/jules/examples/stitch/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newProjectTitle }),
      });
      if (!res.ok) throw new Error('Failed to create project');
      setNewProjectTitle('');
      await fetchProjects();
    } catch (error) {
      console.error('Failed to create project:', error);
    } finally {
      setCreatingProject(false);
    }
  };

  const handleGenerateScreen = async (projectId: string) => {
    if (!genPrompt.trim()) return;
    setGenerating(true);
    try {
      const res = await fetch(`/api/jules/examples/stitch/projects/${projectId}/screens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: genPrompt, deviceType: 'DESKTOP' }),
      });
      if (!res.ok) throw new Error('Failed to generate screen');
      setGenPrompt('');
      setGenProjectId(null);
      // Refresh screens for this project
      setScreensMap(prev => { const copy = { ...prev }; delete copy[projectId]; return copy; });
      await fetchScreens(projectId);
    } catch (error) {
      console.error('Failed to generate screen:', error);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Card className="w-full bg-zinc-900 border-zinc-800 text-zinc-100">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <MonitorSmartphone className="w-5 h-5 text-indigo-400" />
              Stitch Projects
            </CardTitle>
            <CardDescription className="text-zinc-400">
              Browse and generate design screens from your Stitch workspace.
            </CardDescription>
          </div>
          <Button variant="ghost" size="icon" onClick={fetchProjects} className="text-zinc-400 hover:text-zinc-200">
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* New Project */}
        <div className="flex gap-2">
          <Input
            placeholder="New project title..."
            value={newProjectTitle}
            onChange={(e) => setNewProjectTitle(e.target.value)}
            className="bg-zinc-950 border-zinc-800 text-zinc-200"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={handleCreateProject}
            disabled={creatingProject || !newProjectTitle.trim()}
            className="border-zinc-700 hover:bg-zinc-800 text-zinc-300 shrink-0"
          >
            {creatingProject ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          </Button>
        </div>

        {isLoading ? (
          <div className="flex justify-center items-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
          </div>
        ) : projects.length === 0 ? (
          <p className="text-sm text-zinc-500 text-center py-6">No Stitch projects found. Create one above.</p>
        ) : (
          <Accordion type="single" className="w-full">
            {projects.map((project) => (
              <AccordionItem key={project.id} value={project.id} className="border-zinc-800">
                <AccordionTrigger
                  className="hover:no-underline hover:bg-zinc-800/50 px-2 rounded-md transition-colors"
                >
                  <span className="text-sm">{project.title || `Project ${project.id.slice(0, 8)}`}</span>
                </AccordionTrigger>
                <AccordionContent className="pt-4 px-2 space-y-4">
                  <ScreenLoader projectId={project.id} fetchScreens={fetchScreens} />
                  {/* Generate Screen Prompt */}
                  <div className="flex gap-2">
                    <Textarea
                      placeholder="Describe a screen to generate..."
                      value={genProjectId === project.id ? genPrompt : ''}
                      onChange={(e) => { setGenProjectId(project.id); setGenPrompt(e.target.value); }}
                      className="bg-zinc-950 border-zinc-800 text-zinc-200 min-h-[60px] text-sm"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleGenerateScreen(project.id)}
                      disabled={generating || !genPrompt.trim() || genProjectId !== project.id}
                      className="border-zinc-700 hover:bg-zinc-800 text-zinc-300 shrink-0 self-end"
                    >
                      {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    </Button>
                  </div>

                  {/* Screens Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {screensMap[project.id] ? (
                      screensMap[project.id].length === 0 ? (
                        <p className="text-zinc-500 text-sm col-span-full text-center py-4">No screens yet. Generate one above.</p>
                      ) : (
                        screensMap[project.id].map((screen) => (
                          <Card
                            key={screen.id}
                            className="bg-zinc-950 border-zinc-800 overflow-hidden cursor-pointer hover:border-indigo-500/50 transition-colors"
                            onClick={() => onSelectScreen(screen.id, project.id)}
                          >
                            <div className="aspect-video bg-zinc-900 relative flex items-center justify-center">
                              {screen.data?.thumbnailScreenshot?.downloadUrl ? (
                                <img src={screen.data.thumbnailScreenshot.downloadUrl} alt="Screen preview" className="object-cover w-full h-full" />
                              ) : (
                                <MonitorSmartphone className="w-8 h-8 text-zinc-700" />
                              )}
                            </div>
                            <div className="p-3">
                              <p className="text-sm font-medium text-zinc-200 truncate">{screen.id.slice(0, 12)}...</p>
                            </div>
                          </Card>
                        ))
                      )
                    ) : (
                      <div className="flex justify-center items-center py-4 col-span-full">
                        <Loader2 className="w-5 h-5 animate-spin text-zinc-600" />
                      </div>
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </CardContent>
    </Card>
  );
}

/** Triggers screen fetch when the accordion content mounts (i.e., when opened). Renders nothing. */
function ScreenLoader({ projectId, fetchScreens }: { projectId: string; fetchScreens: (id: string) => Promise<void> }) {
  useEffect(() => {
    fetchScreens(projectId);
  }, [projectId, fetchScreens]);
  return null;
}

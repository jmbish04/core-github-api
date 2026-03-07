import React, { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';

// Reusing types locally for component props
interface Step { number: number; title: string; status: string; }
interface Task { task_number: number; task_title: string; status: string; agent_assigned?: string; steps: Step[]; }
interface Phase { phase_number: number; phase_title: string; description: string; tasks: Task[]; }
interface ProjectPlan { id: string; project_name: string; generated_date: string; total_phases: number; phases: Phase[]; }

export default function WorkshopProjectViewer() {
  const [projects, setProjects] = useState<ProjectPlan[]>([]);

  useEffect(() => {
    fetch('/api/projects/tasks')
      .then((res) => res.json())
      .then((data) => setProjects(data as ProjectPlan[]))
      .catch((err) => console.error('Error fetching workshop project plans:', err));
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'complete': return 'bg-green-600/20 text-green-400 border-green-800';
      case 'started': return 'bg-blue-600/20 text-blue-400 border-blue-800';
      case 'scaffold_complete': return 'bg-indigo-600/20 text-indigo-400 border-indigo-800';
      case 'pending_success_criteria_signoff': return 'bg-yellow-600/20 text-yellow-400 border-yellow-800';
      case 'blocked': return 'bg-red-600/20 text-red-400 border-red-800';
      default: return 'bg-slate-800 text-slate-400 border-slate-700';
    }
  };

  if (projects.length === 0) return <div className="p-6 text-slate-400">Loading Workshop Plans...</div>;

  return (
    <div className="p-6 bg-slate-950 min-h-screen text-slate-50">
      {projects.map((project) => (
        <div key={project.id} className="mb-12">
          <div className="mb-8 border-b border-slate-800 pb-4">
            <h1 className="text-3xl font-bold tracking-tight">{project.project_name}</h1>
            <p className="text-slate-400 mt-2">Generated: {new Date(project.generated_date).toLocaleString()} • {project.total_phases} Phases</p>
          </div>

          <Accordion type="multiple" className="w-full space-y-4">
            {project.phases.map((phase) => (
              <AccordionItem key={phase.phase_number} value={`phase-${phase.phase_number}`} className="border-slate-800 border rounded-lg bg-slate-900/50 px-4">
                <AccordionTrigger className="hover:no-underline py-4 text-left">
                  <div className="flex flex-col gap-1">
                    <span className="text-xl font-semibold text-slate-200">Phase {phase.phase_number}: {phase.phase_title}</span>
                    <span className="text-sm text-slate-500 font-normal">{phase.description}</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pt-2 pb-6 space-y-4">
                  {phase.tasks.map((task) => (
                    <Card key={task.task_number} className="bg-slate-900 border-slate-700">
                      <CardHeader className="pb-3">
                        <div className="flex justify-between items-start">
                          <div>
                            <CardTitle className="text-base font-medium text-slate-200">
                              Task {task.task_number}: {task.task_title}
                            </CardTitle>
                            {task.agent_assigned && (
                              <CardDescription className="mt-1 text-slate-400">Agent: {task.agent_assigned}</CardDescription>
                            )}
                          </div>
                          <Badge variant="outline" className={getStatusColor(task.status)}>
                            {task.status.replace(/_/g, ' ').toUpperCase()}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          <p className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-2">Execution Steps</p>
                          {task.steps.map((step) => (
                            <div key={step.number} className="flex items-center justify-between text-sm py-1 border-b border-slate-800 last:border-0">
                              <span className="text-slate-300">
                                <span className="text-slate-500 mr-2">{step.number}</span>
                                {step.title}
                              </span>
                              <Badge variant="outline" className={`text-xs ${getStatusColor(step.status)}`}>
                                {step.status}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      ))}
    </div>
  );
}

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { SkillCard, Skill } from '@/components/jules/SkillCard';
import { CreateSkillDialog } from '@/components/jules/CreateSkillDialog';
import { ImportSkillsDialog } from '@/components/jules/ImportSkillsDialog';
import { Plus, Download } from 'lucide-react';

const initialSkills: Skill[] = [
  {
    id: 'skill-1',
    name: 'Code Review',
    description: 'Analyzes pull requests for code quality, security issues, and best practices. Provides inline suggestions.',
    triggers: ['review', 'code review', 'PR review'],
    instructions: 'When triggered, fetch the PR diff and analyze each changed file for potential issues.',
    enabled: true,
  },
  {
    id: 'skill-2',
    name: 'Test Generator',
    description: 'Generates unit and integration tests based on source code analysis. Supports Vitest and Jest.',
    triggers: ['test', 'generate tests', 'write tests'],
    instructions: 'Analyze the target module, identify edge cases, and generate comprehensive test suites.',
    enabled: true,
  },
  {
    id: 'skill-3',
    name: 'Documentation Writer',
    description: 'Creates and updates JSDoc comments, README files, and API documentation from code.',
    triggers: ['docs', 'document', 'jsdoc', 'readme'],
    instructions: 'Scan exported functions and types, generate documentation following the project style.',
    enabled: false,
  },
  {
    id: 'skill-4',
    name: 'Refactor Assistant',
    description: 'Suggests and applies refactoring patterns to improve code structure and readability.',
    triggers: ['refactor', 'clean up', 'simplify'],
    instructions: 'Identify code smells, propose refactoring strategies, and apply changes incrementally.',
    enabled: true,
  },
  {
    id: 'skill-5',
    name: 'Deploy Monitor',
    description: 'Watches deployment pipelines and reports status, errors, and rollback recommendations.',
    triggers: ['deploy', 'deployment', 'ship', 'release'],
    instructions: 'Monitor CI/CD pipeline status and provide real-time updates on deployment progress.',
    enabled: false,
  },
];

export function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>(initialSkills);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);

  const handleToggle = (id: string) => {
    setSkills((prev) =>
      prev.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s))
    );
  };

  const handleCreateSkill = (data: { name: string; description: string; triggers: string[]; instructions: string }) => {
    const newSkill: Skill = {
      id: `skill-${Date.now()}`,
      ...data,
      enabled: true,
    };
    setSkills((prev) => [...prev, newSkill]);
  };

  const handleImportSkills = (imported: { id: string; name: string; description: string }[]) => {
    const newSkills: Skill[] = imported.map((s) => ({
      id: `skill-imp-${Date.now()}-${s.id}`,
      name: s.name,
      description: s.description,
      triggers: [s.name.toLowerCase()],
      instructions: '',
      enabled: true,
    }));
    setSkills((prev) => [...prev, ...newSkills]);
  };

  return (
    <div className="container max-w-7xl mx-auto py-6 px-4 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100">Skills</h1>
          <p className="text-sm text-zinc-400 mt-1">
            Configure agent capabilities and trigger patterns.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setImportDialogOpen(true)}
            className="border-zinc-700 hover:bg-zinc-800 text-zinc-300"
          >
            <Download className="w-4 h-4 mr-2" />
            Import from GitHub
          </Button>
          <Button
            onClick={() => setCreateDialogOpen(true)}
            className="bg-zinc-100 text-zinc-900 hover:bg-zinc-200"
          >
            <Plus className="w-4 h-4 mr-2" />
            Create Skill
          </Button>
        </div>
      </div>

      {/* Skills grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {skills.map((skill) => (
          <SkillCard key={skill.id} skill={skill} onToggle={handleToggle} />
        ))}
      </div>

      {/* Dialogs */}
      <CreateSkillDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSave={handleCreateSkill}
      />
      <ImportSkillsDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        onImport={handleImportSkills}
      />
    </div>
  );
}

export default SkillsPage;

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { SkillCard } from '@/components/jules/SkillCard';
import type { Skill } from '@/components/jules/SkillCard';
import { CreateSkillDialog } from '@/components/jules/CreateSkillDialog';
import { ImportSkillsDialog } from '@/components/jules/ImportSkillsDialog';
import { Plus, Download, Loader2, Sprout } from 'lucide-react';
import { useSkills, useCreateSkill, useDeleteSkill, useSeedSkills } from '@/hooks/jules/useSkills';

/** Map backend Skill shape to frontend SkillCard shape */
function toCardSkill(s: { id: string; name: string; description: string; markdownContent: string }): Skill {
  return {
    id: s.id,
    name: s.name,
    description: s.description,
    triggers: [s.name.toLowerCase().replace(/\s+/g, '-')],
    instructions: s.markdownContent,
    enabled: true,
  };
}

export function SkillsPage() {
  const { skills: rawSkills, isLoading, error } = useSkills();
  const createSkill = useCreateSkill();
  const deleteSkill = useDeleteSkill();
  const seedSkills = useSeedSkills();

  const [enabledOverrides, setEnabledOverrides] = useState<Record<string, boolean>>({});
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);

  const skills: Skill[] = rawSkills.map((s) => {
    const card = toCardSkill(s);
    if (s.id in enabledOverrides) card.enabled = enabledOverrides[s.id];
    return card;
  });

  const handleToggle = (id: string) => {
    setEnabledOverrides((prev) => ({ ...prev, [id]: !(prev[id] ?? true) }));
  };

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this skill?')) {
      deleteSkill.mutate(id);
    }
  };

  const handleCreateSkill = (data: { name: string; description: string; triggers: string[]; instructions: string }) => {
    createSkill.mutate({
      name: data.name,
      description: data.description,
      markdownContent: data.instructions,
    });
  };

  const handleImportSkills = (imported: { id: string; name: string; description: string }[]) => {
    for (const s of imported) {
      createSkill.mutate({
        name: s.name,
        description: s.description,
        markdownContent: '',
      });
    }
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
            onClick={() => seedSkills.mutate()}
            disabled={seedSkills.isPending}
            className="border-zinc-700 hover:bg-zinc-800 text-zinc-300"
          >
            {seedSkills.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Sprout className="w-4 h-4 mr-2" />
            )}
            Seed Defaults
          </Button>
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

      {/* Loading / Error states */}
      {isLoading && (
        <div className="flex items-center justify-center py-12 text-zinc-500 gap-2">
          <Loader2 className="w-5 h-5 animate-spin" />
          Loading skills...
        </div>
      )}
      {error ? (
        <div className="text-sm text-red-400 bg-red-950/30 border border-red-900 rounded-md p-3">
          Failed to load skills: {error instanceof Error ? error.message : String(error)}
        </div>
      ) : null}

      {/* Skills grid */}
      {!isLoading && !error && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {skills.length === 0 ? (
            <p className="text-sm text-zinc-500 col-span-full text-center py-8">
              No skills configured yet. Create one, import from GitHub, or seed defaults.
            </p>
          ) : (
            skills.map((skill) => (
              <SkillCard
                key={skill.id}
                skill={skill}
                onToggle={handleToggle}
                onDelete={handleDelete}
              />
            ))
          )}
        </div>
      )}

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

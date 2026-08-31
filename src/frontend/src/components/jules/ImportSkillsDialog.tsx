import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Search, Download } from 'lucide-react';

interface AvailableSkill {
  id: string;
  name: string;
  description: string;
}

const mockAvailableSkills: AvailableSkill[] = [
  { id: 'imp-1', name: 'Lint Fixer', description: 'Auto-fix ESLint and Prettier issues' },
  { id: 'imp-2', name: 'Test Generator', description: 'Generate unit tests from source files' },
  { id: 'imp-3', name: 'Dependency Updater', description: 'Check and update outdated dependencies' },
  { id: 'imp-4', name: 'Migration Writer', description: 'Generate database migration scripts' },
];

interface ImportSkillsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (skills: AvailableSkill[]) => void;
}

export function ImportSkillsDialog({ open, onOpenChange, onImport }: ImportSkillsDialogProps) {
  const [repoUrl, setRepoUrl] = useState('');
  const [searched, setSearched] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const handleSearch = () => {
    if (repoUrl.trim()) {
      setSearched(true);
      setSelectedIds(new Set());
    }
  };

  const toggleSkill = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleImport = () => {
    const selected = mockAvailableSkills.filter((s) => selectedIds.has(s.id));
    onImport(selected);
    setRepoUrl('');
    setSearched(false);
    setSelectedIds(new Set());
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-950 border-zinc-800 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-zinc-100">Import Skills from GitHub</DialogTitle>
          <DialogDescription className="text-zinc-400">
            Enter a repository URL to discover available skills.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="import-repo" className="text-zinc-300">Repository URL</Label>
            <div className="flex gap-2">
              <Input
                id="import-repo"
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                placeholder="https://github.com/org/skills-repo"
                className="bg-zinc-900 border-zinc-800 text-zinc-200 flex-1"
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleSearch}
                className="border-zinc-700 hover:bg-zinc-800 text-zinc-300 shrink-0"
              >
                <Search className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {searched && (
            <div className="space-y-2">
              <p className="text-sm text-zinc-400">Found {mockAvailableSkills.length} skills:</p>
              <div className="space-y-1.5 max-h-60 overflow-y-auto">
                {mockAvailableSkills.map((skill) => (
                  <label
                    key={skill.id}
                    className="flex items-start gap-3 p-3 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-700 cursor-pointer transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(skill.id)}
                      onChange={() => toggleSkill(skill.id)}
                      className="mt-0.5 rounded border-zinc-600 bg-zinc-800 text-zinc-100"
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-zinc-200">{skill.name}</p>
                      <p className="text-xs text-zinc-500">{skill.description}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-zinc-700 hover:bg-zinc-800 text-zinc-300"
          >
            Cancel
          </Button>
          {searched && (
            <Button
              type="button"
              onClick={handleImport}
              disabled={selectedIds.size === 0}
              className="bg-zinc-100 text-zinc-900 hover:bg-zinc-200"
            >
              <Download className="h-4 w-4 mr-1.5" />
              Import ({selectedIds.size})
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

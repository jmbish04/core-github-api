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
import { Textarea } from '@/components/ui/textarea';

interface CreateSkillDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (skill: { name: string; description: string; triggers: string[]; instructions: string }) => void;
}

export function CreateSkillDialog({ open, onOpenChange, onSave }: CreateSkillDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [triggersInput, setTriggersInput] = useState('');
  const [instructions, setInstructions] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({
      name: name.trim(),
      description: description.trim(),
      triggers: triggersInput.split(',').map((t) => t.trim()).filter(Boolean),
      instructions: instructions.trim(),
    });
    setName('');
    setDescription('');
    setTriggersInput('');
    setInstructions('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-950 border-zinc-800 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-zinc-100">Create Skill</DialogTitle>
          <DialogDescription className="text-zinc-400">
            Define a new agent skill with trigger patterns and instructions.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="skill-name" className="text-zinc-300">Name</Label>
            <Input
              id="skill-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Code Review"
              className="bg-zinc-900 border-zinc-800 text-zinc-200"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="skill-description" className="text-zinc-300">Description</Label>
            <Input
              id="skill-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Reviews pull requests for best practices"
              className="bg-zinc-900 border-zinc-800 text-zinc-200"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="skill-triggers" className="text-zinc-300">Trigger Patterns</Label>
            <Input
              id="skill-triggers"
              value={triggersInput}
              onChange={(e) => setTriggersInput(e.target.value)}
              placeholder="review, code review, PR check"
              className="bg-zinc-900 border-zinc-800 text-zinc-200"
            />
            <p className="text-xs text-zinc-500">Comma-separated keywords that activate this skill.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="skill-instructions" className="text-zinc-300">Instructions</Label>
            <Textarea
              id="skill-instructions"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="When triggered, analyze the code diff and provide feedback on..."
              className="bg-zinc-900 border-zinc-800 text-zinc-200 resize-none"
              rows={5}
            />
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
            <Button type="submit" className="bg-zinc-100 text-zinc-900 hover:bg-zinc-200">
              Create Skill
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

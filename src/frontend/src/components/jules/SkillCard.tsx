import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Zap } from 'lucide-react';

export interface Skill {
  id: string;
  name: string;
  description: string;
  triggers: string[];
  instructions: string;
  enabled: boolean;
}

interface SkillCardProps {
  skill: Skill;
  onToggle: (id: string) => void;
}

export function SkillCard({ skill, onToggle }: SkillCardProps) {
  return (
    <Card className={`bg-zinc-950 border-zinc-800 transition-colors ${skill.enabled ? 'hover:border-zinc-700' : 'opacity-60'}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Zap className={`h-4 w-4 shrink-0 ${skill.enabled ? 'text-zinc-300' : 'text-zinc-600'}`} />
            <CardTitle className="text-base font-medium text-zinc-100 truncate">
              {skill.name}
            </CardTitle>
          </div>
          <Switch
            checked={skill.enabled}
            onCheckedChange={() => onToggle(skill.id)}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-zinc-400 line-clamp-2">{skill.description}</p>
        <div className="flex flex-wrap gap-1.5">
          {skill.triggers.map((trigger) => (
            <Badge
              key={trigger}
              variant="outline"
              className="text-xs border-zinc-700 text-zinc-400 bg-zinc-900"
            >
              {trigger}
            </Badge>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

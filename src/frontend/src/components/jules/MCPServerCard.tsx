import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Pencil, Trash2, Wifi } from 'lucide-react';
import { MCPServer } from '@/stores/useJulesMCPStore';

interface MCPServerCardProps {
  server: MCPServer;
  onEdit: (server: MCPServer) => void;
  onDelete: (id: string) => void;
  onTestConnection: (id: string) => void;
}

export function MCPServerCard({ server, onEdit, onDelete, onTestConnection }: MCPServerCardProps) {
  return (
    <Card className="bg-zinc-950 border-zinc-800 hover:border-zinc-700 transition-colors">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`h-2.5 w-2.5 rounded-full shrink-0 ${
                server.status === 'connected'
                  ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.4)]'
                  : 'bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.4)]'
              }`}
            />
            <CardTitle className="text-base font-medium text-zinc-100 truncate">
              {server.name}
            </CardTitle>
          </div>
          <Badge variant="secondary" className="shrink-0 text-xs bg-zinc-800 text-zinc-300 border-zinc-700">
            {server.toolCount} tools
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <p className="text-xs font-mono text-zinc-500 truncate">{server.url}</p>
          {server.description && (
            <p className="text-sm text-zinc-400 line-clamp-2">{server.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2 pt-1">
          <Button
            variant="outline"
            size="sm"
            className="border-zinc-700 hover:bg-zinc-800 text-zinc-300 text-xs"
            onClick={() => onTestConnection(server.id)}
          >
            <Wifi className="h-3 w-3 mr-1.5" />
            Test
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="border-zinc-700 hover:bg-zinc-800 text-zinc-300 text-xs"
            onClick={() => onEdit(server)}
          >
            <Pencil className="h-3 w-3 mr-1.5" />
            Edit
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="border-zinc-700 hover:bg-red-950 text-zinc-400 hover:text-red-400 text-xs"
            onClick={() => onDelete(server.id)}
          >
            <Trash2 className="h-3 w-3 mr-1.5" />
            Delete
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

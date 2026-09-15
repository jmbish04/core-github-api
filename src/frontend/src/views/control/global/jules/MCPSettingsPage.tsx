import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { MCPServerCard } from '@/components/jules/MCPServerCard';
import { AddMCPServerDialog } from '@/components/jules/AddMCPServerDialog';
import { useJulesMCPStore, MCPServer } from '@/stores/useJulesMCPStore';
import { Plus, Server } from 'lucide-react';

export function MCPSettingsPage() {
  const { servers, addServer, updateServer, removeServer, toggleStatus } = useJulesMCPStore();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingServer, setEditingServer] = useState<MCPServer | null>(null);

  const handleOpenAdd = () => {
    setEditingServer(null);
    setDialogOpen(true);
  };

  const handleEdit = (server: MCPServer) => {
    setEditingServer(server);
    setDialogOpen(true);
  };

  const handleSave = (data: { name: string; url: string; authToken?: string; description?: string }) => {
    if (editingServer) {
      updateServer(editingServer.id, data);
    } else {
      addServer(data);
    }
    setEditingServer(null);
  };

  const handleDelete = (id: string) => {
    removeServer(id);
  };

  const handleTestConnection = (id: string) => {
    // Simulate connection test by toggling status
    toggleStatus(id);
  };

  return (
    <div className="container max-w-7xl mx-auto py-6 px-4 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100">MCP Settings</h1>
          <p className="text-sm text-zinc-400 mt-1">
            Manage Model Context Protocol server connections and tools.
          </p>
        </div>
        <Button
          onClick={handleOpenAdd}
          className="shrink-0 bg-zinc-100 text-zinc-900 hover:bg-zinc-200"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Server
        </Button>
      </div>

      {/* Server grid */}
      {servers.length === 0 ? (
        <div className="text-center py-16 px-4 bg-zinc-900/50 rounded-xl border border-zinc-800/50">
          <Server className="h-10 w-10 mx-auto mb-3 text-zinc-600" />
          <p className="text-zinc-400 mb-4">No MCP servers configured yet.</p>
          <Button
            variant="outline"
            onClick={handleOpenAdd}
            className="border-zinc-700 hover:bg-zinc-800 text-zinc-300"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Your First Server
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {servers.map((server) => (
            <MCPServerCard
              key={server.id}
              server={server}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onTestConnection={handleTestConnection}
            />
          ))}
        </div>
      )}

      {/* Dialog */}
      <AddMCPServerDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSave={handleSave}
        editingServer={editingServer}
      />
    </div>
  );
}

export default MCPSettingsPage;

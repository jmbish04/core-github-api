import React, { useState, useEffect } from 'react';
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
import type { MCPServer } from '@/stores/useJulesMCPStore';

interface AddMCPServerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (server: { name: string; url: string; authToken?: string; description?: string }) => void;
  editingServer?: MCPServer | null;
}

export function AddMCPServerDialog({ open, onOpenChange, onSave, editingServer }: AddMCPServerDialogProps) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [authToken, setAuthToken] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (editingServer) {
      setName(editingServer.name);
      setUrl(editingServer.url);
      setAuthToken(editingServer.authToken || '');
      setDescription(editingServer.description || '');
    } else {
      setName('');
      setUrl('');
      setAuthToken('');
      setDescription('');
    }
  }, [editingServer, open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !url.trim()) return;
    onSave({
      name: name.trim(),
      url: url.trim(),
      authToken: authToken.trim() || undefined,
      description: description.trim() || undefined,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-950 border-zinc-800 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-zinc-100">
            {editingServer ? 'Edit MCP Server' : 'Add MCP Server'}
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            Configure a Model Context Protocol server connection.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="mcp-name" className="text-zinc-300">Name</Label>
            <Input
              id="mcp-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My MCP Server"
              className="bg-zinc-900 border-zinc-800 text-zinc-200"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="mcp-url" className="text-zinc-300">URL</Label>
            <Input
              id="mcp-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://mcp.example.com/sse"
              className="bg-zinc-900 border-zinc-800 text-zinc-200"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="mcp-token" className="text-zinc-300">Auth Token</Label>
            <Input
              id="mcp-token"
              type="password"
              value={authToken}
              onChange={(e) => setAuthToken(e.target.value)}
              placeholder="Optional bearer token"
              className="bg-zinc-900 border-zinc-800 text-zinc-200"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="mcp-description" className="text-zinc-300">Description</Label>
            <Textarea
              id="mcp-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this server provide?"
              className="bg-zinc-900 border-zinc-800 text-zinc-200 resize-none"
              rows={3}
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
              {editingServer ? 'Save Changes' : 'Add Server'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

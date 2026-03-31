import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Loader2, Trash2, Plus, Server } from "lucide-react";

interface SyncSecretsConfigProps {
  repoSecretDefaults: RepoSecretDefault[];
  onConfigChanged: () => void;
}

interface CFSecret {
  name: string;
  id: string;
  created_at: string;
}

interface RepoSecretDefault {
  id: string;
  secretName: string;
  description: string | null;
  isActive: boolean;
}

export function SyncSecretsConfig({ repoSecretDefaults, onConfigChanged }: SyncSecretsConfigProps) {
  const [allSecrets, setAllSecrets] = useState<CFSecret[]>([]);
  const [loadingSecrets, setLoadingSecrets] = useState(false);
  
  // Create New Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newValue, setNewValue] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  // Multi-select state
  const [selectedToAdd, setSelectedToAdd] = useState<string[]>([]);
  const [isUpdating, setIsUpdating] = useState(false);

  const API_BASE = "/api/config";

  const activeDefaultSecrets = repoSecretDefaults
    .filter((entry) => entry.isActive)
    .map((entry) => entry.secretName);

  useEffect(() => {
    fetchSecrets();
  }, []);

  const fetchSecrets = async () => {
    setLoadingSecrets(true);
    try {
      const res = await fetch(`${API_BASE}/secrets/all`);
      if (res.ok) {
        const json = (await res.json()) as any;
        setAllSecrets(json.secrets || []);
      }
    } catch (e) {
      console.error("Failed to fetch all secrets", e);
    } finally {
      setLoadingSecrets(false);
    }
  };

  const handleUnset = async (secretNameToRemove: string) => {
    setIsUpdating(true);
    try {
      const res = await fetch(`${API_BASE}/repo-secret-defaults/${encodeURIComponent(secretNameToRemove)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to remove secret default");
      await onConfigChanged();
    } catch (e) {
      console.error("Failed to unset secret", e);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleAddExisting = async () => {
    if (selectedToAdd.length === 0) return;
    setIsUpdating(true);
    try {
      const results = await Promise.all(
        selectedToAdd.map((secretName) =>
          fetch(`${API_BASE}/repo-secret-defaults`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ secretName }),
          }),
        ),
      );

      if (results.some((response) => !response.ok)) {
        throw new Error("Failed to add one or more repository secret defaults");
      }

      setSelectedToAdd([]);
      await onConfigChanged();
    } catch (e) {
      console.error("Failed to add existing secrets", e);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleCreateNew = async () => {
    if (!newName || !newValue) return;
    setIsCreating(true);
    try {
      const res = await fetch(`${API_BASE}/secrets/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName,
          value: newValue,
          description: newDesc // Only used in UI/API transit, Cloudflare doesn't store it
        })
      });
      if (!res.ok) throw new Error("Failed to create secret");
      
      // Successfully created and automatically added to repository secret defaults by backend
      await fetchSecrets();
      onConfigChanged(); // Refresh parent config to show new active defaults
      
      setIsModalOpen(false);
      setNewName("");
      setNewValue("");
      setNewDesc("");
    } catch (e) {
      console.error("Failed to create new secret", e);
    } finally {
      setIsCreating(false);
    }
  };

  const availableToAdd = allSecrets.filter(s => !activeDefaultSecrets.includes(s.name));

  const toggleSelection = (name: string) => {
      setSelectedToAdd(prev => 
          prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]
      );
  };

  return (
    <div className="mt-8 space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-2 flex items-center gap-2">
            <Server className="h-5 w-5" />
            Repo Environment Secrets to Sync by Default
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
            Manage which Cloudflare Secrets Store secrets are automatically pushed to GitHub repositories 
            when standardizing or syncing repos.
        </p>
      </div>

      {/* 1. Active Default Secrets List */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Secret Name (Configured as Default)</TableHead>
              <TableHead className="w-[100px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {activeDefaultSecrets.length === 0 ? (
                <TableRow>
                    <TableCell colSpan={2} className="text-center text-muted-foreground py-6">
                        No default secrets configured.
                    </TableCell>
                </TableRow>
            ) : (
                activeDefaultSecrets.map((name: string) => (
                <TableRow key={name}>
                    <TableCell className="font-mono text-sm">{name}</TableCell>
                    <TableCell className="text-right">
                    <Button 
                        size="sm" 
                        variant="destructive" 
                        onClick={() => handleUnset(name)}
                        disabled={isUpdating}
                    >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Unset
                    </Button>
                    </TableCell>
                </TableRow>
                ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col md:flex-row gap-6 pt-4 border-t">
          {/* 2. Add Existing */}
          <div className="flex-1 space-y-4">
              <h3 className="font-medium text-sm">Add Existing Cloudflare Secrets</h3>
              <div className="border rounded-md p-2 h-[200px] overflow-y-auto bg-muted/20">
                  {loadingSecrets ? (
                      <div className="flex justify-center items-center h-full">
                          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      </div>
                  ) : availableToAdd.length === 0 ? (
                      <div className="flex justify-center items-center h-full text-sm text-muted-foreground">
                          All cloudflare secrets are already set as defaults.
                      </div>
                  ) : (
                    <div className="space-y-1">
                        {availableToAdd.map(secret => (
                            <div 
                              key={secret.id} 
                              className="flex items-center space-x-2 p-2 hover:bg-muted rounded cursor-pointer"
                              onClick={() => toggleSelection(secret.name)}
                            >
                                <input 
                                  type="checkbox" 
                                  checked={selectedToAdd.includes(secret.name)}
                                  onChange={() => toggleSelection(secret.name)}
                                  className="h-4 w-4 rounded border-gray-300 pointer-events-none"
                                />
                                <Label className="font-mono text-sm cursor-pointer">{secret.name}</Label>
                            </div>
                        ))}
                    </div>
                  )}
              </div>
              <Button 
                onClick={handleAddExisting} 
                className="w-full" 
                disabled={isUpdating || selectedToAdd.length === 0}
              >
                  {isUpdating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                  Set Selected ({selectedToAdd.length}) as Defaults
              </Button>
          </div>

          {/* 3. Create New Modal */}
          <div className="flex-1 space-y-4 flex flex-col justify-end">
             <div className="bg-muted p-4 rounded-md text-sm mb-auto">
                 <p className="mb-2 font-medium">Need a new secret?</p>
                 <p className="text-muted-foreground">
                     Directly provision a new API key into the Cloudflare Secrets Store and automatically add it to this repository sync list.
                 </p>
             </div>

             <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                <DialogTrigger asChild>
                    <Button variant="outline" className="w-full border-primary/50 text-foreground">
                        <Plus className="h-4 w-4 mr-2" />
                        Create New Secret Store Secret
                    </Button>
                </DialogTrigger>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Provision Cloudflare Secret</DialogTitle>
                        <DialogDescription>
                            Create a new secret in the Cloudflare Store. It will be immediately set as a default sync secret.
                        </DialogDescription>
                    </DialogHeader>
                    
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>Secret Name</Label>
                            <Input 
                              placeholder="e.g. STRIPE_API_KEY" 
                              value={newName} 
                              onChange={e => setNewName(e.target.value.toUpperCase())}
                              className="font-mono"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Secret Value</Label>
                            <Input 
                              type="text"
                              autoComplete="off"
                              data-lpignore="true"
                              data-1p-ignore="true"
                              data-form-type="other"
                              spellCheck={false}
                              placeholder="sk_live_..." 
                              value={newValue} 
                              onChange={e => setNewValue(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Description <span className="text-xs text-muted-foreground">(UI Reference Only)</span></Label>
                            <Input 
                              placeholder="Production API Key for Stripe" 
                              value={newDesc} 
                              onChange={e => setNewDesc(e.target.value)}
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancel</Button>
                        <Button 
                          onClick={handleCreateNew} 
                          disabled={!newName || !newValue || isCreating}
                        >
                            {isCreating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : "Save to Cloudflare"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
          </div>
      </div>
    </div>
  );
}

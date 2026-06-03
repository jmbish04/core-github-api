import React, { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Trash2, Search, PlusCircle } from "lucide-react";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface RepoSyncConfig {
  id: string;
  fileName: string;
  targetRepoPattern: string;
  triggerEvents: string;
  isActive: boolean;
  createdAt: string;
}

interface RepoSearchResult {
  owner: string;
  name: string;
  fullName: string;
}

export function StandardizationConfig() {
  const [configs, setConfigs] = useState<RepoSyncConfig[]>([]);
  const [availableFiles, setAvailableFiles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // New config state
  const [newFileName, setNewFileName] = useState("");
  const [newTargetPattern, setNewTargetPattern] = useState("*");
  const [isAdding, setIsAdding] = useState(false);

  // Search/Delete state
  const [searchFileName, setSearchFileName] = useState("");
  const [searchResults, setSearchResults] = useState<RepoSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isDeleting, setIsDeleting] = useState<string | null>(null); // tracks repo being deleted
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [configsRes, filesRes] = await Promise.all([
        fetch("/api/standardization/configs"),
        fetch("/api/standardization/files")
      ]);

      if (!configsRes.ok || !filesRes.ok) throw new Error("Failed to load initial data");

      const configsData = await configsRes.json();
      const filesData = await filesRes.json();

      setConfigs(configsData.configs || []);
      setAvailableFiles(filesData.files || []);
    } catch (e: any) {
      toast.error(e.message || "Failed to load standardization config");
    } finally {
      setLoading(false);
    }
  };

  const handleAddConfig = async () => {
    if (!newFileName || !newTargetPattern) {
      toast.error("Please provide a file name and target pattern");
      return;
    }

    setIsAdding(true);
    try {
      const res = await fetch("/api/standardization/configs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: newFileName,
          targetRepoPattern: newTargetPattern,
          triggerEvents: ["push", "pull_request"]
        })
      });
      if (!res.ok) throw new Error("Failed to create configuration");
      
      toast.success("Standardization config added");
      setNewFileName("");
      setNewTargetPattern("*");
      fetchData();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setIsAdding(false);
    }
  };

  const handleDeleteConfig = async (id: string) => {
    if (!confirm("Are you sure you want to delete this config?")) return;
    try {
      const res = await fetch(`/api/standardization/configs/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete configuration");
      toast.success("Configuration deleted");
      fetchData();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchFileName) return;

    setIsSearching(true);
    try {
      const res = await fetch("/api/standardization/search-repos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: searchFileName })
      });
      if (!res.ok) throw new Error("Failed to search repositories");
      const data = await res.json();
      setSearchResults(data.repos || []);
      toast.success(`Found ${data.totalCount || data.repos.length} matching repositories`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setIsSearching(false);
    }
  };

  const handleBulkDelete = async (selectedRepos?: string[]) => {
    const reposToDelete = selectedRepos || searchResults.map(r => r.fullName);
    if (!reposToDelete.length) return;
    
    if (!confirm(`Are you sure you want to delete ${searchFileName} from ${reposToDelete.length} repositories?`)) return;

    const isSingle = reposToDelete.length === 1;
    if (isSingle) setIsDeleting(reposToDelete[0]);
    else setIsBulkDeleting(true);

    try {
      const res = await fetch("/api/standardization/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repos: reposToDelete,
          fileName: searchFileName
        })
      });
      if (!res.ok) throw new Error("Failed to execute bulk delete");
      
      const data = await res.json();
      const successes = data.results.filter((r: any) => r.success).length;
      toast.success(`Successfully deleted from ${successes}/${reposToDelete.length} repositories.`);
      
      // Remove successful deletions from UI
      const successfulRepos = data.results.filter((r: any) => r.success).map((r: any) => r.repo);
      setSearchResults(prev => prev.filter(r => !successfulRepos.includes(r.fullName)));
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setIsDeleting(null);
      setIsBulkDeleting(false);
    }
  };

  if (loading) {
    return <div className="flex h-48 items-center justify-center"><Loader2 className="animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Repository File Synchronization</CardTitle>
          <CardDescription>
            Configure which files from the <code className="bg-muted px-1 rounded">core-github-standardization</code> repository should be automatically synced to your other repositories.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-end gap-4 whitespace-nowrap">
            <div className="flex-1 space-y-2">
              <label className="text-sm font-medium">Standard Repository File</label>
              <Select value={newFileName} onValueChange={setNewFileName}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a file to sync..." />
                </SelectTrigger>
                <SelectContent>
                  {availableFiles.map(file => (
                    <SelectItem key={file} value={file}>{file}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 space-y-2">
              <label className="text-sm font-medium">Target Repositories (Regex / Glob)</label>
              <Input 
                value={newTargetPattern} 
                onChange={e => setNewTargetPattern(e.target.value)} 
                placeholder="e.g. *, frontend-*, backend-*" 
              />
            </div>
            <Button onClick={handleAddConfig} disabled={isAdding}>
              {isAdding ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <PlusCircle className="w-4 h-4 mr-2" />}
              Add Config
            </Button>
          </div>

          <div className="rounded-md border">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted bg-opacity-50 text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">File Name</th>
                  <th className="px-4 py-3 font-medium">Target Pattern</th>
                  <th className="px-4 py-3 font-medium">Triggers</th>
                  <th className="px-4 py-3 font-medium w-24">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {configs.map((config) => (
                  <tr key={config.id} className="hover:bg-muted/50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs">{config.fileName}</td>
                    <td className="px-4 py-3 font-mono text-xs">{config.targetRepoPattern}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{config.triggerEvents}</td>
                    <td className="px-4 py-3">
                      <Button aria-label="Delete config" title="Delete config" variant="ghost" size="icon" onClick={() => handleDeleteConfig(config.id)} className="h-8 w-8 text-destructive hover:bg-destructive/10">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {configs.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                      No synchronization configurations created yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cross-Repository File Pruning</CardTitle>
          <CardDescription>
            Search for legacy files across all your organization's repositories and optionally delete them in bulk from the default branch.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <form onSubmit={handleSearch} className="flex gap-4">
            <div className="flex-1">
              <Input 
                value={searchFileName}
                onChange={e => setSearchFileName(e.target.value)}
                placeholder="Exact file name to search for (e.g. .github/workflows/old-ci.yaml)"
              />
            </div>
            <Button type="submit" variant="secondary" disabled={isSearching || !searchFileName}>
              {isSearching ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Search className="w-4 h-4 mr-2" />}
              Search Ownership
            </Button>
          </form>

          {searchResults.length > 0 && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="font-medium text-sm">Found in {searchResults.length} repositories</h3>
                <Button 
                  variant="destructive" 
                  size="sm"
                  disabled={isBulkDeleting}
                  onClick={() => handleBulkDelete()}
                >
                  {isBulkDeleting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
                  Delete from All {searchResults.length} Repos
                </Button>
              </div>
              <div className="rounded-md border max-h-[400px] overflow-y-auto">
                <table className="w-full text-sm text-left">
                  <tbody className="divide-y">
                    {searchResults.map((repo) => (
                      <tr key={repo.fullName} className="hover:bg-muted/50 transition-colors">
                        <td className="px-4 py-3 font-medium">{repo.fullName}</td>
                        <td className="px-4 py-3 text-right">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            disabled={isDeleting === repo.fullName}
                            onClick={() => handleBulkDelete([repo.fullName])}
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          >
                            {isDeleting === repo.fullName ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
                            Delete File
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

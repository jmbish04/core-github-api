import React, { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Download, UploadCloud, RefreshCw } from "lucide-react";
import { handleGlobalError } from "@/lib/error-handler";
import { handleGlobalSuccess } from "@/lib/success-handler";

interface Skill {
  id: string;
  name: string;
  description: string;
  githubPath: string | null;
  updatedAt: string;
}

export function SkillsManager() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [ingestOwner, setIngestOwner] = useState("google-labs-code");
  const [ingestRepo, setIngestRepo] = useState("stitch-skills");
  const [ingestPath, setIngestPath] = useState("skills");
  const [ingestBranch, setIngestBranch] = useState("main");
  const [actionLoading, setActionLoading] = useState(false);

  const fetchSkills = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/skills");
      if (res.ok) {
        const data = await res.json();
        setSkills(data.skills || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSkills();
  }, []);

  const handleAction = async (url: string, body?: any) => {
    try {
      setActionLoading(true);
      const res = await fetch(url, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const errorText = await res.text();
        console.error("Action failed:", errorText);
        handleGlobalError(new Error(`Action failed: ${errorText}`));
      } else {
        fetchSkills();
        handleGlobalSuccess("Action Successful");
      }
    } catch (e: any) {
      console.error(e);
      handleGlobalError(e);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-card p-6 rounded-xl border shadow-sm">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Agent Skills</h2>
          <p className="text-muted-foreground mt-1">Manage, ingest, and synchronize markdown skills with GitHub.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => handleAction("/api/skills/seed")} disabled={actionLoading}>
            <Download className="mr-2 h-4 w-4" /> Seed Defaults
          </Button>
          <Button onClick={() => handleAction("/api/skills/sync")} disabled={actionLoading}>
            <UploadCloud className="mr-2 h-4 w-4" /> Sync to GitHub
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Ingest Repository</CardTitle>
          <CardDescription>Target a GitHub repository containing SKILL.md files to ingest into D1.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="space-y-1">
              <label htmlFor="ingest-owner" className="text-sm text-muted-foreground">Owner / Org</label>
              <Input 
                id="ingest-owner"
                placeholder="google-labs-code" 
                value={ingestOwner} 
                onChange={(e) => setIngestOwner(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="ingest-repo" className="text-sm text-muted-foreground">Repository</label>
              <Input 
                id="ingest-repo"
                placeholder="stitch-skills" 
                value={ingestRepo} 
                onChange={(e) => setIngestRepo(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="ingest-path" className="text-sm text-muted-foreground">Target Path</label>
              <Input 
                id="ingest-path"
                placeholder="skills" 
                value={ingestPath} 
                onChange={(e) => setIngestPath(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="ingest-branch" className="text-sm text-muted-foreground">Branch</label>
              <Input 
                id="ingest-branch"
                placeholder="main" 
                value={ingestBranch} 
                onChange={(e) => setIngestBranch(e.target.value)}
              />
            </div>
          </div>
          <Button 
            variant="secondary" 
            onClick={() => handleAction("/api/skills/ingest-structured", { 
              owner: ingestOwner, 
              repo: ingestRepo, 
              path: ingestPath, 
              branch: ingestBranch 
            })} 
            disabled={actionLoading || !ingestOwner || !ingestRepo}
            className="w-full"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${actionLoading ? 'animate-spin' : ''}`} />
            Ingest Skills
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Installed Skills ({skills.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
             <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Source Path</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {skills.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground py-8">No skills found. Seed defaults or ingest a repository.</TableCell>
                  </TableRow>
                ) : (
                  skills.map(s => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium whitespace-nowrap">{s.name}</TableCell>
                      <TableCell className="truncate max-w-sm">{s.description}</TableCell>
                      <TableCell className="text-muted-foreground truncate max-w-[200px]">{s.githubPath || "Local"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

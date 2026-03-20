import React, { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PlaySquare, GitCommitVertical, Loader2 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import ReactMarkdown from "react-markdown";

interface DeploymentsListProps {
  projectId: string;
  deployments?: Array<{
    id: string;
    createdAt: string;
    source: string;
  }>;
}

export function DeploymentsList({ projectId, deployments = [] }: DeploymentsListProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [analysisText, setAnalysisText] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const handleAnalyze = async (deploymentId: string) => {
    setSelectedId(deploymentId);
    setAnalysisText(null);
    setIsAnalyzing(true);
    
    try {
      const res = await fetch(`/api/projects/${projectId}/analyze-deployment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deploymentId })
      });
      
      const data = (await res.json()) as any;
      if (!res.ok) throw new Error(data?.error || "Failed to analyze component");
      setAnalysisText(data?.analysis || "Analysis completed with no output.");
    } catch (e: any) {
      setAnalysisText(`**Error analyzing logs:**\n\n${e.message}`);
    } finally {
      setIsAnalyzing(false);
    }
  };
  if (!deployments.length) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center border rounded-md border-dashed">
        <GitCommitVertical className="h-8 w-8 text-muted-foreground mb-4" />
        <p className="text-muted-foreground">No recent deployments recorded by Cloudflare.</p>
      </div>
    );
  }

  // Helper date
  const formatDate = (ds: string) => {
    try {
      return new Date(ds).toLocaleString();
    } catch {
      return ds;
    }
  };

  return (
    <div className="space-y-4 border rounded-md divide-y">
      {deployments.map((dep) => (
        <Card key={dep.id} className="border-0 shadow-none rounded-none bg-transparent">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <Badge variant="outline" className="font-mono bg-muted/50">
                  {dep.id.substring(0, 8)}
                </Badge>
                <span className="text-sm font-medium">{dep.source}</span>
                <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                  Success
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">Deployed at {formatDate(dep.createdAt)}</p>
            </div>
            
            <Button 
              variant="outline" 
              size="sm" 
              className="hidden sm:flex" 
              onClick={() => handleAnalyze(dep.id)}
            >
              <PlaySquare className="mr-2 h-4 w-4" />
              Analyze Failure
            </Button>
          </CardContent>
        </Card>
      ))}

      <Sheet open={!!selectedId} onOpenChange={(open) => !open && setSelectedId(null)}>
        <SheetContent className="sm:max-w-[600px] w-[90vw] p-0 flex flex-col">
          <SheetHeader className="p-6 pb-4 border-b shrink-0">
            <SheetTitle className="flex items-center gap-2">
              <PlaySquare className="h-5 w-5 text-blue-500" />
              AI Deployment Analysis
            </SheetTitle>
            <SheetDescription>
              Identifying root causes in Cloudflare edge build and execution logs via AI Gateway.
            </SheetDescription>
          </SheetHeader>
          
          <ScrollArea className="flex-1">
            <div className="p-6">
              {isAnalyzing ? (
                <div className="flex flex-col items-center justify-center py-20 text-muted-foreground space-y-4">
                  <Loader2 className="h-8 w-8 animate-spin" />
                  <p>Processing logs through Cloudflare AI Gateway...</p>
                </div>
              ) : analysisText ? (
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <ReactMarkdown>{analysisText}</ReactMarkdown>
                </div>
              ) : null}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </div>
  );
}

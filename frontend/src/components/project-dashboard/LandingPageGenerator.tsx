/**
 * @file frontend/src/components/project-dashboard/LandingPageGenerator.tsx
 */

import React, { useState, useEffect, useRef } from "react";
import { Loader2, Send, Sparkles, Layout } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// RPC Client
import { api } from "@/lib/api-client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

type LandingPageGeneratorProps = {
  projectId: string;
  projectName: string;
};

export function LandingPageGenerator({ projectId, projectName }: LandingPageGeneratorProps) {
  const [html, setHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [status, setStatus] = useState("Idle");
  
  // WebSocket Reference for Real-time Status
  const socket = useRef<WebSocket | null>(null);

  useEffect(() => {
    // Initialize WebSocket connection for realtime status
    const wsBaseUrl = import.meta.env.PUBLIC_WS_URL || 'ws://localhost:8787';
    const wsUrl = `${wsBaseUrl}/ws?projectId=${projectId}`;
    console.log("Connecting to WS:", wsUrl);
    
    socket.current = new WebSocket(wsUrl);

    socket.current.onopen = () => {
        console.log("WS Connected");
        setStatus("Connected");
    };

    socket.current.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'STATUS_UPDATE') {
            setStatus(data.message);
            if (data.progress === 100) toast.success("AI Synthesis Complete");
        }
      } catch (e) {
        console.error("WS Parse Error", e);
      }
    };

    socket.current.onclose = () => {
        console.log("WS Closed");
    }

    return () => {
        if (socket.current) {
            socket.current.close();
        }
    };
  }, [projectId]);

  const generatePreview = async (refinementPrompt?: string) => {
    setLoading(true);
    
    // RPC Implementation - Fully Type-Safe
    // Note: 'landing-generator' is mounted at /api/landing-generator
    // The route definition in backend/src/routes/api/landing-generator.ts likely has /preview
    // Let's assume the path is correct based on AppType.
    
    try {
        const res = await api['landing-generator'][':projectId'].preview.$post({
          param: { projectId },
          json: { 
            prompt: refinementPrompt || `Generate a landing page for ${projectName}`,
            config: {} 
          }
        });

        if (!res.ok) {
             throw new Error("Backend error");
        }

        const data = await res.json();
        if (data.html) {
            setHtml(data.html);
            toast.success("Preview updated");
        }
    } catch (err) {
        toast.error("Communication error with backend isolate");
        console.error(err);
    } finally {
        setLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-[80vh]">
      <Card className="flex flex-col border-l-4 border-l-purple-500">
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-500" />
              Real-time Generator
            </CardTitle>
            <div className="text-[10px] font-mono px-2 py-1 bg-muted rounded">
              STATUS: {status.toUpperCase()}
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col space-y-4">
           <ScrollArea className="flex-1 border rounded-md p-4 bg-muted/20">
             {/* Chat/History components go here - placeholder for now */}
             <div className="text-sm text-muted-foreground p-4 text-center">
                Enter a prompt to generate or refine the landing page.
                <br/>
                Project: {projectName}
             </div>
           </ScrollArea>
           
           <div className="flex gap-2">
              <Input 
                placeholder="Ask the agent to modify the UI..." 
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !loading && generatePreview(prompt)}
              />
              <Button onClick={() => generatePreview(prompt)} disabled={loading}>
                {loading ? <Loader2 className="animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
           </div>
        </CardContent>
      </Card>

      <Card className="bg-zinc-950 overflow-hidden relative">
        {html ? (
          <iframe srcDoc={html} className="w-full h-full border-0 bg-white" title="Preview" />
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-2">
            <Layout className="h-8 w-8 opacity-50" />
            <span>Awaiting Frame Synthesis...</span>
          </div>
        )}
        {loading && (
             <div className="absolute inset-0 bg-background/50 backdrop-blur-sm flex items-center justify-center">
                 <Loader2 className="animate-spin h-8 w-8 text-purple-500" />
             </div>
        )}
      </Card>
    </div>
  );
}
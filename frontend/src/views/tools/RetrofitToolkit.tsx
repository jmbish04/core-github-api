import React, { useState, useEffect } from "react";
import { useAgent } from "agents/react";
import { ChatComposer } from "../../components/cloudflare-chat/ChatComposer";
import { Thread } from "@assistant-ui/react";
import { Card, CardHeader, CardTitle, CardContent } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Textarea } from "../../components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "../../components/ui/popover";
import { Loader2, ArrowRight } from "lucide-react";
import { Badge } from "../../components/ui/badge";

export function RetrofitToolkit() {
  const agentId = "default-retrofit-thread"; // Or read from URL

  // Connect to the DO WebSocket
  const agent = useAgent({ agent: "RetrofitAgent" });
  const chat = { runtime: undefined as any, agentState: agent.state as any, append: (msg: any) => { agent.chat(msg.content) } };

  // Extract custom state sent via this.setState() in the agent
  const agentState = chat.agentState || {};
  const draftPrompt = agentState.draftPrompt || "No draft prompt available yet. Request an analysis to begin.";
  const versionNumber = agentState.versionNumber || 0;
  const julesStatus = agentState.julesStatus || "idle";
  const repoName = agentState.repoName;

  const [selectedText, setSelectedText] = useState("");
  const [commentText, setCommentText] = useState("");
  const [queuedComments, setQueuedComments] = useState<Array<{selectedText: string, comment: string}>>([]);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [popoverPos, setPopoverPos] = useState({ top: 0, left: 0 });

  const handleMouseUp = (e: React.MouseEvent) => {
    const selection = window.getSelection();
    if (selection && selection.toString().trim() !== "") {
      setSelectedText(selection.toString());

      // Calculate position for popover (simple implementation)
      setPopoverPos({
        top: e.clientY,
        left: e.clientX
      });
      setPopoverOpen(true);
    }
  };

  const handleAddComment = () => {
    if (selectedText && commentText) {
      setQueuedComments([...queuedComments, { selectedText, comment: commentText }]);
      setCommentText("");
      setPopoverOpen(false);
      window.getSelection()?.removeAllRanges();
    }
  };

  const handleSubmitComments = async () => {
     if(queuedComments.length === 0) return;

     // Directly call the agent tool via a system message or function call
     // We append a hidden message to trigger the tool
     chat.append({
         role: 'user',
         content: `Apply the following inline comments to the draft:\n${JSON.stringify(queuedComments)}`
     });

     setQueuedComments([]);
  };

  return (
    <div className="flex h-screen w-full bg-background text-foreground overflow-hidden">
      {/* Sidebar: Assistant UI */}
      <div className="w-[40%] border-r border-border h-full flex flex-col">
          <div className="p-4 border-b border-border bg-muted/20">
             <h2 className="text-lg font-bold">Retrofit Agent</h2>
             <p className="text-sm text-muted-foreground">Architecting repos for Cloudflare Workers</p>
          </div>
          <div className="flex-1 overflow-hidden relative">
              <div className="flex-1 flex flex-col p-4 space-y-4"><div className="flex-1 overflow-auto">Chat history goes here...</div><ChatComposer onSend={(msg) => chat.append({role: "user", content: msg})} isRunning={false} onCancel={() => {}} /></div>
          </div>
      </div>

      {/* Main Canvas: Prompt & Jules Status */}
      <div className="w-[60%] h-full flex flex-col bg-muted/10 relative">
         <div className="p-4 border-b border-border flex justify-between items-center bg-background">
             <div>
                <h2 className="text-xl font-semibold">Implementation Plan</h2>
                <div className="flex gap-2 mt-1">
                   <Badge variant="outline">Version {versionNumber}</Badge>
                   {repoName && <Badge variant="secondary">{repoName}</Badge>}
                </div>
             </div>
             <div>
                 {queuedComments.length > 0 && (
                    <Button onClick={handleSubmitComments} className="flex gap-2">
                        Submit {queuedComments.length} Review Comments
                    </Button>
                 )}
             </div>
         </div>

         <div className="flex-1 overflow-auto p-8" onMouseUp={handleMouseUp}>
            {/* The Draft Prompt Canvas */}
            <div className="prose prose-sm dark:prose-invert max-w-none bg-card p-6 rounded-lg border border-border shadow-sm whitespace-pre-wrap font-mono text-sm leading-relaxed">
               {draftPrompt}
            </div>

            {/* Hidden Popover Anchor mapped to mouse coords */}
            <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
                <PopoverTrigger asChild>
                    <div style={{ position: 'fixed', top: popoverPos.top, left: popoverPos.left, width: 1, height: 1 }} />
                </PopoverTrigger>
                <PopoverContent className="w-80">
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <h4 className="font-medium text-sm">Add Comment</h4>
                            <p className="text-xs text-muted-foreground bg-muted p-2 rounded border border-border italic truncate">
                                "{selectedText}"
                            </p>
                        </div>
                        <Textarea
                            placeholder="What should be changed here?"
                            value={commentText}
                            onChange={(e) => setCommentText(e.target.value)}
                            className="min-h-[80px] text-sm"
                        />
                        <div className="flex justify-end gap-2">
                            <Button variant="ghost" size="sm" onClick={() => setPopoverOpen(false)}>Cancel</Button>
                            <Button size="sm" onClick={handleAddComment}>Queue Comment</Button>
                        </div>
                    </div>
                </PopoverContent>
            </Popover>
         </div>

         {/* Generative UI / Status Card */}
         {julesStatus !== "idle" && (
             <div className="absolute bottom-6 right-6 w-96">
                 <JulesStatusCard status={julesStatus} sessionId={agentState.julesSessionId} />
             </div>
         )}
      </div>
    </div>
  );
}

function JulesStatusCard({ status, sessionId }: { status: string, sessionId?: string }) {
   return (
       <Card className="border-primary/50 shadow-lg shadow-primary/10">
           <CardHeader className="pb-2">
               <CardTitle className="text-sm flex items-center gap-2">
                   {status === "In Progress" || status === "PR Review" ? (
                       <Loader2 className="h-4 w-4 animate-spin text-primary" />
                   ) : (
                       <div className="h-2 w-2 rounded-full bg-green-500" />
                   )}
                   Jules Execution Status
               </CardTitle>
           </CardHeader>
           <CardContent>
               <div className="flex flex-col gap-2">
                  <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">Status</span>
                      <span className="font-medium">{status}</span>
                  </div>
                  {sessionId && (
                     <div className="flex justify-between items-center text-sm">
                        <span className="text-muted-foreground">Session ID</span>
                        <span className="font-mono text-xs">{sessionId.substring(0,8)}...</span>
                     </div>
                  )}
                  {status === "PR Review" && (
                      <div className="mt-2 p-2 bg-yellow-500/10 text-yellow-500 rounded text-xs flex justify-between items-center border border-yellow-500/20">
                          Reviewing PR comments
                          <ArrowRight className="h-3 w-3" />
                      </div>
                  )}
                  {status === "Merged" && (
                      <div className="mt-2 p-2 bg-green-500/10 text-green-500 rounded text-xs flex justify-between items-center border border-green-500/20">
                          Implementation Merged!
                          <ArrowRight className="h-3 w-3" />
                      </div>
                  )}
               </div>
           </CardContent>
       </Card>
   )
}

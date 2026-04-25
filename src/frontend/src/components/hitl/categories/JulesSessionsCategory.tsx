import React, { useState, useEffect } from "react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";

export function JulesSessionsCategory() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedbackMap, setFeedbackMap] = useState<Record<string, string>>({});

  const fetchItems = async () => {
    try {
      const res = await api.api.hitl.category[":category"].$get({
        param: { category: "jules_session_dispatch" }
      });
      if (res.ok) {
        const data = await res.json();
        setItems(data.items);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
  }, []);

  const handleApprove = async (id: string) => {
    try {
      const promptFeedback = feedbackMap[id] || undefined;
      const res = await api.api.hitl[":id"].approve.$post({
        param: { id },
        json: { feedback: promptFeedback }
      });
      if (res.ok) {
        fetchItems();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleReject = async (id: string) => {
      try {
        const res = await api.api.hitl[":id"].reject.$post({
          param: { id },
          json: { reason: feedbackMap[id] || "Manually rejected" }
        });
        if (res.ok) {
          fetchItems();
        }
      } catch (e) {
        console.error(e);
      }
  };

  if (loading) return <div className="text-zinc-500 animate-pulse">Loading Jules sessions queue...</div>;

  return (
    <div className="space-y-6">
      {items.map((item) => {
         const payload = item.proposedPayload ? JSON.parse(item.proposedPayload) : {};
         const isPending = item.status === 'pending';
         
         return (
         <div key={item.id} className="border border-zinc-800 bg-zinc-950 rounded-lg p-6 flex flex-col space-y-4">
            <div className="flex justify-between items-start">
               <div>
                  <h3 className="text-lg font-medium text-white mb-1">Session Dispatch for {payload.repoFullName || "Unknown Repo"}</h3>
                  <Badge variant={isPending ? "outline" : "secondary"}>{item.status}</Badge>
               </div>
               <span className="text-sm text-zinc-500">{new Date(item.createdAt).toLocaleString()}</span>
            </div>
            
            <div className="space-y-2">
               <h4 className="text-sm font-semibold text-zinc-300">Proposed Prompt</h4>
               <div className="bg-zinc-900 border border-zinc-800 rounded p-4 text-sm font-mono text-zinc-300 whitespace-pre-wrap">
                  {payload.proposedPrompt || "No prompt available"}
               </div>
            </div>

            {isPending && (
               <div className="space-y-2 pt-2 border-t border-zinc-900">
                  <h4 className="text-sm font-semibold text-zinc-300">Human Feedback / Overrides</h4>
                  <Textarea 
                    placeholder="Enter manual feedback to append to the prompt before dispatching..."
                    value={feedbackMap[item.id] || ""}
                    onChange={(e) => setFeedbackMap({ ...feedbackMap, [item.id]: e.target.value })}
                    className="font-mono text-sm bg-zinc-900"
                  />
                  <div className="flex space-x-3 pt-2">
                    <Button onClick={() => handleApprove(item.id)} variant="default">Approve & Dispatch</Button>
                    <Button onClick={() => handleReject(item.id)} variant="destructive">Reject</Button>
                  </div>
               </div>
            )}
         </div>
      )})}
      
      {items.length === 0 && (
         <div className="text-center py-10 border border-dashed border-zinc-800 rounded-lg">
            <p className="text-muted-foreground">No pending Jules Sessions to approve.</p>
         </div>
      )}
    </div>
  );
}

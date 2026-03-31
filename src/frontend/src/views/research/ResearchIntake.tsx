import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function ResearchIntake() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    requirements: "",
    depth: "deep", // default
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch("/api/research/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
           // Auth header handled by interceptor or proxy hopefully, otherwise we might need context
           // But existing App seems to use global auth.
        },
        body: JSON.stringify(formData),
      });

      if (!res.ok) throw new Error("Failed to create brief");

      const data = (await res.json()) as any;
      // Redirect to the new brief's detail page
      navigate(`/research/${data.brief.id}`);
    } catch (err) {
      console.error(err);
      toast.error("Failed to create research brief");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto py-10 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>New Topic Research</CardTitle>
          <CardDescription>
            Launch a deep-dive research agent to analyze a topic, find libraries, and evaluate solutions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium">Topic / Title</label>
              <Input 
                placeholder="e.g. Best TypeScript ORMs for D1" 
                value={formData.title}
                onChange={(e) => setFormData({...formData, title: e.target.value})}
                required
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Requirements & Context</label>
              <Textarea 
                placeholder="Describe what you are looking for. Specific criteria, constraints, or goals."
                rows={5}
                value={formData.requirements}
                onChange={(e) => setFormData({...formData, requirements: e.target.value})}
                required
              />
            </div>
            
             <div className="space-y-2">
              <label className="text-sm font-medium">Research Depth</label>
              <select 
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={formData.depth}
                onChange={(e) => setFormData({...formData, depth: e.target.value})}
              >
                  <option value="quick">Quick (Top Results)</option>
                  <option value="deep">Deep Dive (Comprehensive)</option>
              </select>
            </div>

            <Button type="submit" disabled={loading} className="w-full">
              {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Starting Agents...</> : "Start Research"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

import React, { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Play, CheckCircle2, XCircle, Copy, Check } from "lucide-react";
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard';
import { Streamdown } from "streamdown";


interface ConsoleMessage {
  timestamp: string;
  type: "info" | "success" | "error" | "progress";
  message: string;
  icon?: string;
}


export default function Research() {
  const [repoUrl, setRepoUrl] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [consoleMessages, setConsoleMessages] = useState<ConsoleMessage[]>([]);
  const [results, setResults] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const consoleRef = useRef<HTMLDivElement>(null);
  const { isCopied: resultsCopied, copy: copyToClipboard } = useCopyToClipboard();
  const eventSourceRef = useRef<EventSource | null>(null);

  // Auto-scroll console to bottom
  useEffect(() => {
    if (consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }
  }, [consoleMessages]);

  // Cleanup SSE on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  const addConsoleMessage = (type: ConsoleMessage["type"], message: string, icon?: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setConsoleMessages((prev) => [...prev, { timestamp, type, message, icon }]);
  };

  const startResearch = async () => {
    if (!repoUrl.trim()) {
      setError("Please enter a GitHub repository URL");
      return;
    }

    setIsRunning(true);
    setError(null);
    setConsoleMessages([]);
    setResults(null);

    try {
      // Start workflow
      addConsoleMessage("info", `Starting research for: ${repoUrl}`, "🚀");
      addConsoleMessage("info", "━".repeat(60));

      const response = await fetch("/api/research/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoUrl }),
      });

      if (!response.ok) {
        const errorData = (await response.json()) as any;
        throw new Error(errorData.error || "Failed to start research");
      }

      const data = (await response.json()) as any;

      addConsoleMessage("success", `Workflow started: ${data.workflowId}`, "✅");
      addConsoleMessage("info", `Repository: ${data.owner}/${data.repo}`);

      // Connect to SSE stream
      connectToStream(data.workflowId);
    } catch (err: any) {
      setError(err.message);
      addConsoleMessage("error", `Error: ${err.message}`, "❌");
      setIsRunning(false);
    }
  };

  const connectToStream = (wfId: string) => {
    const eventSource = new EventSource(`/api/research/stream/${wfId}`);
    eventSourceRef.current = eventSource;

    eventSource.addEventListener("message", (event) => {
      try {
        const data = JSON.parse(event.data);

        switch (data.event) {
          case "connected":
            addConsoleMessage("info", "Connected to workflow stream", "🔗");
            break;

          case "status":
            if (data.output) {
              handleWorkflowOutput(data.output);
            }
            break;

          case "complete":
            addConsoleMessage("info", "━".repeat(60));
            addConsoleMessage("success", "Research Complete!", "✨");
            setResults(data.output);
            setIsRunning(false);
            eventSource.close();
            break;

          case "error":
            addConsoleMessage("error", `Error: ${data.error}`, "❌");
            setError(data.error);
            setIsRunning(false);
            eventSource.close();
            break;
        }
      } catch (err) {
        console.error("Failed to parse SSE message:", err);
      }
    });

    eventSource.onerror = () => {
      addConsoleMessage("error", "Stream connection lost", "⚠️");
      eventSource.close();
      setIsRunning(false);
    };
  };

  const handleWorkflowOutput = (output: any) => {
    // Display workflow progress based on output structure
    if (output.fileTree) {
      addConsoleMessage("success", `📋 Found ${output.fileTree.length} files`, "✅");
    }
    if (output.readmeContent) {
      addConsoleMessage("info", "📄 README.md loaded");
    }
    if (output.vectorizedFiles) {
      addConsoleMessage("success", `📊 Vectorized ${output.vectorizedFiles} chunks`, "✅");
    }
    if (output.d1RecordsCreated) {
      addConsoleMessage("success", `💾 Created ${output.d1RecordsCreated} D1 records`, "✅");
    }
    if (output.insights) {
      addConsoleMessage("info", "🤖 AI insights generated");
    }
  };

  const copyResults = () => {
    if (results) {
      copyToClipboard(JSON.stringify(results, null, 2));
      addConsoleMessage("info", "Results copied to clipboard", "📋");
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Deep Research</h1>
        <p className="text-muted-foreground">
          Analyze GitHub repositories with AI-powered insights and vectorized code search
        </p>
      </div>

      {/* Input Form */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Repository URL</CardTitle>
          <CardDescription>Enter a GitHub repository URL to analyze</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <Input
              type="url"
              placeholder="https://github.com/owner/repo"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              disabled={isRunning}
              className="flex-1"
            />
            <Button onClick={startResearch} disabled={isRunning}>
              {isRunning ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <Play className="mr-2 h-4 w-4" />
                  Start Research
                </>
              )}
            </Button>
          </div>
          {error && (
            <Alert variant="destructive" className="mt-4">
              <XCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Console Output */}
      {consoleMessages.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Console Output</CardTitle>
            <CardDescription>Real-time workflow execution log</CardDescription>
          </CardHeader>
          <CardContent>
            <div
              ref={consoleRef}
              className="bg-black text-green-400 font-mono text-sm p-4 rounded-lg h-96 overflow-y-auto"
            >
              {consoleMessages.map((msg, idx) => (
                <div key={idx} className="mb-1">
                  <span className="text-gray-500">[{msg.timestamp}]</span>{" "}
                  {msg.icon && <span>{msg.icon} </span>}
                  <span
                    className={
                      msg.type === "error"
                        ? "text-red-400"
                        : msg.type === "success"
                        ? "text-green-400"
                        : "text-gray-300"
                    }
                  >
                    {msg.message}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results Panel */}
      {results && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Research Results</CardTitle>
                <CardDescription>AI-generated insights and statistics</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={copyResults}>
                {resultsCopied ? <Check className="mr-2 h-4 w-4 text-green-500" /> : <Copy className="mr-2 h-4 w-4" />}
                {resultsCopied ? 'Copied!' : 'Copy JSON'}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Statistics */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-muted p-4 rounded-lg">
                  <div className="text-2xl font-bold">{results.fileTree?.length || 0}</div>
                  <div className="text-sm text-muted-foreground">Total Files</div>
                </div>
                <div className="bg-muted p-4 rounded-lg">
                  <div className="text-2xl font-bold">{results.vectorizedFiles || 0}</div>
                  <div className="text-sm text-muted-foreground">Vectorized Chunks</div>
                </div>
                <div className="bg-muted p-4 rounded-lg">
                  <div className="text-2xl font-bold">{results.d1RecordsCreated || 0}</div>
                  <div className="text-sm text-muted-foreground">D1 Records</div>
                </div>
                <div className="bg-muted p-4 rounded-lg">
                  <div className="text-2xl font-bold">
                    <CheckCircle2 className="h-8 w-8 text-green-500" />
                  </div>
                  <div className="text-sm text-muted-foreground">Complete</div>
                </div>
              </div>

              {/* Insights */}
              {results.insights && (
                <div>
                  <h3 className="font-semibold mb-2">AI Insights</h3>
                  <div className="bg-muted p-4 rounded-lg prose prose-sm dark:prose-invert max-w-none break-words">
                    <Streamdown>
                      {results.insights}
                    </Streamdown>
                  </div>
                </div>
              )}

              {/* README Preview */}
              {results.readmeContent && (
                <div>
                  <h3 className="font-semibold mb-2">README Preview</h3>
                    <div className="bg-muted p-4 rounded-lg prose prose-sm dark:prose-invert max-w-none break-words max-h-96 overflow-y-auto">
                      <Streamdown>
                        {results.readmeContent}
                      </Streamdown>
                    </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

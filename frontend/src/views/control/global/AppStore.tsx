import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LucideRefreshCw, LucideGlobe, LucideServer, LucideClock, LucideGithub, LucideActivity } from "lucide-react";

export default function AppStore() {
  const [apps, setApps] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);

  // Use a stable fetcher
  const fetchApps = async () => {
    setIsLoading(true);
    try {
      const res = await api.appstore.$get();
      if (res.ok) {
        const data = await res.json();
        setApps(data.applications);
      }
    } catch (err) {
      console.error("Failed to fetch apps:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchApps();
  }, []);

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const res = await api.appstore.sync.$post();
      if (res.ok) {
        // refresh data after sync
        await fetchApps();
      } else {
        console.error("Sync failed:", await res.json());
      }
    } catch (err) {
      console.error("Sync error:", err);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-zinc-50 font-sans p-6 overflow-y-auto">
      <header className="flex items-center justify-between pb-6 mb-6 top-0 border-b border-zinc-800">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-1 bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">
            Cloudflare App Store
          </h1>
          <p className="text-zinc-400">Discover, manage, and monitor your deployed Workers and Pages.</p>
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={handleSync} 
          disabled={isSyncing}
          className="bg-zinc-900 border-zinc-800 hover:bg-zinc-800 transition-all border shadow-sm"
        >
          <LucideRefreshCw className={`w-4 h-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
          {isSyncing ? "Syncing..." : "Sync from Cloudflare"}
        </Button>
      </header>

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-pulse flex flex-col items-center gap-4">
            <LucideRefreshCw className="w-8 h-8 animate-spin text-zinc-500" />
            <p className="text-zinc-500">Loading App Store...</p>
          </div>
        </div>
      ) : apps.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <h3 className="text-xl font-medium text-zinc-300 mb-2">No Applications Found</h3>
            <p className="text-zinc-500 max-w-sm mb-6">Hit the sync button to fetch your deployed Cloudflare Workers and Pages directly into the App Store.</p>
            <Button onClick={handleSync} disabled={isSyncing} className="bg-emerald-600 hover:bg-emerald-700">Get Started</Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-24">
          {apps.map((app) => (
            <Card key={app.id} className="bg-zinc-900/40 border-zinc-800 hover:border-zinc-700 transition-colors backdrop-blur-sm flex flex-col group relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <CardHeader className="pb-3 relative">
                <div className="flex justify-between items-start mb-2">
                  <div className="p-2 rounded-lg bg-zinc-800/80 ring-1 ring-zinc-700">
                    {app.type === 'worker' ? (
                      <LucideServer className="w-5 h-5 text-emerald-400" />
                    ) : (
                      <LucideGlobe className="w-5 h-5 text-blue-400" />
                    )}
                  </div>
                  <Badge variant="outline" className="capitalize text-xs font-mono font-normal tracking-wide text-zinc-400 border-zinc-700 bg-zinc-800/40">
                    {app.type}
                  </Badge>
                </div>
                <CardTitle className="text-lg font-semibold tracking-tight truncate" title={app.name}>
                  {app.name}
                </CardTitle>
                <CardDescription className="line-clamp-2 h-10 mt-1 text-sm text-zinc-400">
                  {app.summary || app.description || 'No description available for this application.'}
                </CardDescription>
              </CardHeader>
              
              <CardContent className="flex-1 text-sm text-zinc-400 relative">
                <div className="flex flex-col gap-3">
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {app.tags?.map((tag: any) => (
                      <Badge 
                        key={tag.id} 
                        variant="secondary" 
                        className="bg-zinc-800/50 hover:bg-zinc-700 text-xs px-2 py-0.5 rounded-md font-medium"
                        style={{ borderLeft: `2px solid ${tag.hexColor || '#3b82f6'}` }}
                      >
                        {tag.name}
                      </Badge>
                    ))}
                    {(!app.tags || app.tags.length === 0) && (
                       <span className="text-xs text-zinc-600 italic">No tags assigned</span>
                    )}
                  </div>

                  <div className="space-y-2 mt-4">
                    {app.url && (
                      <div className="flex items-center gap-2">
                        <LucideGlobe className="w-3.5 h-3.5 text-zinc-500" />
                        <a href={app.url.startsWith('http') ? app.url : `https://${app.url}`} target="_blank" rel="noreferrer" className="text-blue-400 hover:text-blue-300 truncate text-xs">
                          {app.url.replace(/^https?:\/\//, '')}
                        </a>
                      </div>
                    )}
                    {app.githubRepo && (
                      <div className="flex items-center gap-2">
                         <LucideGithub className="w-3.5 h-3.5 text-zinc-500" />
                         <span className="truncate text-xs text-zinc-400">{app.githubRepo}</span>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
              <CardFooter className="pt-4 pb-4 border-t border-zinc-800/50 text-xs text-zinc-500 flex justify-between relative mt-auto">
                 <div className="flex items-center gap-1.5" title="Last Deployed">
                   <LucideClock className="w-3.5 h-3.5" />
                   <span>{app.lastDeployedDate ? new Date(app.lastDeployedDate).toLocaleDateString() : 'Unknown'}</span>
                 </div>
                 <div className="flex items-center gap-1.5" title="Activity">
                   <LucideActivity className="w-3.5 h-3.5" />
                   <span>Active</span>
                 </div>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

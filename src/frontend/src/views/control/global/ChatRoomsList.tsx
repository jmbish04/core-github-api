import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ExternalLink, Activity, MessageSquare, Clock, XCircle, Users } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useNavigate } from 'react-router-dom';

interface ChatRoomEntry {
    id: string;
    title: string;
    projectName: string;
    githubRepo: string | null;
    status: string;
    workstream: string;
    createdAt: string;
    updatedAt: string;
}

const Skeletons = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="flex flex-col border-muted">
                <CardHeader>
                    <Skeleton className="h-6 w-1/2 mb-2" />
                    <Skeleton className="h-4 w-3/4" />
                </CardHeader>
                <CardContent className="flex-1">
                    <div className="flex gap-2">
                        <Skeleton className="h-4 w-16" />
                        <Skeleton className="h-4 w-24" />
                    </div>
                </CardContent>
            </Card>
        ))}
    </div>
);

export default function ChatRoomsList() {
    const navigate = useNavigate();
    
    const { data, isLoading, isError, error } = useQuery({
        queryKey: ['active-chat-rooms'],
        queryFn: async () => {
            const res = await fetch('/api/agents/chat-rooms/rooms/active');
            if (!res.ok) throw new Error('Failed to fetch active rooms');
            const json = await res.json() as { rooms: ChatRoomEntry[] };
            return json.rooms;
        },
        refetchInterval: 10000 // Poll every 10s for active sessions
    });

    const goToRoom = (room: ChatRoomEntry) => {
        if (room.githubRepo) {
            const [owner, name] = room.githubRepo.split('/');
            // Navigate to the project's orchestration viewport
            navigate(`/repos/${owner}/${name}/plan?session=${room.id}`);
        }
    };

    return (
        <div className="h-full overflow-y-auto flex flex-col space-y-6 container mx-auto py-6 px-4 md:px-6">
            <div className="flex flex-col gap-2 border-b pb-6">
                <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
                    <Activity className="w-8 h-8 text-blue-500" />
                    Active Orchestration Rooms
                </h1>
                <p className="text-muted-foreground flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    Monitor live planning sessions and agent collaboration hubs.
                </p>
            </div>

            {isLoading ? (
                <Skeletons />
            ) : isError ? (
                <Card className="border-destructive/50 bg-destructive/10">
                   <CardContent className="flex items-center gap-3 py-4 text-destructive">
                       <XCircle className="h-5 w-5" />
                       <div className="flex flex-col">
                           <span className="text-sm font-semibold">Error Loading Rooms</span>
                           <span className="text-xs opacity-90">
                               {error instanceof Error ? error.message : "An unexpected error occurred."}
                           </span>
                       </div>
                   </CardContent>
               </Card>
            ) : data?.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 text-center text-muted-foreground border-2 border-dashed rounded-xl">
                    <MessageSquare className="w-12 h-12 mb-4 opacity-20" />
                    <h3 className="text-lg font-medium text-zinc-300">No Active Rooms</h3>
                    <p className="mt-1">There are currently no active planning orchestration sessions.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {data?.map(room => (
                        <Card key={room.id} className="group hover:border-blue-500/50 transition-colors bg-zinc-950 flex flex-col relative overflow-hidden">
                            <div className="absolute top-0 right-0 p-4">
                                <div className="flex items-center gap-2">
                                    <span className="flex h-2 w-2 relative">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                    </span>
                                    <Badge variant="outline" className="text-[10px] uppercase tracking-wider font-mono bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                                        {room.status.replace(/_/g, ' ')}
                                    </Badge>
                                </div>
                            </div>
                            
                            <CardHeader>
                                <CardTitle className="text-xl pr-24">{room.title || 'Untitled Session'}</CardTitle>
                                <CardDescription className="font-mono text-[11px] text-zinc-500">
                                    ID: {room.id.split('-')[0]}...
                                </CardDescription>
                            </CardHeader>
                            
                            <CardContent className="flex-1">
                                <div className="space-y-3">
                                    <div className="flex items-center gap-2 text-sm">
                                        <span className="text-zinc-500 w-24">Project:</span>
                                        <span className="font-medium text-zinc-200">{room.projectName || 'Ad-hoc'}</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-sm">
                                        <span className="text-zinc-500 w-24">Repository:</span>
                                        <span className="font-medium text-zinc-300">{room.githubRepo || 'N/A (Repoless)'}</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-sm">
                                        <span className="text-zinc-500 w-24">Last Update:</span>
                                        <span className="flex items-center gap-1.5 text-zinc-400">
                                            <Clock className="w-3.5 h-3.5" />
                                            {new Date(room.updatedAt).toLocaleTimeString()}
                                        </span>
                                    </div>
                                </div>
                            </CardContent>
                            
                            <CardFooter className="bg-zinc-900/50 border-t pt-4">
                                <Button 
                                    className="w-full justify-between" 
                                    variant="secondary"
                                    onClick={() => goToRoom(room)}
                                    disabled={!room.githubRepo}
                                >
                                    {room.githubRepo ? 'Join Orchestration Room' : 'Repoless Observer N/A'} 
                                    <ExternalLink className="w-4 h-4 ml-2" />
                                </Button>
                            </CardFooter>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}

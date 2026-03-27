import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ProjectEditor from '@/views/research/components/ProjectEditor';
import { toast } from 'sonner';

interface ProjectEditorWrapperProps {
    type: 'custom' | 'cron';
}

export default function ProjectEditorWrapper({ type }: ProjectEditorWrapperProps) {
    const { id } = useParams();
    const navigate = useNavigate();
    const [draftId, setDraftId] = useState<string | null>(id && id !== 'new' ? id : null);
    const [isCreating, setIsCreating] = useState(id === 'new');

    useEffect(() => {
        if (id === 'new') {
            const createDraft = async () => {
                try {
                    const res = await fetch('/api/research-projects/projects/draft', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ type })
                    });
                    if (!res.ok) {
                        const errText = await res.text();
                        console.error("Draft initialization failed:", errText);
                        throw new Error("HTTP " + res.status);
                    }
                    const data = await res.json();
                    
                    // Immediately redirect the user to the real ID URL so browser history is stable
                    navigate(`/research/${type === 'cron' ? 'configure-cron' : 'custom'}/${data.id}`, { replace: true });
                    setDraftId(data.id);
                } catch (e) {
                    console.error("Failed to create draft:", e);
                    toast.error("Failed to initialize new project");
                    navigate(`/research/${type === 'cron' ? 'configure-cron' : 'custom'}`);
                } finally {
                    setIsCreating(false);
                }
            };
            createDraft();
        } else {
            setDraftId(id || null);
        }
    }, [id, type, navigate]);

    if (isCreating || !draftId) {
        return (
            <div className="flex h-[calc(100vh-4rem)] items-center justify-center p-6 text-zinc-400">
                <div className="flex flex-col items-center gap-4">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-purple-500 border-t-transparent"></div>
                    <p>Initializing draft...</p>
                </div>
            </div>
        );
    }

    return (
        <ProjectEditor 
            projectId={draftId} 
            onBack={() => navigate(`/research/${type === 'cron' ? 'configure-cron' : 'custom'}`)} 
            onLaunch={(launchedId) => navigate(`/research/report/${launchedId}`)} 
        />
    );
}

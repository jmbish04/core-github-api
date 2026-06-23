import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { handleGlobalSuccess } from '@/lib/success-handler';

export const RetrainingWizard = () => {
    const [retraining, setRetraining] = useState(false);

    const handleRetrain = () => {
        setRetraining(true);
        setTimeout(() => {
            setRetraining(false);
            handleGlobalSuccess('Synchronized', 'Agent model weights synchronized successfully.');
        }, 3000);
    };

    return (
        <Card className="dark w-full max-w-md bg-zinc-950 text-zinc-50 border-zinc-800 shadow-2xl border-dashed">
            <CardHeader className="pb-4">
                <CardTitle className="text-sm font-bold uppercase tracking-[0.15em] text-amber-500 flex items-center gap-3">
                    <span className="text-xl">⚠️</span> Optimization Protocol
                </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-zinc-400 leading-loose pb-6">
                Initiate a full context window synchronization to inject the latest domain schemas and system instructions into the active agent swarm.
            </CardContent>
            <CardFooter className="pt-2 bg-zinc-900/30 border-t border-zinc-800/50 p-4">
                <Button 
                    onClick={handleRetrain} 
                    disabled={retraining}
                    className="w-full bg-amber-600/90 hover:bg-amber-600 text-white font-bold tracking-wide uppercase text-xs h-10 border-0 shadow-[0_0_15px_rgba(217,119,6,0.2)] transition-all"
                >
                    {retraining ? "Synchronizing Context Vector..." : "Force Retrain"}
                </Button>
            </CardFooter>
        </Card>
    );
};

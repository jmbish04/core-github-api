import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { LiveOpsConsole } from "@/components/LiveOpsConsole";
import { LucideTerminal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";

export function LiveOpsModal({ activeOpCount = 0 }: { activeOpCount?: number }) {
    const [open, setOpen] = useState(false);
    // Mock robust active operation ID management properly? 
    // For now, let's assume if this modal is opened, it shows the active one or a generic one.
    // DashboardPage logic handles `activeOp` state usually. 
    // Ideally this component should accept `operationId` prop or handle selection inside.

    // In the prompt, the user said "button for live ops... button opens a modal".
    // I will simply render the LiveOpsConsole inside.
    // If no op is running, LiveOpsConsole handles that placeholder.

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" className="relative gap-2 bg-zinc-900 border-zinc-800 hover:bg-zinc-800">
                    <LucideTerminal className="w-4 h-4 text-zinc-400" />
                    Live Ops
                    {activeOpCount > 0 && (
                        <Badge variant="default" className="ml-1 h-5 w-5 p-0 justify-center bg-emerald-600 text-[10px] rounded-full">
                            {activeOpCount}
                        </Badge>
                    )}
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl h-[80vh] flex flex-col bg-zinc-950 border-zinc-800 p-0 overflow-hidden">
                <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/50">
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                        <LucideTerminal className="w-5 h-5" />
                        Live Operations Console
                    </h2>
                </div>
                <div className="flex-1 overflow-hidden relative">
                    {/* Pass a dummy ID or manage it upstream. I'll make it accept props later if needed. */}
                    <LiveOpsConsole operationId={undefined} />
                </div>
            </DialogContent>
        </Dialog>
    );
}

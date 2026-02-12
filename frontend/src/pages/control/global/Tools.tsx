import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Wrench } from "lucide-react";
import { PrCommentExtractor } from "@/components/tools/PrCommentExtractor";

export default function ToolsPage() {
    return (
        <div className="flex h-screen bg-background text-foreground">
            <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
                <header className="h-14 border-b flex items-center px-4 md:px-6 bg-card/50 backdrop-blur justify-between">
                    <h1 className="font-semibold text-lg flex items-center gap-2">
                        <Wrench className="w-5 h-5 text-muted-foreground" />
                        Global Tools
                    </h1>
                </header>

                <div className="flex-1 p-4 md:p-8 overflow-y-auto">
                    <div className="max-w-5xl mx-auto">
                        <Tabs defaultValue="pr-extractor" className="w-full space-y-6">
                            <TabsList className="bg-muted/50">
                                <TabsTrigger value="pr-extractor">PR Comment Extractor</TabsTrigger>
                                <TabsTrigger value="more" disabled>More Tools Coming Soon</TabsTrigger>
                            </TabsList>
                            
                            <TabsContent value="pr-extractor" className="outline-none">
                                <PrCommentExtractor />
                            </TabsContent>
                        </Tabs>
                    </div>
                </div>
            </main>
        </div>
    );
}

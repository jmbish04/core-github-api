import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Loader2, MonitorSmartphone } from 'lucide-react';
import { stitch } from '@google/stitch-sdk';

interface StitchProjectBrowserProps {
  onSelectScreen: (screenId: string) => void;
}

export function StitchProjectBrowser({ onSelectScreen }: StitchProjectBrowserProps) {
  const [screensData, setScreensData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchScreens() {
      try {
        const projectId = '10775856895444822981';
        const targetScreenIds = ['f30c8b0d705e40bea22fe373c5b22434', 'd293635de2864fd59a593c0287b85ab0'];
        
        const project = stitch.project(projectId);
        const screens = await project.screens();
        
        const filteredScreens = screens.filter(s => targetScreenIds.includes(s.id));
        setScreensData(filteredScreens);
      } catch (error) {
        console.error('Failed to fetch Stitch screens:', error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchScreens();
  }, []);

  return (
    <Card className="w-full bg-zinc-900 border-zinc-800 text-zinc-100">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MonitorSmartphone className="w-5 h-5 text-indigo-400" />
          Stitch Projects
        </CardTitle>
        <CardDescription className="text-zinc-400">
          Browse design screens from your Stitch workspace.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center items-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
          </div>
        ) : (
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="project-1" className="border-zinc-800">
              <AccordionTrigger className="hover:no-underline hover:bg-zinc-800/50 px-2 rounded-md transition-colors">
                Project 10775856895444822981
              </AccordionTrigger>
              <AccordionContent className="pt-4 px-2">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {screensData.map((screen) => (
                    <Card key={screen.id} className="bg-zinc-950 border-zinc-800 overflow-hidden cursor-pointer hover:border-indigo-500/50 transition-colors" onClick={() => onSelectScreen(screen.id)}>
                      <div className="aspect-video bg-zinc-900 relative flex items-center justify-center">
                         {screen.data?.thumbnailScreenshot?.downloadUrl ? (
                           <img src={screen.data.thumbnailScreenshot.downloadUrl} alt="Screen preview" className="object-cover w-full h-full" />
                         ) : (
                           <MonitorSmartphone className="w-8 h-8 text-zinc-700" />
                         )}
                      </div>
                      <div className="p-3">
                        <p className="text-sm font-medium text-zinc-200 truncate">{screen.id}</p>
                      </div>
                    </Card>
                  ))}
                  {screensData.length === 0 && (
                     <p className="text-zinc-500 text-sm">No target screens found in project.</p>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}
      </CardContent>
    </Card>
  );
}

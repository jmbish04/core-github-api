import React from 'react';
import { SettingsCategories } from '@/components/jules/SettingsCategories';
import { SettingsFileEditor } from '@/components/jules/SettingsFileEditor';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Settings, FileCode2 } from 'lucide-react';

export const SettingsPage: React.FC = () => {
  return (
    <div className="flex flex-col h-full bg-zinc-950 text-zinc-50 p-6 md:p-8 lg:p-10">
      <div className="max-w-6xl mx-auto w-full">
        <div className="mb-8 space-y-2">
          <h1 className="text-3xl font-bold tracking-tight text-zinc-100 flex items-center gap-3">
            <Settings className="w-8 h-8 text-indigo-500" />
            Jules Settings
          </h1>
          <p className="text-zinc-400 text-lg">
            Configure Jules agent behavior, API webhooks, and repository defaults.
          </p>
        </div>

        <Tabs defaultValue="categories" className="w-full">
          <TabsList className="grid w-full grid-cols-2 max-w-[400px] mb-8 bg-zinc-900/50 p-1">
            <TabsTrigger 
              value="categories" 
              className="data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-100"
            >
              <Settings className="w-4 h-4 mr-2" />
              Configuration
            </TabsTrigger>
            <TabsTrigger 
              value="editor"
              className="data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-100"
            >
              <FileCode2 className="w-4 h-4 mr-2" />
              File Editor
            </TabsTrigger>
          </TabsList>

          <TabsContent value="categories" className="animate-in fade-in-50 duration-500 mt-0">
            <SettingsCategories />
          </TabsContent>

          <TabsContent value="editor" className="animate-in fade-in-50 duration-500 mt-0">
            <SettingsFileEditor />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

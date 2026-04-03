import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Wrench, MonitorSmartphone, Code2 } from 'lucide-react';

interface RetrofitWorkflowProps {
  selectedScreenId: string | null;
}

export function RetrofitWorkflow({ selectedScreenId }: RetrofitWorkflowProps) {
  const [targetRepo, setTargetRepo] = useState<string>('');
  const [componentName, setComponentName] = useState('');
  const [instructions, setInstructions] = useState('');

  if (!selectedScreenId) {
    return (
      <Card className="w-full bg-zinc-900 border-zinc-800 text-zinc-100 h-full flex items-center justify-center min-h-[400px]">
        <div className="text-center text-zinc-500">
          <MonitorSmartphone className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>Select a screen from the browser to start retrofitting</p>
        </div>
      </Card>
    );
  }

  const handleRetrofit = () => {
    console.log('Initiating retrofit...', {
      screenId: selectedScreenId,
      targetRepo,
      componentName,
      instructions
    });
    // Implementation would dispatch to agent runner
  };

  return (
    <Card className="w-full bg-zinc-900 border-zinc-800 text-zinc-100 flex flex-col h-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wrench className="w-5 h-5 text-indigo-400" />
          Retrofit Workflow
        </CardTitle>
        <CardDescription className="text-zinc-400">
          Configure and execute the conversion of the selected design into a React component.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto space-y-6">
        
        {/* Selected Screen Preview Placeholder */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-zinc-300">Selected Screen</label>
          <div className="w-full aspect-video bg-zinc-950 border border-zinc-800 rounded-md flex items-center justify-center">
             <div className="text-center">
                <MonitorSmartphone className="w-8 h-8 mx-auto mb-2 text-zinc-600" />
                <p className="text-xs text-zinc-500 font-mono">{selectedScreenId}</p>
             </div>
          </div>
        </div>

        {/* Configuration Form */}
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-300">Target Repository</label>
            <Select value={targetRepo} onValueChange={setTargetRepo}>
              <SelectTrigger className="w-full bg-zinc-950 border-zinc-800 text-zinc-200">
                <SelectValue placeholder="Select target repo" />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-800">
                <SelectItem value="frontend">Frontend Monorepo</SelectItem>
                <SelectItem value="dashboard">Dashboard App</SelectItem>
                <SelectItem value="components">UI Components Library</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-300">Component Name</label>
            <Input 
              placeholder="e.g., UserProfileCard" 
              value={componentName}
              onChange={(e) => setComponentName(e.target.value)}
              className="bg-zinc-950 border-zinc-800 text-zinc-200"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-300">Retrofit Instructions</label>
            <Textarea 
              placeholder="Provide specific instructions for the agent (e.g., 'Use Lucide icons, make it responsive using Tailwind...')" 
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              className="min-h-[120px] bg-zinc-950 border-zinc-800 text-zinc-200 resize-none"
            />
          </div>
        </div>

      </CardContent>
      <CardFooter className="pt-4 border-t border-zinc-800">
        <Button 
          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white gap-2"
          onClick={handleRetrofit}
          disabled={!componentName || !targetRepo}
        >
          <Code2 className="w-4 h-4" />
          Retrofit to Component
        </Button>
      </CardFooter>
    </Card>
  );
}

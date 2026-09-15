import React from 'react';
import { useJulesSettingsStore } from '@/stores/useJulesSettingsStore';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Moon, Bell, Globe, Key, Brain, Zap, Code, Database } from 'lucide-react';

export const SettingsCategories: React.FC = () => {
  const { settings, updateSettings } = useJulesSettingsStore();

  return (
    <div className="w-full max-w-4xl mx-auto py-6">
      <Accordion type="single" collapsible className="w-full space-y-4">
        
        {/* GENERAL SETTINGS */}
        <AccordionItem value="general" className="border rounded-lg bg-zinc-950/50 shadow-sm px-4">
          <AccordionTrigger className="hover:no-underline py-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-zinc-900 rounded-md">
                <Moon className="w-5 h-5 text-zinc-400" />
              </div>
              <div className="flex flex-col items-start">
                <span className="font-semibold text-lg">General</span>
                <span className="text-sm text-zinc-400 font-normal">Theme, notifications, basic settings</span>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pt-2 pb-6 px-2 space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="theme">Application Theme</Label>
                <p className="text-sm text-zinc-500">Select your preferred color scheme.</p>
              </div>
              <Select
                value={settings.general.theme}
                onValueChange={(val) => updateSettings('general', { theme: val })}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Theme" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="dark">Dark Theme</SelectItem>
                  <SelectItem value="light">Light Theme</SelectItem>
                  <SelectItem value="system">System</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="notifications">Enable Notifications</Label>
                <p className="text-sm text-zinc-500">Receive alerts when Jules completes tasks.</p>
              </div>
              <Switch
                id="notifications"
                checked={settings.general.notificationsEnabled}
                onCheckedChange={(checked) => updateSettings('general', { notificationsEnabled: checked })}
              />
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* WEBHOOKS */}
        <AccordionItem value="webhooks" className="border rounded-lg bg-zinc-950/50 shadow-sm px-4">
          <AccordionTrigger className="hover:no-underline py-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-zinc-900 rounded-md">
                <Globe className="w-5 h-5 text-zinc-400" />
              </div>
              <div className="flex flex-col items-start">
                <span className="font-semibold text-lg">Webhooks</span>
                <span className="text-sm text-zinc-400 font-normal">GitHub integration endpoints</span>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pt-2 pb-6 px-2 space-y-6">
            <div className="space-y-2">
              <Label htmlFor="endpointUrl">Endpoint URL</Label>
              <Input
                id="endpointUrl"
                value={settings.webhooks.endpointUrl}
                onChange={(e) => updateSettings('webhooks', { endpointUrl: e.target.value })}
                placeholder="https://core-github-api.hacolby.workers.dev/api/webhooks"
              />
              <p className="text-sm text-zinc-500">The canonical webhook URL for GitHub App events.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="secretKey">Webhook Secret Key</Label>
              <Input
                id="secretKey"
                type="password"
                value={settings.webhooks.secretKey}
                onChange={(e) => updateSettings('webhooks', { secretKey: e.target.value })}
                placeholder="••••••••••••••••"
              />
              <p className="text-sm text-zinc-500">Used to verify payload signatures from GitHub.</p>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* AGENT BEHAVIOR */}
        <AccordionItem value="agentBehavior" className="border rounded-lg bg-zinc-950/50 shadow-sm px-4">
          <AccordionTrigger className="hover:no-underline py-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-zinc-900 rounded-md">
                <Brain className="w-5 h-5 text-zinc-400" />
              </div>
              <div className="flex flex-col items-start">
                <span className="font-semibold text-lg">Agent Behavior</span>
                <span className="text-sm text-zinc-400 font-normal">Model selection and autonomy</span>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pt-2 pb-6 px-2 space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="model">Primary Model</Label>
                <p className="text-sm text-zinc-500">Default AI model used for generation.</p>
              </div>
              <Select
                value={settings.agentBehavior.model}
                onValueChange={(val) => updateSettings('agentBehavior', { model: val })}
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Model" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gemini-2.5-flash">Gemini 2.5 Flash</SelectItem>
                  <SelectItem value="gemini-2.5-pro">Gemini 2.5 Pro</SelectItem>
                  <SelectItem value="gemini-2.0-flash-exp">Gemini 2.0 Flash Exp</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="memoryLimit">Memory Limit (Context Window)</Label>
                <p className="text-sm text-zinc-500">Maximum turns retained in working memory.</p>
              </div>
              <Input
                id="memoryLimit"
                type="number"
                className="w-[100px]"
                value={settings.agentBehavior.memoryLimit}
                onChange={(e) => updateSettings('agentBehavior', { memoryLimit: parseInt(e.target.value) || 10 })}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="autonomousMode">Autonomous Mode</Label>
                <p className="text-sm text-zinc-500">Allow Jules to deploy changes automatically.</p>
              </div>
              <Switch
                id="autonomousMode"
                checked={settings.agentBehavior.autonomousMode}
                onCheckedChange={(checked) => updateSettings('agentBehavior', { autonomousMode: checked })}
              />
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* CODING STANDARDS */}
        <AccordionItem value="codingStandards" className="border rounded-lg bg-zinc-950/50 shadow-sm px-4">
          <AccordionTrigger className="hover:no-underline py-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-zinc-900 rounded-md">
                <Code className="w-5 h-5 text-zinc-400" />
              </div>
              <div className="flex flex-col items-start">
                <span className="font-semibold text-lg">Coding Standards</span>
                <span className="text-sm text-zinc-400 font-normal">Formatting and linting rules</span>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pt-2 pb-6 px-2 space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="useTabs">Use Tabs</Label>
                <p className="text-sm text-zinc-500">Indent code using tabs instead of spaces.</p>
              </div>
              <Switch
                id="useTabs"
                checked={settings.codingStandards.useTabs}
                onCheckedChange={(checked) => updateSettings('codingStandards', { useTabs: checked })}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="indentSize">Indent Size</Label>
                <p className="text-sm text-zinc-500">Number of spaces per indentation level.</p>
              </div>
              <Select
                value={String(settings.codingStandards.indentSize)}
                onValueChange={(val) => updateSettings('codingStandards', { indentSize: parseInt(val) })}
              >
                <SelectTrigger className="w-[100px]">
                  <SelectValue placeholder="Size" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="2">2</SelectItem>
                  <SelectItem value="4">4</SelectItem>
                  <SelectItem value="8">8</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="enforceStrictTypes">Enforce Strict Types</Label>
                <p className="text-sm text-zinc-500">Enable strict TypeScript checking for all agents.</p>
              </div>
              <Switch
                id="enforceStrictTypes"
                checked={settings.codingStandards.enforceStrictTypes}
                onCheckedChange={(checked) => updateSettings('codingStandards', { enforceStrictTypes: checked })}
              />
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
};

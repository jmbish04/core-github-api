import React, { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useNavigate, useParams } from "react-router-dom";
import { handleGlobalError } from '@/lib/error-handler';
import { handleGlobalSuccess } from '@/lib/success-handler';
import { Loader2 } from "lucide-react";

import { useProjectStore } from "@/stores/useProjectStore";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";

const formSchema = z.object({
  prompt: z.string().min(10, {
    message: "Prompt must be at least 10 characters.",
  }),
  repoUrl: z.string().min(1, { message: "Please select a repository." }),
  autoPr: z.boolean(),
  mode: z.enum(["Interactive", "Fire & Forget"]),
  requireApproval: z.boolean(),
  branch: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

export const TaskForm = () => {
  const navigate = useNavigate();
  const { owner, repo } = useParams();
  
  const isRepoRoute = Boolean(owner && repo);
  const defaultRepoUrl = isRepoRoute ? `github.com/${owner}/${repo}` : "";

  const { activeProjects, fetchFavorites, isLoading: projectsLoading } = useProjectStore();

  useEffect(() => {
    fetchFavorites();
  }, [fetchFavorites]);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      prompt: "",
      repoUrl: defaultRepoUrl,
      autoPr: false,
      mode: "Interactive",
      requireApproval: true,
      branch: "",
    },
  });

  const onSubmit = async (data: FormValues) => {
    try {
      const response = await fetch("/api/julius/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: data.prompt,
          repoUrl: data.repoUrl,
          autoPr: data.autoPr,
          mode: data.mode,
          inject_standards: true,
          requireApproval: data.requireApproval,
          branch: data.branch || undefined,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to start task");
      }

      const result = await response.json();
      const baseUrl = isRepoRoute ? `/repos/${owner}/${repo}/jules` : "/jules";
      
      // Assume the API returns { sessionId: string } on success
      if (result.sessionId) {
        navigate(`${baseUrl}/tasks/${result.sessionId}`);
      } else {
        handleGlobalSuccess('Task Started', 'Task started successfully');
        // Fallback navigation if sessionId is missing
        navigate(`${baseUrl}/tasks`);
      }
    } catch (error) {
      console.error(error);
      handleGlobalError('Failed to start task. Please try again.');
    }
  };

  const isSubmitting = form.formState.isSubmitting;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="prompt"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Task Prompt</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Describe the task..."
                  className="min-h-[100px] max-h-[500px] resize-y"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="repoUrl"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Repository</FormLabel>
              <Select
                onValueChange={field.onChange}
                defaultValue={field.value}
                disabled={isRepoRoute || projectsLoading}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a repository" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {activeProjects.map((project) => (
                    <SelectItem
                      key={project.id}
                      value={`github.com/${project.full_name}`}
                    >
                      {project.full_name}
                    </SelectItem>
                  ))}
                  {activeProjects.length === 0 && !projectsLoading && (
                    <SelectItem value="none" disabled>
                      No repositories found
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <Accordion type="single" className="w-full border rounded-md px-4">
          <AccordionItem value="options" className="border-b-0">
            <AccordionTrigger className="hover:no-underline py-4">
              Advanced Options
            </AccordionTrigger>
            <AccordionContent className="space-y-6 pb-4">
              <FormField
                control={form.control}
                name="autoPr"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Auto-PR</FormLabel>
                      <div className="text-sm text-muted-foreground">
                        Automatically create a pull request when finished.
                      </div>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="requireApproval"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Require Plan Approval</FormLabel>
                      <div className="text-sm text-muted-foreground">
                        Wait for approval before executing the plan.
                      </div>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="mode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Execution Mode</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a mode" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Interactive">Interactive</SelectItem>
                        <SelectItem value="Fire & Forget">Fire & Forget</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="branch"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Starting Branch (Optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="main" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        <Button type="submit" className="w-full md:w-auto" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Start Task
        </Button>
      </form>
    </Form>
  );
};

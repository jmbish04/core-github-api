import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// The binding definitions allowed
const bindingSchema = z.object({
  type: z.enum(["kv_namespaces", "d1_databases", "r2_buckets", "vars", "queues"]),
  bindingName: z.string().min(1, "Binding name is required (e.g. MY_KV_STORE)"),
  resourceId: z.string().min(1, "Resource ID or Value is required"),
});

type BindingFormValues = z.infer<typeof bindingSchema>;

interface AddBindingDialogProps {
  projectId: string;
}

export function AddBindingDialog({ projectId }: AddBindingDialogProps) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const form = useForm<BindingFormValues>({
    resolver: zodResolver(bindingSchema),
    defaultValues: {
      type: "kv_namespaces",
      bindingName: "",
      resourceId: "",
    },
  });

  const addBindingMutation = useMutation({
    mutationFn: async (values: BindingFormValues) => {
      // We will post to the backend, which executes Octokit and saves the config
      const res = await fetch(`/api/projects/${projectId}/bindings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        let msg = "Failed to add binding";
        try {
          const data = (await res.json()) as any;
          msg = data?.error || msg;
        } catch (e) {}
        throw new Error(msg);
      }
      return await res.json();
    },
    onSuccess: () => {
      toast.success("Binding synchronized to wrangler.jsonc via GitHub.");
      // Invalidate the project overview cache to redraw UI
      queryClient.invalidateQueries({ queryKey: ["project-overview", projectId] });
      setOpen(false);
      form.reset();
    },
    onError: (error: Error) => {
      toast.error(`Failed to sync binding: ${error.message}`);
    },
  });

  const onSubmit = (values: BindingFormValues) => {
    addBindingMutation.mutate(values);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Add Binding
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Add Cloudflare Binding</DialogTitle>
          <DialogDescription>
            This action creates a commit in your GitHub repository, updating the <code className="text-xs bg-muted px-1 py-0.5 rounded">wrangler.jsonc</code> configuration file automatically via Octokit.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Resource Type</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="kv_namespaces">KV Namespace</SelectItem>
                      <SelectItem value="d1_databases">D1 Database</SelectItem>
                      <SelectItem value="r2_buckets">R2 Bucket</SelectItem>
                      <SelectItem value="queues">Queue</SelectItem>
                      <SelectItem value="vars">Environment Variable</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="bindingName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Binding Name</FormLabel>
                  <FormControl>
                    <Input placeholder="MY_NAMESPACE_BINDING" {...field} className="font-mono text-sm uppercase" onChange={(e) => field.onChange(e.target.value.toUpperCase().replace(/\s+/g, "_"))} />
                  </FormControl>
                  <FormDescription>
                    The variable injected into your Worker's `env` object.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="resourceId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Resource ID / Target Value</FormLabel>
                  <FormControl>
                    <Input placeholder="xxxx-xxxx-xxxx-xxxx" {...field} className="font-mono text-sm" />
                  </FormControl>
                   <FormDescription>
                    The Cloudflare Resource ID (or string if Environment Variable).
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="pt-4">
              <Button type="submit" disabled={addBindingMutation.isPending}>
                {addBindingMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Committing to GitHub...
                  </>
                ) : (
                  "Sync Binding"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

import { useState, type ReactNode } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { BadgeCheck, Bot, GitBranch, Loader2, ScrollText, Sparkles } from "lucide-react";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { useAuth } from "@/context/auth-context";
import { Badge } from "@/components/ui/badge";
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
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";

const formSchema = z.object({
  customInstructions: z.string().max(4000).optional(),
});

interface AiDocGenModalProps {
  owner: string;
  repo: string;
  branch: string;
  trigger?: ReactNode;
}

interface AiDocGenResponse {
  success: boolean;
  prUrl: string;
  generatedPaths: string[];
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Failed to generate AI docs.";
}

export function AiDocGenModal({ owner, repo, branch, trigger }: AiDocGenModalProps) {
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<AiDocGenResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { apiKey } = useAuth();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      customInstructions: "",
    },
  });

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setError(null);
      setResult(null);
      form.reset();
    }
  };

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/tools/github/repos/doc-gen", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey || "",
        },
        credentials: "include",
        body: JSON.stringify({
          owner,
          repo,
          branch,
          customInstructions: values.customInstructions?.trim() || undefined,
        }),
      });

      const data = (await response.json()) as AiDocGenResponse & { error?: string };

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to generate AI docs.");
      }

      setResult(data);
    } catch (submissionError: unknown) {
      setError(getErrorMessage(submissionError));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" className="gap-2 border-amber-500/30 bg-amber-500/5 text-amber-100 hover:bg-amber-500/10 hover:text-amber-50">
            <Sparkles className="h-4 w-4 text-amber-400" />
            Generate AI Docs
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="overflow-hidden border border-border/80 bg-background p-0 shadow-2xl sm:max-w-[600px]">
        <div className="border-b border-border/80 bg-muted/20 px-6 py-5">
          <DialogHeader className="space-y-3 text-left">
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-amber-400" />
              Generate AI Docs
            </DialogTitle>
            <DialogDescription className="text-sm leading-6">
              Run the Analyzer, Documenter, and Rules Generator agents for{" "}
              <span className="font-medium text-foreground">
                {owner}/{repo}
              </span>{" "}
              and open a PR with architecture docs plus agent rules.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 flex flex-wrap gap-2">
            <Badge variant="secondary" className="gap-1 bg-background/80 text-foreground">
              <Bot className="h-3.5 w-3.5 text-amber-400" />
              3-agent workflow
            </Badge>
            <Badge variant="secondary" className="gap-1 bg-background/80 text-foreground">
              <ScrollText className="h-3.5 w-3.5 text-blue-400" />
              {owner}/{repo}
            </Badge>
            <Badge variant="secondary" className="gap-1 bg-background/80 text-foreground">
              <GitBranch className="h-3.5 w-3.5 text-emerald-400" />
              {branch}
            </Badge>
          </div>
        </div>

        {result ? (
          <div className="space-y-5 px-6 py-6">
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-100">
              <div className="flex items-start gap-3">
                <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                <div className="space-y-1">
                  <p className="font-medium text-emerald-50">Pull request created successfully</p>
                  <p>
                    Generated {result.generatedPaths.length} files across <span className="font-medium">.ai/docs</span> and{" "}
                    <span className="font-medium">.agent/rules</span>.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-foreground">Generated files</p>
                <Badge variant="outline" className="text-xs text-muted-foreground">
                  {result.generatedPaths.length} files
                </Badge>
              </div>
              <ul className="space-y-2 rounded-lg border border-border/80 bg-muted/20 p-3 text-sm text-muted-foreground">
                {result.generatedPaths.map((path) => (
                  <li
                    key={path}
                    className="rounded-md border border-border/60 bg-background/80 px-3 py-2 font-mono text-xs text-foreground/90"
                  >
                    {path}
                  </li>
                ))}
              </ul>
            </div>

            <DialogFooter className="gap-2 sm:justify-between">
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Close
              </Button>
              <Button asChild className="gap-2">
                <a href={result.prUrl} target="_blank" rel="noreferrer">
                  <Sparkles className="h-4 w-4" />
                  Review Pull Request
                </a>
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="px-6 py-6">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                <p className="text-sm font-medium text-foreground">Analyzer</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Maps structure, APIs, dependencies, and key flows across the repository.
                </p>
              </div>
              <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-3">
                <p className="text-sm font-medium text-foreground">Documenter</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Produces architecture markdown for engineers onboarding to the codebase.
                </p>
              </div>
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
                <p className="text-sm font-medium text-foreground">Rules Generator</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Writes agent guidance files that preserve repository standards and workflows.
                </p>
              </div>
            </div>

            <Separator className="my-6" />

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="customInstructions"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Custom Instructions (Optional)</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="e.g. focus heavily on the auth flows and deployment surface area"
                          className="min-h-32 resize-y border-border/80 bg-muted/20"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Add extra guidance for the analyzer and downstream document generation agents.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {error ? (
                  <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                    {error}
                  </div>
                ) : null}

                <DialogFooter className="gap-2 sm:justify-between">
                  <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={isLoading}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isLoading} className="gap-2">
                    {isLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Coordinating agents...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4" />
                        Generate AI Docs
                      </>
                    )}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

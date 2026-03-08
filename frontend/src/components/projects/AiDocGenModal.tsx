import { useState, type ReactNode } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Sparkles } from "lucide-react";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { useAuth } from "@/context/auth-context";
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
          <Button variant="outline" className="gap-2">
            <Sparkles className="h-4 w-4" />
            Generate AI Docs
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-amber-400" />
            Generate AI Docs
          </DialogTitle>
          <DialogDescription>
            Run the Analyzer, Documenter, and Rules Generator agents for{" "}
            <span className="font-medium text-foreground">
              {owner}/{repo}
            </span>{" "}
            and open a PR with the generated architecture docs and rule files.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-4 py-2">
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">
              Successfully generated {result.generatedPaths.length} files and opened a pull request.
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">Generated files</p>
              <ul className="space-y-1 rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
                {result.generatedPaths.map((path) => (
                  <li key={path} className="font-mono">
                    {path}
                  </li>
                ))}
              </ul>
            </div>
            <DialogFooter className="gap-2 sm:justify-between">
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Close
              </Button>
              <Button asChild>
                <a href={result.prUrl} target="_blank" rel="noreferrer">
                  Review Pull Request
                </a>
              </Button>
            </DialogFooter>
          </div>
        ) : (
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
                        className="min-h-32 resize-y"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Add extra guidance for the Analyzer and downstream document generation agents.
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

              <DialogFooter>
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
        )}
      </DialogContent>
    </Dialog>
  );
}


import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Loader2, Wand2, Rocket } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea"; // Correct relative import as learned
import { useAuth } from "@/context/auth-context";
import { Badge } from "@/components/ui/badge";

const formSchema = z.object({
    prompt: z.string().optional(),
});

interface LandingGeneratorModalProps {
    owner: string;
    repo: string;
}

export function LandingGeneratorModal({ owner, repo }: LandingGeneratorModalProps) {
    const [open, setOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [result, setResult] = useState<{ prUrl: string } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const { apiKey } = useAuth();

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            prompt: "",
        },
    });

    async function onSubmit(values: z.infer<typeof formSchema>) {
        setIsLoading(true);
        setError(null);
        setResult(null);

        try {
            const response = await fetch("/api/landing-generator/generate", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-api-key": apiKey || "",
                },
                body: JSON.stringify({
                    owner,
                    repo,
                    prompt: values.prompt,
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || "Failed to generate landing page");
            }

            setResult({ prUrl: data.prUrl });
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    }

    const resetState = (isOpen: boolean) => {
        setOpen(isOpen);
        if (!isOpen) {
            // Optional: reset form after close? 
            // setIsResult(null)
        }
    }

    return (
        <Dialog open={open} onOpenChange={resetState}>
            <DialogTrigger asChild>
                <Button variant="outline" className="gap-2">
                    <Wand2 className="h-4 w-4" />
                    Generate Landing Page
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[525px]">
                <DialogHeader>
                    <DialogTitle>Generate Landing Page</DialogTitle>
                    <DialogDescription>
                        AI will analyze {owner}/{repo} and create a high-converting landing page.
                    </DialogDescription>
                </DialogHeader>

                {!result ? (
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                            <FormField
                                control={form.control}
                                name="prompt"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Custom Instructions (Optional)</FormLabel>
                                        <FormControl>
                                            <Textarea
                                                placeholder="e.g. Focus on enterprise security features..."
                                                className="resize-none"
                                                {...field}
                                            />
                                        </FormControl>
                                        <FormDescription>
                                            Guide the AI to emphasize specific selling points.
                                        </FormDescription>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            {error && (
                                <div className="p-3 bg-red-50 text-red-600 rounded-md text-sm">
                                    {error}
                                </div>
                            )}

                            <DialogFooter>
                                <Button type="submit" disabled={isLoading} className="w-full sm:w-auto">
                                    {isLoading ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Generating...
                                        </>
                                    ) : (
                                        <>
                                            <Rocket className="mr-2 h-4 w-4" />
                                            Launch Generator
                                        </>
                                    )}
                                </Button>
                            </DialogFooter>
                        </form>
                    </Form>
                ) : (
                    <div className="py-6 text-center space-y-4">
                        <div className="mx-auto w-12 h-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center">
                            <Rocket className="h-6 w-6" />
                        </div>
                        <h3 className="text-lg font-medium text-slate-900">Success!</h3>
                        <p className="text-slate-500">
                            The landing page has been generated and a Pull Request is ready for review.
                        </p>
                        <div className="pt-2">
                            <Button asChild className="w-full">
                                <a href={result.prUrl} target="_blank" rel="noopener noreferrer">
                                    Review Pull Request
                                </a>
                            </Button>
                        </div>
                        <Button variant="ghost" onClick={() => setOpen(false)} className="mt-2 text-sm text-slate-500">
                            Close
                        </Button>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}

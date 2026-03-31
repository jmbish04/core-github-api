import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  BrainCircuit,
  Cloud,
  ExternalLink,
  Globe,
  Sparkles,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";

type ProviderConfig = {
  name: string;
  slug: string;
  icon: React.ReactNode;
  color: string;
  borderColor: string;
  bgColor: string;
  gateway: string;
  defaultModel: string;
  description: string;
  status: "connected" | "available" | "disabled";
};

const AI_PROVIDERS: ProviderConfig[] = [
  {
    name: "Workers AI",
    slug: "worker-ai",
    icon: <Cloud className="h-5 w-5" />,
    color: "text-orange-400",
    borderColor: "border-orange-500/30",
    bgColor: "bg-orange-500/10",
    gateway: "cloudflare-ai-gateway",
    defaultModel: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    description:
      "Native Cloudflare Workers AI inference. Zero-latency, runs on the edge with no external calls.",
    status: "connected",
  },
  {
    name: "Google Gemini",
    slug: "gemini",
    icon: <Sparkles className="h-5 w-5" />,
    color: "text-blue-400",
    borderColor: "border-blue-500/30",
    bgColor: "bg-blue-500/10",
    gateway: "cloudflare-ai-gateway",
    defaultModel: "gemini-2.0-flash",
    description:
      "Google DeepMind Gemini models routed through Cloudflare AI Gateway for observability and rate limiting.",
    status: "connected",
  },
  {
    name: "OpenAI",
    slug: "openai",
    icon: <Zap className="h-5 w-5" />,
    color: "text-emerald-400",
    borderColor: "border-emerald-500/30",
    bgColor: "bg-emerald-500/10",
    gateway: "cloudflare-ai-gateway",
    defaultModel: "gpt-4o",
    description:
      "OpenAI GPT models proxied via AI Gateway. Supports structured outputs and function calling.",
    status: "connected",
  },
  {
    name: "Anthropic",
    slug: "anthropic",
    icon: <BrainCircuit className="h-5 w-5" />,
    color: "text-amber-400",
    borderColor: "border-amber-500/30",
    bgColor: "bg-amber-500/10",
    gateway: "cloudflare-ai-gateway",
    defaultModel: "claude-sonnet-4-20250514",
    description:
      "Anthropic Claude models with extended thinking. Routed via AI Gateway for unified logging.",
    status: "connected",
  },
];

function StatusBadge({ status }: { status: ProviderConfig["status"] }) {
  switch (status) {
    case "connected":
      return (
        <Badge
          variant="outline"
          className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
        >
          <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
          Connected
        </Badge>
      );
    case "available":
      return (
        <Badge
          variant="outline"
          className="border-sky-500/30 bg-sky-500/10 text-sky-400"
        >
          Available
        </Badge>
      );
    case "disabled":
      return (
        <Badge
          variant="outline"
          className="border-zinc-500/30 bg-zinc-500/10 text-zinc-400"
        >
          Disabled
        </Badge>
      );
  }
}

export function AIProvidersTab() {
  return (
    <div className="space-y-6">
      {/* Gateway overview */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-500/10">
              <Globe className="h-5 w-5 text-cyan-400" />
            </div>
            <div>
              <CardTitle>Cloudflare AI Gateway</CardTitle>
              <CardDescription>
                All AI providers are proxied through Cloudflare AI Gateway for
                centralized logging, rate limiting, caching, and cost tracking.
              </CardDescription>
            </div>
          </div>
          <Button variant="secondary" asChild>
            <a
              href="https://dash.cloudflare.com/?to=/:account/ai/ai-gateway/general"
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              Open Dashboard
            </a>
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border bg-muted/30 p-3 text-center">
              <p className="text-2xl font-bold">{AI_PROVIDERS.length}</p>
              <p className="text-xs text-muted-foreground">
                Configured Providers
              </p>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3 text-center">
              <p className="text-2xl font-bold">
                {AI_PROVIDERS.filter((p) => p.status === "connected").length}
              </p>
              <p className="text-xs text-muted-foreground">
                Active Connections
              </p>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3 text-center">
              <p className="text-2xl font-bold">1</p>
              <p className="text-xs text-muted-foreground">Gateway Instance</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Provider cards */}
      <div className="grid gap-4 lg:grid-cols-2">
        {AI_PROVIDERS.map((provider) => (
          <Card
            key={provider.slug}
            className={`overflow-hidden transition-colors hover:${provider.borderColor}`}
          >
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-lg ${provider.bgColor} ${provider.color}`}
                  >
                    {provider.icon}
                  </div>
                  <div>
                    <CardTitle className="text-base">{provider.name}</CardTitle>
                    <p className="text-xs text-muted-foreground">
                      {provider.slug}
                    </p>
                  </div>
                </div>
                <StatusBadge status={provider.status} />
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {provider.description}
              </p>

              <Separator />

              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">
                    Default Model
                  </p>
                  <p className="truncate font-mono text-xs font-medium">
                    {provider.defaultModel}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Gateway</p>
                  <p className="truncate font-mono text-xs font-medium">
                    {provider.gateway}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Info note */}
      <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
        <p className="text-sm text-muted-foreground">
          <strong className="text-foreground">Note:</strong> Provider
          configuration (API keys, gateway endpoints, model overrides) is
          managed through the Worker environment bindings and the Cloudflare
          Secrets Store. Changes to provider routing are applied via{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">
            wrangler.jsonc
          </code>{" "}
          and redeployed automatically.
        </p>
      </div>
    </div>
  );
}

import { useParams } from "react-router-dom";
import { Webhook } from "lucide-react";
import { PrWebhookExtractor } from "@/components/tools/PrWebhookExtractor";

export default function PrWebhookExtractorPage() {
    const { owner, repo } = useParams();

    return (
        <div className="flex flex-col h-full overflow-hidden">
            <div className="px-6 py-4 border-b shrink-0 bg-card/50 backdrop-blur">
                <h1 className="text-base font-semibold flex items-center gap-2">
                    <Webhook className="w-4 h-4 text-primary" />
                    PR Webhook Extractor
                    {owner && repo && (
                        <span className="text-muted-foreground font-normal text-sm ml-1">
                            — {owner}/{repo}
                        </span>
                    )}
                </h1>
                <p className="text-xs text-muted-foreground mt-0.5">
                    Pull the exact initial webhook payload for any given Pull Request.
                </p>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-6">
                <div className="max-w-3xl mx-auto">
                    <PrWebhookExtractor defaultOwner={owner} defaultRepo={repo} />
                </div>
            </div>
        </div>
    );
}

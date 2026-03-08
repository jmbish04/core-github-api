import React from 'react';
import { cn } from '@/lib/utils';
import { User, Bot, Terminal } from 'lucide-react';

interface MessageBubbleProps {
    role: string;
    content: string;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ role, content }) => {
    const isUser = role === 'user';
    const isTool = content.startsWith("Tool '");

    // Parse tool output if applicable
    let toolName = '';
    let toolOutput = '';
    if (isTool) {
        const match = content.match(/Tool '([^']+)' (Output|Error): (.*)/s);
        if (match) {
            toolName = match[1];
            toolOutput = match[3];
        }
    }

    // Parse tool call in assistant message
    const hasToolCall = !isUser && content.includes('```json');
    let textContent = content;
    let toolCallBlock: any = null;

    if (hasToolCall) {
        const parts = content.split(/```json\s*([\s\S]*?)\s*```/);
        textContent = parts[0];
        if (parts[1]) {
            try {
                const json = JSON.parse(parts[1]);
                toolCallBlock = json;
            } catch { }
        }
    }

    if (isTool) {
        return (
            <div className="flex gap-3 my-4 p-4 rounded-lg bg-muted/50 border border-border/50 text-sm font-mono overflow-hidden">
                <div className="mt-1 shrink-0">
                    <Terminal className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="w-full overflow-x-auto">
                    <div className="flex items-center gap-2 mb-2">
                        <span className="font-semibold text-foreground">{toolName}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-background border text-muted-foreground uppercase">Tool Result</span>
                    </div>
                    <pre className="text-muted-foreground whitespace-pre-wrap break-all">{toolOutput}</pre>
                </div>
            </div>
        );
    }

    return (
        <div className={cn("flex gap-4 my-6", isUser ? "flex-row-reverse" : "flex-row")}>
            <div className={cn(
                "shrink-0 h-8 w-8 rounded-full flex items-center justify-center",
                isUser ? "bg-primary text-primary-foreground" : "bg-accent text-accent-foreground"
            )}>
                {isUser ? <User className="h-5 w-5" /> : <Bot className="h-5 w-5" />}
            </div>

            <div className={cn("flex-1 max-w-[80%]", isUser && "text-right")}>
                {textContent && (
                    <div className={cn(
                        "prose dark:prose-invert text-sm leading-relaxed",
                        isUser ? "text-primary-foreground bg-primary px-4 py-3 rounded-2xl rounded-tr-none" : "text-foreground"
                    )}>
                        {textContent}
                    </div>
                )}

                {toolCallBlock && (
                    <div className="mt-4 text-left">
                        <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 rounded-full text-xs font-medium mb-2 border border-amber-200 dark:border-amber-800">
                            <Terminal className="h-3 w-3" />
                            Calling Tool: {toolCallBlock.tool}
                        </div>
                        <div className="bg-card border rounded-lg p-3 text-xs font-mono overflow-x-auto shadow-sm">
                            <pre>{JSON.stringify(toolCallBlock.arguments, null, 2)}</pre>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

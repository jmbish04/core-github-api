import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { ChevronDown, ChevronRight, Sparkles, User, Bot, Loader2, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// --- Types ---
export interface MessageProps {
    role: 'user' | 'assistant' | 'system';
    content: string;
    className?: string;
    avatar?: string;
}

export interface ChainOfThoughtProps {
    steps: {
        title: string;
        details?: string;
        status: 'pending' | 'active' | 'completed';
    }[];
    isExpanded?: boolean;
    className?: string;
}

// --- Components ---

export function Message({ role, content, className, avatar }: MessageProps) {
    return (
        <div className={cn("flex gap-3 mb-4", role === 'user' ? "flex-row-reverse" : "flex-row", className)}>
            <Avatar className="w-8 h-8 border border-zinc-800">
                <AvatarImage src={avatar} />
                <AvatarFallback className={cn("text-xs", role === 'user' ? "bg-zinc-700" : "bg-purple-900/50 text-purple-300")}>
                    {role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                </AvatarFallback>
            </Avatar>
            <div className={cn(
                "rounded-lg px-4 py-2 max-w-[80%] text-sm",
                role === 'user'
                    ? "bg-zinc-800 text-zinc-100"
                    : "bg-zinc-900/50 text-zinc-300 border border-zinc-800"
            )}>
                {content}
            </div>
        </div>
    );
}

export function ChainOfThought({ steps, isExpanded: defaultExpanded = false, className }: ChainOfThoughtProps) {
    const [isExpanded, setIsExpanded] = useState(defaultExpanded);

    return (
        <div className={cn("border border-zinc-800 rounded-lg bg-zinc-950/50 overflow-hidden", className)}>
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full flex items-center justify-between p-2 text-xs text-zinc-500 hover:bg-zinc-900/50 transition-colors"
            >
                <div className="flex items-center gap-2">
                    <Sparkles className="w-3 h-3 text-purple-400" />
                    <span className="font-medium">Reasoning Process</span>
                    <span className="text-zinc-600">({steps.length} steps)</span>
                </div>
                {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            </button>

            {isExpanded && (
                <div className="p-3 bg-zinc-900/20 border-t border-zinc-800/50 space-y-3">
                    {steps.map((step, idx) => (
                        <div key={idx} className="flex gap-2 text-xs">
                            <div className={cn(
                                "mt-0.5 w-1.5 h-1.5 rounded-full",
                                step.status === 'completed' ? "bg-emerald-500" :
                                    step.status === 'active' ? "bg-blue-500 animate-pulse" : "bg-zinc-700"
                            )} />
                            <div className="flex-1">
                                <div className="text-zinc-300">{step.title}</div>
                                {step.details && <div className="text-zinc-500 mt-1 font-mono text-[10px]">{step.details}</div>}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export function PromptInput({ onSend, isLoading, placeholder = "Ask generic agent...", className }: any) {
    const [input, setInput] = useState('');

    const handleSend = () => {
        if (!input.trim()) return;
        onSend(input);
        setInput('');
    };

    return (
        <div className={cn("relative", className)}>
            <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={placeholder}
                className="min-h-[60px] pr-12 bg-zinc-900/50 border-zinc-800 resize-none rounded-xl focus-visible:ring-purple-900/50"
                onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                    }
                }}
            />
            <Button
                size="icon"
                variant="ghost"
                className="absolute right-2 bottom-2 h-8 w-8 hover:bg-zinc-800"
                onClick={handleSend}
                disabled={isLoading || !input.trim()}
            >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin text-zinc-500" /> : <Play className="w-4 h-4 fill-zinc-400 text-zinc-400" />}
            </Button>
        </div>
    );
}

export function ModelSelector({ defaultValue = "gpt-4", onValueChange }: any) {
    return (
        <Select defaultValue={defaultValue} onValueChange={onValueChange}>
            <SelectTrigger className="w-[180px] h-8 text-xs bg-zinc-900/50 border-zinc-800">
                <SelectValue placeholder="Select Model" />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="gpt-4">GPT-4 Turbo</SelectItem>
                <SelectItem value="claude-3">Claude 3 Opus</SelectItem>
                <SelectItem value="llama-3">Llama 3 70B</SelectItem>
            </SelectContent>
        </Select>
    );
}

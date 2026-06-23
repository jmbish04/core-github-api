import React, { useRef, useEffect } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { SendHorizontal } from 'lucide-react';

export interface ChatInputProps {
  value: string;
  onChange: (val: string) => void;
  onSend: () => void;
  isLoading?: boolean;
}

export const ChatInput: React.FC<ChatInputProps> = ({ value, onChange, onSend, isLoading }) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize logic
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      // Limit max height to prevent it from growing too tall (e.g., max 200px)
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = `${Math.min(scrollHeight, 200)}px`;
    }
  }, [value]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Cmd+Enter or Ctrl+Enter to send
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      if (!isLoading && value.trim()) {
        onSend();
      }
    }
  };

  const handleSend = () => {
    if (!isLoading && value.trim()) {
      onSend();
    }
  };

  return (
    <div className="flex flex-col w-full bg-zinc-900 border-t border-zinc-800 p-4 shrink-0">
      <div className="max-w-3xl w-full mx-auto relative flex items-end bg-zinc-800/50 rounded-xl border border-zinc-700/50 shadow-inner focus-within:ring-1 focus-within:ring-zinc-600 transition-all p-2 gap-2">
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Message Jules... (Cmd + Enter to send)"
          className="min-h-[44px] max-h-[200px] w-full resize-none bg-transparent border-0 focus-visible:ring-0 shadow-none text-zinc-100 placeholder:text-zinc-500 py-3 px-3 scrollbar-thin scrollbar-thumb-zinc-700"
          rows={1}
          disabled={isLoading}
        />
        <div className="shrink-0 pb-1 pr-1">
          <Button
            size="icon"
            onClick={handleSend}
            disabled={!value.trim() || isLoading}
            className="h-10 w-10 bg-zinc-700 hover:bg-zinc-600 text-zinc-100 rounded-lg transition-colors"
          >
            <SendHorizontal size={18} />
          </Button>
        </div>
      </div>
      <div className="text-center mt-2 text-xs text-zinc-500">
        Jules can make mistakes. Consider verifying important information.
      </div>
    </div>
  );
};

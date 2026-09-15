import React, { useRef, useEffect } from 'react';
import { ChatMessage, ChatMessageProps } from './ChatMessage';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2 } from 'lucide-react';

export interface ChatMessageListProps {
  messages: ChatMessageProps[];
  isLoading?: boolean;
}

export const ChatMessageList: React.FC<ChatMessageListProps> = ({ messages, isLoading }) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Scroll to bottom when new messages are added
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isLoading]);

  return (
    <ScrollArea className="flex-1 w-full p-4 h-full">
      <div className="flex flex-col gap-2 max-w-3xl mx-auto w-full">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-zinc-500 text-sm mt-20">
            Start a conversation with Jules...
          </div>
        ) : (
          messages.map((msg, idx) => (
            <ChatMessage key={idx} role={msg.role} content={msg.content} />
          ))
        )}
        
        {isLoading && (
          <div className="flex w-full mb-4 gap-3 justify-start">
            <div className="flex-shrink-0 mt-1">
              <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center border border-zinc-700">
                <Loader2 size={16} className="text-zinc-400 animate-spin" />
              </div>
            </div>
            <div className="px-4 py-3 rounded-2xl bg-zinc-800 text-zinc-100 border border-zinc-700 rounded-tl-sm shadow-sm flex items-center">
              <span className="text-zinc-400 text-xs flex gap-1 items-center">
                <span className="animate-pulse">●</span>
                <span className="animate-pulse delay-75">●</span>
                <span className="animate-pulse delay-150">●</span>
              </span>
            </div>
          </div>
        )}
        
        <div ref={bottomRef} className="h-4" />
      </div>
    </ScrollArea>
  );
};

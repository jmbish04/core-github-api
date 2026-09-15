import React from 'react';
import ReactMarkdown from 'react-markdown';
import { Card } from '@/components/ui/card';
import { Bot, User } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ChatMessageProps {
  role: 'user' | 'assistant';
  content: string;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({ role, content }) => {
  const isUser = role === 'user';

  return (
    <div
      className={cn(
        'flex w-full mb-4 gap-3',
        isUser ? 'justify-end' : 'justify-start'
      )}
    >
      {!isUser && (
        <div className="flex-shrink-0 mt-1">
          <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center border border-zinc-700">
            <Bot size={18} className="text-zinc-300" />
          </div>
        </div>
      )}

      <div
        className={cn(
          'max-w-[85%] md:max-w-[75%] px-4 py-3 rounded-2xl text-sm break-words',
          isUser
            ? 'bg-zinc-100 text-zinc-900 rounded-tr-sm'
            : 'bg-zinc-800 text-zinc-100 border border-zinc-700 rounded-tl-sm shadow-sm'
        )}
      >
        {isUser ? (
          <div className="whitespace-pre-wrap">{content}</div>
        ) : (
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <ReactMarkdown>{content}</ReactMarkdown>
          </div>
        )}
      </div>

      {isUser && (
        <div className="flex-shrink-0 mt-1">
          <div className="w-8 h-8 rounded-full bg-zinc-200 flex items-center justify-center">
            <User size={18} className="text-zinc-600" />
          </div>
        </div>
      )}
    </div>
  );
};

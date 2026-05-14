import React, { useState, useEffect } from 'react';
import { ChatMessageList } from '@/components/jules/ChatMessageList';
import { ChatInput } from '@/components/jules/ChatInput';
import type { ChatMessageProps } from '@/components/jules/ChatMessage';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { FolderGit2, History, GitBranch, Github } from 'lucide-react';

export default function JulesChatPage() {
  const [messages, setMessages] = useState<ChatMessageProps[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string>('');

  // Auto-generate session ID on mount
  useEffect(() => {
    setSessionId(crypto.randomUUID());
  }, []);

  const handleSend = async () => {
    if (!inputValue.trim() || isLoading) return;

    const userMessage = inputValue;
    setInputValue('');
    
    // Add user message to UI immediately
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    try {
      // 1. POST prompt to start processing
      const response = await fetch('/api/jules/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: userMessage, sessionId }),
      });

      if (!response.ok) {
        throw new Error(`Failed to start chat: ${response.statusText}`);
      }

      // 2. Open EventSource for SSE streaming
      const eventSource = new EventSource(`/api/jules/stream/${sessionId}`);
      
      let aiResponseContent = '';

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'token') {
            aiResponseContent += data.text;
            
            // Update the last message if it's an AI message, or create a new one
            setMessages((prev) => {
              const newMessages = [...prev];
              const lastMsg = newMessages[newMessages.length - 1];
              
              if (lastMsg && lastMsg.role === 'assistant') {
                lastMsg.content = aiResponseContent;
                return newMessages;
              } else {
                return [...newMessages, { role: 'assistant', content: aiResponseContent }];
              }
            });
            setIsLoading(false); // We have started receiving tokens
          } else if (data.type === 'done' || data.type === 'error') {
            eventSource.close();
            setIsLoading(false);
          }
        } catch (err) {
          console.error('Error parsing SSE event data:', err);
        }
      };

      eventSource.onerror = (error) => {
        console.error('EventSource failed:', error);
        eventSource.close();
        setIsLoading(false);
        setMessages((prev) => [...prev, { 
          role: 'assistant', 
          content: 'Sorry, I encountered an error connecting to the streaming service.' 
        }]);
      };

    } catch (error) {
      console.error('Error sending message:', error);
      setIsLoading(false);
      setMessages((prev) => [...prev, { 
        role: 'assistant', 
        content: 'Sorry, I encountered an error. Please try again later.' 
      }]);
    }
  };

  return (
    <div className="flex flex-col md:flex-row h-[calc(100vh-4rem)] w-full bg-zinc-950 text-zinc-100 font-sans overflow-hidden">
      {/* Main Chat Area (65% on desktop, 100% on mobile) */}
      <div className="flex-1 md:w-[65%] flex flex-col h-full border-r border-zinc-800 relative z-10 bg-zinc-950">
        {/* Header */}
        <header className="flex items-center justify-between p-4 border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-md sticky top-0 z-20 shrink-0 h-14">
          <div className="flex items-center gap-3">
            <h1 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              Jules
            </h1>
            <Badge variant="outline" className="bg-zinc-800/50 border-zinc-700 text-zinc-300 gap-1.5 text-xs font-medium">
              <FolderGit2 size={12} className="text-zinc-400" />
              <span>@google/jules</span>
            </Badge>
          </div>
        </header>

        {/* Chat Feed */}
        <div className="flex-1 overflow-hidden relative">
          <ChatMessageList messages={messages} isLoading={isLoading} />
        </div>

        {/* Chat Input */}
        <ChatInput
          value={inputValue}
          onChange={setInputValue}
          onSend={handleSend}
          isLoading={isLoading}
        />
      </div>

      {/* Context Panel (35% on desktop, hidden on mobile by default but could be a drawer/tab) */}
      <div className="hidden md:flex md:w-[35%] flex-col h-full bg-zinc-950 p-4 gap-4 overflow-y-auto border-l border-zinc-900">
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-2 pl-1">Context</h2>
        
        <Card className="bg-zinc-900 border-zinc-800 shadow-sm">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2 text-zinc-200">
              <Github size={16} className="text-zinc-400" />
              Current Repository
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-xs text-zinc-400 flex flex-col gap-2 mt-2">
              <div className="flex justify-between border-b border-zinc-800 pb-2">
                <span className="text-zinc-500">Name</span>
                <span className="text-zinc-300 font-mono">@google/jules</span>
              </div>
              <div className="flex justify-between border-b border-zinc-800 pb-2">
                <span className="text-zinc-500">Branch</span>
                <span className="text-zinc-300 flex items-center gap-1 font-mono">
                  <GitBranch size={10} /> main
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Last commit</span>
                <span className="text-zinc-300 font-mono">1a2b3c4</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900 border-zinc-800 shadow-sm">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2 text-zinc-200">
              <History size={16} className="text-zinc-400" />
              Recent Files
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <ul className="text-xs text-zinc-400 flex flex-col gap-2 mt-2 font-mono">
              <li className="flex items-center gap-2 truncate hover:text-zinc-300 cursor-pointer transition-colors p-1 -ml-1 rounded hover:bg-zinc-800/50">
                <span className="text-blue-400">src/</span>components/ChatPage.tsx
              </li>
              <li className="flex items-center gap-2 truncate hover:text-zinc-300 cursor-pointer transition-colors p-1 -ml-1 rounded hover:bg-zinc-800/50">
                <span className="text-blue-400">src/</span>components/ChatInput.tsx
              </li>
              <li className="flex items-center gap-2 truncate hover:text-zinc-300 cursor-pointer transition-colors p-1 -ml-1 rounded hover:bg-zinc-800/50">
                <span className="text-blue-400">src/</span>utils/api.ts
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

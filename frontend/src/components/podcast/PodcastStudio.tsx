import React, { useState, useEffect } from 'react';
import { AssistantModal } from '@assistant-ui/react';
import { AudioPlayer } from '@/components/audio/player';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card } from '@/components/ui/card';

interface Podcast {
  id: string;
  title: string;
  status: string;
  audio_url?: string;
  transcript?: string;
}

export function PodcastStudio() {
  const [podcasts, setPodcasts] = useState<Podcast[]>([]);
  const [activePodcast, setActivePodcast] = useState<Podcast | null>(null);

  useEffect(() => {
    fetch('/api/podcasts')
      .then(res => res.json())
      .then(data => setPodcasts(data || []));
  }, []);

  const handleSelectPodcast = async (id: string) => {
    const res = await fetch(`/api/podcasts/${id}`);
    const data = await res.json();
    setActivePodcast(data);
  };

  const parsedTranscript = activePodcast?.transcript
    ? (typeof activePodcast.transcript === 'string' ? JSON.parse(activePodcast.transcript) : activePodcast.transcript)
    : [];

  return (
    <div className="flex h-full w-full">
      {/* Left Pane: Chat & Generation (assistant-ui) */}
      <div className="w-1/2 border-r border-slate-800 flex flex-col bg-slate-950">
        <div className="flex-1 overflow-hidden p-4">

        </div>
        <div className="p-4 border-t border-slate-800">

        </div>
      </div>

      {/* Right Pane: Library & Player */}
      <div className="w-1/2 flex flex-col bg-slate-900">
        <div className="h-1/3 p-4 border-b border-slate-800 overflow-y-auto">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">Library</h2>
          <div className="space-y-2">
            {podcasts.map(p => (
              <Card
                key={p.id}
                className={`p-3 cursor-pointer hover:bg-slate-800 transition-colors ${activePodcast?.id === p.id ? 'bg-slate-800 border-slate-600' : 'bg-slate-950 border-slate-800'}`}
                onClick={() => handleSelectPodcast(p.id)}
              >
                <div className="flex justify-between items-center">
                  <span className="font-medium">{p.title}</span>
                  <span className="text-xs text-slate-500 bg-slate-900 px-2 py-1 rounded-full">{p.status}</span>
                </div>
              </Card>
            ))}
          </div>
        </div>

        <div className="flex-1 p-4 flex flex-col">
          {activePodcast && activePodcast.status === 'completed' ? (
            <>
              <div className="mb-6 rounded-lg overflow-hidden border border-slate-800 bg-slate-950 shadow-xl">
                <AudioPlayer src={activePodcast.audio_url || ''} />
              </div>
              <ScrollArea className="flex-1 pr-4">
                <div className="space-y-4">
                  {parsedTranscript.map((line: any, idx: number) => (
                    <div key={idx} className="flex flex-col gap-1">
                      <span className={`text-xs font-bold ${line.speaker === 'host1' ? 'text-blue-400' : 'text-emerald-400'}`}>
                        {line.speaker === 'host1' ? 'Host 1' : 'Host 2'}
                      </span>
                      <p className="text-sm text-slate-300 leading-relaxed">{line.text}</p>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </>
          ) : activePodcast ? (
            <div className="flex-1 flex items-center justify-center text-slate-500">
              <p>Podcast is currently {activePodcast.status}...</p>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-slate-500">
              <p>Select a podcast from the library to listen.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

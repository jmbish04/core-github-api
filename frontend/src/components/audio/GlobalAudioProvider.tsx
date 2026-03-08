import React from 'react';
import { AudioProvider } from '@/components/audio/provider';

export function GlobalAudioProvider({ children }: { children: React.ReactNode }) {
  return (
    <AudioProvider>
      {children}
    </AudioProvider>
  );
}

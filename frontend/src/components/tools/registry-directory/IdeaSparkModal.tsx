import React, { useState, useEffect } from 'react';
import { Lightbulb, X } from 'lucide-react';
import { client } from '@/lib/api-client';

interface IdeaSparkModalProps {
  isOpen: boolean;
  onClose: () => void;
  registryTitle: string | null;
}

export const IdeaSparkModal = ({ isOpen, onClose, registryTitle }: IdeaSparkModalProps) => {
  const [idea, setIdea] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && registryTitle) {
      generateIdea();
    }
  }, [isOpen, registryTitle]);

  const generateIdea = async () => {
    setLoading(true);

    try {
      const res = await client.api.tools['shadcn-registry'].spark.$post({
        json: { registryTitle: registryTitle! }
      });

      if (res.ok) {
        const data = await res.json();
        setIdea(data.result);
      } else {
        throw new Error('Failed to spark an idea.');
      }
    } catch (e) {
      setIdea("Failed to spark an idea. Try again!");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card text-card-foreground rounded-xl shadow-2xl w-full max-w-md border border-border p-6 relative animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-2 right-2 text-muted-foreground hover:text-foreground">
          <X size={16} />
        </button>
        <div className="flex flex-col items-center text-center space-y-4">
          <div className="h-12 w-12 bg-amber-500/10 text-amber-500 rounded-full flex items-center justify-center">
             <Lightbulb size={24} className={loading ? "animate-pulse" : ""} />
          </div>
          {loading ? (
            <p className="text-muted-foreground">Sparking a brilliant idea...</p>
          ) : (
            <div>
              <h3 className="font-bold text-foreground mb-2">Project Idea for {registryTitle}</h3>
              <p className="text-muted-foreground leading-relaxed">{idea}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

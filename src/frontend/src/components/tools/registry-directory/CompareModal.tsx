import React, { useState, useEffect } from 'react';
import { ArrowRightLeft, Loader2, X } from 'lucide-react';
import { client } from '@/lib/api-client';
import { RegistryItem } from './data';

interface CompareModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedItems: RegistryItem[];
}

export const CompareModal = ({ isOpen, onClose, selectedItems }: CompareModalProps) => {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && selectedItems.length > 0) {
      generateComparison();
    } else {
      setContent('');
    }
  }, [isOpen, selectedItems]);

  const generateComparison = async () => {
    setLoading(true);
    setError(null);

    const registriesContext = selectedItems.map(i => `${i.title}: ${i.description} (Category: ${i.category})`);

    try {
      const res = await client.api.tools['shadcn-registry'].compare.$post({
        json: { selectedRegistries: registriesContext }
      });

      if (res.ok) {
        const data = await res.json();
        setContent(data.result);
      } else {
        throw new Error('Failed to generate comparison.');
      }
    } catch (err) {
      setError("Failed to generate comparison. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <div className="bg-card text-card-foreground rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden border border-border flex flex-col max-h-[90vh]">
        <div className="p-4 bg-muted text-foreground flex justify-between items-center shrink-0 border-b border-border">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <ArrowRightLeft size={18} className="text-primary" />
            Registry Comparison
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto grow bg-background">
          {loading ? (
             <div className="flex flex-col items-center justify-center h-48 space-y-4">
               <Loader2 size={32} className="animate-spin text-primary" />
               <p className="text-muted-foreground animate-pulse">Analyzing registries...</p>
             </div>
          ) : error ? (
            <div className="text-destructive bg-destructive/10 p-4 rounded-lg text-center">
              {error}
              <button onClick={generateComparison} className="block mx-auto mt-2 text-sm underline">Retry</button>
            </div>
          ) : (
            <div className="prose prose-sm prose-invert max-w-none">
               <div className="whitespace-pre-wrap leading-relaxed text-foreground">
                  {content}
               </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import { Sparkles, Bot, Send, Loader2, X } from 'lucide-react';
import { client } from '@/lib/api-client';

interface AiAdvisorModalProps {
  isOpen: boolean;
  onClose: () => void;
  registries: any[];
}

export const AiAdvisorModal = ({ isOpen, onClose, registries }: AiAdvisorModalProps) => {
  const [query, setQuery] = useState('');
  const [response, setResponse] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSearch = async () => {
    if (!query.trim()) return;

    setLoading(true);
    setError(null);
    setResponse(null);

    const registriesContext = JSON.stringify(registries.map(r => ({ title: r.title, desc: r.description, category: r.category, tags: r.license })));

    try {
      const res = await client.api.tools['shadcn-registry'].advise.$post({
        json: { query, registriesContext }
      });

      if (res.ok) {
        const data = await res.json();
        setResponse(data.result);
      } else {
        throw new Error('Failed to get recommendations.');
      }
    } catch (err) {
      setError("Failed to get recommendations. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <div className="bg-card text-card-foreground rounded-2xl shadow-xl w-full max-w-lg overflow-hidden border border-border">

        {/* Header */}
        <div className="p-6 bg-gradient-to-r from-indigo-500/20 to-purple-600/20 flex justify-between items-start border-b border-border">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Sparkles size={20} className="text-yellow-400" />
              AI Project Advisor
            </h2>
            <p className="text-muted-foreground text-sm mt-1">
              Describe your project, and I'll recommend the best registries.
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {!response && !loading && (
             <div className="bg-muted p-4 rounded-xl text-sm mb-4">
               <strong>Try asking:</strong>
               <ul className="mt-2 space-y-1 list-disc list-inside text-muted-foreground">
                 <li>"I'm building a cyberpunk-themed crypto exchange."</li>
                 <li>"I need a clean, animated landing page for a startup."</li>
                 <li>"A brutalist personal portfolio with bold borders."</li>
               </ul>
             </div>
          )}

          <div className="relative">
            <textarea
              className="w-full border border-input rounded-xl p-4 pr-12 focus:ring-2 focus:ring-ring focus:outline-none resize-none bg-background min-h-[100px]"
              placeholder="Describe what you are building..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSearch())}
            />
            <button
              onClick={handleSearch}
              disabled={loading || !query.trim()}
              className="absolute bottom-3 right-3 p-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
            </button>
          </div>

          {error && (
            <div className="text-destructive text-sm bg-destructive/10 p-3 rounded-lg">
              {error}
            </div>
          )}

          {response && (
            <div className="bg-muted rounded-xl p-4 border border-border animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="prose prose-sm prose-invert max-w-none">
                <div className="flex items-center gap-2 text-primary font-semibold mb-2">
                  <Bot size={16} />
                  <span>Recommendation</span>
                </div>
                <div className="whitespace-pre-wrap leading-relaxed">
                  {response}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

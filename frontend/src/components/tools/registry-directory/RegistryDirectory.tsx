import React, { useState } from 'react';
import {
  Search,
  ExternalLink,
  Github,
  CheckCircle2,
  DollarSign,
  Unlock,
  Box,
  Sparkles,
  Star,
  Check,
  Plus,
  Lightbulb,
  Trash2,
  Microscope,
} from 'lucide-react';
import { registriesList, categories } from './data';
import { AiAdvisorModal } from './AiAdvisorModal';
import { CompareModal } from './CompareModal';
import { IdeaSparkModal } from './IdeaSparkModal';
import { UxResearcherModal } from './UxResearcherModal';

const RatingBadge = ({ rating }: { rating: string }) => {
  const numRating = parseFloat(rating);
  let colorClass = "bg-muted text-foreground border-border";

  if (numRating >= 4.9) colorClass = "bg-yellow-500/20 text-yellow-500 border-yellow-500/30";
  else if (numRating >= 4.7) colorClass = "bg-amber-500/20 text-amber-500 border-amber-500/30";
  else if (numRating >= 4.5) colorClass = "bg-orange-500/20 text-orange-500 border-orange-500/30";

  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold border ${colorClass}`}>
      <Star size={12} className={`mr-1.5 ${numRating >= 4.9 ? "fill-yellow-500 text-yellow-500" : "fill-current opacity-50"}`} />
      {rating}
    </span>
  );
};

const LicenseBadge = ({ type }: { type: string }) => {
  const styles: Record<string, string> = {
    "Open Source": "bg-emerald-500/20 text-emerald-500 border-emerald-500/30",
    "Freemium": "bg-purple-500/20 text-purple-500 border-purple-500/30",
    "Paid": "bg-amber-500/20 text-amber-500 border-amber-500/30"
  };

  const icons: Record<string, React.ReactNode> = {
    "Open Source": <CheckCircle2 size={12} className="mr-1.5" />,
    "Freemium": <Unlock size={12} className="mr-1.5" />,
    "Paid": <DollarSign size={12} className="mr-1.5" />
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold border ${styles[type] || styles["Open Source"]}`}>
      {icons[type]}
      {type}
    </span>
  );
};

const ComponentCountBadge = ({ count }: { count: string }) => {
  const displayCount = count === "Unknown" ? "??" : count;

  return (
    <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold border bg-muted text-foreground border-border">
      <Box size={12} className="mr-1.5 text-muted-foreground" />
      {displayCount}
    </span>
  );
};

export const RegistryDirectory = () => {
  const [activeCategory, setActiveCategory] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [compareList, setCompareList] = useState<any[]>([]);
  const [isCompareModalOpen, setIsCompareModalOpen] = useState(false);
  const [isResearcherOpen, setIsResearcherOpen] = useState(false);

  // Idea Spark State
  const [sparkRegistry, setSparkRegistry] = useState<string | null>(null);

  const filteredRegistries = registriesList.filter(item => {
    const matchesCategory = activeCategory === 'all' || item.category === activeCategory;
    const matchesSearch = item.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          item.description.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const toggleCompare = (registry: any) => {
    setCompareList(prev => {
      const exists = prev.find(r => r.title === registry.title);
      if (exists) {
        return prev.filter(r => r.title !== registry.title);
      }
      if (prev.length >= 3) {
        return prev;
      }
      return [...prev, registry];
    });
  };

  return (
    <div className="min-h-screen bg-background text-foreground font-sans p-6 md:p-12 relative pb-24">
      <AiAdvisorModal
        isOpen={isAiModalOpen}
        onClose={() => setIsAiModalOpen(false)}
        registries={registriesList}
      />

      <CompareModal
        isOpen={isCompareModalOpen}
        onClose={() => setIsCompareModalOpen(false)}
        selectedItems={compareList}
      />

      <IdeaSparkModal
        isOpen={!!sparkRegistry}
        onClose={() => setSparkRegistry(null)}
        registryTitle={sparkRegistry}
      />

      <UxResearcherModal
        isOpen={isResearcherOpen}
        onClose={() => setIsResearcherOpen(false)}
        registries={registriesList}
      />

      <div className="max-w-6xl mx-auto space-y-8">

        {/* Header */}
        <div className="space-y-4 text-center md:text-left flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground">
              Community Registry Directory
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mt-2">
              Discover community registries for shadcn/ui components.
              Add them simply using <code className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono text-foreground">npx shadcn add @registry/component</code>
            </p>
          </div>
        </div>

        {/* Controls */}
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row gap-4">
            {/* Search */}
            <div className="relative flex-grow max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <input
                type="text"
                placeholder="Search registries..."
                className="w-full pl-10 pr-4 py-2 bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-all text-foreground"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            {/* UX Researcher Button */}
            <button
              onClick={() => setIsResearcherOpen(true)}
              className="flex items-center gap-2 px-5 py-2 bg-card text-card-foreground border border-border rounded-lg font-medium shadow-sm hover:shadow-md hover:bg-accent transition-all transform hover:-translate-y-0.5"
              title="Analyze backend repo & generate frontend specs"
            >
              <Microscope size={16} className="text-emerald-500" />
              UX Researcher
            </button>

            {/* AI Advisor Button */}
            <button
              onClick={() => setIsAiModalOpen(true)}
              className="flex items-center gap-2 px-5 py-2 bg-primary text-primary-foreground rounded-lg font-medium shadow-sm hover:shadow-md hover:bg-primary/90 transition-all transform hover:-translate-y-0.5"
            >
              <Sparkles size={16} className="text-yellow-400" />
              Find Perfect Registry
            </button>
          </div>

          {/* Tabs */}
          <div className="flex flex-wrap gap-2">
            {categories.map((cat) => {
              const Icon = cat.icon;
              const isActive = activeCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  className={`
                    flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all border
                    ${isActive
                      ? 'bg-primary text-primary-foreground border-primary shadow-sm transform scale-105'
                      : 'bg-background text-muted-foreground border-border hover:bg-accent hover:text-accent-foreground'}
                  `}
                >
                  <Icon size={16} />
                  {cat.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredRegistries.length > 0 ? (
            filteredRegistries.map((registry, index) => {
              const isSelected = compareList.some(r => r.title === registry.title);

              return (
                <div
                  key={index}
                  className={`group relative bg-card text-card-foreground border rounded-xl p-6 shadow-sm hover:shadow-md transition-all flex flex-col
                    ${isSelected ? 'border-primary ring-1 ring-primary' : 'border-border hover:border-accent'}
                  `}
                >
                  {/* Selection Checkbox */}
                  <div className="absolute top-4 right-4 z-10 flex gap-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); setSparkRegistry(registry.title); }}
                      className="p-1.5 text-amber-400 hover:bg-accent rounded-md transition-colors opacity-0 group-hover:opacity-100"
                      title="Spark an idea with Gemini"
                    >
                      <Lightbulb size={18} />
                    </button>
                    <button
                      onClick={() => toggleCompare(registry)}
                      className={`
                        p-1.5 rounded-md transition-all
                        ${isSelected
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground'}
                      `}
                      title={isSelected ? "Remove from comparison" : "Select to compare"}
                    >
                      {isSelected ? <Check size={16} /> : <Plus size={16} />}
                    </button>
                  </div>

                  {/* Card Header Section */}
                  <div className="mb-4 pr-16">
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="font-bold text-xl text-foreground flex items-center gap-2 leading-tight">
                        {registry.title}
                        {registry.featured && (
                          <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" title="Featured / Popular"></span>
                        )}
                      </h3>
                    </div>

                    {/* Badges Row */}
                    <div className="flex flex-wrap gap-2">
                      <LicenseBadge type={registry.license} />
                      <ComponentCountBadge count={registry.count} />
                      <RatingBadge rating={registry.rating} />
                    </div>
                  </div>

                  <p className="text-muted-foreground text-sm flex-grow leading-relaxed mb-6">
                    {registry.description}
                  </p>

                  <div className="pt-4 border-t border-border flex justify-between items-center mt-auto">
                     <div className="flex gap-2">
                        <a href={registry.url} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors cursor-pointer" title="View Documentation">
                          <ExternalLink size={16} />
                        </a>
                        <div className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors cursor-pointer" title="View on GitHub">
                          <Github size={16} />
                        </div>
                     </div>
                     <button className="text-xs font-semibold text-foreground hover:underline flex items-center gap-1">
                       Install
                       <span className="bg-muted px-1 py-0.5 rounded font-mono text-muted-foreground">npx...</span>
                     </button>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="col-span-full py-12 text-center text-muted-foreground">
              <div className="mx-auto h-12 w-12 text-muted-foreground mb-3 opacity-50">
                <Search className="h-full w-full" />
              </div>
              <p>No registries found matching your criteria.</p>
              <button
                onClick={() => {setActiveCategory('all'); setSearchTerm('');}}
                className="mt-2 text-primary hover:underline text-sm"
              >
                Clear filters
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Comparison Floating Bar */}
      {compareList.length > 0 && (
        <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 bg-card text-card-foreground border border-border shadow-xl rounded-full px-6 py-3 flex items-center gap-4 z-40 animate-in slide-in-from-bottom-4 duration-200">
           <div className="text-sm font-medium text-foreground">
             <span className="text-primary font-bold">{compareList.length}</span> selected
           </div>

           <div className="h-4 w-px bg-border"></div>

           <button
             onClick={() => setCompareList([])}
             className="text-muted-foreground hover:text-foreground transition-colors"
             title="Clear selection"
           >
             <Trash2 size={16} />
           </button>

           <button
             onClick={() => setIsCompareModalOpen(true)}
             disabled={compareList.length < 2}
             className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-1.5 rounded-full text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
           >
             <Sparkles size={14} className="text-primary-foreground/80" />
             Compare with AI
           </button>
        </div>
      )}

    </div>
  );
};

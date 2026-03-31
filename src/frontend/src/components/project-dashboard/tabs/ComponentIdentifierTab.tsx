import React, { useState } from 'react';
import { UxResearcherModal, registriesList } from '@/components/tools/registry-directory';
import { useProjectStore } from '@/stores/useProjectStore';

export const ComponentIdentifierTab = ({ repoFullName }: { repoFullName: string }) => {
  const [isResearcherOpen, setIsResearcherOpen] = useState(true);
  const { currentProject } = useProjectStore();

  return (
    <div className="p-6 h-[80vh]">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold mb-2">Component Identifier</h2>
          <p className="text-muted-foreground">
            Analyze your project's architecture and discover the best Shadcn registries to use.
          </p>
        </div>
        <button
          onClick={() => setIsResearcherOpen(true)}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
        >
          Open Researcher Tool
        </button>
      </div>

      <UxResearcherModal
        isOpen={isResearcherOpen}
        onClose={() => setIsResearcherOpen(false)}
        registries={registriesList}
        initialRepoUrl={`https://github.com/${repoFullName}`}
        initialContext={`Project Name: ${currentProject?.name}\nDescription: ${currentProject?.description || 'N/A'}`}
      />
    </div>
  );
};

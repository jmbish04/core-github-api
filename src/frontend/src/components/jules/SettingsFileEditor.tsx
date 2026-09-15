import React from 'react';
import { useJulesSettingsStore } from '@/stores/useJulesSettingsStore';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FileText, Save } from 'lucide-react';

export const SettingsFileEditor: React.FC = () => {
  const { files, selectedFileId, setSelectedFileId, updateFileContent } = useJulesSettingsStore();

  const selectedFile = files.find((f) => f.id === selectedFileId);

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (selectedFileId) {
      updateFileContent(selectedFileId, e.target.value);
    }
  };

  return (
    <div className="flex h-[600px] border rounded-lg bg-zinc-950/50 shadow-sm overflow-hidden w-full max-w-6xl mx-auto mt-6">
      {/* Sidebar: File List */}
      <div className="w-64 border-r bg-zinc-900/50 flex flex-col">
        <div className="p-4 border-b font-semibold text-zinc-200">
          Configuration Files
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {files.map((file) => (
              <button
                key={file.id}
                onClick={() => setSelectedFileId(file.id)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors ${
                  selectedFileId === file.id
                    ? 'bg-zinc-800 text-zinc-100 font-medium'
                    : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-300'
                }`}
              >
                <FileText className="w-4 h-4" />
                {file.name}
              </button>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Main Content: Editor */}
      <div className="flex-1 flex flex-col min-w-0">
        {selectedFile ? (
          <>
            <div className="h-14 border-b px-4 flex items-center justify-between bg-zinc-900/30">
              <div className="flex items-center gap-2 font-medium text-zinc-300">
                <FileText className="w-4 h-4 text-zinc-500" />
                {selectedFile.name}
              </div>
              <Button size="sm" variant="outline" className="gap-2">
                <Save className="w-4 h-4" />
                Save Changes
              </Button>
            </div>
            <div className="flex-1 p-4">
              <Textarea
                value={selectedFile.content}
                onChange={handleContentChange}
                className="w-full h-full min-h-full font-mono text-sm resize-none bg-zinc-950 border-zinc-800 focus-visible:ring-1 focus-visible:ring-zinc-700"
                spellCheck={false}
              />
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-zinc-500">
            Select a file to edit
          </div>
        )}
      </div>
    </div>
  );
};

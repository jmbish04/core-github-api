import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface JulesSettings {
  general: {
    theme: string;
    notificationsEnabled: boolean;
  };
  webhooks: {
    endpointUrl: string;
    secretKey: string;
  };
  agentBehavior: {
    model: string;
    memoryLimit: number;
    autonomousMode: boolean;
  };
  codingStandards: {
    useTabs: boolean;
    indentSize: number;
    enforceStrictTypes: boolean;
  };
}

export interface FileData {
  id: string;
  name: string;
  content: string;
}

export interface JulesSettingsStore {
  settings: JulesSettings;
  updateSettings: (section: keyof JulesSettings, data: Partial<any>) => void;
  files: FileData[];
  selectedFileId: string | null;
  setSelectedFileId: (id: string | null) => void;
  updateFileContent: (id: string, content: string) => void;
  addFile: (file: FileData) => void;
}

const initialSettings: JulesSettings = {
  general: {
    theme: 'dark',
    notificationsEnabled: true,
  },
  webhooks: {
    endpointUrl: 'https://core-github-api.hacolby.workers.dev/api/webhooks',
    secretKey: '',
  },
  agentBehavior: {
    model: 'gemini-2.5-flash',
    memoryLimit: 10,
    autonomousMode: false,
  },
  codingStandards: {
    useTabs: false,
    indentSize: 2,
    enforceStrictTypes: true,
  },
};

const initialFiles: FileData[] = [
  { id: '1', name: 'AGENTS.md', content: '# AGENTS.md\n\nGuidelines for AI Agents.' },
  { id: '2', name: 'tsconfig.json', content: '{\n  "compilerOptions": {\n    "strict": true\n  }\n}' },
  { id: '3', name: '.gitignore', content: 'node_modules\n.env\ndist' },
];

export const useJulesSettingsStore = create<JulesSettingsStore>()(
  persist(
    (set) => ({
      settings: initialSettings,
      updateSettings: (section, data) =>
        set((state) => ({
          settings: {
            ...state.settings,
            [section]: {
              ...state.settings[section],
              ...data,
            },
          },
        })),
      files: initialFiles,
      selectedFileId: initialFiles[0].id,
      setSelectedFileId: (id) => set({ selectedFileId: id }),
      updateFileContent: (id, content) =>
        set((state) => ({
          files: state.files.map((f) => (f.id === id ? { ...f, content } : f)),
        })),
      addFile: (file) => set((state) => ({ files: [...state.files, file] })),
    }),
    {
      name: 'jules-settings-storage',
    }
  )
);

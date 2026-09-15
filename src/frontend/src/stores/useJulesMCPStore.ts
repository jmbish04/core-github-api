import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface MCPServer {
  id: string;
  name: string;
  url: string;
  authToken?: string;
  description?: string;
  status: 'connected' | 'disconnected';
  toolCount: number;
  createdAt: string;
}

interface JulesMCPState {
  servers: MCPServer[];
  addServer: (server: Omit<MCPServer, 'id' | 'createdAt' | 'status' | 'toolCount'>) => void;
  updateServer: (id: string, updates: Partial<MCPServer>) => void;
  removeServer: (id: string) => void;
  toggleStatus: (id: string) => void;
}

const defaultServers: MCPServer[] = [
  {
    id: 'mcp-1',
    name: 'Cloudflare Workers',
    url: 'https://mcp.cloudflare.com/sse',
    description: 'Cloudflare Workers AI and D1 database tools',
    status: 'connected',
    toolCount: 12,
    createdAt: '2026-03-15T10:00:00Z',
  },
  {
    id: 'mcp-2',
    name: 'GitHub Tools',
    url: 'https://mcp.github.com/sse',
    description: 'Repository management, PR reviews, and issue tracking',
    status: 'connected',
    toolCount: 8,
    createdAt: '2026-03-20T14:30:00Z',
  },
  {
    id: 'mcp-3',
    name: 'Linear Project Sync',
    url: 'https://mcp.linear.app/sse',
    description: 'Sync tasks and issues with Linear workspace',
    status: 'disconnected',
    toolCount: 5,
    createdAt: '2026-03-28T09:15:00Z',
  },
];

export const useJulesMCPStore = create<JulesMCPState>()(
  persist(
    (set) => ({
      servers: defaultServers,

      addServer: (server) =>
        set((state) => ({
          servers: [
            ...state.servers,
            {
              ...server,
              id: `mcp-${Date.now()}`,
              status: 'disconnected',
              toolCount: 0,
              createdAt: new Date().toISOString(),
            },
          ],
        })),

      updateServer: (id, updates) =>
        set((state) => ({
          servers: state.servers.map((s) =>
            s.id === id ? { ...s, ...updates } : s
          ),
        })),

      removeServer: (id) =>
        set((state) => ({
          servers: state.servers.filter((s) => s.id !== id),
        })),

      toggleStatus: (id) =>
        set((state) => ({
          servers: state.servers.map((s) =>
            s.id === id
              ? { ...s, status: s.status === 'connected' ? 'disconnected' : 'connected' }
              : s
          ),
        })),
    }),
    { name: 'jules-mcp-servers' }
  )
);

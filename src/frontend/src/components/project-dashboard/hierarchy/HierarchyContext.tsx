import React, { createContext, useContext, useState, useTransition } from 'react';
import { toast } from "sonner";
import type { UpdateItemInput } from '@/lib/validations';
import { api } from '@/lib/api-client';

interface HierarchyContextType {
  data: any; // Type strictly with schema later
  updateItem: (payload: UpdateItemInput) => Promise<void>;
  addItem: (type: 'epic' | 'story' | 'task', parentId: string, title: string) => Promise<void>;
  deleteItem: (type: 'epic' | 'story' | 'task', id: string) => Promise<void>;
  isPending: boolean;
}

const HierarchyContext = createContext<HierarchyContextType | null>(null);

// --- Recursive Helpers (Immutable) ---

export const updateNestedHierarchy = (node: any, targetId: string, updates: any): any => {
  if (node.id === targetId) return { ...node, ...updates };

  const childKeys = ['epics', 'userStories', 'tasks'];
  for (const key of childKeys) {
    if (node[key] && Array.isArray(node[key])) {
      // Optimization: Only map if target is in this branch
      // (For now, we just map all for simplicity, or use findNodeById check if tree is huge)
       return {
          ...node,
          [key]: node[key].map((child: any) => updateNestedHierarchy(child, targetId, updates))
       };
    }
  }
  return node;
};

export const addChildToNode = (node: any, parentId: string, newChild: any, childKey: string): any => {
  if (node.id === parentId) {
    return {
      ...node,
      [childKey]: [...(node[childKey] || []), newChild]
    };
  }
  
  const keys = ['epics', 'userStories', 'tasks'];
  for (const key of keys) {
    if (node[key]) {
      return {
        ...node,
        [key]: node[key].map((child: any) => addChildToNode(child, parentId, newChild, childKey))
      };
    }
  }
  return node;
};

export const removeNodeById = (node: any, targetId: string): any => {
  const keys = ['epics', 'userStories', 'tasks'];
  
  let newNode = { ...node };
  for (const key of keys) {
    if (newNode[key]) {
      newNode[key] = newNode[key]
        .filter((child: any) => child.id !== targetId)
        .map((child: any) => removeNodeById(child, targetId));
    }
  }
  return newNode;
};


// --- Provider ---

export function HierarchyProvider({ initialData, projectId, children }: { initialData: any, projectId: string, children: React.ReactNode }) {
  // Hydration Safety: Ensure initialData is safe (dates as strings)
  const [data, setData] = useState(initialData);
  const [isPending, startTransition] = useTransition();

  const updateItem = async (payload: UpdateItemInput) => {
    const { type, id, data: updateData } = payload;
    if (!id) return;

    // 1. Optimistic Update
    const previousData = data;
    setData((prev: any) => {
       if (prev.id === id) return { ...prev, ...updateData };
       // Assuming updateNestedHierarchy is defined in scope or imported
       return updateNestedHierarchy(prev, id, updateData);
    });

    // 2. Background Sync
    try {
      const res = await api.projects[':projectId'].hierarchy.$patch({
        param: { projectId },
        json: { ...payload, id } 
      });

      if (!res.ok) throw new Error("Failed to sync");
      toast.success(`${type} updated`);
    } catch (err) {
      setData(previousData);
      toast.error("Sync failed. Reverted.");
    }
  };

  const addItem = async (type: 'epic' | 'story' | 'task', parentId: string, title: string) => {
    const childKeyMap: Record<string, string> = { epic: 'epics', story: 'userStories', task: 'tasks' };
    
    try {
      const res = await api.projects[':projectId'].hierarchy.$post({
        param: { projectId },
        json: { type, parentId, data: { title } }
      });

      if (!res.ok) throw new Error("Failed to create");
      
      const newRow = (await res.json()) as any;
      setData((prev: any) => addChildToNode(prev, parentId, newRow, childKeyMap[type]));
      toast.success(`${type} created`);
    } catch (err) {
        toast.error("Failed to create item");
    }
  };

  const deleteItem = async (type: 'epic' | 'story' | 'task', id: string) => {
    const previousData = data;
    setData((prev: any) => removeNodeById(prev, id)); // Optimistic delete

    try {
      const res = await api.projects[':projectId'].hierarchy.$delete({
        param: { projectId },
        json: { type, id }
      });

      if (!res.ok) throw new Error("Failed to delete");
       toast.success(`${type} deleted`);
    } catch (err) {
      setData(previousData);
      toast.error("Delete failed. Reverted.");
    }
  };

  return (
    <HierarchyContext.Provider value={{ data, updateItem, addItem, deleteItem, isPending }}>
      {children}
    </HierarchyContext.Provider>
  );
}

export const useHierarchy = () => {
    const context = useContext(HierarchyContext);
    if (!context) throw new Error("useHierarchy must be used within HierarchyProvider");
    return context;
}

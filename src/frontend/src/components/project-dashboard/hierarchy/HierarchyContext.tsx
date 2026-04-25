/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState } from 'react';
import { handleGlobalError } from '@/lib/error-handler';
import { handleGlobalSuccess } from '@/lib/success-handler';
import type { UpdateItemInput } from '@/lib/validations';
import { api } from '@/lib/api-client';

interface HierarchyContextType {
  data: any;
  updateItem: (payload: UpdateItemInput) => Promise<void>;
  moveItem: (type: 'epic' | 'story' | 'task', id: string, newParentId: string) => Promise<void>;
  addItem: (type: 'epic' | 'story' | 'task', parentId: string, title: string) => Promise<void>;
  deleteItem: (type: 'epic' | 'story' | 'task', id: string) => Promise<void>;
  isPending: boolean;
}

const HierarchyContext = createContext<HierarchyContextType | null>(null);

// --- Recursive Helpers (Immutable) ---

export function updateNestedHierarchy(node: any, targetId: string, updates: any): any {
  if (node.id === targetId) return { ...node, ...updates };

  const childKeys = ['epics', 'userStories', 'tasks'];
  for (const key of childKeys) {
    if (node[key] && Array.isArray(node[key])) {
      return {
        ...node,
        [key]: node[key].map((child: any) => updateNestedHierarchy(child, targetId, updates))
      };
    }
  }
  return node;
}

export function addChildToNode(node: any, parentId: string, newChild: any, childKey: string): any {
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
}

export function removeNodeById(node: any, targetId: string): any {
  const keys = ['epics', 'userStories', 'tasks'];

  const newNode = { ...node };
  for (const key of keys) {
    if (newNode[key]) {
      newNode[key] = newNode[key]
        .filter((child: any) => child.id !== targetId)
        .map((child: any) => removeNodeById(child, targetId));
    }
  }
  return newNode;
}


// --- Provider ---

export function HierarchyProvider({ initialData, projectId, children }: { initialData: any, projectId: string, children: React.ReactNode }) {
  const [data, setData] = useState(initialData);
  const [isPending, setIsPending] = useState(false);

  const updateItem = async (payload: UpdateItemInput) => {
    const { type, id, data: updateData } = payload;
    if (!id) return;

    const previousData = data;
    setData((prev: any) => {
       if (prev.id === id) return { ...prev, ...updateData };
       return updateNestedHierarchy(prev, id, updateData);
    });

    setIsPending(true);
    try {
      const res = await api.projects[':projectId'].hierarchy.$patch({
        param: { projectId },
        json: { ...payload, id }
      });

      if (!res.ok) throw new Error("Failed to sync");
      handleGlobalSuccess('Updated', `${type} updated`);
    } catch (err) {
      setData(previousData);
      handleGlobalError(`[HierarchyContext] Sync failed. Reverted. ${err}`);
    } finally {
      setIsPending(false);
    }
  };

  const moveItem = async (type: 'epic' | 'story' | 'task', id: string, newParentId: string) => {
    const childKeyMap: Record<string, string> = { epic: 'epics', story: 'userStories', task: 'tasks' };
    const childKey = childKeyMap[type];

    // Find the item first to copy its data
    let movedItem: any = null;
    const findItem = (node: any) => {
      if (node.id === id) movedItem = node;
      const keys = ['epics', 'userStories', 'tasks'];
      for (const k of keys) {
        if (node[k]) {
          node[k].forEach(findItem);
        }
      }
    };
    findItem(data);

    if (!movedItem) return;

    const previousData = data;
    setData((prev: any) => {
      const withoutItem = removeNodeById(prev, id);
      return addChildToNode(withoutItem, newParentId, movedItem, childKey);
    });

    setIsPending(true);
    try {
      const res = await api.projects[':projectId'].hierarchy.$patch({
        param: { projectId },
        json: { type, id, parentId: newParentId, data: {} }
      });

      if (!res.ok) throw new Error("Failed to move");
      handleGlobalSuccess('Moved', `${type} moved successfully`);
    } catch (err) {
      setData(previousData);
      handleGlobalError(`[HierarchyContext] Move failed. Reverted. ${err}`);
    } finally {
      setIsPending(false);
    }
  };

  const addItem = async (type: 'epic' | 'story' | 'task', parentId: string, title: string) => {
    const childKeyMap: Record<string, string> = { epic: 'epics', story: 'userStories', task: 'tasks' };

    setIsPending(true);
    try {
      const res = await api.projects[':projectId'].hierarchy.$post({
        param: { projectId },
        json: { type, parentId, data: { title } }
      });

      if (!res.ok) throw new Error("Failed to create");

      const newRow = (await res.json()) as any;
      setData((prev: any) => addChildToNode(prev, parentId, newRow, childKeyMap[type]));
      handleGlobalSuccess('Created', `${type} created`);
    } catch (err) {
        handleGlobalError(`[HierarchyContext] Failed to create item. ${err}`);
    } finally {
      setIsPending(false);
    }
  };

  const deleteItem = async (type: 'epic' | 'story' | 'task', id: string) => {
    const previousData = data;
    setData((prev: any) => removeNodeById(prev, id));

    setIsPending(true);
    try {
      const res = await api.projects[':projectId'].hierarchy.$delete({
        param: { projectId },
        json: { type, id }
      });

      if (!res.ok) throw new Error("Failed to delete");
       handleGlobalSuccess('Deleted', `${type} deleted`);
    } catch (err) {
      setData(previousData);
      handleGlobalError(`[HierarchyContext] Delete failed. Reverted. ${err}`);
    } finally {
      setIsPending(false);
    }
  };

  return (
    <HierarchyContext.Provider value={{ data, updateItem, moveItem, addItem, deleteItem, isPending }}>
      {children}
    </HierarchyContext.Provider>
  );
}

export function useHierarchy() {
    const context = useContext(HierarchyContext);
    if (!context) throw new Error("useHierarchy must be used within HierarchyProvider");
    return context;
}

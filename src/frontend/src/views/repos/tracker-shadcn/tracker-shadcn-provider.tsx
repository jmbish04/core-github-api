import * as React from 'react'

import type { TrackerShadcnItem } from './data/schema'
import { TrackerShadcnContext } from './use-tracker-shadcn'
import { useParams } from 'react-router-dom'

export function TrackerShadcnProvider({ children }: { children: React.ReactNode }) {
  const { owner, repo } = useParams()
  const [items, setItems] = React.useState<TrackerShadcnItem[]>([])
  const [isLoading, setIsLoading] = React.useState(true)
  const [error, setError] = React.useState<Error | null>(null)

  const fetchItems = React.useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)
      const res = await fetch(`/api/repos/${owner}/${repo}/backlog`, {
        credentials: 'include',
      })
      if (!res.ok) throw new Error('Failed to fetch backlog tasks')
      const json = await res.json()
      
      const allItems: TrackerShadcnItem[] = []
      
      // Flatten hierarchy since TrackerShadcnItem is a flat list
      if (json.success && Array.isArray(json.data)) {
        json.data.forEach((phase: any) => {
          allItems.push({
            id: phase.id,
            type: 'phase' as any,
            title: phase.title,
            status: phase.status || 'todo',
            label: 'feature',
            priority: 'medium',
            parentId: null,
            assignee: null,
            createdAt: new Date().toISOString(),
          })
          
          phase.sprints?.forEach((sp: any) => {
            const sprint = sp.sprint
            allItems.push({
              id: sprint.id,
              type: 'sprint' as any,
              title: sprint.title,
              status: sprint.status || 'todo',
              label: 'feature',
              priority: 'medium',
              parentId: phase.id,
              assignee: null,
              createdAt: new Date().toISOString(),
            })
            
            sprint.epics?.forEach((ep: any) => {
              const epic = ep.epic
              allItems.push({
                id: epic.id,
                type: 'epic' as any,
                title: epic.title,
                status: epic.status || 'todo',
                label: 'feature',
                priority: 'medium',
                parentId: sprint.id,
                assignee: null,
                createdAt: new Date().toISOString(),
              })
              
              epic.stories?.forEach((st: any) => {
                const story = st.story
                allItems.push({
                  id: story.id,
                  type: 'story' as any,
                  title: story.title,
                  status: story.status || 'todo',
                  label: 'feature',
                  priority: 'medium',
                  parentId: epic.id,
                  assignee: null,
                  createdAt: new Date().toISOString(),
                })
                
                story.tasks?.forEach((ta: any) => {
                  const task = ta.task
                  allItems.push({
                    id: task.id,
                    type: 'task' as any,
                    title: task.title,
                    status: task.status || 'todo',
                    label: 'feature',
                    priority: 'medium',
                    parentId: story.id,
                    assignee: null,
                    createdAt: new Date().toISOString(),
                  })
                })
              })
            })
          })
        })
      }

      setItems(allItems)
    } catch (err: any) {
      console.error(err)
      setError(err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  React.useEffect(() => {
    if (owner && repo) {
      fetchItems()
    }
  }, [fetchItems, owner, repo])

  const createItem = async (newItem: Partial<TrackerShadcnItem>) => {
    const optimisticId = `TASK-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
    const item: TrackerShadcnItem = {
      id: optimisticId,
      title: newItem.title || 'Untitled',
      type: (newItem.type as any) || 'task',
      status: newItem.status || 'todo',
      label: newItem.label || 'feature',
      priority: newItem.priority || 'medium',
      parentId: newItem.parentId || null,
      assignee: newItem.assignee || null,
      createdAt: new Date().toISOString(),
    }
    // Optimistic update
    setItems((prev) => [...prev, item])
    try {
      const res = await fetch('/api/projects/sentinel/tasks', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newItem.title || 'Untitled',
          type: newItem.type || 'task',
          status: newItem.status || 'todo',
          label: newItem.label || 'feature',
          priority: newItem.priority || 'medium',
          description: newItem.description || '',
        }),
      })
      if (res.ok) {
        const data = await res.json() as any
        // Replace optimistic item with real server response
        setItems((prev) =>
          prev.map((it) => (it.id === optimisticId ? { ...item, ...data.task } : it))
        )
      }
    } catch (err) {
      console.error('Failed to create task', err)
    }
  }

  const updateItem = async (id: string, updates: Partial<TrackerShadcnItem>) => {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, ...updates } : it))
    )
    try {
      await fetch(`/api/projects/sentinel/tasks/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
    } catch (err) {
      console.error('Failed to patch', err)
      // Revert optimistic update here if necessary
    }
  }

  const deleteItems = async (ids: string[]) => {
    setItems((prev) => prev.filter((it) => !ids.includes(it.id)))
    // await Promise.all(ids.map(id => fetch(`/api/projects/sentinel/tasks/${id}`, { method: 'DELETE' })))
  }

  return (
    <TrackerShadcnContext.Provider
      value={{
        items,
        isLoading,
        error,
        refetch: fetchItems,
        createItem,
        updateItem,
        deleteItems,
      }}
    >
      {children}
    </TrackerShadcnContext.Provider>
  )
}


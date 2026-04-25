import * as React from 'react'
import type { TrackerShadcnItem } from './data/schema'

export interface TrackerShadcnContextType {
  items: TrackerShadcnItem[]
  isLoading: boolean
  error: Error | null
  refetch: () => void
  createItem: (item: Partial<TrackerShadcnItem>) => Promise<void>
  updateItem: (id: string, updates: Partial<TrackerShadcnItem>) => Promise<void>
  deleteItems: (ids: string[]) => Promise<void>
}

export const TrackerShadcnContext = React.createContext<TrackerShadcnContextType | undefined>(
  undefined
)

export function useTrackerShadcn() {
  const context = React.useContext(TrackerShadcnContext)
  if (context === undefined) {
    throw new Error('useTrackerShadcn must be used within a TrackerShadcnProvider')
  }
  return context
}

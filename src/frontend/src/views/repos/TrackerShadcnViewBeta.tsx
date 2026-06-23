import React, { useState } from 'react'
import { TrackerShadcnProvider } from './tracker-shadcn/tracker-shadcn-provider'
import { TrackerShadcnTable } from './tracker-shadcn/tracker-shadcn-table'
import { TrackerShadcnMutateDrawer } from './tracker-shadcn/tracker-shadcn-mutate-drawer'
import { TrackerShadcnImportDialog } from './tracker-shadcn/tracker-shadcn-import-dialog'
import { Button } from '@/components/ui/button'
import { Plus, Upload } from 'lucide-react'

export default function TrackerShadcnViewBeta() {
  const [mutateOpen, setMutateOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)

  return (
    <TrackerShadcnProvider>
      <div className="h-full flex flex-col space-y-4">
        {/* Inline Header to manage feature-specific actions while integrating with the main TrackerLayoutBeta Toolbar */}
        <div className="flex items-center justify-between pb-2 border-b border-zinc-800/60">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-zinc-100">Tasks</h2>
            <p className="text-xs text-zinc-500">
              Manage your project tasks with powerful data table filtering and API-driven execution.
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)} className="h-8 text-xs bg-zinc-900 border-zinc-800 text-zinc-300">
              <Upload className="w-3.5 h-3.5 mr-1.5 text-zinc-400" />
              Import 
            </Button>
            <Button size="sm" onClick={() => setMutateOpen(true)} className="h-8 text-xs bg-indigo-600 hover:bg-indigo-700 text-white">
              <Plus className="w-3.5 h-3.5 mr-1" />
              New Task
            </Button>
          </div>
        </div>

        <div className="flex-1 min-h-0">
          <TrackerShadcnTable />
        </div>

        <TrackerShadcnMutateDrawer open={mutateOpen} onOpenChange={setMutateOpen} />
        <TrackerShadcnImportDialog open={importOpen} onOpenChange={setImportOpen} />
      </div>
    </TrackerShadcnProvider>
  )
}

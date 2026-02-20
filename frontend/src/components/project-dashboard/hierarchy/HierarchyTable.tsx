import React, { useMemo, useState, useEffect } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getExpandedRowModel,
  flexRender,
  type ColumnDef
} from '@tanstack/react-table'
import { ChevronRight, ChevronDown, Plus, Trash2, MoreHorizontal } from 'lucide-react'
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useHierarchy } from "./HierarchyContext"
import { EditableCell } from "./EditableCell" // We will create this
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Input } from "@/components/ui/input"

// Simple Popover to add a child
const AddChildPopover = ({ type, parentId, onAdd }: { type: 'epic'|'story'|'task', parentId: string, onAdd: (t: string) => void }) => {
    const [title, setTitle] = useState("");
    const [open, setOpen] = useState(false);
    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6"><Plus size={14}/></Button>
            </PopoverTrigger>
            <PopoverContent className="w-60 p-2">
                <div className="flex gap-2">
                    <Input 
                        value={title} 
                        onChange={e => setTitle(e.target.value)} 
                        placeholder={`New ${type}...`} 
                        className="h-8 text-xs"
                        onKeyDown={e => {
                            if (e.key === 'Enter' && title) {
                                onAdd(title);
                                setTitle("");
                                setOpen(false);
                            }
                        }}
                    />
                    <Button size="sm" className="h-8" onClick={() => {
                        if(title) { onAdd(title); setTitle(""); setOpen(false); }
                    }}>Add</Button>
                </div>
            </PopoverContent>
        </Popover>
    )
}

export function HierarchyTable() {
  const { data, updateItem, addItem, deleteItem } = useHierarchy();
  const [expanded, setExpanded] = useState({});

  // Memoize data assuming the PROJECT is the root and we want to show its children
  // Or if 'data' IS the project, we might want to start with its Epics? 
  // Let's assume 'data' is the Project object. The table data should be [data] (root) or data.epics (if we hide root)
  // Let's show Root Project as top level.
  const tableData = useMemo(() => [data], [data]);

  const columns = useMemo<ColumnDef<any>[]>(() => [
    {
      accessorKey: 'title',
      header: 'Task Hierarchy',
      cell: ({ row, getValue }) => {
          const type = row.original.projectId ? 'epic' : row.original.epicId ? 'story' : row.original.storyId ? 'task' : 'project';
          // Determine next child type
          const nextType = type === 'project' ? 'epic' : type === 'epic' ? 'story' : type === 'story' ? 'task' : null;

          return (
            <div style={{ paddingLeft: `${row.depth * 24}px` }} className="flex items-center gap-2 group">
              {row.getCanExpand() ? (
                <button onClick={row.getToggleExpandedHandler()} className="cursor-pointer text-muted-foreground hover:text-foreground">
                  {row.getIsExpanded() ? <ChevronDown size={16}/> : <ChevronRight size={16}/>}
                </button>
              ) : <span className="w-4" />}
              
              <EditableCell 
                value={getValue() as string} 
                onChange={(val) => updateItem({ type, id: row.original.id, data: { title: val } })}
                className={row.depth === 0 ? "font-bold" : ""}
              />

              {/* Quick Actions (Add Child / Delete) */}
              <div className="opacity-0 group-hover:opacity-100 flex items-center transition-opacity ml-2">
                  {nextType && (
                      <AddChildPopover 
                        type={nextType} 
                        parentId={row.original.id}
                        onAdd={(title) => addItem(nextType, row.original.id, title)}
                      />
                  )}
                  {type !== 'project' && (
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:bg-destructive/10" 
                        onClick={() => deleteItem(type, row.original.id)}>
                        <Trash2 size={12}/>
                      </Button>
                  )}
              </div>
            </div>
      )},
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row, getValue }) => {
         const type = row.original.projectId ? 'epic' : row.original.epicId ? 'story' : row.original.storyId ? 'task' : 'project';
         return (
             <EditableCell 
                value={getValue() as string} 
                type="select"
                options={['todo', 'in_progress', 'done', 'backlog']}
                onChange={(val) => updateItem({ type, id: row.original.id, data: { status: val as any } })}
                renderDisplay={(val) => <Badge variant="outline" className="capitalize">{val?.replace('_', ' ')}</Badge>}
             />
         )
      }
    },
    {
      accessorKey: 'priority',
      header: 'Priority',
      cell: ({ row, getValue }) => {
         const type = row.original.projectId ? 'epic' : row.original.epicId ? 'story' : row.original.storyId ? 'task' : 'project';
         if (type === 'project') return null; // Projects might not have priority in this view
         return (
             <EditableCell 
                value={getValue() as string} 
                type="select"
                options={['low', 'medium', 'high', 'urgent']}
                onChange={(val) => updateItem({ type, id: row.original.id, data: { priority: val as any } })}
                renderDisplay={(val) => <span className={`capitalize text-xs ${val === 'urgent' ? 'text-red-500 font-bold' : 'text-muted-foreground'}`}>{val}</span>}
             />
         )
      }
    }
  ], [updateItem, addItem, deleteItem]);

  const table = useReactTable({
    data: tableData,
    columns,
    state: { expanded },
    onExpandedChange: setExpanded,
    getSubRows: (row) => row.epics || row.userStories || row.tasks, 
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
  })

  return (
    <div className="rounded-md border bg-card">
      <table className="w-full text-sm text-left">
        <thead className="border-b bg-muted/50">
          {table.getHeaderGroups().map(headerGroup => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map(header => (
                <th key={header.id} className="p-3 font-medium text-muted-foreground">
                  {flexRender(header.column.columnDef.header, header.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map(row => (
            <tr key={row.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
              {row.getVisibleCells().map(cell => (
                <td key={cell.id} className="p-2 pl-3">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

import React, { useMemo, useState } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getExpandedRowModel,
  flexRender,
  type ColumnDef
} from '@tanstack/react-table'
import { ChevronRight, ChevronDown, Plus, Trash2, GripVertical } from 'lucide-react'
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useHierarchy } from "./HierarchyContext"
import { EditableCell } from "./EditableCell"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

import {
  DndContext,
  DragOverlay,
  closestCenter,
  useSensor,
  useSensors,
  PointerSensor,
  type DragEndEvent,
  type DragStartEvent
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

// Simple Popover to add a child
const AddChildPopover = ({ type, onAdd }: { type: 'epic'|'story'|'task', onAdd: (t: string) => void }) => {
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

// Draggable Row Component
const DraggableRow = ({ row }: any) => {
  const {
    attributes,
    listeners,
    transform,
    transition,
    setNodeRef,
    isDragging,
    setActivatorNodeRef,
  } = useSortable({
    id: row.id,
    data: { row },
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    position: isDragging ? 'relative' : 'static',
    zIndex: isDragging ? 1 : 0,
  } as React.CSSProperties

  return (
    <TableRow
      ref={setNodeRef}
      style={style}
      className={isDragging ? 'bg-muted/50' : ''}
    >
      {/* We inject the drag handle in the first cell */}
      {row.getVisibleCells().map((cell: any, i: number) => (
        <TableCell key={cell.id} className="p-2 pl-3">
          <div className="flex items-center">
            {i === 0 && (
              <button
                ref={setActivatorNodeRef}
                {...listeners}
                {...attributes}
                className="mr-2 cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing"
              >
                <GripVertical size={16} />
              </button>
            )}
            {flexRender(cell.column.columnDef.cell, cell.getContext())}
          </div>
        </TableCell>
      ))}
    </TableRow>
  )
}

export function HierarchyTable() {
  const { data, updateItem, addItem, deleteItem, moveItem } = useHierarchy();
  const [expanded, setExpanded] = useState({});

  const tableData = useMemo(() => [data], [data]);

  const columns = useMemo<ColumnDef<any>[]>(() => [
    {
      accessorKey: 'title',
      header: 'Task API / Hierarchy',
      cell: ({ row, getValue }) => {
          const type = row.original.projectId ? 'epic' : row.original.epicId ? 'story' : row.original.storyId ? 'task' : 'project';
          const nextType = type === 'project' ? 'epic' : type === 'epic' ? 'story' : type === 'story' ? 'task' : null;

          return (
            <div style={{ paddingLeft: `${row.depth * 24}px` }} className="flex items-center gap-2 group">
              {row.getCanExpand() ? (
                <button onClick={row.getToggleExpandedHandler()} className="cursor-pointer text-muted-foreground hover:text-foreground">
                  {row.getIsExpanded() ? <ChevronDown size={16}/> : <ChevronRight size={16}/>}
                </button>
              ) : <span className="w-4" />}
              
              {type !== 'project' && (
                 <Badge variant="secondary" className="text-[10px] uppercase font-semibold h-5 px-1.5">{type}</Badge>
              )}

              <EditableCell 
                value={getValue() as string} 
                onChange={(val) => updateItem({ type, id: row.original.id, data: { title: val } })}
                className={row.depth === 0 ? "font-bold text-base" : "font-medium"}
              />

              {/* Quick Actions */}
              <div className="opacity-0 group-hover:opacity-100 flex items-center transition-opacity ml-2">
                  {nextType && (
                      <AddChildPopover 
                        type={nextType} 
                        onAdd={(title) => {
                          addItem(nextType, row.original.id, title);
                          row.toggleExpanded(true);
                        }}
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
         if (type === 'project') return null;
         return (
             <EditableCell 
                value={getValue() as string} 
                type="select"
                options={['todo', 'in_progress', 'done', 'backlog']}
                onChange={(val) => updateItem({ type, id: row.original.id, data: { status: val as any } })}
                renderDisplay={(val) => {
                    const statusColors: any = {
                        todo: "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300",
                        in_progress: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
                        done: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
                        backlog: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300"
                    };
                    return <Badge variant="outline" className={`capitalize shadow-none border-0 ${statusColors[val] || ''}`}>{val?.replace('_', ' ')}</Badge>
                }}
             />
         )
      }
    },
    {
      accessorKey: 'priority',
      header: 'Priority',
      cell: ({ row, getValue }) => {
         const type = row.original.projectId ? 'epic' : row.original.epicId ? 'story' : row.original.storyId ? 'task' : 'project';
         if (type === 'project') return null;
         return (
             <EditableCell 
                value={getValue() as string} 
                type="select"
                options={['low', 'medium', 'high', 'urgent']}
                onChange={(val) => updateItem({ type, id: row.original.id, data: { priority: val as any } })}
                renderDisplay={(val) => <span className={`capitalize text-xs font-medium ${val === 'urgent' ? 'text-red-500 font-bold' : val === 'high' ? 'text-orange-500' : 'text-muted-foreground'}`}>{val}</span>}
             />
         )
      }
    }
  ], [updateItem, addItem, deleteItem]);

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: tableData,
    columns,
    state: { expanded },
    onExpandedChange: setExpanded,
    getSubRows: (row) => row.epics || row.userStories || row.tasks, 
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
  })

  // DnD Setup
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5, // Requires minimum 5px movement before dragging starts
      },
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;

    if (!over || active.id === over.id) return;

    // Get table row models to access original typed data
    const activeRow = table.getRowModel().rows.find(r => r.id === active.id);
    const overRow = table.getRowModel().rows.find(r => r.id === over.id);

    if (!activeRow || !overRow) return;

    const activeOriginal = activeRow.original;
    const overOriginal = overRow.original;

    const activeType = activeOriginal.projectId ? 'epic' : activeOriginal.epicId ? 'story' : activeOriginal.storyId ? 'task' : 'project';
    const overType = overOriginal.projectId ? 'epic' : overOriginal.epicId ? 'story' : overOriginal.storyId ? 'task' : 'project';

    if (activeType === 'task' && overType === 'story') {
        moveItem('task', activeOriginal.id, overOriginal.id);
    } else if (activeType === 'story' && overType === 'epic') {
        moveItem('story', activeOriginal.id, overOriginal.id);
    } else {
        console.log(`Cannot drop a ${activeType} into a ${overType}`);
    }
  };

  const flattenRows = table.getRowModel().rows.map(row => row.id);

  return (
    <DndContext 
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
        <div className="rounded-md border bg-card/50">
          <Table>
            <TableHeader className="bg-muted/30">
              {table.getHeaderGroups().map(headerGroup => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map(header => (
                    <TableHead key={header.id} className="h-10 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
                <SortableContext items={flattenRows} strategy={verticalListSortingStrategy}>
                  {table.getRowModel().rows.map(row => {
                      const type = row.original.projectId ? 'epic' : row.original.epicId ? 'story' : row.original.storyId ? 'task' : 'project';
                      // Root Project cannot be dragged
                      return type === 'project' ? (
                          <TableRow key={row.id}>
                            {row.getVisibleCells().map(cell => (
                                <TableCell key={cell.id} className="p-2 pl-3">
                                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                </TableCell>
                            ))}
                          </TableRow>
                      ) : (
                          <DraggableRow key={row.id} row={row} />
                      )
                  })}
                </SortableContext>
            </TableBody>
          </Table>
        </div>
        <DragOverlay>
             {activeId ? (
                <div className="bg-card border rounded p-2 opacity-80 text-sm flex items-center shadow-lg">
                    <GripVertical size={16} className="text-muted-foreground mr-2"/>
                    Moving item...
                </div>
            ) : null}
        </DragOverlay>
    </DndContext>
  )
}

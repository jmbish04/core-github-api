import * as React from 'react'
import type {
  ColumnFiltersState,
  SortingState,
  VisibilityState,
} from '@tanstack/react-table'
import {
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { useSearchParams } from 'react-router-dom'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

import { DataTablePagination } from './components/data-table/pagination'
import { DataTableToolbar } from './components/data-table/toolbar'

import { statuses, priorities, itemTypes } from './data/data'
import { useTrackerShadcn } from './use-tracker-shadcn'
import { columns } from './tracker-shadcn-columns'
import { Loader2 } from 'lucide-react'

// Convert a column filters array to a URL search params string format efficiently
function setFiltersToUrl(searchParams: URLSearchParams, filters: ColumnFiltersState) {
  // First clear our known filter keys
  searchParams.delete('status')
  searchParams.delete('priority')
  searchParams.delete('type')
  searchParams.delete('search')

  for (const filter of filters) {
    if (filter.id === 'title') {
      if (filter.value) searchParams.set('search', String(filter.value))
    } else if (Array.isArray(filter.value) && filter.value.length > 0) {
      searchParams.set(filter.id, filter.value.join(','))
    }
  }
}

// Convert URLSearchParams to ColumnFiltersState
function getFiltersFromUrl(searchParams: URLSearchParams): ColumnFiltersState {
  const filters: ColumnFiltersState = []
  
  if (searchParams.has('search')) {
    filters.push({ id: 'title', value: searchParams.get('search') })
  }
  if (searchParams.has('status')) {
    filters.push({ id: 'status', value: searchParams.get('status')?.split(',') })
  }
  if (searchParams.has('priority')) {
    filters.push({ id: 'priority', value: searchParams.get('priority')?.split(',') })
  }
  if (searchParams.has('type')) {
    filters.push({ id: 'type', value: searchParams.get('type')?.split(',') })
  }
  return filters
}

export function TrackerShadcnTable() {
  const { items, isLoading } = useTrackerShadcn()
  const [searchParams, setSearchParams] = useSearchParams()

  const [rowSelection, setRowSelection] = React.useState({})
  
  // Initialize state from URL where appropriate
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({})
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    getFiltersFromUrl(searchParams)
  )
  const [sorting, setSorting] = React.useState<SortingState>([])

  // Watch column filters, and sync to url
  React.useEffect(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      setFiltersToUrl(next, columnFilters)
      
      // If the sort or pagination was needed here, we'd add it too.
      // E.g. next.set('sort', sorting...)
      return next
    }, { replace: true })
  }, [columnFilters, setSearchParams])

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Table returns unstable refs by design; compiler skip is expected
  const table = useReactTable({
    data: items,
    columns,
    state: {
      sorting,
      columnVisibility,
      rowSelection,
      columnFilters,
    },
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
  })

  // To let the toolbar component get faceted counts
  const filtersData = [
    {
      columnId: 'status',
      title: 'Status',
      options: statuses,
    },
    {
      columnId: 'priority',
      title: 'Priority',
      options: priorities,
    },
    {
      columnId: 'type',
      title: 'Type',
      options: itemTypes,
    }
  ]

  return (
    <div className='space-y-4 relative w-full h-full flex flex-col min-h-0'>
      <div className='shrink-0'>
        <DataTableToolbar 
          table={table as any} 
          searchKey='title' 
          filters={filtersData} 
        />
      </div>
      
      <div className='rounded-md border flex-1 overflow-auto bg-zinc-950/50 backdrop-blur-sm'>
        <Table>
          <TableHeader className='sticky top-0 bg-zinc-900/90 backdrop-blur-md border-b z-10'>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className='hover:bg-transparent'>
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead key={header.id} colSpan={header.colSpan}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
               <TableRow>
                 <TableCell colSpan={columns.length} className='h-24 text-center'>
                    <div className='flex items-center justify-center text-muted-foreground gap-2'>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Loading items...
                    </div>
                 </TableCell>
               </TableRow>
            ) : table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && 'selected'}
                  className='hover:bg-zinc-800/30 transition-colors'
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className='py-2.5'>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className='h-24 text-center'
                >
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className='shrink-0'>
        <DataTablePagination table={table as any} />
      </div>
    </div>
  )
}

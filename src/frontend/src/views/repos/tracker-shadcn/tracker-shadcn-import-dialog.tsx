import * as React from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { handleGlobalError } from '@/lib/error-handler'
import { handleGlobalSuccess } from '@/lib/success-handler'

import { useTrackerShadcn } from './use-tracker-shadcn'
import { ImportTrackerItemsSchema, type ImportTrackerItemsInput } from '@api/routes/api/projects/sentinel/types'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Textarea } from '@/components/ui/textarea'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type ImportFormValues = ImportTrackerItemsInput

export function TrackerShadcnImportDialog({ open, onOpenChange }: Props) {
  const { createItem } = useTrackerShadcn()
  const form = useForm<ImportFormValues>({
    resolver: zodResolver(ImportTrackerItemsSchema),
    defaultValues: {
      payload: '',
    },
  })

  React.useEffect(() => {
    if (open) {
      form.reset()
    }
  }, [open, form])

  const onSubmit = async (data: ImportFormValues) => {
    try {
      let parsed: any[] = []
      
      try {
        parsed = JSON.parse(data.payload)
      } catch (err: unknown) {
        // Fallback to naive line-by-line parsing if not JSON
        handleGlobalError(new Error(`[TrackerShadcnImportDialog] JSON parse failed, falling back to line-by-line parsing. Details: ${err instanceof Error ? err.message : String(err)}`))
        
        const lines = data.payload.split('\n').filter(Boolean)
        parsed = lines.map((line) => ({ title: line }))
      }

      if (!Array.isArray(parsed)) {
        parsed = [parsed]
      }

      for (const item of parsed) {
        await createItem({
          title: item.title || 'Untitled',
          type: item.type || 'task',
          status: item.status || 'todo',
          label: item.label || 'feature',
          priority: item.priority || 'medium',
          description: item.description || ''
        })
      }
      
      handleGlobalSuccess('Import Complete', `Successfully imported ${parsed.length} tasks.`)
      onOpenChange(false)
    } catch (err: any) {
      handleGlobalError('Failed to import data: ' + err.message)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>Import Tasks</DialogTitle>
          <DialogDescription>
            Paste JSON array of tasks or a simple list of task titles (one per line).
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form id='tracker-import-form' onSubmit={form.handleSubmit(onSubmit)} className='space-y-4'>
            <FormField
              control={form.control}
              name='payload'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Data Payload</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder='[{"title":"New Task","type":"epic"}]'
                      className='font-mono text-sm h-[200px] resize-none'
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>
        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type='submit' form='tracker-import-form'>
            Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

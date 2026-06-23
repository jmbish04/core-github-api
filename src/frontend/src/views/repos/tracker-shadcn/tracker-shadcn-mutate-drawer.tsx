import * as React from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { handleGlobalError } from '@/lib/error-handler'
import { handleGlobalSuccess } from '@/lib/success-handler'

import type { TrackerShadcnItem } from './data/schema'
import { TrackerItemFormSchema, type TrackerItemFormValues } from '@api/routes/api/projects/sentinel/types'
import { useTrackerShadcn } from './use-tracker-shadcn'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { SelectDropdown } from './components/select-dropdown'
import { LinearCombobox } from './components/linear-combobox'
import { itemTypes, labels, statuses } from './data/data'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from '@/components/ui/sheet'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentRow?: TrackerShadcnItem | null
}

type FormValues = TrackerItemFormValues

export function TrackerShadcnMutateDrawer({
  open,
  onOpenChange,
  currentRow,
}: Props) {
  const { createItem, updateItem } = useTrackerShadcn()
  const isUpdate = !!currentRow

  const form = useForm<FormValues>({
    resolver: zodResolver(TrackerItemFormSchema),
    defaultValues: {
      type: 'task',
      title: '',
      description: '',
      status: 'todo',
      label: 'feature',
      priority: 'medium',
    },
  })

  React.useEffect(() => {
    if (currentRow) {
      form.reset({
        type: currentRow.type,
        title: currentRow.title,
        description: currentRow.description || '',
        status: currentRow.status,
        label: currentRow.label,
        priority: currentRow.priority,
      })
    } else {
      form.reset({
        type: 'task',
        title: '',
        description: '',
        status: 'todo',
        label: 'feature',
        priority: 'medium',
      })
    }
  }, [currentRow, form, open])

  const onSubmit = async (data: FormValues) => {
    try {
      if (isUpdate && currentRow) {
        await updateItem(currentRow.id, data as Partial<TrackerShadcnItem>)
        handleGlobalSuccess('Task Updated', 'Task updated successfully.')
      } else {
        await createItem(data as Partial<TrackerShadcnItem>)
        handleGlobalSuccess('Task Created', 'Task created successfully.')
      }
      onOpenChange(false)
    } catch (err: any) {
      handleGlobalError('Failed to save task: ' + err.message)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className='flex flex-col sm:max-w-md'>
        <SheetHeader className='text-left'>
          <SheetTitle>{isUpdate ? 'Update Task' : 'Create Task'}</SheetTitle>
          <SheetDescription>
            {isUpdate
              ? 'Update the task details.'
              : 'Create a new task by filling out the details below.'}
          </SheetDescription>
        </SheetHeader>
        <Form {...form}>
          <form
            id='tracker-mutate-form'
            onSubmit={form.handleSubmit(onSubmit)}
            className='space-y-5 flex-1 overflow-y-auto p-1 pr-4'
          >
            <FormField
              control={form.control}
              name='title'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <Input placeholder='Enter a title' {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className='grid grid-cols-2 gap-4'>
              <FormField
                control={form.control}
                name='type'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type</FormLabel>
                    <SelectDropdown
                      defaultValue={field.value}
                      onValueChange={field.onChange}
                      placeholder='Select type'
                      items={itemTypes.map((t) => ({ label: t.label, value: t.value }))}
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='priority'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Priority</FormLabel>
                    <FormControl>
                      <LinearCombobox
                        value={field.value}
                        onValueChange={field.onChange}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className='grid grid-cols-2 gap-4'>
              <FormField
                control={form.control}
                name='status'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <SelectDropdown
                      defaultValue={field.value}
                      onValueChange={field.onChange}
                      placeholder='Select status'
                      items={statuses.map((s) => ({ label: s.label, value: s.value }))}
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='label'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Label</FormLabel>
                    <SelectDropdown
                      defaultValue={field.value}
                      onValueChange={field.onChange}
                      placeholder='Select label'
                      items={labels.map((l) => ({ label: l.label, value: l.value }))}
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name='description'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder='Add some details about this task' 
                      className='resize-none h-32'
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>
        <SheetFooter className='gap-2 pt-2 sm:space-x-0'>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type='submit' form='tracker-mutate-form'>
            {isUpdate ? 'Update' : 'Create'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

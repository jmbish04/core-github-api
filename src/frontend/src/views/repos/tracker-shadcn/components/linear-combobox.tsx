import * as React from 'react'
import { Check, SignalHigh, SignalLow, SignalMedium, AlertCircle, Ban } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

export type Priority = {
  value: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  shortcut: string
}

export const LINER_PRIORITIES: Priority[] = [
  {
    value: 'no_priority',
    label: 'No priority',
    icon: Ban,
    shortcut: '0',
  },
  {
    value: 'urgent',
    label: 'Urgent',
    icon: AlertCircle,
    shortcut: '1',
  },
  {
    value: 'high',
    label: 'High',
    icon: SignalHigh,
    shortcut: '2',
  },
  {
    value: 'medium',
    label: 'Medium',
    icon: SignalMedium,
    shortcut: '3',
  },
  {
    value: 'low',
    label: 'Low',
    icon: SignalLow,
    shortcut: '4',
  },
]

interface LinearComboboxProps {
  value: string
  onValueChange: (value: string) => void
  disabled?: boolean
}

export function LinearCombobox({
  value,
  onValueChange,
  disabled = false,
}: LinearComboboxProps) {
  const [open, setOpen] = React.useState(false)

  // Global "P" shortcut to trigger the combobox
  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input/textarea
      if (
        e.key === 'p' &&
        (e.target instanceof HTMLBodyElement ||
          e.target instanceof HTMLDivElement)
      ) {
        e.preventDefault()
        setOpen((open) => !open)
      }
    }

    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [])

  const selectedPriority =
    LINER_PRIORITIES.find((priority) => priority.value === value) ||
    LINER_PRIORITIES[0]

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant='outline'
          role='combobox'
          aria-expanded={open}
          disabled={disabled}
          className='w-[140px] justify-between shadow-none h-8 px-2 group'
        >
          <div className='flex items-center'>
            <selectedPriority.icon className='mr-2 h-4 w-4 text-muted-foreground' />
            <span className='truncate'>{selectedPriority.label}</span>
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className='w-[200px] p-0' align='start'>
        <Command
          filter={(value, search) => {
            if (value.includes(search)) return 1
            return 0
          }}
        >
          <CommandInput
            placeholder='Set priority...'
            className='h-9 outline-none border-none ring-0 focus-visible:ring-0 shadow-none'
          />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup>
              {LINER_PRIORITIES.map((priority) => (
                <CommandItem
                  key={priority.value}
                  value={priority.value}
                  onSelect={(currentValue) => {
                    onValueChange(currentValue)
                    setOpen(false)
                  }}
                  className='flex items-center justify-between cursor-pointer'
                >
                  <div className='flex items-center'>
                    <priority.icon className='mr-2 h-4 w-4 text-muted-foreground' />
                    {priority.label}
                  </div>
                  <div className='flex items-center space-x-2'>
                    {value === priority.value && (
                      <Check className='h-4 w-4 opacity-50' />
                    )}
                    <kbd className='inline-flex h-5 items-center rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground'>
                      {priority.shortcut}
                    </kbd>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

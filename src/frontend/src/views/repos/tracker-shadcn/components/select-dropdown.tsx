import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface SelectDropdownProps {
  defaultValue?: string
  onValueChange: (value: string) => void
  placeholder?: string
  items: { label: string; value: string }[]
}

export function SelectDropdown({
  defaultValue,
  onValueChange,
  placeholder,
  items,
}: SelectDropdownProps) {
  return (
    <Select defaultValue={defaultValue} onValueChange={onValueChange}>
      <SelectTrigger className='h-8'>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

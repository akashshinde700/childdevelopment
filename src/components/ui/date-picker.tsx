'use client'

import * as React from 'react'
import { format, parseISO, isValid } from 'date-fns'
import { CalendarIcon } from 'lucide-react'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * DatePicker — reusable popover calendar date picker.
 *
 * Works with ISO date strings (yyyy-MM-dd) so it's a drop-in replacement for
 * `<Input type="date" value={str} onChange={e => ...}>` — the `value` and
 * `onChange` contract is identical, just with a real calendar UI instead of
 * the browser's native date input.
 *
 * Props:
 *   value: string          — ISO date string (yyyy-MM-dd), or '' for empty
 *   onChange: (v: string)  — called with the new ISO date string (or '')
 *   placeholder?: string
 *   className?: string     — applied to the trigger button
 *   disabled?: boolean
 *   buttonSize?: 'sm' | 'default' | 'lg'  (default 'default')
 */
export interface DatePickerProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
  buttonSize?: 'sm' | 'default' | 'lg'
  id?: string
}

export function DatePicker({
  value,
  onChange,
  placeholder = 'Pick a date',
  className,
  disabled = false,
  buttonSize = 'default',
  id,
}: DatePickerProps) {
  // Parse the incoming ISO string into a Date for the Calendar's selected state.
  // react-day-picker expects a real Date (or undefined).
  const selectedDate = React.useMemo(() => {
    if (!value) return undefined
    const d = parseISO(value)
    return isValid(d) ? d : undefined
  }, [value])

  const [open, setOpen] = React.useState(false)

  const handleSelect = (d: Date | undefined) => {
    if (d) {
      onChange(format(d, 'yyyy-MM-dd'))
    } else {
      onChange('')
    }
    setOpen(false)
  }

  const sizeClass =
    buttonSize === 'sm' ? 'h-9 text-sm' :
    buttonSize === 'lg' ? 'h-11' :
    'h-10'

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            'w-full justify-start text-left font-normal',
            sizeClass,
            !value && 'text-muted-foreground',
            className,
          )}
        >
          <CalendarIcon className="mr-1.5 h-4 w-4 shrink-0 text-muted-foreground" />
          {value ? format(parseISO(value), 'dd MMM yyyy') : <span>{placeholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={handleSelect}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  )
}

export default DatePicker

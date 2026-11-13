'use client'

import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useTherapyTypes } from '@/hooks/use-therapy-types'

const CUSTOM = '__custom__'

/**
 * Therapy-type picker: the known types plus "+ Custom therapy type", which
 * swaps the dropdown for a free-text box. Same pattern PackagesPage already
 * uses for package therapy types — shared here so every specialization field
 * (user specialization, employee login) accepts a type that isn't on the
 * built-in list (e.g. "Pediatric Physiotherapy").
 */
export function TherapyTypeSelect({
  value,
  onChange,
  options,
  placeholder = 'Select therapy type',
  allowNone = false,
}: {
  value: string
  onChange: (value: string) => void
  /** Extra types to offer (e.g. this clinic's custom role labels). */
  options?: readonly string[]
  placeholder?: string
  /** Offer a "Not specified" entry that clears the value. */
  allowNone?: boolean
}) {
  // The clinic's own list (Settings → System Config), plus whatever the
  // caller passes. Deliberately NOT including `value`: a value outside the
  // list is a custom one, and that is what switches this to the text box.
  const choices = useTherapyTypes(options ?? [])
  const isCustom = value !== '' && !choices.includes(value)

  if (isCustom) {
    return (
      <div className="space-y-1">
        <Input
          autoFocus
          placeholder="Enter therapy type"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          className="text-xs text-primary hover:underline"
          onClick={() => onChange('')}
        >
          ← Choose from list
        </button>
      </div>
    )
  }

  return (
    <Select
      value={value === '' ? '_none' : value}
      onValueChange={(v) => {
        // A single space is a value the Select treats as set, so the input
        // renders and the user can type over it.
        if (v === CUSTOM) onChange(' ')
        else onChange(v === '_none' ? '' : v)
      }}
    >
      <SelectTrigger className="w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {allowNone && <SelectItem value="_none">Not specified</SelectItem>}
        {choices.map((t) => (
          <SelectItem key={t} value={t}>{t}</SelectItem>
        ))}
        <SelectItem value={CUSTOM} className="text-primary font-medium">+ Custom therapy type</SelectItem>
      </SelectContent>
    </Select>
  )
}

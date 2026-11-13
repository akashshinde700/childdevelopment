'use client'

import React from 'react'
import { Search, X, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * SearchInput — reusable debounced search field.
 *
 * Features:
 * - Search icon on the left
 * - Clear (✕) button on the right (visible when there's text)
 * - Inline loading spinner (shown when `loading` is true)
 * - Focus is preserved on re-renders (the input is uncontrolled-friendly
 *   via the `value` / `onChange` pattern — React keeps focus as long as
 *   the element isn't remounted)
 * - `placeholder` is customizable
 *
 * Usage:
 *   <SearchInput
 *     value={query}
 *     onChange={setQuery}
 *     onClear={clear}
 *     loading={isDebouncing || isFetching}
 *     placeholder="Search patients…"
 *   />
 */

export interface SearchInputProps {
  value: string
  onChange: (value: string) => void
  onClear?: () => void
  loading?: boolean
  placeholder?: string
  className?: string
  autoFocus?: boolean
}

export function SearchInput({
  value,
  onChange,
  onClear,
  loading = false,
  placeholder = 'Search…',
  className,
  autoFocus,
}: SearchInputProps) {
  const handleClear = () => {
    onChange('')
    if (onClear) onClear()
  }

  return (
    <div className={cn('relative', className)}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="w-full pl-9 pr-9 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 outline-none focus:border-blue-300 focus:bg-white transition-colors"
      />
      {/* Right side: loading spinner OR clear button */}
      {loading ? (
        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-500 animate-spin" />
      ) : value ? (
        <button
          type="button"
          onClick={handleClear}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="Clear search"
        >
          <X className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  )
}

export default SearchInput

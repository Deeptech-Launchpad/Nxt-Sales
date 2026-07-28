import { useState, useEffect, useCallback } from 'react'
import api from '../api/client'

// Shared client-side cache for admin-managed dropdown values (Update 2).
// Lives outside the component, keyed by fieldKey, so every form/filter using
// the same field shares one fetch instead of each mounting its own request.
//
// "Changes should immediately reflect across the application" (the
// requirement) means a TTL alone isn't enough — the Dropdown Manager calls
// invalidateDropdownOptions() after every write, which both clears the cache
// and pushes a refetch to any hook instance currently mounted elsewhere.
const cache     = new Map() // fieldKey -> options[]
const listeners = new Map() // fieldKey -> Set<() => void>

export function invalidateDropdownOptions(fieldKey) {
  cache.delete(fieldKey)
  listeners.get(fieldKey)?.forEach(fn => fn())
}

export function useDropdownOptions(fieldKey) {
  const [options, setOptions] = useState(() => cache.get(fieldKey) || [])
  const [loading, setLoading] = useState(!cache.has(fieldKey))

  const load = useCallback(() => {
    setLoading(true)
    api.get(`/dropdowns/${fieldKey}`)
      .then(r => {
        const data = Array.isArray(r.data) ? r.data : []
        cache.set(fieldKey, data)
        setOptions(data)
      })
      .catch(() => {}) // advisory data — a failed fetch just leaves the last-known options in place
      .finally(() => setLoading(false))
  }, [fieldKey])

  useEffect(() => {
    if (!cache.has(fieldKey)) load()
    else setOptions(cache.get(fieldKey))

    if (!listeners.has(fieldKey)) listeners.set(fieldKey, new Set())
    listeners.get(fieldKey).add(load)
    return () => listeners.get(fieldKey).delete(load)
  }, [fieldKey, load])

  return { options, loading }
}

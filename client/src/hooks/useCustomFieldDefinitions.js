import { useState, useEffect, useCallback } from 'react'
import api from '../api/client'

// Shared client-side cache for Dynamic Custom Field definitions, mirroring
// useDropdownOptions.js's pattern exactly: a module-level cache keyed by
// entity ("Company"/"Deal") so every form/list using the same entity shares
// one fetch, plus a listener set so Settings → Custom Fields can push an
// immediate refetch to every mounted consumer after a write.
const cache     = new Map() // entity -> definitions[]
const listeners = new Map() // entity -> Set<() => void>

export function invalidateCustomFieldDefinitions(entity) {
  cache.delete(entity)
  listeners.get(entity)?.forEach(fn => fn())
}

export function useCustomFieldDefinitions(entity) {
  const [fields, setFields]   = useState(() => cache.get(entity) || [])
  const [loading, setLoading] = useState(!cache.has(entity))

  const load = useCallback(() => {
    setLoading(true)
    api.get(`/custom-fields/${entity}`)
      .then(r => {
        const data = Array.isArray(r.data) ? r.data : []
        cache.set(entity, data)
        setFields(data)
      })
      .catch(() => {}) // a failed fetch just leaves the last-known definitions in place
      .finally(() => setLoading(false))
  }, [entity])

  useEffect(() => {
    if (!cache.has(entity)) load()
    else setFields(cache.get(entity))

    if (!listeners.has(entity)) listeners.set(entity, new Set())
    listeners.get(entity).add(load)
    return () => listeners.get(entity).delete(load)
  }, [entity, load])

  return { fields, loading }
}

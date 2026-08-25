// Shared client-side cache for the company email module.
//
// Lives outside the component so returning to the Emails tab re-renders from
// memory instead of refetching. Because it outlives the component, everything
// that can change a company's email data must invalidate it explicitly —
// otherwise the tab would happily show stale conversations.
//
// Refreshed only when actually required:
//   • Sync emails clicked        → sync() rewrites the cache
//   • an email is sent           → invalidateCompanyEmail() from the composer
//   • a sync brings in new mail  → sync() rewrites the cache
//   • company's addresses edited → invalidateCompanyEmail() from Company Detail
//   • switching company          → keyed by companyId
//   • cache older than the TTL   → re-synced on next visit

export const convCache   = new Map()  // companyId → /email/conversations payload
export const threadCache = new Map()  // `${companyId}:${threadId}` → full thread
export const lastSyncAt  = new Map()  // companyId → epoch ms of last successful sync

export const SYNC_TTL_MS = 5 * 60 * 1000

// Drops every cached artefact for one company, so the next render refetches.
// Safe to call with a null/undefined id (no-op).
export function invalidateCompanyEmail(companyId) {
  if (!companyId) return
  convCache.delete(companyId)
  lastSyncAt.delete(companyId)
  for (const key of [...threadCache.keys()]) {
    if (key.startsWith(`${companyId}:`)) threadCache.delete(key)
  }
}

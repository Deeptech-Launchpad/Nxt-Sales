// Helpers for the multi-email / multi-phone fields on Company.
//
// The DB keeps a single primary value (`email` / `phone`) for backward
// compatibility plus a full array (`emails` / `phones`). Older records have no
// array, so we always fall back to the primary scalar.

// Build a clean list from a primary scalar + optional array (array wins).
export function valueList(primary, arr) {
  const list = Array.isArray(arr) ? arr.filter(v => v && String(v).trim()) : []
  if (list.length) return list.map(v => String(v).trim())
  return primary ? [String(primary).trim()] : []
}

// For a form: always give at least one (empty) row to edit.
export function editList(primary, arr) {
  const list = valueList(primary, arr)
  return list.length ? list : ['']
}

// Trim, drop blanks, de-dupe (case-insensitive) — used before submit.
export function cleanList(arr) {
  const seen = new Set()
  const out = []
  for (const raw of (Array.isArray(arr) ? arr : [])) {
    const v = String(raw || '').trim()
    if (!v) continue
    const k = v.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    out.push(v)
  }
  return out
}

// Normalize a stored value into a full https?:// URL suitable for an <a href>,
// or null if it doesn't look like a URL at all. Used anywhere a free-text
// field (Company URL, End PDP URL, Linked Profile, Client Website URL, etc.)
// may or may not actually contain something clickable.
export function normalizeUrl(value) {
  if (value === null || value === undefined) return null
  const v = String(value).trim()
  if (!v) return null
  // Already has a scheme.
  if (/^https?:\/\//i.test(v)) return v
  // Bare-domain / path-looking values ("example.com", "www.foo.com/x") must
  // contain no whitespace and not look like an obvious non-URL placeholder.
  if (/\s/.test(v)) return null
  if (/^(n\/?a|none|tbd|-|--)$/i.test(v)) return null
  if (!/^[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(v)) return null
  return `https://${v}`
}

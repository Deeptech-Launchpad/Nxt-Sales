// Type-aware cell rendering for Dynamic Custom Fields, shared by Companies.jsx
// and Deals.jsx's list tables. Built-in fields never reach this — each
// page's own renderXCell already handles every built-in field's actual shape.
export function renderCustomCell(type, v) {
  if (v === null || v === undefined || v === '') return '--'
  switch (type) {
    case 'checkbox':
      return v ? 'Yes' : 'No'
    case 'date':
      return new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    case 'currency':
      return Number(v).toLocaleString()
    case 'percentage':
      return `${v}%`
    case 'multiselect':
      return Array.isArray(v) && v.length ? v.join(', ') : '--'
    default:
      return String(v)
  }
}

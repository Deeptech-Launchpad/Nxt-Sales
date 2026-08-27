import { useDropdownOptions } from '../hooks/useDropdownOptions'
import { useCustomFieldDefinitions } from '../hooks/useCustomFieldDefinitions'
import SearchableSelect from './SearchableSelect'
import MultiSelectDropdown from './MultiSelectDropdown'

// Extracts a plain { key: value } object from a record's flat `custom.<key>`
// properties — the shape GET /companies, GET /companies/:id, etc. return
// (see server/src/utils/customFieldValues.js's attachCustomFieldValues).
// Used to seed a form's `customFields` state from an existing record.
export function extractCustomFieldValues(record) {
  const out = {}
  if (!record) return out
  for (const [k, v] of Object.entries(record)) {
    if (k.startsWith('custom.')) out[k.slice('custom.'.length)] = v
  }
  return out
}

const INPUT_STYLE = {
  width: '100%', padding: '9px 12px', border: '1.5px solid #cbd5e1', borderRadius: 6,
  fontSize: 17, color: '#0f172a', fontFamily: 'DM Sans, system-ui, sans-serif',
  outline: 'none', boxSizing: 'border-box',
}

function FieldInput({ def, value, onChange }) {
  // Only meaningful for dropdown/multiselect, but called unconditionally
  // (not inside the switch below) so this stays a plain top-level hook call
  // regardless of def.type — for every other type the fetched (typically
  // empty) options list is simply unused.
  const { options } = useDropdownOptions(`${def.entity.toLowerCase()}.custom.${def.key}`)

  switch (def.type) {
    case 'textarea':
      return <textarea rows={3} style={{ ...INPUT_STYLE, resize: 'vertical' }} value={value || ''} onChange={e => onChange(e.target.value)} />
    case 'number': case 'currency': case 'percentage':
      return <input type="number" step="any" style={INPUT_STYLE} value={value ?? ''} onChange={e => onChange(e.target.value)} />
    case 'date':
      return <input type="date" style={INPUT_STYLE} value={value ? String(value).slice(0, 10) : ''} onChange={e => onChange(e.target.value)} />
    case 'checkbox':
      return <input type="checkbox" checked={!!value} onChange={e => onChange(e.target.checked)} style={{ width: 18, height: 18 }} />
    case 'email':
      return <input type="email" style={INPUT_STYLE} value={value || ''} onChange={e => onChange(e.target.value)} />
    case 'phone':
      return <input type="tel" style={INPUT_STYLE} value={value || ''} onChange={e => onChange(e.target.value)} />
    case 'url':
      return <input type="url" style={INPUT_STYLE} value={value || ''} onChange={e => onChange(e.target.value)} placeholder="https://..." />
    case 'dropdown':
      return <SearchableSelect value={value || ''} onChange={onChange} options={options} placeholder={`Select ${def.label}`} />
    case 'multiselect':
      return <MultiSelectDropdown value={Array.isArray(value) ? value : []} onChange={onChange} options={options} placeholder={`Select ${def.label}`} />
    default: // text
      return <input type="text" style={INPUT_STYLE} value={value || ''} onChange={e => onChange(e.target.value)} />
  }
}

// Renders every active custom field for `entity`, appended after a modal's
// existing hardcoded field blocks — never interleaved with them. Renders
// nothing while loading or if no custom fields exist yet for this entity, so
// it's invisible until an admin actually creates one. `values` is a plain
// { key: value } object (unprefixed); `onChange(key, value)` updates just
// that key in the parent's own customFields state slice.
export default function CustomFieldsSection({ entity, values, onChange }) {
  const { fields, loading } = useCustomFieldDefinitions(entity)
  if (loading || fields.length === 0) return null

  return (
    <div style={{ borderTop: '1px solid #f1f5f9', marginTop: 4, paddingTop: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: '#475467', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12 }}>
        Custom Fields
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {fields.map(def => (
          <div key={def.id} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={{ fontSize: 14, fontWeight: 600, color: '#344054', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              {def.label}{def.required && <span style={{ color: '#ef4444' }}> *</span>}
            </label>
            <FieldInput def={def} value={(values || {})[def.key]} onChange={v => onChange(def.key, v)} />
            {def.helpText && <span style={{ fontSize: 14, color: '#475467' }}>{def.helpText}</span>}
          </div>
        ))}
      </div>
    </div>
  )
}

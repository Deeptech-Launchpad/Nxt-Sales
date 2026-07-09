import { Plus, Trash2 } from 'lucide-react'

// A repeatable list of inputs — add / edit / delete multiple values.
// The first row is the Primary value. Style-agnostic: pass `inputStyle` to match
// the surrounding form. `values` is a string[] and onChange returns a string[].
export default function MultiValueInput({
  values,
  onChange,
  type = 'text',
  placeholder = '',
  addLabel = 'Add another',
  inputStyle,
}) {
  const list = values && values.length ? values : ['']

  const update = (i, v) => {
    const next = [...list]
    next[i] = v
    onChange(next)
  }
  const add = () => onChange([...list, ''])
  const remove = (i) => {
    const next = list.filter((_, idx) => idx !== i)
    onChange(next.length ? next : [''])
  }

  const baseInput = {
    flex: 1, minWidth: 0, padding: '9px 12px',
    border: '1.5px solid #cbd5e1', borderRadius: 6, fontSize: 14,
    color: '#0f172a', outline: 'none', boxSizing: 'border-box',
    fontFamily: 'inherit',
    ...(inputStyle || {}),
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {list.map((v, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type={type}
            value={v}
            onChange={e => update(i, e.target.value)}
            placeholder={i === 0 ? placeholder : `${placeholder} (additional)`}
            style={baseInput}
          />
          {i === 0 ? (
            <span style={{
              fontSize: 10, fontWeight: 600, color: '#0d9488',
              background: '#f0fdfa', border: '1px solid #99f6e4',
              borderRadius: 4, padding: '2px 6px', whiteSpace: 'nowrap',
            }}>
              Primary
            </span>
          ) : (
            <button
              type="button"
              onClick={() => remove(i)}
              title="Remove"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'none', border: 'none', cursor: 'pointer',
                color: '#ef4444', padding: 4, borderRadius: 4,
              }}
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          background: 'none', border: 'none', cursor: 'pointer',
          color: '#0d9488', fontSize: 12, fontWeight: 600, padding: '2px 0',
          width: 'fit-content', fontFamily: 'inherit',
        }}
      >
        <Plus size={13} /> {addLabel}
      </button>
    </div>
  )
}

import { useRef, useEffect, useState } from 'react'
import {
  Bold, Italic, Underline, List, ListOrdered, Link2, Heading1, Heading2,
  Pilcrow, Undo2, Redo2, RemoveFormatting, Code2,
} from 'lucide-react'

// Minimal WYSIWYG editor for email bodies.
//
// Built on contentEditable + document.execCommand rather than pulling in a
// third-party editor: the app has no rich-text dependency today, and the
// formatting we need (bold/italic/underline, lists, links, headings,
// paragraphs) is exactly what execCommand already produces as clean, portable
// HTML. Email HTML has to stay simple anyway — a heavier editor would emit
// markup no mail client renders better.
//
// execCommand is formally deprecated but is still implemented in every current
// browser and remains the only synchronous, zero-dependency way to do this;
// there is no replacement API. If it ever goes away, only this file changes.
//
// The value is HTML. A "Source" toggle is available for anyone who genuinely
// wants to hand-tune markup, but nobody is required to touch tags.

const BTN = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: 30, height: 28, border: 'none', background: 'transparent',
  borderRadius: 5, cursor: 'pointer', color: '#334155',
}

function ToolbarButton({ title, onClick, children, active }) {
  return (
    <button
      type="button"
      title={title}
      // onMouseDown + preventDefault keeps the caret/selection in the editor;
      // a plain onClick would blur it first and the command would apply to
      // nothing.
      onMouseDown={e => { e.preventDefault(); onClick() }}
      style={{ ...BTN, background: active ? '#e2e8f0' : 'transparent' }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = '#f1f5f9' }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
    >
      {children}
    </button>
  )
}

const Divider = () => <span style={{ width: 1, height: 18, background: '#e2e8f0', margin: '0 3px' }} />

export default function RichTextEditor({ value, onChange, minHeight = 300, placeholder = '' }) {
  const ref = useRef(null)
  const [showSource, setShowSource] = useState(false)
  // Tracks the last value we pushed outward, so an incoming `value` that is
  // just our own edit echoing back doesn't reset the caret to the start.
  const lastEmitted = useRef(value)

  useEffect(() => {
    if (showSource) return
    if (!ref.current) return
    if (value !== lastEmitted.current) {
      ref.current.innerHTML = value || ''
      lastEmitted.current = value
    }
  }, [value, showSource])

  const emit = () => {
    if (!ref.current) return
    const html = ref.current.innerHTML
    lastEmitted.current = html
    onChange(html)
  }

  const exec = (cmd, arg = null) => {
    document.execCommand(cmd, false, arg)
    emit()
  }

  const addLink = () => {
    const url = window.prompt('Link URL:', 'https://')
    if (!url) return
    exec('createLink', url)
  }

  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden', background: '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '6px 8px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', flexWrap: 'wrap' }}>
        <ToolbarButton title="Bold" onClick={() => exec('bold')}><Bold size={14} /></ToolbarButton>
        <ToolbarButton title="Italic" onClick={() => exec('italic')}><Italic size={14} /></ToolbarButton>
        <ToolbarButton title="Underline" onClick={() => exec('underline')}><Underline size={14} /></ToolbarButton>
        <Divider />
        <ToolbarButton title="Heading 1" onClick={() => exec('formatBlock', '<h1>')}><Heading1 size={14} /></ToolbarButton>
        <ToolbarButton title="Heading 2" onClick={() => exec('formatBlock', '<h2>')}><Heading2 size={14} /></ToolbarButton>
        <ToolbarButton title="Paragraph" onClick={() => exec('formatBlock', '<p>')}><Pilcrow size={14} /></ToolbarButton>
        <Divider />
        <ToolbarButton title="Bulleted list" onClick={() => exec('insertUnorderedList')}><List size={14} /></ToolbarButton>
        <ToolbarButton title="Numbered list" onClick={() => exec('insertOrderedList')}><ListOrdered size={14} /></ToolbarButton>
        <Divider />
        <ToolbarButton title="Insert link" onClick={addLink}><Link2 size={14} /></ToolbarButton>
        <ToolbarButton title="Clear formatting" onClick={() => exec('removeFormat')}><RemoveFormatting size={14} /></ToolbarButton>
        <Divider />
        <ToolbarButton title="Undo" onClick={() => exec('undo')}><Undo2 size={14} /></ToolbarButton>
        <ToolbarButton title="Redo" onClick={() => exec('redo')}><Redo2 size={14} /></ToolbarButton>
        <div style={{ marginLeft: 'auto' }}>
          <ToolbarButton
            title={showSource ? 'Back to visual editor' : 'Edit HTML source (optional)'}
            active={showSource}
            onClick={() => setShowSource(v => !v)}
          >
            <Code2 size={14} />
          </ToolbarButton>
        </div>
      </div>

      {showSource ? (
        <textarea
          value={value || ''}
          onChange={e => { lastEmitted.current = e.target.value; onChange(e.target.value) }}
          style={{
            width: '100%', minHeight, border: 'none', outline: 'none', padding: 14,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12.5,
            lineHeight: 1.6, resize: 'vertical', color: '#0f172a',
          }}
        />
      ) : (
        <div
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          onInput={emit}
          onBlur={emit}
          data-placeholder={placeholder}
          style={{
            minHeight, padding: 14, outline: 'none', fontSize: 14, lineHeight: 1.6,
            color: '#0f172a', fontFamily: 'Verdana, Arial, sans-serif', overflowY: 'auto',
            maxHeight: 520,
          }}
        />
      )}
    </div>
  )
}

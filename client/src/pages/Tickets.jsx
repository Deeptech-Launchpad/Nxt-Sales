import { useState } from 'react'

export default function Tickets() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, background: '#fff', borderRadius: 8, padding: 24, textAlign: 'center', minHeight: '60vh', justifyContent: 'center', alignItems: 'center' }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0f172a', marginBottom: 16 }}>Centralize and manage your tickets</h1>
      <p style={{ fontSize: 14, color: '#64748b', maxWidth: 600, lineHeight: 1.6, marginBottom: 24 }}>
        Assign and track your team's <a href="#" style={{ color: '#3b82f6', fontWeight: 500 }}>Tickets</a> in one place to close tickets efficiently, identify service trends, and delight your customers.
      </p>
      <div style={{ display: 'flex', gap: 12 }}>
        <button style={{ padding: '10px 20px', borderRadius: 6, border: 'none', background: '#e63329', color: '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
          Add ticket
        </button>
        <button style={{ padding: '10px 20px', borderRadius: 6, border: '1.5px solid #e2e8f0', background: '#fff', color: '#e63329', fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
          Import data from a file
        </button>
      </div>
    </div>
  )
}

export default function Meetings() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, background: '#fff', borderRadius: 8, padding: 24, textAlign: 'center', minHeight: '60vh', justifyContent: 'center', alignItems: 'center' }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0f172a', marginBottom: 16 }}>Schedule and track meetings</h1>
      <p style={{ fontSize: 14, color: '#64748b', maxWidth: 600, lineHeight: 1.6, marginBottom: 24 }}>
        Connect your calendar to sync meetings and create a centralized meeting history with your contacts.
      </p>
      <button style={{ padding: '10px 20px', borderRadius: 6, border: 'none', background: '#e63329', color: '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
        Connect calendar
      </button>
    </div>
  )
}

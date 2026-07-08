export default function Products() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, background: '#fff', borderRadius: 8, padding: 24, textAlign: 'center', minHeight: '60vh', justifyContent: 'center', alignItems: 'center' }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0f172a', marginBottom: 16 }}>Create products and simplify your billing workflow</h1>
      <p style={{ fontSize: 14, color: '#64748b', maxWidth: 600, lineHeight: 1.6, marginBottom: 24 }}>
        Organize and store your product data so your sales team can easily bill and get paid.
      </p>
      <button style={{ padding: '10px 20px', borderRadius: 6, border: 'none', background: '#e63329', color: '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
        Create a product
      </button>
    </div>
  )
}

// Shared currency formatter for Deal amounts — supports exactly the
// currencies Create/Edit Deal offers (see CreateDealModal.jsx's CURRENCIES).
export const DEAL_CURRENCIES = ['USD', 'CAD', 'GBP', 'EUR', 'AUD']

export function formatCurrency(amount, currency = 'USD') {
  const n = Number(amount)
  if (!n || n <= 0) return '--'
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(n)
  } catch {
    return n.toLocaleString()
  }
}

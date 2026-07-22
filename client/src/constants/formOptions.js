// Shared dropdown value lists for Company forms.
// Single source of truth — used by the Create and Edit modals so the
// Industry and Country options stay in sync everywhere.

export const INDUSTRIES = [
  'Electronic Components',
  'Electrical Supplies & Lighting',
  'Fasteners & Hardwares',
  'Plumbing & PVF (Pipe, Valve, Fitting)',
  'Medical Devices & Supplies',
  'Fluid Power & Mechanical Power Transmission',
  'Industrial Supply',
  'MRO',
  'Gas & Welding',
  'Construction, Building Materials',
  'Paints & Coatings ( Chemicals)',
  'Safety & PPE',
  'Security Surveillance',
  'Food Service & Catering Supplies',
  'Home Appliances',
  'Industrial Automation',
  'Hand, Power & Machine Tools',
  'HVACR',
  'Janitorial & Sanitation Supplies',
  'Dental Supplies',
  'Veterinary Supplies',
  'Office Supplies',
  'Fire Protection & Safety Supplies',
]

export const COUNTRIES = [
  'USA',
  'UK',
  'CANADA',
  'SOUTH AFRICA',
  'NEW ZEALAND',
  'AUSTRALIA',
  'MALTA',
  'IRELAND',
]

// Deal form option lists (Update 9) — single source of truth for Create/Edit
// Deal modal and the backend's STAGES list (server/src/routes/deals.js).
export const DEAL_STAGES = ['Discussion', 'Pilot', 'Proposal', 'Qualified', 'Negotiation', 'Won', 'Lost']
export const CLIENT_TYPES = ['Existing', 'Partner', 'Prospect']
export const SERVICE_REQUIREMENTS = [
  'Data Enrichment',
  'E-commerce + Data',
  'PIM + Data',
  'PIM + E-commerce + Data',
  'CatalogWiz AI (SaaS) - Subscription',
  'Data Enrichment – Partner Model',
]
export const OPPORTUNITY_TYPES = ['Partnership', 'Expansion', 'New Deal', 'Renewal', 'Pilot', 'Re-Engagement']
export const STRATEGIC_IMPORTANCE = ['High', 'Medium', 'Low']
export const EXPECTED_OUTCOMES = ['Pilot', 'Closure', 'Meeting', 'Partnership']

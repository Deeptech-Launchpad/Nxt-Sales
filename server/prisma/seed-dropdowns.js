// One-time seed: populates DropdownOption from today's hardcoded arrays
// (client/src/constants/formOptions.js + the three duplicated Lead Status
// copies) so cutting over to the DB-backed admin system doesn't change any
// option list that's already live. Idempotent — upserts on the
// (fieldKey, value) unique constraint, safe to re-run.
// Not run at app startup — a bootstrap script only. The 9 fieldKeys below
// must stay in sync with server/src/constants/dropdownFields.js, now the
// canonical runtime registry for these same fields (Dynamic Dropdown
// Detection) — if that naming convention ever changes, update both.
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const SEED = {
  'company.industry': [
    'Electronic Components', 'Electrical Supplies & Lighting', 'Fasteners & Hardwares',
    'Plumbing & PVF (Pipe, Valve, Fitting)', 'Medical Devices & Supplies',
    'Fluid Power & Mechanical Power Transmission', 'Industrial Supply', 'MRO',
    'Gas & Welding', 'Construction, Building Materials', 'Paints & Coatings ( Chemicals)',
    'Safety & PPE', 'Security Surveillance', 'Food Service & Catering Supplies',
    'Home Appliances', 'Industrial Automation', 'Hand, Power & Machine Tools', 'HVACR',
    'Janitorial & Sanitation Supplies', 'Dental Supplies', 'Veterinary Supplies',
    'Office Supplies', 'Fire Protection & Safety Supplies',
  ],
  'company.country': [
    'USA', 'UK', 'CANADA', 'SOUTH AFRICA', 'NEW ZEALAND', 'AUSTRALIA', 'MALTA', 'IRELAND',
  ],
  // Canonical set — dedup of the three previously-duplicated LEAD_STATUSES copies.
  'company.leadStatus': [
    'New', 'Open', 'In Progress', 'Open Deal', 'Unqualified',
    'Attempted to Contact', 'Connected', 'Bad Timing',
  ],
  'deal.stage': ['Discussion', 'Pilot', 'Proposal', 'Qualified', 'Negotiation', 'Won', 'Lost'],
  'deal.clientType': ['Existing', 'Partner', 'Prospect'],
  'deal.serviceRequirement': [
    'Data Enrichment', 'E-commerce + Data', 'PIM + Data', 'PIM + E-commerce + Data',
    'CatalogWiz AI (SaaS) - Subscription', 'Data Enrichment – Partner Model',
  ],
  'deal.opportunityType': ['Partnership', 'Expansion', 'New Deal', 'Renewal', 'Pilot', 'Re-Engagement'],
  'deal.strategicImportance': ['High', 'Medium', 'Low'],
  'deal.expectedOutcome': ['Pilot', 'Closure', 'Meeting', 'Partnership'],
}

async function main() {
  for (const [fieldKey, values] of Object.entries(SEED)) {
    for (let i = 0; i < values.length; i++) {
      await prisma.dropdownOption.upsert({
        where: { fieldKey_value: { fieldKey, value: values[i] } },
        update: {},
        create: { fieldKey, value: values[i], label: values[i], order: i },
      })
    }
    console.log(`[seed-dropdowns] ${fieldKey}: ${values.length} value(s)`)
  }
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())

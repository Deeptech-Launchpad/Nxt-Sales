// Canonical registry of the 9 built-in Company/Deal fields backed by
// DropdownOption. Built-in fields are real Prisma `String` columns with no
// runtime-discoverable "this is dropdown-backed" metadata (DMMF sees
// `leadStatus` and `email` identically), so unlike custom fields — which
// declare dropdown/multiselect explicitly via CustomFieldDefinition.type —
// this one small list is the only place they're still enumerated by hand.
// This is the single source of truth: dropdowns.js's usage-safety check and
// the /api/dropdowns/fields discovery endpoint both read from here instead of
// duplicating this list.
const BUILT_IN_DROPDOWN_FIELDS = [
  { fieldKey: 'company.industry',   label: 'Industry',                   model: 'company', column: 'industry' },
  { fieldKey: 'company.country',    label: 'Country (shared with Deal)', model: 'company', column: 'country', extraUsage: [{ model: 'deal', column: 'country' }] },
  { fieldKey: 'company.leadStatus', label: 'Lead Status',                model: 'company', column: 'leadStatus' },
  // Lead Owner only appears here so it's listed in GET /dropdowns/fields
  // (Settings sidebar) — unlike every other entry, its actual options are
  // never sourced from DropdownOption at all. GET /api/dropdowns/company.ownerId
  // computes them live from the User table instead (see getLeadOwnerOptions
  // in dropdowns.js), and every write route (POST/PATCH/DELETE/reorder)
  // explicitly rejects edits to this fieldKey — so model/column/extraUsage
  // below are unused for it (the delete-safety check they'd feed is never
  // reached for this field).
  { fieldKey: 'company.ownerId', label: 'Lead Owner', model: 'company', column: 'ownerId', extraUsage: [{ model: 'deal', column: 'ownerId' }] },
  { fieldKey: 'deal.stage',               label: 'Stage',                model: 'deal', column: 'stage' },
  { fieldKey: 'deal.clientType',          label: 'Client Type',          model: 'deal', column: 'clientType' },
  { fieldKey: 'deal.serviceRequirement',  label: 'Service Requirement',  model: 'deal', column: 'serviceRequirement' },
  { fieldKey: 'deal.opportunityType',     label: 'Opportunity Type',     model: 'deal', column: 'opportunityType' },
  { fieldKey: 'deal.strategicImportance', label: 'Strategic Importance', model: 'deal', column: 'strategicImportance' },
  { fieldKey: 'deal.expectedOutcome',     label: 'Expected Outcome',     model: 'deal', column: 'expectedOutcome' },
]

module.exports = { BUILT_IN_DROPDOWN_FIELDS }

// Dropdown fields whose options are DISCOVERED from live data instead of being
// curated row-by-row in Settings.
//
// Why this exists: Industry/Country/Lead Status are curated lists — someone
// decides the allowed values. CMS is different: 16k+ companies already carry
// CMS values that were imported, nobody hand-entered them, and new ones appear
// whenever a company is saved with a CMS we've never seen. Hardcoding that list
// would go stale the moment anyone types a new value.
//
// This follows the same shape the Lead Owner field already uses in
// dropdowns.js (getLeadOwnerOptions) — options computed live on read rather
// than sourced from the DropdownOption table — generalised so future dynamic
// filters are a one-line entry here instead of a code change in three places.
//
// Derived values are UNIONed with any curated DropdownOption rows for the same
// fieldKey, so an admin can still add a value in Settings before it exists in
// the data (or relabel/disable one) without losing auto-discovery.
//
// `column` is never taken from user input — it is only ever read from this
// registry, and is additionally whitelisted where the raw query is built.

const DERIVED_DROPDOWN_FIELDS = [
  {
    fieldKey: 'company.cms',
    label: 'CMS',
    model: 'company',
    table: 'Company',
    column: 'cms',
    // Filter param name accepted by GET /api/companies (see buildCompanyWhere).
    filterParam: 'cmsValues',
  },
  {
    fieldKey: 'company.remarks',
    label: 'Remarks',
    model: 'company',
    table: 'Company',
    column: 'remarks',
    filterParam: 'remarksValues',
  },
]

const DERIVED_BY_KEY = new Map(DERIVED_DROPDOWN_FIELDS.map(f => [f.fieldKey, f]))

function getDerivedField(fieldKey) {
  return DERIVED_BY_KEY.get(fieldKey) || null
}

module.exports = { DERIVED_DROPDOWN_FIELDS, getDerivedField }

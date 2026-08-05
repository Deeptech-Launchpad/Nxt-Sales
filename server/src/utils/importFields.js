// Single source of truth for import/template fields.
// Derived dynamically from the Prisma data model (DMMF) so that when a new
// column is added to Company, it automatically appears in the import
// template and mapping — no manual header updates required. Also merges in
// active Dynamic Custom Fields (Update 2) so Import/Export/Edit Columns/
// filters see one unified field list without knowing which fields are
// built-in vs. user-defined.
const { Prisma, PrismaClient } = require('@prisma/client')
const { BUILT_IN_DROPDOWN_FIELDS } = require('../constants/dropdownFields')
const prisma = new PrismaClient()

const CONFIG = {
  Company: {
    requiredKey: 'name',
    exclude: ['id', 'createdAt', 'updatedAt', 'status', 'ownerId'],
    labels: {
      name: 'Company Name', email: 'Email', phone: 'Phone Number',
      domain: 'Company URL', industry: 'Industry',
      country: 'Country of Origin', leadStatus: 'Lead Status',
      notes: 'Notes', endPdpUrl: 'End PDP URL', cms: 'CMS', remarks: 'Remarks',
      contactPersons: 'Contact Person', linkedProfiles: 'Linked Profile',
    },
    order: ['name', 'email', 'phone', 'domain', 'industry', 'country',
      'leadStatus', 'notes', 'endPdpUrl', 'cms', 'remarks',
      'contactPersons', 'linkedProfiles'],
  },
  Deal: {
    requiredKey: 'title',
    exclude: ['id', 'createdAt', 'updatedAt', 'companyId', 'ownerId'],
    labels: {
      title: 'Deal Name', value: 'Estimated Deal Value', currency: 'Currency', stage: 'Deal Stage',
      country: 'Country', companyName: 'Company Name', domainName: 'Domain Name',
      clientType: 'Client Type', contactPerson: 'Contact Person',
      contactPhone: 'Contact Phone Number', contactEmail: 'Contact Email',
      serviceRequirement: 'Service Requirements', clientWebsiteUrl: 'Client Website URL',
      opportunityType: 'Opportunity Type', strategicImportance: 'Strategic Importance',
      expectedOutcome: 'Expected Outcome', notes: 'Notes',
    },
    order: ['title', 'country', 'companyName', 'domainName', 'clientType',
      'contactPerson', 'contactPhone', 'contactEmail', 'serviceRequirement',
      'clientWebsiteUrl', 'opportunityType', 'value', 'currency', 'strategicImportance',
      'expectedOutcome', 'stage', 'notes'],
  },
}

// camelCase → "Title Case" fallback label for any field not explicitly named
function titleCase(s) {
  return s.replace(/([A-Z]+)/g, ' $1').replace(/[_-]+/g, ' ').replace(/^./, c => c.toUpperCase()).replace(/\s+/g, ' ').trim()
}

async function getImportFields(modelName) {
  const cfg = CONFIG[modelName] || { requiredKey: null, exclude: ['id', 'createdAt', 'updatedAt'], labels: {}, order: [] }
  const model = Prisma.dmmf.datamodel.models.find(m => m.name === modelName)
  if (!model) return { requiredKey: cfg.requiredKey, fields: [] }

  // Tags the 3 built-in fields whose values come from DropdownOption (Import's
  // advisory mismatch check reads this) — cross-referenced by model+column
  // against the single canonical registry in constants/dropdownFields.js
  // rather than hardcoding the mapping a second time here.
  const dropdownKeyByColumn = new Map(
    BUILT_IN_DROPDOWN_FIELDS
      .filter(f => f.model === modelName.toLowerCase())
      .map(f => [f.column, f.fieldKey])
  )

  const fields = model.fields
    .filter(f => f.kind === 'scalar' && !cfg.exclude.includes(f.name))
    .map(f => ({
      key: f.name,
      label: cfg.labels[f.name] || titleCase(f.name),
      type: f.type,
      ...(dropdownKeyByColumn.has(f.name) && { dropdownFieldKey: dropdownKeyByColumn.get(f.name) }),
    }))

  const ord = cfg.order || []
  fields.sort((a, b) => {
    const ia = ord.indexOf(a.key), ib = ord.indexOf(b.key)
    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib)
  })

  // Custom fields (Dynamic Custom Fields) always sort after every built-in
  // field, in their own admin-defined order. `custom.` prefix on the key
  // lets every consumer (renderCompanyCell, export, import mapping) branch
  // on "is this a custom field" without a second lookup; `custom: true`
  // distinguishes them from built-ins the same way in the field-list itself.
  // Only enabled definitions are surfaced — a disabled field disappears from
  // forms/columns/import/export but its stored values are untouched.
  const customDefs = await prisma.customFieldDefinition.findMany({
    where: { entity: modelName, enabled: true },
    orderBy: { order: 'asc' },
  })
  const customFields = customDefs.map(def => ({
    key: `custom.${def.key}`,
    label: def.label,
    type: def.type,
    custom: true,
    ...((def.type === 'dropdown' || def.type === 'multiselect') && {
      dropdownFieldKey: `${modelName.toLowerCase()}.custom.${def.key}`,
    }),
  }))

  return { requiredKey: cfg.requiredKey, fields: [...fields, ...customFields] }
}

module.exports = { getImportFields }

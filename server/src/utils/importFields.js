// Single source of truth for import/template fields.
// Derived dynamically from the Prisma data model (DMMF) so that when a new
// column is added to Company, it automatically appears in the import
// template and mapping — no manual header updates required.
const { Prisma } = require('@prisma/client')

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
}

// camelCase → "Title Case" fallback label for any field not explicitly named
function titleCase(s) {
  return s.replace(/([A-Z]+)/g, ' $1').replace(/[_-]+/g, ' ').replace(/^./, c => c.toUpperCase()).replace(/\s+/g, ' ').trim()
}

function getImportFields(modelName) {
  const cfg = CONFIG[modelName] || { requiredKey: null, exclude: ['id', 'createdAt', 'updatedAt'], labels: {}, order: [] }
  const model = Prisma.dmmf.datamodel.models.find(m => m.name === modelName)
  if (!model) return { requiredKey: cfg.requiredKey, fields: [] }

  const fields = model.fields
    .filter(f => f.kind === 'scalar' && !cfg.exclude.includes(f.name))
    .map(f => ({ key: f.name, label: cfg.labels[f.name] || titleCase(f.name), type: f.type }))

  const ord = cfg.order || []
  fields.sort((a, b) => {
    const ia = ord.indexOf(a.key), ib = ord.indexOf(b.key)
    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib)
  })

  return { requiredKey: cfg.requiredKey, fields }
}

module.exports = { getImportFields }

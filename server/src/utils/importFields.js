// Single source of truth for import/template fields.
// Derived dynamically from the Prisma data model (DMMF) so that when a new
// column is added to Contact/Company, it automatically appears in the import
// template and mapping — no manual header updates required.
const { Prisma } = require('@prisma/client')

const CONFIG = {
  Contact: {
    requiredKey: 'email',
    // System / derived / relation columns that shouldn't be import headers
    exclude: ['id', 'createdAt', 'updatedAt', 'status', 'ownerId', 'name', 'notes'],
    labels: {
      firstName: 'First Name', lastName: 'Last Name', email: 'Email',
      phone: 'Phone Number', company: 'Primary Company', jobTitle: 'Job Title',
      linkedinUrl: 'LinkedIn URL', lifecycleStage: 'Lifecycle Stage', leadStatus: 'Lead Status',
    },
    order: ['firstName', 'lastName', 'email', 'phone', 'company', 'jobTitle', 'linkedinUrl', 'lifecycleStage', 'leadStatus'],
  },
  Company: {
    requiredKey: 'name',
    exclude: ['id', 'createdAt', 'updatedAt', 'status', 'ownerId', 'notes'],
    labels: {
      name: 'Company Name', email: 'Email', phone: 'Phone Number', mobile: 'Mobile',
      website: 'Website', domain: 'Company Domain Name', industry: 'Industry',
      industryType: 'Industry Type', companyType: 'Type', leadType: 'Lead Type',
      employeeCount: 'Number of Employees', revenue: 'Annual Revenue',
      country: 'Country of Origin', city: 'City', stateRegion: 'State/Region',
      postalCode: 'Postal Code', timeZone: 'Time Zone',
      originalTrafficSource: 'Original Traffic Source', linkedinUrl: 'LinkedIn URL',
      description: 'Description', lifecycleStage: 'Lifecycle Stage', leadStatus: 'Lead Status',
    },
    order: ['name', 'email', 'phone', 'mobile', 'website', 'domain', 'industry', 'industryType',
      'companyType', 'leadType', 'employeeCount', 'revenue', 'country', 'city', 'stateRegion',
      'postalCode', 'timeZone', 'originalTrafficSource', 'linkedinUrl', 'description',
      'lifecycleStage', 'leadStatus'],
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

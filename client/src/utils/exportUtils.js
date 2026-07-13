import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

const COLUMNS = [
  { key: 'name',           header: 'Name'               },
  { key: 'email',          header: 'Email'              },
  { key: 'phone',          header: 'Phone Number'       },
  { key: 'owner',          header: 'Contact Owner'      },
  { key: 'company',        header: 'Primary Company'    },
  { key: 'lastActivity',   header: 'Last Activity Date' },
  { key: 'leadStatus',     header: 'Lead Status'        },
  { key: 'createdAt',      header: 'Create Date'        },
  { key: 'lifecycleStage', header: 'Lifecycle Stage'    },
  { key: 'jobTitle',       header: 'Job Title'          },
]

function normalize(contacts) {
  return contacts.map(c => ({
    name:           c.name           || `${c.firstName||''} ${c.lastName||''}`.trim(),
    email:          c.email          || '',
    phone:          c.phone          || '--',
    owner:          c.owner?.name    || c.owner || c.ownerInitials || '--',
    company:        c.company        || c.companyName || '--',
    lastActivity:   c.lastActivity   || '--',
    leadStatus:     c.leadStatus     || '--',
    createdAt:      c.createdAt      ? new Date(c.createdAt).toLocaleString() : (c.createdDate || '--'),
    lifecycleStage: c.lifecycleStage || '--',
    jobTitle:       c.jobTitle       || '--',
  }))
}

// Generic row normalizer for an arbitrary field list (used by Companies export
// via a dynamic column set). Formats owner/date fields sensibly; everything
// else is read straight off the record.
function normalizeGeneric(records, columns) {
  return records.map(r => {
    const out = {}
    for (const c of columns) {
      let v = r[c.key]
      if (c.key === 'ownerId') v = r.owner?.name || '--'
      else if (v instanceof Date || c.key === 'createdAt' || c.key === 'updatedAt') {
        v = v ? new Date(v).toLocaleString() : '--'
      } else if (Array.isArray(v)) v = v.join('; ')
      out[c.key] = (v === undefined || v === null || v === '') ? '--' : v
    }
    return out
  })
}

// `columns` is optional — defaults to the existing Contacts column set so
// Contacts export behaviour is completely unchanged. Pass a custom [{key,
// header}] list (e.g. the dynamic Company field list) to export other entities.
export function exportCSV(contacts, filename = 'contacts', columns = COLUMNS) {
  const rows = columns === COLUMNS ? normalize(contacts) : normalizeGeneric(contacts, columns)
  const header = columns.map(c => c.header).join(',')
  const lines  = rows.map(r =>
    columns.map(c => `"${String(r[c.key] || '').replace(/"/g, '""')}"`).join(',')
  )
  const csv = [header, ...lines].join('\n')
  download(new Blob([csv], { type: 'text/csv' }), `${filename}.csv`)
}

export function exportXLSX(contacts, filename = 'contacts', columns = COLUMNS, sheetName = 'Contacts') {
  const rows = columns === COLUMNS ? normalize(contacts) : normalizeGeneric(contacts, columns)
  const ws   = XLSX.utils.json_to_sheet(rows.map(r =>
    Object.fromEntries(columns.map(c => [c.header, r[c.key] || '']))
  ))
  const wb   = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName)
  XLSX.writeFile(wb, `${filename}.xlsx`)
}

export function exportJSON(contacts, filename = 'contacts', columns = COLUMNS) {
  const rows = columns === COLUMNS ? normalize(contacts) : normalizeGeneric(contacts, columns)
  download(new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' }), `${filename}.json`)
}

export function exportPDF(contacts, filename = 'contacts', columns = COLUMNS, title = 'Contacts Export — NXT MarketingWiz') {
  const rows = columns === COLUMNS ? normalize(contacts) : normalizeGeneric(contacts, columns)
  const doc  = new jsPDF({ orientation: 'landscape' })
  doc.setFontSize(14)
  doc.text(title, 14, 15)
  autoTable(doc, {
    startY: 22,
    head:   [columns.map(c => c.header)],
    body:   rows.map(r => columns.map(c => r[c.key] || '')),
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [230, 51, 41] },
    alternateRowStyles: { fillColor: [248, 250, 252] },
  })
  doc.save(`${filename}.pdf`)
}

function download(blob, name) {
  const url = URL.createObjectURL(blob)
  const a   = document.createElement('a')
  a.href    = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

// ── CSV/XLSX template for import ──────────────────────────
export function downloadTemplate(format = 'csv') {
  const headers = ['First Name', 'Last Name', 'Email', 'Phone Number', 'Primary Company', 'Job Title', 'Lifecycle Stage', 'Lead Status']
  const example = ['John', 'Smith', 'john.smith@example.com', '+1-555-1234', 'Acme Corp', 'Sales Manager', 'Lead', 'New']

  if (format === 'xlsx') {
    const ws = XLSX.utils.aoa_to_sheet([headers, example])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Contacts')
    XLSX.writeFile(wb, 'contacts_import_template.xlsx')
  } else {
    const csv = [headers.join(','), example.map(v => `"${v}"`).join(',')].join('\n')
    download(new Blob([csv], { type: 'text/csv' }), 'contacts_import_template.csv')
  }
}

// ── Parse imported file ────────────────────────────────────
export async function parseImportFile(file) {
  const ext = file.name.split('.').pop().toLowerCase()

  if (ext === 'csv') {
    const Papa = await import('papaparse')
    return new Promise((resolve, reject) => {
      Papa.default.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: r => resolve(mapRows(r.data)),
        error:    e => reject(e),
      })
    })
  }

  if (ext === 'xlsx' || ext === 'xls') {
    const buf  = await file.arrayBuffer()
    const wb   = XLSX.read(buf)
    const ws   = wb.Sheets[wb.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' })
    return mapRows(rows)
  }

  throw new Error(`Unsupported format: .${ext}. Please use .csv or .xlsx`)
}

function mapRows(rows) {
  return rows.map(r => ({
    firstName:      r['First Name']      || r['firstName']      || '',
    lastName:       r['Last Name']       || r['lastName']       || '',
    name:           r['Name']            || r['name']           || '',
    email:          r['Email']           || r['email']          || '',
    phone:          r['Phone Number']    || r['phone']          || '',
    company:        r['Primary Company'] || r['company']        || '',
    jobTitle:       r['Job Title']       || r['jobTitle']       || '',
    lifecycleStage: r['Lifecycle Stage'] || r['lifecycleStage'] || 'Lead',
    leadStatus:     r['Lead Status']     || r['leadStatus']     || '',
  }))
}

// ── Dynamic, field-driven import template + mapping ───────────────────────────
// `fields` is [{ key, label }] fetched from the backend (derived from the model),
// so templates automatically include every current field with no hardcoded list.
export function buildTemplateFromFields(fields, format = 'csv', filename = 'import_template') {
  const headers = fields.map(f => f.label)
  if (format === 'xlsx') {
    const ws = XLSX.utils.aoa_to_sheet([headers])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Template')
    XLSX.writeFile(wb, `${filename}.xlsx`)
  } else {
    const csv = headers.map(h => `"${String(h).replace(/"/g, '""')}"`).join(',') + '\n'
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `${filename}.csv`; a.click()
    URL.revokeObjectURL(url)
  }
}

// Read a CSV/XLSX file into raw rows keyed by the file's own header names.
export async function parseRawFile(file) {
  const ext = file.name.split('.').pop().toLowerCase()
  if (ext === 'csv') {
    const Papa = await import('papaparse')
    return new Promise((resolve, reject) => {
      Papa.default.parse(file, {
        header: true, skipEmptyLines: true,
        complete: r => resolve(r.data), error: e => reject(e),
      })
    })
  }
  if (ext === 'xlsx' || ext === 'xls') {
    const buf = await file.arrayBuffer()
    const wb  = XLSX.read(buf)
    const ws  = wb.Sheets[wb.SheetNames[0]]
    return XLSX.utils.sheet_to_json(ws, { defval: '' })
  }
  throw new Error(`Unsupported format: .${ext}. Please use .csv or .xlsx`)
}

// Map raw rows → objects keyed by field.key, matching by label then key
// (case-insensitive), so both friendly headers and raw keys work.
export function mapRowsToFields(rawRows, fields) {
  return rawRows.map(row => {
    const lower = {}
    for (const k of Object.keys(row)) lower[k.toLowerCase().trim()] = row[k]
    const out = {}
    for (const f of fields) {
      let v = row[f.label]
      if (v === undefined) v = row[f.key]
      if (v === undefined) v = lower[f.label.toLowerCase()]
      if (v === undefined) v = lower[f.key.toLowerCase()]
      out[f.key] = (v === undefined || v === null) ? '' : String(v).trim()
    }
    return out
  })
}

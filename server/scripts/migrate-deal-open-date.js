// Moves Deal Open Date values out of a duplicate CUSTOM field and into the real
// Deal.openDate column, then hides the duplicate from the form.
//
// Why this exists: someone created a Custom Field on Deal whose key shadows a
// built-in column — "deal  open date" slugified to `dealOpenDate`, while the
// real column is `openDate`. The Create/Edit Deal form then showed TWO Deal Open
// Date inputs, people typed into the custom one, and the Deals filter (which
// correctly reads the real column) found nothing. That is the reported
// "No deals found".
//
// Nothing is deleted. Values are COPIED into the real column, the custom values
// stay exactly where they are, and the duplicate definition is disabled rather
// than removed — so it is hidden from the form but every value remains
// recoverable by re-enabling it in Settings -> Custom Fields.
//
//   node scripts/migrate-deal-open-date.js            dry run, writes nothing
//   node scripts/migrate-deal-open-date.js --apply    copy values across
//   node scripts/migrate-deal-open-date.js --apply --hide-duplicate
//                                                     ...and hide the field
require('dotenv').config()
const { PrismaClient, Prisma } = require('@prisma/client')
const prisma = new PrismaClient()

const APPLY = process.argv.includes('--apply')
const HIDE = process.argv.includes('--hide-duplicate')

// A custom field "shadows" a built-in when stripping the entity-name prefix
// from its key lands on a real column: dealOpenDate -> openDate.
function shadowedBuiltIn(entity, key) {
  const model = Prisma.dmmf.datamodel.models.find(m => m.name === entity)
  if (!model) return null
  const builtIns = new Set(model.fields.filter(f => f.kind === 'scalar').map(f => f.name))
  if (builtIns.has(key)) return key
  const prefix = entity.toLowerCase()
  if (key.toLowerCase().startsWith(prefix)) {
    const rest = key.slice(prefix.length)
    const camel = rest.charAt(0).toLowerCase() + rest.slice(1)
    if (builtIns.has(camel)) return camel
  }
  return null
}

;(async () => {
  console.log(APPLY ? 'MODE: apply\n' : 'MODE: dry run — nothing will be written\n')

  const defs = await prisma.customFieldDefinition.findMany({ where: { entity: 'Deal' } })
  const shadows = defs
    .map(d => ({ def: d, builtIn: shadowedBuiltIn('Deal', d.key) }))
    .filter(x => x.builtIn)

  console.log(`Deal custom fields: ${defs.length}`)
  if (!shadows.length) {
    console.log('  none shadow a built-in Deal column — nothing to migrate.')
    await prisma.$disconnect()
    return
  }

  for (const { def, builtIn } of shadows) {
    console.log(`\n  DUPLICATE  custom "${def.label}" (key: ${def.key}, type: ${def.type})`)
    console.log(`             shadows the built-in Deal.${builtIn}   enabled=${def.enabled}`)

    const values = await prisma.customFieldValue.findMany({ where: { fieldId: def.id } })
    console.log(`             values stored in the custom field: ${values.length}`)
    if (!values.length) continue

    let copied = 0, skippedHasValue = 0, skippedNoDeal = 0, skippedEmpty = 0
    for (const v of values) {
      const raw = v.dateValue ?? (v.textValue ? new Date(v.textValue) : null)
      if (!raw || Number.isNaN(new Date(raw).getTime())) { skippedEmpty++; continue }

      const deal = await prisma.deal.findUnique({ where: { id: v.recordId }, select: { id: true, title: true, [builtIn]: true } })
      if (!deal) { skippedNoDeal++; continue }

      // Never overwrite a value already in the real column — the built-in is the
      // source of truth, so if it already holds something, that wins.
      if (deal[builtIn] != null) { skippedHasValue++; continue }

      const iso = new Date(raw).toISOString().slice(0, 10)
      console.log(`             ${APPLY ? 'copy' : 'would copy'}  ${iso}  ->  Deal.${builtIn}   "${deal.title}"`)
      if (APPLY) await prisma.deal.update({ where: { id: deal.id }, data: { [builtIn]: new Date(raw) } })
      copied++
    }
    console.log(`             ${APPLY ? 'copied' : 'would copy'}: ${copied}   already set: ${skippedHasValue}   deal missing: ${skippedNoDeal}   empty: ${skippedEmpty}`)

    if (HIDE && APPLY) {
      await prisma.customFieldDefinition.update({ where: { id: def.id }, data: { enabled: false } })
      console.log('             duplicate field DISABLED — hidden from the form, values retained')
    } else if (HIDE) {
      console.log('             would disable the duplicate field (values retained)')
    } else {
      console.log('             (re-run with --hide-duplicate to remove it from the form)')
    }
  }

  const remaining = await prisma.deal.count({ where: { openDate: null } })
  const dated = await prisma.deal.count({ where: { openDate: { not: null } } })
  console.log(`\nDeals with a real Open Date: ${dated}   still without one: ${remaining}`)

  await prisma.$disconnect()
})().catch(async e => { console.error('ERROR:', e.message); await prisma.$disconnect(); process.exit(1) })

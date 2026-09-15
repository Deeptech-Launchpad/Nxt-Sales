const router = require('express').Router()
const auth   = require('../middleware/authMiddleware')
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

// Editable AI prompt / email templates for the Email Tool (Update 8).
//
// The eight originals (2 client types x 4 templates) previously lived hardcoded
// in the client. They are seeded here on first use from the client's own
// defaults — see POST /seed — so there is exactly ONE prompt system, not two:
// once a row exists it is what the composer uses.
//
// The originals are marked isSystem, kept fully editable and disable-able.
// Deleting one is allowed (explicit user decision, 2026-09-15) — it does not
// remove the composer's option for that slot, since EmailTool.jsx's template
// dropdown (BUILT_IN_TEMPLATE_OPTIONS) is a hardcoded client-side list, not
// derived from these rows. What actually happens: compilePreview()'s
// savedFor(key) finds nothing once the row is gone, so it falls through to
// the same hardcoded default content that slot used before Update 8 ever
// existed — any customization made to it here is lost, not the slot itself.
//
// No AI configuration lives here — generation still uses the existing Gemini
// key/model from Email Tool Settings.

const KINDS = new Set(['content', 'ai_prompt'])
const clean = (v, max = 200) => String(v === undefined || v === null ? '' : v).trim().slice(0, max)

// GET /api/prompt-templates — everything, ordered for the management screen.
// ?clientType=ecommerce narrows it for the composer.
router.get('/', auth, async (req, res) => {
  try {
    const { clientType } = req.query
    const rows = await prisma.promptTemplate.findMany({
      where: clientType ? { clientType } : undefined,
      orderBy: [{ clientType: 'asc' }, { order: 'asc' }],
    })
    res.json(rows)
  } catch (err) {
    console.error('[PromptTemplates] list error:', err.message)
    res.status(500).json({ message: 'Server error.' })
  }
})

// POST /api/prompt-templates/seed — one-time import of the built-in defaults.
//
// The default content lives in the client (it always did), so the client posts
// it here the first time the templates screen or composer needs it. Uses
// skipDuplicates on the (clientType, templateKey) unique key, so calling this
// again can never overwrite a template someone has since edited — it only ever
// fills in ones that do not exist yet.
router.post('/seed', auth, async (req, res) => {
  try {
    const { templates } = req.body
    if (!Array.isArray(templates) || !templates.length) {
      return res.status(400).json({ message: 'No templates provided.' })
    }

    const data = templates
      .filter(t => t && t.clientType && t.templateKey)
      .map((t, i) => ({
        clientType: clean(t.clientType, 40),
        templateKey: clean(t.templateKey, 40),
        label: clean(t.label) || `Template ${t.templateKey}`,
        kind: KINDS.has(t.kind) ? t.kind : 'content',
        subject: t.subject ? String(t.subject).slice(0, 500) : null,
        content: String(t.content || ''),
        isSystem: true,
        order: Number.isFinite(t.order) ? t.order : i,
      }))

    const result = await prisma.promptTemplate.createMany({ data, skipDuplicates: true })
    res.json({ seeded: result.count, received: data.length })
  } catch (err) {
    console.error('[PromptTemplates] seed error:', err.message)
    res.status(500).json({ message: 'Server error.' })
  }
})

// POST /api/prompt-templates — create an additional template.
router.post('/', auth, async (req, res) => {
  try {
    const { clientType, templateKey, label, kind, subject, content } = req.body
    if (!clientType || !templateKey || !label) {
      return res.status(400).json({ message: 'clientType, templateKey and label are required.' })
    }
    const max = await prisma.promptTemplate.aggregate({ where: { clientType }, _max: { order: true } })
    const created = await prisma.promptTemplate.create({
      data: {
        clientType: clean(clientType, 40),
        templateKey: clean(templateKey, 40),
        label: clean(label),
        kind: KINDS.has(kind) ? kind : 'content',
        subject: subject ? String(subject).slice(0, 500) : null,
        content: String(content || ''),
        isSystem: false,
        order: (max._max.order ?? -1) + 1,
      },
    })
    res.status(201).json(created)
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ message: 'A template with that key already exists for this client type.' })
    }
    console.error('[PromptTemplates] create error:', err.message)
    res.status(500).json({ message: 'Server error.' })
  }
})

// PUT /api/prompt-templates/:id — edit label / subject / content / enabled.
// clientType and templateKey are intentionally immutable: they are how the
// composer looks a template up, so changing them would break existing usage.
router.put('/:id', auth, async (req, res) => {
  try {
    const { label, subject, content, enabled, kind } = req.body
    const updated = await prisma.promptTemplate.update({
      where: { id: req.params.id },
      data: {
        ...(label !== undefined && { label: clean(label) }),
        ...(subject !== undefined && { subject: subject ? String(subject).slice(0, 500) : null }),
        ...(content !== undefined && { content: String(content) }),
        ...(enabled !== undefined && { enabled: !!enabled }),
        ...(kind !== undefined && KINDS.has(kind) && { kind }),
      },
    })
    res.json(updated)
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ message: 'Template not found.' })
    console.error('[PromptTemplates] update error:', err.message)
    res.status(500).json({ message: 'Server error.' })
  }
})

// DELETE /api/prompt-templates/:id — any template, built-in included
// (explicit user decision, 2026-09-15 — see the comment above). Deleting a
// built-in row does not remove the composer's option for that slot; it
// reverts that slot's content to the original hardcoded default. Row must
// still exist to be deleted; that 404 is the only guard left here.
router.delete('/:id', auth, async (req, res) => {
  try {
    const row = await prisma.promptTemplate.findUnique({ where: { id: req.params.id } })
    if (!row) return res.status(404).json({ message: 'Template not found.' })
    await prisma.promptTemplate.delete({ where: { id: req.params.id } })
    res.json({ ok: true })
  } catch (err) {
    console.error('[PromptTemplates] delete error:', err.message)
    res.status(500).json({ message: 'Server error.' })
  }
})

module.exports = router

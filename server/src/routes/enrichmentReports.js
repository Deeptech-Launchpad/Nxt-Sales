const router = require('express').Router()
const auth = require('../middleware/authMiddleware')
const { PrismaClient } = require('@prisma/client')
const multer = require('multer')
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')
const { execFileSync } = require('child_process')
const PDFDocument = require('pdfkit')
const { GoogleGenAI } = require('@google/genai')

const prisma = new PrismaClient()
const ROOT = path.join(__dirname, '../../uploads/enrichment-reports')
const IMAGE_DIR = path.join(ROOT, 'images')
const PDF_DIR = path.join(ROOT, 'pdfs')
const DEFAULT_LOGO = path.join(__dirname, '../../../client/public/AltiusNXT_Logo-01.png')
fs.mkdirSync(IMAGE_DIR, { recursive: true })
fs.mkdirSync(PDF_DIR, { recursive: true })

const ALLOWED = new Set(['image/png', 'image/jpeg', 'image/webp', 'application/pdf'])
const upload = multer({
  storage: multer.diskStorage({
    destination: IMAGE_DIR,
    filename: (_, file, cb) => cb(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`)
  }),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_, file, cb) => ALLOWED.has(file.mimetype) ? cb(null, true) : cb(new Error('Only PNG, JPG, JPEG, WebP and PDF files are supported.')),
})

const STATUSES = new Set(['Draft', 'Ready for Review', 'PDF Generated', 'Shared'])
const MATRIX_AREAS = [
  'Product Title & Naming',
  'Brand Normalization',
  'Description & Features',
  'Taxonomy & Categorization',
  'Technical Specifications',
  'Structured Attributes / Schema',
  'Units of Measure',
  'Compliance & Certification',
  'Documentation & Manuals',
  'Product Identifiers',
  'Documentation & Digital Assets',
  'SEO & Search Readiness',
  'Faceted Search Filtering',
  'Data Standardization',
  'Buyer Experience & Readiness'
]
const RESULT_STATUSES = new Set(['Added', 'Enriched', 'Improved', 'Standardized', 'Corrected', 'Unchanged', 'Not Detected'])
const SCORE_AREAS = ['Content Completeness', 'Technical Specifications', 'Taxonomy', 'Structured Attributes', 'Search Readiness', 'Buyer Clarity', 'Digital Assets', 'Compliance Information']

const clean = (v, max = 500) => String(v ?? '').trim().slice(0, max)
const normalize = body => ({
  name: clean(body.name, 200),
  clientName: clean(body.clientName, 160),
  clientLogo: body.clientLogo && typeof body.clientLogo === 'object' ? body.clientLogo : null,
  preparedFor: clean(body.preparedFor, 160) || null,
  preparedBy: clean(body.preparedBy, 160) || 'AltiusNxt Technologies Pvt Ltd',
  reportDate: body.reportDate ? new Date(body.reportDate) : new Date(),
  projectName: clean(body.projectName, 200) || 'Product Data Enrichment POC',
  executiveSummary: String(body.executiveSummary || '').slice(0, 6000),
  nextSteps: String(body.nextSteps || '').slice(0, 4000),
  overallBusinessValue: String(body.overallBusinessValue || '').slice(0, 6000),
  footerText: clean(body.footerText, 200) || 'AltiusNxt Technologies',
  status: STATUSES.has(body.status) ? body.status : 'Draft',
  products: Array.isArray(body.products) ? body.products : [],
  branding: body.branding && typeof body.branding === 'object' ? body.branding : {},
})

router.get('/', auth, async (req, res) => {
  try {
    const rows = await prisma.productEnrichmentReport.findMany({
      where: { ownerId: req.user.id },
      orderBy: { updatedAt: 'desc' },
      include: { owner: { select: { name: true } } }
    })
    res.json(rows)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

router.get('/clients', auth, async (req, res) => {
  try {
    const companies = await prisma.company.findMany({
      where: { ownerId: req.user.id, deletedAt: null },
      select: { id: true, name: true, domain: true, industry: true },
      orderBy: { name: 'asc' }
    })
    res.json(companies)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

router.get('/:id', auth, async (req, res) => {
  try {
    const row = await prisma.productEnrichmentReport.findFirst({
      where: { id: req.params.id, ownerId: req.user.id }
    })
    row ? res.json(row) : res.status(404).json({ message: 'Report not found.' })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

router.post('/', auth, async (req, res) => {
  try {
    const data = normalize(req.body)
    if (!data.name || !data.clientName) return res.status(400).json({ message: 'Report name and client name are required.' })
    const row = await prisma.productEnrichmentReport.create({
      data: { ...data, ownerId: req.user.id }
    })
    res.status(201).json(row)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

router.put('/:id', auth, async (req, res) => {
  try {
    const exists = await prisma.productEnrichmentReport.findFirst({
      where: { id: req.params.id, ownerId: req.user.id }
    })
    if (!exists) return res.status(404).json({ message: 'Report not found.' })
    const row = await prisma.productEnrichmentReport.update({
      where: { id: exists.id },
      data: normalize(req.body)
    })
    res.json(row)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

router.delete('/:id', auth, async (req, res) => {
  try {
    const row = await prisma.productEnrichmentReport.findFirst({
      where: { id: req.params.id, ownerId: req.user.id }
    })
    if (!row) return res.status(404).json({ message: 'Report not found.' })
    await prisma.productEnrichmentReport.delete({ where: { id: row.id } })
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

router.post('/:id/duplicate', auth, async (req, res) => {
  try {
    const row = await prisma.productEnrichmentReport.findFirst({
      where: { id: req.params.id, ownerId: req.user.id }
    })
    if (!row) return res.status(404).json({ message: 'Report not found.' })
    const copy = await prisma.productEnrichmentReport.create({
      data: {
        name: `${row.name} - Copy`,
        clientName: row.clientName,
        preparedFor: row.preparedFor,
        preparedBy: row.preparedBy,
        reportDate: new Date(),
        projectName: row.projectName,
        executiveSummary: row.executiveSummary,
        overallBusinessValue: row.overallBusinessValue,
        nextSteps: row.nextSteps,
        footerText: row.footerText,
        products: row.products,
        branding: row.branding || {},
        status: 'Draft',
        ownerId: req.user.id
      }
    })
    res.status(201).json(copy)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

router.post('/upload/image', auth, (req, res) => upload.single('image')(req, res, err => {
  if (err) return res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ message: err.message })
  if (!req.file) return res.status(400).json({ message: 'Select a file to upload.' })
  res.status(201).json({
    filename: req.file.originalname,
    size: req.file.size,
    mimeType: req.file.mimetype,
    url: `/uploads/enrichment-reports/images/${req.file.filename}`
  })
}))

router.post('/analysis/generate', auth, async (req, res) => {
  try {
    const p = req.body || {}
    if (!p.beforeImage?.url || !p.afterImage?.url) return res.status(422).json({ message: 'Upload both Before and After files.' })
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey || apiKey === 'YOUR_GEMINI_API_KEY') return res.status(503).json({ message: 'Backend Gemini API key is not configured.' })

    const toPart = asset => {
      const file = imagePath(asset)
      if (!file || !fs.existsSync(file)) throw new Error(`Uploaded file not found: ${asset.filename || 'file'}`)
      return { inlineData: { mimeType: asset.mimeType || 'image/png', data: fs.readFileSync(file).toString('base64') } }
    }

    const prompt = `You are a senior product data analyst for AltiusNxt. Compare BEFORE (original client product page) and AFTER (enriched product page).
Identify the product strictly from visible evidence. Do not invent unverified facts, attributes, or certifications.
Return ONLY valid JSON with this exact shape:
{
  "productName": "extracted product title",
  "brand": "extracted brand",
  "sku": "SKU or MPN if visible",
  "category": "product taxonomy category",
  "beforeSummary": "detailed evidence-based explanation of original listing state, unstructured fields, and missing attributes",
  "afterSummary": "detailed evidence-based explanation of added attributes, standardized taxonomy, structured specs, and compliance details",
  "keyTransformation": "strong commercial and buyer impact statement",
  "businessImpact": "detailed explanation of why this specific enrichment matters (faceted search, SEO, procurement, buyer confidence)",
  "highlights": ["3 to 6 concise bullet points of specific evidence-based improvements"],
  "extractedFields": {
    "manufacturer": {"value":"visible value or Not detected","source":"BEFORE|AFTER|BOTH","confidence":0},
    "mpn": {"value":"visible value or Not detected","source":"BEFORE|AFTER|BOTH","confidence":0},
    "description": {"value":"visible summary or Not visible in supplied page","source":"BEFORE|AFTER|BOTH","confidence":0},
    "features": {"value":"visible features or Not detected","source":"BEFORE|AFTER|BOTH","confidence":0},
    "dimensions": {"value":"visible dimensions or Not detected","source":"BEFORE|AFTER|BOTH","confidence":0},
    "compliance": {"value":"visible compliance or Not detected","source":"BEFORE|AFTER|BOTH","confidence":0},
    "documents": {"value":"visible downloads or Not detected","source":"BEFORE|AFTER|BOTH","confidence":0}
  },
  "scores": {
    "Content Completeness":{"before":0,"after":0,"evidence":"short visible evidence"},
    "Technical Specifications":{"before":0,"after":0,"evidence":"short visible evidence"},
    "Taxonomy":{"before":0,"after":0,"evidence":"short visible evidence"},
    "Structured Attributes":{"before":0,"after":0,"evidence":"short visible evidence"},
    "Search Readiness":{"before":0,"after":0,"evidence":"short visible evidence"},
    "Buyer Clarity":{"before":0,"after":0,"evidence":"short visible evidence"},
    "Digital Assets":{"before":0,"after":0,"evidence":"short visible evidence"},
    "Compliance Information":{"before":0,"after":0,"evidence":"short visible evidence"}
  },
  "improvements": [
    {
      "area": "Product Title & Naming",
      "beforeState": "exact visible original state or description",
      "afterState": "exact visible enriched state or description",
      "whatChanged": "specific evidence-based change",
      "businessBenefit": "reasonable buyer or operational benefit",
      "resultStatus": "Added|Enriched|Improved|Standardized|Corrected|Unchanged|Not Detected"
    }
  ]
}
The "improvements" array MUST contain an item for each area: ${MATRIX_AREAS.join(', ')}.
Score each category using this explicit 100-point rubric: presence/completeness 40 points, structure/consistency 25, specificity 20, buyer usefulness 15. Scores must be grounded only in visible evidence and include an evidence note. Use 0 when an area is not visible; never invent a value.`

    const ai = new GoogleGenAI({ apiKey })
    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
      contents: [toPart(p.beforeImage), toPart(p.afterImage), { text: prompt }],
      config: { responseMimeType: 'application/json', temperature: 0.15 }
    })

    const parsed = JSON.parse(String(response.text || '').replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim())
    const byArea = new Map((parsed.improvements || []).map(x => [x.area, x]))

    const safeField = field => ({ value: clean(field?.value, 1000) || 'Not detected', source: ['BEFORE','AFTER','BOTH'].includes(field?.source) ? field.source : 'BOTH', confidence: Math.max(0, Math.min(100, Number(field?.confidence) || 0)) })
    const scores = Object.fromEntries(SCORE_AREAS.map(area => { const score = parsed.scores?.[area] || {}; return [area, { before: Math.max(0, Math.min(100, Number(score.before) || 0)), after: Math.max(0, Math.min(100, Number(score.after) || 0)), evidence: clean(score.evidence, 500) || 'No visible evidence supplied.' }] }))
    const extractedFields = Object.fromEntries(['manufacturer','mpn','description','features','dimensions','compliance','documents'].map(key => [key, safeField(parsed.extractedFields?.[key])]))
    const confidenceValues = Object.values(extractedFields).map(x => x.confidence).filter(Boolean)
    const confidence = confidenceValues.length ? Math.round(confidenceValues.reduce((a,b)=>a+b,0)/confidenceValues.length) : 0
    res.json({
      productName: clean(parsed.productName, 200) || 'Not detected',
      brand: clean(parsed.brand, 120) || 'Not detected',
      sku: clean(parsed.sku, 120) || 'Not detected',
      category: clean(parsed.category, 160) || 'Not detected',
      manufacturer: extractedFields.manufacturer.value,
      beforeSummary: String(parsed.beforeSummary || '').slice(0, 6000),
      afterSummary: String(parsed.afterSummary || '').slice(0, 6000),
      keyTransformation: String(parsed.keyTransformation || '').slice(0, 4000),
      businessImpact: String(parsed.businessImpact || '').slice(0, 4000),
      highlights: Array.isArray(parsed.highlights) ? parsed.highlights.slice(0, 6) : [],
      improvements: MATRIX_AREAS.map(area => {
        const item = byArea.get(area) || {}
        return {
          area,
          beforeState: clean(item.beforeState, 300) || 'Not detected',
          afterState: clean(item.afterState, 300) || 'Not detected',
          whatChanged: clean(item.whatChanged, 400) || 'Not detected',
          businessBenefit: clean(item.businessBenefit, 400) || 'Not detected',
          resultStatus: RESULT_STATUSES.has(item.resultStatus) ? item.resultStatus : 'Not Detected'
        }
      }),
      extractedFields,
      scores,
      scoringMethodology: '100-point evidence rubric: presence/completeness 40, structure/consistency 25, specificity 20, buyer usefulness 15.',
      analysisStatus: 'Complete',
      confidenceScore: confidence ? `${confidence}%` : 'Needs Review',
      confidenceNote: confidence >= 75 ? 'Grounded AI vision comparison complete.' : 'Some extracted fields require review.'
    })
  } catch (error) {
    console.error('[EnrichmentAnalysis]', error.message)
    res.status(502).json({ message: `Backend AI analysis failed: ${error.message}` })
  }
})

router.post('/analysis/refine-section', auth, async (req, res) => {
  try {
    const { text, action, fieldName, context } = req.body || {}
    if (!text && action !== 'regenerate') return res.status(400).json({ message: 'Text is required for refinement.' })
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey || apiKey === 'YOUR_GEMINI_API_KEY') {
      return res.status(503).json({ message: 'Backend Gemini API key is not configured.' })
    }

    let instruction = 'Improve the writing to be clearer, more polished, and client-ready.'
    if (action === 'professional') instruction = 'Rewrite in a formal, executive, enterprise B2B tone appropriate for a C-level client presentation.'
    if (action === 'technical') instruction = 'Enhance with precise e-commerce terminology (taxonomy, specs, metadata, faceted attributes, compliance, SKU standards).'
    if (action === 'shorter') instruction = 'Make it concise, punchy, and brief while retaining all key business facts.'
    if (action === 'regenerate') instruction = 'Generate a fresh, compelling, professional analysis based on the context provided.'

    const prompt = `You are a senior product data consultant for AltiusNxt Technologies.
Task: ${instruction}
Target Field: ${fieldName || 'Report Content'}
Context: ${context || 'Product Data Enrichment Report'}
Original Content:
"${text || ''}"

Return ONLY the refined text as a plain string. Do not include markdown code fences or quote marks.`

    const ai = new GoogleGenAI({ apiKey })
    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
      contents: [{ text: prompt }],
      config: { temperature: 0.2 }
    })

    const refined = String(response.text || '').replace(/^["'`]\s*/, '').replace(/\s*["'`]$/, '').trim()
    res.json({ refinedText: refined })
  } catch (error) {
    console.error('[SectionRefine]', error.message)
    res.status(502).json({ message: `AI refinement failed: ${error.message}` })
  }
})

function requireComplete(report) {
  if (!report.name || !report.clientName) return 'Report name and client name are required.'
  if (!Array.isArray(report.products) || !report.products.length) return 'Add at least one product comparison.'
  const bad = report.products.findIndex(p => !p.beforeImage?.url || !p.afterImage?.url || !p.beforeSummary || !p.afterSummary)
  return bad >= 0 ? `Product ${bad + 1} needs both screenshots and Before/After summaries.` : null
}

function imagePath(asset) { return asset?.url ? path.join(IMAGE_DIR, asset.url.split('/').pop()) : null }

function renderPdfEvidence(asset) {
  const file = imagePath(asset)
  if (!file || !fs.existsSync(file) || asset?.mimeType !== 'application/pdf') return file
  const page = Math.max(1, Number(asset.pdfPage || 1))
  const stem = `${path.basename(file, path.extname(file))}-page-${page}`
  const output = path.join(IMAGE_DIR, `${stem}.png`)
  if (fs.existsSync(output)) return output
  const executable = process.platform === 'win32'
    ? path.join(process.env.USERPROFILE || '', '.cache/codex-runtimes/codex-primary-runtime/dependencies/native/poppler/Library/bin/pdftoppm.exe')
    : 'pdftoppm'
  try {
    execFileSync(executable, ['-f', String(page), '-l', String(page), '-singlefile', '-png', '-r', '120', file, path.join(IMAGE_DIR, stem)], { windowsHide: true, timeout: 30000 })
    return fs.existsSync(output) ? output : file
  } catch (error) {
    console.warn('[PDF Evidence Render]', error.message)
    return file
  }
}

function addHeader(doc, title, report) {
  const logo = imagePath(report?.branding?.companyLogo) || DEFAULT_LOGO
  if (fs.existsSync(logo)) doc.image(logo, 42, 14, { fit: [90, 26], align: 'left' })

  const clientLogo = imagePath(report?.clientLogo)
  if (clientLogo && fs.existsSync(clientLogo)) {
    doc.image(clientLogo, 140, 14, { fit: [70, 24], align: 'left' })
  }

  doc.fontSize(7.5).fillColor('#667085').text(title, 42, 24, { width: 511, align: 'right' })
  doc.moveTo(42, 44).lineTo(553, 44).strokeColor('#dfe5ee').stroke()
}

function addFooter(doc, report, page, totalPages) {
  const pageStr = totalPages ? `Page ${page} of ${totalPages}` : `Page ${page}`
  doc.fontSize(7.5).fillColor('#7b8798').text(`${report.footerText || 'AltiusNxt Technologies'} | Prepared for ${report.preparedFor || report.clientName} | ${pageStr}`, 42, 788, { width: 511, align: 'center', lineBreak: false })
}

function addPage(doc, report, title, page, totalPages) {
  if (page > 1) doc.addPage()
  addHeader(doc, title, report)
}

function drawBrowserFrame(doc, title, x, y, w, h, asset) {
  doc.roundedRect(x, y, w, 20, 4).fill('#f1f5f9')
  doc.circle(x + 10, y + 10, 2.5).fill('#ef4444')
  doc.circle(x + 18, y + 10, 2.5).fill('#f59e0b')
  doc.circle(x + 26, y + 10, 2.5).fill('#10b981')
  doc.font('Helvetica').fontSize(7).fillColor('#64748b').text(title, x + 36, y + 6, { width: w - 42, lineBreak: false })
  
  doc.rect(x, y + 20, w, h - 20).strokeColor('#cbd5e1').stroke()
  
  const file = renderPdfEvidence(asset)
  if (file && fs.existsSync(file)) {
    if (path.extname(file).toLowerCase() !== '.pdf') {
      try {
        doc.image(file, x + 3, y + 23, { fit: [w - 6, h - 26], align: 'center', valign: 'center' })
      } catch {}
    } else {
      doc.font('Helvetica-Bold').fillColor('#0b255d').fontSize(9).text('PDF preview could not be rendered', x + 10, y + h / 2 - 8, { width: w - 20, align: 'center' })
    }
  } else {
    doc.font('Helvetica-Bold').fillColor('#94a3b8').fontSize(9).text('Screenshot Preview', x + 10, y + h / 2 - 5, { width: w - 20, align: 'center' })
  }
}

function buildPdf(report, output) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 42, bufferPages: true, info: { Title: report.name, Author: 'AltiusNxt Technologies' } })
    const stream = fs.createWriteStream(output); doc.pipe(stream); let page = 1
    const changedRows = report.products.flatMap(p => p.improvements || []).filter(x => x.resultStatus && x.resultStatus !== 'No Change')
    const taxonomyCount = report.products.filter(p => (p.improvements || []).some(x => x.area?.includes('Taxonomy') && x.resultStatus !== 'No Change')).length
    const specCount = report.products.filter(p => (p.improvements || []).some(x => /Specifications|Attributes|Units/.test(x.area || '') && x.resultStatus !== 'No Change')).length

    // Cover Page
    addHeader(doc, 'Product Data Enrichment Report', report)
    doc.rect(42, 68, 511, 6).fill('#e63329')
    doc.fillColor('#e63329').fontSize(8.5).font('Helvetica-Bold').text('PRODUCT DATA ENRICHMENT REPORT', 42, 90)
    doc.fillColor('#0b255d').fontSize(22).text('Product Content Transformation', 42, 108, { width: 480 })
    doc.fontSize(14).text('Before & After Analysis', 42, 138, { width: 480 })
    doc.font('Helvetica-Bold').fontSize(13).fillColor('#e63329').text(report.clientName || 'Client Organization', 42, 169)
    doc.font('Helvetica').fontSize(8.5).fillColor('#64748b').text('Structured, standardized and buyer-ready product content for stronger search, comparison and procurement decisions.', 42, 190, { width: 430 })
    
    // Metadata Band
    doc.roundedRect(42, 224, 511, 78, 6).fill('#f8fafc').fillColor('#0b255d').font('Helvetica-Bold').fontSize(8.5).text('REPORT DETAILS', 54, 237)
    doc.font('Helvetica').fontSize(7.5).fillColor('#334155').text(`Client Organization: ${report.clientName}\nPrepared For: ${report.preparedFor || report.clientName}\nPrepared By: ${report.preparedBy || 'AltiusNxt Technologies Pvt Ltd'}\nDate: ${new Date(report.reportDate).toLocaleDateString()}  |  Status: ${report.status || 'Draft'}`, 54, 251, { lineGap: 3 })

    ;[[42, report.products.length, 'PRODUCTS ANALYSED'], [172, changedRows.length, 'ATTRIBUTES ENRICHED'], [302, taxonomyCount, 'TAXONOMY IMPROVED'], [432, specCount, 'SPECIFICATIONS IMPROVED']].forEach(([x, value, label]) => {
      doc.rect(x, 320, 121, 48).fill('#f8fafc')
      doc.rect(x, 320, 121, 2).fill('#e63329')
      doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(14).text(String(value), x + 8, 329, { width: 105 })
      doc.fillColor('#64748b').font('Helvetica').fontSize(6.5).text(label, x + 8, 350, { width: 105 })
    })

    // Executive Summary Box
    doc.font('Helvetica-Bold').fillColor('#0b255d').fontSize(10).text('EXECUTIVE SUMMARY', 42, 392)
    doc.font('Helvetica').fontSize(8.5).fillColor('#475467').text(report.executiveSummary || `This report documents ${report.products.length} product data enrichment case studies for ${report.clientName}, detailing verified improvements in technical completeness, taxonomy standardization, and buyer readiness.`, 42, 409, { width: 511, lineGap: 3.5 })

    // Table of Product Comparisons Index
    if (report.products.length > 0) {
      doc.font('Helvetica-Bold').fillColor('#0b255d').fontSize(10).text('REPORT CONTENTS / PRODUCT COMPARISON INDEX', 42, 500)
      report.products.slice(0, 14).forEach((p, i) => {
        const y = 520 + i * 17
        doc.font('Helvetica-Bold').fontSize(8).fillColor('#0b255d').text(String(i + 1).padStart(2, '0'), 54, y)
        doc.font('Helvetica').fontSize(8).fillColor('#334155').text(p.productName || `Product ${i + 1}`, 78, y, { width: 300, ellipsis: true })
        doc.font('Helvetica').fontSize(7.5).fillColor('#64748b').text(p.category || 'Enriched Category', 390, y, { width: 150, align: 'right', ellipsis: true })
        doc.font('Helvetica-Bold').fontSize(7).fillColor('#94a3b8').text(String(2 + i * 2), 535, y, { width: 14, align: 'right' })
      })
    }

    // Per Product Case Studies (2 pages per product)
    report.products.forEach((p, index) => {
      // Page 1: Case Study Summary + Before Screenshot
      page++; addPage(doc, report, `Case Study ${String(index + 1).padStart(2, '0')}`, page)
      doc.font('Helvetica-Bold').fillColor('#e63329').fontSize(8).text(`CASE STUDY ${String(index + 1).padStart(2, '0')}`, 42, 58)
      const caseTitle = p.productName || 'Untitled Product'
      doc.fillColor('#0b255d').fontSize(16)
      const caseTitleHeight = Math.min(42, doc.heightOfString(caseTitle, { width: 511, lineGap: 0 }))
      doc.text(caseTitle, 42, 70, { width: 511, height: 42, ellipsis: true })
      const metaY = 72 + caseTitleHeight
      doc.font('Helvetica').fontSize(8).fillColor('#64748b').text([p.category, p.brand ? `Brand: ${p.brand}` : '', p.sku ? `SKU: ${p.sku}` : ''].filter(Boolean).join('  |  '), 42, metaY, { width: 511, ellipsis: true })
      const metricY = metaY + 16

      const qualitative = [
        ['Content Completeness', p.beforeSummary ? 'Basic to Enriched' : 'Pending'],
        ['Structured Attributes', (p.improvements || []).some(x => x.area?.includes('Attributes') && x.resultStatus !== 'No Change') ? 'Unstructured to Structured' : 'Review'],
        ['Taxonomy Readiness', (p.improvements || []).some(x => x.area?.includes('Taxonomy') && x.resultStatus !== 'No Change') ? 'Basic to Standardized' : 'Review'],
        ['eCommerce Readiness', p.analysisStatus === 'Complete' ? 'Evidence Reviewed' : 'Analysis Pending']
      ]
      qualitative.forEach(([label, value], i) => {
        const x = 42 + i * 130
        doc.rect(x, metricY, 121, 38).fill('#f8fafc')
        doc.rect(x, metricY, 121, 2).fill('#e63329')
        doc.fillColor('#64748b').font('Helvetica').fontSize(5.8).text(label.toUpperCase(), x + 7, metricY + 8, { width: 107 })
        doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(7).text(value, x + 7, metricY + 21, { width: 107, ellipsis: true })
      })

      // Before vs After Side-by-side Cards
      const cardY = metricY + 48
      ;[[42, 'BEFORE · ORIGINAL CLIENT PRODUCT PAGE', p.beforeSummary, '#fff5f5', '#fecaca'], [303, 'AFTER · ALTIUSNXT ENRICHED PRODUCT PAGE', p.afterSummary, '#eff6ff', '#bfdbfe']].forEach(([x, title, text, bg, border]) => {
        doc.roundedRect(x, cardY, 250, 82, 6).fill(bg).strokeColor(border).stroke()
        doc.fillColor('#0b255d').font('Helvetica-Bold').fontSize(7.5).text(title, x + 10, cardY + 8, { width: 230 })
        doc.font('Helvetica').fontSize(7).fillColor('#475467').text(text || '', x + 10, cardY + 24, { width: 230, height: 48, ellipsis: true, lineGap: 2 })
      })

      // Key Transformation Strip
      const changeY = cardY + 92
      doc.rect(42, changeY, 511, 42).fill('#f8fafc')
      doc.rect(42, changeY, 3, 42).fill('#e63329')
      doc.fillColor('#e63329').font('Helvetica-Bold').fontSize(7.5).text('WHAT CHANGED?', 54, changeY + 8)
      doc.fillColor('#334155').font('Helvetica').fontSize(8).text(p.keyTransformation || '', 54, changeY + 21, { width: 485, height: 16, ellipsis: true })

      // Before Browser Screenshot Frame
      const evidenceLabelY = changeY + 56
      const evidenceFrameY = evidenceLabelY + 13
      const evidenceFrameHeight = 760 - evidenceFrameY
      doc.font('Helvetica-Bold').fillColor('#9f1239').fontSize(7).text('BEFORE - ORIGINAL CLIENT PRODUCT', 42, evidenceLabelY)
      doc.font('Helvetica-Bold').fillColor('#166534').fontSize(7).text('AFTER - ALTIUSNXT ENRICHED PRODUCT', 303, evidenceLabelY)
      drawBrowserFrame(doc, 'Original Product Experience', 42, evidenceFrameY, 250, evidenceFrameHeight, { ...p.beforeImage, pdfPage: p.beforePdfPage || 1 })
      drawBrowserFrame(doc, 'Enriched Product Experience', 303, evidenceFrameY, 250, evidenceFrameHeight, { ...p.afterImage, pdfPage: p.afterPdfPage || 1 })

      // Page 2: Enriched After Screenshot + 4-Column Improvement Matrix + Business Impact
      page++; addPage(doc, report, 'Enriched Result & Improvement Matrix', page)
      doc.font('Helvetica-Bold').fillColor('#e63329').fontSize(8).text('ENRICHED RESULT', 42, 58)
      doc.fillColor('#0b255d').fontSize(16).text(p.productName || 'Untitled Product', 42, 70, { width: 511 })

      doc.font('Helvetica-Bold').fillColor('#0b255d').fontSize(9).text('BEFORE VS AFTER IMPROVEMENT MATRIX', 42, 105)
      
      const tableY = 120
      doc.rect(42, tableY, 511, 16).fill('#0b255d')
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(7)
      doc.text('Data Area', 48, tableY + 4, { width: 88 })
      doc.text('Before State', 139, tableY + 4, { width: 108 })
      doc.text('Enriched State', 250, tableY + 4, { width: 112 })
      doc.text('Business Impact', 365, tableY + 4, { width: 108 })
      doc.text('Status', 476, tableY + 4, { width: 70, align: 'center' })

      const rows = (p.improvements || []).slice(0, 13)
      rows.forEach((r, i) => {
        const rowY = tableY + 16 + i * 19
        doc.rect(42, rowY, 511, 19).fill(i % 2 ? '#ffffff' : '#f8fafc')
        doc.fillColor('#334155').font('Helvetica-Bold').fontSize(6.2).text(r.area || '', 48, rowY + 5, { width: 88, ellipsis: true })
        doc.font('Helvetica').fontSize(6.2).fillColor('#64748b').text(r.beforeState || 'Unstructured', 139, rowY + 5, { width: 108, ellipsis: true })
        doc.font('Helvetica').fontSize(6.2).fillColor('#0f172a').text(r.afterState || 'Enriched', 250, rowY + 5, { width: 112, ellipsis: true })
        const impact = /Taxonomy|SEO/.test(r.area || '') ? 'Faster discovery' : /Specifications|Attributes|Units/.test(r.area || '') ? 'Clearer comparison' : /Documentation|Compliance/.test(r.area || '') ? 'Procurement confidence' : 'Better buyer clarity'
        doc.font('Helvetica').fontSize(6.2).fillColor('#475467').text(impact, 365, rowY + 5, { width: 108, ellipsis: true })
        doc.font('Helvetica-Bold').fontSize(6.2).fillColor(r.resultStatus === 'Added' ? '#1e40af' : r.resultStatus === 'Improved' ? '#166534' : '#6b21a8').text(r.resultStatus || 'Enriched', 476, rowY + 5, { width: 70, align: 'center' })
      })

      // Business Impact Narrative
      const impactY = tableY + 16 + rows.length * 19 + 10
      doc.roundedRect(42, impactY, 511, 55, 6).fill('#f8fafc').strokeColor('#cbd5e1').stroke()
      doc.fillColor('#0b255d').font('Helvetica-Bold').fontSize(8).text('BUSINESS IMPACT & BUYER VALUE', 54, impactY + 8)
      doc.fillColor('#475467').font('Helvetica').fontSize(7.5).text(p.businessImpact || `Enriching ${p.productName} establishes clear specification completeness, structured attributes, and faceted search readiness for buyers.`, 54, impactY + 22, { width: 485, height: 26, ellipsis: true })
    })

    // Final Page: Dynamic KPI Cards + Overall Business Value + Next Steps
    page++; addPage(doc, report, 'Summary & Business Value', page)
    doc.font('Helvetica-Bold').fillColor('#e63329').fontSize(8).text('BUSINESS OUTCOMES', 42, 58)
    doc.fillColor('#0b255d').fontSize(20).text('Summary & Business Value', 42, 70)

    // Calculated KPI Cards
    const totalProd = report.products.length
    let summarySpecCount = 0, summaryTaxCount = 0, summaryDocCount = 0
    report.products.forEach(p => {
      (p.improvements || []).forEach(x => {
        if (['Improved', 'Added', 'Standardized', 'Enriched'].includes(x.resultStatus)) {
          if (x.area?.includes('Specifications') || x.area?.includes('Attributes')) summarySpecCount++
          if (x.area?.includes('Taxonomy')) summaryTaxCount++
          if (x.area?.includes('Documentation') || x.area?.includes('Compliance')) summaryDocCount++
        }
      })
    })

    const kpiY = 104
    ;[[42, `${totalProd}`, 'Total Products Analyzed'], [175, `${summarySpecCount}`, 'Improved Technical Specs'], [308, `${summaryTaxCount}`, 'Taxonomy Standardized'], [441, `${summaryDocCount}`, 'Compliance & Docs Added']].forEach(([x, val, lbl]) => {
      doc.roundedRect(x, kpiY, 122, 52, 6).fill('#0b255d')
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(15).text(val, x, kpiY + 8, { width: 122, align: 'center' })
      doc.fillColor('#cbd5e1').font('Helvetica').fontSize(7.5).text(lbl, x + 4, kpiY + 30, { width: 114, align: 'center' })
    })

    // Business Value Narrative
    doc.font('Helvetica-Bold').fillColor('#0b255d').fontSize(9.5).text('OVERALL ENRICHMENT IMPACT', 42, 176)
    doc.font('Helvetica').fontSize(8.5).fillColor('#475467').text(report.overallBusinessValue || 'The product data enrichment program creates a standardized, search-ready e-commerce catalog that improves buyer confidence, speeds up procurement validation, and boosts SEO discoverability.', 42, 192, { width: 511, lineGap: 3.5 })

    doc.font('Helvetica-Bold').fillColor('#0b255d').fontSize(9).text('ENRICHMENT COVERAGE MATRIX', 42, 255)
    const coverageAreas = ['Title', 'Taxonomy', 'Description', 'Specifications', 'Attributes', 'Assets', 'Compliance', 'SEO']
    doc.rect(42, 270, 511, 17).fill('#0b255d')
    doc.fillColor('#ffffff').fontSize(6.2).text('Product', 48, 275, { width: 102 })
    coverageAreas.forEach((area, i) => doc.text(area, 153 + i * 49, 275, { width: 46, align: 'center' }))
    report.products.slice(0, 10).forEach((p, row) => {
      const y = 287 + row * 19
      doc.rect(42, y, 511, 19).fill(row % 2 ? '#ffffff' : '#f8fafc')
      doc.fillColor('#334155').font('Helvetica-Bold').fontSize(6.3).text(p.productName || `Product ${row + 1}`, 48, y + 6, { width: 100, ellipsis: true })
      coverageAreas.forEach((area, col) => {
        const matched = (p.improvements || []).find(x => x.area?.toLowerCase().includes(area.toLowerCase().replace('assets', 'documentation')))
        doc.fillColor(matched && matched.resultStatus !== 'No Change' ? '#16a34a' : '#cbd5e1').circle(176 + col * 49, y + 9.5, 3).fill()
      })
    })

    const valueY = 302 + Math.min(report.products.length, 10) * 19
    doc.font('Helvetica-Bold').fillColor('#0b255d').fontSize(9).text('BUSINESS VALUE & ROI', 42, valueY)
    ;[[42, 'CUSTOMER / PROCUREMENT VALUE', 'Faster product evaluation, clearer technical-fit confidence, easier compliance review and fewer specification misunderstandings.'], [303, 'E-COMMERCE / COMMERCIAL VALUE', 'Richer search indexing, stronger filtering, more consistent comparisons and better cross-sell readiness.']].forEach(([x, title, body]) => {
      doc.roundedRect(x, valueY + 16, 250, 76, 5).fill('#f8fafc')
      doc.fillColor('#e63329').font('Helvetica-Bold').fontSize(7).text(title, x + 10, valueY + 27, { width: 230 })
      doc.fillColor('#475467').font('Helvetica').fontSize(7.3).text(body, x + 10, valueY + 43, { width: 230, lineGap: 2 })
    })

    // Recommended Next Steps
    if (report.nextSteps) {
      doc.fillColor('#0b255d').font('Helvetica-Bold').fontSize(9).text('RECOMMENDED NEXT STEPS', 42, 665)
      ;[['01', 'Validate & Approve'], ['02', 'Scale Enrichment'], ['03', 'Publish & Measure']].forEach(([num, title], i) => {
        const x = 42 + i * 174
        doc.roundedRect(x, 684, 163, 48, 5).fill('#f8fafc')
        doc.fillColor('#e63329').font('Helvetica-Bold').fontSize(8).text(num, x + 10, 695)
        doc.fillColor('#0f172a').fontSize(8).text(title, x + 31, 695, { width: 120 })
      })
      doc.fillColor('#64748b').font('Helvetica').fontSize(7.5).text(report.nextSteps, 42, 744, { width: 511, height: 30, ellipsis: true, lineGap: 2 })
    }

    // 2-Pass Page Numbering Insertion
    const pages = doc.bufferedPageRange()
    for (let i = 0; i < pages.count; i++) {
      doc.switchToPage(i)
      addFooter(doc, report, i + 1, pages.count)
    }

    doc.end(); stream.on('finish', () => resolve(pages.count)); stream.on('error', reject)
  })
}

router.post('/:id/generate-pdf', auth, async (req, res) => {
  try {
    const report = await prisma.productEnrichmentReport.findFirst({ where: { id: req.params.id, ownerId: req.user.id } })
    if (!report) return res.status(404).json({ message: 'Report not found.' })
    const error = requireComplete(report); if (error) return res.status(422).json({ message: error })
    const filename = `${report.id}.pdf`, output = path.join(PDF_DIR, filename)
    const pageCount = await buildPdf(report, output)
    const updated = await prisma.productEnrichmentReport.update({
      where: { id: report.id },
      data: { pdfPath: `/uploads/enrichment-reports/pdfs/${filename}`, pageCount, status: 'PDF Generated' }
    })
    res.json(updated)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

router.get('/:id/download', auth, async (req, res) => {
  try {
    const report = await prisma.productEnrichmentReport.findFirst({ where: { id: req.params.id, ownerId: req.user.id } })
    const file = report?.pdfPath ? path.join(PDF_DIR, path.basename(report.pdfPath)) : null
    if (!file || !fs.existsSync(file)) return res.status(404).json({ message: 'Generate the PDF first.' })
    res.download(file, `${report.name.replace(/[^a-z0-9]+/gi, '-')}.pdf`)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

module.exports = router

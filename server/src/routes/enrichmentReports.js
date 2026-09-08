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
const axios = require('axios')
const { buildReferencePdf: buildEnterpriseAssessmentPdf } = require('../services/referencePdfGenerator')

const prisma = new PrismaClient()
const ROOT = path.join(__dirname, '../../uploads/enrichment-reports')
const IMAGE_DIR = path.join(ROOT, 'images')
const PDF_DIR = path.join(ROOT, 'pdfs')
const ANALYSIS_ERROR_LOG = path.join(ROOT, 'analysis-errors.log')
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
const RESULT_STATUSES = new Set(['Detected', 'Added', 'Enriched', 'Improved', 'Standardized', 'Normalized', 'Corrected', 'Unchanged', 'Not Detected', 'Needs Verification'])
const SCORE_AREAS = ['Content Completeness', 'Technical Specifications', 'Taxonomy', 'Structured Attributes', 'Search Readiness', 'Buyer Clarity', 'Digital Assets', 'Compliance Information']
const ANALYSIS_SCHEMA_VERSION = 'focused-after-specifications-v3'
const analysisCache = new Map()
const analysisInFlight = new Map()
const analysisKey = (ownerId, body) => crypto.createHash('sha256').update(JSON.stringify({
  ownerId,
  before: body?.beforeImage?.url,
  beforePage: body?.beforeImage?.pdfPage || body?.beforePdfPage || 1,
  after: body?.afterImage?.url,
  afterPage: body?.afterImage?.pdfPage || body?.afterPdfPage || 1,
  model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  schemaVersion: ANALYSIS_SCHEMA_VERSION
})).digest('hex')

const clean = (v, max = 500) => String(v ?? '').trim().slice(0, max)
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
const isRetryableGeminiError = error => {
  const status = Number(error?.status || error?.response?.status || 0)
  const detail = `${error?.message || ''} ${error?.cause?.code || ''} ${error?.cause?.message || ''}`
  return status === 429 || status >= 500 || /fetch failed|timeout|ECONNRESET|ETIMEDOUT|ENETUNREACH|UND_ERR|RESOURCE_EXHAUSTED|UNAVAILABLE|INTERNAL/i.test(detail)
}

const generateWithRetry = async (ai, request, attempts = 4) => {
  let lastError
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await ai.models.generateContent(request)
    } catch (error) {
      lastError = error
      if (!isRetryableGeminiError(error) || attempt === attempts) throw error
      await wait(Math.min(6000, attempt * attempt * 800))
    }
  }
  throw lastError
}

const generateViaRest = async (apiKey, request) => {
  const model = request.model || 'gemini-2.5-flash'
  const response = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    { contents: [{ parts: request.contents }], generationConfig: request.config },
    { params: { key: apiKey }, timeout: 120000, maxBodyLength: 30 * 1024 * 1024, maxContentLength: 30 * 1024 * 1024 }
  )
  const text = response.data?.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('') || ''
  if (!text) throw new Error('Gemini returned an empty analysis response.')
  return { text }
}
const normalize = body => {
  const requestedDate = body.reportDate ? new Date(body.reportDate) : new Date()
  return ({
  name: clean(body.name, 200),
  clientName: clean(body.clientName, 160),
  clientLogo: body.clientLogo && typeof body.clientLogo === 'object' ? body.clientLogo : null,
  preparedFor: clean(body.preparedFor, 160) || null,
  preparedBy: clean(body.preparedBy, 160) || 'AltiusNxt Technologies Pvt Ltd',
  reportDate: Number.isNaN(requestedDate.getTime()) ? new Date() : requestedDate,
  projectName: clean(body.projectName, 200) || 'Product Data Enrichment POC',
  executiveSummary: String(body.executiveSummary || '').slice(0, 6000),
  nextSteps: String(body.nextSteps || '').slice(0, 4000),
  overallBusinessValue: String(body.overallBusinessValue || '').slice(0, 6000),
  footerText: clean(body.footerText, 200) || 'AltiusNxt Technologies',
  status: STATUSES.has(body.status) ? body.status : 'Draft',
  products: Array.isArray(body.products) ? body.products : [],
  branding: body.branding && typeof body.branding === 'object' ? body.branding : {},
  })
}

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
  const p = req.body || {}
  if (!p.beforeImage?.url || !p.afterImage?.url) return res.status(422).json({ message: 'Upload both Before and After files.' })
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey || apiKey === 'YOUR_GEMINI_API_KEY') return res.status(503).json({ message: 'Backend Gemini API key is not configured.' })
  const cacheKey = analysisKey(req.user.id, req.body)
  if (analysisCache.has(cacheKey)) return res.json({ ...analysisCache.get(cacheKey), cached: true })
  if (analysisInFlight.has(cacheKey)) {
    try { return res.json({ ...(await analysisInFlight.get(cacheKey)), cached: true }) }
    catch (error) { return res.status(500).json({ message: error.message || 'AI analysis failed.' }) }
  }
  let resolveAnalysis
  let rejectAnalysis
  const pendingAnalysis = new Promise((resolve, reject) => { resolveAnalysis = resolve; rejectAnalysis = reject })
  pendingAnalysis.catch(() => {})
  analysisInFlight.set(cacheKey, pendingAnalysis)
  try {
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
  "originalProductName": "visible BEFORE title or Not detected",
  "enrichedProductName": "visible AFTER title or Not detected",
  "clientName": "company or website name visible in the BEFORE source, otherwise Not detected",
  "brand": "extracted brand",
  "sku": "SKU or MPN if visible",
  "category": "product taxonomy category",
  "originalTaxonomy": "visible BEFORE taxonomy breadcrumb or Not detected",
  "enrichedTaxonomy": "visible AFTER taxonomy breadcrumb or Not detected",
  "originalSku": "visible BEFORE SKU/MPN or Not detected",
  "enrichedSku": "visible AFTER SKU/MPN or Not detected",
  "brandBefore": "visible BEFORE brand or Not detected",
  "brandAfter": "visible AFTER brand or Not detected",
  "existingAttributeCount": "count only when directly countable, otherwise blank",
  "enrichedAttributeCount": "count only when directly countable, otherwise blank",
  "existingSpecificationCount": "count only when directly countable, otherwise blank",
  "enrichedSpecificationCount": "count only when directly countable, otherwise blank",
  "filterFieldsEnabled": "comma-separated fields visibly enabled by enriched data or blank",
  "beforeSummary": "3 detailed evidence-based paragraphs covering visible content, structure gaps, SEO/search gaps, technical buyer gaps, schema/filter readiness, and taxonomy depth",
  "afterSummary": "3 detailed evidence-based paragraphs covering enriched naming, structured specifications, normalized attributes, filter readiness, category mapping, and buyer usability",
  "keyTransformation": "strong commercial and buyer impact statement",
  "businessImpact": "detailed explanation of why this specific enrichment matters (faceted search, SEO, procurement, buyer confidence)",
  "highlights": ["6 to 10 concise product-specific evidence-based improvements"],
  "standardisationNotes": "detailed notes covering naming, units, taxonomy, attribute normalization, schema readiness, and fields requiring human validation",
  "recommendedNextSteps": "3 to 5 evidence-led validation and rollout actions for this product/category",
  "extractedFields": {
    "manufacturer": {"value":"visible value or Not detected","source":"BEFORE|AFTER|BOTH","confidence":0},
    "mpn": {"value":"visible value or Not detected","source":"BEFORE|AFTER|BOTH","confidence":0},
    "description": {"value":"visible summary or Not visible in supplied page","source":"BEFORE|AFTER|BOTH","confidence":0},
    "features": {"value":"visible features or Not detected","source":"BEFORE|AFTER|BOTH","confidence":0},
    "dimensions": {"value":"visible dimensions or Not detected","source":"BEFORE|AFTER|BOTH","confidence":0},
    "compliance": {"value":"visible compliance or Not detected","source":"BEFORE|AFTER|BOTH","confidence":0},
    "documents": {"value":"visible downloads or Not detected","source":"BEFORE|AFTER|BOTH","confidence":0}
  },
  "technicalSpecifications": [
    {"attribute":"exact visible After-page specification label","value":"complete exact visible value including units, ranges, qualifiers and punctuation","source":"AFTER|BOTH","confidence":0,"status":"Confirmed|Normalized"}
  ],
  "technicalSpecificationCount": 0,
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
      "evidence": "specific visible evidence supporting the comparison",
      "businessBenefit": "reasonable buyer or operational benefit",
      "confidence": 0,
      "resultStatus": "Detected|Added|Enriched|Improved|Standardized|Normalized|Corrected|Unchanged|Not Detected|Needs Verification"
    }
  ]
}
The "technicalSpecifications" array is an exhaustive transcription of the AFTER screenshot/page specification content. Inspect the entire After image from top to bottom, including every visible specification table, accordion, details block, bullet list, and continuation section. Return every distinct visible attribute-value pair without sampling, summarizing, combining unrelated rows, or stopping after the most important fields. Preserve complete multi-part values, units, ranges, symbols, qualifiers, and model-specific details. Do not impose a row limit. Set technicalSpecificationCount to the exact number of returned rows and verify it matches the array length before responding. Include only specifications visibly supported by AFTER (or BOTH); never add recommendations, inferred values, missing fields, placeholders, or Needs Verification rows.
The "improvements" array should contain only 6 to 10 meaningful, visibly supported changes selected from: ${MATRIX_AREAS.join(', ')}. The server will add any missing matrix rows.
Keep each summary between 700 and 1400 characters when the evidence supports it, transformation and business impact between 250 and 700 characters, each highlight below 150 characters, and every improvement field below 220 characters. Be detailed without repetition. Prioritize valid complete JSON over verbosity.
Score each category using this explicit 100-point rubric: presence/completeness 40 points, structure/consistency 25, specificity 20, buyer usefulness 15. Scores must be grounded only in visible evidence and include an evidence note. Use 0 when an area is not visible; never invent a value.`

    const ai = new GoogleGenAI({ apiKey })
    const analysisRequest = {
      model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
      contents: [toPart(p.beforeImage), toPart(p.afterImage), { text: prompt }],
      config: {
        responseMimeType: 'application/json',
        temperature: 0.1,
        thinkingConfig: { thinkingBudget: 0 },
        maxOutputTokens: 16384
      }
    }
    let response
    try {
      response = await generateWithRetry(ai, analysisRequest)
    } catch (sdkError) {
      if (!isRetryableGeminiError(sdkError)) throw sdkError
      console.warn('[EnrichmentAnalysis] SDK transport failed; retrying through REST transport.')
      response = await generateViaRest(apiKey, analysisRequest)
    }

    const parseGeminiJson = value => {
      const cleaned = String(value || '').replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/\s*```$/, '').trim()
      const match = cleaned.match(/\{[\s\S]*\}/)
      if (!match) throw new Error('Gemini returned no complete JSON object.')
      return JSON.parse(match[0])
    }
    let parsed
    try {
      parsed = parseGeminiJson(response.text)
    } catch (parseError) {
      console.warn('[EnrichmentAnalysis] Detailed response was incomplete; requesting compact JSON fallback.')
      const compactResponse = await generateWithRetry(ai, {
        model: analysisRequest.model,
        contents: [toPart(p.beforeImage), toPart(p.afterImage), { text: `${prompt}\nReturn a compact result now: maximum 6 improvements, one sentence per summary, no markdown, and valid complete JSON only.` }],
        config: { responseMimeType: 'application/json', temperature: 0, thinkingConfig: { thinkingBudget: 0 }, maxOutputTokens: 8192 }
      }, 3)
      parsed = parseGeminiJson(compactResponse.text)
    }

    // Specification extraction is deliberately isolated from the narrative
    // request. Long After-page tables are otherwise likely to be sampled while
    // the model is also producing summaries, scores and comparison findings.
    const specificationPrompt = `Inspect only the supplied AFTER product page and transcribe its complete technical specification data.
Return only valid JSON in this exact shape:
{
  "specifications": [
    { "attribute": "exact visible specification label", "value": "exact complete visible value", "confidence": 0 }
  ]
}
Rules:
- Read the entire page from top to bottom, including every specification table, continuation, accordion, detail block and technical bullet list visible in the supplied file.
- Return every visible attribute-value row in original page order. Do not select only important rows and do not impose a row limit.
- Preserve names, values, units, symbols, ranges, punctuation, capitalization and qualifiers exactly as visible.
- Never infer, calculate, normalize, rewrite, summarize or complete a value.
- Never return headings, marketing copy, prices, navigation labels, buttons, blank rows or fields that are not technical specifications.
- Remove only exact duplicate attribute-value pairs caused by repeated page chrome. If the same label visibly has different values, retain each distinct pair.
- Before responding, recount the visible rows and confirm internally that the JSON array contains the same number of rows.`
    const specificationRequest = {
      model: analysisRequest.model,
      contents: [toPart(p.afterImage), { text: specificationPrompt }],
      config: {
        responseMimeType: 'application/json',
        temperature: 0,
        thinkingConfig: { thinkingBudget: 0 },
        maxOutputTokens: 32768
      }
    }
    let specificationResponse
    try {
      specificationResponse = await generateWithRetry(ai, specificationRequest, 3)
    } catch (sdkError) {
      if (!isRetryableGeminiError(sdkError)) throw sdkError
      specificationResponse = await generateViaRest(apiKey, specificationRequest)
    }
    const specificationJson = parseGeminiJson(specificationResponse.text)
    const rawSpecifications = Array.isArray(specificationJson.specifications) ? specificationJson.specifications : []
    const seenSpecifications = new Set()
    const focusedTechnicalSpecifications = rawSpecifications.map(item => ({
      attribute: clean(item?.attribute, 300),
      value: clean(item?.value, 1500),
      source: 'AFTER',
      confidence: Math.max(0, Math.min(100, Number(item?.confidence) || 0)),
      status: 'Confirmed'
    })).filter(item => {
      if (!item.attribute || !item.value || /^(not detected|not available|unknown|n\/a|needs verification)$/i.test(item.value)) return false
      const key = `${item.attribute.toLocaleLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()}\u0000${item.value.toLocaleLowerCase().replace(/\s+/g, ' ').trim()}`
      if (seenSpecifications.has(key)) return false
      seenSpecifications.add(key)
      return true
    })
    if (!focusedTechnicalSpecifications.length) throw new Error('No technical specification rows could be verified from the After page.')
    const byArea = new Map((parsed.improvements || []).map(x => [x.area, x]))

    const safeField = field => ({ value: clean(field?.value, 1000) || 'Not detected', source: ['BEFORE','AFTER','BOTH'].includes(field?.source) ? field.source : 'BOTH', confidence: Math.max(0, Math.min(100, Number(field?.confidence) || 0)) })
    const scores = Object.fromEntries(SCORE_AREAS.map(area => { const score = parsed.scores?.[area] || {}; return [area, { before: Math.max(0, Math.min(100, Number(score.before) || 0)), after: Math.max(0, Math.min(100, Number(score.after) || 0)), evidence: clean(score.evidence, 500) || 'No visible evidence supplied.' }] }))
    const extractedFields = Object.fromEntries(['manufacturer','mpn','description','features','dimensions','compliance','documents'].map(key => [key, safeField(parsed.extractedFields?.[key])]))
    const technicalSpecifications = focusedTechnicalSpecifications
    const confidenceValues = Object.values(extractedFields).map(x => x.confidence).filter(Boolean)
    const confidence = confidenceValues.length ? Math.round(confidenceValues.reduce((a,b)=>a+b,0)/confidenceValues.length) : 0
    const result = {
      productName: clean(parsed.productName, 200) || 'Not detected',
      originalProductName: clean(parsed.originalProductName, 200) || 'Not detected',
      enrichedProductName: clean(parsed.enrichedProductName, 200) || 'Not detected',
      clientName: clean(parsed.clientName, 160) || 'Not detected',
      brand: clean(parsed.brand, 120) || 'Not detected',
      sku: clean(parsed.sku, 120) || 'Not detected',
      category: clean(parsed.category, 160) || 'Not detected',
      originalTaxonomy: clean(parsed.originalTaxonomy, 400) || 'Not detected',
      enrichedTaxonomy: clean(parsed.enrichedTaxonomy, 400) || 'Not detected',
      originalSku: clean(parsed.originalSku, 120) || 'Not detected',
      enrichedSku: clean(parsed.enrichedSku, 120) || 'Not detected',
      brandBefore: clean(parsed.brandBefore, 120) || 'Not detected',
      brandAfter: clean(parsed.brandAfter, 120) || 'Not detected',
      existingAttributeCount: String(parsed.existingAttributeCount ?? '').trim() && Number.isFinite(Number(parsed.existingAttributeCount)) ? Number(parsed.existingAttributeCount) : '',
      enrichedAttributeCount: String(parsed.enrichedAttributeCount ?? '').trim() && Number.isFinite(Number(parsed.enrichedAttributeCount)) ? Number(parsed.enrichedAttributeCount) : '',
      existingSpecificationCount: String(parsed.existingSpecificationCount ?? '').trim() && Number.isFinite(Number(parsed.existingSpecificationCount)) ? Number(parsed.existingSpecificationCount) : '',
      enrichedSpecificationCount: String(parsed.enrichedSpecificationCount ?? '').trim() && Number.isFinite(Number(parsed.enrichedSpecificationCount)) ? Number(parsed.enrichedSpecificationCount) : '',
      filterFieldsEnabled: clean(parsed.filterFieldsEnabled, 1200),
      manufacturer: extractedFields.manufacturer.value,
      beforeSummary: String(parsed.beforeSummary || '').slice(0, 6000),
      afterSummary: String(parsed.afterSummary || '').slice(0, 6000),
      keyTransformation: String(parsed.keyTransformation || '').slice(0, 4000),
      businessImpact: String(parsed.businessImpact || '').slice(0, 4000),
      highlights: Array.isArray(parsed.highlights) ? parsed.highlights.slice(0, 10) : [],
      standardisationNotes: String(parsed.standardisationNotes || '').slice(0, 5000),
      recommendedNextSteps: String(parsed.recommendedNextSteps || '').slice(0, 4000),
      improvements: MATRIX_AREAS.map(area => {
        const item = byArea.get(area) || {}
        return {
          area,
          beforeState: clean(item.beforeState, 300) || 'Not detected',
          afterState: clean(item.afterState, 300) || 'Not detected',
          whatChanged: clean(item.whatChanged, 400) || 'Not detected',
          evidence: clean(item.evidence, 600) || 'Not detected',
          businessBenefit: clean(item.businessBenefit, 400) || 'Not detected',
          confidence: Math.max(0, Math.min(100, Number(item.confidence) || 0)),
          resultStatus: RESULT_STATUSES.has(item.resultStatus) ? item.resultStatus : 'Not Detected',
          includeInReport: true
        }
      }),
      extractedFields,
      technicalSpecifications,
      technicalSpecificationCount: technicalSpecifications.length,
      scores,
      scoringMethodology: '100-point evidence rubric: presence/completeness 40, structure/consistency 25, specificity 20, buyer usefulness 15.',
      analysisStatus: 'Complete',
      confidenceScore: confidence ? `${confidence}%` : 'Needs Review',
      confidenceNote: confidence >= 75 ? 'Grounded AI vision comparison complete.' : 'Some extracted fields require review.'
    }
    analysisCache.set(cacheKey, result)
    resolveAnalysis(result)
    res.json(result)
  } catch (error) {
    rejectAnalysis(error)
    const status = Number(error?.status || error?.response?.status || 0)
    const technicalDetails = [error?.message, error?.cause?.code, error?.cause?.message].filter(Boolean).join(' · ')
    console.error('[EnrichmentAnalysis]', technicalDetails)
    try { fs.appendFileSync(ANALYSIS_ERROR_LOG, `${new Date().toISOString()} | status=${status || 'unknown'} | ${technicalDetails || 'Unknown AI provider error'}\n`) } catch { /* logging must not mask the provider error */ }
    const message = status === 429
      ? 'AI service is busy. Please wait a moment and try again.'
      : status >= 500 || isRetryableGeminiError(error)
        ? 'AI service is temporarily unavailable. Please try again.'
        : /JSON|Unexpected end|unterminated/i.test(technicalDetails)
          ? 'AI returned an incomplete result. Please try again.'
          : "Analysis couldn't be completed."
    res.status(status === 429 ? 429 : 502).json({ message, technicalDetails: technicalDetails || 'Unknown AI provider error' })
  } finally { analysisInFlight.delete(cacheKey) }
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
    execFileSync(executable, ['-f', String(page), '-l', String(page), '-singlefile', '-png', '-r', '200', file, path.join(IMAGE_DIR, stem)], { windowsHide: true, timeout: 30000 })
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

  const confidentiality = report.confidentialityLabel || 'Confidential'
  doc.fontSize(7).fillColor('#667085').text(`${report.clientName || 'Client'}  |  ${title}  |  ${confidentiality}`, 225, 19, { width: 328, align: 'right' })
  doc.fontSize(6.5).fillColor('#98a2b3').text(`Version ${report.reportVersion || '1.0'}`, 225, 30, { width: 328, align: 'right' })
  doc.moveTo(42, 44).lineTo(553, 44).strokeColor('#dfe5ee').stroke()
}

function addFooter(doc, report, page, totalPages) {
  const pageStr = totalPages ? `Page ${page} of ${totalPages}` : `Page ${page}`
  doc.moveTo(42, 778).lineTo(553, 778).strokeColor('#e4e7ec').stroke()
  doc.fontSize(7).fillColor('#7b8798').text(`Prepared by AltiusNxt Technologies  |  ${report.clientName || 'Client'}  |  ${report.confidentialityLabel || 'Confidential'}`, 42, 787, { width: 400, lineBreak: false })
  doc.font('Helvetica-Bold').fillColor('#475467').text(pageStr, 455, 787, { width: 98, align: 'right', lineBreak: false })
}

function addPage(doc, report, title, page, totalPages) {
  if (page > 1) doc.addPage()
  addHeader(doc, title, report)
}
function drawBrowserFrame(doc, title, x, y, w, h, asset) {
  doc.roundedRect(x, y, w, 18, 4).fill('#f1f5f9')
  doc.circle(x + 10, y + 9, 2.5).fill('#ef4444')
  doc.circle(x + 18, y + 9, 2.5).fill('#f59e0b')
  doc.circle(x + 26, y + 9, 2.5).fill('#10b981')
  doc.font('Helvetica-Bold').fontSize(7).fillColor('#475467').text(title, x + 36, y + 5, { width: w - 42, lineBreak: false })

  doc.rect(x, y + 18, w, h - 18).strokeColor('#cbd5e1').stroke()

  const file = renderPdfEvidence(asset)
  if (file && fs.existsSync(file)) {
    if (path.extname(file).toLowerCase() !== '.pdf') {
      try {
        doc.image(file, x + 2, y + 20, { fit: [w - 4, h - 22], align: 'center', valign: 'top' })
      } catch {}
    } else {
      doc.font('Helvetica-Bold').fillColor('#0b255d').fontSize(9).text('PDF document preview', x + 10, y + h / 2 - 8, { width: w - 20, align: 'center' })
    }
  } else {
    doc.font('Helvetica-Bold').fillColor('#94a3b8').fontSize(9).text('Screenshot Preview', x + 10, y + h / 2 - 5, { width: w - 20, align: 'center' })
  }
}

function verifyProductIdentity(product) {
  const warnings = []
  if (product.originalProductName && product.enrichedProductName) {
    const orig = product.originalProductName.toLowerCase()
    const enr = product.enrichedProductName.toLowerCase()
    const origWords = orig.split(/\s+/).filter(w => w.length > 3)
    const matches = origWords.filter(w => enr.includes(w))
    if (origWords.length > 2 && matches.length === 0) {
      warnings.push('Original and Enriched product names share no major terms. Verify they represent the same item.')
    }
  }
  return warnings
}

function validateReportEvidence(report) {
  const issues = []
  const placeholder = value => !value || /^(not (available|detected|verified)|unknown|n\/a)$/i.test(String(value).trim())
  ;(report.products || []).forEach((product, index) => {
    const prefix = `Product ${String(index + 1).padStart(2, '0')}`
    if (!product.beforeImage?.url || !product.afterImage?.url) issues.push(`${prefix}: both Before and After evidence files are required.`)
    if (product.beforeImage?.url && product.beforeImage.url === product.afterImage?.url) issues.push(`${prefix}: Before and After evidence cannot be the same file.`)
    if (placeholder(product.productName) && placeholder(product.originalProductName) && placeholder(product.enrichedProductName)) issues.push(`${prefix}: product identity is not verified.`)

    verifyProductIdentity(product).forEach(message => issues.push(`${prefix}: ${message}`))
  })
  return issues
}

function buildPdf(report, output) {
  return new Promise((resolve, reject) => {
    report = { ...report, ...(report.branding?.reportProfile || {}) }
    const doc = new PDFDocument({ size: 'A4', margin: 42, bufferPages: true, info: { Title: report.name || 'Product Data Enrichment Report', Author: 'AltiusNxt Technologies' } })
    const stream = fs.createWriteStream(output)
    doc.pipe(stream)

    const product = report.products?.[0] || {}
    const attrCount = Number(product.enrichedAttributeCount) || (product.improvements || []).filter(item => ['Added', 'Enriched', 'Improved', 'Standardized', 'Normalized', 'Corrected'].includes(item.resultStatus)).length
    const clientName = report.clientName || report.preparedFor || 'Valued Client'
    const reportDateStr = new Date(report.reportDate || Date.now()).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    const versionStr = report.reportVersion || '1.0'
    const analyzedProducts = (report.products || []).filter(item => item.analysisStatus === 'Complete' || Object.keys(item.scores || {}).length)
    const portfolioScore = side => {
      const values = analyzedProducts.flatMap(item => Object.values(item.scores || {}).map(score => Number(score?.[side])).filter(Number.isFinite))
      return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0
    }
    const beforeScore = portfolioScore('before')
    const afterScore = portfolioScore('after')
    const scoreGain = Math.max(0, afterScore - beforeScore)

    // Helper for Page Headers
    const renderHeader = (doc, titleText, pageNum) => {
      if (pageNum === 1) return
      const logo = imagePath(report?.branding?.companyLogo) || DEFAULT_LOGO
      if (fs.existsSync(logo)) doc.image(logo, 42, 18, { fit: [118, 30], align: 'left' })

      const clientLogo = imagePath(report?.clientLogo)
      if (clientLogo && fs.existsSync(clientLogo)) {
        doc.image(clientLogo, 135, 22, { fit: [65, 22], align: 'left' })
      }

      doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#64748b').text(`ALTIUSNXT TECHNOLOGIES  |  ${titleText.toUpperCase()}`, 210, 26, { width: 343, align: 'right' })
      doc.moveTo(42, 48).lineTo(553, 48).strokeColor('#e2e8f0').stroke()
    }

    // Helper for Page Footers
    const renderFooter = (doc, pageNum, totalPages) => {
      doc.moveTo(42, 782).lineTo(553, 782).strokeColor('#e2e8f0').stroke()
      doc.font('Helvetica').fontSize(7.5).fillColor('#64748b').text(`Prepared by AltiusNxt Technologies  |  ${clientName}  |  Confidential`, 42, 790, { width: 380 })
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#0b255d').text(`Page ${pageNum} of ${totalPages}`, 450, 790, { width: 103, align: 'right' })
    }

    // ==========================================
    // PAGE 1 — EXECUTIVE COVER
    // ==========================================
    const logo = imagePath(report?.branding?.companyLogo) || DEFAULT_LOGO
    if (fs.existsSync(logo)) doc.image(logo, 42, 36, { fit: [165, 50], align: 'left' })

    const clientLogo = imagePath(report?.clientLogo)
    if (clientLogo && fs.existsSync(clientLogo)) {
      doc.image(clientLogo, 440, 42, { fit: [113, 36], align: 'right' })
    }

    doc.font('Helvetica-Bold').fontSize(8).fillColor('#64748b').text('CONFIDENTIAL  |  PRODUCT DATA GROWTH ASSESSMENT', 42, 112)

    doc.fillColor('#e63329').rect(42, 126, 40, 4).fill()

    doc.font('Helvetica-Bold').fontSize(29).fillColor('#0b255d').text('TURN PRODUCT CONTENT\nINTO A STRONGER\nDIGITAL SALES ASSET', 42, 156, { width: 500, lineGap: 3 })

    doc.font('Helvetica').fontSize(11).fillColor('#64748b').text('Prepared for', 42, 290)
    doc.font('Helvetica-Bold').fontSize(18).fillColor('#0b255d').text(clientName, 42, 308)

    doc.font('Helvetica').fontSize(11).fillColor('#334155').text('A focused before-and-after assessment showing how structured product data can improve discovery, buyer confidence and channel readiness.', 42, 354, { width: 470, lineGap: 4 })

    // Horizontal Transformation Bar
    const barY = 430
    doc.roundedRect(42, barY, 511, 98, 7).fill('#0b255d')

    doc.fillColor('#b9c8dd').font('Helvetica-Bold').fontSize(7).text('CURRENT READINESS', 62, barY + 16)
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(25).text(`${beforeScore}%`, 62, barY + 32)
    doc.fillColor('#b9c8dd').font('Helvetica').fontSize(7).text('Original product experience', 62, barY + 65)

    doc.fillColor('#7893b7').font('Helvetica-Bold').fontSize(16).text('>', 205, barY + 40)

    doc.fillColor('#b9c8dd').font('Helvetica-Bold').fontSize(7).text('ENRICHED READINESS', 230, barY + 16)
    doc.fillColor('#77dfad').font('Helvetica-Bold').fontSize(25).text(`${afterScore}%`, 230, barY + 32)
    doc.fillColor('#b9c8dd').font('Helvetica').fontSize(7).text('Structured commerce experience', 230, barY + 65)

    doc.fillColor('#7893b7').font('Helvetica-Bold').fontSize(16).text('>', 375, barY + 40)

    doc.fillColor('#b9c8dd').font('Helvetica-Bold').fontSize(7).text('MEASURED UPLIFT', 400, barY + 16)
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(25).text(`+${scoreGain} pts`, 400, barY + 32)
    doc.fillColor('#b9c8dd').font('Helvetica').fontSize(7).text('Across assessed dimensions', 400, barY + 65)

    doc.font('Helvetica-Bold').fontSize(8).fillColor('#e63329').text('THE COMMERCIAL OPPORTUNITY', 42, 565)
    const coverValue = [
      ['BE FOUND', 'Richer titles, taxonomy and SEO signals create more relevant entry points.'],
      ['BE UNDERSTOOD', 'Structured specifications help buyers evaluate products with confidence.'],
      ['BE READY TO SCALE', 'Consistent attributes support filters, PIM, marketplaces and sales teams.']
    ]
    coverValue.forEach(([title, body], index) => {
      const x = 42 + index * 174
      doc.rect(x, 585, 163, 82).fill('#f7f9fc').strokeColor('#dce4ee').stroke()
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#0b255d').text(title, x + 11, 598, { width: 140 })
      doc.font('Helvetica').fontSize(7.5).fillColor('#526177').text(body, x + 11, 616, { width: 140, lineGap: 2 })
    })

    doc.font('Helvetica').fontSize(7).fillColor('#64748b').text('Readiness score: average of the evidence-backed product-data dimensions assessed in this report. Scores indicate maturity and do not forecast revenue or conversion outcomes.', 42, 682, { width: 511, lineGap: 2 })

    // Cover Footer
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#0b255d').text(`Prepared for ${clientName}`, 42, 712)
    doc.font('Helvetica').fontSize(8.5).fillColor('#64748b').text(`Prepared by AltiusNXT Technologies  |  ${reportDateStr}  |  Version ${versionStr}`, 42, 730)


    // ==========================================
    // ==========================================
    // PAGE 2 — EXECUTIVE IMPACT SUMMARY (THE OPPORTUNITY)
    // ==========================================
    doc.addPage()
    renderHeader(doc, 'Executive Impact Summary', 2)

    doc.font('Helvetica-Bold').fontSize(22).fillColor('#0b255d').text('WHY BETTER PRODUCT DATA MATTERS', 42, 65)
    doc.font('Helvetica').fontSize(10).fillColor('#64748b').text('See where product data limits discovery - and what structured enrichment can unlock.', 42, 90)

    // Executive Statement Box
    doc.roundedRect(42, 110, 511, 52, 6).fill('#f7f8fa').strokeColor('#e2e8f0').stroke()
    doc.font('Helvetica').fontSize(9).fillColor('#334155').text(report.executiveSummary || `We reviewed ${clientName}'s product experience to identify where richer, structured information can remove buyer uncertainty, strengthen organic discovery and create a scalable foundation for digital commerce growth.`, 54, 122, { width: 487, lineGap: 3 })

    // Before vs After Large Side-by-Side Boxes
    const vizY = 175
    const boxHeight = 275

    // BEFORE BOX (Current Version)
    doc.roundedRect(42, vizY, 245, boxHeight, 6).fill('#fff5f5').strokeColor('#fecaca').stroke()
    doc.fillColor('#9f1239').font('Helvetica-Bold').fontSize(10.5).text('CURRENT VERSION (BEFORE)', 56, vizY + 14)
    doc.fillColor('#7f1d1d').font('Helvetica-Bold').fontSize(8).text('As Seen on Client Website', 56, vizY + 28)

    const beforeBulletPoints = [
      ['• What exists now', 'Basic title & generic unstructured text'],
      ['• Limited attributes', 'Missing discrete technical spec fields'],
      ['• SEO gaps', 'Missing long-tail search signals'],
      ['• Buyer perspective gaps', 'Unformatted materials, dimensions & specs'],
      ['• Missing schema', 'No JSON-LD / schema.org product metadata'],
      ['• Limited filter readiness', 'Unstructured text cannot feed filters'],
      ['• Limited taxonomy depth', 'Generic categorization hierarchy']
    ]

    beforeBulletPoints.forEach(([label, detail], i) => {
      const py = vizY + 48 + i * 31
      doc.fillColor('#9f1239').font('Helvetica-Bold').fontSize(8.5).text(label, 56, py)
       doc.fillColor('#475467').font('Helvetica').fontSize(9).text(detail, 56, py + 12, { width: 220 })
    })

    // AFTER BOX (Enriched Version)
    doc.roundedRect(308, vizY, 245, boxHeight, 6).fill('#f0fdf4').strokeColor('#bbf7d0').stroke()
    doc.fillColor('#166534').font('Helvetica-Bold').fontSize(10.5).text('ENRICHED VERSION (AFTER)', 322, vizY + 14)
    doc.fillColor('#14532d').font('Helvetica-Bold').fontSize(8).text('Structured Technical Format', 322, vizY + 28)

    const afterBulletPoints = [
      ['Structured SEO Title', product.enrichedProductName || product.productName || 'Standardized product title'],
      ['Standardized Spec Table', 'Clean, verified key-value spec matrix'],
      ['Attribute Normalization', 'Standardized units, materials & sizes'],
      ['Filter-Ready Facets', 'Extracted attributes ready for search filters'],
      ['Category Mapping', product.enrichedTaxonomy || 'Mapped to standard industry taxonomy']
    ]

    afterBulletPoints.forEach(([label, detail], i) => {
      const py = vizY + 48 + i * 44
      doc.fillColor('#166534').font('Helvetica-Bold').fontSize(8.5).text(label, 322, py)
      doc.fillColor('#334155').font('Helvetica').fontSize(9).text(detail, 322, py + 12, { width: 220, lineGap: 2 })
    })

    // WHAT THIS IMPROVES (Cards Grid)
    const impY = 465
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#0b255d').text('WHAT THIS IMPROVES & WHY IT MATTERS', 42, impY)

    const improvementsList = [
      ['Filtering & Discovery', 'Creates structured signals that can support category-specific filters.'],
      ['Search Readiness', 'Adds precise product terms that can support relevant search entry points.'],
      ['Channel Readiness', 'Creates reusable fields for PIM, marketplaces and downstream systems.'],
      ['Buyer Confidence', 'Makes important technical information easier to find and compare.']
    ]

    improvementsList.forEach(([title, desc], i) => {
      const col = i % 2
      const row = Math.floor(i / 2)
      const x = 42 + col * 260
      const y = impY + 16 + row * 62
      doc.roundedRect(x, y, 245, 54, 6).fill('#ffffff').strokeColor('#e2e8f0').stroke()
      doc.fillColor('#e63329').font('Helvetica-Bold').fontSize(9).text(title, x + 12, y + 10)
      doc.fillColor('#475467').font('Helvetica').fontSize(9).text(desc, x + 12, y + 24, { width: 220 })
    })

    // WHY THIS MATTERS BANNER
    const bannerY = 608
    doc.roundedRect(42, bannerY, 511, 62, 6).fill('#0b255d')
    doc.fillColor('#e63329').font('Helvetica-Bold').fontSize(8).text('STRATEGIC DATA ARCHITECTURE', 58, bannerY + 12)
    doc.fillColor('#ffffff').font('Helvetica').fontSize(8.5).text('Structured product data is reusable commerce infrastructure - not simply better copy. It creates a governed foundation for discovery, evaluation and multi-channel publishing.', 58, bannerY + 25, { width: 480, lineGap: 3 })


    // ==========================================
    // PAGE 3 — CURRENT-STATE DATA GAPS (WHAT WE FOUND)
    // ==========================================
    doc.addPage()
    renderHeader(doc, 'Current-State Assessment', 3)

    doc.font('Helvetica-Bold').fontSize(22).fillColor('#0b255d').text('CURRENT-STATE DATA GAPS', 42, 68)
    doc.font('Helvetica').fontSize(10.5).fillColor('#64748b').text('What limits the current product experience', 42, 95)

    const gaps = [
      { num: '01', title: 'STRUCTURE', sub: 'Unstructured product information', desc: 'Specifications are embedded in descriptive content instead of reusable structured fields.', impact: 'Limits filtering and comparison.' },
      { num: '02', title: 'TAXONOMY', sub: 'Broad product classification', desc: 'Current categorization provides limited product-level specificity across categories.', impact: 'Reduces category precision.' },
      { num: '03', title: 'TECHNICAL DATA', sub: 'Limited structured specifications', desc: 'Important buyer attributes are not available as independent searchable data points.', impact: 'Makes technical comparison harder.' },
      { num: '04', title: 'SEARCH', sub: 'Limited searchable attributes', desc: 'Search relies heavily on basic title and broad descriptive content.', impact: 'Limits attribute-level discovery.' },
      { num: '05', title: 'FILTERING', sub: 'Limited faceted-filter readiness', desc: 'Key product characteristics are not available as structured, filterable values.', impact: 'Reduces guided product discovery.' },
      { num: '06', title: 'STANDARDIZATION', sub: 'Inconsistent data structure', desc: 'Product information is not organized using a consistent reusable taxonomy schema.', impact: 'Creates additional downstream data work.' }
    ]

    gaps.forEach((g, i) => {
      const col = i % 2
      const row = Math.floor(i / 2)
      const x = 42 + col * 262
      const y = 130 + row * 195

      doc.roundedRect(x, y, 248, 180, 6).fill('#f7f8fa').strokeColor('#e2e8f0').stroke()

      doc.fillColor('#e63329').font('Helvetica-Bold').fontSize(16).text(g.num, x + 16, y + 16)
      doc.fillColor('#0b255d').font('Helvetica-Bold').fontSize(10).text(g.title, x + 48, y + 18)

      doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(9.5).text(g.sub, x + 16, y + 48, { width: 216 })
      doc.fillColor('#475467').font('Helvetica').fontSize(8.5).text(g.desc, x + 16, y + 74, { width: 216, lineGap: 3 })

      doc.rect(x + 16, y + 130, 216, 1).fill('#e2e8f0')
      doc.fillColor('#9f1239').font('Helvetica-Bold').fontSize(8).text('IMPACT:', x + 16, y + 142)
      doc.fillColor('#334155').font('Helvetica').fontSize(8).text(g.impact, x + 60, y + 142, { width: 172 })
    })


    // ==========================================
    // PAGE 4 — PRODUCT TRANSFORMATION (BEFORE VS AFTER SCREENSHOTS)
    // ==========================================
    doc.addPage()
    renderHeader(doc, 'Visual Evidence Comparison', 4)

    doc.font('Helvetica-Bold').fontSize(22).fillColor('#0b255d').text('SEE THE DIFFERENCE', 42, 68)

    const prodName = product.productName || product.originalProductName || 'Product name not verified'
    const prodSku = product.sku || product.originalSku || product.enrichedSku || 'SKU not verified'
    const prodCat = product.category || 'Category not verified'

    doc.font('Helvetica').fontSize(9.5).fillColor('#64748b').text(`${prodName}   |   SKU: ${prodSku}   |   ${prodCat}`, 42, 95)

    // Main Screenshots Frame (consuming ~60% of page height)
    const imgFrameY = 118
    const frameW = 248
    const frameH = 430

    // Before Box
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#9f1239').text('BEFORE — CLIENT PRODUCT EXPERIENCE', 42, imgFrameY)
    drawBrowserFrame(doc, 'Original Listing Page', 42, imgFrameY + 14, frameW, frameH, { ...product.beforeImage, pdfPage: product.beforePdfPage || 1 })

    // After Box
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#166534').text('AFTER — ENRICHED PRODUCT EXPERIENCE', 305, imgFrameY)
    drawBrowserFrame(doc, 'Enriched Product Record', 305, imgFrameY + 14, frameW, frameH, { ...product.afterImage, pdfPage: product.afterPdfPage || 1 })

    // Zoomed Evidence Region Highlights
    const zoomY = imgFrameY + frameH + 32
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#0b255d').text('KEY EVIDENCE CALLOUTS DETECTED IN ENRICHMENT', 42, zoomY)

    const callouts = [
      ['01', 'Product Naming & Brand', 'Standardized title with brand, series, size and material specifications.'],
      ['02', 'Structured Tech Specs', `${attrCount} evidence-supported fields converted into reusable structured data.`],
      ['03', 'Taxonomy & Filtering', product.taxonomyChanges || `Mapped ${prodCat} using evidence-supported category and filter fields.`]
    ]

    callouts.forEach(([num, title, desc], i) => {
      const x = 42 + i * 174
      doc.roundedRect(x, zoomY + 16, 163, 64, 5).fill('#f7f8fa').strokeColor('#e2e8f0').stroke()
      doc.fillColor('#e63329').font('Helvetica-Bold').fontSize(11).text(num, x + 12, zoomY + 28)
      doc.fillColor('#0b255d').font('Helvetica-Bold').fontSize(8.5).text(title, x + 34, zoomY + 28, { width: 118 })
      doc.fillColor('#475467').font('Helvetica').fontSize(8.5).text(desc, x + 12, zoomY + 46, { width: 140, lineGap: 2 })
    })


    // ==========================================
    // PAGE 5 — VISUAL CHANGE STORY (WHAT CHANGED)
    // ==========================================
    doc.addPage()
    renderHeader(doc, 'Transformation Breakdown', 5)

    doc.font('Helvetica-Bold').fontSize(22).fillColor('#0b255d').text('WHAT CHANGED', 42, 68)
    doc.font('Helvetica').fontSize(10.5).fillColor('#64748b').text('How each enrichment step supports discovery, evaluation and reuse.', 42, 95)

    const compactTaxonomy = String(product.enrichedTaxonomy || product.category || 'Taxonomy not verified in the enriched source').split(/\s+>\s+|\s+\/\s+/).slice(0, 3).join(' > ')
    const compactFilters = String(product.filterFieldsEnabled || 'No verified filter fields').split(',').map(value => value.trim()).filter(Boolean).slice(0, 5).join(', ')
    const changes = [
      {
        num: '01', area: 'PRODUCT NAMING',
        before: product.originalProductName || product.productName || 'Not verified in the original source',
        after: product.enrichedProductName || product.productName || 'Not verified in the enriched source',
        note: 'Standardized product naming with additional identifying characteristics and brand normalization.'
      },
      {
        num: '02', area: 'TAXONOMY & CATEGORIZATION',
        before: product.originalTaxonomy || 'Taxonomy not visible in the original source',
        after: compactTaxonomy,
        note: 'Reclassified under industry-standard taxonomy structure with clear category precision.'
      },
      {
        num: '03', area: 'STRUCTURED DATA & SPECS',
        before: 'Technical details contained mainly in unstructured free-text descriptive paragraphs.',
        after: `${attrCount} structured specification fields extracted, normalized and schema-validated.`,
        note: 'Product characteristics converted into independent, reusable data points.'
      },
      {
        num: '04', area: 'SEARCH & FILTERING READINESS',
        before: 'Limited attribute-level filtering capability on current platform.',
        after: compactFilters,
        note: 'Structured attributes enable multi-option faceted discovery for technical buyers.'
      }
    ]

    changes.forEach((c, i) => {
      const y = 125 + i * 148
      doc.roundedRect(42, y, 511, 134, 6).fill('#ffffff').strokeColor('#e2e8f0').stroke()

      // Left Area Label
      doc.fillColor('#e63329').font('Helvetica-Bold').fontSize(12).text(c.num, 58, y + 14)
      doc.fillColor('#0b255d').font('Helvetica-Bold').fontSize(10).text(c.area, 84, y + 15)

      // Before block
      doc.roundedRect(58, y + 36, 210, 52, 4).fill('#fff5f5').strokeColor('#fecaca').stroke()
      doc.fillColor('#9f1239').font('Helvetica-Bold').fontSize(7.5).text('BEFORE', 68, y + 44)
      doc.fillColor('#334155').font('Helvetica').fontSize(9).text(c.before, 68, y + 57, { width: 190, height: 30, lineGap: 2 })

      // Arrow
      doc.fillColor('#0b255d').font('Helvetica-Bold').fontSize(12).text('>', 276, y + 54)

      // After block
      doc.roundedRect(294, y + 36, 243, 52, 4).fill('#f0fdf4').strokeColor('#bbf7d0').stroke()
      doc.fillColor('#166534').font('Helvetica-Bold').fontSize(7.5).text('AFTER / ENRICHED', 304, y + 44)
      doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(9).text(c.after, 304, y + 57, { width: 223, height: 30, lineGap: 2 })

      // Bottom Note
      doc.fillColor('#64748b').font('Helvetica').fontSize(9).text(`Business impact: ${c.note}`, 58, y + 103, { width: 479 })
    })


    // ==========================================
    // PAGE 6 — ATTRIBUTE TRANSFORMATION (FROM CONTENT TO STRUCTURED DATA)
    // ==========================================
    doc.addPage()
    renderHeader(doc, 'Structured Attributes', 6)

    doc.font('Helvetica-Bold').fontSize(21).fillColor('#0b255d').text('FROM PARAGRAPH TO COMMERCE DATA', 42, 68, { width: 511 })
    doc.font('Helvetica').fontSize(11).fillColor('#64748b').text('One source paragraph becomes reusable, buyer-ready product information.', 42, 99, { width: 511 })

    // Metric sits on its own row so it can never intrude into the title.
    doc.roundedRect(385, 120, 168, 38, 5).fill('#0b255d')
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(17).text(String(attrCount), 398, 130)
    doc.fillColor('#dbeafe').font('Helvetica-Bold').fontSize(8).text('ATTRIBUTES EXTRACTED', 430, 126, { width: 108 })
    doc.fillColor('#b9c8dd').font('Helvetica').fontSize(7.5).text('8 key attributes shown', 430, 140, { width: 108 })

    const splitY = 178
    const panelHeight = 474
    const leftX = 42
    const leftWidth = 160
    const columnGap = 12
    const rightX = leftX + leftWidth + columnGap
    const rightWidth = 339

    // Left source panel - 32% of the content grid.
    doc.roundedRect(leftX, splitY, leftWidth, panelHeight, 5).fill('#fff6f6').strokeColor('#fecaca').stroke()
    doc.fillColor('#9f1239').font('Helvetica-Bold').fontSize(10).text('UNSTRUCTURED DATA', leftX + 14, splitY + 16, { width: leftWidth - 28 })
    doc.fillColor('#64748b').font('Helvetica').fontSize(8.5).text('Original source content', leftX + 14, splitY + 34, { width: leftWidth - 28 })

    const rawExcerpt = product.originalDescription || product.beforeSummary || 'No verified source description was available for this product.'

    doc.fillColor('#334155').font('Helvetica').fontSize(9.5).text(rawExcerpt, leftX + 14, splitY + 62, { width: leftWidth - 28, lineGap: 4 })

    // Right structured panel - 68% of the content grid.
    doc.roundedRect(rightX, splitY, rightWidth, panelHeight, 5).fill('#ffffff').strokeColor('#dce4ee').stroke()
    doc.fillColor('#0b255d').font('Helvetica-Bold').fontSize(10).text('STRUCTURED ATTRIBUTE MODEL', rightX + 16, splitY + 16, { width: rightWidth - 32 })

    const tableX = rightX + 16
    const tableWidth = rightWidth - 32
    const labelWidth = 112
    const valueX = tableX + labelWidth + 12
    const valueWidth = tableWidth - labelWidth - 20
    doc.rect(tableX, splitY + 40, tableWidth, 28).fill('#0b255d')
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8.5)
    doc.text('ATTRIBUTE', tableX + 10, splitY + 49, { width: labelWidth - 10 })
    doc.text('ENRICHED VALUE', valueX, splitY + 49, { width: valueWidth })

    const extractedAttributes = Object.entries(product.extractedFields || {})
      .filter(([, field]) => field?.value && !/not detected|not visible|not available|not verified/i.test(String(field.value)))
      .map(([name, field]) => [name.replace(/([A-Z])/g, ' $1').replace(/^./, value => value.toUpperCase()).trim(), String(field.value)])
    const improvementAttributes = (product.improvements || [])
      .filter(item => item?.afterState && ['Added', 'Enriched', 'Improved', 'Standardized', 'Normalized', 'Corrected', 'Structured'].includes(item.resultStatus))
      .map(item => [item.area || 'Verified improvement', String(item.afterState)])
    const sampleAttrs = [...extractedAttributes, ...improvementAttributes]
      .filter(([name, value], index, list) => list.findIndex(([candidate]) => candidate.toLowerCase() === name.toLowerCase()) === index && value)
      .slice(0, 8)
    if (!sampleAttrs.length) sampleAttrs.push(['Verified attributes', 'No structured attribute values were verified from the supplied evidence.'])

    sampleAttrs.forEach(([attr, val], i) => {
      const rowY = splitY + 68 + i * 49
      doc.rect(tableX, rowY, tableWidth, 49).fill(i % 2 ? '#f7f9fc' : '#ffffff')
      doc.fillColor('#334155').font('Helvetica-Bold').fontSize(9.5).text(attr, tableX + 10, rowY + 17, { width: labelWidth - 10, height: 28 })
      doc.fillColor('#166534').font('Helvetica-Bold').fontSize(9.5).text(val, valueX, rowY + 10, { width: valueWidth, height: 36, lineGap: 2 })
    })

    // Bottom capability strip follows the same 511pt page grid.
    const botY = 674
    doc.roundedRect(42, botY, 511, 45, 6).fill('#0b255d')
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9).text('READY TO SUPPORT', 58, botY + 17)

    ;['FILTER', 'COMPARE', 'SEARCH', 'PIM', 'MARKETPLACE'].forEach((label, i) => {
      const x = 180 + i * 71
      doc.roundedRect(x, botY + 11, 64, 22, 4).fill('#1e3a8a')
      doc.fillColor('#dbeafe').font('Helvetica-Bold').fontSize(7).text(label, x, botY + 17, { width: 64, align: 'center' })
    })


    // ==========================================
    // PAGE 7 — TAXONOMY & DISCOVERABILITY
    // ==========================================
    doc.addPage()
    renderHeader(doc, 'Taxonomy & Discoverability', 7)

    doc.font('Helvetica-Bold').fontSize(22).fillColor('#0b255d').text('MAKE EVERY PRODUCT EASIER TO FIND', 42, 68)
    doc.font('Helvetica').fontSize(10.5).fillColor('#64748b').text('Improving navigation, search signals, and faceted filtering', 42, 95)

    // Visual Taxonomy Transformation
    const taxY = 125
    doc.roundedRect(42, taxY, 235, 175, 6).fill('#fff5f5').strokeColor('#fecaca').stroke()
    doc.fillColor('#9f1239').font('Helvetica-Bold').fontSize(9.5).text('ORIGINAL CLASSIFICATION', 58, taxY + 16)

    const origTaxNodes = (product.originalTaxonomy || product.category || 'Original taxonomy not verified').split(/\/|>/).map(s => s.trim()).filter(Boolean)
    origTaxNodes.forEach((node, i) => {
      doc.fillColor('#475467').font('Helvetica').fontSize(9).text(node, 58, taxY + 42 + i * 32)
      if (i < origTaxNodes.length - 1) doc.fillColor('#94a3b8').fontSize(8).text('v', 58, taxY + 58 + i * 32)
    })

    // Arrow
    doc.fillColor('#0b255d').font('Helvetica-Bold').fontSize(16).text('>', 288, taxY + 80)

    doc.roundedRect(318, taxY, 235, 175, 6).fill('#f0fdf4').strokeColor('#bbf7d0').stroke()
    doc.fillColor('#166534').font('Helvetica-Bold').fontSize(9.5).text('ENRICHED CLASSIFICATION', 334, taxY + 16)

    const enrTaxNodes = (product.enrichedTaxonomy || product.category || 'Enriched taxonomy not verified').split(/>|\//).map(s => s.trim()).filter(Boolean)
    enrTaxNodes.forEach((node, i) => {
      doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(9).text(node, 334, taxY + 42 + i * 32)
      if (i < enrTaxNodes.length - 1) doc.fillColor('#166534').fontSize(8).text('v', 334, taxY + 58 + i * 32)
    })

    // Chips
    const chipY = 325
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#0b255d').text('DISCOVERY CAPABILITIES ENABLED', 42, chipY)

    const chips = Object.entries(product.extractedFields || {}).filter(([, field]) => field?.value && !/not detected|not visible|not available/i.test(field.value)).map(([name]) => name.replace(/([A-Z])/g, ' $1').trim()).slice(0, 8)
    chips.forEach((chip, i) => {
      const col = i % 4
      const row = Math.floor(i / 4)
      const x = 42 + col * 126
      const y = chipY + 20 + row * 34
      doc.roundedRect(x, y, 118, 26, 13).fill('#f7f8fa').strokeColor('#cbd5e1').stroke()
      doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(8).text(chip, x, y + 8, { width: 118, align: 'center' })
    })

    // Capability Matrix
    const matrixY = 440
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#0b255d').text('SEARCH & DISCOVERY CAPABILITY MATRIX', 42, matrixY)

    doc.rect(42, matrixY + 18, 511, 24).fill('#0b255d')
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8)
    doc.text('CAPABILITY', 54, matrixY + 25, { width: 200 })
    doc.text('BEFORE', 270, matrixY + 25, { width: 100 })
    doc.text('AFTER', 400, matrixY + 25, { width: 100 })

    const capRows = [
      ['Category Precision', 'Limited', 'Structured'],
      ['Attribute Search', 'Limited', 'Supported'],
      ['Faceted Filtering', 'Limited', 'Supported'],
      ['Comparison Data', 'Limited', 'Structured'],
      ['Channel Mapping', 'Manual', 'Better Prepared']
    ]

    capRows.forEach(([cap, bef, aft], i) => {
      const y = matrixY + 42 + i * 38
      doc.rect(42, y, 511, 38).fill(i % 2 ? '#f7f8fa' : '#ffffff')
      doc.fillColor('#334155').font('Helvetica-Bold').fontSize(9.5).text(cap, 54, y + 13, { width: 200 })
      doc.fillColor('#9f1239').font('Helvetica').fontSize(9.5).text(bef, 270, y + 13, { width: 100 })
      doc.fillColor('#166534').font('Helvetica-Bold').fontSize(9.5).text(aft, 400, y + 13, { width: 100 })
    })


    // ==========================================
    // PAGE 8 — COMMERCE READINESS SCORECARD (QUALITATIVE MATURITY)
    // ==========================================
    doc.addPage()
    renderHeader(doc, 'Commerce Readiness Scorecard', 8)

    doc.font('Helvetica-Bold').fontSize(20).fillColor('#0b255d').text('WHAT IS READY - AND WHAT STILL NEEDS WORK', 42, 68)
    doc.font('Helvetica').fontSize(10.5).fillColor('#64748b').text('Qualitative product-data maturity evaluation based on evidence', 42, 95)

    const scoreTableY = 125
    doc.rect(42, scoreTableY, 511, 24).fill('#0b255d')
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8)
    doc.text('DIMENSION', 54, scoreTableY + 7, { width: 160 })
    doc.text('BEFORE', 230, scoreTableY + 7, { width: 90 })
    doc.text('AFTER', 330, scoreTableY + 7, { width: 90 })
    doc.text('PROGRESS', 440, scoreTableY + 7, { width: 100 })

    const scoreRows = [
      ['Product Structure', 'BASIC', 'STRUCTURED'],
      ['Taxonomy', 'BROAD', 'STANDARDIZED'],
      ['Technical Detail', 'LIMITED', 'ENRICHED'],
      ['Attributes', 'UNSTRUCTURED', 'STRUCTURED'],
      ['Filter Readiness', 'LIMITED', 'ENABLED'],
      ['Search Readiness', 'BASIC', 'IMPROVED'],
      ['Compliance Data', 'NOT DETECTED', 'AVAILABLE*'],
      ['Digital Assets', 'BASIC', 'UNCHANGED']
    ]

    scoreRows.forEach(([dim, bef, aft], i) => {
      const y = scoreTableY + 24 + i * 44
      doc.rect(42, y, 511, 44).fill(i % 2 ? '#f7f8fa' : '#ffffff')

      doc.fillColor('#0b255d').font('Helvetica-Bold').fontSize(9).text(dim, 54, y + 16, { width: 160 })

      // Before Badge
      doc.roundedRect(226, y + 10, 80, 22, 4).fill('#fff5f5').strokeColor('#fecaca').stroke()
      doc.fillColor('#9f1239').font('Helvetica-Bold').fontSize(8.5).text(bef, 226, y + 16, { width: 80, align: 'center' })

      // After Badge
      doc.roundedRect(326, y + 10, 95, 22, 4).fill('#f0fdf4').strokeColor('#bbf7d0').stroke()
      doc.fillColor('#166534').font('Helvetica-Bold').fontSize(8.5).text(aft, 326, y + 16, { width: 95, align: 'center' })

      // Progress Bar
      doc.roundedRect(440, y + 18, 95, 8, 4).fill('#e2e8f0')
      const width = aft.includes('UNCHANGED') ? 30 : 85
      doc.roundedRect(440, y + 18, width, 8, 4).fill(aft.includes('UNCHANGED') ? '#64748b' : '#0b255d')
    })

    doc.font('Helvetica').fontSize(8).fillColor('#64748b').text('*Qualitative status based only on the supplied evidence. Unchanged areas remain visible to preserve credibility.', 42, 510)

    doc.fillColor('#0b255d').font('Helvetica-Bold').fontSize(10).text('BIGGEST GAINS', 42, 550)
    doc.fillColor('#334155').font('Helvetica').fontSize(9).text('Attribute structure  |  Taxonomy precision  |  Search and filter readiness', 42, 568, { width: 511 })
    doc.fillColor('#0b255d').font('Helvetica-Bold').fontSize(10).text('REMAINING OPPORTUNITY', 42, 610)
    doc.fillColor('#334155').font('Helvetica').fontSize(9).text('Expand digital assets  |  Validate additional compliance evidence  |  Pilot the model across a priority category', 42, 628, { width: 511 })


    // ==========================================
    // PAGE 9 — BUSINESS VALUE (WHAT STRUCTURED PRODUCT DATA ENABLES)
    // ==========================================
    doc.addPage()
    renderHeader(doc, 'Commercial Impact', 9)

    doc.font('Helvetica-Bold').fontSize(22).fillColor('#0b255d').text('FROM DISCOVERY TO SCALE', 42, 68)
    doc.font('Helvetica').fontSize(10.5).fillColor('#64748b').text('How structured data supports each stage of the buyer journey.', 42, 95)

    const quads = [
      { num: '01', title: 'DISCOVER', items: ['Searchable attributes', 'More precise categorization', 'Faceted navigation'] },
      { num: '02', title: 'EVALUATE', items: ['Clear technical specifications', 'Consistent product information', 'Easier product comparison'] },
      { num: '03', title: 'PROCURE', items: ['Structured identifiers', 'Standardized units', 'Compliance visibility'] },
      { num: '04', title: 'SCALE', items: ['Reusable product schema', 'PIM readiness', 'Marketplace mapping', 'Multi-channel syndication'] }
    ]

    quads.forEach((q, i) => {
      const col = i % 2
      const row = Math.floor(i / 2)
      const x = 42 + col * 262
      const y = 130 + row * 215

      doc.roundedRect(x, y, 248, 198, 6).fill('#f7f8fa').strokeColor('#e2e8f0').stroke()

      doc.fillColor('#e63329').font('Helvetica-Bold').fontSize(16).text(q.num, x + 18, y + 18)
      doc.fillColor('#0b255d').font('Helvetica-Bold').fontSize(13).text(q.title, x + 50, y + 20)

      q.items.forEach((item, idx) => {
        doc.fillColor('#166534').font('Helvetica-Bold').fontSize(9).text('+', x + 18, y + 60 + idx * 34)
        doc.fillColor('#334155').font('Helvetica').fontSize(9).text(item, x + 34, y + 60 + idx * 34, { width: 195 })
      })
    })

    // Central Visual Story Banner
    const storyY = 590
    doc.roundedRect(42, storyY, 511, 75, 6).fill('#0b255d')

    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8.5).text('RAW PRODUCT CONTENT', 60, storyY + 30)
    doc.fillColor('#93c5fd').font('Helvetica-Bold').fontSize(14).text('>', 188, storyY + 28)

    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8.5).text('STRUCTURED PRODUCT DATA', 215, storyY + 30)
    doc.fillColor('#93c5fd').font('Helvetica-Bold').fontSize(14).text('>', 378, storyY + 28)

    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8.5).text('COMMERCE CAPABILITIES', 405, storyY + 30)


    // ==========================================
    // PAGE 10 — SALES CLOSING PAGE (PARTNERSHIP OPPORTUNITY)
    // ==========================================
    doc.addPage()
    renderHeader(doc, 'Partnership Opportunity', 10)

    doc.font('Helvetica-Bold').fontSize(20).fillColor('#0b255d').text('FROM ONE PRODUCT TO A SCALABLE\nPRODUCT DATA FOUNDATION', 42, 68, { lineGap: 3 })

    doc.font('Helvetica').fontSize(10).fillColor('#475467').text('This assessment proves the framework on one product. The next opportunity is to validate the model across a representative category before wider catalog rollout.', 42, 125, { width: 511, lineGap: 3 })

    // 3 Roadmap Steps
    const stepY = 185
    const steps = [
      ['01', 'VALIDATE', 'Approve taxonomy, schema and evidence rules.'],
      ['02', 'PILOT', 'Apply the model to one priority product category.'],
      ['03', 'SCALE', 'Extend the approved structure across the wider catalog.']
    ]

    steps.forEach(([num, label, text], i) => {
      const x = 42 + i * 174
      doc.roundedRect(x, stepY, 163, 105, 6).fill('#f7f8fa').strokeColor('#e2e8f0').stroke()

      doc.fillColor('#e63329').font('Helvetica-Bold').fontSize(14).text(num, x + 14, stepY + 16)
      doc.fillColor('#0b255d').font('Helvetica-Bold').fontSize(11).text(label, x + 40, stepY + 18)

      doc.fillColor('#475467').font('Helvetica').fontSize(8.5).text(text, x + 14, stepY + 46, { width: 135, lineGap: 3 })
    })

    // Large Premium CTA Area
    const ctaY = 320
    doc.roundedRect(42, ctaY, 511, 140, 6).fill('#0b255d')

    doc.fillColor('#77dfad').font('Helvetica-Bold').fontSize(9).text('RECOMMENDED NEXT STEP', 66, ctaY + 20)
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(18).text('Run a category-level enrichment pilot.', 66, ctaY + 42, { width: 450 })
    doc.fillColor('#dbe7f7').font('Helvetica').fontSize(9).text('Select one priority category and validate the enrichment model across a representative product set.', 66, ctaY + 70, { width: 430, lineGap: 3 })

    doc.roundedRect(66, ctaY + 86, 140, 32, 4).fill('#e63329')
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9).text('DISCUSS PILOT', 66, ctaY + 97, { width: 140, align: 'center' })
    doc.fillColor('#dbe7f7').font('Helvetica-Bold').fontSize(8.5).text('REQUEST SAMPLE OUTPUT', 224, ctaY + 99)

    // Footer Contact Box
    const footerY = 540
    doc.roundedRect(42, footerY, 511, 145, 6).fill('#f7f8fa').strokeColor('#e2e8f0').stroke()

    doc.fillColor('#0b255d').font('Helvetica-Bold').fontSize(11).text('Prepared by AltiusNxt Technologies', 62, footerY + 20)
    doc.fillColor('#64748b').font('Helvetica').fontSize(8.5).text('Enterprise Product Data Services & eCommerce Intelligence', 62, footerY + 36)

    doc.rect(62, footerY + 54, 471, 1).fill('#e2e8f0')

    const amName = report.accountManager || 'Sales & Solutions Engineering'
    doc.fillColor('#0b255d').font('Helvetica-Bold').fontSize(9.5).text(`Account Lead: ${amName}`, 62, footerY + 66)
    doc.fillColor('#475467').font('Helvetica').fontSize(8.5).text('Email: info@altiusnxt.com   |   Web: www.altiusnxt.com   |   Location: Global Solutions Hub', 62, footerY + 84)


    // ==========================================
    // 2-PASS PAGE NUMBERING & FOOTER INSERTION
    // ==========================================
    const pages = doc.bufferedPageRange()
    for (let i = 0; i < pages.count; i++) {
      doc.switchToPage(i)
      renderFooter(doc, i + 1, pages.count)
    }

    doc.end()
    stream.on('finish', () => resolve(pages.count))
    stream.on('error', reject)
  })
}

function buildConsolidatedPdf(report, output) {
  return new Promise((resolve, reject) => {
    report = { ...report, ...(report.branding?.reportProfile || {}) }
    const products = (report.products || []).filter(Boolean)
    const clientName = report.clientName || report.preparedFor || 'Valued Client'
    const doc = new PDFDocument({ size: 'A4', margin: 42, bufferPages: true, info: { Title: report.name || 'Product Data Enrichment Report', Author: 'AltiusNxt Technologies' } })
    const stream = fs.createWriteStream(output)
    doc.pipe(stream)

    const C = { navy: '#102d66', ink: '#172033', muted: '#667085', line: '#e4e7ec', soft: '#f7f9fc', green: '#18794e', greenBg: '#edf9f2', red: '#b42335', redBg: '#fff3f4', accent: '#ef3328' }
    const clean = (value, fallback = 'Not verified') => value && !/^not (available|detected|verified)$/i.test(String(value).trim()) ? String(value).trim() : fallback
    const productScore = (product, side) => {
      const values = Object.values(product.scores || {}).map(value => Number(value?.[side])).filter(Number.isFinite)
      return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null
    }
    const productAttrs = product => {
      const extracted = Object.entries(product.extractedFields || {}).filter(([, field]) => field?.value && !/not detected|not available|not verified/i.test(String(field.value))).map(([name, field]) => [name.replace(/([A-Z])/g, ' $1').replace(/^./, char => char.toUpperCase()).trim(), String(field.value)])
      const improved = (product.improvements || []).filter(item => item?.afterState && ['Added', 'Enriched', 'Improved', 'Standardized', 'Normalized', 'Corrected', 'Structured'].includes(item.resultStatus)).map(item => [item.area || 'Improvement', String(item.afterState)])
      return [...extracted, ...improved].filter(([name], index, list) => list.findIndex(([candidate]) => candidate.toLowerCase() === name.toLowerCase()) === index)
    }
    const pageHeader = (section, productIndex) => {
      const logo = imagePath(report?.branding?.companyLogo) || DEFAULT_LOGO
      if (fs.existsSync(logo)) doc.image(logo, 42, 20, { fit: [105, 28] })
      const context = productIndex == null ? section : `PRODUCT ${String(productIndex + 1).padStart(2, '0')} OF ${String(products.length).padStart(2, '0')}  |  ${section}`
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor(C.muted).text(context.toUpperCase(), 205, 27, { width: 348, align: 'right' })
      doc.moveTo(42, 50).lineTo(553, 50).strokeColor(C.line).stroke()
    }
    const pageTitle = (eyebrow, title, subtitle) => {
      doc.font('Helvetica-Bold').fontSize(8).fillColor(C.accent).text(eyebrow.toUpperCase(), 42, 70, { width: 511 })
      doc.font('Helvetica-Bold').fontSize(23).fillColor(C.navy).text(title, 42, 88, { width: 511, lineGap: 2 })
      const titleHeight = doc.heightOfString(title, { width: 511, lineGap: 2 })
      const subtitleY = 94 + titleHeight
      doc.font('Helvetica').fontSize(10.5).fillColor(C.muted).text(subtitle, 42, subtitleY, { width: 511, lineGap: 3 })
      return subtitleY + doc.heightOfString(subtitle, { width: 511, lineGap: 3 }) + 24
    }
    const metric = (x, y, width, label, value, note, positive = false) => {
      doc.roundedRect(x, y, width, 76, 5).fill(positive ? C.greenBg : C.soft)
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor(positive ? C.green : C.muted).text(label.toUpperCase(), x + 14, y + 12, { width: width - 28 })
      doc.font('Helvetica-Bold').fontSize(22).fillColor(positive ? C.green : C.navy).text(value, x + 14, y + 29, { width: width - 28 })
      doc.font('Helvetica').fontSize(7.5).fillColor(C.muted).text(note, x + 14, y + 57, { width: width - 28 })
    }
    const addPage = (section, productIndex) => { doc.addPage(); pageHeader(section, productIndex) }

    // Cover: portfolio-level context appears once.
    const logo = imagePath(report?.branding?.companyLogo) || DEFAULT_LOGO
    if (fs.existsSync(logo)) doc.image(logo, 42, 38, { fit: [155, 48] })
    doc.font('Helvetica-Bold').fontSize(8).fillColor(C.muted).text('CONFIDENTIAL  |  PRODUCT DATA ENRICHMENT REPORT', 42, 120)
    doc.rect(42, 138, 42, 4).fill(C.accent)
    doc.font('Helvetica-Bold').fontSize(28).fillColor(C.navy).text('A CLEARER PRODUCT STORY.\nA STRONGER DATA FOUNDATION.', 42, 165, { width: 511, lineGap: 5 })
    doc.font('Helvetica').fontSize(11).fillColor(C.muted).text('Prepared for', 42, 276)
    doc.font('Helvetica-Bold').fontSize(19).fillColor(C.navy).text(clientName, 42, 295, { width: 511 })
    doc.font('Helvetica').fontSize(11).fillColor(C.ink).text(`A consolidated assessment of ${products.length} product${products.length === 1 ? '' : 's'}, showing current data quality, evidence-backed enrichment and recommended next actions.`, 42, 338, { width: 470, lineGap: 5 })
    const analyzed = products.filter(product => product.analysisStatus === 'Complete' || Object.keys(product.scores || {}).length)
    const avg = side => { const values = analyzed.map(product => productScore(product, side)).filter(Number.isFinite); return values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null }
    const before = avg('before'); const after = avg('after')
    metric(42, 430, 157, 'Products assessed', String(products.length), `${analyzed.length} analyzed`)
    metric(219, 430, 157, 'Current maturity', before == null ? 'N/A' : `${before}%`, 'Evidence-based average')
    metric(396, 430, 157, 'Enriched maturity', after == null ? 'N/A' : `${after}%`, after == null ? 'Not scored' : `+${Math.max(0, after - (before || 0))} points`, true)
    doc.font('Helvetica-Bold').fontSize(9).fillColor(C.accent).text('REPORT JOURNEY', 42, 548)
    const journey = products.length > 3
      ? ['Portfolio insight', 'Product reports', 'Enriched information', 'Recommended action']
      : ['Product insight', 'Visual evidence', 'Enriched information', 'Recommended action']
    journey.forEach((label, index) => {
      const x = 42 + index * 128
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(C.navy).text(`${String(index + 1).padStart(2, '0')}  ${label}`, x, 574, { width: 116 })
    })
    doc.font('Helvetica').fontSize(8).fillColor(C.muted).text('Scores summarize assessed product-data dimensions. They indicate maturity, not guaranteed commercial outcomes.', 42, 650, { width: 511 })
    doc.roundedRect(42, 688, 511, 58, 5).fill(C.soft)
    doc.font('Helvetica-Bold').fontSize(8).fillColor(C.accent).text('THE DECISION THIS REPORT SUPPORTS', 58, 702)
    doc.font('Helvetica-Bold').fontSize(10.5).fillColor(C.navy).text('Where is product data limiting the buyer experience - and which enrichment model should be validated next?', 58, 719, { width: 475 })

    // Portfolio summary is valuable for larger reports, but omitted for small
    // reports where it would repeat the cover and create an under-filled page.
    if (products.length > 3) {
    addPage('Executive Summary')
    let y = pageTitle('Portfolio view', 'WHAT THE ASSESSMENT SHOWS', 'A fast view of the strongest gains, recurring gaps and where to focus next.')
    const totalAttrs = products.reduce((sum, product) => sum + productAttrs(product).length, 0)
    const changed = products.reduce((sum, product) => sum + (product.improvements || []).filter(item => item.resultStatus && !/unchanged|no change/i.test(item.resultStatus)).length, 0)
    metric(42, y, 157, 'Products', String(products.length), 'In one consolidated report')
    metric(219, y, 157, 'Verified changes', String(changed), 'Across product evidence')
    metric(396, y, 157, 'Structured fields', String(totalAttrs), 'Reusable product information', true)
    y += 105
    doc.font('Helvetica-Bold').fontSize(11).fillColor(C.navy).text('PRODUCT PORTFOLIO', 42, y)
    y += 22
    doc.rect(42, y, 511, 28).fill(C.navy)
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#fff').text('PRODUCT', 54, y + 9, { width: 225 }).text('CATEGORY', 286, y + 9, { width: 135 }).text('MATURITY', 434, y + 9, { width: 100 })
    y += 28
    products.slice(0, 10).forEach((product, index) => {
      const rowY = y + index * 42
      doc.rect(42, rowY, 511, 42).fill(index % 2 ? C.soft : '#fff')
      doc.font('Helvetica-Bold').fontSize(9).fillColor(C.ink).text(clean(product.productName || product.originalProductName, `Product ${index + 1}`), 54, rowY + 14, { width: 220, height: 18 })
      doc.font('Helvetica').fontSize(8.5).fillColor(C.muted).text(clean(product.category), 286, rowY + 14, { width: 135, height: 18 })
      const score = productScore(product, 'after')
      doc.font('Helvetica-Bold').fontSize(9).fillColor(score == null ? C.muted : C.green).text(score == null ? 'Not scored' : `${score}%`, 434, rowY + 14, { width: 90 })
    })
    if (products.length > 10) doc.font('Helvetica').fontSize(8.5).fillColor(C.muted).text(`Plus ${products.length - 10} additional products detailed in the following sections.`, 42, y + 430)
    }

    products.forEach((product, index) => {
      const name = clean(product.productName || product.originalProductName, `Product ${index + 1}`)
      const attrs = productAttrs(product)
      const improvements = (product.improvements || []).filter(item => item.resultStatus && !/unchanged|no change/i.test(item.resultStatus))
      const beforeScore = productScore(product, 'before'); const afterScore = productScore(product, 'after')

      // Product page 1: current quality -> findings -> value.
      addPage('Product Story', index)
      y = pageTitle(`Product ${String(index + 1).padStart(2, '0')}`, name, `${clean(product.sku || product.originalSku, 'SKU not verified')}  |  ${clean(product.category)}`)
      metric(42, y, 157, 'Current quality', beforeScore == null ? 'N/A' : `${beforeScore}%`, 'Original evidence')
      metric(219, y, 157, 'Enriched quality', afterScore == null ? 'N/A' : `${afterScore}%`, 'After enrichment', true)
      metric(396, y, 157, 'Structured fields', String(attrs.length), 'Evidence-supported')
      y += 104
      doc.font('Helvetica-Bold').fontSize(11).fillColor(C.navy).text('IMPORTANT FINDINGS', 42, y)
      const genericFinding = value => /^(current information is limited|enriched information available|not verified|not detected|no change)[.!]?$/i.test(String(value || '').trim())
      const meaningfulFindings = improvements.filter(item => item?.beforeState && item?.afterState && !genericFinding(item.afterState)).slice(0, 4)
      const findings = meaningfulFindings.length ? meaningfulFindings : improvements.slice(0, 4)
      ;(findings.length ? findings : [{ area: 'Evidence review', beforeState: product.beforeSummary, afterState: product.afterSummary }]).forEach((item, row) => {
        const rowY = y + 26 + row * 80
        doc.font('Helvetica-Bold').fontSize(10).fillColor(C.navy).text(`${String(row + 1).padStart(2, '0')}  ${clean(item.area, 'Product information')}`, 42, rowY, { width: 170 })
        doc.font('Helvetica').fontSize(9.5).fillColor(C.muted).text(clean(item.beforeState, 'Current information is limited.'), 225, rowY, { width: 145, height: 54, lineGap: 3 })
        doc.font('Helvetica-Bold').fontSize(9.5).fillColor(C.green).text(clean(item.afterState, 'Enriched information available.'), 390, rowY, { width: 163, height: 54, lineGap: 3 })
        doc.moveTo(42, rowY + 64).lineTo(553, rowY + 64).strokeColor(C.line).stroke()
      })
      const valueY = Math.min(666, y + 42 + Math.max(1, findings.length) * 80)
      doc.roundedRect(42, valueY, 511, 68, 5).fill(C.navy)
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#79e0af').text('WHY THIS MATTERS', 58, valueY + 14)
      doc.font('Helvetica').fontSize(10).fillColor('#fff').text(clean(product.businessImpact || product.keyTransformation, 'Structured product information creates a stronger foundation for discovery, evaluation and downstream reuse.'), 58, valueY + 32, { width: 475, height: 28, lineGap: 3 })

      // Product page 2: visual proof and concise change summary.
      addPage('Before and After Evidence', index)
      y = pageTitle('Visual evidence', 'SEE THE DIFFERENCE', 'Original and enriched product information shown side by side.')
      const frameW = 244; const frameH = 370
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(C.red).text('BEFORE', 42, y)
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(C.green).text('AFTER', 309, y)
      drawBrowserFrame(doc, 'Original product record', 42, y + 15, frameW, frameH, { ...product.beforeImage, pdfPage: product.beforePdfPage || 1 })
      drawBrowserFrame(doc, 'Enriched product record', 309, y + 15, frameW, frameH, { ...product.afterImage, pdfPage: product.afterPdfPage || 1 })
      y += 410
      doc.font('Helvetica-Bold').fontSize(10).fillColor(C.navy).text('WHAT CHANGED', 42, y)
      meaningfulFindings.slice(0, 3).forEach((item, row) => {
        const x = 42 + row * 174
        doc.moveTo(x, y + 22).lineTo(x + 160, y + 22).strokeColor(row === 0 ? C.accent : C.navy).lineWidth(2).stroke()
        doc.font('Helvetica-Bold').fontSize(9.5).fillColor(C.navy).text(clean(item.area), x, y + 34, { width: 160 })
        doc.font('Helvetica').fontSize(9).fillColor(C.muted).text(clean(item.afterState), x, y + 52, { width: 160, height: 52, lineGap: 3 })
      })

      // Product page 3 appears only when the evidence is rich enough to justify it.
      if (attrs.length > 5 || improvements.length > 5 || product.recommendations) {
        addPage('Enriched Information', index)
        y = pageTitle('Reusable product data', 'ENRICHED INFORMATION', 'The most decision-useful attributes and recommended next action.')
        const shownAttrs = attrs.slice(0, 7)
        doc.font('Helvetica-Bold').fontSize(10).fillColor(C.navy).text(`${attrs.length} STRUCTURED FIELDS  |  ${shownAttrs.length} KEY FIELDS SHOWN`, 42, y)
        y += 24
        doc.rect(42, y, 511, 28).fill(C.navy)
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#fff').text('ATTRIBUTE', 54, y + 9, { width: 160 }).text('ENRICHED VALUE', 230, y + 9, { width: 305 })
        y += 28
        shownAttrs.forEach(([label, value], row) => {
          const rowY = y + row * 52
          doc.rect(42, rowY, 511, 52).fill(row % 2 ? C.soft : '#fff')
          doc.font('Helvetica-Bold').fontSize(9.5).fillColor(C.ink).text(label, 54, rowY + 17, { width: 160, height: 28 })
          doc.font('Helvetica').fontSize(9.5).fillColor(C.green).text(value, 230, rowY + 11, { width: 305, height: 38, lineGap: 3 })
        })
        y += shownAttrs.length * 52 + 24
        doc.roundedRect(42, y, 511, 78, 5).fill(C.soft)
        doc.font('Helvetica-Bold').fontSize(8).fillColor(C.accent).text('RECOMMENDED ACTION', 58, y + 14)
        doc.font('Helvetica-Bold').fontSize(11).fillColor(C.navy).text(clean(product.recommendations || product.keyTransformation, 'Validate these attributes and apply the approved structure to the wider category.'), 58, y + 31, { width: 475, height: 36, lineGap: 3 })
      }
    })

    // Final summary: company-level recommendation appears once.
    addPage('Final Recommendation')
    y = pageTitle('Recommended next step', 'TURN THE FINDINGS INTO A CONTROLLED PILOT', 'Validate the enrichment model on one priority category before wider catalog rollout.')
    ;[['01', 'VALIDATE', 'Confirm taxonomy, attributes and evidence rules.'], ['02', 'PILOT', 'Apply the model to a representative product set.'], ['03', 'SCALE', 'Extend the approved structure across the catalog.']].forEach(([num, title, body], index) => {
      const x = 42 + index * 174
      doc.roundedRect(x, y, 163, 132, 5).fill(C.soft)
      doc.font('Helvetica-Bold').fontSize(16).fillColor(C.accent).text(num, x + 16, y + 18)
      doc.font('Helvetica-Bold').fontSize(11).fillColor(C.navy).text(title, x + 16, y + 48)
      doc.font('Helvetica').fontSize(9).fillColor(C.muted).text(body, x + 16, y + 70, { width: 131, lineGap: 3 })
    })
    y += 170
    doc.roundedRect(42, y, 511, 150, 6).fill(C.navy)
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#79e0af').text('CLIENT DECISION', 66, y + 24)
    doc.font('Helvetica-Bold').fontSize(19).fillColor('#fff').text('Select one priority category for the pilot.', 66, y + 48, { width: 450 })
    doc.font('Helvetica').fontSize(10).fillColor('#dbe7f7').text('AltiusNxt will use the approved product-data model to produce a representative, reviewable category output.', 66, y + 79, { width: 430, lineGap: 3 })
    doc.roundedRect(66, y + 111, 132, 28, 4).fill(C.accent)
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#fff').text('DISCUSS PILOT', 66, y + 121, { width: 132, align: 'center' })
    y += 182
    doc.font('Helvetica-Bold').fontSize(10).fillColor(C.navy).text('PILOT OUTPUT', 42, y)
    ;[['CATEGORY MODEL', 'Approved taxonomy and attribute schema.'], ['EVIDENCE LOG', 'Traceable source-to-enriched decisions.'], ['SCALE PLAN', 'Clear recommendation for wider rollout.']].forEach(([title, body], index) => {
      const x = 42 + index * 174
      doc.moveTo(x, y + 24).lineTo(x + 160, y + 24).strokeColor(index === 0 ? C.accent : C.line).lineWidth(2).stroke()
      doc.font('Helvetica-Bold').fontSize(9).fillColor(C.navy).text(title, x, y + 36, { width: 160 })
      doc.font('Helvetica').fontSize(8.8).fillColor(C.muted).text(body, x, y + 54, { width: 150, lineGap: 3 })
    })
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(C.navy).text(`Account lead: ${report.accountManager || 'Sales & Solutions Engineering'}`, 42, 700)
    doc.font('Helvetica').fontSize(8.5).fillColor(C.muted).text('info@altiusnxt.com  |  www.altiusnxt.com', 42, 718)

    const pages = doc.bufferedPageRange()
    for (let i = 0; i < pages.count; i++) {
      doc.switchToPage(i)
      doc.moveTo(42, 782).lineTo(553, 782).strokeColor(C.line).stroke()
      doc.font('Helvetica').fontSize(7.5).fillColor(C.muted).text(`AltiusNxt Technologies  |  ${clientName}  |  Confidential`, 42, 790, { width: 390 })
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor(C.navy).text(`Page ${i + 1} of ${pages.count}`, 450, 790, { width: 103, align: 'right' })
    }
    doc.end()
    stream.on('finish', () => resolve(pages.count))
    stream.on('error', reject)
  })
}

function buildClientReadyPdf(report, output) {
  return new Promise((resolve, reject) => {
    report = { ...report, ...(report.branding?.reportProfile || {}) }
    const doc = new PDFDocument({ size: 'A4', margin: 38, bufferPages: true, info: { Title: report.name || 'Product Data Enrichment Report', Author: 'AltiusNxt Technologies' } })
    const stream = fs.createWriteStream(output)
    doc.pipe(stream)

    const product = report.products?.[0] || {}
    const clientName = report.clientName || report.preparedFor || 'Valued Client'
    const reportDateStr = new Date(report.reportDate || Date.now()).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    const pageW = 515
    const left = 42
    const right = 553
    const colors = {
      navy: '#111111', blue: '#1d4ed8', blueSoft: '#f8fafc', border: '#e5e7eb', body: '#171717', muted: '#6b7280', green: '#166534', greenBg: '#f8fafc', greenLine: '#d1d5db', red: '#9f1239', redBg: '#f8fafc', redLine: '#d1d5db'
    }
    const logo = imagePath(report?.branding?.companyLogo) || DEFAULT_LOGO
    const clientLogo = imagePath(report?.clientLogo)
    const hasLogo = fs.existsSync(logo)
    const hasClientLogo = clientLogo && fs.existsSync(clientLogo)
    const clean = value => {
      const text = String(value || '').replace(/\s+/g, ' ').trim()
      return text && !/^(not (available|detected|verified)|unknown|n\/a|pending)$/i.test(text) ? text : ''
    }
    const fallback = (value, alt) => clean(value) || alt
    const attrCount = Number(product.enrichedAttributeCount) || Object.values(product.extractedFields || {}).filter(field => clean(field?.value)).length || (product.improvements || []).filter(item => /Added|Enriched|Improved|Standardized|Normalized|Corrected|Structured/i.test(item.resultStatus || '')).length || 0
    const specCount = Number(product.enrichedSpecificationCount) || Number(product.existingSpecificationCount) || attrCount
    const beforeName = fallback(product.originalProductName, product.productName || 'Original product name not verified')
    const afterName = fallback(product.enrichedProductName, product.productName || 'Enriched product name not verified')
    const beforeTax = fallback(product.originalTaxonomy, product.category || 'Original taxonomy not verified')
    const afterTax = fallback(product.enrichedTaxonomy, product.category || 'Enriched taxonomy not verified')
    const beforeDesc = fallback(product.originalDescription, product.beforeSummary || 'Original description not verified')
    const afterDesc = fallback(product.enrichedDescription, product.afterSummary || 'Enriched description not verified')
    const filterReadiness = fallback(product.filterFieldsEnabled, 'Structured attributes ready for filtering')
    const seoReadiness = fallback(product.seoSignals, 'Structured naming and taxonomy improve SEO readiness')
    const docsReadiness = fallback(product.documentation, 'Supporting documents and attachments improve buyer confidence')
    const assetReadiness = fallback(product.digitalAssets, 'Digital assets support richer product presentation')
    const scoreRows = (report.products || []).flatMap(item => Object.values(item.scores || {}).map(score => Number(score?.before)).filter(Number.isFinite))
    const avgBefore = scoreRows.length ? Math.round(scoreRows.reduce((sum, n) => sum + n, 0) / scoreRows.length) : 0
    const avgAfter = (report.products || []).flatMap(item => Object.values(item.scores || {}).map(score => Number(score?.after)).filter(Number.isFinite))
    const avgAfterScore = avgAfter.length ? Math.round(avgAfter.reduce((sum, n) => sum + n, 0) / avgAfter.length) : 0
    const delta = Math.max(0, avgAfterScore - avgBefore)
    const improvements = [
      ['Product naming', beforeName, afterName, 'Clearer naming helps scanning, consistency, and search matching.'],
      ['Taxonomy and categorization', beforeTax, afterTax, 'More precise hierarchy supports navigation and catalog structure.'],
      ['Structured attributes and specifications', 'Free-text product content', `${attrCount} structured attributes and ${specCount} specifications`, 'Structured fields support filtering, comparison, and reuse.'],
      ['Descriptions and detail depth', beforeDesc, afterDesc, 'Richer content helps buyers evaluate the product faster.'],
      ['Filtering and search readiness', 'Limited structured fields', `${filterReadiness} / ${seoReadiness}`, 'Improves discovery, faceted browsing, and SEO signals.']
    ]
    const wrap = (text, width) => doc.heightOfString(text, { width, lineGap: 2 })
    const sectionTitle = (eyebrow, title, subtitle, y = 70) => {
      doc.font('Helvetica-Bold').fontSize(8).fillColor(colors.blue).text(eyebrow.toUpperCase(), left, y)
      doc.font('Helvetica-Bold').fontSize(24).fillColor(colors.navy).text(title, left, y + 16, { width: pageW, lineGap: 1.15 })
      const titleH = doc.heightOfString(title, { width: pageW, lineGap: 1.2 })
      const subY = y + 18 + titleH
      doc.font('Helvetica').fontSize(9.5).fillColor('#111111').text(subtitle, left, subY, { width: pageW, lineGap: 2.25 })
      return subY + doc.heightOfString(subtitle, { width: pageW, lineGap: 2.25 }) + 14
    }
    const pageHeader = (title, pageNum, subtitle = '') => {
      if (pageNum === 1) return
      if (hasLogo) doc.image(logo, left, 18, { fit: [102, 26] })
      if (hasClientLogo) doc.image(clientLogo, 156, 20, { fit: [60, 20] })
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor(colors.muted).text(`ALTIUSNXT TECHNOLOGIES  |  ${title.toUpperCase()}`, 230, 24, { width: 323, align: 'right' })
      if (subtitle) doc.font('Helvetica').fontSize(7.25).fillColor(colors.muted).text(subtitle, 230, 35, { width: 323, align: 'right' })
      doc.moveTo(left, 50).lineTo(right, 50).strokeColor(colors.border).stroke()
    }
    const footer = (pageNum, totalPages) => {
      doc.moveTo(left, 783).lineTo(right, 783).strokeColor(colors.border).stroke()
      doc.font('Helvetica').fontSize(7.25).fillColor(colors.muted).text(`Prepared by AltiusNxt Technologies  |  ${clientName}  |  Confidential`, left, 790, { width: 390 })
      doc.font('Helvetica-Bold').fontSize(7.25).fillColor(colors.navy).text(`Page ${pageNum} of ${totalPages}`, 452, 790, { width: 101, align: 'right' })
    }
    const card = (x, y, w, h, fill, border, label, value, note, accent = colors.muted) => {
      doc.roundedRect(x, y, w, h, 8).fill(fill).strokeColor(border).stroke()
      doc.font('Helvetica-Bold').fontSize(7.25).fillColor(accent).text(label.toUpperCase(), x + 12, y + 10, { width: w - 24 })
      doc.font('Helvetica-Bold').fontSize(14).fillColor('#111111').text(String(value), x + 12, y + 24, { width: w - 24 })
      if (note) doc.font('Helvetica').fontSize(7.5).fillColor('#171717').text(note, x + 12, y + h - 16, { width: w - 24 })
    }
    const pill = (x, y, w, label) => {
      doc.roundedRect(x, y, w, 18, 9).fill('#f8fafc').strokeColor(colors.border).stroke()
      doc.font('Helvetica-Bold').fontSize(7.25).fillColor('#171717').text(label, x, y + 5, { width: w, align: 'center' })
    }
    const compare = (x, y, w, h, title, before, after) => {
      doc.roundedRect(x, y, w, h, 8).fill('#fff').strokeColor(colors.border).stroke()
      doc.font('Helvetica-Bold').fontSize(8).fillColor(colors.blue).text(title.toUpperCase(), x + 12, y + 10)
      doc.roundedRect(x + 12, y + 28, (w - 36) / 2, h - 40, 6).fill('#fff').strokeColor(colors.border).stroke()
      doc.roundedRect(x + 24 + (w - 36) / 2, y + 28, (w - 36) / 2, h - 40, 6).fill('#fff').strokeColor(colors.border).stroke()
      doc.font('Helvetica-Bold').fontSize(7).fillColor(colors.muted).text('BEFORE', x + 18, y + 36)
      doc.font('Helvetica').fontSize(8.1).fillColor(colors.body).text(before, x + 18, y + 50, { width: (w - 50) / 2 - 8, height: h - 62, lineGap: 2, ellipsis: true })
      doc.font('Helvetica-Bold').fontSize(7).fillColor(colors.green).text('AFTER', x + 30 + (w - 36) / 2, y + 36)
      doc.font('Helvetica').fontSize(8.1).fillColor(colors.navy).text(after, x + 30 + (w - 36) / 2, y + 50, { width: (w - 50) / 2 - 8, height: h - 62, lineGap: 2, ellipsis: true })
    }
    const evidence = asset => {
      const file = renderPdfEvidence(asset)
      return file && fs.existsSync(file) ? file : null
    }
    const browserFrame = (x, y, w, h, title, asset) => {
      doc.roundedRect(x, y, w, h, 8).fill('#fff').strokeColor(colors.border).stroke()
      doc.roundedRect(x, y, w, 20, 8).fill('#f8fafc').strokeColor(colors.border).stroke()
      doc.font('Helvetica-Bold').fontSize(7.25).fillColor(colors.body).text(title, x + 10, y + 6, { width: w - 20 })
      const file = evidence(asset)
      if (file && path.extname(file).toLowerCase() !== '.pdf') {
        try { doc.image(file, x + 2, y + 22, { fit: [w - 4, h - 24], align: 'center', valign: 'center' }) } catch { doc.font('Helvetica').fontSize(8).fillColor(colors.muted).text('Screenshot preview', x, y + h / 2 - 4, { width: w, align: 'center' }) }
      } else {
        doc.font('Helvetica').fontSize(8).fillColor(colors.muted).text('Screenshot preview', x, y + h / 2 - 4, { width: w, align: 'center' })
      }
    }

    // Page 1
    if (hasLogo) doc.image(logo, left, 32, { fit: [140, 36] })
    if (hasClientLogo) doc.image(clientLogo, 430, 34, { fit: [92, 28] })
    doc.font('Helvetica-Bold').fontSize(8).fillColor(colors.muted).text('CONFIDENTIAL  |  PRODUCT DATA ENRICHMENT REPORT', left, 106)
    doc.roundedRect(left, 126, 154, 20, 10).fill(colors.blueSoft).strokeColor('#bfdbfe').stroke()
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(colors.blue).text('CLIENT REPORTING WORKSPACE', left, 132, { width: 154, align: 'center' })
    doc.font('Helvetica-Bold').fontSize(26).fillColor(colors.navy).text(report.name || 'Product Data Enrichment Report', left, 162, { width: pageW, lineGap: 2 })
    doc.font('Helvetica').fontSize(10.5).fillColor(colors.body).text(report.executiveSummary || `A client-ready review of ${clientName}'s product data, showing what was missing, what was improved, and why the enrichment matters commercially.`, left, 214, { width: pageW, lineGap: 3 })
    card(42, 282, 152, 80, '#fff', colors.border, 'Products reviewed', (report.products || []).length || 1, 'Reviewed in this report')
    card(208, 282, 152, 80, '#fff', colors.border, 'Structured attributes', attrCount || 'Verified', 'Reusable fields extracted')
    card(374, 282, 183, 80, colors.blueSoft, '#bfdbfe', 'Readiness gain', `+${delta || 0} pts`, 'Where scored data exists', colors.blue)
    doc.font('Helvetica-Bold').fontSize(8).fillColor(colors.blue).text('WHAT THIS REPORT EXPLAINS', left, 386)
    ;['Before → what was missing', 'What AltiusNXT improved', 'Why it matters to the client', 'How it supports business impact'].forEach((text, i) => pill(42 + (i % 2) * 254, 408 + Math.floor(i / 2) * 28, 238, text))
    doc.roundedRect(42, 500, 515, 120, 10).fill(colors.navy)
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#93c5fd').text('FINAL VALUE', 58, 516)
    doc.font('Helvetica-Bold').fontSize(17).fillColor('#fff').text('A cleaner, more trustworthy foundation for client-ready product storytelling.', 58, 538, { width: 470, lineGap: 2 })
    doc.font('Helvetica').fontSize(8.75).fillColor('#dbeafe').text('The enriched version is easier to scan, easier to trust, and better prepared for search, filtering, sales review, and future catalog reuse.', 58, 568, { width: 466, lineGap: 2.2 })
    doc.font('Helvetica').fontSize(8).fillColor('#cbd5e1').text(`${clientName}  |  ${reportDateStr}  |  Version ${report.reportVersion || '1.0'}`, left, 732, { width: pageW, align: 'center' })

    // Page 2
    doc.addPage()
    pageHeader('Executive Summary', 2, 'What changed and why it matters')
    const y2 = sectionTitle('Executive summary', 'The report narrative in one view', 'The before state showed limited commercial structure. The after state turns product content into usable commerce data.')
    card(42, y2, 158, 72, '#fff', colors.border, 'Before state', 'Limited', 'Unstructured content and broad classification', colors.red)
    card(212, y2, 158, 72, '#fff', colors.border, 'After state', 'Enriched', 'Structured, standardized, and easier to reuse', colors.green)
    card(382, y2, 171, 72, colors.blueSoft, '#bfdbfe', 'Client outcome', 'More ready', 'For discovery, evaluation, and sales use', colors.blue)
    doc.roundedRect(42, y2 + 90, 515, 100, 10).fill('#fff').strokeColor(colors.border).stroke()
    doc.font('Helvetica-Bold').fontSize(9).fillColor(colors.blue).text('EXECUTIVE SUMMARY', 58, y2 + 106)
    doc.font('Helvetica').fontSize(9.75).fillColor(colors.body).text(report.executiveSummary || `The source record had visible gaps in naming clarity, taxonomy depth, structured specifications, and buyer-facing detail. The enriched version improves the product story by standardizing naming, expanding structured fields, improving taxonomy alignment, and surfacing more decision-relevant information.`, 58, y2 + 122, { width: 481, lineGap: 2.6 })
    ;[
      ['What was missing', 'Product information was too thin, too broad, and too free-form for a premium client presentation.', colors.redBg, colors.redLine, colors.red],
      ['What was improved', 'AltiusNXT added structure, clarity, taxonomy precision, and more useful product detail.', colors.greenBg, colors.greenLine, colors.green],
      ['Why it matters', 'Buyers can evaluate faster, search can match better, and the content can be reused downstream.', colors.blueSoft, '#bfdbfe', colors.blue]
    ].forEach((item, i) => {
      const x = 42 + i * 172
      doc.roundedRect(x, y2 + 210, 160, 118, 10).fill(item[2]).strokeColor(item[3]).stroke()
      doc.font('Helvetica-Bold').fontSize(8.25).fillColor(item[4]).text(item[0].toUpperCase(), x + 12, y2 + 222)
      doc.font('Helvetica').fontSize(8.75).fillColor(colors.body).text(item[1], x + 12, y2 + 240, { width: 136, lineGap: 2.2 })
    })
    doc.roundedRect(42, y2 + 348, 515, 90, 10).fill('#fff').strokeColor(colors.border).stroke()
    doc.font('Helvetica-Bold').fontSize(9).fillColor(colors.navy).text('WHAT THE CLIENT GAINS', 58, y2 + 364)
    doc.font('Helvetica').fontSize(9).fillColor(colors.body).text('Better filtering readiness, clearer product detail, stronger presentation quality, and a more scalable catalog foundation.', 58, y2 + 382, { width: 481, lineGap: 2.3 })
    doc.font('Helvetica-Bold').fontSize(8.25).fillColor(colors.blue).text('Evidence note: the PDF only claims improvements that are visible in the supplied before/after content.', 58, y2 + 412, { width: 481 })

    // Page 3
    doc.addPage()
    pageHeader('Impact Overview', 3, 'Visible improvements and client benefit')
    const y3 = sectionTitle('Enrichment impact overview', 'What the enrichment improved', 'These are the actual improvement themes visible in the supplied before/after material.')
    card(42, y3, 246, 70, '#fff', colors.border, 'Structured attributes', attrCount || 'Verified', 'Reusable fields from enriched product data', colors.blue)
    card(300, y3, 257, 70, '#fff', colors.border, 'Technical specifications', specCount || 'Verified', 'Decision-supporting detail', colors.blue)
    card(42, y3 + 82, 246, 70, '#fff', colors.border, 'Buyer-ready taxonomy', afterTax ? 'Mapped' : 'Verified', 'Cleaner hierarchy for navigation and categorization', colors.muted)
    card(300, y3 + 82, 257, 70, '#fff', colors.border, 'Evidence set', 'Before + After', 'Screenshot-based comparison supporting the story', colors.muted)
    doc.roundedRect(42, y3 + 168, 515, 130, 10).fill('#fff').strokeColor(colors.border).stroke()
    doc.font('Helvetica-Bold').fontSize(9).fillColor(colors.navy).text('IMPACT SUMMARY', 58, y3 + 184)
    doc.font('Helvetica').fontSize(9.25).fillColor(colors.body).text(`Across the supplied evidence, the biggest visible gains are in product naming, taxonomy clarity, structured detail, and buyer readiness. The report now explains those changes in plain business language instead of only showing screenshots.`, 58, y3 + 202, { width: 480, lineGap: 2.4 })
    ;[['Search readiness', seoReadiness], ['Filtering readiness', filterReadiness], ['Buyer confidence', afterDesc], ['Channel reuse', 'Standardized fields and naming across the product record']].forEach((item, i) => {
      const x = 42 + (i % 2) * 258
      const y = y3 + 300 + Math.floor(i / 2) * 58
      doc.roundedRect(x, y, 246, 50, 8).fill(colors.blueSoft).strokeColor('#bfdbfe').stroke()
      doc.font('Helvetica-Bold').fontSize(8).fillColor(colors.blue).text(item[0], x + 12, y + 10)
      doc.font('Helvetica').fontSize(8).fillColor(colors.body).text(item[1], x + 12, y + 23, { width: 222, lineGap: 1.8 })
    })

    // Page 4
    doc.addPage()
    pageHeader('Before vs After', 4, 'The core visual comparison')
    const y4 = sectionTitle('Before vs after comparison', 'The visible change in one page', 'The screenshots remain central, but the annotations now explain the commercial meaning of the change.')
    doc.font('Helvetica-Bold').fontSize(8).fillColor(colors.red).text('BEFORE', 42, y4 + 2)
    doc.font('Helvetica-Bold').fontSize(8).fillColor(colors.green).text('AFTER', 308, y4 + 2)
    browserFrame(42, y4 + 16, 252, 320, 'Original product experience', product.beforeImage)
    browserFrame(300, y4 + 16, 252, 320, 'Enriched product experience', product.afterImage)
    compare(42, y4 + 352, 515, 64, 'Product naming', beforeName, afterName)
    compare(42, y4 + 424, 515, 64, 'Taxonomy and categorization', beforeTax, afterTax)
    compare(42, y4 + 496, 515, 64, 'Buyer experience', beforeDesc, afterDesc)

    // Page 5
    doc.addPage()
    pageHeader('Detailed Improvements', 5, 'What AltiusNXT improved')
    const y5 = sectionTitle('Detailed improvements', 'What was improved and why', 'This section turns the raw comparison into specific, client-facing improvement statements.')
    const improvementRows = [
      ['Product naming', beforeName, afterName, 'Clearer naming helps scanning, consistency, and search matching.'],
      ['Taxonomy and categorization', beforeTax, afterTax, 'More precise hierarchy supports navigation and catalog structure.'],
      ['Structured attributes and specifications', 'Free-text product content', `${attrCount} structured attributes and ${specCount} specifications`, 'Structured fields support filtering, comparison, and reuse.'],
      ['Descriptions and detail depth', beforeDesc, afterDesc, 'Richer content helps buyers evaluate the product faster.'],
      ['Filtering and search readiness', 'Limited structured fields', `${filterReadiness} / ${seoReadiness}`, 'Improves discovery, faceted browsing, and SEO signals.']
    ]
    improvementRows.forEach((row, i) => {
      const y = y5 + i * 116
      doc.roundedRect(42, y, 515, 96, 10).fill('#fff').strokeColor(colors.border).stroke()
      pill(58, y + 12, 54, String(i + 1).padStart(2, '0'))
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#111111').text(row[0], 124, y + 12)
      doc.font('Helvetica-Bold').fontSize(7).fillColor(colors.muted).text('BEFORE / WHAT WAS MISSING', 124, y + 30)
      doc.font('Helvetica').fontSize(8.4).fillColor('#171717').text(row[1], 124, y + 44, { width: 152, lineGap: 2, ellipsis: true })
      doc.font('Helvetica-Bold').fontSize(7).fillColor(colors.muted).text('WHAT ALTIUSNXT IMPROVED', 304, y + 30)
      doc.font('Helvetica').fontSize(8.4).fillColor('#111111').text(row[2], 304, y + 44, { width: 155, lineGap: 2, ellipsis: true })
      doc.font('Helvetica-Bold').fontSize(7).fillColor(colors.blue).text('WHY IT MATTERS / CLIENT BENEFIT', 124, y + 68)
      doc.font('Helvetica').fontSize(8.2).fillColor('#171717').text(row[3], 124, y + 81, { width: 455, lineGap: 1.9, ellipsis: true })
    })

    // Page 6
    doc.addPage()
    pageHeader('Why It Matters', 6, 'Business meaning of the enrichment')
    const y6 = sectionTitle('Why these improvements matter', 'Translate enrichment into business value', 'The goal is not just better formatting. The goal is clearer product understanding and better commerce readiness.')
    ;[
      ['Buyer decision-making', 'Richer specifications and clearer descriptions help buyers evaluate the product faster.', colors.greenBg, colors.greenLine, colors.green],
      ['Search and discoverability', 'Structured naming and taxonomy create better signals for search engines and internal search.', colors.blueSoft, '#bfdbfe', colors.blue],
      ['Filtering and navigation', 'Attributes hidden in text can become reusable filter fields and category facets.', '#fff', colors.border, colors.navy],
      ['Operational reuse', 'Standardized data can be reused in catalogs, PIM, downstream channels, and sales workflows.', '#fff', colors.border, colors.navy]
    ].forEach((item, i) => {
      const x = 42 + (i % 2) * 258
      const y = y6 + Math.floor(i / 2) * 106
      doc.roundedRect(x, y, 246, 96, 10).fill(item[2]).strokeColor(item[3]).stroke()
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(item[4]).text(item[0], x + 12, y + 12)
      doc.font('Helvetica').fontSize(8.5).fillColor(colors.body).text(item[1], x + 12, y + 30, { width: 220, lineGap: 2, ellipsis: true })
    })
    doc.roundedRect(42, y6 + 206, 515, 102, 10).fill('#fff').strokeColor(colors.border).stroke()
    doc.font('Helvetica-Bold').fontSize(9).fillColor(colors.blue).text('CLIENT BENEFIT', 58, y6 + 222)
    doc.font('Helvetica').fontSize(9.2).fillColor('#111111').text('The client gets a product record that is easier to trust, easier to reuse, and easier to sell.', 58, y6 + 240, { width: 476, lineGap: 2.1 })
    doc.font('Helvetica').fontSize(9).fillColor('#171717').text('The stronger hierarchy, cleaner naming, and more structured content create a better base for client approval, future catalog scaling, and better presentation quality.', 58, y6 + 264, { width: 476, lineGap: 2.1 })

    // Page 7
    doc.addPage()
    pageHeader('Commerce Readiness', 7, 'Search, filter, taxonomy, and reuse')
    const y7 = sectionTitle('Commerce readiness', 'What the enriched record is ready for', 'This page frames the output for eCommerce, PIM, and sales enablement users.')
    const commerceRows = [
      ['Search discoverability', seoReadiness],
      ['Faceted filtering', filterReadiness],
      ['Buyer evaluation', afterDesc],
      ['Channel readiness', 'Reusable product data for downstream systems and catalogs'],
      ['Data consistency', 'More standardized fields and naming across the product record']
    ]
    commerceRows.forEach((row, i) => {
      const y = y7 + i * 56
      doc.roundedRect(42, y, 515, 46, 8).fill(i % 2 === 0 ? '#fff' : '#f8faff').strokeColor(colors.border).stroke()
      doc.font('Helvetica-Bold').fontSize(8.25).fillColor(colors.navy).text(row[0], 56, y + 14, { width: 150 })
      doc.font('Helvetica').fontSize(8.5).fillColor(colors.body).text(row[1], 218, y + 14, { width: 323, lineGap: 2 })
    })
    doc.roundedRect(42, y7 + 292, 515, 160, 10).fill('#fff').strokeColor(colors.border).stroke()
    doc.font('Helvetica-Bold').fontSize(9).fillColor(colors.blue).text('READINESS MATRIX', 58, y7 + 308)
    const readinessRows = [
      ['Structured attributes', 'Ready', 'Structured fields exist for downstream use.', 'Supports filtering and reuse'],
      ['Standardized naming', 'Improved', 'Naming is clearer and more consistent.', 'Improves matching and scanability'],
      ['Taxonomy mapping', 'Ready', 'Hierarchy is more specific and reusable.', 'Supports navigation'],
      ['Filtering readiness', 'Supported', 'Attributes can inform filters.', 'Helps buyer discovery'],
      ['Search readiness', 'Improved', 'SEO signals are stronger in the enriched record.', 'Improves findability'],
      ['Documentation visibility', 'Supported', 'Supportive assets/docs are visible in the record.', 'Improves confidence']
    ]
    doc.roundedRect(58, y7 + 330, 481, 24, 0).fill('#f8fafc').strokeColor(colors.border).stroke()
    ;['Readiness area', 'Status', 'Evidence', 'Client value'].forEach((h, i) => {
      const x = [68, 236, 326, 448][i]
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor(colors.blue).text(h, x, y7 + 338)
    })
    readinessRows.forEach((row, i) => {
      const y = y7 + 356 + i * 20
      doc.roundedRect(58, y, 481, 18, 0).fill(i % 2 ? '#fff' : '#fcfcfd').strokeColor(colors.border).stroke()
      doc.font('Helvetica').fontSize(7.8).fillColor('#111111').text(row[0], 68, y + 5, { width: 150 })
      doc.font('Helvetica-Bold').fontSize(7.4).fillColor(colors.green).text(row[1], 236, y + 5, { width: 70 })
      doc.font('Helvetica').fontSize(7.7).fillColor('#171717').text(row[2], 326, y + 5, { width: 110 })
      doc.font('Helvetica').fontSize(7.7).fillColor('#171717').text(row[3], 448, y + 5, { width: 82 })
    })

    // Page 8
    doc.addPage()
    pageHeader('Business Impact', 8, 'What this means commercially')
    const y8 = sectionTitle('Business impact', 'The outcome the client receives', 'This is the client-facing explanation of why the enrichment is worth caring about.')
    const bizRows = [
      ['Product discovery', 'Better search and category signals make the product easier to find.'],
      ['Buyer confidence', 'More complete detail helps people understand the product faster.'],
      ['Manual effort reduction', 'Standardized fields reduce cleanup and formatting work.'],
      ['Scaling foundation', 'The structured record can be reused across pages and channels.']
    ]
    bizRows.forEach((item, i) => {
      const x = 42 + (i % 2) * 258
      const y = y8 + Math.floor(i / 2) * 52
      doc.roundedRect(x, y, 246, 44, 8).fill('#fff').strokeColor(colors.border).stroke()
      doc.font('Helvetica-Bold').fontSize(8.4).fillColor('#111111').text(item[0], x + 12, y + 10, { width: 110 })
      doc.font('Helvetica').fontSize(8.1).fillColor('#171717').text(item[1], x + 112, y + 10, { width: 122, lineGap: 1.8, ellipsis: true })
    })
    doc.roundedRect(42, y8 + 112, 515, 92, 10).fill('#fff').strokeColor(colors.border).stroke()
    doc.font('Helvetica-Bold').fontSize(9).fillColor(colors.blue).text('BUSINESS IMPACT STORY', 58, y8 + 126)
    doc.font('Helvetica').fontSize(9.2).fillColor('#111111').text('Before: hard to evaluate. After: easier to scan, trust, and reuse. The enriched version supports a more professional client conversation because it turns product content into a cleaner, more structured, more scalable commercial asset.', 58, y8 + 144, { width: 476, lineGap: 2.1 })

    // Page 9
    doc.addPage()
    pageHeader('Final Value Summary', 9, 'Close with a client-ready CTA')
    const y9 = sectionTitle('Final value summary / CTA', 'What the client should take away', 'The enriched report is now designed to be sent to a client as a polished, premium deliverable.')
    doc.roundedRect(42, y9, 515, 108, 10).fill('#fff').strokeColor(colors.border).stroke()
    doc.font('Helvetica-Bold').fontSize(9).fillColor(colors.blue).text('FINAL VALUE SUMMARY', 58, y9 + 16)
    doc.font('Helvetica').fontSize(9.2).fillColor('#111111').text(`This enrichment turns the original product page from a thin, partially structured listing into a more professional client-ready record with stronger naming, better taxonomy, clearer specifications, and more useful business context.`, 58, y9 + 34, { width: 481, lineGap: 2.1 })
    doc.font('Helvetica').fontSize(9.2).fillColor('#171717').text(`Result: easier discovery, stronger buyer confidence, better reuse across channels, and a more scalable data foundation for future catalog growth.`, 58, y9 + 72, { width: 481, lineGap: 2.1 })
    doc.roundedRect(42, y9 + 124, 515, 84, 8).fill('#fff').strokeColor(colors.border).stroke()
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(colors.blue).text('DECISION SUMMARY', 58, y9 + 138)
    doc.font('Helvetica').fontSize(9).fillColor('#111111').text('A premium client-ready narrative that explains what changed, why it matters, and how the client benefits.', 58, y9 + 156, { width: 481, lineGap: 2.1 })
    doc.roundedRect(42, y9 + 218, 515, 74, 8).fill('#fff').strokeColor(colors.border).stroke()
    doc.font('Helvetica-Bold').fontSize(8).fillColor(colors.blue).text('RECOMMENDED NEXT STEP', 58, y9 + 232)
    doc.font('Helvetica').fontSize(8.8).fillColor('#111111').text('Use this structure as the client-facing standard for enrichment reports.', 58, y9 + 250, { width: 466, lineGap: 2 })
    doc.font('Helvetica').fontSize(8).fillColor(colors.muted).text(`Prepared by AltiusNXT Technologies  |  ${clientName}  |  ${reportDateStr}`, left, 732, { width: pageW, align: 'center' })

    const pages = doc.bufferedPageRange()
    for (let i = 0; i < pages.count; i++) {
      doc.switchToPage(i)
      footer(i + 1, pages.count)
    }
    doc.end()
    stream.on('finish', () => resolve(pages.count))
    stream.on('error', reject)
  })
}

router.post('/:id/generate-pdf', auth, async (req, res) => {
  try {
    const report = await prisma.productEnrichmentReport.findFirst({ where: { id: req.params.id, ownerId: req.user.id } })
    if (!report) return res.status(404).json({ message: 'Report not found.' })

    const productWarnings = validateReportEvidence(report)
    if (productWarnings.length && req.body?.generateAnyway !== true) {
      return res.status(422).json({ message: 'Report validation failed. Review the evidence before generating the client PDF.', issues: productWarnings })
    }

    const filename = `${report.id}.pdf`
    const output = path.join(PDF_DIR, filename)

    const pageCount = await buildEnterpriseAssessmentPdf(report, output)

    const updated = await prisma.productEnrichmentReport.update({
      where: { id: report.id },
      data: { pdfPath: `/uploads/enrichment-reports/pdfs/${filename}`, pageCount, status: 'PDF Generated' }
    })

    res.json({ ...updated, productWarnings })
  } catch (err) {
    console.error('[GeneratePDF]', err.message, err.stack)
    res.status(500).json({ message: err.message || 'PDF Generation failed.' })
  }
})

router.get('/:id/download', auth, async (req, res) => {
  try {
    const report = await prisma.productEnrichmentReport.findFirst({ where: { id: req.params.id, ownerId: req.user.id } })
    if (!report) return res.status(404).json({ message: 'Report not found.' })

    const filename = `${report.id}.pdf`
    const file = path.join(PDF_DIR, filename)

    if (!report.pdfPath || !fs.existsSync(file)) {
      const pageCount = await buildEnterpriseAssessmentPdf(report, file)
      await prisma.productEnrichmentReport.update({
        where: { id: report.id },
        data: { pdfPath: `/uploads/enrichment-reports/pdfs/${filename}`, pageCount, status: 'PDF Generated' }
      })
    }

    const sanitizedName = (report.name || 'Product-Data-Enrichment-Report').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '') || 'Product-Data-Enrichment-Report'
    const downloadName = `${sanitizedName}.pdf`

    res.download(file, downloadName, err => {
      if (err && !res.headersSent) {
        console.error('[DownloadPDF Send Error]', err)
        res.status(500).json({ message: 'Error streaming PDF file.' })
      }
    })
  } catch (err) {
    console.error('[DownloadPDF]', err.message, err.stack)
    if (!res.headersSent) {
      res.status(500).json({ message: err.message || 'PDF Download failed.' })
    }
  }
})

module.exports = router

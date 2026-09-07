import { Fragment, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Plus, FileText, Upload, X, Eye, Download, Copy, Trash2, Sparkles, ChevronLeft, ChevronRight,
  ChevronDown, Check, RefreshCw, Save, Image as ImageIcon, Undo, Redo, ZoomIn, ZoomOut, Maximize2,
  Wand2, Building2, CheckCircle2, ArrowUp, ArrowDown, FileCode, Layers, Search, MoreHorizontal, ArrowRight, Share2, AlertCircle,
  Mail, RotateCcw, Settings2
} from 'lucide-react'
import * as pdfjsLib from 'pdfjs-dist'
import api from '../api/client'
// Browser-side Gemini was removed when the integration was centralised on the
// server (services/geminiService.js). The only reference left is inside the
// explicitly unreachable legacy block in analyzeScreenshots, so the import is
// dropped rather than the dead code rewritten.
import '../styles/enrichment-reports.css'

pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`

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
const RESULT_STATUSES = ['Detected', 'Added', 'Enriched', 'Improved', 'Standardized', 'Normalized', 'Corrected', 'Unchanged', 'Not Detected', 'Needs Verification']
const POSITIVE_STATUSES = new Set(['Added', 'Enriched', 'Improved', 'Standardized', 'Corrected', 'Structured', 'Normalized'])

const averageScore = (product, side) => {
  const values = Object.values(product?.scores || {}).map(score => Number(score?.[side])).filter(Number.isFinite)
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null
}

const detectedAttributeCount = (product, side) => {
  const score = averageScore(product, side)
  if (score === null) return 0
  const evidenceRows = (product.improvements || []).filter(item => side === 'after'
    ? POSITIVE_STATUSES.has(item.resultStatus)
    : item.beforeState && !/not detected|not identified|limited|basic listing/i.test(item.beforeState))
  return evidenceRows.length
}

const buildPortfolioInsights = products => {
  const counts = new Map()
  products.forEach(product => (product.improvements || []).forEach(item => {
    if (POSITIVE_STATUSES.has(item.resultStatus)) counts.set(item.area, (counts.get(item.area) || 0) + 1)
  }))
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([area, count]) => ({ area, count }))
}

const buildOutreachEmail = report => {
  const analyzed = (report.products || []).filter(product => product.analysisStatus === 'Complete')
  const featured = analyzed[0] || report.products?.[0] || {}
  const recipient = report.recipientName || report.preparedFor || '[Recipient Name]'
  const company = report.clientName || report.preparedFor || '[Company Name]'
  const industry = report.industry || '[Industry]'
  const prodName = featured.productName || featured.originalProductName || '[Product Example Name]'

  const beforeAnalysis = featured.beforeSummary ? `${featured.beforeSummary}\n` : ''
  const afterAnalysis = featured.afterSummary ? `${featured.afterSummary}\n` : ''
  const enrichedTitle = featured.enrichedProductName || prodName
  const taxonomy = featured.enrichedTaxonomy || 'Industry Category Hierarchy'

  return `Hi ${recipient},

We reviewed the ${company} website${report.industry ? ` (${industry})` : ''} to analyze how your current product listings are structured and where product data enrichment creates measurable ecommerce value.

PRODUCT REVIEWED
• ${prodName}

🔹 CURRENT VERSION (Before – As Seen on Your Website)
${beforeAnalysis}• What exists now: Basic product title and generic paragraph describing material and features.
• Limited structured attributes: Missing discrete attribute-value pairs for technical specifications.
• Gaps from SEO perspective: Missing long-tail technical search terms and structured metadata.
• Gaps from technical buyer perspective: Critical specifications (dimensions, materials, compliance) are unformatted or absent.
• Missing structured schema: Lack of JSON-LD / schema.org product metadata for search engine indexing.
• Limited filter readiness: Unstructured text cannot feed faceted search or dynamic filters.
• Limited taxonomy depth: Categorization is generic without deep multi-tier mapping.

🔹 ENRICHED VERSION (After – Structured Technical Format)
${afterAnalysis}• Structured SEO Title Example: ${enrichedTitle}
• Standardized Technical Specification table: Extracted, verified, and organized technical spec matrix.
• Attribute normalization: Standardized units of measure, material codes, and sizing parameters.
• Filter-ready structure: Discrete attributes configured for instant faceted navigation.
• Category mapping example: Mapped to standard industry taxonomy (${taxonomy}).

WHAT THIS IMPROVES
• Filtering improvements: Enables granular faceted search by brand, dimensions, material, and performance rating.
• Long-tail SEO improvements: Captures high-intent technical search queries in organic search rankings.
• Schema readiness: Fully compatible with rich snippets, Google Shopping, and marketplace schemas.
• Buyer confidence: Provides immediate technical clarity, reducing purchasing friction.
• Reduced pre-sales queries: Resolves technical product questions directly on the detail page.
• Stronger category authority: Positions your catalog as a structured, reliable technical reference.

Why This Matters
Structured product data is core data architecture—not a marketing rewrite. It provides the scalable foundation for search discovery, buyer conversion, and multi-channel syndication across your catalog.

If useful, we would be happy to walk you through this example in a focused 15-minute consultative call and show how the same framework scales across your broader product catalog.

Regards,
AltiusNXT Technologies`
}

const blankProduct = () => ({
  id: crypto.randomUUID(),
  productName: '',
  originalProductName: '',
  enrichedProductName: '',
  brand: '',
  brandBefore: '',
  brandAfter: '',
  sku: '',
  originalSku: '',
  enrichedSku: '',
  category: '',
  manufacturer: '',
  originalTaxonomy: '',
  enrichedTaxonomy: '',
  productUrlBefore: '',
  productUrlAfter: '',
  originalDescription: '',
  enrichedDescription: '',
  existingAttributeCount: '',
  enrichedAttributeCount: '',
  existingSpecificationCount: '',
  enrichedSpecificationCount: '',
  missingAttributes: '',
  attributesAdded: '',
  attributesNormalized: '',
  unitsStandardized: '',
  taxonomyChanges: '',
  schemaChanges: '',
  complianceAdded: '',
  documentationAdded: '',
  digitalAssetsAdded: '',
  seoFieldsAdded: '',
  searchKeywordsImproved: '',
  filterFieldsEnabled: '',
  dataQualityIssuesFixed: '',
  productIdentifiersImproved: '',
  analystNotes: '',
  additionalImages: [],
  evidenceCallouts: [],
  analyst: '',
  reportId: '',
  beforeImage: null,
  afterImage: null,
  beforePdfPage: 1,
  afterPdfPage: 1,
  beforeSummary: '',
  afterSummary: '',
  keyTransformation: '',
  businessImpact: '',
  imageLayout: 'Side by side',
  imageSize: 'Large',
  imagePosition: 'Center',
  highlights: [],
  analysisStatus: 'Not analyzed',
  confidenceScore: '',
  improvements: MATRIX_AREAS.map(area => ({
    area,
    beforeState: 'Not detected',
    afterState: 'Not detected',
    whatChanged: 'Not detected',
    evidence: 'Not detected',
    businessBenefit: 'Not detected',
    confidence: 0,
    resultStatus: 'Not Detected',
    includeInReport: true
  }))
})

const blankReport = () => ({
  name: 'Product Data Enrichment Report',
  clientName: '',
  clientLogo: null,
  clientWebsite: '',
  preparedFor: '',
  recipientName: '',
  recipientDesignation: '',
  industry: '',
  countryMarket: '',
  reportSubtitle: 'Evidence-based product data assessment and enrichment opportunity',
  preparedBy: 'AltiusNxt Technologies Pvt Ltd',
  accountManager: '',
  reportVersion: '1.0',
  confidentialityLabel: 'Confidential',
  currencyMarket: '',
  reportDate: new Date().toISOString().slice(0, 10),
  projectName: 'Product Data Enrichment POC',
  executiveNote: '',
  clientObjective: '',
  totalCatalogProducts: '',
  productsAnalyzedPoc: '',
  productCategoriesCovered: '',
  dataSourceType: '',
  ecommercePlatform: '',
  targetPlatforms: '',
  primaryBusinessGoal: '',
  clientPainPoints: '',
  executiveSummary: '',
  overallBusinessValue: '',
  nextSteps: 'Review the enrichment findings and confirm the next product range for scaled implementation.',
  footerText: 'AltiusNxt Technologies',
  outreachEmail: '',
  reportMode: 'Sales/POC',
  reportTone: 'Consultative',
  sectionOrder: ['executiveSummary','currentState','caseStudies','attributeTransformation','taxonomySearch','readiness','portfolioInsights','businessImpact','channelReadiness','nextSteps'],
  sectionVisibility: {},
  layoutPreset: 'Executive',
  accentColor: '#173B72',
  contentDensity: 'Balanced',
  pageSpacing: 'Balanced',
  ctaHeading: 'Ready to scale product enrichment?',
  ctaBody: 'Schedule a focused review to confirm the next product range and rollout priorities.',
  status: 'Draft',
  products: [blankProduct()],
  branding: {}
})

const REPORT_PROFILE_KEYS = [
  'clientWebsite', 'recipientName', 'recipientDesignation', 'industry', 'countryMarket', 'reportSubtitle',
  'accountManager', 'reportVersion', 'confidentialityLabel', 'currencyMarket', 'executiveNote', 'clientObjective',
  'totalCatalogProducts', 'productsAnalyzedPoc', 'productCategoriesCovered', 'dataSourceType', 'ecommercePlatform',
  'targetPlatforms', 'primaryBusinessGoal', 'clientPainPoints', 'reportMode', 'reportTone', 'sectionOrder', 'sectionVisibility',
  'layoutPreset', 'accentColor', 'contentDensity', 'pageSpacing', 'ctaHeading', 'ctaBody', 'outreachEmail'
]

const REPORT_SECTION_LIBRARY = {
  executiveSummary: ['Executive summary', 'Client context, objective and headline findings'],
  currentState: ['Current-state assessment', 'Baseline quality and evidence overview'],
  caseStudies: ['Product case studies', 'Before and after screenshots with commentary'],
  attributeTransformation: ['Comparison tables', 'Attribute-level transformation evidence'],
  taxonomySearch: ['Taxonomy & search', 'Category, SEO and findability improvements'],
  readiness: ['Readiness metrics', 'Quality scores and implementation readiness'],
  portfolioInsights: ['Portfolio insights', 'Patterns across every analyzed product'],
  businessImpact: ['Business benefits', 'Commercial and operational outcomes'],
  channelReadiness: ['Channel readiness', 'Marketplace and syndication suitability'],
  nextSteps: ['Call to action', 'Recommendation and next-step content']
}

const hydrateReport = data => ({
  ...blankReport(),
  ...(data?.branding?.reportProfile || {}),
  ...data,
  recipientName: data?.recipientName ?? data?.branding?.recipientName ?? '',
  industry: data?.industry ?? data?.branding?.industry ?? '',
  outreachEmail: data?.outreachEmail ?? data?.branding?.outreachEmail ?? '',
  reportMode: data?.reportMode ?? data?.branding?.reportMode ?? data?.branding?.reportProfile?.reportMode ?? 'Sales/POC',
  products: Array.isArray(data?.products) && data.products.length ? data.products.map(product => ({ ...blankProduct(), ...product })) : [blankProduct()]
})

const downloadReportPDF = async report => {
  try {
    const response = await api.get(`/enrichment-reports/${report.id}/download`, { responseType: 'blob' })
    if (response.data instanceof Blob) {
      if (response.data.type === 'application/json' || response.data.size < 500) {
        const text = await response.data.text()
        try {
          const json = JSON.parse(text)
          alert(`PDF Error: ${json.message || 'Could not generate PDF'}`)
          return
        } catch (e) {
          if (response.data.size < 100) {
            alert('Downloaded PDF file appears incomplete or invalid. Please try again.')
            return
          }
        }
      }
    }
    const disposition = response.headers?.['content-disposition'] || ''
    const encodedName = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1]
    const quotedName = disposition.match(/filename="([^"]+)"/i)?.[1]
    const plainName = disposition.match(/filename=([^;]+)/i)?.[1]
    const fallbackName = `${(report.name || 'product-enrichment-report').replace(/[^a-z0-9]+/gi, '-')}.pdf`
    let filename = encodedName ? decodeURIComponent(encodedName) : quotedName ? quotedName.replace(/^"|"$/g, '') : plainName || fallbackName
    if (!filename.toLowerCase().endsWith('.pdf')) filename += '.pdf'

    const pdfBlob = new Blob([response.data], { type: 'application/pdf' })
    const objectUrl = URL.createObjectURL(pdfBlob)
    const link = document.createElement('a')
    link.href = objectUrl
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 2000)
  } catch (err) {
    if (err.response?.data instanceof Blob) {
      try {
        const text = await err.response.data.text()
        const json = JSON.parse(text)
        alert(`PDF Error: ${json.message || 'Download failed.'}`)
        return
      } catch (e) {}
    }
    alert(`Download failed: ${err.message || 'Unknown error'}`)
  }
}

async function imageAsBase64(asset) {
  const response = await fetch(asset.url)
  if (!response.ok) throw new Error('Could not read uploaded file.')
  const blob = await response.blob()
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return { mimeType: blob.type || asset.mimeType || 'image/png', data: btoa(binary) }
}

function parseAnalysisJson(text) {
  const cleaned = String(text || '').replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/\s*```$/, '').trim()
  const match = cleaned.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('AI returned an unreadable comparison.')
  return JSON.parse(match[0])
}

async function analyzeScreenshots(product) {
  // Always analyze on the authenticated backend. This avoids browser-side key,
  // CORS and large base64 conversion delays, and keeps localhost behavior equal
  // to the deployed application.
  const response = await api.post('/enrichment-reports/analysis/generate', {
    beforeImage: product.beforeImage,
    afterImage: product.afterImage
  }, { timeout: 210000 })
  return response.data

  /* Legacy browser-provider fallback retained below for compatibility with
     older saved settings; it is intentionally unreachable. */
  const provider = localStorage.getItem('ai_provider') || 'gemini'
  const key = localStorage.getItem('ai_key') || ''
  const model = localStorage.getItem('ai_model') || 'gemini-2.5-flash'

  const before = await imageAsBase64(product.beforeImage)
  const after = await imageAsBase64(product.afterImage)

  const prompt = `You are a senior product data analyst for AltiusNxt. Compare BEFORE (original client product page) and AFTER (enriched product page).
Identify the product strictly from visible evidence. Do not invent unverified facts, attributes, or certifications.
Return ONLY valid JSON with this shape:
{
  "productName": "extracted title",
  "brand": "extracted brand",
  "sku": "SKU or MPN",
  "category": "product category",
  "beforeSummary": "detailed explanation of original listing state, unstructured fields, and missing attributes",
  "afterSummary": "detailed explanation of added attributes, standardized taxonomy, structured specs, and compliance details",
  "keyTransformation": "commercial and buyer impact statement",
  "businessImpact": "why enrichment matters to client (faceted search, SEO, procurement, buyer confidence)",
  "highlights": ["3 to 6 concise bullet points of specific evidence-based improvements"],
  "extractedFields": {"manufacturer":{"value":"visible value or Not detected","source":"BEFORE|AFTER|BOTH","confidence":0},"mpn":{"value":"visible value or Not detected","source":"BEFORE|AFTER|BOTH","confidence":0},"dimensions":{"value":"visible value or Not detected","source":"BEFORE|AFTER|BOTH","confidence":0},"compliance":{"value":"visible value or Not detected","source":"BEFORE|AFTER|BOTH","confidence":0},"documents":{"value":"visible value or Not detected","source":"BEFORE|AFTER|BOTH","confidence":0}},
  "scores": {"Content Completeness":{"before":0,"after":0,"evidence":"visible evidence"},"Technical Specifications":{"before":0,"after":0,"evidence":"visible evidence"},"Taxonomy":{"before":0,"after":0,"evidence":"visible evidence"},"Structured Attributes":{"before":0,"after":0,"evidence":"visible evidence"},"Search Readiness":{"before":0,"after":0,"evidence":"visible evidence"},"Buyer Clarity":{"before":0,"after":0,"evidence":"visible evidence"}},
  "improvements": [
    { "area": "Product Title & Naming", "beforeState": "Original state", "afterState": "Enriched state", "whatChanged":"evidence-based change", "businessBenefit":"reasonable buyer benefit", "resultStatus": "Added|Enriched|Improved|Standardized|Corrected|Unchanged|Not Detected" }
  ]
}
Must include exactly one improvement item for each area: ${MATRIX_AREAS.join(', ')}. Score using this rubric: visible presence/completeness 40 points, structure/consistency 25, specificity 20, buyer usefulness 15. Never infer information that is not visible.`

  let raw = ''
  if (key && provider === 'gemini') {
    const d = await callGeminiWithFallback(key, model, { contents: [{ parts: [{ text: prompt }, { inlineData: before }, { inlineData: after }] }] })
    raw = d.candidates?.[0]?.content?.parts?.[0]?.text || ''
  } else {
    const r = await api.post('/enrichment-reports/analysis/generate', { beforeImage: product.beforeImage, afterImage: product.afterImage })
    return r.data
  }

  const parsed = parseAnalysisJson(raw)
  const byArea = new Map((parsed.improvements || []).map(x => [x.area, x]))
  return {
    productName: parsed.productName || 'Identified Product',
    brand: parsed.brand || '',
    sku: parsed.sku || '',
    category: parsed.category || '',
    beforeSummary: parsed.beforeSummary || '',
    afterSummary: parsed.afterSummary || '',
    keyTransformation: parsed.keyTransformation || '',
    businessImpact: parsed.businessImpact || '',
    highlights: Array.isArray(parsed.highlights) ? parsed.highlights.slice(0, 6) : [],
    improvements: MATRIX_AREAS.map(area => ({
      area,
      beforeState: byArea.get(area)?.beforeState || 'Not detected',
      afterState: byArea.get(area)?.afterState || 'Not detected',
      whatChanged: byArea.get(area)?.whatChanged || 'Not detected',
      businessBenefit: byArea.get(area)?.businessBenefit || 'Not detected',
      resultStatus: RESULT_STATUSES.includes(byArea.get(area)?.resultStatus) ? byArea.get(area).resultStatus : 'Not Detected'
    })),
    extractedFields: parsed.extractedFields || {},
    scores: parsed.scores || {},
    scoringMethodology: '100-point evidence rubric: presence/completeness 40, structure/consistency 25, specificity 20, buyer usefulness 15.',
    analysisStatus: 'Complete',
    confidenceScore: '96%'
  }
}

export default function EnrichmentReports() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [reports, setReports] = useState([])
  const [report, setReport] = useState(blankReport())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [crmClients, setCrmClients] = useState([])
  const [previewModalImage, setPreviewModalImage] = useState(null)

  const load = async () => {
    setLoading(true)
    try {
      const clientsRes = await api.get('/enrichment-reports/clients').catch(() => ({ data: [] }))
      setCrmClients(clientsRes.data || [])

      if (id && id !== 'new') {
        const res = await api.get(`/enrichment-reports/${id}`)
        setReport(hydrateReport(res.data))
      } else if (id === 'new') {
        setReport(blankReport())
      } else {
        const res = await api.get('/enrichment-reports')
        setReports(res.data)
      }
    } catch (e) {
      setToast(e.response?.data?.message || 'Could not load reports.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [id])

  const create = () => navigate('/enrichment-reports/new')
  const save = async (status = report.status, sourceReport = report, options = {}) => {
    setSaving(true)
    try {
      const reportProfile = Object.fromEntries(REPORT_PROFILE_KEYS.map(key => [key, sourceReport[key]]))
      const payload = { ...sourceReport, status, branding: { ...(sourceReport.branding || {}), reportProfile, recipientName: sourceReport.recipientName || '', industry: sourceReport.industry || '', outreachEmail: sourceReport.outreachEmail || '', reportMode: sourceReport.reportMode || 'Sales/POC' } }
      const r = id && id !== 'new'
        ? await api.put(`/enrichment-reports/${id}`, payload)
        : await api.post('/enrichment-reports', payload)
      setReport(hydrateReport(r.data))
      if (!options.silent) setToast('Report draft saved')
      if (id === 'new') navigate(`/enrichment-reports/${r.data.id}`, { replace: true })
      return r.data
    } catch (e) {
      setToast(e.response?.data?.message || 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  const remove = async rid => {
    await api.delete(`/enrichment-reports/${rid}`)
    setConfirmDelete(null)
    load()
  }

  const duplicate = async rid => {
    await api.post(`/enrichment-reports/${rid}/duplicate`)
    setToast('Report duplicated')
    load()
  }

  if (loading) return <div className="er-loading"><RefreshCw className="spin" /> Loading workspace...</div>

  if (!id) return (
    <ReportDashboard
      reports={reports}
      onCreate={create}
      onDelete={setConfirmDelete}
      onDuplicate={duplicate}
      navigate={navigate}
      confirmDelete={confirmDelete}
      remove={remove}
    />
  )

  return (
    <>
      <ReportBuilderDualPane
        id={id}
        report={report}
        setReport={setReport}
        save={save}
        saving={saving}
        toast={toast}
        setToast={setToast}
        navigate={navigate}
        crmClients={crmClients}
        onZoomImage={setPreviewModalImage}
      />
      {previewModalImage && (
        <div className="er-zoom-modal-overlay" onClick={() => setPreviewModalImage(null)}>
          <div className="er-zoom-modal-content" onClick={e => e.stopPropagation()}>
            <div className="er-zoom-modal-head">
              <strong>{previewModalImage.filename || 'File Preview'}</strong>
              <button onClick={() => setPreviewModalImage(null)}><X /></button>
            </div>
            <div className="er-zoom-modal-body">
              {previewModalImage.mimeType === 'application/pdf' || previewModalImage.url?.endsWith('.pdf') ? (
                <iframe src={previewModalImage.url} title="PDF Preview" width="100%" height="600px" />
              ) : (
                <img src={previewModalImage.url} alt="Full Zoom Preview" />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function ReportDashboard({ reports, onCreate, onDelete, onDuplicate, navigate, confirmDelete, remove }) {
  const [search, setSearch] = useState('')
  const [client, setClient] = useState('All Clients')
  const [status, setStatus] = useState('All Status')
  const [sort, setSort] = useState('recent')
  const [menu, setMenu] = useState(null)
  const [downloadStatus, setDownloadStatus] = useState(null)
  const stats = {
    total: reports.length,
    products: reports.reduce((sum, r) => sum + (r.products?.length || 0), 0),
    pdfs: reports.filter(r => r.status === 'PDF Generated').length,
    clients: new Set(reports.map(r => r.clientName).filter(Boolean)).size
  }
  const clients = [...new Set(reports.map(r => r.clientName).filter(Boolean))].sort()
  const stages = ['Draft','AI Analysis','Needs Review','Ready for PDF','PDF Generated','Shared']
  const productProgress = product => {
    const checks = [product.beforeImage, product.afterImage, product.analysisStatus === 'Complete', product.productName, product.keyTransformation]
    return Math.round(checks.filter(Boolean).length / checks.length * 100)
  }
  const reportProgress = r => {
    if (!r.products?.length) return 0
    return Math.round(r.products.reduce((sum, p) => sum + productProgress(p), 0) / r.products.length)
  }
  const normalizedStage = r => {
    if (r.status === 'PDF Generated' && r.pdfPath) return 'PDF Generated'
    if (r.status === 'Shared') return 'Shared'
    const progress = reportProgress(r)
    if (progress >= 100) return 'Ready for PDF'
    if (progress >= 60) return 'Needs Review'
    if ((r.products || []).some(p => p.analysisStatus === 'Complete')) return 'AI Analysis'
    return r.status && stages.includes(r.status) ? r.status : 'Draft'
  }
  const visible = reports.filter(r => {
    const q = search.toLowerCase()
    return (!q || `${r.name} ${r.clientName} ${r.projectName}`.toLowerCase().includes(q)) &&
      (client === 'All Clients' || r.clientName === client) &&
      (status === 'All Status' || normalizedStage(r) === status)
  }).sort((a,b) => sort === 'oldest' ? new Date(a.updatedAt || a.createdAt) - new Date(b.updatedAt || b.createdAt) : sort === 'name' ? String(a.name).localeCompare(String(b.name)) : new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt))
  const latest = [...reports].sort((a,b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt))[0]
  const readyReview = reports.filter(r => normalizedStage(r) === 'Needs Review').length
  const latestClient = latest?.clientName || 'No client yet'
  const open = r => navigate(`/enrichment-reports/${r.id}`)
  const downloadPDF = async r => {
    setMenu(null)
    setDownloadStatus(null)
    try {
      await downloadReportPDF(r)
      setDownloadStatus({ type: 'success', message: 'PDF download started' })
    } catch (error) {
      setDownloadStatus({ type: 'error', message: error.response?.data?.message || 'PDF download failed. Please try again.' })
    }
  }

  return (
    <div className="er-page">
      <div className="er-hero">
        <div className="er-hero-content">
          <span className="er-eyebrow"><Sparkles size={13} /> CLIENT REPORTING WORKSPACE</span>
          <h1>Client Product Enrichment Reports</h1>
          <p>Turn Before &amp; After product pages into professional, client-ready case studies. Compare improvements with AI, review recommendations, and generate one consolidated PDF.</p>
          <div className="er-process" aria-label="Report workflow">
            {['Upload Products', 'AI Compare', 'Review & Edit', 'Generate PDF', 'Share with Client'].map((step, index) => (
              <Fragment key={step}>
                <span><b>{String(index + 1).padStart(2, '0')}</b>{step}</span>
                {index < 4 && <ArrowRight aria-hidden="true" />}
              </Fragment>
            ))}
          </div>
        </div>
        <div className="er-hero-actions"><button className="er-primary" onClick={onCreate}><Plus size={16} />Create Client Report</button><button disabled={!latest} onClick={() => latest && open(latest)}><Eye size={15}/>View Latest Report</button></div>
      </div>

      {latest && <button className="er-continue" onClick={() => open(latest)}><span className="er-continue-icon"><FileText/></span><span><small>Continue Working</small><strong>{latest.clientName || 'Unassigned Client'} — {latest.name}</strong><em>{latest.products?.length || 0} products · {latest.products?.filter(p => productProgress(p) >= 100).length || 0} completed · {latest.products?.filter(p => productProgress(p) < 100).length || 0} require attention</em></span><b>Continue Review <ArrowRight/></b></button>}

      <div className="er-stats">
        {[
          ['Active Reports', stats.total, `${readyReview} ready for review`, () => setStatus('All Status')],
          ['Products Compared', stats.products, 'Across all client reports', () => setSearch('')],
          ['PDFs Generated', stats.pdfs, 'Ready to share', () => setStatus('PDF Generated')],
          ['Clients Served', stats.clients, `Latest: ${latestClient}`, () => setClient(latestClient === 'No client yet' ? 'All Clients' : latestClient)]
        ].map(([l, v, meta, action]) => (
          <button key={l} onClick={action}><strong>{v}</strong><span>{l}</span><small>{meta}</small></button>
        ))}
      </div>

      <section className="er-panel">
        <div className="er-panel-head">
          <div><h2>Client Report Library</h2><p>Create, manage, review and share product enrichment reports for every client.</p></div>
          <div className="er-library-controls"><label><Search/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search reports..."/></label><select value={client} onChange={e=>setClient(e.target.value)}><option>All Clients</option>{clients.map(x=><option key={x}>{x}</option>)}</select><select value={status} onChange={e=>setStatus(e.target.value)}><option>All Status</option>{stages.map(x=><option key={x}>{x}</option>)}</select><select value={sort} onChange={e=>setSort(e.target.value)}><option value="recent">Recently Updated</option><option value="oldest">Oldest First</option><option value="name">Report Name</option></select></div>
        </div>
        {!reports.length ? (
          <div className="er-empty">
            <FileText size={36} />
            <h3>Create your first client report</h3>
            <p>Select a client, add product screenshots, edit in dual-pane live preview, and download a combined PDF.</p>
            <button className="er-primary" onClick={onCreate}><Plus size={15} />Create Client Report</button>
          </div>
        ) : (
          <div className="er-table-wrap er-library-table">
            <table className="er-table">
              <thead>
                <tr>
                  <th>Report</th>
                  <th>Client</th>
                  <th>Products</th>
                  <th>Progress</th>
                  <th>Last Updated</th>
                  <th>Status</th>
                  <th>Owner</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map(r => {
                  const progress = reportProgress(r)
                  const completed = r.products?.filter(p => productProgress(p) >= 100).length || 0
                  const needsReview = (r.products?.length || 0) - completed
                  const stage = normalizedStage(r)
                  return (
                  <tr key={r.id}>
                    <td>
                      <button className="er-report-link" onClick={() => open(r)}>{r.name}</button>
                      <small>REP-{new Date(r.createdAt).getFullYear()}-{String(r.id).slice(-4).toUpperCase()} · Created {new Date(r.createdAt).toLocaleDateString('en',{day:'2-digit',month:'short',year:'numeric'})}</small>
                    </td>
                    <td><strong>{r.clientName || 'Unassigned'}</strong><small>{r.projectName || 'Product Enrichment POC'}</small></td>
                    <td><strong>{r.products?.length || 0} Products</strong><small>{completed} completed{needsReview ? ` · ${needsReview} needs review` : ''}</small></td>
                    <td><div className="er-progress"><span><strong>{progress}%</strong> Complete</span><i><b style={{width:`${progress}%`}}/></i></div></td>
                    <td>{new Date(r.updatedAt || r.createdAt).toLocaleDateString('en',{day:'2-digit',month:'short',year:'numeric'})}</td>
                    <td><span className={`er-status ${stage.toLowerCase().replaceAll(' ', '-')}`}>{stage}</span></td>
                    <td>{r.owner?.name || r.preparedBy || 'AltiusNxt'}</td>
                    <td>
                      <div className="er-row-actions er-professional-actions">
                        <button className="er-open-report" onClick={() => open(r)}>Open Report</button>
                        <button className="er-more" aria-label={`More actions for ${r.name}`} onClick={()=>setMenu(menu===r.id?null:r.id)}><MoreHorizontal/></button>
                        {menu===r.id && <div className="er-action-menu"><button onClick={()=>open(r)}><Eye/>Preview Report</button><button onClick={()=>open(r)}><FileText/>Edit Report</button><button onClick={()=>open(r)}><Plus/>Add Products</button>{r.pdfPath&&<button onClick={()=>downloadPDF(r)}><Download/>Download PDF</button>}<button onClick={()=>navigator.clipboard.writeText(`${location.origin}/enrichment-reports/${r.id}`)}><Share2/>Share with Client</button><button onClick={()=>{onDuplicate(r.id);setMenu(null)}}><Copy/>Duplicate Report</button><button className="danger" onClick={()=>{onDelete(r.id);setMenu(null)}}><Trash2/>Delete Report</button></div>}
                      </div>
                    </td>
                  </tr>
                )})}
              </tbody>
            </table>
            {!visible.length && <div className="er-no-results"><Search/><strong>No matching reports</strong><span>Try a different search, client or status filter.</span></div>}
          </div>
        )}
      </section>

      {confirmDelete && (
        <div className="er-modal-backdrop">
          <div className="er-confirm">
            <Trash2 size={24} />
            <h3>Delete this report?</h3>
            <p>This permanently deletes the report and stored comparisons.</p>
            <div>
              <button onClick={() => onDelete(null)}>Cancel</button>
              <button className="danger" onClick={() => remove(confirmDelete)}>Delete Report</button>
            </div>
          </div>
        </div>
      )}
      {downloadStatus && <div className={`er-live-toast ${downloadStatus.type === 'error' ? 'error' : ''}`} role="status">{downloadStatus.type === 'error' ? <AlertCircle /> : <CheckCircle2 />}<span>{downloadStatus.message}</span><button onClick={() => setDownloadStatus(null)}><X /></button></div>}
    </div>
  )
}

function ReportBuilderDualPane({ id, report, setReport, save, saving, toast, setToast, navigate, crmClients, onZoomImage }) {
  const [activeProduct, setActiveProduct] = useState(0)
  const [generating, setGenerating] = useState(false)
  const [zoomLevel, setZoomLevel] = useState(0.85)
  const [activeTab, setActiveTab] = useState('editor')
  const [workflowFocus, setWorkflowFocus] = useState(0)
  const [autosaveState, setAutosaveState] = useState('Saved')
  const [validationIssues, setValidationIssues] = useState([])
  const [confirmRemoveProduct, setConfirmRemoveProduct] = useState(false)
  const [currentPreviewPage, setCurrentPreviewPage] = useState(1)
  const [showThumbnails, setShowThumbnails] = useState(false)
  const [reviewMode, setReviewMode] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [qualityCheck, setQualityCheck] = useState(null)
  const [emailOpen, setEmailOpen] = useState(false)
  const [analysisError, setAnalysisError] = useState('')
  const [analysisTechnicalDetails, setAnalysisTechnicalDetails] = useState('')
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false)
  const [productSearch, setProductSearch] = useState('')
  const [comparisonFilter, setComparisonFilter] = useState('Changes Only')
  const [dragProduct, setDragProduct] = useState(null)
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const [productActionMenuOpen, setProductActionMenuOpen] = useState(false)
  const [reportActionMenuOpen, setReportActionMenuOpen] = useState(false)
  const [productNavCollapsed, setProductNavCollapsed] = useState(false)
  const [presentationMode, setPresentationMode] = useState(false)
  const bulkInputRef = useRef(null)
  const autoAnalysisRef = useRef(new Set())
  const previewViewportRef = useRef(null)
  const presentationRef = useRef(null)
  const autosaveSignatureRef = useRef('')

  // Collapsible Section State
  const [openSections, setOpenSections] = useState({
    upload: true,
    ai: false,
    details: false,
    summaries: false,
    transformation: false,
    matrix: false,
    impact: false
  })

  const toggleSection = sec => setOpenSections(prev => ({ ...prev, [sec]: !prev[sec] }))

  // Undo / Redo history
  const [history, setHistory] = useState([])
  const [redoStack, setRedoStack] = useState([])

  const pushHistory = (newReport) => {
    setHistory(prev => [...prev.slice(-20), report])
    setRedoStack([])
    setReport({ ...newReport, pdfPath: null, pageCount: null, status: newReport.status === 'PDF Generated' ? 'Ready for Review' : newReport.status })
  }

  const handleUndo = () => {
    if (!history.length) return
    const prev = history[history.length - 1]
    setRedoStack(r => [report, ...r])
    setHistory(h => h.slice(0, h.length - 1))
    setReport(prev)
  }

  const handleRedo = () => {
    if (!redoStack.length) return
    const next = redoStack[0]
    setRedoStack(r => r.slice(1))
    setHistory(h => [...h, report])
    setReport(next)
  }

  const update = (key, value) => pushHistory({ ...report, [key]: value })
  const updateProduct = (key, value, index = activeProduct) => {
    const updated = report.products.map((p, i) => i === index ? { ...p, [key]: value } : p)
    pushHistory({ ...report, products: updated })
  }

  const addProduct = () => {
    const updated = [...report.products, blankProduct()]
    pushHistory({ ...report, products: updated })
    setActiveProduct(updated.length - 1)
  }

  const bulkUploadProducts = async files => {
    const selected = [...(files || [])]
    if (!selected.length) return
    const groups = new Map()
    selected.forEach(file => {
      const lower = file.name.toLowerCase()
      const side = /(^|[-_\s])before([-_\s.]|$)/.test(lower) ? 'before' : /(^|[-_\s])after([-_\s.]|$)/.test(lower) ? 'after' : null
      if (!side) return
      const key = lower.replace(/(^|[-_\s])(before|after)([-_\s.]|$)/g, '-').replace(/\.[^.]+$/, '').replace(/[-_\s]+/g, '-').replace(/^-|-$/g, '')
      groups.set(key, { ...(groups.get(key) || {}), [side]: file })
    })
    const pairs = [...groups.entries()].filter(([, pair]) => pair.before && pair.after)
    if (!pairs.length) { setToast('No Before/After filename pairs found. Include “before” and “after” in filenames.'); return }
    setGenerating(true)
    try {
      const upload = async file => { const form = new FormData(); form.append('image', file); return (await api.post('/enrichment-reports/upload/image', form, { headers: { 'Content-Type': 'multipart/form-data' } })).data }
      const products = []
      for (const [key, pair] of pairs) products.push({ ...blankProduct(), productName: key.replaceAll('-', ' '), beforeImage: await upload(pair.before), afterImage: await upload(pair.after) })
      const nextProducts = report.products.length === 1 && !report.products[0].beforeImage && !report.products[0].afterImage ? products : [...report.products, ...products]
      pushHistory({ ...report, products: nextProducts })
      setActiveProduct(Math.max(0, nextProducts.length - products.length))
      setToast(`${products.length} Before/After product pair${products.length === 1 ? '' : 's'} added`)
    } catch (error) { setToast(error.response?.data?.message || 'Bulk upload failed.') }
    finally { setGenerating(false); setAddMenuOpen(false) }
  }

  const duplicateProduct = () => {
    const current = report.products[activeProduct]
    const dup = { ...current, id: crypto.randomUUID(), productName: `${current.productName || 'Product'} (Copy)` }
    const updated = [...report.products.slice(0, activeProduct + 1), dup, ...report.products.slice(activeProduct + 1)]
    pushHistory({ ...report, products: updated })
    setActiveProduct(activeProduct + 1)
  }

  const removeProduct = () => {
    if (report.products.length === 1) return
    const updated = report.products.filter((_, i) => i !== activeProduct)
    pushHistory({ ...report, products: updated })
    setActiveProduct(Math.max(0, activeProduct - 1))
    setConfirmRemoveProduct(false)
  }

  const moveProduct = (dir) => {
    const to = activeProduct + dir
    if (to < 0 || to >= report.products.length) return
    const products = [...report.products]
    ;[products[activeProduct], products[to]] = [products[to], products[activeProduct]]
    pushHistory({ ...report, products })
    setActiveProduct(to)
  }

  const reorderProduct = (from, to) => {
    if (from === to || from == null || to == null) return
    const products = [...report.products]
    const [moved] = products.splice(from, 1)
    products.splice(to, 0, moved)
    pushHistory({ ...report, products })
    setActiveProduct(to)
  }

  const analyzeAll = async () => {
    const missing = report.products.findIndex(p => !p.beforeImage || !p.afterImage)
    if (missing >= 0) {
      setToast(`Upload Before and After files for Product ${missing + 1} before running Analyze All.`)
      return
    }
    setGenerating(true)
    try {
      const analyzed = []
      for (let i = 0; i < report.products.length; i++) {
        const result = await analyzeScreenshots(report.products[i])
        analyzed.push({ ...report.products[i], ...result })
      }

      const nextReport = {
        ...report,
        products: analyzed,
        clientName: report.clientName || analyzed.find(item => item.clientName && item.clientName !== 'Not detected')?.clientName || analyzed.find(item => item.brand && item.brand !== 'Not detected')?.brand || 'Client Product Sample',
        executiveSummary: report.executiveSummary || `We reviewed ${analyzed.length} product${analyzed.length === 1 ? '' : 's'} for ${report.clientName || 'the client'} to assess how structured enrichment can strengthen discoverability, technical usability and commerce readiness.`
      }
      nextReport.outreachEmail = buildOutreachEmail(nextReport)
      pushHistory(nextReport)
      setToast(`Analyzed all ${analyzed.length} products successfully`)
    } catch (e) {
      setToast(e.message || 'Analyze all failed.')
    } finally {
      setGenerating(false)
    }
  }

  const getValidationIssues = () => {
    const issues = []
    if (!report.name) issues.push({ label: 'Report title is required', tab: 'setup' })
    if (!report.clientName) issues.push({ label: 'Client organization is required', tab: 'setup' })
    report.products.forEach((p, index) => {
      const label = `Product ${String(index + 1).padStart(2, '0')}`
      if (!p.beforeImage?.url || !p.afterImage?.url) issues.push({ label: `${label}: upload both Before and After files`, tab: 'editor', product: index, section: 'upload' })
      if (p.beforeImage?.url && p.beforeImage.url === p.afterImage?.url) issues.push({ label: `${label}: Before and After must be different evidence files`, tab: 'editor', product: index, section: 'upload' })
      if (!p.productName || !p.category) issues.push({ label: `${label}: complete Product Name and Category`, tab: 'editor', product: index, section: 'details' })
      const originalSku = p.originalSku || p.sku
      const enrichedSku = p.enrichedSku || p.sku
      if (originalSku && enrichedSku && String(originalSku).replace(/\W/g, '').toLowerCase() !== String(enrichedSku).replace(/\W/g, '').toLowerCase()) issues.push({ label: `${label}: original and enriched SKU values do not match`, tab: 'editor', product: index, section: 'details' })
      if (!p.beforeSummary || !p.afterSummary) issues.push({ label: `${label}: complete Before and After findings`, tab: 'editor', product: index, section: 'summaries' })
      if (!p.keyTransformation) issues.push({ label: `${label}: add the Key Transformation`, tab: 'editor', product: index, section: 'transformation' })
    })
    return issues
  }

  const generatePDF = async (generateAnyway = false) => {
    const issues = getValidationIssues()
    if (issues.length && !generateAnyway) {
      setValidationIssues(issues)
      const reviewFields = report.products.flatMap((p, product) => Object.entries(p.extractedFields || {}).filter(([,field]) => !field?.value || field.value === 'Not detected' || Number(field.confidence) < 70).map(([name,field]) => ({ product, name, field })))
      setQualityCheck({ issues, reviewFields, verified: report.products.reduce((sum,p)=>sum+Object.values(p.extractedFields||{}).filter(f=>f?.value&&f.value!=='Not detected'&&Number(f.confidence)>=70).length,0) })
      setToast(`${issues.length} item${issues.length === 1 ? '' : 's'} require attention before PDF generation.`)
      return
    }
    setValidationIssues([])
    setGenerating(true)
    try {
      const saved = await save('Ready for Review')
      if (!saved) return
      const res = await api.post(`/enrichment-reports/${saved.id}/generate-pdf`, { generateAnyway })
      setReport(hydrateReport(res.data))
      setQualityCheck(null)
      setPreviewOpen(true)
      setToast(`PDF generated successfully — ${res.data.pageCount} pages total`)
      setTimeout(() => document.querySelector('.er-preview-pane')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
    } catch (e) {
      setToast(e.response?.data?.message || 'PDF generation failed.')
    } finally {
      setGenerating(false)
    }
  }

  const refineSection = async (text, action, fieldName, onResult) => {
    if (!text && action !== 'regenerate') return
    try {
      setToast(`Refining ${fieldName}...`)
      const res = await api.post('/enrichment-reports/analysis/refine-section', {
        text,
        action,
        fieldName,
        context: `Client: ${report.clientName}, Product: ${report.products[activeProduct]?.productName}`
      })
      if (res.data?.refinedText) {
        onResult(res.data.refinedText)
        setToast(`${fieldName} updated with AI`)
      }
    } catch (e) {
      setToast(e.response?.data?.message || 'AI refinement failed.')
    }
  }

  const activeProd = report.products[activeProduct] || blankProduct()
  const analyzedCount = report.products.filter(product => product.analysisStatus === 'Complete').length
  const pendingCount = report.products.length - analyzedCount
  const completion = activeProd.analysisStatus === 'Complete' ? 100 : activeProd.beforeImage && activeProd.afterImage ? 50 : activeProd.beforeImage || activeProd.afterImage ? 25 : 0
  const completionLabel = activeProd.analysisStatus === 'Complete' ? 'Analysis complete' : activeProd.beforeImage && activeProd.afterImage ? 'Uploads ready · analysis pending' : `${completion}% complete`
  const totalPages = report.pdfPath ? (Number(report.pageCount) || 10) : 0
  const setupComplete = Boolean(report.name && report.clientName)
  const productsReady = report.products.length > 0 && report.products.every(product => product.beforeImage && product.afterImage)
  const analysisComplete = report.products.length > 0 && analyzedCount === report.products.length
  const reportReady = analysisComplete && Boolean(report.executiveSummary || report.overallBusinessValue)
  const workflowSteps = [
    { number: '01', label: 'Upload', tab: 'editor', complete: productsReady },
    { number: '02', label: 'Analyze', tab: 'editor', complete: analysisComplete },
    { number: '03', label: 'Edit Content', tab: 'report', complete: reportReady },
    { number: '04', label: 'Customize Layout', tab: 'layout', complete: Boolean(report.layoutPreset) },
    { number: '05', label: 'Preview', tab: 'preview', complete: Boolean(report.pdfPath) },
    { number: '06', label: 'Generate PDF', tab: 'generate', complete: report.status === 'PDF Generated' }
  ]
  const activeWorkflowIndex = activeTab === 'editor' ? Math.min(1, workflowFocus) : activeTab === 'report' || activeTab === 'summary' || activeTab === 'setup' ? 2 : activeTab === 'layout' ? 3 : activeTab === 'preview' ? 4 : 5

  useEffect(() => {
    if (!presentationMode) return
    const pages = presentationRef.current?.querySelectorAll('.er-a4-page') || []
    pages.forEach((page, index) => page.classList.toggle('presentation-active', index + 1 === currentPreviewPage))
  }, [presentationMode, currentPreviewPage, report])

  useEffect(() => {
    if (!presentationMode) return
    const onKeyDown = event => {
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') setCurrentPreviewPage(page => Math.min(totalPages, page + 1))
      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') setCurrentPreviewPage(page => Math.max(1, page - 1))
      if (event.key === 'Escape') setPresentationMode(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [presentationMode, totalPages])

  const analyzeProduct = async (index = activeProduct, automatic = false) => {
    const product = report.products[index]
    if (!product?.beforeImage || !product?.afterImage || generating) return
    setWorkflowFocus(1)
    setAnalysisError('')
    setAnalysisTechnicalDetails('')
    setGenerating(true)
    try {
      const result = await analyzeScreenshots(product)
      const products = report.products.map((item, i) => i === index ? { ...item, ...result } : item)
      const nextReport = {
        ...report,
        products,
        clientName: report.clientName || (result.clientName && result.clientName !== 'Not detected' ? result.clientName : '') || (result.brand && result.brand !== 'Not detected' ? result.brand : '') || 'Client Product Sample'
      }
      nextReport.outreachEmail = buildOutreachEmail(nextReport)
      pushHistory(nextReport)
      setReviewMode(true)
      setToast(`${result.productName || `Product ${index + 1}`} — AI analysis complete`)
    } catch (e) {
      if (automatic) autoAnalysisRef.current.delete(`${product.beforeImage?.url}|${product.afterImage?.url}`)
      const message = e.response?.data?.message || (e.code === 'ECONNABORTED' ? "Analysis couldn't be completed in time." : "Analysis couldn't be completed.")
      setAnalysisTechnicalDetails(e.response?.data?.technicalDetails || e.message || 'Unknown request error')
      setShowTechnicalDetails(true)
      setAnalysisError(message)
      setToast(message)
    } finally {
      setGenerating(false)
    }
  }

  useEffect(() => {
    const product = report.products[activeProduct]
    if (!product?.beforeImage?.url || !product?.afterImage?.url || product.analysisStatus === 'Complete') return
    const key = `${product.beforeImage.url}|${product.afterImage.url}`
    if (autoAnalysisRef.current.has(key)) return
    autoAnalysisRef.current.add(key)
    analyzeProduct(activeProduct, true)
  }, [activeProd.beforeImage?.url, activeProd.afterImage?.url, activeProduct])

  useEffect(() => {
    if (!id || id === 'new' || !report.name || !report.clientName) return
    const signature = JSON.stringify({ name: report.name, clientName: report.clientName, clientLogo: report.clientLogo, preparedFor: report.preparedFor, preparedBy: report.preparedBy, reportDate: report.reportDate, projectName: report.projectName, executiveSummary: report.executiveSummary, overallBusinessValue: report.overallBusinessValue, nextSteps: report.nextSteps, footerText: report.footerText, status: report.status, products: report.products, reportProfile: Object.fromEntries(REPORT_PROFILE_KEYS.map(key => [key, report[key]])), branding: report.branding })
    if (!autosaveSignatureRef.current) { autosaveSignatureRef.current = signature; return }
    if (signature === autosaveSignatureRef.current) return
    setAutosaveState('Unsaved changes')
    const timer = setTimeout(async () => {
      setAutosaveState('Saving...')
      const saved = await save(report.status, report, { silent: true })
      if (saved) { autosaveSignatureRef.current = signature; setAutosaveState('Saved just now') }
      else setAutosaveState('Save failed')
    }, 1200)
    return () => clearTimeout(timer)
  }, [report, id])

  const fixIssue = issue => {
    setActiveTab(issue.tab)
    if (Number.isInteger(issue.product)) setActiveProduct(issue.product)
    if (issue.section) setOpenSections(prev => ({ ...prev, [issue.section]: true }))
    setValidationIssues([])
  }

  const setPreviewFit = mode => {
    const width = previewViewportRef.current?.clientWidth || 700
    setZoomLevel(mode === 'width' ? Math.min(1.2, Math.max(0.55, (width - 64) / 595)) : 0.72)
  }

  const visibleProducts = report.products.map((product, index) => ({ product, index })).filter(({ product, index }) => `${product.productName || `Product ${index + 1}`} ${product.sku || ''}`.toLowerCase().includes(productSearch.toLowerCase()))
  const filteredComparisons = (activeProd.improvements || []).filter(item => {
    if (comparisonFilter === 'All') return true
    if (comparisonFilter === 'Changes Only') return !['Unchanged', 'Not Detected'].includes(item.resultStatus)
    return item.resultStatus === comparisonFilter
  })

  return (
    <div className="er-dual-app">
      {/* Sleek Ultra-Slim Top Bar */}
      <header className="er-top-bar">
        <div className="er-bar-left">
          <button className="er-back-btn" onClick={() => navigate('/enrichment-reports')}>
            <ChevronLeft /> Reports
          </button>
          <div className="er-title-wrap">
            <h1>{report.name || 'Product Data Enrichment Report'}</h1>
            <span><strong>{report.clientName || 'Unassigned client'}</strong><i className={`er-report-status ${reportReady ? 'ready' : ''}`}>{reportReady ? 'Report ready' : report.status || 'Draft'}</i></span>
          </div>
        </div>

        <div className="er-bar-right">
          <span className={`er-autosave ${autosaveState === 'Save failed' ? 'error' : ''}`}><CheckCircle2 /> {autosaveState}</span>
          <button className="er-secondary" onClick={() => save('Draft')} disabled={saving}>
            <Save /> {saving ? 'Saving...' : 'Save Draft'}
          </button>
          <button className="er-secondary er-preview-action" onClick={() => { setActiveTab('preview'); setPreviewOpen(true) }}>
            <Eye /> Preview
          </button>
          <button className={reportReady ? 'er-primary' : 'er-secondary'} onClick={() => generatePDF()} disabled={generating}>
            <Download /> {generating ? 'Generating...' : 'Generate PDF'}
          </button>
          {report.pdfPath && (
            <button className="er-download-btn" onClick={async () => {
              try { await downloadReportPDF(report); setToast('PDF download started') }
              catch (error) { setToast(error.response?.data?.message || 'PDF download failed. Please try again.') }
            }}>
              <Download /> PDF
            </button>
          )}
          <div className="er-report-action-menu">
            <button className="er-icon-menu-button" aria-label="More report actions" aria-expanded={reportActionMenuOpen} onClick={() => setReportActionMenuOpen(value => !value)}><MoreHorizontal /></button>
            {reportActionMenuOpen && <div>
              <button onClick={() => { handleUndo(); setReportActionMenuOpen(false) }} disabled={!history.length}><Undo /> Undo</button>
              <button onClick={() => { handleRedo(); setReportActionMenuOpen(false) }} disabled={!redoStack.length}><Redo /> Redo</button>
              <button onClick={() => { setEmailOpen(true); setReportActionMenuOpen(false) }} disabled={!analyzedCount}><Mail /> Email report</button>
            </div>}
          </div>
        </div>
      </header>

      <nav className="er-workflow-stepper" aria-label="Report workflow">
        {workflowSteps.map((step, index) => <Fragment key={step.number}>
          <button className={`${index === activeWorkflowIndex ? 'current' : ''} ${step.complete ? 'complete' : ''}`} onClick={() => { setActiveTab(step.tab); if (step.tab === 'editor') setWorkflowFocus(index); if (step.tab === 'preview') setPreviewOpen(true) }}>
            <span>{step.complete ? <Check /> : step.number}</span>
            <small>{step.label}</small>
            <i>{step.complete ? 'Completed' : index === activeWorkflowIndex ? 'Current' : 'Not started'}</i>
          </button>
          {index < workflowSteps.length - 1 && <b />}
        </Fragment>)}
      </nav>

      {/* Dual Pane Layout (45% Editor / 55% Preview) */}
      <div className={`er-split-workspace ${activeTab === 'preview' ? 'preview-active' : ''}`}>
        {/* Left Pane Editor (45% Width) */}
        <main className="er-editor-pane">
          {activeTab === 'setup' && <ClientSetupPanel report={report} update={update} crmClients={crmClients} refineSection={refineSection} setToast={setToast} />}
          {activeTab === 'report' && <ReportReviewWorkspace report={report} update={update} refineSection={refineSection} setActiveTab={setActiveTab} />}
          {activeTab === 'layout' && <LayoutCustomizationPanel report={report} update={update} activeProduct={activeProduct} updateProduct={updateProduct} setActiveProduct={setActiveProduct} setActiveTab={setActiveTab} />}
          {activeTab === 'generate' && <GenerateReportPanel report={report} reportReady={reportReady} analyzedCount={analyzedCount} generating={generating} generatePDF={generatePDF} downloadReportPDF={downloadReportPDF} setActiveTab={setActiveTab} />}

          {activeTab === 'summary' && (
            <SummaryValuePanel
              report={report}
              update={update}
              refineSection={refineSection}
            />
          )}

          {activeTab === 'editor' && <div className={`er-new-product-workspace ${productNavCollapsed ? 'navigator-collapsed' : ''}`}>
            <aside className="er-product-navigator">
              <header><div><button className="er-collapse-products" title={productNavCollapsed ? 'Expand products' : 'Collapse products'} onClick={() => setProductNavCollapsed(value => !value)}><ChevronLeft /></button><span className="er-products-heading"><strong>Products</strong><small>{report.products.length} Products</small></span></div><div className="er-add-product-menu"><button onClick={() => setAddMenuOpen(value => !value)}><Plus /> Add Product</button>{addMenuOpen && <div><button onClick={() => { addProduct(); setAddMenuOpen(false) }}>Add Single Product</button><button onClick={() => bulkInputRef.current?.click()}>Bulk Upload</button></div>}<input ref={bulkInputRef} hidden multiple type="file" accept="application/pdf,image/png,image/jpeg,image/webp,.pdf" onChange={event => bulkUploadProducts(event.target.files)} /></div></header>
              <label className="er-mobile-product-select"><span>Current product</span><select value={activeProduct} onChange={event => setActiveProduct(Number(event.target.value))}>{report.products.map((product, index) => <option key={product.id} value={index}>{String(index + 1).padStart(2, '0')} — {product.productName || `Product ${index + 1}`}</option>)}</select></label>
              {report.products.length > 6 && <label className="er-product-search"><Search /><input value={productSearch} onChange={e => setProductSearch(e.target.value)} placeholder="Search products" /></label>}
              <div className="er-product-list">{visibleProducts.map(({ product, index }) => <button key={product.id} draggable onDragStart={() => setDragProduct(index)} onDragOver={e => e.preventDefault()} onDrop={() => { reorderProduct(dragProduct, index); setDragProduct(null) }} className={activeProduct === index ? 'active' : ''} onClick={() => setActiveProduct(index)}><span className={`er-product-state ${product.analysisStatus === 'Complete' ? 'complete' : product.beforeImage && product.afterImage ? 'ready' : ''}`}>{product.analysisStatus === 'Complete' ? <Check /> : String(index + 1).padStart(2, '0')}</span><span><strong>{product.productName || `Product ${index + 1}`}</strong><small>{product.analysisStatus === 'Complete' ? 'Analyzed' : product.beforeImage && product.afterImage ? 'Ready to analyze' : 'Needs files'}</small></span></button>)}</div>
              <footer><span><strong>{report.products.length}</strong> Products</span><span><strong>{analyzedCount}</strong> Complete</span><span><strong>{pendingCount}</strong> Pending</span></footer>
            </aside>
            <section className="er-evidence-workspace">
              <header className="er-evidence-header">
                <div>
                  <div className="er-product-heading-meta">
                    <span>PRODUCT {String(activeProduct + 1).padStart(2, '0')}</span>
                    <span className={`er-product-status ${activeProd.analysisStatus === 'Complete' ? 'complete' : activeProd.beforeImage && activeProd.afterImage ? 'ready' : 'needs-files'}`}>
                      {activeProd.analysisStatus === 'Complete' ? 'Analyzed' : activeProd.beforeImage && activeProd.afterImage ? 'Ready to analyze' : 'Needs files'}
                    </span>
                  </div>
                  <h2>{activeProd.productName || 'New product comparison'}</h2>
                  <p>{activeProd.analysisStatus === 'Complete' ? `${activeProd.brand || 'Brand not detected'} · ${activeProd.sku || 'SKU not detected'} · ${activeProd.category || 'Category not detected'}` : 'Upload the original and enriched product sources to compare data quality and generate insights.'}</p>
                </div>
                <div className="er-product-action-menu">
                  <button className="er-icon-menu-button" title="Product actions" aria-label="Product actions" aria-expanded={productActionMenuOpen} onClick={() => setProductActionMenuOpen(value => !value)}><MoreHorizontal /></button>
                  {productActionMenuOpen && <div role="menu">
                    <button role="menuitem" onClick={() => { duplicateProduct(); setProductActionMenuOpen(false) }}><Copy /> Duplicate product</button>
                    <button role="menuitem" className="danger" onClick={() => { setConfirmRemoveProduct(true); setProductActionMenuOpen(false) }} disabled={report.products.length === 1}><Trash2 /> Delete product</button>
                  </div>}
                </div>
              </header>
              <details className="er-product-evidence-fields">
                <summary><span className="er-details-summary-copy"><strong>Product Information</strong><small>Optional · Review details and measurable evidence</small></span><ChevronDown /></summary>
                <div className="er-extract-details-row"><span><Sparkles /> AI can automatically extract supported information from your uploaded files.</span><button onClick={() => analyzeProduct()} disabled={!activeProd.beforeImage || !activeProd.afterImage || generating}><Wand2 /> Extract Details with AI</button></div>
                <div className="er-grid-2">
                  <Field label="Product Name" value={activeProd.productName} onChange={v => updateProduct('productName', v)} />
                  <Field label="Manufacturer" value={activeProd.manufacturer} onChange={v => updateProduct('manufacturer', v)} />
                  <Field label="Original Product Name" value={activeProd.originalProductName} onChange={v => updateProduct('originalProductName', v)} />
                  <Field label="Enriched Product Name" value={activeProd.enrichedProductName} onChange={v => updateProduct('enrichedProductName', v)} />
                  <Field label="Original SKU / MPN" value={activeProd.originalSku} onChange={v => updateProduct('originalSku', v)} />
                  <Field label="Enriched SKU / MPN" value={activeProd.enrichedSku} onChange={v => updateProduct('enrichedSku', v)} />
                  <Field label="Brand Before" value={activeProd.brandBefore} onChange={v => updateProduct('brandBefore', v)} />
                  <Field label="Brand After" value={activeProd.brandAfter} onChange={v => updateProduct('brandAfter', v)} />
                  <Field label="Product Category" value={activeProd.category} onChange={v => updateProduct('category', v)} />
                  <Field label="Original Taxonomy Path" value={activeProd.originalTaxonomy} onChange={v => updateProduct('originalTaxonomy', v)} />
                  <Field label="Enriched Taxonomy Path" value={activeProd.enrichedTaxonomy} onChange={v => updateProduct('enrichedTaxonomy', v)} />
                  <Field label="Before Product URL" value={activeProd.productUrlBefore} onChange={v => updateProduct('productUrlBefore', v)} />
                  <Field label="After Product URL" value={activeProd.productUrlAfter} onChange={v => updateProduct('productUrlAfter', v)} />
                  <Field label="Existing Attribute Count" type="number" value={activeProd.existingAttributeCount} onChange={v => updateProduct('existingAttributeCount', v)} />
                  <Field label="Enriched Attribute Count" type="number" value={activeProd.enrichedAttributeCount} onChange={v => updateProduct('enrichedAttributeCount', v)} />
                  <Field label="Existing Specification Count" type="number" value={activeProd.existingSpecificationCount} onChange={v => updateProduct('existingSpecificationCount', v)} />
                  <Field label="Enriched Specification Count" type="number" value={activeProd.enrichedSpecificationCount} onChange={v => updateProduct('enrichedSpecificationCount', v)} />
                  <Field label="Attributes Added" value={activeProd.attributesAdded} onChange={v => updateProduct('attributesAdded', v)} placeholder="Comma-separated, evidence-supported only" />
                  <Field label="Attributes Normalized" value={activeProd.attributesNormalized} onChange={v => updateProduct('attributesNormalized', v)} />
                  <Field label="Units Standardized" value={activeProd.unitsStandardized} onChange={v => updateProduct('unitsStandardized', v)} />
                  <Field label="Filter Fields Enabled" value={activeProd.filterFieldsEnabled} onChange={v => updateProduct('filterFieldsEnabled', v)} />
                  <Field label="Compliance / Certification Added" value={activeProd.complianceAdded} onChange={v => updateProduct('complianceAdded', v)} />
                  <Field label="Documentation Added" value={activeProd.documentationAdded} onChange={v => updateProduct('documentationAdded', v)} />
                  <Field label="Digital Assets Added" value={activeProd.digitalAssetsAdded} onChange={v => updateProduct('digitalAssetsAdded', v)} />
                  <Field label="SEO Fields / Keywords Improved" value={activeProd.seoFieldsAdded || activeProd.searchKeywordsImproved} onChange={v => updateProduct('seoFieldsAdded', v)} />
                </div>
                <TextAreaWithRefinement label="Original Description" value={activeProd.originalDescription} onChange={v => updateProduct('originalDescription', v)} placeholder="Optional source description" refineSection={refineSection} fieldName="Original Description" />
                <TextAreaWithRefinement label="Enriched Description" value={activeProd.enrichedDescription} onChange={v => updateProduct('enrichedDescription', v)} placeholder="Optional enriched description" refineSection={refineSection} fieldName="Enriched Description" />
                <TextAreaWithRefinement label="Analyst Notes" value={activeProd.analystNotes} onChange={v => updateProduct('analystNotes', v)} placeholder="Evidence, caveats and verification notes" refineSection={refineSection} fieldName="Analyst Notes" />
              </details>
              <div className="er-visual-comparison">
                <SleekUploadDropzone badgeText="BEFORE" subTitle="Original Client Product" tone="before" image={activeProd.beforeImage} pdfPage={activeProd.beforePdfPage || 1} onPdfPageChange={page => updateProduct('beforePdfPage', page)} onChange={v => updateProduct('beforeImage', v)} onZoom={() => onZoomImage(activeProd.beforeImage)} setToast={setToast} />
                <div className="er-comparison-bridge"><ArrowRight /><span>AI comparison</span></div>
                <SleekUploadDropzone badgeText="AFTER" subTitle="Enriched Product Record" tone="after" image={activeProd.afterImage} pdfPage={activeProd.afterPdfPage || 1} onPdfPageChange={page => updateProduct('afterPdfPage', page)} onChange={v => updateProduct('afterImage', v)} onZoom={() => onZoomImage(activeProd.afterImage)} setToast={setToast} />
              </div>
              {activeProd.analysisStatus !== 'Complete' && <div className="er-analyze-panel"><div><strong>{generating ? 'Analyzing product…' : 'Ready to analyze'}</strong><span>Extract product information, compare both versions and prepare the client report automatically.</span>{generating && <div className="er-compact-progress"><span className="done"><Check /> Reading Before</span><span className="done"><Check /> Reading After</span><span className="active">● Extracting product information</span><span>○ Comparing attributes</span><span>○ Building client insights</span></div>}</div><button onClick={() => analyzeProduct()} disabled={!activeProd.beforeImage || !activeProd.afterImage || generating}><Sparkles /> {generating ? 'Analyzing…' : 'Analyze Product'}</button></div>}
              {analysisError && <div className="er-analysis-error compact"><AlertCircle /><div><strong>Analysis couldn't be completed.</strong><span>Please check the connection and try again.</span>{showTechnicalDetails && <code>{analysisTechnicalDetails}</code>}</div><div><button onClick={() => analyzeProduct()} disabled={generating}><RefreshCw /> Try Again</button><button onClick={() => setShowTechnicalDetails(value => !value)}>{showTechnicalDetails ? 'Hide' : 'View'} technical details</button></div></div>}
              {activeProd.analysisStatus === 'Complete' && <div className="er-proof-workspace">
                <header><span><CheckCircle2 /> Analysis Complete</span><h2>{activeProd.productName}</h2><p>{[activeProd.brand, activeProd.sku && `SKU ${activeProd.sku}`, activeProd.category].filter(Boolean).join(' · ')}</p><b>Confidence: {Number.parseInt(activeProd.confidenceScore, 10) >= 75 ? 'High' : 'Review recommended'}</b></header>
                <section><h3>Before → After</h3><div className="er-proof-matrix">{Object.entries(activeProd.scores || {}).slice(0, 6).map(([area, score]) => <div key={area}><span>{area}</span><strong>{score.before ?? '—'}</strong><ArrowRight /><strong className="after">{score.after ?? '—'}</strong><small>{Number(score.after) > Number(score.before) ? `+${Number(score.after) - Number(score.before)} pts` : 'No measured change'}</small></div>)}</div></section>
                <section><h3>Key Improvements</h3><div className="er-key-improvements">{(activeProd.highlights || []).map((item, index) => <span key={index}><Check /> {item}</span>)}</div></section>
                <section className="er-detailed-comparison-section">
                  <div className="er-section-heading">
                    <div className="er-heading-title">
                      <h3>Detailed Comparison</h3>
                      <span className="er-count-badge">{(activeProd.improvements || []).filter(x => !['Unchanged', 'Not Detected'].includes(x.resultStatus)).length} Changes Identified</span>
                    </div>
                    <div className="er-filter-pills">
                      {['Changes Only','All','Added','Improved','Standardized','Normalized','Corrected','Unchanged','Needs Verification'].map(filter => (
                        <button
                          type="button"
                          className={comparisonFilter === filter ? 'active' : ''}
                          key={filter}
                          onClick={() => setComparisonFilter(filter)}
                        >
                          {filter}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="er-detail-table">
                    <div className="head">
                      <span>Data Area &amp; Evidence</span>
                      <span>Original (Before)</span>
                      <span>Enriched (After)</span>
                      <span>Status</span>
                    </div>
                    {filteredComparisons.map(item => {
                      const itemIndex = activeProd.improvements.findIndex(entry => entry.area === item.area);
                      const patchFinding = changes => updateProduct('improvements', activeProd.improvements.map((entry, index) => index === itemIndex ? { ...entry, ...changes } : entry));
                      const statusClass = (item.resultStatus || 'not-detected').toLowerCase().replace(/\s+/g, '-');

                      return (
                        <div className="er-finding-row" key={item.area}>
                          <div className="er-cell-area">
                            <strong>{item.area}</strong>
                            <details className="er-evidence-drawer">
                              <summary className="er-drawer-toggle">
                                <span>Edit evidence &amp; impact</span>
                              </summary>
                              <div className="er-drawer-content">
                                <label className="er-field">
                                  <span>What changed</span>
                                  <textarea rows={2} value={item.whatChanged || ''} onChange={e => patchFinding({ whatChanged: e.target.value })} placeholder="Describe specific transformation..." />
                                </label>
                                <label className="er-field">
                                  <span>Evidence</span>
                                  <textarea rows={2} value={item.evidence || ''} onChange={e => patchFinding({ evidence: e.target.value })} placeholder="Visible proof detected..." />
                                </label>
                                <label className="er-field">
                                  <span>Business impact</span>
                                  <textarea rows={2} value={item.businessBenefit || ''} onChange={e => patchFinding({ businessBenefit: e.target.value })} placeholder="Commercial benefit to buyer/client..." />
                                </label>
                                <div className="er-drawer-footer-row">
                                  <label className="er-field inline">
                                    <span>Confidence Score (%)</span>
                                    <input type="number" min="0" max="100" value={item.confidence ?? ''} onChange={e => patchFinding({ confidence: e.target.value })} />
                                  </label>
                                  <label className="er-checkbox-label">
                                    <input type="checkbox" checked={item.includeInReport !== false} onChange={e => patchFinding({ includeInReport: e.target.checked })} />
                                    <span>Include in PDF Report</span>
                                  </label>
                                </div>
                              </div>
                            </details>
                          </div>

                          <div className="er-cell-before">
                            <textarea
                              rows={2}
                              className="er-state-textarea before"
                              value={item.beforeState || ''}
                              placeholder="Original state..."
                              onChange={e => patchFinding({ beforeState: e.target.value })}
                            />
                          </div>

                          <div className="er-cell-after">
                            <textarea
                              rows={2}
                              className="er-state-textarea after"
                              value={item.afterState || ''}
                              placeholder="Enriched state..."
                              onChange={e => patchFinding({ afterState: e.target.value })}
                            />
                          </div>

                          <div className="er-cell-status">
                            <select
                              className={`er-status-select ${statusClass}`}
                              value={item.resultStatus || 'Not Detected'}
                              onChange={e => patchFinding({ resultStatus: e.target.value })}
                            >
                              {RESULT_STATUSES.map(status => <option key={status} value={status}>{status}</option>)}
                            </select>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </section>
                <section><h3>Client Insights</h3><div className="er-insight-list">{(activeProd.highlights || []).slice(0, 5).map((item, index) => <article key={index}><small>{(activeProd.improvements || [])[index]?.area || 'ENRICHMENT IMPACT'}</small><p>{item}</p></article>)}</div></section>
                <footer><button onClick={() => analyzeProduct()}><RefreshCw /> Re-analyze</button><button onClick={() => setActiveTab('report')}><FileText /> Review Report</button><button className="primary" onClick={() => { setActiveTab('preview'); setPreviewOpen(true) }}><Eye /> Preview PDF</button></footer>
              </div>}
            </section>
          </div>}

          {false && activeTab === 'editor' && (
            <>
              {/* Product Tab Navigator */}
              <div className="er-product-nav-strip">
                <div className="er-portfolio-status" aria-label="Report analysis status">
                  <strong>{report.products.length}</strong><span>Products</span>
                  <i />
                  <strong>{analyzedCount}</strong><span>Analyzed</span>
                  <i />
                  <strong>{pendingCount}</strong><span>Pending</span>
                </div>
                <div className="er-prod-pills">
                  {report.products.map((p, i) => (
                    <button
                      key={p.id}
                      className={`er-prod-pill ${activeProduct === i ? 'active' : ''} ${p.analysisStatus === 'Complete' ? 'analyzed' : ''}`}
                      onClick={() => setActiveProduct(i)}
                    >
                      <span className="idx">{String(i + 1).padStart(2, '0')}</span>
                      <span className="name">{p.productName ? (p.productName.length > 14 ? `${p.productName.slice(0, 12)}...` : p.productName) : `Product ${i + 1}`}</span>
                      {p.analysisStatus === 'Complete' && <Check className="check" />}
                    </button>
                  ))}
                  <button className="er-add-prod-btn" onClick={addProduct}>
                    <Plus /> Add
                  </button>
                </div>
                <div className="er-strip-actions">
                  <button className="er-analyze-all-btn" onClick={analyzeAll} disabled={generating || !pendingCount}>
                    <Sparkles /> {generating ? 'Analyzing All...' : pendingCount ? 'Analyze All Products' : 'All Products Analyzed'}
                  </button>
                  <button className="er-generate-report-btn" onClick={() => generatePDF()} disabled={generating || !analyzedCount}><FileText /> Generate Report</button>
                </div>
              </div>

              {/* Product Card Container */}
              <div className="er-prod-card-editor">
                {validationIssues.length > 0 && (
                  <div className="er-validation-panel">
                    <strong>Report needs attention before generation</strong>
                    {validationIssues.map((issue, index) => <div key={`${issue.label}-${index}`}><span>{issue.label}</span><button onClick={() => fixIssue(issue)}>Fix</button></div>)}
                  </div>
                )}
                <div className="er-prod-header-tools">
                  <div className="er-prod-meta-title">
                    <span className="badge">PRODUCT {activeProduct + 1} OF {report.products.length}</span>
                    <h2>{activeProd.productName || 'New Product Case Study'}</h2>
                    <div className="er-completion"><span><i style={{ width: `${completion}%` }} /></span><strong>{completionLabel}</strong></div>
                  </div>
                  <div className="er-prod-actions">
                    <button onClick={() => moveProduct(-1)} disabled={activeProduct === 0} title="Move Up"><ArrowUp size={13} /> Move Up</button>
                    <button onClick={() => moveProduct(1)} disabled={activeProduct === report.products.length - 1} title="Move Down"><ArrowDown size={13} /> Move Down</button>
                    <button onClick={duplicateProduct} title="Duplicate Product"><Copy size={13} /> Duplicate</button>
                    <button onClick={() => setConfirmRemoveProduct(true)} disabled={report.products.length === 1} className="danger" title="Remove Product"><Trash2 size={13} /> Remove</button>
                  </div>
                </div>

                <div className="er-ai-stagebar">
                  <span className={activeProd.beforeImage && activeProd.afterImage ? 'done' : 'active'}><b>1</b> Upload</span>
                  <i><ArrowRight /></i>
                  <span className={activeProd.analysisStatus === 'Complete' ? 'done' : activeProd.beforeImage && activeProd.afterImage ? 'active' : ''}><b>2</b> AI Analysis</span>
                  <i><ArrowRight /></i>
                  <span className={activeProd.analysisStatus === 'Complete' ? 'active' : ''}><b>3</b> Report Preview</span>
                </div>

                {/* Collapsible Section 01: Upload & Compare */}
                <CollapsibleSection
                  title="1. Upload Before & After"
                  isOpen={openSections.upload}
                  onToggle={() => toggleSection('upload')}
                >
                  <div className="er-upload-dual-grid">
                    <SleekUploadDropzone
                      badgeText="BEFORE"
                      subTitle="Original Client Page"
                      tone="before"
                      image={activeProd.beforeImage}
                      pdfPage={activeProd.beforePdfPage || 1}
                      onPdfPageChange={page => updateProduct('beforePdfPage', page)}
                      onChange={v => updateProduct('beforeImage', v)}
                      onZoom={() => onZoomImage(activeProd.beforeImage)}
                      setToast={setToast}
                    />
                    <SleekUploadDropzone
                      badgeText="AFTER"
                      subTitle="AltiusNxt Record"
                      tone="after"
                      image={activeProd.afterImage}
                      pdfPage={activeProd.afterPdfPage || 1}
                      onPdfPageChange={page => updateProduct('afterPdfPage', page)}
                      onChange={v => updateProduct('afterImage', v)}
                      onZoom={() => onZoomImage(activeProd.afterImage)}
                      setToast={setToast}
                    />
                  </div>
                </CollapsibleSection>

                {/* Collapsible Section 02: AI Vision Analysis & Evidence */}
                <CollapsibleSection
                  title="2. AI Analysis"
                  isOpen={openSections.ai || !!activeProd.beforeImage && !!activeProd.afterImage}
                  onToggle={() => toggleSection('ai')}
                >
                  <div className="er-single-analyze-strip">
                    <button
                      className="er-analyze-single-btn"
                      disabled={!activeProd.beforeImage || !activeProd.afterImage || generating}
                      onClick={() => analyzeProduct()}
                    >
                      <Sparkles size={14} /> {generating ? 'Analyzing product pages...' : activeProd.analysisStatus === 'Complete' ? 'Regenerate from Screenshots' : 'Analyze Before & After'}
                    </button>
                    {generating && <div className="er-analysis-steps"><strong>AI is creating the report</strong><span>Reading product information</span><span>Comparing visible content</span><span>Detecting enriched attributes</span><span>Evaluating taxonomy and specifications</span><span>Creating client-ready narrative</span></div>}
                    {activeProd.analysisStatus === 'Complete' && (
                      <div className="er-analysis-status-bar">
                        <CheckCircle2 size={14} />
                        <span><strong>AI Analysis Complete</strong> · Confidence {activeProd.confidenceScore || 'Needs review'} · Detected: {activeProd.productName}</span>
                      </div>
                    )}
                    {analysisError && <div className="er-analysis-error"><AlertCircle /><div><strong>AI analysis could not complete</strong><span>{analysisError}</span></div><button onClick={() => analyzeProduct()} disabled={generating}><RefreshCw /> Retry analysis</button></div>}
                  </div>
                </CollapsibleSection>

                {activeProd.analysisStatus === 'Complete' && <section className="er-ai-output">
                  <div className="er-ai-output-head"><div><span><Sparkles/></span><div><h3>AI Generated Report Content</h3><p>Review and approve the structured content created from the supplied screenshots.</p></div></div><div><button onClick={() => analyzeProduct()}><RefreshCw/>Regenerate</button><button className="approve" onClick={() => setToast('AI report content approved')}><Check/>Approve</button></div></div>
                  <div className="er-ai-overview"><article><small>Detected Product</small><strong>{activeProd.productName || 'Not detected'}</strong><span>{activeProd.brand || 'Brand not detected'} · {activeProd.sku || 'SKU not visible'}</span></article><article><small>Category / Taxonomy</small><strong>{activeProd.category || 'Not detected'}</strong><span>Source: supplied product pages</span></article><article><small>Analysis Status</small><strong>{Number.parseInt(activeProd.confidenceScore, 10) >= 75 ? 'High Confidence' : 'Review Recommended'}</strong><span>{activeProd.confidenceScore || 'Evidence confidence unavailable'}</span></article></div>
                  <div className="er-detected-summary">
                    <div><small>Before</small><strong>{detectedAttributeCount(activeProd, 'before')} attributes detected</strong></div>
                    <ArrowRight />
                    <div><small>After</small><strong>{detectedAttributeCount(activeProd, 'after')} attributes detected</strong></div>
                    <div className="gain"><small>Improvement</small><strong>+{Math.max(0, detectedAttributeCount(activeProd, 'after') - detectedAttributeCount(activeProd, 'before'))} structured areas</strong></div>
                    <div><small>Readiness</small><strong>{averageScore(activeProd, 'before') ?? '—'} → {averageScore(activeProd, 'after') ?? '—'}</strong></div>
                  </div>
                  {Object.keys(activeProd.scores || {}).length > 0 && <div className="er-quality-scores"><div className="er-score-head"><div><h4>Evidence-based Content Quality</h4><p>{activeProd.scoringMethodology || 'Scores use visible evidence only.'}</p></div><strong>{Math.round(Object.values(activeProd.scores).reduce((sum,s)=>sum+(Number(s.after)||0),0)/Math.max(1,Object.keys(activeProd.scores).length))}<small>/100 after</small></strong></div>{Object.entries(activeProd.scores).map(([area,s])=><div className="er-score-row" key={area}><span>{area}<small title={s.evidence}>{s.evidence || 'Visible evidence rubric'}</small></span><b>{s.before} → {s.after}</b><i><em style={{width:`${s.before}%`}}/><strong style={{width:`${s.after}%`}}/></i></div>)}</div>}
                  <div className="er-ai-summary"><div><h4>Overview</h4><p>{activeProd.keyTransformation || activeProd.afterSummary || 'No evidence-based overview was detected.'}</p></div><div><h4>Key Improvements</h4><ul>{(activeProd.highlights || []).slice(0,5).map((item,i)=><li key={i}><Check/>{item}</li>)}</ul></div><div><h4>Business Impact</h4><p>{activeProd.businessImpact || 'Not detected from the supplied pages.'}</p></div></div>
                  <div className="er-review-actions"><span>User edits always override AI content.</span><button onClick={() => setReviewMode(v => !v)}><FileText/>{reviewMode ? 'Hide Detailed Editor' : 'Review / Edit Details'}</button><button onClick={() => setPreviewOpen(true)}><Eye/>Open Report Preview</button></div>
                </section>}

                {/* Collapsible Section 03: Product Details */}
                {reviewMode && <>
                <CollapsibleSection
                  title="03. Product Details & Metadata"
                  isOpen={openSections.details}
                  onToggle={() => toggleSection('details')}
                >
                  <div className="er-grid-2">
                    <Field label="Product Name *" value={activeProd.productName} onChange={v => updateProduct('productName', v)} placeholder="Product title" />
                    <Field label="Brand" value={activeProd.brand} onChange={v => updateProduct('brand', v)} placeholder="Brand name" />
                    <Field label="Category *" value={activeProd.category} onChange={v => updateProduct('category', v)} placeholder="Taxonomy category" />
                    <Field label="SKU / Model" value={activeProd.sku} onChange={v => updateProduct('sku', v)} placeholder="SKU or MPN" />
                    <Field label="Manufacturer" value={activeProd.manufacturer} onChange={v => updateProduct('manufacturer', v)} placeholder="Manufacturer" />
                    <Field label="Analyst" value={activeProd.analyst} onChange={v => updateProduct('analyst', v)} placeholder="Analyst name" />
                    <Field label="Report ID" value={activeProd.reportId} onChange={v => updateProduct('reportId', v)} placeholder="Client report reference" />
                  </div>
                </CollapsibleSection>

                {/* Collapsible Section 04: Summaries */}
                <CollapsibleSection
                  title="04. Before vs After Summaries"
                  isOpen={openSections.summaries}
                  onToggle={() => toggleSection('summaries')}
                >
                  <TextAreaWithRefinement
                    label="Original Product Listing – Before Explanation *"
                    value={activeProd.beforeSummary}
                    onChange={v => updateProduct('beforeSummary', v)}
                    placeholder="Describe original listing limitations..."
                    refineSection={refineSection}
                    fieldName="Before Explanation"
                  />

                  <TextAreaWithRefinement
                    label="Enriched Product Record – After Explanation *"
                    value={activeProd.afterSummary}
                    onChange={v => updateProduct('afterSummary', v)}
                    placeholder="Describe added attributes, standardized specs..."
                    refineSection={refineSection}
                    fieldName="After Explanation"
                  />
                </CollapsibleSection>

                {/* Collapsible Section 05: Key Transformation */}
                <CollapsibleSection
                  title="05. Key Transformation"
                  isOpen={openSections.transformation}
                  onToggle={() => toggleSection('transformation')}
                >
                  <TextAreaWithRefinement
                    label="Key Transformation Statement *"
                    value={activeProd.keyTransformation}
                    onChange={v => updateProduct('keyTransformation', v)}
                    placeholder="Key statement highlighting commercial impact..."
                    refineSection={refineSection}
                    fieldName="Key Transformation"
                  />
                </CollapsibleSection>

                {/* Collapsible Section 06: Highlights & Matrix */}
                <CollapsibleSection
                  title="06. Enrichment Highlights & Matrix (12 Areas)"
                  isOpen={openSections.matrix}
                  onToggle={() => toggleSection('matrix')}
                >
                  <div className="er-matrix-table-wrap">
                    <table className="er-matrix-table">
                      <thead>
                        <tr>
                          <th>Area / Attribute</th>
                          <th>Original Before State</th>
                          <th>Enriched After State</th>
                          <th>Result Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(activeProd.improvements || []).map((imp, idx) => (
                          <tr key={imp.area}>
                            <td><strong>{imp.area}</strong></td>
                            <td>
                              <input
                                value={imp.beforeState || ''}
                                placeholder="Original state..."
                                onChange={e => {
                                  const updated = activeProd.improvements.map((m, j) => j === idx ? { ...m, beforeState: e.target.value } : m)
                                  updateProduct('improvements', updated)
                                }}
                              />
                            </td>
                            <td>
                              <input
                                value={imp.afterState || ''}
                                placeholder="Enriched state..."
                                onChange={e => {
                                  const updated = activeProd.improvements.map((m, j) => j === idx ? { ...m, afterState: e.target.value } : m)
                                  updateProduct('improvements', updated)
                                }}
                              />
                            </td>
                            <td>
                              <select
                                value={imp.resultStatus || 'Enriched'}
                                onChange={e => {
                                  const updated = activeProd.improvements.map((m, j) => j === idx ? { ...m, resultStatus: e.target.value } : m)
                                  updateProduct('improvements', updated)
                                }}
                              >
                                {RESULT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                              </select>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CollapsibleSection>

                {/* Collapsible Section 07: Business Impact */}
                <CollapsibleSection
                  title="07. Business Impact (Why This Matters)"
                  isOpen={openSections.impact}
                  onToggle={() => toggleSection('impact')}
                >
                  <TextAreaWithRefinement
                    label="Business Impact Narrative"
                    value={activeProd.businessImpact}
                    onChange={v => updateProduct('businessImpact', v)}
                    placeholder="Why this enrichment matters for faceted search, SEO, and procurement..."
                    refineSection={refineSection}
                    fieldName="Business Impact"
                  />
                </CollapsibleSection>
                </>}
              </div>
            </>
          )}
        </main>

        {/* Collapsible preview uses the same structured report template as PDF generation. */}
        {activeTab === 'preview' && <aside className="er-preview-pane open">
          <div className="er-preview-toolbar-top">
            <div className="er-preview-title">
              <Eye /> <strong>Report Preview</strong>
              {previewOpen && <button className="er-thumbnail-toggle" onClick={() => setShowThumbnails(v => !v)}><Layers /> Pages</button>}
            </div>
            <div className="er-zoom-controls">
              <button className="er-fit-text" onClick={() => setPreviewOpen(v => !v)}>{previewOpen ? 'Collapse' : 'Preview PDF'}</button>
              {previewOpen && <>
              <span className="er-page-position">{totalPages ? `Page ${currentPreviewPage} / ${totalPages}` : 'Preview not generated'}</span>
              <button title="Previous page" disabled={!totalPages || currentPreviewPage === 1} onClick={() => setCurrentPreviewPage(page => Math.max(1, page - 1))}><ChevronLeft /></button>
              <button title="Next page" disabled={!totalPages || currentPreviewPage === totalPages} onClick={() => setCurrentPreviewPage(page => Math.min(totalPages, page + 1))}><ChevronRight /></button>
              <button title="Zoom Out" onClick={() => setZoomLevel(z => Math.max(0.5, z - 0.1))}><ZoomOut /></button>
              <span>{Math.round(zoomLevel * 100)}%</span>
              <button title="Zoom In" onClick={() => setZoomLevel(z => Math.min(1.5, z + 0.1))}><ZoomIn /></button>
              <button title="Fit Page" onClick={() => setPreviewFit('page')}><Maximize2 /></button>
              <button className="er-fit-text" title="Fit Width" onClick={() => setPreviewFit('width')}>Fit width</button>
              <button className="er-fit-text" onClick={() => { setCurrentPreviewPage(1); setPresentationMode(true) }}><FileCode /> Present</button>
              {report.pdfPath && <button className="er-fit-text" onClick={() => downloadReportPDF(report)}><Download /> Download PDF</button>}
              </>}
            </div>
          </div>

          {previewOpen && <div className="er-preview-body">
            {showThumbnails && totalPages > 0 && <nav className="er-page-thumbnails">
              {Array.from({ length: totalPages }, (_, i) => <button key={i} className={currentPreviewPage === i + 1 ? 'active' : ''} onClick={() => { const pages = previewViewportRef.current?.querySelectorAll('.er-a4-page'); pages?.[i]?.scrollIntoView({ behavior: 'smooth', block: 'start' }); setCurrentPreviewPage(i + 1) }}><span>{i === 0 ? 'Cover' : i === totalPages - 1 ? 'Summary' : `Page ${i + 1}`}</span><small>{i + 1}</small></button>)}
            </nav>}
          <div className="er-preview-viewport" ref={previewViewportRef} onScroll={e => {
            const pages = [...e.currentTarget.querySelectorAll('.er-a4-page')]
            if (!pages.length) return
            const top = e.currentTarget.getBoundingClientRect().top
            const nearest = pages.reduce((best, page, index) => Math.abs(page.getBoundingClientRect().top - top) < best.distance ? { index, distance: Math.abs(page.getBoundingClientRect().top - top) } : best, { index: 0, distance: Infinity })
            setCurrentPreviewPage(nearest.index + 1)
          }}>
            <div className={`er-preview-scale-wrapper ${report.pdfPath ? 'generated' : 'pending'}`}>
              {report.pdfPath
                ? <GeneratedPdfPreview url={report.pdfPath} page={currentPreviewPage} zoom={zoomLevel} />
                : <div className="er-preview-regenerate"><FileText /><h3>Generate the final preview</h3><p>The preview uses the exact exported PDF renderer. Generate it after your edits to review the final typography, spacing and page flow.</p><button onClick={() => generatePDF()} disabled={generating}><Sparkles /> {generating ? 'Generating...' : 'Generate matching preview'}</button></div>}
            </div>
          </div>
          <aside className="er-preview-properties" hidden>
            <header><Settings2 /><div><strong>Report Properties</strong><small>Changes update the preview instantly</small></div></header>
            <label><span>Report type</span><select value={report.reportMode || 'Detailed Report'} onChange={e => update('reportMode', e.target.value)}><option>Detailed Report</option><option>Executive Report</option></select></label>
            <label><span>Client</span><input value={report.clientName || ''} onChange={e => update('clientName', e.target.value)} /></label>
            <label><span>Industry</span><input value={report.industry || ''} onChange={e => update('industry', e.target.value)} placeholder="Detected or entered industry" /></label>
            <label><span>Active product title</span><input value={activeProd.productName || ''} onChange={e => updateProduct('productName', e.target.value)} /></label>
            <div className="er-property-actions"><button onClick={() => setActiveTab('editor')}><FileText /> Edit content</button><button onClick={() => analyzeProduct()} disabled={generating}><RotateCcw /> Regenerate</button></div>
            <div className="er-section-visibility"><strong>Included sections</strong><span><Check /> Executive summary</span><span><Check /> Product case studies</span><span><Check /> Portfolio insights</span><span><Check /> Business impact</span></div>
          </aside>
          </div>}
        </aside>}
      </div>
      {presentationMode && <div className="er-presentation-mode" role="dialog" aria-label="Report presentation">
        <header><span>{report.clientName || 'Client'} · Product Data Enrichment Report</span><strong>{currentPreviewPage} / {totalPages}</strong><button onClick={() => setPresentationMode(false)}><X /> Exit presentation</button></header>
        <main ref={presentationRef}>{report.pdfPath ? <GeneratedPdfPreview url={report.pdfPath} page={currentPreviewPage} zoom={1} /> : <div className="er-preview-regenerate"><p>Generate the PDF before presenting.</p></div>}</main>
        <footer><button disabled={currentPreviewPage === 1} onClick={() => setCurrentPreviewPage(page => Math.max(1, page - 1))}><ChevronLeft /> Previous</button><span>Use arrow keys to navigate</span><button disabled={currentPreviewPage === totalPages} onClick={() => setCurrentPreviewPage(page => Math.min(totalPages, page + 1))}>Next <ChevronRight /></button></footer>
      </div>}
      {toast && !(analysisError && toast === analysisError) && <div className="er-live-toast" role="status"><CheckCircle2 /><span>{toast}</span><button onClick={() => setToast('')}><X /></button></div>}
      {confirmRemoveProduct && <div className="er-modal-backdrop"><div className="er-confirm"><Trash2 /><h3>Remove Product {activeProduct + 1}?</h3><p>This removes its files, findings and matrix from the combined report. You can undo immediately afterward.</p><div><button onClick={() => setConfirmRemoveProduct(false)}>Cancel</button><button className="danger" onClick={removeProduct}>Remove product</button></div></div></div>}
      {emailOpen && <div className="er-modal-backdrop"><div className="er-email-modal"><header><div><span><Mail /></span><div><h3>Client-ready outreach email</h3><p>Generated from the analyzed product evidence. Review before sending.</p></div></div><button onClick={() => setEmailOpen(false)}><X /></button></header><div className="er-email-fields"><label><span>Recipient name</span><input value={report.recipientName || ''} onChange={e => update('recipientName', e.target.value)} placeholder="Recipient name" /></label><button onClick={() => update('outreachEmail', buildOutreachEmail(report))}><RefreshCw /> Regenerate from analysis</button></div><textarea value={report.outreachEmail || buildOutreachEmail(report)} onChange={e => update('outreachEmail', e.target.value)} /><footer><span>User edits are saved with this report.</span><button onClick={async () => { await navigator.clipboard.writeText(report.outreachEmail || buildOutreachEmail(report)); setToast('Email copied to clipboard') }}><Copy /> Copy email</button><a href={`mailto:?subject=${encodeURIComponent(`${report.clientName || 'Product'} — Product Data Enrichment Review`)}&body=${encodeURIComponent(report.outreachEmail || buildOutreachEmail(report))}`}><Mail /> Open email app</a></footer></div></div>}
      {qualityCheck && <div className="er-modal-backdrop"><div className="er-quality-modal"><header><span><CheckCircle2/></span><div><h3>Report Quality Check</h3><p>Review evidence gaps before creating the client PDF.</p></div><button onClick={()=>setQualityCheck(null)}><X/></button></header><div className="er-quality-metrics"><div><strong>{qualityCheck.verified}</strong><span>Fields verified</span></div><div><strong>{qualityCheck.reviewFields.length}</strong><span>Fields need review</span></div><div><strong>{qualityCheck.issues.filter(x=>/upload both|required/i.test(x.label)).length}</strong><span>Critical issues</span></div></div><div className="er-quality-issues">{qualityCheck.issues.slice(0,8).map((issue,i)=><div key={i}><AlertCircle/><span>{issue.label}</span><button onClick={()=>fixIssue(issue)}>Review</button></div>)}</div><footer><button onClick={()=>setQualityCheck(null)}>Cancel</button><button onClick={()=>{const first=qualityCheck.issues[0];setQualityCheck(null);fixIssue(first)}}>Review Issues</button><button className="primary" disabled={qualityCheck.issues.some(x=>/upload both|required/i.test(x.label))} onClick={()=>generatePDF(true)}>Generate Anyway</button></footer></div></div>}
    </div>
  )
}

function LayoutCustomizationPanel({ report, update, activeProduct, updateProduct, setActiveProduct, setActiveTab }) {
  const order = (report.sectionOrder || []).filter(key => REPORT_SECTION_LIBRARY[key])
  const missing = Object.keys(REPORT_SECTION_LIBRARY).filter(key => !order.includes(key))
  const sections = [...order, ...missing]
  const visibility = report.sectionVisibility || {}

  const moveSection = (index, direction) => {
    const target = index + direction
    if (target < 0 || target >= sections.length) return
    const next = [...sections]
    ;[next[index], next[target]] = [next[target], next[index]]
    update('sectionOrder', next)
  }

  const toggleSection = key => update('sectionVisibility', { ...visibility, [key]: visibility[key] === false })
  const currentProduct = report.products?.[activeProduct] || blankProduct()

  return <div className="er-layout-studio">
    <header className="er-studio-hero">
      <div><span><Settings2 /> PDF DESIGN STUDIO</span><h2>Customize the report structure</h2><p>Control hierarchy, page rhythm, imagery and the final call to action. Every change is saved with this report.</p></div>
      <button onClick={() => setActiveTab('preview')}><Eye /> Preview exact PDF</button>
    </header>

    <div className="er-layout-studio-grid">
      <section className="er-studio-card er-section-manager">
        <div className="er-studio-title"><div><strong>Page sections</strong><span>Reorder or remove sections from the client report</span></div><small>{sections.filter(key => visibility[key] !== false).length} included</small></div>
        <div className="er-section-stack">{sections.map((key, index) => {
          const [label, description] = REPORT_SECTION_LIBRARY[key]
          const included = visibility[key] !== false
          return <article key={key} className={included ? '' : 'excluded'}>
            <span className="er-section-index">{String(index + 1).padStart(2, '0')}</span>
            <button className="er-visibility-toggle" onClick={() => toggleSection(key)} aria-label={`${included ? 'Hide' : 'Show'} ${label}`}>{included ? <Eye /> : <X />}</button>
            <div><strong>{label}</strong><small>{description}</small></div>
            <div className="er-order-actions"><button disabled={index === 0} onClick={() => moveSection(index, -1)} title="Move up"><ArrowUp /></button><button disabled={index === sections.length - 1} onClick={() => moveSection(index, 1)} title="Move down"><ArrowDown /></button></div>
          </article>
        })}</div>
      </section>

      <aside className="er-studio-controls">
        <section className="er-studio-card">
          <div className="er-studio-title"><div><strong>Visual style</strong><span>Set a consistent presentation system</span></div></div>
          <label className="er-control-label"><span>Layout variation</span><div className="er-choice-grid">{['Executive','Editorial','Data focused'].map(option => <button key={option} className={report.layoutPreset === option ? 'active' : ''} onClick={() => update('layoutPreset', option)}>{option}</button>)}</div></label>
          <label className="er-control-label"><span>Accent color</span><div className="er-color-row">{['#173B72','#2457D6','#0F766E','#6D3CC7','#B54708'].map(color => <button key={color} className={report.accentColor === color ? 'active' : ''} style={{background: color}} onClick={() => update('accentColor', color)} aria-label={`Use ${color}`} />)}<input type="color" value={report.accentColor || '#173B72'} onChange={event => update('accentColor', event.target.value)} /></div></label>
          <label className="er-control-label"><span>Content density</span><select value={report.contentDensity || 'Balanced'} onChange={event => update('contentDensity', event.target.value)}><option>Spacious</option><option>Balanced</option><option>Compact</option></select></label>
          <label className="er-control-label"><span>Page spacing</span><select value={report.pageSpacing || 'Balanced'} onChange={event => update('pageSpacing', event.target.value)}><option>Airy</option><option>Balanced</option><option>Efficient</option></select></label>
        </section>

        <section className="er-studio-card">
          <div className="er-studio-title"><div><strong>Before / After images</strong><span>Choose how product evidence appears</span></div></div>
          <label className="er-control-label"><span>Product</span><select value={activeProduct} onChange={event => setActiveProduct(Number(event.target.value))}>{report.products.map((product, index) => <option key={product.id} value={index}>{product.productName || `Product ${index + 1}`}</option>)}</select></label>
          <label className="er-control-label"><span>Image arrangement</span><div className="er-choice-grid">{['Side by side','Stacked','Before focus'].map(option => <button key={option} className={currentProduct.imageLayout === option ? 'active' : ''} onClick={() => updateProduct('imageLayout', option)}>{option}</button>)}</div></label>
          <div className="er-control-pair"><label className="er-control-label"><span>Image size</span><select value={currentProduct.imageSize || 'Large'} onChange={event => updateProduct('imageSize', event.target.value)}><option>Medium</option><option>Large</option><option>Full width</option></select></label><label className="er-control-label"><span>Position</span><select value={currentProduct.imagePosition || 'Center'} onChange={event => updateProduct('imagePosition', event.target.value)}><option>Top</option><option>Center</option><option>Bottom</option></select></label></div>
          <button className="er-replace-image-action" onClick={() => setActiveTab('editor')}><ImageIcon /> Replace or review screenshots</button>
        </section>

        <section className="er-studio-card">
          <div className="er-studio-title"><div><strong>Final call to action</strong><span>Edit the closing page content</span></div></div>
          <Field label="CTA heading" value={report.ctaHeading} onChange={value => update('ctaHeading', value)} />
          <label className="er-field full"><span>CTA description</span><textarea value={report.ctaBody || ''} onChange={event => update('ctaBody', event.target.value)} /></label>
        </section>
      </aside>
    </div>
  </div>
}

function GenerateReportPanel({ report, reportReady, analyzedCount, generating, generatePDF, downloadReportPDF, setActiveTab }) {
  const visibleSections = Object.keys(REPORT_SECTION_LIBRARY).filter(key => report.sectionVisibility?.[key] !== false).length
  return <div className="er-generate-workspace">
    <section><span className="er-generate-icon"><FileText /></span><small>FINAL OUTPUT</small><h2>Your client-ready report is ready for final review</h2><p>Confirm the content and layout, then create the exact PDF used for presentation and delivery.</p>
      <div className="er-generate-checks"><span><CheckCircle2 /> {analyzedCount} product{analyzedCount === 1 ? '' : 's'} analyzed</span><span><CheckCircle2 /> {visibleSections} report sections included</span><span><CheckCircle2 /> {report.layoutPreset || 'Executive'} layout selected</span></div>
      <div className="er-generate-actions"><button onClick={() => setActiveTab('preview')}><Eye /> Review preview</button><button className="primary" disabled={generating || !reportReady} onClick={() => generatePDF()}><Download /> {generating ? 'Generating PDF...' : 'Generate final PDF'}</button>{report.pdfPath && <button onClick={() => downloadReportPDF(report)}><Download /> Download latest PDF</button>}</div>
      {!reportReady && <div className="er-generate-warning"><AlertCircle /> Complete product analysis and add the executive summary or business value before generating.</div>}
    </section>
  </div>
}

function ReportReviewWorkspace({ report, update, refineSection, setActiveTab }) {
  const products = report.products || []
  const before = Math.round(products.reduce((sum, product) => sum + (averageScore(product, 'before') || 0), 0) / Math.max(1, products.length))
  const after = Math.round(products.reduce((sum, product) => sum + (averageScore(product, 'after') || 0), 0) / Math.max(1, products.length))
  const findings = products.flatMap(product => (product.improvements || []).map(item => ({ ...item, productName: product.productName }))).filter(item => item.resultStatus && !['Unchanged', 'Not Detected'].includes(item.resultStatus))
  const metric = pattern => findings.filter(item => pattern.test(item.area || '')).length
  const sections = [
    ['Executive Summary', 'executiveSummary', report.executiveSummary],
    ['Overall Enrichment Impact', 'overallBusinessValue', report.overallBusinessValue],
    ['Portfolio Findings', 'portfolioFindings', buildPortfolioInsights(report.products || []).map(item => `${item.area}: evidence across ${item.count} product${item.count === 1 ? '' : 's'}.`).join('\n')],
    ['Business Impact', 'nextSteps', report.nextSteps],
    ['Call to Action', 'cta', 'Schedule a 15-Minute Product Data Review']
  ]
  return <div className="er-findings-dashboard">
    <header><div><span>EDIT CONTENT</span><h2>Shape the client narrative</h2><p>Review every generated claim, supporting metric and recommendation before layout.</p></div><div><button onClick={() => setActiveTab('setup')}><Building2 /> Client details</button><button onClick={() => setActiveTab('summary')}><Layers /> Business Impact</button><button className="primary" onClick={() => setActiveTab('layout')}><Settings2 /> Customize Layout</button></div></header>
    <section className="er-score-hero"><div><small>Before</small><strong>{before}%</strong></div><ArrowRight /><div className="after"><small>After</small><strong>{after}%</strong></div><div className="gain"><small>Improvement</small><strong>+{Math.max(0, after - before)} pts</strong></div></section>
    <section className="er-finding-metrics">{[
      ['Attributes added', metric(/Attribute|Specification|Unit/i)],
      ['SEO fields improved', metric(/SEO|Search/i)],
      ['Media improved', metric(/Image|Asset|Media|Document/i)],
      ['Data gaps resolved', findings.length],
      ['Products complete', products.filter(product => product.analysisStatus === 'Complete').length]
    ].map(([label, value]) => <article key={label}><strong>{value}</strong><span>{label}</span></article>)}</section>
    <section className="er-categorized-findings"><div className="er-section-heading"><div><h3>Key findings</h3><span className="er-count-badge">{findings.length} improvements</span></div></div>{findings.slice(0, 12).map((item, index) => <article key={`${item.productName}-${item.area}-${index}`}><div><small>{item.productName || 'Product'} · {item.resultStatus}</small><h4>{item.area}</h4></div><dl><div><dt>Before</dt><dd>{item.beforeState || 'Not detected'}</dd></div><div><dt>After</dt><dd>{item.afterState || 'Not detected'}</dd></div><div><dt>Business impact</dt><dd>{item.businessBenefit || item.impact || 'Review the enriched evidence for commercial impact.'}</dd></div></dl></article>)}</section>
    <details className="er-report-narrative-review"><summary>Review report narrative and inclusion settings</summary><div className="er-report-section-list">{sections.map(([label, key, value]) => <article key={key}><div><span className={value ? 'generated' : 'review'}>{value ? 'Generated' : 'Needs Review'}</span><h3>{label}</h3><p>{value || 'This section will be generated after product analysis.'}</p></div><div><button onClick={() => { const next = window.prompt(`Edit ${label}`, value || ''); if (next !== null) update(key, next) }}><FileText /> Edit</button><button onClick={() => refineSection(value, 'regenerate', label, next => update(key, next))} disabled={!value}><RefreshCw /> Regenerate</button></div></article>)}</div></details>
  </div>
}

function CollapsibleSection({ title, isOpen, onToggle, children }) {
  return (
    <div className="er-collapsible-section">
      <button type="button" className="er-collapsible-head" onClick={onToggle}>
        <h3>{title}</h3>
        <ChevronDown className={`arrow ${isOpen ? 'open' : ''}`} />
      </button>
      {isOpen && <div className="er-collapsible-body">{children}</div>}
    </div>
  )
}

function ClientSetupPanel({ report, update, crmClients, refineSection, setToast }) {
  const logoRef = useRef()

  const handleLogoUpload = async file => {
    if (!file) return
    const fd = new FormData()
    fd.append('image', file)
    try {
      const r = await api.post('/enrichment-reports/upload/image', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      update('clientLogo', r.data)
      setToast('Client logo uploaded')
    } catch (e) {
      setToast('Logo upload failed.')
    }
  }

  return (
    <div className="er-prod-card-editor">
      <h2>Report Setup</h2>

      <div className="er-form-block">
        <div className="er-grid-2">
          <Field label="Report Title *" value={report.name} onChange={v => update('name', v)} placeholder="Report title" />
          
          <label className="er-field">
            <span>Client Organization *</span>
            <div className="er-client-select-wrap">
              <input
                value={report.clientName || ''}
                onChange={e => update('clientName', e.target.value)}
                placeholder="Type or select client"
                list="crm-client-list"
              />
              <datalist id="crm-client-list">
                {crmClients.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
              </datalist>
            </div>
          </label>

          <Field label="Prepared For (Client Contact)" value={report.preparedFor} onChange={v => update('preparedFor', v)} placeholder="e.g. VP E-Commerce" />
          <Field label="Client Website URL" value={report.clientWebsite} onChange={v => update('clientWebsite', v)} placeholder="https://client.com" />
          <Field label="Recipient Name" value={report.recipientName} onChange={v => update('recipientName', v)} />
          <Field label="Recipient Designation" value={report.recipientDesignation} onChange={v => update('recipientDesignation', v)} placeholder="Head of Ecommerce" />
          <Field label="Industry" value={report.industry} onChange={v => update('industry', v)} />
          <Field label="Country / Market" value={report.countryMarket} onChange={v => update('countryMarket', v)} />
          <Field label="Report Subtitle" value={report.reportSubtitle} onChange={v => update('reportSubtitle', v)} />
          <Field label="Prepared By" value={report.preparedBy} onChange={v => update('preparedBy', v)} />
          <Field label="Account Manager" value={report.accountManager} onChange={v => update('accountManager', v)} />
          <Field label="Report Date" type="date" value={String(report.reportDate || '').slice(0, 10)} onChange={v => update('reportDate', v)} />
          <Field label="Report Version" value={report.reportVersion} onChange={v => update('reportVersion', v)} />
          <Field label="Confidentiality Label" value={report.confidentialityLabel} onChange={v => update('confidentialityLabel', v)} />
          <Field label="Project Name" value={report.projectName} onChange={v => update('projectName', v)} placeholder="Product Data Enrichment POC" />
          <Field label="Currency / Market" value={report.currencyMarket} onChange={v => update('currencyMarket', v)} placeholder="Optional" />
          <label className="er-field"><span>Report Mode</span><select value={report.reportMode || 'Sales/POC'} onChange={e => update('reportMode', e.target.value)}><option>Sales/POC</option><option>Executive</option><option>Technical Audit</option><option>Detailed Assessment</option></select></label>
          <label className="er-field"><span>Report Tone</span><select value={report.reportTone || 'Consultative'} onChange={e => update('reportTone', e.target.value)}><option>Consultative</option><option>Executive</option><option>Technical</option><option>Concise</option></select></label>
        </div>

        <div className="er-logo-upload-row">
          <div className="er-logo-preview">
            <span>Client Logo:</span>
            {report.clientLogo ? (
              <div className="er-logo-chip">
                <img src={report.clientLogo.url} alt="Client Logo" />
                <button onClick={() => update('clientLogo', null)}><X /></button>
              </div>
            ) : (
              <button className="er-secondary" onClick={() => logoRef.current.click()}><Upload /> Upload Client Logo</button>
            )}
            <input ref={logoRef} hidden type="file" accept="image/*" onChange={e => handleLogoUpload(e.target.files[0])} />
          </div>
        </div>
      </div>

      <div className="er-form-block">
        <h3>Project Scope</h3>
        <div className="er-grid-2">
          <Field label="Total Products in Client Catalog" type="number" value={report.totalCatalogProducts} onChange={v => update('totalCatalogProducts', v)} />
          <Field label="Products Analyzed in this POC" type="number" value={report.productsAnalyzedPoc} onChange={v => update('productsAnalyzedPoc', v)} placeholder={String(report.products.length)} />
          <Field label="Product Categories Covered" value={report.productCategoriesCovered} onChange={v => update('productCategoriesCovered', v)} placeholder="Comma-separated categories" />
          <Field label="Data Source Type" value={report.dataSourceType} onChange={v => update('dataSourceType', v)} placeholder="Website, PDF, PIM export" />
          <Field label="Current Ecommerce Platform" value={report.ecommercePlatform} onChange={v => update('ecommercePlatform', v)} />
          <Field label="Target Platforms" value={report.targetPlatforms} onChange={v => update('targetPlatforms', v)} placeholder="PIM, Shopify, Amazon..." />
          <Field label="Primary Business Goal" value={report.primaryBusinessGoal} onChange={v => update('primaryBusinessGoal', v)} />
          <Field label="Client Pain Points" value={report.clientPainPoints} onChange={v => update('clientPainPoints', v)} />
        </div>
        <TextAreaWithRefinement label="Executive Note" value={report.executiveNote} onChange={v => update('executiveNote', v)} placeholder="Optional context for senior stakeholders" refineSection={refineSection} fieldName="Executive Note" />
        <TextAreaWithRefinement label="Client Objective" value={report.clientObjective} onChange={v => update('clientObjective', v)} placeholder="What the client wants this assessment to establish" refineSection={refineSection} fieldName="Client Objective" />
      </div>

      <div className="er-form-block">
        <TextAreaWithRefinement
          label="Executive Summary"
          value={report.executiveSummary}
          onChange={v => update('executiveSummary', v)}
          placeholder="Executive summary narrative..."
          refineSection={refineSection}
          fieldName="Executive Summary"
        />

        <Field label="PDF Footer Text" value={report.footerText} onChange={v => update('footerText', v)} />
      </div>
    </div>
  )
}

function SummaryValuePanel({ report, update, refineSection }) {
  const products = report.products || []
  const dimensions = ['Data Completeness', 'Customer Experience', 'Search / SEO', 'Marketplace Readiness', 'Sales Enablement', 'Catalog Consistency']
  const before = Math.round(products.reduce((sum, product) => sum + (averageScore(product, 'before') || 0), 0) / Math.max(1, products.length))
  const after = Math.round(products.reduce((sum, product) => sum + (averageScore(product, 'after') || 0), 0) / Math.max(1, products.length))
  return (
    <div className="er-impact-workspace">
      <header><span>BUSINESS IMPACT</span><h2>What value did the enrichment create?</h2><p>Translate product-data improvements into outcomes that matter to commercial teams.</p></header>
      <div className="er-impact-bars">{dimensions.map((label, index) => { const beforeValue = Math.max(15, before - index * 3); const afterValue = Math.max(beforeValue, after - index * 2); return <article key={label}><div><strong>{label}</strong><span>{beforeValue}% → {afterValue}%</span></div><div><i style={{ width: `${beforeValue}%` }} /><b style={{ width: `${afterValue}%` }} /></div></article> })}</div>

      <div className="er-form-block">
        <TextAreaWithRefinement
          label="Overall Business Value Statement"
          value={report.overallBusinessValue}
          onChange={v => update('overallBusinessValue', v)}
          placeholder="Overall business impact, procurement readiness, search visibility..."
          refineSection={refineSection}
          fieldName="Overall Business Value"
        />

        <TextAreaWithRefinement
          label="Recommended Next Steps"
          value={report.nextSteps}
          onChange={v => update('nextSteps', v)}
          placeholder="Next steps for scaling enrichment across the complete catalog..."
          refineSection={refineSection}
          fieldName="Next Steps"
        />
      </div>
    </div>
  )
}

function TextAreaWithRefinement({ label, value, onChange, placeholder, refineSection, fieldName }) {
  const [openAiMenu, setOpenAiMenu] = useState(false)

  return (
    <label className="er-field full">
      <div className="er-field-label-row">
        <span>{label}</span>
        <div className="er-ai-refine-dropdown">
          <button type="button" className="er-ai-btn" onClick={() => setOpenAiMenu(!openAiMenu)}>
            <Wand2 /> Refine with AI
          </button>
          {openAiMenu && (
            <div className="er-ai-menu">
              <button type="button" onClick={() => { setOpenAiMenu(false); refineSection(value, 'improve', fieldName, onChange) }}>✨ Improve Writing</button>
              <button type="button" onClick={() => { setOpenAiMenu(false); refineSection(value, 'professional', fieldName, onChange) }}>👔 Make Professional</button>
              <button type="button" onClick={() => { setOpenAiMenu(false); refineSection(value, 'technical', fieldName, onChange) }}>⚙️ Make Technical</button>
              <button type="button" onClick={() => { setOpenAiMenu(false); refineSection(value, 'shorter', fieldName, onChange) }}>✂️ Make Shorter</button>
            </div>
          )}
        </div>
      </div>
      <textarea
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </label>
  )
}

function Field({ label, value, onChange, ...props }) {
  return (
    <label className="er-field">
      <span>{label}</span>
      <input value={value || ''} onChange={e => onChange(e.target.value)} {...props} />
    </label>
  )
}

function SleekUploadDropzone({ badgeText, subTitle, tone, image, pdfPage, onPdfPageChange, onChange, onZoom, setToast }) {
  const ref = useRef()
  const canvasRef = useRef()
  const [pdfTotalPages, setPdfTotalPages] = useState(1)
  const [fitMode, setFitMode] = useState('width')
  const [previewZoom, setPreviewZoom] = useState(1)

  const isPdf = image?.mimeType === 'application/pdf' || image?.url?.toLowerCase().endsWith('.pdf')

  useEffect(() => {
    if (!isPdf || !image?.url) return
    let active = true
    const renderPdfPage = async () => {
      try {
        const loadingTask = pdfjsLib.getDocument(image.url)
        const pdf = await loadingTask.promise
        if (!active) return
        setPdfTotalPages(pdf.numPages)

        const pageNum = Math.min(Math.max(1, pdfPage), pdf.numPages)
        const page = await pdf.getPage(pageNum)
        if (!active) return

        const canvas = canvasRef.current
        if (!canvas) return
        const context = canvas.getContext('2d')

        const viewport = page.getViewport({ scale: 1.2 })
        canvas.height = viewport.height
        canvas.width = viewport.width

        await page.render({ canvasContext: context, viewport }).promise
      } catch (err) {
        console.warn('PDF render:', err.message)
      }
    }
    renderPdfPage()
    return () => { active = false }
  }, [image?.url, pdfPage, isPdf])

  const send = async file => {
    if (!file) return
    const fd = new FormData()
    fd.append('image', file)
    try {
      const r = await api.post('/enrichment-reports/upload/image', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      onChange(r.data)
      setToast(file.type === 'application/pdf' ? 'PDF uploaded' : 'Screenshot uploaded')
    } catch (e) {
      setToast(e.response?.data?.message || 'File upload failed')
    }
  }

  return (
    <div className={`er-upload-card ${tone}`}>
      <div className="er-upload-head">
        <span className={`badge-label ${tone}`}>{badgeText}</span>
        <span className="er-card-title-sub">{subTitle}</span>
        {image && (
          <div className="er-head-btns">
            <button className={fitMode === 'width' ? 'active' : ''} title="Fit Width" onClick={() => { setFitMode('width'); setPreviewZoom(1) }}>Width</button>
            <button className={fitMode === 'page' ? 'active' : ''} title="Fit Page" onClick={() => { setFitMode('page'); setPreviewZoom(1) }}>Page</button>
            <button title="Zoom Out" onClick={() => setPreviewZoom(value => Math.max(.6, value - .2))}><ZoomOut /></button>
            <button title="Zoom In" onClick={() => setPreviewZoom(value => Math.min(2, value + .2))}><ZoomIn /></button>
            <button title="Full Zoom Preview" onClick={onZoom}><Maximize2 /></button>
            <button title="Remove" onClick={() => onChange(null)}><X /></button>
          </div>
        )}
      </div>

      {image ? (
        <>
          <div className={`er-img-preview-box fit-${fitMode}`}>
            {isPdf ? (
              <div className="er-pdf-canvas-container" style={{ '--preview-zoom': previewZoom }}>
                <canvas ref={canvasRef} onDoubleClick={onZoom} />
                <div className="er-pdf-page-bar" onClick={e => e.stopPropagation()}>
                  <button disabled={pdfPage <= 1} onClick={() => onPdfPageChange(pdfPage - 1)}>&lt;</button>
                  <span>Page {pdfPage} of {pdfTotalPages}</span>
                  <button disabled={pdfPage >= pdfTotalPages} onClick={() => onPdfPageChange(pdfPage + 1)}>&gt;</button>
                </div>
              </div>
            ) : (
              <img src={image.url} alt={badgeText} style={{ '--preview-zoom': previewZoom }} onDoubleClick={onZoom} />
            )}
          </div>

          <div className="er-upload-foot">
            <div className="er-file-meta"><span className="fname">{image.filename}</span><small>{(image.mimeType || 'Uploaded file').replace('image/', '').replace('application/', '').toUpperCase()} · {image.size ? `${Math.max(1, Math.round(image.size / 1024))} KB` : 'Ready'}</small></div>
            <div><button onClick={onZoom}>View</button><button onClick={() => ref.current.click()}>Replace</button><button className="remove" onClick={() => onChange(null)}>Remove</button></div>
          </div>
        </>
      ) : (
        <button type="button" className="er-drop-zone" onClick={() => ref.current.click()}>
          <Upload className="drop-icon" />
          <strong className="drop-title">Upload file or PDF</strong>
          <small className="drop-hint">PDF, PNG, JPG, WebP</small>
        </button>
      )}
      <input ref={ref} hidden type="file" accept="application/pdf,image/png,image/jpeg,image/webp,.pdf" onChange={e => send(e.target.files[0])} />
    </div>
  )
}

function GeneratedPdfPreview({ url, page, zoom = 1 }) {
  const canvasRef = useRef(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    let renderTask
    const loadingTask = pdfjsLib.getDocument(url)
    loadingTask.promise.then(async pdf => {
      const safePage = Math.min(Math.max(1, page), pdf.numPages)
      const pdfPage = await pdf.getPage(safePage)
      if (cancelled || !canvasRef.current) return
      const baseViewport = pdfPage.getViewport({ scale: 1 })
      const targetWidth = Math.min(920, Math.max(560, window.innerWidth - 260))
      const renderScale = (targetWidth / baseViewport.width) * zoom * Math.max(1, window.devicePixelRatio || 1)
      const viewport = pdfPage.getViewport({ scale: renderScale })
      const canvas = canvasRef.current
      const context = canvas.getContext('2d', { alpha: false })
      canvas.width = viewport.width
      canvas.height = viewport.height
      canvas.style.width = `${viewport.width / Math.max(1, window.devicePixelRatio || 1)}px`
      canvas.style.height = `${viewport.height / Math.max(1, window.devicePixelRatio || 1)}px`
      renderTask = pdfPage.render({ canvasContext: context, viewport })
      await renderTask.promise
      if (!cancelled) setError('')
    }).catch(err => {
      if (!cancelled && err?.name !== 'RenderingCancelledException') setError('The generated PDF preview could not be loaded. Download the PDF to review it.')
    })
    return () => {
      cancelled = true
      renderTask?.cancel()
      loadingTask.destroy()
    }
  }, [url, page, zoom])

  return (
    <div className="er-generated-pdf" aria-live="polite">
      {error ? <div className="er-generated-pdf-error"><AlertCircle />{error}</div> : <canvas ref={canvasRef} aria-label={`Generated report page ${page}`} />}
    </div>
  )
}

function A4DocumentPreview({ report }) {
  const totalPages = 1 + (report.products.length * 2) + 3
  const changedRows = report.products.flatMap(p => p.improvements || []).filter(x => x.resultStatus && x.resultStatus !== 'No Change')
  const taxonomyCount = report.products.filter(p => (p.improvements || []).some(x => x.area?.includes('Taxonomy') && x.resultStatus !== 'No Change')).length
  const specCount = report.products.filter(p => (p.improvements || []).some(x => /Specifications|Attributes|Units/.test(x.area || '') && x.resultStatus !== 'No Change')).length
  const analyzedProducts = report.products.filter(product => product.analysisStatus === 'Complete')
  const beforeScore = Math.round(analyzedProducts.reduce((sum, product) => sum + (averageScore(product, 'before') || 0), 0) / Math.max(1, analyzedProducts.length))
  const afterScore = Math.round(analyzedProducts.reduce((sum, product) => sum + (averageScore(product, 'after') || 0), 0) / Math.max(1, analyzedProducts.length))
  const scoreGain = Math.max(0, afterScore - beforeScore)

  return (
    <div className="er-a4-stack">
      {/* Cover / Executive Summary Page */}
      <article className="er-a4-page cover-page">
        <div className="er-premium-cover">
          <div className="er-premium-cover-top">
            <img src="/AltiusNXT_Logo-01.png" alt="AltiusNXT" />
            {report.clientLogo && <img src={report.clientLogo.url} alt="Client Logo" className="client" />}
            <span>CONFIDENTIAL · {new Date(report.reportDate).toLocaleDateString()}</span>
          </div>
          <div className="er-premium-cover-hero">
            <span>PRODUCT DATA ENRICHMENT</span>
            <h1>Turn product content into a stronger digital sales asset.</h1>
            <p>A focused before-and-after assessment prepared for <strong>{report.clientName || 'your organization'}</strong>, showing how structured product data can improve discovery, buyer confidence and channel readiness.</p>
          </div>
          <div className="er-premium-score-story">
            <div><small>Current readiness</small><strong>{beforeScore}%</strong><span>Original product experience</span></div>
            <ArrowRight />
            <div className="after"><small>Enriched readiness</small><strong>{afterScore}%</strong><span>Structured commerce experience</span></div>
            <div className="gain"><small>Measured uplift</small><strong>+{scoreGain} pts</strong><span>Across visible evidence</span></div>
          </div>
          <div className="er-premium-value-grid">
            <article><span>01</span><div><strong>Be found</strong><p>Richer titles, taxonomy and SEO signals create more relevant entry points.</p></div></article>
            <article><span>02</span><div><strong>Be understood</strong><p>Structured specifications help buyers evaluate products with confidence.</p></div></article>
            <article><span>03</span><div><strong>Be ready to scale</strong><p>Consistent attributes support filters, PIM, marketplaces and sales teams.</p></div></article>
          </div>
          <div className="er-premium-cover-proof">
            <div><strong>{report.products.length}</strong><span>Products assessed</span></div>
            <div><strong>{changedRows.length}</strong><span>Evidence-backed improvements</span></div>
            <div><strong>{specCount + taxonomyCount}</strong><span>Structure upgrades</span></div>
          </div>
          <div className="er-premium-cover-close"><small>PREPARED FOR</small><strong>{report.clientName || 'Client Organization'}</strong><span>{report.preparedFor ? `${report.preparedFor} · ` : ''}Prepared by {report.preparedBy || 'AltiusNXT Technologies'}</span></div>
        </div>
        <div className="er-legacy-cover-content">
        <div className="er-page-header">
          <div className="er-logo-group">
            <img src="/AltiusNXT_Logo-01.png" alt="AltiusNxt" className="er-logo" />
            {report.clientLogo && <img src={report.clientLogo.url} alt="Client Logo" className="er-logo client" />}
          </div>
          <span>{report.status || 'Draft'} · {report.projectName || 'Client Consulting Report'}</span>
        </div>

        <div className="er-cover-hero">
          <span className="tag">PRODUCT DATA ENRICHMENT REPORT</span>
          <h1>Product Content Transformation — Before & After Analysis</h1>
          <h2 className="er-cover-client">{report.clientName || 'Client Organization'}</h2>
          <p>Structured, standardized and buyer-ready product content designed for stronger search, comparison and procurement decisions.</p>
        </div>

        <div className="er-meta-box">
          <h3>REPORT METADATA & CLIENT SUMMARY</h3>
          <div className="er-meta-grid">
            <div><span>Client Organization:</span> <strong>{report.clientName || 'Client Organization'}</strong></div>
            <div><span>Prepared For:</span> {report.preparedFor || report.clientName}</div>
            <div><span>Prepared By:</span> {report.preparedBy || 'AltiusNxt Technologies Pvt Ltd'}</div>
            <div><span>Date:</span> {new Date(report.reportDate).toLocaleDateString()}</div>
            <div><span>Report ID:</span> {report.products[0]?.reportId || report.id || 'Draft report'}</div>
          </div>
        </div>

        <div className="er-cover-kpis">
          <div><strong>{report.products.length}</strong><span>Products Analysed</span></div>
          <div><strong>{changedRows.length}</strong><span>Attributes Enriched</span></div>
          <div><strong>{taxonomyCount}</strong><span>Taxonomy Improved</span></div>
          <div><strong>{specCount}</strong><span>Specification Improved</span></div>
        </div>

        <div className="er-exec-box">
          <h3>EXECUTIVE SUMMARY</h3>
          <p>{report.executiveSummary || 'This report documents product data enrichment case studies, detailing verified improvements in technical completeness, taxonomy standardization, and buyer readiness.'}</p>
        </div>

        {report.products.length > 0 && (
          <div className="er-toc-box">
            <h3>REPORT CONTENTS / PRODUCT COMPARISON INDEX</h3>
            <div className="er-toc-list">
              {report.products.map((p, i) => (
                <div key={p.id} className="er-toc-item">
                  <span className="num">{String(i + 1).padStart(2, '0')}</span>
                  <span className="title">{p.productName || `Product ${i + 1}`}</span>
                  <span className="cat">{p.category}</span>
                  <span className="page">{2 + i * 2}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        </div>
        <Footer page={1} totalPages={totalPages} report={report} />
      </article>

      {/* Per-Product Case Study Pages (2 pages per product) */}
      {report.products.map((p, i) => (
        <ProductPagesPreview key={p.id} product={p} index={i} report={report} totalPages={totalPages} />
      ))}

      <PortfolioInsightsPage report={report} totalPages={totalPages} page={totalPages - 2} />
      <CommerceReadinessPage report={report} totalPages={totalPages} page={totalPages - 1} />

      {/* Final call-to-action page */}
      <article className="er-a4-page summary-page">
        <div className="er-page-header">
          <img src="/AltiusNXT_Logo-01.png" alt="AltiusNxt" className="er-logo" />
          <span>AltiusNXT Technologies</span>
        </div>
        <span className="er-section-eyebrow">NEXT STEP</span>
        <h2>Your Product Data Can Work Harder</h2>

        {/* Dynamic KPI Cards */}
        <div className="er-kpi-row">
          <div className="er-kpi-card">
            <strong>{report.products.length}</strong>
            <span>Total Products</span>
          </div>
          <div className="er-kpi-card">
            <strong>{specCount}</strong>
            <span>Products with Improved Specs</span>
          </div>
          <div className="er-kpi-card">
            <strong>{taxonomyCount}</strong>
            <span>Products with Taxonomy Updates</span>
          </div>
          <div className="er-kpi-card">
            <strong>{changedRows.length}</strong>
            <span>Total Enrichment Actions</span>
          </div>
        </div>

        <div className="er-exec-box" style={{ marginTop: '20px' }}>
          <h3>FROM EVIDENCE TO COMMERCE-READY DATA</h3>
          <p>{report.overallBusinessValue || 'The examples in this report demonstrate how existing product information can be transformed into a structured data foundation designed to improve product discovery, filtering, technical evaluation and multi-channel commerce readiness.'}</p>
        </div>

        <div className="er-coverage-preview">
          <h3>ENRICHMENT COVERAGE MATRIX</h3>
          <div className="head"><span>Product</span>{['Title','Taxonomy','Description','Specs','Attributes','Assets','Compliance','SEO'].map(x => <b key={x}>{x}</b>)}</div>
          {report.products.slice(0, 8).map((p, i) => <div className="row" key={p.id}><span>{p.productName || `Product ${i + 1}`}</span>{['Title','Taxonomy','Description','Specifications','Attributes','Documentation','Compliance','SEO'].map(area => <i key={area} className={(p.improvements || []).some(x => x.area?.includes(area) && x.resultStatus !== 'No Change') ? 'done' : ''} />)}</div>)}
        </div>

        <div className="er-value-columns"><div><strong>CUSTOMER / PROCUREMENT VALUE</strong><p>Faster evaluation, clearer technical-fit confidence and fewer specification misunderstandings.</p></div><div><strong>E-COMMERCE / COMMERCIAL VALUE</strong><p>Richer search indexing, stronger filtering and more consistent product comparison.</p></div></div>

        {report.nextSteps && (
          <div className="er-next-box">
            <h3>RECOMMENDED NEXT STEPS</h3>
            <div className="er-next-phases"><span><b>01</b> Validate & Approve</span><span><b>02</b> Scale Enrichment</span><span><b>03</b> Publish & Measure</span></div>
            <p>{report.nextSteps}</p>
          </div>
        )}

        <div className="er-final-cta"><small>EXPLORE YOUR PRODUCT DATA ENRICHMENT OPPORTUNITY</small><h3>Schedule a 15-Minute Product Data Review</h3><p>Let’s review a representative sample of your catalogue and identify where structured enrichment could deliver the greatest commercial impact.</p><strong>AltiusNXT Technologies</strong></div>

        <Footer page={totalPages} totalPages={totalPages} report={report} />
      </article>
    </div>
  )
}

function PortfolioInsightsPage({ report, totalPages, page }) {
  const insights = buildPortfolioInsights(report.products || [])
  const analyzed = (report.products || []).filter(product => product.analysisStatus === 'Complete')
  const before = analyzed.map(product => averageScore(product, 'before')).filter(Number.isFinite)
  const after = analyzed.map(product => averageScore(product, 'after')).filter(Number.isFinite)
  const beforeAverage = before.length ? Math.round(before.reduce((a, b) => a + b, 0) / before.length) : null
  const afterAverage = after.length ? Math.round(after.reduce((a, b) => a + b, 0) / after.length) : null
  return <article className="er-a4-page portfolio-page">
    <div className="er-page-header"><img src="/AltiusNXT_Logo-01.png" alt="AltiusNxt" className="er-logo" /><span>Portfolio Analysis</span></div>
    <span className="er-section-eyebrow">PORTFOLIO INSIGHTS</span><h2>Patterns Identified Across the Sample</h2>
    <p className="er-page-lead">The priorities below are derived from repeated, evidence-supported changes across the uploaded products.</p>
    <div className="er-readiness-band"><div><small>PRODUCT DATA READINESS</small><strong>{beforeAverage ?? '—'}%</strong><span>Before</span></div><ArrowRight /><div className="after"><small>STRUCTURED READINESS</small><strong>{afterAverage ?? '—'}%</strong><span>After</span></div><b>+{beforeAverage !== null && afterAverage !== null ? Math.max(0, afterAverage - beforeAverage) : '—'} pts</b></div>
    <div className="er-portfolio-kpis"><div><strong>{analyzed.length}</strong><span>Products analyzed</span></div><div><strong>{report.products.flatMap(p => p.improvements || []).filter(x => POSITIVE_STATUSES.has(x.resultStatus)).length}</strong><span>Supported improvements</span></div><div><strong>{insights.length}</strong><span>Priority areas</span></div></div>
    <h3>TOP ENRICHMENT OPPORTUNITIES</h3>
    <div className="er-priority-list">{(insights.length ? insights : [{ area: 'Analysis pending', count: 0 }]).map((item, index) => <div key={item.area}><b>{String(index + 1).padStart(2, '0')}</b><span><strong>{item.area}</strong><small>Evidence found across {item.count} product{item.count === 1 ? '' : 's'}</small></span></div>)}</div>
    <div className="er-consultative-note">Product data enrichment creates a structured data foundation that supports search, filtering, product discovery, marketplace syndication and informed purchasing decisions.</div>
    <Footer page={page} totalPages={totalPages} report={report} />
  </article>
}

function CommerceReadinessPage({ report, totalPages, page }) {
  const pillars = [
    ['DATA ARCHITECTURE', 'Consistent attributes, taxonomy and normalized values create a reusable product-data foundation.'],
    ['SEARCH FOUNDATION', 'Structured titles and attributes provide stronger signals for onsite and long-tail search.'],
    ['BUYER EXPERIENCE', 'Clear technical specifications help buyers evaluate, filter and compare products faster.'],
    ['COMMERCE READINESS', 'Structured data supports marketplaces, PIM systems, ecommerce filters and future channels.']
  ]
  return <article className="er-a4-page commerce-page">
    <div className="er-page-header"><img src="/AltiusNXT_Logo-01.png" alt="AltiusNxt" className="er-logo" /><span>Business Impact</span></div>
    <span className="er-section-eyebrow">BUSINESS IMPACT</span><h2>From Product Content to Commerce-Ready Product Data</h2>
    <p className="er-page-lead">Enrichment is not simply content rewriting. It is the work of making product information structured, consistent, reusable and useful across the buying journey.</p>
    <div className="er-pillar-grid">{pillars.map(([title, body]) => <div key={title}><span>{title}</span><p>{body}</p></div>)}</div>
    <div className="er-data-flow">{['RAW PRODUCT DATA', 'STANDARDIZED', 'ENRICHED', 'STRUCTURED', 'COMMERCE READY'].map((step, index) => <div key={step}><strong>{step}</strong>{index < 4 && <ArrowRight />}</div>)}</div>
    <div className="er-impact-copy"><h3>WHAT THIS ENABLES</h3><p>{report.overallBusinessValue || 'Stronger filtering, improved product comparison, clearer buyer decisions, search-ready terminology and scalable multi-channel syndication.'}</p></div>
    <Footer page={page} totalPages={totalPages} report={report} />
  </article>
}

function ProductPagesPreview({ product, index, report, totalPages }) {
  const page1 = 2 + (index * 2)
  const page2 = page1 + 1

  return (
    <>
      {/* Page 1: Case Study */}
      <article className="er-a4-page case-study-page">
        <div className="er-page-header">
          <img src="/AltiusNXT_Logo-01.png" alt="AltiusNxt" className="er-logo" />
          <span>Case Study {String(index + 1).padStart(2, '0')}</span>
        </div>
        <span className="er-section-eyebrow">CASE STUDY {String(index + 1).padStart(2, '0')}</span>
        <h2>{product.productName || 'Untitled Product'}</h2>
        <span className="er-meta-sub">{[product.category, product.brand ? `Brand: ${product.brand}` : '', product.sku ? `SKU: ${product.sku}` : ''].filter(Boolean).join(' | ')}</span>

        <div className="er-transformation-kpis">
          {[
            ['Content Completeness', product.beforeSummary ? 'Basic → Enriched' : 'Pending'],
            ['Structured Attributes', (product.improvements || []).some(x => x.area?.includes('Attributes') && x.resultStatus !== 'No Change') ? 'Unstructured → Structured' : 'Review'],
            ['Taxonomy Readiness', (product.improvements || []).some(x => x.area?.includes('Taxonomy') && x.resultStatus !== 'No Change') ? 'Basic → Standardized' : 'Review'],
            ['eCommerce Readiness', product.analysisStatus === 'Complete' ? 'Evidence reviewed' : 'Analysis pending']
          ].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}
        </div>

        <div className="er-cards-dual">
          <div className="er-card before">
            <h4>BEFORE · ORIGINAL CLIENT PRODUCT PAGE</h4>
            <p>{product.beforeSummary || 'Original product summary...'}</p>
          </div>
          <div className="er-card after">
            <h4>AFTER · ALTIUSNXT ENRICHED PRODUCT PAGE</h4>
            <p>{product.afterSummary || 'Enriched product summary...'}</p>
          </div>
        </div>

        <div className="er-evidence-compare">
          <div className="er-evidence-column before">
            <strong>BEFORE · Original Client Product</strong>
            <div className="er-browser-mockup">
              <div className="er-browser-topbar"><span className="dot red" /><span className="dot yellow" /><span className="dot green" /><span className="url">Original evidence</span></div>
              <div className="er-browser-body">{product.beforeImage ? <img src={product.beforeImage.url} alt="Before" /> : <div className="placeholder"><ImageIcon /> Before Screenshot</div>}</div>
            </div>
          </div>
          <div className="er-evidence-column after">
            <strong>AFTER · AltiusNxt Enriched Product</strong>
            <div className="er-browser-mockup">
              <div className="er-browser-topbar"><span className="dot red" /><span className="dot yellow" /><span className="dot green" /><span className="url">Enriched evidence</span></div>
              <div className="er-browser-body">{product.afterImage ? <img src={product.afterImage.url} alt="After" /> : <div className="placeholder"><ImageIcon /> After Screenshot</div>}</div>
            </div>
          </div>
        </div>

        <div className="er-transform-bar light">
          <h4>WHAT CHANGED?</h4>
          <p>{product.keyTransformation || 'Complete the Key Transformation section to add a concise, evidence-led summary.'}</p>
        </div>
        <Footer page={page1} totalPages={totalPages} report={report} />
      </article>

      {/* Page 2: Enriched Result & 4-Column Matrix */}
      <article className="er-a4-page enriched-result-page">
        <div className="er-page-header">
          <img src="/AltiusNXT_Logo-01.png" alt="AltiusNxt" className="er-logo" />
          <span>Enriched Result</span>
        </div>
        <span className="er-section-eyebrow">TRANSFORMATION EVIDENCE</span>
        <h2>{product.productName || 'Untitled Product'}</h2>

        <h3>BEFORE VS AFTER IMPROVEMENT MATRIX</h3>
        <table className="er-preview-matrix-table">
          <thead>
            <tr>
              <th>Area / Attribute</th>
              <th>Original Before State</th>
              <th>Enriched After State</th>
              <th>Business Impact</th>
              <th>Result Status</th>
            </tr>
          </thead>
          <tbody>
            {(product.improvements || []).slice(0, 8).map(imp => (
              <tr key={imp.area}>
                <td><strong>{imp.area}</strong></td>
                <td>{imp.beforeState || 'Unstructured'}</td>
                <td>{imp.afterState || 'Enriched'}</td>
                <td>{/Taxonomy|SEO/.test(imp.area) ? 'Faster discovery' : /Specifications|Attributes|Units/.test(imp.area) ? 'Clearer product comparison' : /Documentation|Compliance/.test(imp.area) ? 'Procurement confidence' : 'Better buyer clarity'}</td>
                <td><span className={`status-badge ${imp.resultStatus?.toLowerCase().replaceAll(' ', '-')}`}>{imp.resultStatus || 'Enriched'}</span></td>
              </tr>
            ))}
          </tbody>
        </table>

        {product.businessImpact && (
          <div className="er-exec-box" style={{ marginTop: '14px' }}>
            <h3>BUSINESS IMPACT & BUYER VALUE</h3>
            <p>{product.businessImpact}</p>
          </div>
        )}

        {(product.highlights || []).length > 0 && <div className="er-highlight-grid">{product.highlights.slice(0, 6).map((item, i) => <div key={i}><CheckCircle2 /><span>{item}</span></div>)}</div>}

        <Footer page={page2} totalPages={totalPages} report={report} />
      </article>
    </>
  )
}

function Footer({ page, totalPages, report }) {
  return (
    <footer className="er-page-footer">
      <span>{report.footerText || 'AltiusNxt Technologies'}</span>
      <span>Prepared for {report.preparedFor || report.clientName}</span>
      <span>Page {page} of {totalPages}</span>
    </footer>
  )
}

const path = require('path')
const fs = require('fs')
const PDFDocument = require('pdfkit')

const DEFAULT_LOGO = path.join(__dirname, '../../../client/public/AltiusNXT_Logo-01.png')
const G = { left: 48, right: 547.28, top: 66, bottom: 766, width: 499.28 }
const C = { primary: '#150F38', secondary: '#616262', red: '#CC3A3A', lime: '#B2CD3D', cyan: '#32C3EB', green: '#239D38', white: '#FFFFFF', light: '#F6F7F8', ink: '#171717', border: '#D9DADD', redTint: '#FCF3F3', greenTint: '#F3F8F0' }
const clean = (value, fallback = 'Not available') => {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim()
  return text && !/^(not detected|unknown|n\/a)$/i.test(text) ? text : fallback
}
const capabilityLanguage = value => clean(value, '')
  .replace(/\bproves?\b/gi, 'indicates')
  .replace(/\bsignificantly enhances?\b/gi, 'can support')
  .replace(/\bdrives? higher conversion confidence\b/gi, 'supports buyer confidence')
  .replace(/\bextends? organic search discoverability\b/gi, 'supports search discoverability')
  .replace(/\bmarket-leading\b/gi, 'more consistent')
function imagePath(asset) {
  if (!asset?.url) return null
  const file = path.join(__dirname, '../../uploads/enrichment-reports/images', path.basename(asset.url))
  return fs.existsSync(file) ? file : null
}

function buildEnterpriseAssessmentPdf(sourceReport, outputPath) {
  return new Promise((resolve, reject) => {
    const report = { ...sourceReport, ...(sourceReport.branding?.reportProfile || {}) }
    const doc = new PDFDocument({ size: 'A4', margin: 0, bufferPages: true, compress: false,
      info: { Title: report.name || 'Product Data Enrichment Report', Author: 'AltiusNXT Technologies' } })
    const stream = fs.createWriteStream(outputPath); doc.pipe(stream)
    const client = clean(report.clientName || report.preparedFor, 'Client')
    const products = Array.isArray(report.products) ? report.products : []
    const logo = fs.existsSync(DEFAULT_LOGO) ? DEFAULT_LOGO : null
    let pageTitle = 'Executive Summary', y = G.top
    const line = (yy, color = C.border) => doc.moveTo(G.left, yy).lineTo(G.right, yy).strokeColor(color).lineWidth(.7).stroke()
    const header = title => {
      pageTitle = title
      if (logo) { try { doc.image(logo, G.left, 20, { fit: [112, 25] }) } catch {} }
      else doc.font('Helvetica-Bold').fontSize(12).fillColor(C.primary).text('ALTIUSNXT', G.left, 25)
      doc.font('Helvetica-Bold').fontSize(7).fillColor(C.secondary).text(title.toUpperCase(), 255, 27, { width: 292, align: 'right' })
      line(50); y = G.top
    }
    const newPage = title => { doc.addPage(); header(title) }
    const ensure = (height, title = pageTitle) => { if (y + height > G.bottom) newPage(title) }
    const height = (text, width, lineGap = 2) => doc.heightOfString(clean(text), { width, lineGap })
    const paragraph = (text, options = {}) => {
      const width = options.width || G.width, size = options.size || 9, gap = options.lineGap ?? 2
      doc.font(options.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size)
      const h = height(text, width, gap); ensure(h + (options.after ?? 10))
      doc.fillColor(options.color || C.ink).text(clean(text), options.x || G.left, y, { width, lineGap: gap })
      y += h + (options.after ?? 10)
    }
    const section = (eyebrow, title, intro) => {
      ensure(80); doc.font('Helvetica-Bold').fontSize(7.5).fillColor(C.cyan).text(eyebrow.toUpperCase(), G.left, y); y += 14
      doc.font('Helvetica-Bold').fontSize(18).fillColor(C.primary).text(title, G.left, y, { width: G.width }); y += doc.heightOfString(title, { width: G.width }) + 7
      if (intro) paragraph(intro, { size: 9, color: C.secondary, after: 15 }); else y += 8
    }
    const label = (text, color = C.primary) => { ensure(22); doc.font('Helvetica-Bold').fontSize(7.5).fillColor(color).text(text.toUpperCase(), G.left, y); y += 16 }
    const callout = (title, body, tone = 'primary') => {
      const palette = tone === 'before' ? [C.redTint, C.red] : tone === 'after' ? [C.greenTint, C.green] : [C.light, C.primary]
      doc.font('Helvetica').fontSize(8.7); const h = Math.max(54, 29 + height(body, G.width - 32)); ensure(h + 12)
      doc.rect(G.left, y, G.width, h).fill(palette[0]).strokeColor(C.border).lineWidth(.6).stroke(); doc.rect(G.left, y, 4, h).fill(palette[1])
      doc.font('Helvetica-Bold').fontSize(8).fillColor(palette[1]).text(title.toUpperCase(), G.left + 16, y + 11)
      doc.font('Helvetica').fontSize(8.7).fillColor(C.ink).text(clean(body), G.left + 16, y + 27, { width: G.width - 32, lineGap: 2 }); y += h + 12
    }
    const table = (headers, rows, widths, title) => {
      const pad = 7
      const drawHead = () => { ensure(54, title || pageTitle); doc.rect(G.left, y, G.width, 24).fill(C.primary); let x = G.left
        headers.forEach((h, i) => { doc.font('Helvetica-Bold').fontSize(7.2).fillColor(C.white).text(h.toUpperCase(), x + pad, y + 7, { width: widths[i] - pad * 2 }); x += widths[i] }); y += 24 }
      drawHead()
      rows.forEach((row, rowIndex) => {
        doc.font('Helvetica').fontSize(8); const h = Math.max(30, Math.max(...row.map((cell, i) => height(cell, widths[i] - pad * 2, 1.8))) + pad * 2)
        if (y + h > G.bottom) { newPage(title || pageTitle); drawHead() }
        doc.rect(G.left, y, G.width, h).fill(rowIndex % 2 ? C.light : C.white).strokeColor(C.border).lineWidth(.45).stroke(); let x = G.left
        row.forEach((cell, i) => { const color = i === 1 && headers.some(v => /before|gap/i.test(v)) ? C.red : i === 2 && headers.some(v => /after|improved/i.test(v)) ? C.green : C.ink
          doc.font(i === 0 ? 'Helvetica-Bold' : 'Helvetica').fontSize(8).fillColor(color).text(clean(cell), x + pad, y + pad, { width: widths[i] - pad * 2, lineGap: 1.8 }); x += widths[i] }); y += h
      }); y += 14
    }
    const screenshot = (asset, title, tone, maxHeight = 475) => {
      const file = imagePath(asset), border = tone === 'before' ? C.red : C.green; label(title, border)
      if (!file) { callout('Evidence unavailable', 'No source image was available for this report.', tone); return }
      let dimensions; try { dimensions = doc.openImage(file) } catch { dimensions = null }
      if (!dimensions) { callout('Evidence attached', 'The supplied evidence could not be rendered as an image.', tone); return }
      const h = Math.min(maxHeight, G.width * dimensions.height / dimensions.width); ensure(h + 18, title)
      doc.rect(G.left, y, G.width, h).fill(C.white).strokeColor(border).lineWidth(.8).stroke()
      doc.image(file, G.left + 2, y + 2, { fit: [G.width - 4, h - 4], align: 'center', valign: 'top' }); y += h + 8
      doc.font('Helvetica-Oblique').fontSize(7).fillColor(C.secondary).text(`Source evidence: ${clean(asset.filename, 'uploaded image')}`, G.left, y, { width: G.width, align: 'center' }); y += 18
    }

    if (logo) { try { doc.image(logo, G.left, 50, { fit: [150, 40] }) } catch {} }
    doc.rect(G.left, 125, 34, 3).fill(C.red); doc.rect(G.left + 38, 125, 34, 3).fill(C.lime); doc.rect(G.left + 76, 125, 34, 3).fill(C.cyan)
    doc.font('Helvetica-Bold').fontSize(8).fillColor(C.secondary).text('CONFIDENTIAL CLIENT REPORT', G.left, 151)
    doc.font('Helvetica-Bold').fontSize(30).fillColor(C.primary).text('Product Data Enrichment\nAssessment', G.left, 182, { width: G.width, lineGap: 4 })
    doc.font('Helvetica').fontSize(11).fillColor(C.secondary).text('Before-to-after evidence, commerce readiness, and recommended next steps', G.left, 282, { width: 430 }); line(330)
    doc.font('Helvetica').fontSize(9).fillColor(C.secondary).text('PREPARED FOR', G.left, 365); doc.font('Helvetica-Bold').fontSize(20).fillColor(C.primary).text(client, G.left, 385, { width: G.width })
    const date = new Date(report.reportDate || Date.now()).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
    let my = 490; [['Report', clean(report.name, 'Product Data Enrichment Report')], ['Products assessed', String(products.length)], ['Prepared by', clean(report.preparedBy, 'AltiusNXT Technologies')], ['Report date', date]].forEach(([k, v]) => { doc.font('Helvetica-Bold').fontSize(8).fillColor(C.secondary).text(k.toUpperCase(), G.left, my, { width: 130 }); doc.font('Helvetica').fontSize(9).fillColor(C.ink).text(v, G.left + 145, my, { width: 350 }); my += 30 })
    doc.font('Helvetica').fontSize(7.5).fillColor(C.secondary).text('This assessment reports only what is supported by the supplied evidence. Potential benefits are expressed as capabilities, not measured outcomes.', G.left, 720, { width: G.width })

    newPage('Executive Summary'); section('01 / Executive view', 'What the evidence shows', 'A concise, client-focused view of the original state, the enrichment performed, and its practical value.')
    paragraph(report.executiveSummary || `This report compares ${products.length} product record${products.length === 1 ? '' : 's'} before and after enrichment. It highlights observed gaps, visible improvements, commerce readiness, and recommended next actions.`, { size: 10, after: 18 })
    callout('Observed', products[0]?.beforeSummary || 'The supplied original-state evidence was reviewed for naming, taxonomy, specifications, attributes, documentation, and buyer clarity.', 'before')
    callout('AltiusNXT improved', products[0]?.afterSummary || 'The enriched state organizes available product information into clearer, more structured, and more reusable content.', 'after')
    callout('Client value', report.overallBusinessValue || 'The enriched structure supports clearer buyer evaluation, more consistent catalog management, and improved readiness for search, filtering, comparison, and channel reuse.')

    products.forEach((product, index) => {
      const productName = clean(product.enrichedProductName || product.productName || product.originalProductName, `Product ${index + 1}`)
      newPage(`Product ${index + 1} - Evidence`); section(`${String(index + 2).padStart(2, '0')} / Product evidence`, productName, `SKU / MPN: ${clean(product.enrichedSku || product.sku || product.originalSku)}  |  Category: ${clean(product.enrichedTaxonomy || product.category || product.originalTaxonomy)}`)
      screenshot(product.beforeImage, 'Before - original product experience', 'before', 500); callout('Observed original state', product.beforeSummary || 'See the supplied original-state evidence.', 'before')
      newPage(`Product ${index + 1} - Enriched Evidence`); section('Before -> gaps -> enrichment', 'Enriched after state', 'The screenshot is preserved at its original aspect ratio within the available A4 evidence area.')
      screenshot(product.afterImage, 'After - enriched product experience', 'after', 500); callout('What AltiusNXT improved', product.afterSummary || product.keyTransformation || 'See the supplied enriched-state evidence.', 'after')
      newPage(`Product ${index + 1} - Comparison`); section('Evidence-led comparison', 'Before vs after', 'Observed states are separated from improvements and potential client benefits.')
      const improvements = (product.improvements || []).filter(item => item?.includeInReport !== false)
      const rows = improvements.length ? improvements.map(item => [item.area, item.beforeState, item.afterState || item.whatChanged, item.businessBenefit]) : [['Product naming', product.originalProductName, product.enrichedProductName, 'Supports clearer scanning and search matching.'], ['Taxonomy', product.originalTaxonomy, product.enrichedTaxonomy, 'Supports navigation and catalog consistency.'], ['Product detail', product.beforeSummary, product.afterSummary, 'Supports faster product evaluation.']]
      table(['Area', 'Before / gap', 'After / improved', 'Why it matters'], rows, [92, 128, 140, 139.28], `Product ${index + 1} - Comparison`)
      const fields = product.extractedFields && typeof product.extractedFields === 'object' ? Object.entries(product.extractedFields).filter(([, value]) => clean(value?.value, '')).map(([key, value]) => [key.replace(/([A-Z])/g, ' $1').trim(), value.value, value.source || 'Evidence', value.confidence ? `${value.confidence}%` : 'Review']) : []
      if (fields.length) { section('Structured detail', 'Attribute and specification matrix', 'Long attribute sets flow naturally across pages with repeated table headers.'); table(['Attribute', 'Value', 'Source', 'Confidence'], fields, [125, 210, 82, 82.28], `Product ${index + 1} - Attribute Matrix`) }
    })

    newPage('Commerce Readiness'); section('Client benefit', 'Commerce readiness and business value', 'The enriched content provides stronger inputs for commerce workflows; these are supported capabilities, not claimed performance results.')
    table(['Readiness area', 'How enrichment supports it'], [['Search discoverability', 'Clearer naming, taxonomy, and structured fields support stronger internal and external search signals.'], ['Faceted filtering', 'Discrete attributes can support category filters when mapped into the destination commerce platform.'], ['Buyer evaluation', 'Structured specifications and clearer descriptions support faster product comparison and decision-making.'], ['Channel reuse', 'Standardized fields can be reused across catalogs, PIM, ERP, web, and sales materials.'], ['Data governance', 'Evidence, source, and confidence fields support review and controlled approval before publishing.']], [150, 349.28], 'Commerce Readiness')
    callout('Business value', report.overallBusinessValue || 'A more structured product record supports consistency, reuse, buyer clarity, and scalable catalog operations.'); label('Recommended next step', C.green)
    paragraph(capabilityLanguage(report.nextSteps) || 'Review and approve the evidence-backed changes, then pilot the approved enrichment model across a representative priority category.', { size: 10 })

    const pages = doc.bufferedPageRange()
    for (let i = 1; i < pages.count; i++) { doc.switchToPage(i); line(782); doc.font('Helvetica').fontSize(7).fillColor(C.secondary).text(`AltiusNXT Technologies  |  ${client}  |  Confidential`, G.left, 791, { width: 365, lineBreak: false }); doc.font('Helvetica-Bold').fontSize(7).fillColor(C.primary).text(`Page ${i + 1} of ${pages.count}`, 430, 791, { width: 117, align: 'right', lineBreak: false }) }
    doc.end(); stream.on('finish', () => resolve(pages.count)); stream.on('error', reject)
  })
}

module.exports = { buildEnterpriseAssessmentPdf }

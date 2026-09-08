const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const PDFDocument = require('pdfkit')

const W = 595.28, H = 841.89, L = 34, R = 561.28, CW = R - L, TOP = 82, BOTTOM = 775
const COLOR = { ink: '#202020', gray: '#616262', line: '#D8DADD', light: '#F6F7F8', label: '#F0F1F2', red: '#CC3A3A', blue: '#1688C9', green: '#239D38', primary: '#150F38', white: '#FFFFFF' }
const logo = path.join(__dirname, '../../../client/public/AltiusNXT_Logo-01.png')
const uploads = path.join(__dirname, '../../uploads/enrichment-reports/images')
const cache = path.join(__dirname, '../../uploads/enrichment-reports/pdf-evidence-cache')
const clean = (v, fallback = 'Not available') => { const s = String(v ?? '').replace(/\s+/g, ' ').trim(); return s && !/^(not detected|unknown|n\/a)$/i.test(s) ? s : fallback }
const safeLanguage = v => clean(v, '').replace(/\bproves?\b/gi, 'demonstrates').replace(/\bsignificantly enhances?\b/gi, 'can support').replace(/\bmarket-leading\b/gi, 'more consistent')
const fileFor = asset => asset?.url ? path.join(uploads, path.basename(asset.url)) : null
const pdfTool = () => process.platform === 'win32' ? path.join(process.env.USERPROFILE || '', '.cache/codex-runtimes/codex-primary-runtime/dependencies/native/poppler/Library/bin/pdftoppm.exe') : 'pdftoppm'

function evidenceFile(asset) {
  const source = fileFor(asset)
  if (!source || !fs.existsSync(source)) return null
  if (path.extname(source).toLowerCase() !== '.pdf') return source
  fs.mkdirSync(cache, { recursive: true })
  const page = Math.max(1, Number(asset.pdfPage || 1)), stem = `${path.basename(source, '.pdf')}-p${page}-450dpi`, out = path.join(cache, `${stem}.png`)
  if (!fs.existsSync(out)) execFileSync(pdfTool(), ['-f', `${page}`, '-l', `${page}`, '-singlefile', '-png', '-r', '450', source, path.join(cache, stem)], { windowsHide: true, timeout: 120000 })
  return out
}

function buildReferencePdf(source, output) {
  return new Promise((resolve, reject) => {
    try {
      const report = { ...source, ...(source.branding?.reportProfile || {}) }
      const copy = source.branding?.reportContent || {}
      const products = Array.isArray(report.products) ? report.products : []
      const client = clean(report.clientName || report.preparedFor, 'Client')
      const recipientName = clean(report.recipientName, '')
      const preparedFor = recipientName && recipientName.toLowerCase() !== client.toLowerCase() ? `${recipientName}, ${client}` : clean(report.preparedFor || report.clientName, client)
      const preparedBy = clean(report.preparedBy, 'AltiusNXT Technologies Pvt Ltd')
      const preparedByDesignation = clean(report.preparedByDesignation, '')
      const preparedByCompany = clean(report.preparedByCompany, 'AltiusNXT Technologies Pvt Ltd')
      const preparedByPhone = clean(report.preparedByPhone, '')
      const preparedByEmail = clean(report.preparedByEmail, '')
      const preparedByWebsite = clean(report.preparedByWebsite, '')
      const date = new Date(report.reportDate || Date.now()).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
      const doc = new PDFDocument({ size: 'A4', margin: 0, bufferPages: true, compress: true, pdfVersion: '1.7', info: { Title: report.name || 'PDP Enrichment Report', Author: 'AltiusNXT Technologies Pvt Ltd', Subject: `Product data enrichment audit for ${client}` } })
      fs.mkdirSync(path.dirname(output), { recursive: true })
      const stream = fs.createWriteStream(output); doc.pipe(stream)
      const line = y => doc.moveTo(L, y).lineTo(R, y).strokeColor(COLOR.line).lineWidth(.6).stroke()
      const header = (title = 'PDP ENRICHMENT REPORT', sub = 'AltiusNXT Technologies Pvt Ltd') => {
        if (fs.existsSync(logo)) doc.image(logo, L, 28, { fit: [82, 27] })
        doc.x = 0; doc.y = 0
        doc.font('Helvetica-Bold').fontSize(9).fillColor('#505050').text(title, 295, 33, { width: R - 295, align: 'right' })
        doc.x = 0; doc.y = 0
        doc.font('Helvetica').fontSize(7.5).fillColor('#8A8A8A').text(sub, 295, 47, { width: R - 295, align: 'right' })
        doc.rect(L, 61, 47, 1.8).fill(COLOR.red); line(70)
      }
      const page = (withHeader = true, title, sub) => {
        doc.x = 0
        doc.y = 0
        doc.addPage({ size: 'A4', margin: 0 })
        // Reset PDFKit's flowing-text cursor so a previous tall evidence/table
        // page cannot trigger an implicit continuation while drawing the header.
        doc.x = 0
        doc.y = 0
        if (withHeader) header(title, sub)
      }
      const h = (text, width, size = 9, gap = 2, bold = false) => { doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size); return doc.heightOfString(clean(text), { width, lineGap: gap }) }
      const text = (value, x, y, width, o = {}) => { const options = { width, lineGap: o.gap ?? 2, align: o.align || 'left' }; if (Number.isFinite(o.height)) options.height = o.height; doc.x = 0; doc.y = 0; doc.font(o.bold ? 'Helvetica-Bold' : o.italic ? 'Helvetica-Oblique' : 'Helvetica').fontSize(o.size || 9).fillColor(o.color || COLOR.ink).text(clean(value), x, y, options); return h(value, width, o.size || 9, o.gap ?? 2, o.bold) }
      const title = (value, y, size = 16, color = COLOR.ink, bold = true) => text(value, L, y, CW, { size, color, bold, gap: 1.4 })
      const callout = (label, body, y, accent = COLOR.blue) => { const bh = h(body, CW - 28, 8.5, 1.8), box = Math.max(58, bh + 32); doc.rect(L, y, CW, box).fill(COLOR.light); doc.rect(L, y, 3, box).fill(accent); text(`${label}:`, L + 12, y + 10, CW - 24, { size: 8, bold: true }); text(body, L + 12, y + 24, CW - 24, { size: 8.5, gap: 1.8 }); return box }
      const rendered = new Set(), expected = new Set(), validationIssues = []
      const markExpected = key => expected.add(key)
      const markRendered = key => rendered.add(key)
      const validateBox = (kind, top, height) => {
        if (!Number.isFinite(top) || !Number.isFinite(height) || height < 0) validationIssues.push(`${kind}: invalid geometry`)
        if (top < TOP - 1 || top + height > BOTTOM + 1) validationIssues.push(`${kind}: outside printable body (${Math.round(top)}-${Math.round(top + height)})`)
      }
      const freshFlowPage = (context = 'PDP ENRICHMENT REPORT') => { page(true, 'PDP ENRICHMENT REPORT', context); y = 88 }
      const ensure = (needed, context) => { if (y + needed > BOTTOM) freshFlowPage(context); return y }
      const fitChunk = (value, width, maxHeight, size = 8.5, gap = 2) => {
        const sourceText = clean(value, '')
        if (!sourceText) return ['', '']
        if (h(sourceText, width, size, gap) <= maxHeight) return [sourceText, '']
        let low = 1, high = sourceText.length, best = 0
        while (low <= high) {
          const mid = Math.floor((low + high) / 2)
          if (h(sourceText.slice(0, mid), width, size, gap) <= maxHeight) { best = mid; low = mid + 1 } else high = mid - 1
        }
        best = Math.max(1, best)
        const whitespace = sourceText.lastIndexOf(' ', best)
        if (whitespace > Math.max(0, best * 0.55)) best = whitespace
        return [sourceText.slice(0, best).trim(), sourceText.slice(best).trim()]
      }
      const flowText = (value, options = {}) => {
        let remaining = clean(value, ''), first = true
        const width = options.width || CW, size = options.size || 8.7, gap = options.gap ?? 2.2, context = options.context || 'Continued content'
        while (remaining) {
          const available = BOTTOM - y - (first ? 0 : 2)
          if (available < 42) freshFlowPage(context)
          const [chunk, rest] = fitChunk(remaining, width, BOTTOM - y, size, gap)
          const used = text(chunk, options.x || L, y, width, { size, gap, color: options.color, bold: options.bold, italic: options.italic })
          y += used + (rest ? 7 : (options.after ?? 12)); remaining = rest; first = false
          if (remaining) freshFlowPage(context)
        }
      }
      const flowCallout = (label, body, accent, context) => {
        const need = h(body, CW - 28, 8.5, 1.8) + 32
        if (need <= BOTTOM - TOP) { ensure(Math.max(58, need), context); y += callout(label, body, y, accent) + 10; return }
        ensure(42, context); text(`${label}:`, L + 12, y, CW - 24, { size: 8, bold: true }); y += 18; flowText(body, { x: L + 12, width: CW - 24, size: 8.5, gap: 1.8, context, after: 10 })
      }
      const flowHeading = (value, options = {}) => {
        const size = options.size || 9.5
        const needed = h(value, options.width || CW, size, 1.4, options.bold !== false) + (options.keepWith || 34)
        ensure(needed, options.context || value)
        const used = title(value, y, size, options.color || COLOR.ink, options.bold !== false)
        y += used + (options.after ?? 9)
      }

      const p0 = products[0] || {}, labelW = 116
      const originalName = clean(p0.originalProductName || p0.productName)
      const enrichedName = clean(p0.enrichedProductName || p0.productName)
      const productCategory = clean(p0.enrichedTaxonomy || p0.category || p0.originalTaxonomy || p0.productName)
      const originalCategory = clean(p0.originalTaxonomy || p0.category, '')
      const originalSku = clean(p0.originalSku || p0.sku, '')
      const enrichedSku = clean(p0.enrichedSku || p0.sku, '')
      const sourceMeta = [originalCategory && `Category: ${originalCategory}`, originalSku && `SKU: ${originalSku}`].filter(Boolean).join(' | ')
      const enrichedMeta = [enrichedSku && `SKU#: ${enrichedSku}`, productCategory && `Category: ${productCategory}`].filter(Boolean).join(' | ')
      const sourceLine = `${client} - ${originalName}${sourceMeta ? ` (${sourceMeta})` : ''}`
      const enrichedLine = `AltiusNxt - ${enrichedName}${enrichedMeta ? ` (${enrichedMeta})` : ''}`
      const preparedByLine = [preparedBy, preparedByDesignation, preparedByCompany].filter((value, index, values) => value && values.findIndex(other => other.toLowerCase() === value.toLowerCase()) === index).join(', ')
      const detailedIntro = `This report presents an objective Before & After audit and comparison of ${products.length === 1 ? 'a single Product Detail Page (PDP)' : `${products.length} Product Detail Pages (PDPs)`} for ${client}. The source listing for ${originalName} is evaluated against the enriched ${enrichedName} record on AltiusNxt. The audit covers source presentation, product naming, taxonomy, structured technical specifications, standardized attributes, search readiness, faceted filtering, and buyer decision support. Every finding is grounded in the supplied Before and After evidence.`
      const suppliedIntro = clean(report.executiveSummary, '')
      const openingNarrative = suppliedIntro.length >= 260 && !/^We reviewed\b/i.test(suppliedIntro) ? suppliedIntro : detailedIntro
      const reportTitle = clean(copy.reportTitle, 'Product Data Page (PDP) Enrichment Report')
      const benefitEvidence = (p0.improvements || []).map(item => clean(item.businessBenefit, '')).filter(Boolean).slice(0, 4).join('; ')
      const suppliedStrategic = clean(report.overallBusinessValue, '')
      const strategicSummary = suppliedStrategic.length >= 180
        ? suppliedStrategic
        : (benefitEvidence
            ? `The enriched product record converts evidence from the source listing into a structured commerce asset. The documented improvements support ${benefitEvidence}, while retaining clear review points for any attributes that still require supplier validation.`
            : `The enriched product record provides a clearer, attribute-rich foundation for search, filtering, product comparison, technical evaluation, and controlled reuse across commerce channels. Any information not visible in the supplied evidence remains identified for validation rather than being assumed.`)

      header(); let y = 88
      y += title(reportTitle, y, 18) + 8
      // Keep the established cover-page spacing, but omit the redundant red
      // "Before & After Comparison" subtitle requested by the user.
      y += h('Before & After Comparison', CW, 11.5, 1.4, true) + 15
      y += text(openingNarrative, L, y, CW, { size: 9.2, gap: 3 }) + 16
      ;[['Product Category', productCategory], ['Source (Before)', sourceLine], ['Enriched (After)', enrichedLine], ['Prepared For', preparedFor], ['Prepared By', preparedByLine], ['Audit Date', date]].forEach(([k, v]) => {
        const rh = Math.max(28, h(v, CW - labelW - 18, 8.4, 1.5) + 14)
        ensure(rh, 'Report profile continued')
        doc.rect(L, y, labelW, rh).fill(COLOR.label).strokeColor(COLOR.line).lineWidth(.45).stroke(); doc.rect(L + labelW, y, CW - labelW, rh).fill(COLOR.white).strokeColor(COLOR.line).stroke()
        text(k, L + 9, y + 9, labelW - 18, { size: 8, bold: true, color: '#454545' }); text(v, L + labelW + 9, y + 8, CW - labelW - 18, { size: 8.4, gap: 1.5 }); y += rh
      })
      y += 15; flowCallout(clean(copy.executiveSummaryHeading, 'Strategic Executive Summary'), strategicSummary, COLOR.blue, 'Strategic executive summary')

      products.forEach((product, index) => {
        const name = clean(product.enrichedProductName || product.productName || product.originalProductName, `Product ${index + 1}`)
        const before = clean(product.beforeSummary || product.originalDescription, 'Review the supplied original product listing.')
        const after = clean(product.afterSummary || product.enrichedDescription, 'Review the supplied enriched product record.')
        ;['beforeAnalysis','afterAnalysis','transformation','attributes','beforeImage','afterImage'].forEach(part => markExpected(`product:${index}:${part}`))
        freshFlowPage(`${name} - case study ${String(index + 1).padStart(2, '0')}`)
        text(`CASE STUDY ${String(index + 1).padStart(2, '0')}`, L, y, CW, { size: 7.5, bold: true, color: '#888888' }); y += 16
        y += title(name, y, 14.5) + 3; y += text(clean(product.enrichedTaxonomy || product.category || product.originalTaxonomy).toUpperCase(), L, y, CW, { size: 7.5, bold: true, color: '#0875BB' }) + 12
        const comparisonRows = (product.improvements || [])
          .filter(item => item?.includeInReport !== false)
          .map(item => ({
            area: clean(item.area, 'Product data'),
            before: clean(item.beforeState || item.before, ''),
            after: clean(item.afterState || item.after || item.whatChanged, '')
          }))
          .filter(item => item.before || item.after)
        if (!comparisonRows.length) comparisonRows.push({ area: 'Overall product page', before, after })
        const comparisonWidths = [105, 204, CW - 309]
        const comparisonHeader = continued => {
          if (continued) { text(`CASE STUDY ${String(index + 1).padStart(2, '0')} - COMPARISON CONTINUED`, L, y, CW, { size: 7.5, bold: true, color: '#888888' }); y += 18 }
          let x = L
          ;[['AREA', '#303030'], [`ORIGINAL (BEFORE - ${client.toUpperCase()})`, '#444444'], ['ENRICHED (AFTER - ALTIUSNXT)', COLOR.red]].forEach(([label, fill], column) => {
            doc.rect(x, y, comparisonWidths[column], 34).fill(fill).strokeColor(COLOR.white).lineWidth(.6).stroke()
            text(label, x + 8, y + 11, comparisonWidths[column] - 16, { size: 7.4, bold: true, color: COLOR.white, align: 'center' })
            x += comparisonWidths[column]
          })
          y += 34
        }
        comparisonHeader(false)
        comparisonRows.forEach((row, rowIndex) => {
          const values = [row.area, row.before || 'Not visible in source', row.after || 'No verified change']
          const rowHeight = Math.max(34, ...values.map((value, column) => h(value, comparisonWidths[column] - 16, 7.8, 1.8, column === 0) + 16))
          if (y + rowHeight > BOTTOM) { freshFlowPage(`${name} - Before/After comparison continued`); comparisonHeader(true) }
          validateBox(`Comparison row ${rowIndex + 1}`, y, rowHeight)
          let x = L
          values.forEach((value, column) => {
            doc.rect(x, y, comparisonWidths[column], rowHeight).fill(column === 0 ? COLOR.label : rowIndex % 2 ? '#FAFAFA' : COLOR.white).strokeColor(COLOR.line).lineWidth(.45).stroke()
            text(value, x + 8, y + 8, comparisonWidths[column] - 16, { size: 7.8, gap: 1.8, bold: column === 0, color: column === 2 ? '#303030' : COLOR.ink })
            x += comparisonWidths[column]
          })
          y += rowHeight
        })
        y += 12
        markRendered(`product:${index}:beforeAnalysis`); markRendered(`product:${index}:afterAnalysis`)
        flowCallout(clean(copy.transformationHeading, 'KEY TRANSFORMATION'), product.keyTransformation || 'The listing is transformed from a less structured source into clearer, normalized, attribute-rich product information.', COLOR.blue, `${name} - transformation`)
        ensure(34, `${name} - enriched attributes`); text(clean(copy.attributesHeading, 'KEY ENRICHED ATTRIBUTES CAPTURED'), L, y, CW, { size: 9, bold: true }); y += 17
        const isMeaningful = value => value && !/\b(not available|not detected|unknown|n\/a)\b/i.test(value)
        const bullets = (product.highlights || []).map(v => clean(v, '')).filter(isMeaningful).concat((product.improvements || []).filter(v => v?.includeInReport !== false && isMeaningful(clean(v.afterState || v.whatChanged, ''))).map(v => `${clean(v.area, 'Product data')}: ${clean(v.afterState || v.whatChanged)}`)).slice(0, 6)
        for (const value of (bullets.length ? bullets : ['Structured product naming', 'Normalized taxonomy', 'Search-ready technical attributes'])) {
          const bh = h(`- ${value}`, CW - 7, 8.1, 1.7)
          if (y + bh + 7 > BOTTOM) { freshFlowPage(`${name} - enriched attributes continued`); text('KEY ENRICHED ATTRIBUTES CAPTURED - CONTINUED', L, y, CW, { size: 9, bold: true }); y += 20 }
          text(`- ${value}`, L + 7, y, CW - 7, { size: 8.1, gap: 1.7 }); y += bh + 6
        }
        markRendered(`product:${index}:transformation`); markRendered(`product:${index}:attributes`)

        const evidence = (asset, heading, description, manifestKey) => {
          const file = evidenceFile(asset); if (!file) throw new Error(`${heading}: expected source asset is missing.`)
          let img; try { img = doc.openImage(file) } catch { throw new Error(`${heading}: source cannot be rendered. Upload PNG, JPEG, or PDF.`) }
          const sourcePath = fileFor(asset)
          const sourceIsPdf = /application\/pdf/i.test(asset?.mimeType || '') || /\.pdf$/i.test(asset?.filename || '') || path.extname(sourcePath || '').toLowerCase() === '.pdf'
          const drawW = CW - 8, scale = drawW / img.width, fullH = img.height * scale, dpi = img.width / (drawW / 72)
          if (dpi < 150) throw new Error(`${heading}: source resolution is too low (${Math.round(dpi)} effective DPI). Upload a higher-resolution image.`)
          const headingHeight = Math.max(44, h(heading, CW, 10.5, 1.4) + h(description, CW, 8, 2) + 19)
          const maxSliceHeight = BOTTOM - 88 - headingHeight - 8
          // Evidence is intentionally atomic: one uploaded Before/After document or
          // screenshot occupies one report page. Never split the visual across pages.
          if (sourceIsPdf || asset?.url) {
            freshFlowPage(`${heading} evidence`)
            y += title(heading, y, 10.5, COLOR.ink, false) + 3
            y += text(description, L, y, CW, { size: 8, italic: true, color: COLOR.gray }) + 10
            const maxW = CW - 8
            const maxH = BOTTOM - y - 8
            const fitScale = Math.min(maxW / img.width, maxH / img.height)
            const fittedW = img.width * fitScale
            const fittedH = img.height * fitScale
            const frameX = L + (CW - fittedW - 8) / 2
            validateBox(`${heading} PDF page`, y, fittedH + 8)
            doc.rect(frameX, y, fittedW + 8, fittedH + 8).fill(COLOR.white).strokeColor(COLOR.line).stroke()
            doc.image(file, frameX + 4, y + 4, { width: fittedW, height: fittedH })
            y += fittedH + 20
            markRendered(manifestKey)
            return
          }
          const parts = Math.max(1, Math.ceil(fullH / maxSliceHeight))
          const targetSliceHeight = fullH / parts
          let offset = 0, part = 1
          do {
            freshFlowPage(`${heading} evidence${part > 1 ? ' continued' : ''}`)
            const partLabel = part > 1 ? ` - CONTINUED ${part}` : ''
            y += title(`${heading}${partLabel}`, y, 10.5, COLOR.ink, false) + 3; y += text(description, L, y, CW, { size: 8, italic: true, color: COLOR.gray }) + 10
            const sliceH = Math.min(targetSliceHeight, fullH - offset)
            const frameH = sliceH + 8
            validateBox(`${heading}${partLabel} image`, y, frameH)
            doc.rect(L, y, CW, frameH).fill(COLOR.white).strokeColor(COLOR.line).stroke()
            doc.save().rect(L + 4, y + 4, drawW, sliceH).clip().image(file, L + 4, y + 4 - offset, { width: drawW, height: fullH }).restore()
            offset += sliceH; y += frameH + 12; part += 1
          } while (offset < fullH - 1)
          markRendered(manifestKey)
        }
        evidence({ ...product.beforeImage, pdfPage: product.beforePdfPage || 1 }, `ORIGINAL PRODUCT PAGE (${client.toUpperCase()})`, `Source page capture: ${clean(product.beforeImage?.filename, 'Original product listing')}.`, `product:${index}:beforeImage`)
        evidence({ ...product.afterImage, pdfPage: product.afterPdfPage || 1 }, 'ENRICHED RESULT (ALTIUSNXT)', `${name} - structured enriched product record.`, `product:${index}:afterImage`)

        freshFlowPage(`${name} - technical specification matrix`); flowHeading(clean(copy.specificationsHeading, 'Full Technical Specification Matrix'), { size: 10.5, bold: false, keepWith: 70, context: `${name} - specification matrix` }); y += text(clean(copy.specificationsIntro, 'Attributes and values shown exactly from the supplied After evidence.'), L, y, CW, { size: 8.7, color: COLOR.gray }) + 12
        const isVerifiedAfterField = item => {
          const value = clean(item?.value, '')
          const source = String(item?.source || '').toUpperCase()
          return value && !/needs verification|not available|not detected|unknown|n\/a/i.test(value) && source !== 'BEFORE' && source !== 'RECOMMENDED' && !/needs verification/i.test(item?.status || '')
        }
        let fields = Array.isArray(product.technicalSpecifications) ? product.technicalSpecifications.filter(isVerifiedAfterField).map(item => [clean(item?.attribute, 'Technical attribute'), clean(item?.value, '')]) : []
        if (!fields.length && product.extractedFields && typeof product.extractedFields === 'object') fields = Object.entries(product.extractedFields).filter(([, item]) => isVerifiedAfterField(item)).map(([key, item]) => [key.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()).trim(), clean(item.value, '')])
        const rows = []; for (let i = 0; i < fields.length; i += 2) rows.push([...(fields[i] || ['', '']), ...(fields[i + 1] || ['', ''])])
        const widths = [132, 132, 132, CW - 396]
        // Use the complete printable body. Rows are measured and rendered in
        // bounded line fragments, so continuation is driven by their real
        // height instead of a fixed per-page cut-off that leaves blank space.
        const matrixBottom = BOTTOM
        const matrixHead = () => { doc.rect(L, y, CW, 23).fill('#444444'); let x = L; ['Attribute', 'Value', 'Attribute', 'Value'].forEach((v, i) => { text(v.toUpperCase(), x + 8, y + 7, widths[i] - 16, { size: 7.5, bold: true, color: COLOR.white }); x += widths[i] }); y += 23 }
        const matrixLines = (value, width, bold) => {
          doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8)
          const words = clean(value, '').split(/\s+/).filter(Boolean)
          const lines = []
          let current = ''
          words.forEach(word => {
            const candidate = current ? `${current} ${word}` : word
            if (current && doc.widthOfString(candidate) > width) { lines.push(current); current = word }
            else current = candidate
          })
          if (current) lines.push(current)
          return lines.length ? lines : ['']
        }
        matrixHead(); rows.forEach(row => {
          let remaining = row.map((value, index) => matrixLines(value, widths[index] - 16, index % 2 === 0))
          while (remaining.some(lines => lines.length)) {
            if (matrixBottom - y < 43) { freshFlowPage(`${name} - specification matrix continued`); matrixHead() }
            const lineHeight = 9.5
            const maxLines = Math.max(1, Math.floor((matrixBottom - y - 14) / lineHeight))
            const chunks = remaining.map(lines => lines.splice(0, maxLines))
            const rh = Math.max(29, ...chunks.map(lines => lines.length * lineHeight + 14))
            validateBox('Specification matrix row', y, rh)
            let x = L
            chunks.forEach((lines, i) => {
              doc.rect(x, y, widths[i], rh).fill(i % 2 ? COLOR.white : COLOR.label).strokeColor(COLOR.line).lineWidth(.45).stroke()
              doc.font(i % 2 === 0 ? 'Helvetica-Bold' : 'Helvetica').fontSize(8).fillColor(COLOR.ink)
              lines.forEach((lineValue, lineIndex) => text(lineValue, x + 8, y + 7 + lineIndex * lineHeight, widths[i] - 16, {
                size: 8,
                bold: i % 2 === 0,
                height: lineHeight,
                gap: 0
              }))
              x += widths[i]
            })
            y += rh
            if (remaining.some(lines => lines.length)) { freshFlowPage(`${name} - specification matrix continued`); matrixHead() }
          }
        })
        y += 16
        const visibleAttributeNames = fields.map(([attribute]) => attribute).filter(Boolean)
        const notes = clean(product.standardisationNotes, '') || (visibleAttributeNames.length
          ? `The supplied After evidence presents ${visibleAttributeNames.join(', ')} as structured attribute-value content. These values are reproduced from the visible enriched product record without adding missing, recommended, inferred, or placeholder specifications.`
          : 'No verified After attributes were visible in the supplied evidence.')
        if (y + h(notes, CW - 24, 8.2, 1.8) + 42 > BOTTOM) { page(true, 'PDP ENRICHMENT REPORT', `${name} - normalization notes`); y = 88 }
        const nh = Math.max(70, h(notes, CW - 24, 8.2, 1.8) + 38); doc.rect(L, y, CW, nh).fill(COLOR.white).strokeColor(COLOR.line).stroke(); doc.rect(L, y, 3, nh).fill(COLOR.blue); text(clean(copy.standardisationHeading, 'STANDARDISATION & NORMALIZATION NOTES'), L + 12, y + 11, CW - 24, { size: 8.5, bold: true }); text(notes, L + 12, y + 30, CW - 24, { size: 8.2, color: COLOR.gray, gap: 1.8 }); y += nh + 12
      })

      // Continue into the remaining space after the final product/matrix when
      // there is enough room for the section heading and its first paragraph.
      // The normal flow helpers will paginate later content only when required.
      if (BOTTOM - y < 150) freshFlowPage('Summary and next steps')
      else y += 8
      flowHeading(clean(copy.summaryHeading, 'SUMMARY & NEXT STEPS'), { size: 10.5, bold: false, after: 14, keepWith: 45 }); flowHeading(clean(copy.auditSummaryHeading, 'Catalog Enrichment Audit Summary'), { size: 10, keepWith: 45 })
      flowText(report.overallBusinessValue || report.executiveSummary || `This report documents how ${products.length} product record${products.length === 1 ? '' : 's'} can be transformed into clearer, structured information for discovery, comparison, and reuse.`, { size: 8.8, gap: 2.5, after: 15, context: 'Audit summary continued' })
      const summaryImprovements = [...new Map(products.flatMap(product => (product.improvements || []).filter(item => item?.includeInReport !== false).map(item => {
        const detail = clean(item.businessBenefit || item.afterState || item.whatChanged, '')
        return [clean(item.area, ''), detail && !/\b(not available|not detected|unknown|n\/a)\b/i.test(detail) ? `${clean(item.area, 'Product data')}: ${safeLanguage(detail)}` : '']
      })).filter(([, value]) => value)).values()].slice(0, 8)
      const improvementItems = summaryImprovements.length ? summaryImprovements : ['Structured product naming and taxonomy', 'Normalized technical specification data', 'Search and faceted-filtering readiness', 'Clearer buyer evaluation and product comparison', 'Evidence-led review before publication']
      flowHeading('Key Improvements Demonstrated', { size: 9.5, keepWith: 32 }); for (const v of improvementItems) { const bh = h(`- ${v}`, CW - 7, 8.5, 2); if (y + bh + 7 > BOTTOM) { freshFlowPage('Key improvements continued'); text('KEY IMPROVEMENTS DEMONSTRATED - CONTINUED', L, y, CW, { size: 9, bold: true }); y += 20 } y += text(`- ${v}`, L + 7, y, CW - 7, { size: 8.5 }) + 7 }
      const productNextSteps = products.map(product => clean(product.recommendedNextSteps, '')).filter(Boolean).join(' ')
      y += 9; flowHeading(`Recommended Next Steps for ${client}`, { size: 9.5, keepWith: 42 }); flowText(safeLanguage(report.nextSteps || productNextSteps) || 'Review the evidence-backed changes, approve the proposed product-data model, and pilot it across a representative priority category before broader catalog rollout.', { size: 8.7, gap: 2.4, after: 18, context: 'Recommended next steps continued' })
      const contactParts = [preparedByPhone && `m: ${preparedByPhone}`, preparedByEmail && `e: ${preparedByEmail}`, preparedByWebsite && `w: ${preparedByWebsite}`].filter(Boolean)
      const signatureLines = [
        { value: preparedBy, size: 9, bold: true, color: COLOR.blue },
        preparedByDesignation && { value: preparedByDesignation, size: 8.2, color: COLOR.gray },
        preparedByCompany && { value: preparedByCompany, size: 8.2, bold: true },
        contactParts.length && { value: contactParts.join('  |  '), size: 7.8, color: COLOR.gray }
      ].filter(Boolean)
      const signatureHeight = 32 + signatureLines.reduce((sum, item) => sum + h(item.value, 310, item.size, 1.5, item.bold) + 3, 0)
      ensure(Math.max(82, signatureHeight), 'Prepared by details')
      const cy = y + 8; line(cy - 10); text('Prepared By', L, cy, 310, { size: 9, bold: true }); let signatureY = cy + 18
      signatureLines.forEach(item => { signatureY += text(item.value, L, signatureY, 310, { size: item.size, bold: item.bold, color: item.color, gap: 1.5 }) + 3 })
      if (fs.existsSync(logo)) doc.image(logo, 445, cy + 10, { fit: [92, 30], align: 'right' }); doc.rect(457, cy + 48, 80, 2).fill(COLOR.red)

      const missingBlocks = [...expected].filter(key => !rendered.has(key))
      if (missingBlocks.length) validationIssues.push(`Missing report blocks: ${missingBlocks.join(', ')}`)
      if (validationIssues.length) throw new Error(`PDF layout preflight failed: ${validationIssues.join('; ')}`)

      const pages = doc.bufferedPageRange(); for (let i = 0; i < pages.count; i++) { doc.switchToPage(i); line(798); text(`AltiusNXT | Prepared for ${preparedFor}`, L, 808, 390, { size: 7, color: '#717171' }); text(`Page ${i + 1} of ${pages.count}`, 455, 808, R - 455, { size: 7, color: '#717171', align: 'right' }) }
      doc.end(); stream.on('finish', () => resolve(pages.count)); stream.on('error', reject)
    } catch (error) { reject(error) }
  })
}

module.exports = { buildReferencePdf }

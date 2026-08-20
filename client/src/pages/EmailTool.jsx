import { useState, useEffect, useRef, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import { Chart, registerables } from 'chart.js'
import api from '../api/client'
import '../styles/email-tool.css'
import DeliverabilityReport from '../components/activities/DeliverabilityReport'
import { runDeliverabilityAnalysis } from '../utils/emailDeliverability'
import { compressImageIfNeeded } from '../utils/imageCompress'
import { discoverBestGeminiModel, callGeminiWithFallback } from '../utils/geminiModel'
import { recordAiUsage, AI_FEATURES } from '../utils/aiUsage'
import AiUsagePanel from '../components/AiUsagePanel'
import { stripInlineFontSize } from '../utils/sanitizeEmailHtml'
import { invalidateCompanyEmail } from '../utils/emailCache'

Chart.register(...registerables)

// ─────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────
const AI_SYSTEM_PROMPT = (clientName) => `You are a Product Data Enrichment Sales Assistant for AltiusNXT Technologies.

Your role is to generate a strong, professional, structured Before vs After explanation email based on:
- Recipient Name: ${clientName}
- Uploaded Before Image: Client's current product page screenshot
- Uploaded After Image: AltiusNXT enriched/structured product page screenshot

Always follow this exact structure:

1. Professional greeting addressing recipient by name.
2. Mention you reviewed their website.
3. Clearly state the product example visible in the before image.

4. Add section:
🔹 CURRENT VERSION (Before – As Seen on Your Website)
Analyse the Before image carefully and explain:
- What exists now on the product page
- Limited structured attributes visible
- Gaps from an SEO perspective
- Gaps from a technical buyer perspective
- Missing structured schema
- Limited filter readiness
- Limited taxonomy depth

5. Add section:
🔹 ENRICHED VERSION (After – Structured Technical Format)
Analyse the After image carefully and provide:
- Structured SEO Title Example
- Standardized Technical Specification table
- Attribute normalization example
- Filter-ready structure
- Category mapping example

6. Add section: WHAT THIS IMPROVES
7. Add section: Why This Matters
8. End with a confident call-to-action for a 15-minute discovery call.
Do NOT include closing signatures.

Tone: Professional, Authoritative, Consultative.
Formatting: Output directly in HTML using <p>, <strong>, <ul>, <li>, <table>, <tr>, <td>, <th>.
Do NOT include <html>, <body>, or markdown code blocks.`

// ─────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────
function formatBytes(bytes) {
  if (!bytes) return '0 B'
  const k = 1024, sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

function fmtDate(ts) {
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function fmtDateTime(ts) {
  const d = new Date(ts)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' at ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

// ─────────────────────────────────────────────────────────
// Template Builders
// ─────────────────────────────────────────────────────────
function buildTemplate1(clientName) {
  const subject = `Elevate Your eCommerce Performance with Product Data Enrichment (Before & After Sample)`
  const body = `<p>Hi ${clientName},</p>
<p>Hope you're doing well.</p>
<p>I've attached a Before-and-After Product Data Enrichment sample to clearly demonstrate how structured, enriched product data transforms an eCommerce product page—both for buyers and for Google search visibility. I've also included our corporate deck for reference.</p>
<p><strong>What the Before vs After Sample Shows</strong></p>
<p>From the attached comparison, you'll notice a significant improvement in:</p>
<ul>
<li>Structured product titles (brand + product type + key specifications)</li>
<li>Clean, standardized specifications (Material, size, dimensions, standards…)</li>
<li>Clear attribute mapping that supports filters and faceted navigation</li>
<li>Improved content hierarchy (technical specs, features, applications)</li>
<li>Consistent SKU, category, and taxonomy alignment</li>
<li>Richer product context for both users and search engines</li>
</ul>
<p><strong>How This Helps Google Rank Your Store Organically</strong></p>
<p>Google doesn't rank design alone — it ranks clear, structured, and meaningful data. Enriched product data directly improves SEO by:</p>
<p>✅ Helping Google clearly understand what the product is and who it's for<br>
✅ Improving indexing accuracy through standardized attributes and schema-ready data<br>
✅ Strengthening category relevance and internal linking<br>
✅ Increasing time on page and engagement through clearer product information<br>
✅ Supporting advanced search, filters, and comparisons—critical for B2B eCommerce</p>
<p><strong>Common Product Data Challenges We Help Solve</strong></p>
<p>❌ Inconsistent or incomplete product specifications<br>
❌ Poor taxonomy and attribute structure<br>
❌ Low organic visibility due to missing or unstructured data<br>
❌ Product pages that fail to build buyer confidence</p>
<p><strong>AltiusNXT's Core Expertise – Product Data Enrichment</strong></p>
<p>At AltiusNXT Technologies, our focus is exclusively on product data. We help eCommerce businesses by delivering:</p>
<p>✅ Product data enrichment, cleansing, and normalization<br>
✅ Taxonomy design and attribute modeling<br>
✅ SEO-ready product specifications and content structuring<br>
✅ Data standardization across large and complex catalogs</p>
<p>Would you be open to a 15–20 minute call this week to review the sample and discuss how product data enrichment can support your eCommerce growth goals?</p>`
  return { subject, body }
}

function buildTemplate2(clientName) {
  const subject = `AltiusNXT – Client Project References for Your Review`
  const body = `<p>Hi ${clientName},</p>
<p>Good day!</p>
<p>I'm sharing a selection of our client project references for your review. These examples highlight the consistent value and results we deliver, and I hope they serve as a useful reference should you consider our services in the future.</p>
<p>Selecting "View Project" or "View Store" will take you directly to the respective client Online Stores.</p>
<p><strong>Client Projects – Product Data Enrichment:</strong></p>
<ul style="list-style:none;padding-left:0">
<li style="padding:0.4rem 0;border-bottom:1px solid #E2E8F0"><strong>ABC Supply Co. Inc. (System Integrators)</strong> – Product Data Enrichment – <a href="https://www.abcsupply.com/" target="_blank">View Project</a></li>
<li style="padding:0.4rem 0;border-bottom:1px solid #E2E8F0"><strong>Amerhart (System Integrators)</strong> – Product Data Enrichment – <a href="https://www.amerhart.com/catalog/fasteners-and-tools/tools-and-supplies/drills-and-bits/hillman-group-hillman-acoustical-lag-driver-1-4" target="_blank">View Project</a></li>
<li style="padding:0.4rem 0;border-bottom:1px solid #E2E8F0"><strong>W.W. Grainger, Inc.</strong> – Product Data Enrichment – <a href="https://www.grainger.com/category/machining/drilling-holemaking/drill-bits" target="_blank">View Project</a></li>
<li style="padding:0.4rem 0;border-bottom:1px solid #E2E8F0"><strong>Hantover</strong> – Product Data Enrichment – <a href="https://www.hantover.com" target="_blank">View Project</a></li>
<li style="padding:0.4rem 0;border-bottom:1px solid #E2E8F0"><strong>Rubix</strong> – Product Data Enrichment – <a href="https://uk.rubix.com" target="_blank">View Project</a></li>
<li style="padding:0.4rem 0;border-bottom:1px solid #E2E8F0"><strong>Baker &amp; Farrows</strong> – Product Data Enrichment – <a href="https://www.bakfar.com.au" target="_blank">View Project</a></li>
<li style="padding:0.4rem 0"><strong>Travis Perkins</strong> – Product Data Enrichment – <a href="https://www.travisperkins.co.uk" target="_blank">View Project</a></li>
</ul>
<p><strong>Client Projects – eCommerce Store Development &amp; Product Data Enrichment:</strong></p>
<ul style="list-style:none;padding-left:0">
<li style="padding:0.4rem 0;border-bottom:1px solid #E2E8F0"><strong>Screwman</strong> – Full eCommerce Store Development &amp; Product Data Enrichment – <a href="https://screwman.co.za" target="_blank">View Store</a></li>
<li style="padding:0.4rem 0"><strong>Rose Scientific</strong> – Full eCommerce Store Development &amp; Product Data Enrichment – <a href="https://www.rosesci.com" target="_blank">View Store</a></li>
</ul>
<p>We're also open to a retainer engagement model to ensure flexibility and alignment with your operational needs.</p>
<p>Please take your time to review the references and feel free to reach out with any questions or clarifications.</p>
<p>Wishing you a wonderful day ahead!</p>`
  return { subject, body }
}

function buildTemplate4(clientName) {
  const subject = `Complimentary Product Data Enrichment – 20 SKUs at No Cost (Proof of Concept)`
  const body = `<p>Hi ${clientName},</p>
<p>Good day!</p>
<p>To help you evaluate the quality and business impact of our Product Data Enrichment services firsthand, I would be happy to enrich up to 20 of your products at no cost as a Proof of Concept (POC).</p>
<p><strong>What You'll Receive</strong></p>
<p>→ We will enrich 20 selected SKUs using our proven enrichment framework.<br>
→ The enriched products will be uploaded into our demo environment, allowing you to review them in a live storefront experience.<br>
→ I will personally conduct a live walkthrough session, where we will review each enriched product together.<br>
→ This gives your team a complete opportunity to audit the quality, depth, accuracy, structure, and consistency of our enrichment work before making any commitment.</p>
<p>✓ No Risk. No Obligation. Complete Transparency.</p>
<p><strong>Details Required to Begin</strong></p>
<p>Please share the following for each SKU:</p>
<p>✓ Manufacturer Name<br>✓ Manufacturer Part Number<br>✓ Product Short Description (if available)</p>
<p><strong>To Help Us Scope the Project Accurately</strong></p>
<p>✓ Total number of products in your catalog<br>✓ Your expectations regarding complete product data enrichment<br>✓ Any platform-specific requirements or templates currently in use</p>
<p><strong>After POC Approval</strong></p>
<p>Once you are satisfied with the Proof of Concept results, we will be happy to provide the enriched data in a format fully aligned with your platform requirements, enabling seamless upload into your store.</p>
<p>I would welcome the opportunity to schedule a brief Google Meet call to discuss your requirements, answer any questions, and align on next steps.</p>
<p>Looking forward to your feedback.</p>`
  return { subject, body }
}

// ─────────────────────────────────────────────────────────
// Static Website client template set (verbatim content from the client PDF:
// "Static Website Customers"). Templates 1/2/4 are predefined (no AI); only
// Template 3 uses AI. Email 2 is shared with the E-commerce set (buildTemplate2).
// ─────────────────────────────────────────────────────────
function buildStaticTemplate1(clientName) {
  const subject = `From Static Website to Revenue-Generating eCommerce Store (Before & After Sample)`
  const body = `<p>Hi ${clientName},</p>
<p>Hope you're doing well.</p>
<p>I'm reaching out to share a Before-and-After sample that demonstrates how we help businesses transform static websites into fully functional eCommerce stores, supported by structured product data enrichment. The comparison files and our corporate deck are attached for your reference.</p>
<p><strong>What the Before vs After Sample Represents</strong></p>
<p>The Before image reflects a typical static website setup:</p>
<ul>
<li>Promotional banners and catalog tiles</li>
<li>Limited or no individual product pages</li>
<li>Product information locked inside PDFs or brochures</li>
<li>No structured data for search engines</li>
<li>Website acts as an online brochure — not a sales channel</li>
</ul>
<p>The After image shows the same business as a fully enabled eCommerce store:</p>
<ul>
<li>Dedicated, searchable product pages</li>
<li>Structured specifications, attributes, and features</li>
<li>Clear product hierarchy (categories, subcategories, SKUs)</li>
<li>Add-to-cart, comparison, and inquiry functionality</li>
<li>Content built for both buyers and Google</li>
</ul>
<p><strong>Why Static Websites Don't Scale or Rank on Google</strong></p>
<p>❌ Google cannot clearly understand what products you sell<br>
❌ No product-level pages to rank organically<br>
❌ No attributes, schema, or SEO signals<br>
❌ Buyers can't easily compare, filter, or purchase</p>
<p>This limits visibility, lead generation, and revenue growth.</p>
<p><strong>How Moving to eCommerce + Enriched Data Changes Everything</strong></p>
<p>By converting your static site into an eCommerce platform with enriched product data, you gain:</p>
<p>✅ Individual product pages that Google can index and rank<br>
✅ Structured data that improves organic search visibility<br>
✅ Better buyer experience with clear specs and use cases<br>
✅ Higher trust and faster purchase decisions<br>
✅ A scalable foundation for future catalog growth</p>
<p>Each enriched product becomes a new organic entry point for your business.</p>
<p><strong>How AltiusNXT Supports This Transformation</strong></p>
<p>At AltiusNXT Technologies, we handle the complete transition:</p>
<ul>
<li>Static website → modern eCommerce platform</li>
<li>Product data extraction from PDFs, catalogs, and legacy sources</li>
<li>Product enrichment, taxonomy, and attribute modeling</li>
<li>SEO-ready product and category architecture</li>
</ul>
<p>The attached Before/After sample clearly shows how this approach turns a static site into a discoverable, conversion-driven eCommerce store.</p>
<p>I'd be happy to schedule a 15–20 minute call to walk you through the sample and discuss how we can help you move from a static presence to a revenue-generating eCommerce platform.</p>
<p>Looking forward to your thoughts.</p>`
  return { subject, body }
}

function buildStaticTemplate4(clientName) {
  const subject = `Complimentary eCommerce Store POC – 5 Products at No Cost (Proof of Concept)`
  const body = `<p>Hi ${clientName},</p>
<p>Good day!</p>
<p>To help you visualize how your products can be presented in a modern eCommerce store, I would be happy to create a complimentary Proof of Concept (POC) using 5 products from your existing website or product catalog.</p>
<p><strong>What You'll Receive</strong></p>
<p>→ We will select and enrich 5 representative products using our proven Product Data Enrichment framework.<br>
→ These products will be uploaded into our live demo eCommerce environment, allowing you to experience how your catalog could look as a fully functional online store.<br>
→ The demo will showcase professionally structured Product Detail Pages (PDPs) with product descriptions, specifications, attributes, categories, images (where available), and SEO-friendly content.<br>
→ I will personally conduct a live walkthrough, demonstrating how your products can be organized, searched, filtered, and presented in a modern eCommerce experience.<br>
→ This gives your team the opportunity to evaluate how your existing product catalog could be transformed into a scalable, revenue-generating eCommerce platform.</p>
<p>✓ No Risk. No Obligation. Complete Transparency.</p>
<p><strong>After the POC</strong></p>
<p>Once you've reviewed the demo, we can discuss how your complete product catalog can be enriched and transformed into a fully functional eCommerce platform tailored to your business requirements.</p>
<p>I would welcome the opportunity to schedule a brief Google Meet call to walk you through the demo, discuss your goals, and answer any questions.</p>
<p>Looking forward to your feedback.</p>`
  return { subject, body }
}

// Static — Email 3 AI prompt ("Static - Digital Commerce & Revenue
// Transformation Audit" from the PDF). Used when Client Type = Static Website.
const STATIC_AI_SYSTEM_PROMPT = (clientName) => `You are a Digital Commerce Transformation & Product Data Architecture Sales Consultant for AltiusNXT Technologies.

Your role is to generate a structured, professional, revenue-focused Online Business Growth & Revenue Audit email for a company that currently has a static or brochure-style website and no eCommerce presence, based on:
- Recipient Name: ${clientName}
- Uploaded Before Image: The client's current static website screenshot
- Uploaded After Image: AltiusNXT's structured eCommerce demo Product Detail Page (PDP) screenshot

Your objective is to position AltiusNXT as a Digital Revenue & Commerce Infrastructure Partner, not just a web developer or data enrichment vendor.

Follow this exact structure:

1. Professional greeting addressing the recipient by name. Mention that you reviewed their website and current digital presence, clearly reference the product example visible in the Before image, and position the email as an observation-based digital growth audit.

2. Add section:
🔹 CURRENT DIGITAL POSITION (As Observed)
Based on the Before screenshot, explain that the website reflects a typical static setup (promotional banners and catalogue tiles, limited or no individual product pages, product information locked inside PDFs or brochures, no structured data for search engines, website acts as an online brochure — not a sales channel). Then explain the structural limitations (no eCommerce capability, no structured product catalog, no SKU-level architecture, no standardized specification tables, no filter-ready navigation, no taxonomy depth, no schema-ready data). Then explain why static websites don't scale or rank on Google and the resulting business impact (limited visibility, lower lead generation, manual enquiry dependency, no 24/7 selling capability, restricted revenue growth). Make this analytical and commercially framed.

3. Add section:
🔹 PROPOSED eCOMMERCE + ENRICHED PRODUCT DATA MODEL
Based on the After screenshot, explain the transformation into a fully enabled eCommerce store (dedicated searchable product pages, structured specifications/attributes/features, clear product hierarchy of categories/subcategories/SKUs, add-to-cart/comparison/inquiry functionality, content structured for both buyers and Google). Include: an example SEO-optimized product title, a standardized technical specification table, attribute normalization, a filter-ready taxonomy, breadcrumb navigation, and schema-ready product data. Then explain what this enables (individual product pages that Google can index and rank, structured data improving organic visibility, better buyer experience with technical clarity, higher trust and faster purchase decisions, a scalable foundation for catalog growth — each enriched product becomes a new organic entry point).

4. Add section:
🔹 ONLINE + OFFLINE REVENUE SCALING IMPACT
Explain the online impact (24/7 digital revenue channel activation, direct ordering & RFQ automation, national & global discoverability, reduced customer acquisition cost over time), the offline impact (supports field sales teams with a structured digital catalog, faster quote generation, improved distributor enablement, reduced repetitive technical clarification calls, higher sales productivity), and the hybrid growth model (online visibility drives offline enquiries, offline relationships convert through the digital platform, improved repeat purchase rate, stronger brand authority, multi-channel readiness for marketplace / B2B portal / export).

5. Add section:
🔹 REVENUE & GROWTH EXPECTATION RANGE
Present realistic, industry-backed performance benchmarks (do not overpromise): +40% to 120% increase in organic traffic (6–12 months), +30% to 80% increase in qualified enquiries, +15% to 45% revenue uplift within the first year, +20% to 60% improvement in conversion rate, −20% to 50% reduction in repetitive pre-sales queries, +15% to 35% increase in sales team productivity.

6. Add section:
🔹 HOW ALTIUSNXT SUPPORTS THE TRANSFORMATION
Position AltiusNXT as an end-to-end partner: static website → modern eCommerce platform; product data extraction from PDFs, catalogs, ERP and legacy systems; product enrichment, taxonomy & attribute modeling; SEO-ready product & category architecture; schema implementation; UI/UX optimized for B2B & technical buyers; scalable commerce-ready infrastructure.

7. Add section:
Why This Matters
Position structured eCommerce as digital revenue infrastructure, a product data architecture foundation, a long-term growth asset, a competitive advantage, and a scalable sales ecosystem. Clarify that this is not a cosmetic redesign and not marketing copy rewriting — it is building a digital commerce engine.

8. End with a confident but consultative call-to-action for a 15-minute call to: review their current digital position, demonstrate the structured commerce architecture, outline a phased rollout strategy, and discuss the realistic revenue opportunity.
Do NOT include closing signatures.

Tone: Professional, Strategic, Revenue-focused, Authoritative, Consultative, Sales-driven but not aggressive, Industry-adaptive, and never generic. Always connect technical improvements to business growth and revenue outcomes.
Formatting: Output directly in HTML using <p>, <strong>, <ul>, <li>, <table>, <tr>, <td>, <th>.
Do NOT include <html>, <body>, or markdown code blocks.`

// Output-format extension appended to whichever audit prompt is used, so the AI
// returns BOTH a subject and the body. The underlying prompt logic is unchanged.
const AUDIT_SUBJECT_OUTPUT_INSTRUCTION = `

IMPORTANT — OUTPUT FORMAT:
On the very first line, output a single, unique, compelling email subject line for THIS specific client, tailored to the uploaded Before/After screenshots and the recipient, in exactly this format:
SUBJECT: <subject line here>
Then, starting on the next line, output the full HTML email body exactly as instructed above. Do not repeat the word "SUBJECT:" anywhere inside the body, and do not wrap the subject in HTML tags.`

// ─────────────────────────────────────────────────────────
// AI PDP Audit Generator
// ─────────────────────────────────────────────────────────

async function generateAiEmail(clientName, beforeFile, afterFile, settings, clientType = 'ecommerce') {
  const { aiProvider, aiKey, aiModel } = settings
  if (!aiKey) throw new Error('AI API Key missing. Add it in Settings.')

  // Prompt is selected by client type; the subject-output instruction is appended
  // so the AI returns both a subject line and the HTML body.
  const systemPrompt = (clientType === 'static'
    ? STATIC_AI_SYSTEM_PROMPT(clientName)
    : AI_SYSTEM_PROMPT(clientName)) + AUDIT_SUBJECT_OUTPUT_INSTRUCTION

  let emailText = ''

  if (aiProvider === 'gemini') {
    const parts = [{ text: 'Generate the detailed PDP audit HTML pitch email based on system rules.' }]
    if (beforeFile) parts.push({ inlineData: { mimeType: beforeFile.type, data: beforeFile.data } })
    if (afterFile)  parts.push({ inlineData: { mimeType: afterFile.type,  data: afterFile.data  } })

    // Usage is recorded inside callGeminiWithFallback — see utils/aiUsage.js.
    const d = await callGeminiWithFallback(aiKey, aiModel, {
      contents: [{ parts }],
      systemInstruction: { parts: [{ text: systemPrompt }] },
    }, { feature: AI_FEATURES.EMAIL_AI_GENERATION })
    emailText = d.candidates?.[0]?.content?.parts?.[0]?.text || ''

  } else if (aiProvider === 'openai') {
    if (beforeFile?.type === 'application/pdf' || afterFile?.type === 'application/pdf')
      throw new Error('OpenAI does not support PDF inputs. Use Gemini or attach images.')
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${aiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: [
            { type: 'text', text: `Generate PDP Audit for client ${clientName}.` },
            { type: 'image_url', image_url: { url: `data:${beforeFile.type};base64,${beforeFile.data}` } },
            { type: 'image_url', image_url: { url: `data:${afterFile.type};base64,${afterFile.data}` } }
          ]}
        ]
      })
    })
    if (!resp.ok) { const e = await resp.json(); throw new Error(e.error?.message || 'OpenAI API Error') }
    const d = await resp.json()
    recordAiUsage({ provider: 'openai', model: 'gpt-4o', feature: AI_FEATURES.EMAIL_AI_GENERATION, response: d })
    emailText = d.choices?.[0]?.message?.content || ''

  } else if (aiProvider === 'anthropic') {
    if (beforeFile?.type === 'application/pdf' || afterFile?.type === 'application/pdf')
      throw new Error('Anthropic does not support PDF uploads in image messages.')
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': aiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 4000,
        system: systemPrompt,
        messages: [{ role: 'user', content: [
          { type: 'text', text: `Generate PDP Audit for ${clientName}` },
          { type: 'image', source: { type: 'base64', media_type: beforeFile.type, data: beforeFile.data } },
          { type: 'image', source: { type: 'base64', media_type: afterFile.type,  data: afterFile.data  } }
        ]}]
      })
    })
    if (!resp.ok) { const e = await resp.json(); throw new Error(e.error?.message || 'Anthropic API Error') }
    const d = await resp.json()
    recordAiUsage({ provider: 'anthropic', model: 'claude-3-5-sonnet-20241022', feature: AI_FEATURES.EMAIL_AI_GENERATION, response: d })
    emailText = d.content?.[0]?.text || ''
  }

  // Strip markdown code fences
  let raw = emailText.trim()
  if (raw.startsWith('```html')) raw = raw.replace(/^```html\s*/i, '').replace(/\s*```$/i, '')
  else if (raw.startsWith('```')) raw = raw.replace(/^```\s*/, '').replace(/\s*```$/, '')

  // The AI returns BOTH the subject and the body — extract the "SUBJECT:" line,
  // then treat the remainder as the HTML body.
  let subject = ''
  const subjectMatch = raw.match(/SUBJECT:\s*(.+)/i)
  if (subjectMatch) {
    subject = subjectMatch[1].split(/\r?\n/)[0].replace(/<[^>]*>/g, '').trim()
    raw = raw.replace(/.*SUBJECT:\s*.+(\r?\n)?/i, '').trim()
  }

  return { subject, body: stripInlineFontSize(raw.trim()) }
}

// ─────────────────────────────────────────────────────────
// Toast System
// ─────────────────────────────────────────────────────────
let _showToastFn = null

function showToast(message, type = 'info') {
  _showToastFn?.(message, type)
}

function ToastContainer() {
  const [toasts, setToasts] = useState([])

  useEffect(() => {
    _showToastFn = (message, type) => {
      const id = Date.now() + Math.random()
      setToasts(prev => [...prev, { id, message, type, show: false }])
      setTimeout(() => setToasts(prev => prev.map(t => t.id === id ? { ...t, show: true } : t)), 20)
      setTimeout(() => setToasts(prev => prev.map(t => t.id === id ? { ...t, show: false } : t)), 4200)
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4600)
    }
    return () => { _showToastFn = null }
  }, [])

  return (
    <div className="et-toast-container">
      {toasts.map(t => (
        <div key={t.id} className={`et-toast ${t.type} ${t.show ? 'show' : ''}`}>
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// Sidebar
// ─────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { key: 'composer',    icon: '✉️',  label: 'Composer' },
  { key: 'drafts',      icon: '📝',  label: 'Drafts' },
  { key: 'analytics',   icon: '📊',  label: 'Analytics' },
  { key: 'settings',    icon: '⚙️',  label: 'Settings' },
]

function ETSidebar({ section, setSection, draftsCount, gmailStatus, onCompose }) {
  return (
    <aside className="et-sidebar">
      <div className="et-sidebar-header">
        <div className="et-logo-icon">A</div>
        <div className="et-brand-name">AltiusNXT<br/>Outreach</div>
      </div>

      <button className="et-compose-btn" onClick={onCompose}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        Compose Email
      </button>

      <nav className="et-nav">
        {NAV_ITEMS.map(item => (
          <button
            key={item.key}
            className={`et-nav-item ${section === item.key ? 'active' : ''}`}
            onClick={() => setSection(item.key)}
          >
            <span style={{ fontSize: '1rem', lineHeight: 1 }}>{item.icon}</span>
            <span>{item.label}</span>
            {item.key === 'drafts' && draftsCount > 0 && (
              <span className="et-nav-badge">{draftsCount}</span>
            )}
          </button>
        ))}
      </nav>

      <div className="et-sidebar-footer">
        <div className={`et-status-badge ${gmailStatus.connected ? 'connected' : 'disconnected'}`}>
          <div className="et-status-dot" />
          <span>{gmailStatus.connected ? `Gmail: ${gmailStatus.email || 'Connected'}` : 'Gmail Disconnected'}</span>
        </div>
      </div>
    </aside>
  )
}

// ─────────────────────────────────────────────────────────
// Attachment Chip
// ─────────────────────────────────────────────────────────
function AttachChip({ name }) {
  return (
    <div className="et-attach-chip">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
      </svg>
      <span>{name}</span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// Composer Section
// ─────────────────────────────────────────────────────────
function ComposerSection({ gmailStatus, setSection, onDraftSaved, initialDraft, clearInitialDraft, companyContext }) {
  const [to, setTo]         = useState(initialDraft?.to || '')
  const [cc, setCc]         = useState(initialDraft?.cc || '')
  const [bcc, setBcc]       = useState(initialDraft?.bcc || '')
  const [clientName, setClientName] = useState(initialDraft?.clientName || '')
  const [emailMode, setEmailMode]   = useState(initialDraft?.emailMode || 'continue')
  const [clientType, setClientType] = useState(initialDraft?.clientType || 'ecommerce')
  const [template, setTemplate]     = useState(initialDraft?.template || '1')
  const [subject, setSubject]       = useState(initialDraft?.subject || '')
  const [body, setBody]             = useState(initialDraft?.body || '')
  // Set only by a genuine Reply/Reply All/Forward (see ThreadDrawer.jsx) — an
  // explicit thread to continue (skips the fuzzy sender/recipient matching
  // heuristic server-side) and the quoted/forwarded original message, which
  // the backend places after the signature on send. Empty for every other
  // compose path, including drafts and the Company "Log an email" flow.
  const [threadId,   setThreadId]   = useState(initialDraft?.threadId || '')
  const [quotedHtml, setQuotedHtml] = useState(initialDraft?.quotedHtml || '')

  const [beforeFile, setBeforeFile]   = useState(null)
  const [afterFile, setAfterFile]     = useState(null)
  const [beforeThumb, setBeforeThumb] = useState(null)
  const [afterThumb, setAfterThumb]   = useState(null)
  const [additionalFiles, setAdditionalFiles] = useState([])

  const [previewHtml, setPreviewHtml]       = useState('')
  const [previewSubject, setPreviewSubject] = useState('')
  const [isDragOver, setIsDragOver]         = useState(false)
  const [sending, setSending]               = useState(false)
  const [generating, setGenerating]         = useState(false)

  const beforeRef  = useRef()
  const afterRef   = useRef()
  const addFilesRef = useRef()
  const autoTimer  = useRef(null)   // debounce for auto-generation
  const lastAiKey  = useRef('')     // guards Template 3 against duplicate AI calls

  const isBeforeAfter = template === '1' || template === '3'
  const isManual = template === 'manual'

  // Load draft if provided
  useEffect(() => {
    if (!initialDraft) return
    setTo(initialDraft.to || '')
    setCc(initialDraft.cc || '')
    setBcc(initialDraft.bcc || '')
    setClientName(initialDraft.clientName || '')
    setClientType(initialDraft.clientType || 'ecommerce')
    setTemplate(initialDraft.template || '1')
    setSubject(initialDraft.subject || '')
    setBody(initialDraft.body || '')
    setThreadId(initialDraft.threadId || '')
    setQuotedHtml(initialDraft.quotedHtml || '')
    setBeforeFile(null); setAfterFile(null)
    setBeforeThumb(null); setAfterThumb(null)
    setAdditionalFiles([])
    setPreviewHtml(''); setPreviewSubject('')
    clearInitialDraft?.()
  // eslint-disable-next-line
  }, [initialDraft])

  // Arriving from a company (Email quick action, "Log an email", or clicking a
  // saved company address) OR from a Reply/Reply All/Forward action in the
  // Inbox/ThreadDrawer (which carries no companyId when opened cross-company)
  // — prefill whatever the caller supplied. companyContext.companyId, when
  // present, travels with the send so the email is filed against that company.
  useEffect(() => {
    if (!companyContext) return
    if (companyContext.to) setTo(companyContext.to)
    if (companyContext.cc) setCc(companyContext.cc)
    if (companyContext.subject) setSubject(companyContext.subject)
    if (companyContext.quotedHtml) setQuotedHtml(companyContext.quotedHtml)
    if (companyContext.threadId) setThreadId(companyContext.threadId)
    if (companyContext.emailMode) setEmailMode(companyContext.emailMode)
    // Reply/Reply All/Forward are always a blank freeform message, never one
    // of the before/after marketing templates.
    if (companyContext.template) setTemplate(companyContext.template)
    if (companyContext.companyName) setClientName(prev => prev || companyContext.companyName)
  // eslint-disable-next-line
  }, [companyContext?.to, companyContext?.companyId, companyContext?.threadId, companyContext?.subject])

  const handleTemplateChange = (val) => {
    setTemplate(val)
    setSubject('')
    setBody('')
    lastAiKey.current = ''
  }

  // Client Type switches which PDF template set (Static vs E-commerce) loads.
  const handleClientTypeChange = (val) => {
    setClientType(val)
    setSubject('')
    setBody('')
    setPreviewSubject('')
    setPreviewHtml('')
    lastAiKey.current = ''
  }

  // Images are downscaled/re-encoded before reading — see imageCompress.js for
  // why (screenshots are often multi-MB and cross the network twice on send).
  // Non-image files (PDFs, etc.) pass through unchanged.
  const readFile = async (file, onDone) => {
    const toRead = await compressImageIfNeeded(file)
    const reader = new FileReader()
    reader.onload = (ev) => {
      const b64 = ev.target.result.split(',')[1]
      onDone({ name: toRead.name, type: toRead.type || 'application/octet-stream', size: toRead.size, data: b64 }, ev.target.result)
    }
    reader.readAsDataURL(toRead)
  }

  const handleBefore = (e) => {
    const file = e.target.files[0]
    if (!file) return
    readFile(file, (payload, dataUrl) => {
      setBeforeFile(payload)
      setBeforeThumb(file.type.startsWith('image/') ? dataUrl : null)
    })
  }

  const handleAfter = (e) => {
    const file = e.target.files[0]
    if (!file) return
    readFile(file, (payload, dataUrl) => {
      setAfterFile(payload)
      setAfterThumb(file.type.startsWith('image/') ? dataUrl : null)
    })
  }

  const handleAdditionalFiles = useCallback((fileList) => {
    Array.from(fileList).forEach(file => {
      readFile(file, (payload) => {
        setAdditionalFiles(prev => [...prev, payload])
      })
    })
  }, [])

  const removeAdditional = (idx) => {
    setAdditionalFiles(prev => prev.filter((_, i) => i !== idx))
  }

  const validate = ({ requireRecipient = true, silent = false } = {}) => {
    if (requireRecipient) {
      if (!to.trim()) { if (!silent) showToast('Recipient "To" address is mandatory.', 'error'); return false }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to.trim())) { if (!silent) showToast('Please enter a valid "To" email address.', 'error'); return false }
    }
    if (template !== 'manual') {
      if (!clientName.trim()) { if (!silent) showToast('Client Name is required when using templates.', 'error'); return false }
      if (isBeforeAfter && (!beforeFile || !afterFile)) {
        if (!silent) showToast('Before & After screenshots are required for this template.', 'error')
        return false
      }
    }
    return true
  }

  const getSettings = () => ({
    aiProvider: localStorage.getItem('ai_provider') || 'gemini',
    aiKey:      localStorage.getItem('ai_key') || '',
    aiModel:    localStorage.getItem('ai_model') || 'gemini-2.5-flash',
  })

  // Verdana is the default font for every outgoing email (any template,
  // including AI) unless the content already sets its own font.
  const wrapDefaultFont = (html) =>
    `<div style="font-family:Verdana,Arial,sans-serif;font-size:14px;line-height:1.6;color:#222">${html}</div>`

  // auto=true → silent auto-generation (no recipient required, no success toast).
  const compilePreview = async (auto = false) => {
    if (generating) return
    if (!validate({ requireRecipient: !auto, silent: auto })) return

    // Template 3 → AI (only place AI is used). Static vs E-commerce prompt is
    // chosen inside generateAiEmail; the AI returns both the subject and body.
    if (template === '3') {
      const aiKeyStr = `${clientType}|${beforeFile?.name}|${afterFile?.name}`
      setGenerating(true)
      setPreviewHtml(`<div class="et-loading-block"><div class="et-spinner et-spinner-lg"></div><p style="color:#94a3b8">Generating the Audit email with AI...</p><span style="font-size:0.7rem;color:#64748b">This may take a few seconds...</span></div>`)
      try {
        const ai = await generateAiEmail(clientName, beforeFile, afterFile, getSettings(), clientType)
        const finalBody = ai.body
        // Subject is generated dynamically by the AI; fallback only if it omits one.
        const finalSubj = ai.subject || (clientType === 'static'
          ? `Digital Commerce & Revenue Growth Audit – ${clientName}`
          : `Product Data Enrichment Opportunity – ${clientName} | Before vs After Analysis`)
        setPreviewHtml(wrapDefaultFont(finalBody))
        setPreviewSubject(finalSubj)
        setSubject(finalSubj)
        setBody(finalBody.replace(/<[^>]*>/g, '\n').replace(/\n\n+/g, '\n\n').trim())
        lastAiKey.current = aiKeyStr
        showToast('AI Audit email generated!', 'success')
      } catch (err) {
        lastAiKey.current = ''  // allow a retry
        setPreviewHtml(`<div style="color:#EF4444;padding:1rem;text-align:center"><strong>AI Composition Failed:</strong><br>${err.message}<p style="margin-top:0.5rem;font-size:0.75rem;color:#94a3b8">Check your API key in Settings.</p></div>`)
        if (!auto) showToast('AI generation failed: ' + err.message, 'error')
      } finally {
        setGenerating(false)
      }
      return
    }

    // Templates 1/2/4 → predefined content (no AI). Client Type picks the copy.
    let subj = '', bod = ''
    if (template === '1') {
      const t = clientType === 'static' ? buildStaticTemplate1(clientName) : buildTemplate1(clientName)
      subj = t.subject; bod = t.body
    } else if (template === '2') {
      const t = buildTemplate2(clientName); subj = t.subject; bod = t.body
    } else if (template === '4') {
      const t = clientType === 'static' ? buildStaticTemplate4(clientName) : buildTemplate4(clientName)
      subj = t.subject; bod = t.body
    } else {
      subj = subject || '(No Subject)'
      bod = body.split('\n\n').map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('') || ''
    }

    setPreviewSubject(subj)
    setPreviewHtml(wrapDefaultFont(bod))
    setSubject(subj)
    if (template !== 'manual') setBody(bod.replace(/<[^>]*>/g, '\n').replace(/\n\n+/g, '\n\n').trim())
    if (!auto) showToast('Email preview compiled!', 'success')
  }

  // Auto-generation: debounced so it collapses rapid changes into one run.
  // Templates 1/2/4 fill instantly; Template 3 calls the AI once per unique
  // (clientType + before + after) set, and never off Client-Name keystrokes.
  useEffect(() => {
    if (autoTimer.current) clearTimeout(autoTimer.current)
    autoTimer.current = setTimeout(() => {
      if (isManual) return
      if (!clientName.trim()) return
      if (isBeforeAfter && (!beforeFile || !afterFile)) return
      if (template === '3') {
        const key = `${clientType}|${beforeFile?.name}|${afterFile?.name}`
        if (lastAiKey.current === key) return
      }
      compilePreview(true)
    }, 500)
    return () => { if (autoTimer.current) clearTimeout(autoTimer.current) }
    // eslint-disable-next-line
  }, [clientType, template, clientName, beforeFile, afterFile])

  const saveDraft = () => {
    const draft = {
      id: 'draft_' + Date.now(),
      to, cc, bcc, subject, body, template, clientType, clientName, emailMode,
      timestamp: Date.now(),
      attachmentNames: []
    }
    if (isBeforeAfter && beforeFile) draft.attachmentNames.push(beforeFile.name)
    if (isBeforeAfter && afterFile)  draft.attachmentNames.push(afterFile.name)
    additionalFiles.forEach(f => draft.attachmentNames.push(f.name))

    const existing = JSON.parse(localStorage.getItem('altius_draft_emails') || '[]')
    existing.unshift(draft)
    localStorage.setItem('altius_draft_emails', JSON.stringify(existing))
    onDraftSaved(existing.length)
    showToast('Draft saved successfully!', 'success')
    clearForm()
  }

  // ── Pre-send deliverability report ───────────────────────
  const [showReport, setShowReport] = useState(false)
  const [analyzing,  setAnalyzing]  = useState(false)
  const [report,     setReport]     = useState(null)

  const reviewBeforeSend = async () => {
    if (!previewHtml || previewHtml.includes('et-loading-block')) {
      showToast('Click "Compile Preview" first to generate the email.', 'error')
      return
    }
    if (!to) { showToast('Recipient "To" address is required.', 'error'); return }
    setReport(null); setAnalyzing(true); setShowReport(true)
    const r = await runDeliverabilityAnalysis({
      subject: previewSubject || subject,
      html: previewHtml,
      fromEmail: gmailStatus?.email,
      aiProvider: localStorage.getItem('ai_provider') || 'gemini',
      aiKey: localStorage.getItem('ai_key') || '',
      aiModel: localStorage.getItem('ai_model') || 'gemini-2.5-flash',
    })
    setReport(r); setAnalyzing(false)
  }

  const applyAiSuggestion = ({ subject: s, html }) => {
    if (s) { setSubject(s); setPreviewSubject(s) }
    if (html) {
      setPreviewHtml(html)
      setBody(html.replace(/<[^>]+>/g, '\n').replace(/\n\n+/g, '\n\n').trim())
    }
    setShowReport(false)
  }

  const sendEmail = async () => {
    if (!previewHtml || previewHtml.includes('et-loading-block')) {
      showToast('Click "Compile Preview" first to generate the email.', 'error')
      return
    }

    const localToken  = localStorage.getItem('gmail_access_token')
    const localExpiry = parseInt(localStorage.getItem('gmail_token_expiry') || '0')
    const localValid  = localToken && Date.now() < localExpiry

    if (!gmailStatus.connected && !localValid) {
      showToast('Gmail not connected. Please connect Gmail in Settings.', 'error')
      setSection('settings')
      return
    }

    const attachments = []
    if (isBeforeAfter) {
      if (beforeFile) attachments.push(beforeFile)
      if (afterFile)  attachments.push(afterFile)
    }
    additionalFiles.forEach(f => attachments.push(f))

    setSending(true)
    try {
      // Always the one backend send pipeline (server/src/routes/email.js
      // POST /send) — signature insertion, threading, and HTML body
      // construction happen exactly once, in exactly one place, regardless of
      // which Gmail connection authorizes the send. standaloneAccessToken is
      // only ever used by the backend when this account has no backend-linked
      // Gmail connection (EmailAccount row) — otherwise it's ignored there in
      // favor of the real connected account, so passing it here is harmless
      // even when gmailStatus.connected is already true via the backend.
      await api.post('/email/send', {
        to, cc: cc || undefined, bcc: bcc || undefined,
        subject: previewSubject || subject,
        htmlBody: previewHtml,
        emailMode,
        threadId: threadId || undefined,
        quotedHtml: quotedHtml || undefined,
        companyId: companyContext?.companyId || undefined,
        standaloneAccessToken: localValid ? localToken : undefined,
        attachments: attachments.map(a => ({
          filename: a.name,
          content: a.data,
          mimeType: a.type
        }))
      })

      // The company's conversation cache no longer reflects reality — the user
      // returns to Company Detail by navigation (a remount, not a refreshKey
      // bump), so without this the freshly sent email would not show up.
      invalidateCompanyEmail(companyContext?.companyId)

      showToast(`Email sent successfully to ${to}!`, 'success')
      clearForm()
    } catch (err) {
      showToast('Send failed: ' + (err.response?.data?.message || err.message), 'error')
    } finally {
      setSending(false)
    }
  }

  const clearForm = () => {
    setTo(''); setCc(''); setBcc(''); setClientName('')
    setTemplate('1'); setSubject(''); setBody('')
    setThreadId(''); setQuotedHtml('')
    setBeforeFile(null); setAfterFile(null)
    setBeforeThumb(null); setAfterThumb(null)
    setAdditionalFiles([])
    setPreviewHtml(''); setPreviewSubject('')
  }

  // Attachment names for preview panel
  const previewAttachNames = []
  if (isBeforeAfter) {
    if (beforeFile) previewAttachNames.push(beforeFile.name)
    if (afterFile)  previewAttachNames.push(afterFile.name)
  }
  additionalFiles.forEach(f => previewAttachNames.push(f.name))

  return (
    <div className="et-section">
      <div className="et-panel-header">
        <h2 className="et-panel-title">Compose Email</h2>
      </div>

      <div className="et-compose-split">
        {/* ── Left: Form ── */}
        <div className="et-form-card">
          {/* Sender (readonly) */}
          <div className="et-form-group">
            <label className="et-label">From (Sender)</label>
            <div className="et-input et-readonly">
              {gmailStatus.email || 'Manoj@altiusnxt.com'}
            </div>
          </div>

          {/* To */}
          <div className="et-form-group">
            <label className="et-label">To</label>
            <input className="et-input" type="email" placeholder="recipient@company.com"
              value={to} onChange={e => setTo(e.target.value)} />
          </div>

          {/* CC / BCC */}
          <div className="et-form-row">
            <div className="et-form-group">
              <label className="et-label">CC</label>
              <input className="et-input" type="email" placeholder="cc@company.com"
                value={cc} onChange={e => setCc(e.target.value)} />
            </div>
            <div className="et-form-group">
              <label className="et-label">BCC</label>
              <input className="et-input" type="email" placeholder="bcc@company.com"
                value={bcc} onChange={e => setBcc(e.target.value)} />
            </div>
          </div>

          {/* Email Mode — controls thread continuation for this send only.
              "Continue Existing Thread" looks up the latest conversation by
              sender+recipient email automatically; no manual thread picking. */}
          <div className="et-form-group">
            <label className="et-label">Email Mode</label>
            <select className="et-input" value={emailMode} onChange={e => setEmailMode(e.target.value)}>
              <option value="continue">Continue Existing Thread</option>
              <option value="new">New Conversation</option>
            </select>
          </div>

          {/* Present only for a genuine Reply/Reply All/Forward (see
              ThreadDrawer.jsx) — the quoted original message that will be
              appended after your signature on send. Read-only; not part of
              the editable body above. */}
          {quotedHtml && (
            <div className="et-form-group">
              <label className="et-label">Quoted below your signature</label>
              <div
                className="et-input et-readonly"
                style={{ height: 'auto', maxHeight: 160, overflowY: 'auto', whiteSpace: 'normal', lineHeight: 1.5 }}
                dangerouslySetInnerHTML={{ __html: quotedHtml }}
              />
            </div>
          )}

          {/* Client Type — selects which template set (Static vs E-commerce) loads */}
          <div className="et-form-group">
            <label className="et-label">Client Type</label>
            <select className="et-input" value={clientType} onChange={e => handleClientTypeChange(e.target.value)}>
              <option value="ecommerce">E-commerce</option>
              <option value="static">Static Website</option>
            </select>
          </div>

          {/* Template */}
          <div className="et-form-group">
            <label className="et-label">Email Template</label>
            <select className="et-input" value={template} onChange={e => handleTemplateChange(e.target.value)}>
              <option value="manual">✍️ Manual</option>
              <option value="1">1 — Before &amp; After Sample</option>
              <option value="2">2 — Client References</option>
              <option value="3">3 — Audit (AI)</option>
              <option value="4">4 — Pilot Offer POC</option>
            </select>
          </div>

          {/* Client Name (if not manual) */}
          {!isManual && (
            <div className="et-form-group">
              <label className="et-label">Client Name</label>
              <input className="et-input" type="text" placeholder="e.g. John Smith"
                value={clientName} onChange={e => setClientName(e.target.value)} />
            </div>
          )}

          {/* Before/After uploads (template 1 or 3) */}
          {!isManual && (
            <div className="et-form-group">
              <label className="et-label">
                Before &amp; After Screenshots
                {isBeforeAfter ? ' (Required)' : ' (Optional)'}
              </label>
              <div className="et-upload-grid">
                <div className={`et-upload-box ${isBeforeAfter ? 'required' : ''}`}>
                  <input ref={beforeRef} type="file" accept="image/*,.pdf" onChange={handleBefore} />
                  {beforeThumb
                    ? <img src={beforeThumb} alt="before" className="et-thumb" />
                    : beforeFile?.type === 'application/pdf'
                      ? <span style={{ color: '#EF4444', fontSize: '0.75rem', fontWeight: 600 }}>📄 PDF Attached</span>
                      : <>
                          <span className="et-upload-icon">⬆️</span>
                          <div className="et-upload-text"><span>BEFORE</span> screenshot</div>
                        </>
                  }
                  <div className="et-upload-filename">
                    {beforeFile ? beforeFile.name : 'PNG, JPG, PDF'}
                  </div>
                </div>

                <div className={`et-upload-box ${isBeforeAfter ? 'required' : ''}`}>
                  <input ref={afterRef} type="file" accept="image/*,.pdf" onChange={handleAfter} />
                  {afterThumb
                    ? <img src={afterThumb} alt="after" className="et-thumb" />
                    : afterFile?.type === 'application/pdf'
                      ? <span style={{ color: '#EF4444', fontSize: '0.75rem', fontWeight: 600 }}>📄 PDF Attached</span>
                      : <>
                          <span className="et-upload-icon">⬆️</span>
                          <div className="et-upload-text"><span>AFTER</span> screenshot</div>
                        </>
                  }
                  <div className="et-upload-filename">
                    {afterFile ? afterFile.name : 'PNG, JPG, PDF'}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Additional Attachments */}
          <div className="et-form-group">
            <label className="et-label">Additional Attachments</label>
            <div
              className={`et-drop-zone ${isDragOver ? 'dragover' : ''}`}
              onDragOver={e => { e.preventDefault(); setIsDragOver(true) }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={e => { e.preventDefault(); setIsDragOver(false); handleAdditionalFiles(e.dataTransfer.files) }}
            >
              <input ref={addFilesRef} type="file" multiple onChange={e => handleAdditionalFiles(e.target.files)} />
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: '#64748b' }}>
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
              </svg>
              <p>Drag &amp; drop files or <span>click to browse</span></p>
            </div>
            {additionalFiles.length > 0 && (
              <div className="et-file-list">
                {additionalFiles.map((f, i) => (
                  <div key={i} className="et-file-item">
                    <div className="et-file-info">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
                      </svg>
                      <span className="et-file-name" title={f.name}>{f.name}</span>
                      <span className="et-file-size">({formatBytes(f.size)})</span>
                    </div>
                    <button className="et-file-remove" onClick={() => removeAdditional(i)}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Subject */}
          <div className="et-form-group">
            <label className="et-label">Subject Line</label>
            <input className="et-input" type="text" placeholder="Email subject..."
              value={subject} onChange={e => setSubject(e.target.value)} />
          </div>

          {/* Body */}
          <div className="et-form-group">
            <label className="et-label">Email Body</label>
            <textarea className="et-textarea" rows="6"
              placeholder={isManual ? 'Write your email body...' : 'Auto-filled after clicking Compile Preview. You can edit.'}
              value={body} onChange={e => setBody(e.target.value)}
            />
          </div>

          {/* Action Buttons */}
          <div className="et-actions">
            <button className="et-btn et-btn-secondary" onClick={() => compilePreview()} disabled={generating}>
              {generating
                ? <><div className="et-spinner" /> Generating...</>
                : <>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                    </svg>
                    Compile Preview
                  </>
              }
            </button>
            <button className="et-btn et-btn-secondary" onClick={saveDraft}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                <polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
              </svg>
              Save Draft
            </button>
            <button className="et-btn et-btn-primary" onClick={reviewBeforeSend} disabled={sending || analyzing}>
              {sending
                ? <><div className="et-spinner" /> Sending...</>
                : analyzing
                  ? <><div className="et-spinner" /> Analyzing...</>
                  : <>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="22" y1="2" x2="11" y2="13"/>
                        <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                      </svg>
                      Review &amp; Send
                    </>
              }
            </button>
          </div>
        </div>

        <DeliverabilityReport
          open={showReport}
          analyzing={analyzing}
          report={report}
          currentSubject={previewSubject || subject}
          sending={sending}
          onClose={() => setShowReport(false)}
          onApplyAI={applyAiSuggestion}
          onSend={sendEmail}
        />

        {/* ── Right: Live Preview ── */}
        <div className="et-preview-card">
          <div className="et-preview-header">
            <h3>Live Gmail Delivery Preview</h3>
          </div>

          <div className="et-preview-meta">
            <div className="et-meta-row">
              <span className="et-meta-label">FROM</span>
              <span className="et-meta-val">{gmailStatus.email || 'Manoj@altiusnxt.com'}</span>
            </div>
            <div className="et-meta-row">
              <span className="et-meta-label">TO</span>
              <span className="et-meta-val">{to || '(Recipient email address)'}</span>
            </div>
            {cc && (
              <div className="et-meta-row">
                <span className="et-meta-label">CC</span>
                <span className="et-meta-val">{cc}</span>
              </div>
            )}
            {bcc && (
              <div className="et-meta-row">
                <span className="et-meta-label">BCC</span>
                <span className="et-meta-val">{bcc}</span>
              </div>
            )}
            <div className="et-meta-row">
              <span className="et-meta-label">SUBJECT</span>
              <span className="et-meta-val">{previewSubject || subject || '(No Subject)'}</span>
            </div>
          </div>

          <div className="et-preview-body">
            <div className="et-gmail-envelope">
              {previewHtml
                ? <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
                : <p className="et-preview-placeholder">
                    Configure client name, email, and select an outreach type on the left, then click <strong>Compile Preview</strong> to generate the live email content here.
                  </p>
              }
            </div>
          </div>

          {previewAttachNames.length > 0 && (
            <div className="et-preview-attachments">
              {previewAttachNames.map((name, i) => <AttachChip key={i} name={name} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// Drafts Section
// ─────────────────────────────────────────────────────────
function DraftsSection({ onLoadDraft, setSection }) {
  const [drafts, setDrafts] = useState([])

  const load = () => {
    const stored = JSON.parse(localStorage.getItem('altius_draft_emails') || '[]')
    setDrafts(stored)
  }

  useEffect(() => { load() }, [])

  const deleteDraft = (e, id) => {
    e.stopPropagation()
    const updated = drafts.filter(d => d.id !== id)
    localStorage.setItem('altius_draft_emails', JSON.stringify(updated))
    setDrafts(updated)
    showToast('Draft deleted.', 'info')
  }

  const loadDraft = (draft) => {
    onLoadDraft(draft)
    setSection('composer')
  }

  return (
    <div className="et-section">
      <div className="et-panel-header">
        <h2 className="et-panel-title">Drafts</h2>
        <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{drafts.length} draft{drafts.length !== 1 ? 's' : ''} saved</span>
      </div>

      <div className="et-grid-panel">
        <div className="et-table-scroll">
          <table className="et-grid-table">
            <thead>
              <tr>
                <th>RECIPIENT EMAIL</th>
                <th>SUBJECT LINE</th>
                <th>SAVED DATE &amp; TIME</th>
                <th style={{ width: 60, textAlign: 'center' }}>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {drafts.length === 0 ? (
                <tr>
                  <td colSpan="4" className="et-td-empty">No drafts saved yet. Use "Save Draft" in the Composer.</td>
                </tr>
              ) : drafts.map(d => (
                <tr key={d.id} onClick={() => loadDraft(d)}>
                  <td style={{ fontWeight: 500 }}>{d.to || <span style={{ color: '#64748b', fontStyle: 'italic' }}>(No Recipient)</span>}</td>
                  <td>{d.subject || <span style={{ color: '#64748b', fontStyle: 'italic' }}>(No Subject)</span>}</td>
                  <td style={{ color: '#94a3b8', whiteSpace: 'nowrap' }}>{fmtDateTime(d.timestamp)}</td>
                  <td style={{ textAlign: 'center' }}>
                    <button className="et-draft-del-btn" onClick={e => deleteDraft(e, d.id)} title="Delete Draft">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// Analytics Section
// ─────────────────────────────────────────────────────────
function AnalyticsSection() {
  const chartRef = useRef()
  const chartInstance = useRef(null)
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  // Real send counts from the Activity table.
  useEffect(() => {
    let cancelled = false
    api.get('/email/analytics')
      .then(r => { if (!cancelled) setStats(r.data) })
      .catch(() => { if (!cancelled) setStats({ totalSent: 0, sentToday: 0, sentWeek: 0, sentMonth: 0, last7Days: [] }) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!chartRef.current || !stats) return

    if (chartInstance.current) chartInstance.current.destroy()

    chartInstance.current = new Chart(chartRef.current, {
      type: 'bar',
      data: {
        labels: stats.last7Days.map(d => d.label),
        datasets: [{
          label: 'Emails Sent',
          data: stats.last7Days.map(d => d.count),
          backgroundColor: '#E11D48',
          borderColor: '#EF4444',
          borderWidth: 1,
          borderRadius: 4,
          hoverBackgroundColor: '#BE123C'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#1E293B',
            titleColor: '#F8FAFC',
            bodyColor: '#94A3B8',
            borderColor: 'rgba(255,255,255,0.08)',
            borderWidth: 1
          }
        },
        scales: {
          x: {
            grid: { color: 'rgba(255,255,255,0.03)' },
            ticks: { color: '#94A3B8', font: { family: 'Inter', size: 11 } }
          },
          y: {
            grid: { color: 'rgba(255,255,255,0.03)' },
            ticks: { color: '#94A3B8', precision: 0, font: { family: 'Inter', size: 11 } },
            min: 0
          }
        }
      }
    })

    return () => { chartInstance.current?.destroy() }
  }, [stats])

  const kpis = [
    { label: 'Total Sent',      value: stats?.totalSent ?? '—', sub: 'all time' },
    { label: 'Sent Today',      value: stats?.sentToday ?? '—', sub: 'last 24 hours' },
    { label: 'Sent This Week',  value: stats?.sentWeek ?? '—',  sub: 'since Monday' },
    { label: 'Sent This Month', value: stats?.sentMonth ?? '—', sub: 'this calendar month' },
  ]

  return (
    <div className="et-section">
      <div className="et-panel-header">
        <h2 className="et-panel-title">Analytics</h2>
      </div>

      <div className="et-panel-body">
        <div className="et-kpi-grid">
          {kpis.map(k => (
            <div key={k.label} className="et-kpi-card">
              <div className="et-kpi-label">{k.label}</div>
              <div className="et-kpi-val">{loading ? '—' : k.value}</div>
              <div className="et-kpi-sub">{k.sub}</div>
            </div>
          ))}
        </div>

        <div className="et-chart-card">
          <div className="et-chart-title">Emails Sent — Last 7 Days</div>
          <div className="et-chart-container">
            <canvas ref={chartRef} />
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// Settings Section
// ─────────────────────────────────────────────────────────
function SettingsSection({ onGmailChange }) {
  const [googleClientId, setGoogleClientId] = useState(localStorage.getItem('google_client_id') || '')
  const [aiProvider, setAiProvider]         = useState(localStorage.getItem('ai_provider') || 'gemini')
  const [aiKey, setAiKey]                   = useState(localStorage.getItem('ai_key') || '')
  const [aiModel, setAiModel]               = useState(localStorage.getItem('ai_model') || 'gemini-2.5-flash')
  const [connecting, setConnecting]         = useState(false)
  const [detecting, setDetecting]           = useState(false)
  const [signature, setSignature]           = useState('')
  const [signatureImage, setSignatureImage] = useState('')
  const [savingSig, setSavingSig]           = useState(false)
  const [loadingSig, setLoadingSig]         = useState(true)
  const [processingSigImage, setProcessingSigImage] = useState(false)

  const localToken  = localStorage.getItem('gmail_access_token')
  const localExpiry = parseInt(localStorage.getItem('gmail_token_expiry') || '0')
  const localValid  = localToken && Date.now() < localExpiry

  // Signature is saved server-side per user (not localStorage) so it applies
  // consistently everywhere — Email Tool, Contact email, Company email — via
  // the backend's single /email/send route, not per-device.
  useEffect(() => {
    api.get('/users/me/signature')
      .then(r => {
        setSignature(r.data.signature || '')
        setSignatureImage(r.data.signatureImage || '')
      })
      .catch(() => {})
      .finally(() => setLoadingSig(false))
  }, [])

  const saveSignature = async () => {
    setSavingSig(true)
    try {
      await api.put('/users/me/signature', { signature, signatureImage })
      showToast('Signature saved — it will be added to every outgoing email.', 'success')
    } catch (err) {
      showToast('Failed to save signature: ' + (err?.response?.data?.message || err.message), 'error')
    } finally {
      setSavingSig(false)
    }
  }

  // Compress (reusing the same attachment-compression logic) then convert to a
  // data-URI, so the signature image stays small and needs no separate upload
  // route/static-file infra — it's saved inline alongside the signature text.
  const handleSigImagePick = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setProcessingSigImage(true)
    try {
      const compressed = await compressImageIfNeeded(file)
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.onerror = reject
        reader.readAsDataURL(compressed)
      })
      setSignatureImage(dataUrl)
    } catch (err) {
      showToast('Could not process that image: ' + err.message, 'error')
    } finally {
      setProcessingSigImage(false)
    }
  }

  // Auto-detect the best supported Gemini model for whatever key the user
  // pastes in — they should never have to know/guess a model name. Runs on
  // Save (when a key is present) and can be re-run manually if needed.
  const detectModel = async (key) => {
    if (aiProvider !== 'gemini' || !key) return
    setDetecting(true)
    try {
      const best = await discoverBestGeminiModel(key)
      setAiModel(best)
      localStorage.setItem('ai_model', best)
      showToast(`Detected best Gemini model: ${best}`, 'success')
    } catch (err) {
      showToast(`Model auto-detection failed: ${err.message}`, 'error')
    } finally {
      setDetecting(false)
    }
  }

  const saveSettings = async () => {
    localStorage.setItem('google_client_id', googleClientId.trim())
    localStorage.setItem('ai_provider', aiProvider)
    const trimmedKey = aiKey.trim()
    localStorage.setItem('ai_key', trimmedKey)
    localStorage.setItem('ai_model', aiModel)
    showToast('Settings saved successfully!', 'success')
    if (aiProvider === 'gemini' && trimmedKey) await detectModel(trimmedKey)
  }

  const connectGmail = async () => {
    setConnecting(true)
    try {
      // Try NXT Sales backend OAuth first
      const r = await api.get('/email/gmail/auth-url')
      const popup = window.open(r.data.url, 'gmail_connect', 'width=500,height=600')

      const handleMessage = (event) => {
        if (event.data === 'gmail_success') {
          window.removeEventListener('message', handleMessage)
          popup?.close()
          api.get('/email/status').then(res => {
            onGmailChange(res.data)
            showToast(`Gmail connected: ${res.data.email || ''}`, 'success')
          }).catch(() => {})
        } else if (event.data === 'gmail_error') {
          window.removeEventListener('message', handleMessage)
          popup?.close()
          showToast('Gmail connection failed. Try again.', 'error')
        }
      }
      window.addEventListener('message', handleMessage)

    } catch (err) {
      // Fallback: standalone implicit OAuth flow
      const clientId = googleClientId.trim()
      if (!clientId) {
        showToast('Please enter your Google Web Client ID first.', 'error')
        setConnecting(false)
        return
      }
      const redirectUri = window.location.origin + window.location.pathname
      const scope = 'https://www.googleapis.com/auth/gmail.send'
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=token&scope=${encodeURIComponent(scope)}&state=gmail_auth`
      window.location.href = authUrl
    } finally {
      setConnecting(false)
    }
  }

  const disconnectGmail = async () => {
    try {
      await api.delete('/email/gmail/disconnect')
    } catch {}
    localStorage.removeItem('gmail_access_token')
    localStorage.removeItem('gmail_token_expiry')
    onGmailChange({ connected: false, email: null })
    showToast('Disconnected Gmail session.', 'info')
  }

  return (
    <div className="et-section">
      <div className="et-panel-header">
        <h2 className="et-panel-title">Settings</h2>
      </div>

      <div className="et-panel-body">
        <div className="et-settings-card">
          <div className="et-settings-title">Google &amp; AI Configuration</div>

          <div className="et-form-group">
            <label className="et-label">Google OAuth Web Client ID</label>
            <input className="et-input" type="password" placeholder="your-client-id.apps.googleusercontent.com"
              value={googleClientId} onChange={e => setGoogleClientId(e.target.value)} />
            <div className="et-help-text">
              Required for standalone Gmail OAuth flow. Get it from <a href="https://console.cloud.google.com" target="_blank" rel="noreferrer">Google Cloud Console</a>
            </div>
          </div>

          <div className="et-form-group">
            <label className="et-label">AI Provider</label>
            <select className="et-input" value={aiProvider} onChange={e => setAiProvider(e.target.value)}>
              <option value="gemini">Google Gemini (Recommended)</option>
              <option value="openai">OpenAI GPT-4o</option>
              <option value="anthropic">Anthropic Claude</option>
            </select>
          </div>

          {aiProvider === 'gemini' && (
            <div className="et-form-group">
              <label className="et-label">AI Model</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <select className="et-input" value={aiModel} onChange={e => setAiModel(e.target.value)} style={{ flex: 1 }}>
                  <option value="gemini-2.5-flash">Gemini 2.5 Flash (Recommended)</option>
                  <option value="gemini-2.5-pro">Gemini 2.5 Pro</option>
                  <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
                  <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
                  <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
                </select>
                <button
                  type="button"
                  className="et-btn et-btn-secondary"
                  style={{ flex: 'none', whiteSpace: 'nowrap' }}
                  disabled={detecting || !aiKey.trim()}
                  onClick={() => detectModel(aiKey.trim())}
                >
                  {detecting ? 'Detecting…' : 'Auto-detect'}
                </button>
              </div>
              <div className="et-help-text">
                Auto-detected from your API key when you save — you shouldn't need to pick this
                manually. If Template 3 generation fails because a model was retired, it automatically
                retries with the next best supported model.
              </div>
            </div>
          )}

          <div className="et-form-group">
            <label className="et-label">AI API Key</label>
            <input className="et-input" type="password" placeholder="Your API key for the selected provider"
              value={aiKey} onChange={e => setAiKey(e.target.value)} />
            <div className="et-help-text">Used for PDP Audit AI email generation (Template 3)</div>
          </div>

          <div className="et-settings-actions">
            <button className="et-btn et-btn-primary" style={{ flex: 'none', minWidth: 140 }} onClick={saveSettings}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                <polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
              </svg>
              Save &amp; Apply
            </button>

            {localValid ? (
              <button className="et-btn et-btn-secondary" style={{ flex: 'none', minWidth: 170 }} onClick={disconnectGmail}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
                Disconnect Gmail
              </button>
            ) : (
              <button className="et-btn et-btn-secondary" style={{ flex: 'none', minWidth: 170 }} onClick={connectGmail} disabled={connecting}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
                  <polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/>
                </svg>
                {connecting ? 'Connecting...' : 'Connect Gmail Account'}
              </button>
            )}
          </div>
        </div>

        {/* Token consumption across every AI feature, tracked centrally —
            see utils/aiUsage.js. Read-only; changes no AI behavior. */}
        <AiUsagePanel />

        <div className="et-settings-card">
          <div className="et-settings-title">Email Signature</div>
          <div className="et-form-group">
            <label className="et-label">Default Signature</label>
            <textarea
              className="et-input"
              rows={5}
              placeholder="e.g. Your Name&#10;Your Title&#10;Company | Phone | Email"
              value={signature}
              disabled={loadingSig}
              onChange={e => setSignature(e.target.value)}
              style={{ resize: 'vertical', fontFamily: 'Verdana,Arial,sans-serif' }}
            />
            <div className="et-help-text">
              Saved once for your account and automatically added to every outgoing email —
              from the Email Tool, and from Contact/Company "Log an email" — no need to add it manually each time.
            </div>
          </div>
          <div className="et-form-group">
            <label className="et-label">Signature Image (optional)</label>
            {signatureImage && (
              <div style={{ marginBottom: 8 }}>
                <img src={signatureImage} alt="Signature" style={{ maxWidth: 280, maxHeight: 120, display: 'block', border: '1px solid #e2e2e2', borderRadius: 4, padding: 4 }} />
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="file" accept="image/*" onChange={handleSigImagePick} disabled={processingSigImage || loadingSig} />
              {signatureImage && (
                <button type="button" className="et-btn" onClick={() => setSignatureImage('')} disabled={processingSigImage}>
                  Remove
                </button>
              )}
              {processingSigImage && <span className="et-help-text">Processing…</span>}
            </div>
            <div className="et-help-text">
              e.g. a logo or handwritten-style signature. Shown below your signature text on every outgoing email.
            </div>
          </div>
          <div className="et-settings-actions">
            <button className="et-btn et-btn-primary" style={{ flex: 'none', minWidth: 140 }} onClick={saveSignature} disabled={savingSig || loadingSig}>
              {savingSig ? 'Saving…' : 'Save Signature'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// The standalone-Gmail-token direct-to-Gmail-API send path that used to live
// here (sendViaGmailDirect) has been removed — it was a second, divergent
// implementation that never applied the signature or thread headers. Every
// send now goes through POST /api/email/send (see sendEmail() above), which
// accepts a standaloneAccessToken and forwards it to the backend, so a
// standalone-connected user gets the exact same signature/threading/body
// pipeline as a backend-connected one — see server/src/routes/email.js.

// ─────────────────────────────────────────────────────────
// Main EmailTool Component
// ─────────────────────────────────────────────────────────
export default function EmailTool() {
  const location = useLocation()
  const [section, setSection]         = useState('composer')
  const [gmailStatus, setGmailStatus] = useState({ connected: false, email: null })
  const [draftsCount, setDraftsCount] = useState(0)
  const [initialDraft, setInitialDraft] = useState(null)

  // Context handed to the composer by another screen: Company Details (Email
  // quick action, "Log an email", or clicking a saved address — carries a
  // companyId), or a Reply/Reply All/Forward action from Inbox/ThreadDrawer
  // (carries to/cc/subject/quotedHtml/threadId, often with NO companyId since
  // Inbox is cross-company). Marketing → Email is the single compose surface,
  // so this is how every "open the composer already primed" flow reaches it —
  // built from any of these fields being present, not gated on companyId.
  const composeState = location.state
  const companyContext = (composeState && (composeState.companyId || composeState.to || composeState.threadId))
    ? {
        to: composeState.to || '',
        cc: composeState.cc || '',
        subject: composeState.subject || '',
        quotedHtml: composeState.quotedHtml || '',
        threadId: composeState.threadId || '',
        emailMode: composeState.emailMode || '',
        template: composeState.template || '',
        companyId: composeState.companyId || '',
        companyName: composeState.companyName || '',
      }
    : null

  // Land directly on the composer when arriving from a company or a Reply/
  // Reply All/Forward action.
  useEffect(() => {
    if (companyContext) setSection('composer')
  // eslint-disable-next-line
  }, [location.state?.companyId, location.state?.to, location.state?.threadId])

  // Check NXT Sales backend Gmail status
  useEffect(() => {
    api.get('/email/status')
      .then(r => setGmailStatus(r.data))
      .catch(() => {})

    // Also check standalone token
    const token  = localStorage.getItem('gmail_access_token')
    const expiry = parseInt(localStorage.getItem('gmail_token_expiry') || '0')
    if (token && Date.now() < expiry) {
      setGmailStatus(prev => prev.connected ? prev : { connected: true, email: null })
    }

    // Load drafts count
    const drafts = JSON.parse(localStorage.getItem('altius_draft_emails') || '[]')
    setDraftsCount(drafts.length)

    // Handle standalone OAuth callback (hash token)
    if (window.location.hash) {
      const params = new URLSearchParams(window.location.hash.substring(1))
      const accessToken = params.get('access_token')
      const expiresIn   = params.get('expires_in')
      const stateParam  = params.get('state')
      if (accessToken && stateParam === 'gmail_auth') {
        const expTime = Date.now() + parseInt(expiresIn) * 1000
        localStorage.setItem('gmail_access_token', accessToken)
        localStorage.setItem('gmail_token_expiry', expTime.toString())
        history.replaceState('', document.title, window.location.pathname + window.location.search)
        setGmailStatus({ connected: true, email: null })
        showToast('Gmail connected successfully!', 'success')
        setSection('composer')
      }
    }
  }, [])

  const handleCompose = () => {
    setInitialDraft(null)
    setSection('composer')
  }

  const handleLoadDraft = (draft) => {
    setInitialDraft(draft)
  }

  const handleDraftSaved = (count) => {
    setDraftsCount(count)
  }

  return (
    <div className="et-root">
      <ETSidebar
        section={section}
        setSection={setSection}
        draftsCount={draftsCount}
        gmailStatus={gmailStatus}
        onCompose={handleCompose}
      />

      <div className="et-content-panel">
        {section === 'composer' && (
          <ComposerSection
            gmailStatus={gmailStatus}
            setSection={setSection}
            onDraftSaved={handleDraftSaved}
            initialDraft={initialDraft}
            clearInitialDraft={() => setInitialDraft(null)}
            companyContext={companyContext}
          />
        )}
        {section === 'drafts' && (
          <DraftsSection
            onLoadDraft={handleLoadDraft}
            setSection={setSection}
          />
        )}
        {section === 'analytics' && <AnalyticsSection />}
        {section === 'settings' && (
          <SettingsSection onGmailChange={setGmailStatus} />
        )}
      </div>

      <ToastContainer />
    </div>
  )
}

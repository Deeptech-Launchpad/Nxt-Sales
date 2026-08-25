// Email AI prompts and predefined template content.
//
// MOVED here verbatim out of pages/EmailTool.jsx so the same definitions can
// seed the editable Prompt Templates stored in the database, without the
// content existing in two places. EmailTool still imports these, so nothing
// about how emails are generated changed — this is a relocation, not a
// rewrite, and the two client types (E-commerce / Static) and their four
// templates each are all preserved exactly as they were.
//
// These act as the built-in DEFAULTS: they seed the database on first use and
// remain the fallback if the server has no saved templates yet. Once a
// template is saved through Settings, the saved copy is what is used.
// ─────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────
export const AI_SYSTEM_PROMPT = (clientName) => `You are a Product Data Enrichment Sales Assistant for AltiusNXT Technologies.

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
// Template Builders
// ─────────────────────────────────────────────────────────
export function buildTemplate1(clientName) {
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

export function buildTemplate2(clientName) {
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

export function buildTemplate4(clientName) {
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
export function buildStaticTemplate1(clientName) {
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

export function buildStaticTemplate4(clientName) {
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
export const STATIC_AI_SYSTEM_PROMPT = (clientName) => `You are a Digital Commerce Transformation & Product Data Architecture Sales Consultant for AltiusNXT Technologies.

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
export const AUDIT_SUBJECT_OUTPUT_INSTRUCTION = `

IMPORTANT — OUTPUT FORMAT:
On the very first line, output a single, unique, compelling email subject line for THIS specific client, tailored to the uploaded Before/After screenshots and the recipient, in exactly this format:
SUBJECT: <subject line here>
Then, starting on the next line, output the full HTML email body exactly as instructed above. Do not repeat the word "SUBJECT:" anywhere inside the body, and do not wrap the subject in HTML tags.`


// ── Built-in template registry ─────────────────────────────────────────────
//
// Describes the eight templates that already existed, in the exact shape the
// PromptTemplate table stores. This is what seeds the database on first use
// and what the composer falls back to until then, so the prompts live in one
// place rather than being retyped server-side.
//
// Content templates are captured with a placeholder client name so the stored
// text is editable as plain text; {{clientName}} is substituted at generation
// time, exactly where the builder functions used their clientName argument.
export const CLIENT_TYPES = [
  { value: "ecommerce", label: "E-commerce" },
  { value: "static",    label: "Static E-commerce" },
]

const TOKEN = "{{clientName}}"

export function buildDefaultTemplates() {
  const e1 = buildTemplate1(TOKEN)
  const e2 = buildTemplate2(TOKEN)
  const e4 = buildTemplate4(TOKEN)
  const s1 = buildStaticTemplate1(TOKEN)
  const s4 = buildStaticTemplate4(TOKEN)
  return [
    { clientType: "ecommerce", templateKey: "1", label: "Template 1 — Before/After Intro", kind: "content", subject: e1.subject, content: e1.body, order: 0 },
    { clientType: "ecommerce", templateKey: "2", label: "Template 2 — Follow-up",          kind: "content", subject: e2.subject, content: e2.body, order: 1 },
    { clientType: "ecommerce", templateKey: "3", label: "Template 3 — AI PDP Audit prompt", kind: "ai_prompt", subject: null, content: AI_SYSTEM_PROMPT(TOKEN), order: 2 },
    { clientType: "ecommerce", templateKey: "4", label: "Template 4 — Final Follow-up",     kind: "content", subject: e4.subject, content: e4.body, order: 3 },
    { clientType: "static", templateKey: "1", label: "Template 1 — Before/After Intro", kind: "content", subject: s1.subject, content: s1.body, order: 0 },
    { clientType: "static", templateKey: "2", label: "Template 2 — Follow-up (shared)",  kind: "content", subject: e2.subject, content: e2.body, order: 1 },
    { clientType: "static", templateKey: "3", label: "Template 3 — AI PDP Audit prompt", kind: "ai_prompt", subject: null, content: STATIC_AI_SYSTEM_PROMPT(TOKEN), order: 2 },
    { clientType: "static", templateKey: "4", label: "Template 4 — Final Follow-up",     kind: "content", subject: s4.subject, content: s4.body, order: 3 },
  ]
}

// Substitutes the client name into a stored template at generation time.
export function applyClientName(text, clientName) {
  return String(text || "").split(TOKEN).join(clientName || "")
}

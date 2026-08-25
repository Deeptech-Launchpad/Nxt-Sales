// AltiusNXT Email Outreach Platform - Application Controller v2.0

// Application State
const state = {
    // Current Active Views
    currentView: 'compose',
    
    // Core User Configurations
    googleClientId: '',
    aiProvider: 'gemini',
    aiApiKey: '',
    gmailAccessToken: null,
    gmailTokenExpiry: 0,
    
    // Composer Forms States
    to: '',
    cc: '',
    bcc: '',
    subject: '',
    clientName: '',
    clientType: 'ecommerce',   // 'ecommerce' | 'static' — selects which PDF template set loads
    selectedTemplate: '1',
    bodyText: '',
    isGenerating: false,       // guard so overlapping auto-generations don't double-run the AI call
    
    // Attachments States
    beforeFile: null,      // { name, type, data: base64, size }
    afterFile: null,       // { name, type, data: base64, size }
    additionalFiles: [],   // Array of { name, type, data: base64, size }
    
    // Databases
    sentEmails: [],
    drafts: [],
    
    // Chart Instance
    chartInstance: null
};

// Corporate Signature HTML
const signatureHtml = `
<br>
<p><strong>Manoj S</strong><br>
Digital Commerce Lead<br>
m: +13134869697<br>
e: <a href="mailto:Manoj@altiusnxt.com">Manoj@altiusnxt.com</a><br>
w: <a href="https://www.altiusnxt.com" target="_blank">www.altiusnxt.com</a></p>
`;

// ============================================================================
// STATIC WEBSITE CLIENT TEMPLATE SET (verbatim content from the client PDF:
// "Sales Emarketing Content + Prompt.pdf" → "Static Website Customers").
// The E-commerce set already lives inside compileDraftPreview() unchanged.
// Templates 1, 2 and 4 are predefined (NO AI). Only Template 3 uses AI.
// ============================================================================

// Static — Email 1: Before & After Samples (predefined, no AI; images attached only)
const STATIC_EMAIL1_SUBJECT = 'From Static Website to Revenue-Generating eCommerce Store (Before & After Sample)';
function staticEmail1Body(clientName) {
    return `
        <p>Hi ${clientName},</p>
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
        <p>Static websites struggle because:</p>
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
        <p>Looking forward to your thoughts.</p>
    `;
}

// Static — Email 4: Pilot Offer POC (predefined, no AI; 5 products)
const STATIC_EMAIL4_SUBJECT = 'Complimentary eCommerce Store POC – 5 Products at No Cost (Proof of Concept)';
function staticEmail4Body(clientName) {
    return `
        <p>Hi ${clientName},</p>
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
        <p>Looking forward to your feedback.</p>
    `;
}

// Static — Email 3: AI System Prompt ("Static - Digital Commerce & Revenue
// Transformation Audit" from the PDF). Used only when Client Type = Static Website.
const STATIC_AUDIT_SYSTEM_PROMPT = `You are a Digital Commerce Transformation & Product Data Architecture Sales Consultant for AltiusNXT Technologies.

Your role is to generate a structured, professional, revenue-focused Online Business Growth & Revenue Audit email for a company that currently has a static or brochure-style website and no eCommerce presence, based on:
- Recipient Name: {{CLIENT_NAME}}
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
Do NOT include any closing remarks, signatures, or placeholders like "Best Regards" or "[Your Name]" at the end, as the signature block is automatically appended.

Tone: Professional, Strategic, Revenue-focused, Authoritative, Consultative, Sales-driven but not aggressive, Industry-adaptive, and never generic. Always connect technical improvements to business growth and revenue outcomes.
Formatting: Output directly in HTML (using tags like <p>, <strong>, <ul>, <li>, <table>, <tr>, <td>, <th>).
Do NOT include <html>, <body>, or <code> markdown tags. Wrap tables in standard inline CSS styles.`;

// Output-format extension appended to whichever audit prompt is used, so the AI
// returns BOTH a subject and the body. The underlying prompt logic is unchanged —
// this only adds a response-format instruction on top.
const AUDIT_SUBJECT_OUTPUT_INSTRUCTION = `

IMPORTANT — OUTPUT FORMAT:
On the very first line, output a single, unique, compelling email subject line for THIS specific client, tailored to the uploaded Before/After screenshots and the recipient, in exactly this format:
SUBJECT: <subject line here>
Then, starting on the next line, output the full HTML email body exactly as instructed above. Do not repeat the word "SUBJECT:" anywhere inside the body, and do not wrap the subject in HTML tags.`;

// Base64 fallback assets for quick testing
const demoBeforeBase64 = "iVBORw0KGgoAAAANSUhEUgAAAJYAAABkCAYAAABmB6UbAAAABmJLR0QA/wD/AP+gvaeTAAAAI0lEQVR42u3BAQEAAACAkP6v7ggKAAAAAAAAAAAAAAAAAAAAADcGA4cAATs2o58AAAAASUVORK5CYII=";
const demoAfterBase64 = "iVBORw0KGgoAAAANSUhEUgAAAJYAAABkCAYAAABmB6UbAAAABmJLR0QA/wD/AP+gvaeTAAAAI0lEQVR42u3BAQEAAACAkP6v7ggKAAAAAAAAAAAAAAAAAAAAADcGA4cAATs2o58AAAAASUVORK5CYII=";

// DOM Elements Mappings
const elements = {
    // Navigation Sidebar
    menuCompose: document.getElementById('menu-compose'),
    menuSent: document.getElementById('menu-sent'),
    menuDrafts: document.getElementById('menu-drafts'),
    menuAnalytics: document.getElementById('menu-analytics'),
    menuSettings: document.getElementById('menu-settings'),
    sidebarComposeBtn: document.getElementById('sidebar-compose-btn'),
    
    // Views Sections
    sectionCompose: document.getElementById('section-compose'),
    sectionSent: document.getElementById('section-sent'),
    sectionDrafts: document.getElementById('section-drafts'),
    sectionAnalytics: document.getElementById('section-analytics'),
    sectionSettings: document.getElementById('section-settings'),
    
    // Connection Info
    gmailStatus: document.getElementById('gmail-status'),
    gmailStatusText: document.getElementById('gmail-status-text'),
    
    // Compose Form fields
    emailTo: document.getElementById('email-to'),
    emailCc: document.getElementById('email-cc'),
    emailBcc: document.getElementById('email-bcc'),
    clientTypeSelect: document.getElementById('client-type-select'),
    emailTemplateSelect: document.getElementById('email-template-select'),
    clientNameGroup: document.getElementById('client-name-group'),
    clientNameInput: document.getElementById('client-name'),
    templateUploadsGroup: document.getElementById('template-uploads-group'),
    beforeFileInput: document.getElementById('before-file'),
    afterFileInput: document.getElementById('after-file'),
    beforeFilename: document.getElementById('before-filename'),
    afterFilename: document.getElementById('after-filename'),
    beforeThumbContainer: document.getElementById('before-thumb-container'),
    afterThumbContainer: document.getElementById('after-thumb-container'),
    beforeUploadBox: document.getElementById('before-upload-box'),
    afterUploadBox: document.getElementById('after-upload-box'),
    loadDemoAssetsLink: document.getElementById('load-demo-assets'),
    
    // Additional generic attachments
    additionalAttachmentsZone: document.getElementById('additional-attachments-zone'),
    additionalFilesInput: document.getElementById('additional-files-input'),
    uploadedFilesList: document.getElementById('uploaded-files-list'),
    
    // Content inputs
    emailSubject: document.getElementById('email-subject'),
    emailBodyEditor: document.getElementById('email-body-editor'),
    
    // Composer action buttons
    btnPreviewPitch: document.getElementById('btn-preview-pitch'),
    btnSaveDraft: document.getElementById('btn-save-draft'),
    btnSendEmail: document.getElementById('btn-send-email'),
    
    // Composer Live previews
    previewMetaTo: document.getElementById('preview-meta-to'),
    previewCcRow: document.getElementById('preview-cc-row'),
    previewMetaCc: document.getElementById('preview-meta-cc'),
    previewBccRow: document.getElementById('preview-bcc-row'),
    previewMetaBcc: document.getElementById('preview-meta-bcc'),
    previewMetaSubject: document.getElementById('preview-meta-subject'),
    previewHtmlBody: document.getElementById('preview-html-body'),
    previewAttachmentsSection: document.getElementById('preview-attachments-section'),
    previewAttachmentsContainer: document.getElementById('preview-attachments-container'),
    
    // Settings view
    googleClientIdInput: document.getElementById('google-client-id'),
    aiProviderSelect: document.getElementById('ai-provider'),
    aiApiKeyInput: document.getElementById('ai-key'),
    settingsSaveBtn: document.getElementById('settings-save-btn'),
    gmailConnectBtn: document.getElementById('gmail-connect-btn'),
    
    // Sent folder lists
    sentSearchInput: document.getElementById('sent-search-input'),
    sentEmailsTbody: document.getElementById('sent-emails-tbody'),
    
    // Drafts folder lists
    draftsEmailsTbody: document.getElementById('drafts-emails-tbody'),
    draftsCountBadge: document.getElementById('drafts-count-badge'),
    
    // Analytics view
    kpiTotalSent: document.getElementById('kpi-total-sent'),
    kpiSentToday: document.getElementById('kpi-sent-today'),
    kpiSentWeek: document.getElementById('kpi-sent-week'),
    kpiSentMonth: document.getElementById('kpi-sent-month'),
    analyticsBarChart: document.getElementById('analytics-bar-chart'),
    
    // Sent detail modal
    sentDetailModal: document.getElementById('sent-detail-modal'),
    detailModalTitle: document.getElementById('detail-modal-title'),
    detailModalClose: document.getElementById('detail-modal-close'),
    detailModalCloseBtn: document.getElementById('detail-modal-close-btn'),
    detailFrom: document.getElementById('detail-from'),
    detailTo: document.getElementById('detail-to'),
    detailDate: document.getElementById('detail-date'),
    detailSubject: document.getElementById('detail-subject'),
    detailBodyContent: document.getElementById('detail-body-content'),
    detailAttachmentsSection: document.getElementById('detail-attachments-section'),
    detailAttachmentsContainer: document.getElementById('detail-attachments-container'),
    
    // Mobile layout elements
    mobileSidebarToggle: document.getElementById('mobile-sidebar-toggle'),
    sidebarScrim: document.getElementById('sidebar-scrim'),
    sidebar: document.querySelector('.sidebar'),
    
    toastContainer: document.getElementById('toast-container')
};

// Initial Startups
window.addEventListener('DOMContentLoaded', () => {
    loadConfigurations();
    checkOAuthCallback();
    bindEventHandlers();
    updateGmailStatus();
    loadSentAndDraftsDatabases();
    syncTemplateUploadInputsDisplay();
});

// Load configs from local storage
function loadConfigurations() {
    state.googleClientId = localStorage.getItem('google_client_id') || '';
    state.aiProvider = localStorage.getItem('ai_provider') || 'gemini';
    state.aiApiKey = localStorage.getItem('ai_key') || '';
    state.gmailAccessToken = localStorage.getItem('gmail_access_token');
    state.gmailTokenExpiry = parseInt(localStorage.getItem('gmail_token_expiry') || '0');

    elements.googleClientIdInput.value = state.googleClientId;
    elements.aiProviderSelect.value = state.aiProvider;
    elements.aiApiKeyInput.value = state.aiApiKey;
}

// Check OAuth callback state parameters
function checkOAuthCallback() {
    if (window.location.hash) {
        const hash = window.location.hash.substring(1);
        const params = new URLSearchParams(hash);
        const accessToken = params.get('access_token');
        const expiresIn = params.get('expires_in');
        const stateParam = params.get('state');

        if (accessToken && stateParam === 'gmail_auth') {
            const expiryTime = Date.now() + parseInt(expiresIn) * 1000;
            localStorage.setItem('gmail_access_token', accessToken);
            localStorage.setItem('gmail_token_expiry', expiryTime.toString());
            
            // Clean hash URL redirect
            history.replaceState("", document.title, window.location.pathname + window.location.search);
            
            loadConfigurations();
            showToast('Gmail successfully connected!', 'success');
            showSection('compose');
        }
    }
}

// Load databases from localStorage
function loadSentAndDraftsDatabases() {
    const sent = localStorage.getItem('altius_sent_emails');
    state.sentEmails = sent ? JSON.parse(sent) : [];

    const draftsList = localStorage.getItem('altius_draft_emails');
    state.drafts = draftsList ? JSON.parse(draftsList) : [];

    updateDraftsBadgeCount();
}

// Sync Drafts badges counts
function updateDraftsBadgeCount() {
    const count = state.drafts.length;
    if (count > 0) {
        elements.draftsCountBadge.textContent = count;
        elements.draftsCountBadge.style.display = 'block';
    } else {
        elements.draftsCountBadge.style.display = 'none';
    }
}

// Render active UI sections
function showSection(sectionId) {
    state.currentView = sectionId;
    
    // Close sidebar drawer on mobile selection
    if (elements.sidebar && elements.sidebar.classList.contains('active')) {
        elements.sidebar.classList.remove('active');
        if (elements.sidebarScrim) elements.sidebarScrim.classList.remove('active');
    }
    
    // Hide all panels
    elements.sectionCompose.classList.add('hidden');
    elements.sectionSent.classList.add('hidden');
    elements.sectionDrafts.classList.add('hidden');
    elements.sectionAnalytics.classList.add('hidden');
    elements.sectionSettings.classList.add('hidden');

    // Show target section
    const activeSection = document.getElementById(`section-${sectionId}`);
    if (activeSection) activeSection.classList.remove('hidden');

    // Sync sidebar active links
    elements.menuCompose.classList.remove('active');
    elements.menuSent.classList.remove('active');
    elements.menuDrafts.classList.remove('active');
    elements.menuAnalytics.classList.remove('active');
    elements.menuSettings.classList.remove('active');

    const activeMenuItem = document.getElementById(`menu-${sectionId}`);
    if (activeMenuItem) activeMenuItem.classList.add('active');

    // Trigger grid/lists loads on route
    if (sectionId === 'sent') renderSentEmailsGrid();
    if (sectionId === 'drafts') renderDraftsGrid();
    if (sectionId === 'analytics') renderAnalyticsView();
}

// Check Gmail connection state
function updateGmailStatus() {
    const isTokenValid = state.gmailAccessToken && Date.now() < state.gmailTokenExpiry;
    if (isTokenValid) {
        elements.gmailStatus.className = 'status-badge connected';
        elements.gmailStatusText.textContent = 'Gmail Connected';
        elements.btnSendEmail.disabled = false;
        elements.gmailConnectBtn.textContent = 'Disconnect Gmail Account';
    } else {
        elements.gmailStatus.className = 'status-badge disconnected';
        elements.gmailStatusText.textContent = 'Gmail Disconnected';
        elements.btnSendEmail.disabled = true;
        elements.gmailConnectBtn.textContent = 'Connect Gmail Account';
    }
}

// Dynamic Template display controllers
function syncTemplateUploadInputsDisplay() {
    state.selectedTemplate = elements.emailTemplateSelect.value;
    
    if (state.selectedTemplate === 'manual') {
        elements.clientNameGroup.style.display = 'none';
        elements.templateUploadsGroup.style.display = 'none';
    } else {
        elements.clientNameGroup.style.display = 'flex';
        elements.templateUploadsGroup.style.display = 'flex';
        
        // Show/hide screenshot files required borders
        const isBeforeAfterRequired = state.selectedTemplate === '1' || state.selectedTemplate === '3';
        if (isBeforeAfterRequired) {
            elements.beforeUploadBox.style.borderColor = 'rgba(225, 29, 72, 0.4)';
            elements.afterUploadBox.style.borderColor = 'rgba(225, 29, 72, 0.4)';
        } else {
            elements.beforeUploadBox.style.borderColor = '';
            elements.afterUploadBox.style.borderColor = '';
        }
    }
}

// Register all UI events
function bindEventHandlers() {
    // Sidebar routing navigation links
    elements.menuCompose.addEventListener('click', (e) => { e.preventDefault(); showSection('compose'); });
    elements.menuSent.addEventListener('click', (e) => { e.preventDefault(); showSection('sent'); });
    elements.menuDrafts.addEventListener('click', (e) => { e.preventDefault(); showSection('drafts'); });
    elements.menuAnalytics.addEventListener('click', (e) => { e.preventDefault(); showSection('analytics'); });
    elements.menuSettings.addEventListener('click', (e) => { e.preventDefault(); showSection('settings'); });
    elements.sidebarComposeBtn.addEventListener('click', () => { showSection('compose'); clearComposerForm(); });

    // Client Type select — switches which PDF template set (Static vs E-commerce) loads
    elements.clientTypeSelect.addEventListener('change', () => {
        state.clientType = elements.clientTypeSelect.value;
        // Clear stale content so the other client type's copy never lingers
        elements.emailSubject.value = '';
        elements.emailBodyEditor.value = '';
        elements.previewMetaSubject.textContent = '(No Subject)';
        scheduleAutoGenerate('clientType');
    });

    // Forms Template select
    elements.emailTemplateSelect.addEventListener('change', () => {
        syncTemplateUploadInputsDisplay();
        elements.emailSubject.value = '';
        elements.emailBodyEditor.value = '';
        scheduleAutoGenerate('template');
    });

    // Client Name — auto-fill predefined templates once a name is present
    // (Template 3/AI is intentionally excluded here to avoid firing the API on keystrokes)
    elements.clientNameInput.addEventListener('input', () => scheduleAutoGenerate('clientName'));

    // Inputs value mapping on change for live preview details
    elements.emailTo.addEventListener('input', (e) => elements.previewMetaTo.textContent = e.target.value.trim() || '(Recipient email address)');
    elements.emailCc.addEventListener('input', (e) => {
        const val = e.target.value.trim();
        if (val) {
            elements.previewCcRow.style.display = 'grid';
            elements.previewMetaCc.textContent = val;
        } else {
            elements.previewCcRow.style.display = 'none';
        }
    });
    elements.emailBcc.addEventListener('input', (e) => {
        const val = e.target.value.trim();
        if (val) {
            elements.previewBccRow.style.display = 'grid';
            elements.previewMetaBcc.textContent = val;
        } else {
            elements.previewBccRow.style.display = 'none';
        }
    });
    elements.emailSubject.addEventListener('input', (e) => elements.previewMetaSubject.textContent = e.target.value.trim() || '(No Subject)');

    // File slots change
    elements.beforeFileInput.addEventListener('change', (e) => handleScreenshotUpload(e, 'before'));
    elements.afterFileInput.addEventListener('change', (e) => handleScreenshotUpload(e, 'after'));
    
    // Load default screenshots trigger
    elements.loadDemoAssetsLink.addEventListener('click', (e) => {
        e.preventDefault();
        loadDemoScreenshots();
    });

    // Drag-and-Drop Additional Attachments
    const dropZone = elements.additionalAttachmentsZone;
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });
    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        handleAdditionalAttachments(e.dataTransfer.files);
    });
    elements.additionalFilesInput.addEventListener('change', (e) => {
        handleAdditionalAttachments(e.target.files);
    });

    // Actions clicks
    elements.btnPreviewPitch.addEventListener('click', () => compileDraftPreview());
    elements.btnSaveDraft.addEventListener('click', saveActiveEmailAsDraft);
    elements.btnSendEmail.addEventListener('click', sendEmailViaGmailApi);

    // Settings actions
    elements.settingsSaveBtn.addEventListener('click', () => {
        state.googleClientId = elements.googleClientIdInput.value.trim();
        state.aiProvider = elements.aiProviderSelect.value;
        state.aiApiKey = elements.aiApiKeyInput.value.trim();

        localStorage.setItem('google_client_id', state.googleClientId);
        localStorage.setItem('ai_provider', state.aiProvider);
        localStorage.setItem('ai_key', state.aiApiKey);
        
        updateGmailStatus();
        showToast('Configurations saved successfully!', 'success');
    });

    elements.gmailConnectBtn.addEventListener('click', () => {
        const isTokenValid = state.gmailAccessToken && Date.now() < state.gmailTokenExpiry;
        if (isTokenValid) {
            // Disconnect Gmail
            localStorage.removeItem('gmail_access_token');
            localStorage.removeItem('gmail_token_expiry');
            state.gmailAccessToken = null;
            state.gmailTokenExpiry = 0;
            updateGmailStatus();
            showToast('Disconnected Gmail session successfully.', 'info');
        } else {
            initiateGmailOAuthFlow();
        }
    });

    // Sent details modal
    elements.detailModalClose.addEventListener('click', () => elements.sentDetailModal.classList.remove('active'));
    elements.detailModalCloseBtn.addEventListener('click', () => elements.sentDetailModal.classList.remove('active'));

    // Search query grid filter
    elements.sentSearchInput.addEventListener('input', filterSentEmailsTable);

    // Mobile Sidebar Drawer Toggle Event Listeners
    if (elements.mobileSidebarToggle) {
        elements.mobileSidebarToggle.addEventListener('click', () => {
            if (elements.sidebar) elements.sidebar.classList.toggle('active');
            if (elements.sidebarScrim) elements.sidebarScrim.classList.toggle('active');
        });
    }
    if (elements.sidebarScrim) {
        elements.sidebarScrim.addEventListener('click', () => {
            if (elements.sidebar) elements.sidebar.classList.remove('active');
            elements.sidebarScrim.classList.remove('active');
        });
    }
}

// Redirect Google Consent screen
function initiateGmailOAuthFlow() {
    const clientId = state.googleClientId;
    if (!clientId) {
        showToast('Please enter your Google Web Client ID first.', 'error');
        showSection('settings');
        elements.googleClientIdInput.focus();
        return;
    }

    const redirectUri = window.location.origin + window.location.pathname;
    const scope = 'https://www.googleapis.com/auth/gmail.send';
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=token&scope=${encodeURIComponent(scope)}&state=gmail_auth`;
    
    window.location.href = authUrl;
}

// Screenshot slot upload helper
function handleScreenshotUpload(event, slot) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        const base64 = e.target.result.split(',')[1];
        const payload = {
            name: file.name,
            type: file.type,
            size: file.size,
            data: base64
        };

        if (slot === 'before') {
            state.beforeFile = payload;
            elements.beforeFilename.textContent = file.name;
            renderUploadThumbnail(file.type, e.target.result, elements.beforeThumbContainer);
        } else {
            state.afterFile = payload;
            elements.afterFilename.textContent = file.name;
            renderUploadThumbnail(file.type, e.target.result, elements.afterThumbContainer);
        }

        // Once the required screenshots are in, auto-generate the pitch
        // (predefined content for Templates 1/2/4, AI body for Template 3).
        scheduleAutoGenerate('image');
    };
    reader.readAsDataURL(file);
}

// Generate thumbnail previews
function renderUploadThumbnail(type, dataUrl, container) {
    container.innerHTML = '';
    if (type.startsWith('image/')) {
        const img = document.createElement('img');
        img.src = dataUrl;
        img.className = 'preview-thumbnail';
        container.appendChild(img);
    } else if (type === 'application/pdf') {
        const div = document.createElement('div');
        div.className = 'help-text';
        div.style.color = '#EF4444';
        div.style.fontWeight = '600';
        div.textContent = '📄 PDF Screenshot Attached';
        container.appendChild(div);
    }
}

// Load default base64 demo assets
function loadDemoScreenshots() {
    state.beforeFile = {
        name: 'demo-before.png',
        type: 'image/png',
        size: 5696,
        data: demoBeforeBase64
    };
    elements.beforeFilename.textContent = 'demo-before.png';
    renderUploadThumbnail('image/png', `data:image/png;base64,${demoBeforeBase64}`, elements.beforeThumbContainer);

    state.afterFile = {
        name: 'demo-after.png',
        type: 'image/png',
        size: 5696,
        data: demoAfterBase64
    };
    elements.afterFilename.textContent = 'demo-after.png';
    renderUploadThumbnail('image/png', `data:image/png;base64,${demoAfterBase64}`, elements.afterThumbContainer);

    showToast('Loaded demo screenshots!', 'info');
    scheduleAutoGenerate('image');
}

// Generic multi-file dropzone upload helper
function handleAdditionalAttachments(filesList) {
    for (let file of filesList) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const base64 = e.target.result.split(',')[1];
            state.additionalFiles.push({
                name: file.name,
                type: file.type || 'application/octet-stream',
                size: file.size,
                data: base64
            });
            renderGenericAttachmentsList();
        };
        reader.readAsDataURL(file);
    }
}

// Render the upload file chips list on form card
function renderGenericAttachmentsList() {
    elements.uploadedFilesList.innerHTML = '';
    state.additionalFiles.forEach((file, index) => {
        const div = document.createElement('div');
        div.className = 'file-item';
        div.innerHTML = `
            <div class="file-info">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>
                </svg>
                <span class="file-name" title="${file.name}">${file.name}</span>
                <span class="file-size">(${formatBytes(file.size)})</span>
            </div>
            <button class="file-remove-btn" onclick="removeGenericAttachment(${index})">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
        `;
        elements.uploadedFilesList.appendChild(div);
    });
}

// Global scope remove uploader file
window.removeGenericAttachment = function(index) {
    state.additionalFiles.splice(index, 1);
    renderGenericAttachmentsList();
};

// Bytes utility
function formatBytes(bytes, decimals = 1) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Debounced auto-generation: collapses rapid events (uploads, keystrokes,
// dropdown changes) into a single generation so Template 3's AI call fires once.
let autoGenTimer = null;
function scheduleAutoGenerate(source) {
    if (autoGenTimer) clearTimeout(autoGenTimer);
    autoGenTimer = setTimeout(() => {
        autoGenTimer = null;
        maybeAutoGenerate(source);
    }, 500);
}

// Decide whether the current form state is ready to auto-populate the pitch.
// Templates 1/2/4 = predefined content (cheap). Template 3 = AI (guarded).
function maybeAutoGenerate(source) {
    if (state.isGenerating) return;

    const template = elements.emailTemplateSelect.value;
    if (template === 'manual') return;

    // Client Name drives the greeting for every template — wait until it exists.
    if (!elements.clientNameInput.value.trim()) return;

    // Templates 1 and 3 require both Before & After screenshots first.
    const needsImages = (template === '1' || template === '3');
    if (needsImages && (!state.beforeFile || !state.afterFile)) return;

    // Never fire the AI (Template 3) off incidental Client Name keystrokes —
    // it should only run when the images land or the client type/template changes.
    if (template === '3' && source === 'clientName') return;

    compileDraftPreview(true); // auto mode
}

// Validate form entries.
// opts.requireRecipient=false skips the "To" check (used for silent auto-preview).
// opts.silent=true suppresses error toasts (used for auto-generation).
function validateComposerForm(opts = {}) {
    const requireRecipient = opts.requireRecipient !== false;
    const silent = opts.silent === true;

    state.to = elements.emailTo.value.trim();
    state.clientName = elements.clientNameInput.value.trim();
    state.cc = elements.emailCc.value.trim();
    state.bcc = elements.emailBcc.value.trim();

    if (requireRecipient && !state.to) {
        if (!silent) showToast('Recipient "To" address is mandatory.', 'error');
        elements.emailTo.focus();
        return false;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (requireRecipient && !emailRegex.test(state.to)) {
        if (!silent) { showToast('Please enter a valid "To" email address.', 'error'); elements.emailTo.focus(); }
        return false;
    }

    // Check template slots validations
    const template = elements.emailTemplateSelect.value;
    if (template !== 'manual') {
        if (!state.clientName) {
            if (!silent) { showToast('Client Name is required when selecting templates.', 'error'); elements.clientNameInput.focus(); }
            return false;
        }

        const isBeforeAfterRequired = template === '1' || template === '3';
        if (isBeforeAfterRequired) {
            if (!state.beforeFile || !state.afterFile) {
                if (!silent) showToast('Before & After screenshots are required for this template.', 'error');
                return false;
            }
        }
    }

    return true;
}

// Compile & Render Preview
async function compileDraftPreview(auto = false) {
    if (state.isGenerating) return;
    // In auto mode the recipient may not be typed yet, and errors stay silent.
    if (!validateComposerForm({ requireRecipient: !auto, silent: auto })) return;

    state.isGenerating = true;
    try {
    const template = elements.emailTemplateSelect.value;

    // Clear preview attachments
    elements.previewAttachmentsContainer.innerHTML = '';
    elements.previewAttachmentsSection.style.display = 'none';

    // Show template attachment assets
    let tempAttachmentsCount = 0;
    if (template === '1' || template === '3') {
        elements.previewAttachmentsSection.style.display = 'flex';
        if (state.beforeFile) { renderPreviewAttachmentChip(state.beforeFile.name); tempAttachmentsCount++; }
        if (state.afterFile) { renderPreviewAttachmentChip(state.afterFile.name); tempAttachmentsCount++; }
    }
    state.additionalFiles.forEach(file => {
        elements.previewAttachmentsSection.style.display = 'flex';
        renderPreviewAttachmentChip(file.name);
        tempAttachmentsCount++;
    });

    // Handle PDP Audit AI generates
    if (template === '3') {
        elements.previewHtmlBody.innerHTML = `
            <div class="loading-block">
                <div class="loading-spinner"></div>
                <p>Gemini is performing the PDP Audit and writing the pitch details...</p>
                <span class="help-text">This will take a few seconds...</span>
            </div>
        `;
        try {
            await generateAiPdpAuditEmail();
        } catch (err) {
            elements.previewHtmlBody.innerHTML = `
                <div style="color: #EF4444; padding: 1rem; text-align: center;">
                    <strong>AI Composition Failed:</strong><br>${err.message}
                    <p style="margin-top: 0.5rem; font-size: 0.75rem; color: var(--text-secondary)">Please check your API key under Settings.</p>
                </div>
            `;
        }
        return;
    }

    // Process synchronous standard templates
    let subject = '';
    let body = '';

    if (template === '1' && state.clientType === 'static') {
        // Static Website — Email 1 (predefined from PDF; images attached only, no AI)
        subject = STATIC_EMAIL1_SUBJECT;
        body = staticEmail1Body(state.clientName);
    } else if (template === '1') {
        subject = `Elevate Your eCommerce Performance with Product Data Enrichment (Before & After Sample)`;
        body = `
            <p>Hi ${state.clientName},</p>
            <p>Hope you're doing well.</p>
            <p>I've attached a Before-and-After Product Data Enrichment sample to clearly demonstrate how structured, enriched product data transforms an eCommerce product page—both for buyers and for Google search visibility. I've also included our corporate deck for reference.</p>
            
            <p><strong>What the Before vs After Sample Shows</strong></p>
            <p>From the attached comparison, you'll notice a significant improvement in:</p>
            <ul>
                <li>Structured product titles (brand + product type + key specifications)</li>
                <li>Clean, standardized specifications (Material, size, dimensions, standards,………)</li>
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
            <p>The After version in the sample is search-engine readable, buyer-friendly, and conversion-ready, aligning with how Google evaluates technical product pages.</p>

            <p><strong>Common Product Data Challenges We Help Solve</strong></p>
            <p>Many eCommerce teams struggle with:</p>
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
            <p>The attached Before/After sample clearly shows how enriched product data improves clarity, discoverability, trust, and organic ranking potential—without changing your existing eCommerce platform.</p>

            <p>Would you be open to a 15–20 minute call this week to review the sample and discuss how product data enrichment can support your eCommerce growth goals?</p>
        `;
    } else if (template === '2') {
        subject = `AltiusNXT – Client Project References for Your Review`;
        body = `
            <p>Hi ${state.clientName},</p>
            <p>Good day!</p>
            <p>I'm sharing a selection of our client project references for your review. These examples highlight the consistent value and results we deliver, and I hope they serve as a useful reference should you consider our services in the future.</p>
            <p>Selecting "View Project" or "View Store" will take you directly to the respective client Online Stores.</p>
            
            <p><strong>Client Projects – Product Data Enrichment:</strong></p>
            <ul class="reference-list">
                <li><strong>ABC Supply Co. Inc. (System Integrators)</strong> – Product Data Enrichment – <a href="https://www.abcsupply.com/" target="_blank">View Project</a></li>
                <li><strong>Amerhart (System Integrators)</strong> – Product Data Enrichment – <a href="https://www.amerhart.com/catalog/fasteners-and-tools/tools-and-supplies/drills-and-bits/hillman-group-hillman-acoustical-lag-driver-1-4" target="_blank">View Project</a></li>
                <li><strong>W.W. Grainger, Inc.</strong> – Product Data Enrichment – <a href="https://www.grainger.com/category/machining/drilling-holemaking/drill-bits/drill-bits-for-metal-plastic/jobber-length-drill-bits/cobalt-jobber-length-drill-bits?redirect=drill+bit&searchRedirect=drill+bit&categoryIndex=2" target="_blank">View Project</a></li>
                <li><strong>Hantover</strong> – Product Data Enrichment – <a href="https://www.hantover.com/Vestil-CART-400-LA-23-625x35-5-Linear-Elevating-Cart/609101/p" target="_blank">View Project</a></li>
                <li><strong>Rubix</strong> – Product Data Enrichment – <a href="https://uk.rubix.com/en/hexagon-screws-with-total-thread/p-G5020055039" target="_blank">View Project</a></li>
                <li><strong>Baker & Farrows</strong> – Product Data Enrichment – <a href="https://www.bakfar.com.au/products/category/UICNQFSD-hinges/HINB70--hinge-butt-70-x-50mm-z-p-91935" target="_blank">View Project</a></li>
                <li><strong>Travis Perkins</strong> – Product Data Enrichment – <a href="https://www.travisperkins.co.uk/plywood/marine-plywood-2440mm-x-1220mm/p/9000148439" target="_blank">View Project</a></li>
            </ul>

            <p><strong>Client Projects – eCommerce Store Development & Product Data Enrichment:</strong></p>
            <ul class="reference-list">
                <li><strong>Screwman</strong> – Full eCommerce Store Development & Product Data Enrichment – <a href="https://screwman.co.za/htc401005.html" target="_blank">View Store</a></li>
                <li><strong>Rose Scientific</strong> – Full eCommerce Store Development & Product Data Enrichment – <a href="https://www.rosesci.com/cat-mircometering-pump-dp200-with-pump-head-20t" target="_blank">View Store</a></li>
            </ul>

            <p>We're also open to a retainer engagement model to ensure flexibility and alignment with your operational needs.</p>
            <p>Please take your time to review the references and feel free to reach out with any questions or clarifications.</p>
            <p>Wishing you a wonderful day ahead!</p>
        `;
    } else if (template === '4' && state.clientType === 'static') {
        // Static Website — Email 4 (predefined from PDF; 5-product POC, no AI)
        subject = STATIC_EMAIL4_SUBJECT;
        body = staticEmail4Body(state.clientName);
    } else if (template === '4') {
        subject = `Complimentary Product Data Enrichment – 20 SKUs at No Cost (Proof of Concept)`;
        body = `
            <p>Hi ${state.clientName},</p>
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
            <p>✓ Manufacturer Name<br>
            ✓ Manufacturer Part Number<br>
            ✓ Product Short Description (if available)</p>

            <p><strong>To Help Us Scope the Project Accurately</strong></p>
            <p>Please also provide:</p>
            <p>✓ Total number of products in your catalog<br>
            ✓ Your expectations regarding complete product data enrichment<br>
            ✓ Any platform-specific requirements or templates currently in use</p>

            <p><strong>After POC Approval</strong></p>
            <p>Once you are satisfied with the Proof of Concept results, we will be happy to provide the enriched data in a format fully aligned with your platform requirements, enabling seamless upload into your store.</p>
            <p>I would welcome the opportunity to schedule a brief Google Meet call to discuss your requirements, answer any questions, and align on next steps.</p>
            <p>Looking forward to your feedback.</p>
        `;
    } else if (template === 'manual') {
        // Manual Compose pulls body directly from editor or uses whatever is in editor
        subject = elements.emailSubject.value.trim() || '(No Subject)';
        
        // Convert plain text breaks to HTML paragraphs
        const rawText = elements.emailBodyEditor.value;
        body = rawText.split('\n\n').map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
    }

    if (template !== 'manual') {
        body = body + signatureHtml;
        elements.emailBodyEditor.value = body.replace(/<[^>]*>/g, '\n').replace(/\n\n+/g, '\n\n').trim();
    }

    state.generatedSubject = subject;
    state.generatedBodyHtml = body;

    elements.emailSubject.value = subject;
    elements.previewMetaSubject.textContent = subject;
    elements.previewHtmlBody.innerHTML = body;

    if (!auto) showToast('Email preview compiled!', 'success');
    } finally {
        state.isGenerating = false;
    }
}

// Render paperclip attachment details in Compose Preview
function renderPreviewAttachmentChip(filename) {
    const chip = document.createElement('div');
    chip.className = 'attachment-chip';
    chip.innerHTML = `
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>
        </svg>
        <span>${filename}</span>
    `;
    elements.previewAttachmentsContainer.appendChild(chip);
}

// Call Gemini/OpenAI/Anthropic to perform PDP Audit
async function generateAiPdpAuditEmail() {
    const key = state.aiApiKey;
    if (!key) {
        throw new Error('AI API Key is missing. Connect your key in Settings view.');
    }

    const provider = state.aiProvider;
    const clientName = state.clientName;
    
    // Audit prompt selection (both prompts are from the client PDF):
    //   E-commerce  → Product Detail Page (PDP) Audit prompt (below, unchanged)
    //   Static site → Digital Commerce & Revenue Transformation Audit prompt
    const ecommercePdpAuditPrompt = `You are a Product Data Enrichment Sales Assistant for AltiusNXT Technologies.

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
- Structured SEO Title Example (rewrite the product title with brand + type + key specs)
- Standardized Technical Specification table (extract and organize all visible specs)
- Attribute normalization example (show before/after of key attributes)
- Filter-ready structure (list filter categories enabled by enriched data)
- Category mapping example (show current hierarchy vs enriched hierarchy)

6. Add section:
WHAT THIS IMPROVES
Include:
- Filtering improvements
- Long-tail SEO improvements
- Schema readiness
- Buyer confidence
- Reduced pre-sales queries
- Stronger category authority

7. Add section:
Why This Matters
Position structured product data as:
- Data architecture foundation, not a marketing rewrite
- SEO foundation
- Conversion driver

8. End with:
A confident but consultative call-to-action for a 15-minute discovery call.
Do NOT include any closing remarks, signatures, or placeholders like "Best Regards" or "[Your Name]" at the end, as the signature block is automatically appended.

Tone: Professional, Authoritative, Consultative, Sales-oriented but not aggressive.
Formatting: Output directly in HTML (using tags like <p>, <strong>, <ul>, <li>, <table>, <tr>, <td>, <th>).
Do NOT include <html>, <body>, or <code> markdown tags. Wrap tables in standard CSS styles.`;

    // Only Client Name + the Before/After images are sent to the AI (per spec).
    // The subject-output instruction is appended so the AI returns subject + body.
    const systemPrompt = (state.clientType === 'static'
        ? STATIC_AUDIT_SYSTEM_PROMPT.replace('{{CLIENT_NAME}}', clientName)
        : ecommercePdpAuditPrompt) + AUDIT_SUBJECT_OUTPUT_INSTRUCTION;

    let emailText = '';

    if (provider === 'gemini') {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`;
        
        const parts = [
            { text: "Generate the detailed PDP audit HTML pitch email based on system rules." }
        ];

        if (state.beforeFile) parts.push({ inlineData: { mimeType: state.beforeFile.type, data: state.beforeFile.data } });
        if (state.afterFile) parts.push({ inlineData: { mimeType: state.afterFile.type, data: state.afterFile.data } });

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: parts }],
                systemInstruction: { parts: [{ text: systemPrompt }] }
            })
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error?.message || 'Gemini API Error');
        }

        const data = await response.json();
        emailText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    } else if (provider === 'openai') {
        const url = 'https://api.openai.com/v1/chat/completions';
        
        if (state.beforeFile.type === 'application/pdf' || state.afterFile.type === 'application/pdf') {
            throw new Error('OpenAI API does not support PDF file inputs natively. Use Gemini or attach images.');
        }

        const userContent = [
            { type: 'text', text: `Generate PDP Audit for client ${clientName}.` },
            { type: 'image_url', image_url: { url: `data:${state.beforeFile.type};base64,${state.beforeFile.data}` } },
            { type: 'image_url', image_url: { url: `data:${state.afterFile.type};base64,${state.afterFile.data}` } }
        ];

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${key}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'gpt-4o',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userContent }
                ]
            })
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error?.message || 'OpenAI API Error');
        }

        const data = await response.json();
        emailText = data.choices?.[0]?.message?.content || '';

    } else if (provider === 'anthropic') {
        const url = 'https://api.anthropic.com/v1/messages';
        
        if (state.beforeFile.type === 'application/pdf' || state.afterFile.type === 'application/pdf') {
            throw new Error('Anthropic Claude API does not support PDF uploads directly in image messages.');
        }

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'x-api-key': key,
                'anthropic-version': '2023-06-01',
                'content-type': 'application/json'
            },
            body: JSON.stringify({
                model: 'claude-3-5-sonnet-20241022',
                max_tokens: 4000,
                system: systemPrompt,
                messages: [
                    {
                        role: 'user',
                        content: [
                            { type: 'text', text: `Generate PDP Audit for ${clientName}` },
                            { type: 'image', source: { type: 'base64', media_type: state.beforeFile.type, data: state.beforeFile.data } },
                            { type: 'image', source: { type: 'base64', media_type: state.afterFile.type, data: state.afterFile.data } }
                        ]
                    }
                ]
            })
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error?.message || 'Anthropic API Error');
        }

        const data = await response.json();
        emailText = data.content?.[0]?.text || '';
    }

    // Clear Markdown tags if present
    let raw = emailText.trim();
    if (raw.startsWith('```html')) {
        raw = raw.replace(/^```html\s*/i, '').replace(/\s*```$/i, '');
    } else if (raw.startsWith('```')) {
        raw = raw.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    // The AI returns BOTH the subject and the body. Extract the "SUBJECT:" line,
    // then treat everything after it as the HTML email body.
    let aiSubject = '';
    const subjectMatch = raw.match(/SUBJECT:\s*(.+)/i);
    if (subjectMatch) {
        aiSubject = subjectMatch[1].split(/\r?\n/)[0].replace(/<[^>]*>/g, '').trim();
        raw = raw.replace(/.*SUBJECT:\s*.+(\r?\n)?/i, '').trim();
    }

    // Safety net only — used if the AI response omitted a subject line, so the
    // Subject field never lands blank. Normally the AI-generated subject is used.
    const fallbackSubject = state.clientType === 'static'
        ? `Digital Commerce & Revenue Growth Audit – ${clientName}`
        : `Product Data Enrichment Opportunity – ${clientName} | Before vs After Analysis`;

    const body = raw.trim() + signatureHtml;

    state.generatedSubject = aiSubject || fallbackSubject;
    state.generatedBodyHtml = body;

    elements.emailSubject.value = state.generatedSubject;
    elements.previewMetaSubject.textContent = state.generatedSubject;
    elements.previewHtmlBody.innerHTML = body;
    elements.emailBodyEditor.value = body.replace(/<[^>]*>/g, '\n').replace(/\n\n+/g, '\n\n').trim();

    showToast('AI Audit draft generated!', 'success');
}

// Local Draft saving handler
function saveActiveEmailAsDraft() {
    const to = elements.emailTo.value.trim();
    const cc = elements.emailCc.value.trim();
    const bcc = elements.emailBcc.value.trim();
    const subject = elements.emailSubject.value.trim() || '(No Subject)';
    const body = elements.emailBodyEditor.value;
    const template = elements.emailTemplateSelect.value;
    const clientName = elements.clientNameInput.value.trim();

    const newDraft = {
        id: "draft_" + Date.now(),
        to,
        cc,
        bcc,
        subject,
        body,
        template,
        clientType: state.clientType,
        clientName,
        timestamp: Date.now(),
        // Store attachment file names as metadata
        attachmentNames: []
    };

    if ((template === '1' || template === '3') && state.beforeFile) newDraft.attachmentNames.push(state.beforeFile.name);
    if ((template === '1' || template === '3') && state.afterFile) newDraft.attachmentNames.push(state.afterFile.name);
    state.additionalFiles.forEach(file => newDraft.attachmentNames.push(file.name));

    state.drafts.unshift(newDraft);
    localStorage.setItem('altius_draft_emails', JSON.stringify(state.drafts));
    
    updateDraftsBadgeCount();
    showToast('Draft saved successfully!', 'success');
    clearComposerForm();
}

// Load draft record back into Composer
window.loadDraftIntoComposer = function(draftId) {
    const draft = state.drafts.find(d => d.id === draftId);
    if (!draft) return;

    elements.emailTo.value = draft.to || '';
    elements.previewMetaTo.textContent = draft.to || '(Recipient email address)';
    
    elements.emailCc.value = draft.cc || '';
    if (draft.cc) {
        elements.previewCcRow.style.display = 'grid';
        elements.previewMetaCc.textContent = draft.cc;
    } else {
        elements.previewCcRow.style.display = 'none';
    }

    elements.emailBcc.value = draft.bcc || '';
    if (draft.bcc) {
        elements.previewBccRow.style.display = 'grid';
        elements.previewMetaBcc.textContent = draft.bcc;
    } else {
        elements.previewBccRow.style.display = 'none';
    }

    elements.emailSubject.value = draft.subject || '';
    elements.previewMetaSubject.textContent = draft.subject || '(No Subject)';

    elements.emailTemplateSelect.value = draft.template || 'manual';
    state.clientType = draft.clientType || 'ecommerce';
    elements.clientTypeSelect.value = state.clientType;
    elements.clientNameInput.value = draft.clientName || '';

    syncTemplateUploadInputsDisplay();
    
    // Clear files
    state.beforeFile = null;
    state.afterFile = null;
    state.additionalFiles = [];
    elements.beforeFilename.textContent = 'PNG, JPG, PDF';
    elements.beforeThumbContainer.innerHTML = '';
    elements.afterFilename.textContent = 'PNG, JPG, PDF';
    elements.afterThumbContainer.innerHTML = '';
    elements.uploadedFilesList.innerHTML = '';

    elements.emailBodyEditor.value = draft.body || '';
    
    // Auto preview load
    compileDraftPreview();
    showSection('compose');
};

// Delete draft record
window.deleteDraftRecord = function(event, draftId) {
    event.stopPropagation();
    state.drafts = state.drafts.filter(d => d.id !== draftId);
    localStorage.setItem('altius_draft_emails', JSON.stringify(state.drafts));
    updateDraftsBadgeCount();
    renderDraftsGrid();
    showToast('Draft deleted.', 'info');
};

// Compile raw MIME multipart message (To, CC, BCC, HTML body wrapper, multi-attachments)
function buildMultipartMimeMessage(to, cc, bcc, subject, bodyHtml, attachments) {
    const boundary = "AltiusOutreachBoundary_" + Math.random().toString(36).substring(2);
    let mailParts = [];

    mailParts.push(`To: ${to}`);
    if (cc) mailParts.push(`Cc: ${cc}`);
    if (bcc) mailParts.push(`Bcc: ${bcc}`);
    
    // Base64 encode header UTF-8 subject line
    mailParts.push(`Subject: =?utf-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`);
    mailParts.push(`MIME-Version: 1.0`);
    
    if (attachments && attachments.length > 0) {
        mailParts.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
        mailParts.push(``);
        
        // Part 1: Text/HTML email body wrapped in Verdana 14px styling
        mailParts.push(`--${boundary}`);
        mailParts.push(`Content-Type: text/html; charset=utf-8`);
        mailParts.push(`Content-Transfer-Encoding: base64`);
        mailParts.push(``);
        
        const styledBody = `
        <div style="font-family: Verdana, Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #222222; background-color: #FFFFFF; padding: 20px; border-radius: 8px;">
            ${bodyHtml}
        </div>
        `;
        mailParts.push(btoa(unescape(encodeURIComponent(styledBody))));

        // Part 2+: File attachments
        attachments.forEach(file => {
            mailParts.push(`--${boundary}`);
            mailParts.push(`Content-Type: ${file.type}; name="${file.name}"`);
            mailParts.push(`Content-Disposition: attachment; filename="${file.name}"`);
            mailParts.push(`Content-Transfer-Encoding: base64`);
            mailParts.push(``);
            mailParts.push(file.data); // Already base64 string
        });

        mailParts.push(`--${boundary}--`);
    } else {
        // Plain HTML message
        mailParts.push(`Content-Type: text/html; charset=utf-8`);
        mailParts.push(`Content-Transfer-Encoding: base64`);
        mailParts.push(``);
        
        const styledBody = `
        <div style="font-family: Verdana, Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #222222; background-color: #FFFFFF; padding: 20px; border-radius: 8px;">
            ${bodyHtml}
        </div>
        `;
        mailParts.push(btoa(unescape(encodeURIComponent(styledBody))));
    }

    return mailParts.join('\r\n');
}

// Send E-mail client-side POST to Gmail Upload/Send endpoint
async function sendEmailViaGmailApi() {
    const isTokenValid = state.gmailAccessToken && Date.now() < state.gmailTokenExpiry;
    if (!isTokenValid) {
        showToast('Gmail OAuth Session expired. Reconnect in Settings.', 'error');
        showSection('settings');
        return;
    }

    if (!state.to) {
        showToast('Recipient address is missing.', 'error');
        return;
    }

    elements.btnSendEmail.disabled = true;
    elements.btnSendEmail.innerHTML = '<div class="loading-spinner"></div> Sending...';

    // 1. Gather all attachments
    let attachmentsList = [];
    const template = elements.emailTemplateSelect.value;
    
    if (template === '1' || template === '3') {
        if (state.beforeFile) attachmentsList.push(state.beforeFile);
        if (state.afterFile) attachmentsList.push(state.afterFile);
    }
    state.additionalFiles.forEach(file => attachmentsList.push(file));

    // 2. Generate raw MIME string
    const bodyHtml = elements.previewHtmlBody.innerHTML;
    const subject = elements.emailSubject.value.trim() || '(No Subject)';
    const rawMime = buildMultipartMimeMessage(state.to, state.cc, state.bcc, subject, bodyHtml, attachmentsList);

    // 3. Base64url encode MIME
    const base64UrlRaw = btoa(unescape(encodeURIComponent(rawMime)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

    try {
        // Send email endpoint uploads raw message
        const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${state.gmailAccessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ raw: base64UrlRaw })
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error?.message || 'Gmail send failed');
        }

        const resData = await response.json();

        // 4. Save to Sent Mail local history DB
        const sentRecord = {
            id: resData.id || "sent_" + Date.now(),
            clientName: state.clientName || 'N/A',
            clientEmail: state.to,
            subject: subject,
            emailType: template === 'manual' ? 'Manual' : `Template ${template}`,
            timestamp: Date.now(),
            status: 'Success',
            attachmentNames: attachmentsList.map(a => a.name),
            bodyHtml: bodyHtml
        };

        state.sentEmails.unshift(sentRecord);
        localStorage.setItem('altius_sent_emails', JSON.stringify(state.sentEmails));

        showToast(`Email sent successfully to ${state.to}`, 'success');
        
        // Redirect to Sent Folder
        clearComposerForm();
        showSection('sent');

    } catch (err) {
        showToast(`Sending Failed: ${err.message}`, 'error');
    } finally {
        elements.btnSendEmail.disabled = false;
        elements.btnSendEmail.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="22" y1="2" x2="11" y2="13"></line>
                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
            </svg>
            Send via Gmail
        `;
    }
}

// Clear Compose panel form inputs
function clearComposerForm() {
    elements.emailTo.value = '';
    elements.emailCc.value = '';
    elements.emailBcc.value = '';
    elements.emailSubject.value = '';
    elements.emailBodyEditor.value = '';
    elements.clientNameInput.value = '';
    elements.emailTemplateSelect.value = '1';
    state.clientType = 'ecommerce';
    elements.clientTypeSelect.value = 'ecommerce';

    // Clear preview details
    elements.previewMetaTo.textContent = '(Recipient email address)';
    elements.previewCcRow.style.display = 'none';
    elements.previewBccRow.style.display = 'none';
    elements.previewMetaSubject.textContent = '(No Subject)';
    elements.previewHtmlBody.innerHTML = `
        <p style="color: #94a3b8; font-style: italic;">
            Configure client name, email, and select an outreach type on the left, then click <strong>Preview Pitch</strong> to generate the live email content here.
        </p>
    `;
    elements.previewAttachmentsSection.style.display = 'none';
    elements.previewAttachmentsContainer.innerHTML = '';

    // Clear uploads
    state.beforeFile = null;
    state.afterFile = null;
    state.additionalFiles = [];
    elements.beforeFilename.textContent = 'PNG, JPG, PDF';
    elements.beforeThumbContainer.innerHTML = '';
    elements.afterFilename.textContent = 'PNG, JPG, PDF';
    elements.afterThumbContainer.innerHTML = '';
    elements.uploadedFilesList.innerHTML = '';

    state.generatedBodyHtml = '';
    state.generatedSubject = '';

    syncTemplateUploadInputsDisplay();
}

// Render Sent folder grid
function renderSentEmailsGrid() {
    elements.sentEmailsTbody.innerHTML = '';
    
    const query = elements.sentSearchInput.value.trim().toLowerCase();
    
    // Filter items based on search query
    const filtered = state.sentEmails.filter(mail => {
        if (!query) return true;
        const dateStr = new Date(mail.timestamp).toLocaleDateString().toLowerCase();
        return (
            mail.clientName.toLowerCase().includes(query) ||
            mail.clientEmail.toLowerCase().includes(query) ||
            mail.subject.toLowerCase().includes(query) ||
            dateStr.includes(query)
        );
    });

    if (filtered.length === 0) {
        elements.sentEmailsTbody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 3rem 0;">
                    No sent emails found matching query.
                </td>
            </tr>
        `;
        return;
    }

    filtered.forEach(mail => {
        const tr = document.createElement('tr');
        tr.addEventListener('click', () => openSentEmailDetailsDrawer(mail.id));
        
        const date = new Date(mail.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        const time = new Date(mail.timestamp).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
        
        const attachmentsIcon = mail.attachmentNames && mail.attachmentNames.length > 0
            ? `<span class="grid-attachment-icon" title="${mail.attachmentNames.join(', ')}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>
                </svg>
              </span>`
            : '';

        tr.innerHTML = `
            <td>
                <span class="status-sent-icon">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                        <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                </span>
            </td>
            <td style="font-weight: 600;">${mail.clientName}</td>
            <td class="email-address">${mail.clientEmail}</td>
            <td>${mail.subject}</td>
            <td style="color: var(--text-secondary);">${date} at ${time}</td>
            <td style="text-align: center;">${attachmentsIcon}</td>
        `;
        elements.sentEmailsTbody.appendChild(tr);
    });
}

// Filter Sent tables
function filterSentEmailsTable() {
    renderSentEmailsGrid();
}

// Open Sent email drawer details
function openSentEmailDetailsDrawer(id) {
    const mail = state.sentEmails.find(m => m.id === id);
    if (!mail) return;

    elements.detailModalTitle.textContent = "Sent Pitch Details";
    elements.detailTo.textContent = mail.clientEmail;
    
    const dateStr = new Date(mail.timestamp).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    elements.detailDate.textContent = dateStr;
    elements.detailSubject.textContent = mail.subject;
    elements.detailBodyContent.innerHTML = mail.bodyHtml;

    // Attachments section
    elements.detailAttachmentsContainer.innerHTML = '';
    if (mail.attachmentNames && mail.attachmentNames.length > 0) {
        elements.detailAttachmentsSection.style.display = 'block';
        mail.attachmentNames.forEach(name => {
            const chip = document.createElement('div');
            chip.className = 'attachment-chip';
            chip.innerHTML = `
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>
                </svg>
                <span>${name}</span>
            `;
            elements.detailAttachmentsContainer.appendChild(chip);
        });
    } else {
        elements.detailAttachmentsSection.style.display = 'none';
    }

    elements.sentDetailModal.classList.add('active');
}

// Render Drafts folder grid
function renderDraftsGrid() {
    elements.draftsEmailsTbody.innerHTML = '';

    if (state.drafts.length === 0) {
        elements.draftsEmailsTbody.innerHTML = `
            <tr>
                <td colspan="4" style="text-align: center; color: var(--text-muted); padding: 3rem 0;">
                    No drafts saved.
                </td>
            </tr>
        `;
        return;
    }

    state.drafts.forEach(draft => {
        const tr = document.createElement('tr');
        tr.addEventListener('click', () => loadDraftIntoComposer(draft.id));
        
        const savedDate = new Date(draft.timestamp).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

        tr.innerHTML = `
            <td style="font-weight: 500;">${draft.to || '<span style="color:var(--text-muted);font-style:italic;">(No Recipient)</span>'}</td>
            <td>${draft.subject || '<span style="color:var(--text-muted);font-style:italic;">(No Subject)</span>'}</td>
            <td style="color: var(--text-secondary);">${savedDate}</td>
            <td style="text-align: center;">
                <button class="file-remove-btn" onclick="deleteDraftRecord(event, '${draft.id}')" title="Delete Draft">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        <line x1="10" y1="11" x2="10" y2="17"></line>
                        <line x1="14" y1="11" x2="14" y2="17"></line>
                    </svg>
                </button>
            </td>
        `;
        elements.draftsEmailsTbody.appendChild(tr);
    });
}

// Compute counts and compile Chart.js daily bar chart
function renderAnalyticsView() {
    const sent = state.sentEmails;
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;

    // 1. Calculate KPI Metrics
    elements.kpiTotalSent.textContent = sent.length;

    // Sent Today (last 24 hours)
    const todayCount = sent.filter(m => now - m.timestamp <= oneDay).length;
    elements.kpiSentToday.textContent = todayCount;

    // Sent This Week (since last Monday)
    const currentDay = new Date().getDay();
    const diffToMonday = currentDay === 0 ? 6 : currentDay - 1; // days since Monday
    const startOfWeek = new Date().setHours(0,0,0,0) - (diffToMonday * oneDay);
    const weekCount = sent.filter(m => m.timestamp >= startOfWeek).length;
    elements.kpiSentWeek.textContent = weekCount;

    // Sent This Month (since 1st of month)
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
    const monthCount = sent.filter(m => m.timestamp >= startOfMonth).length;
    elements.kpiSentMonth.textContent = monthCount;

    // 2. Compile Daily Bar Chart details for last 7 days
    const chartLabels = [];
    const chartData = [];
    
    for (let i = 6; i >= 0; i--) {
        const d = new Date(now - (i * oneDay));
        const dayLabel = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        chartLabels.push(dayLabel);
        
        // Count emails sent on this calendar day
        const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
        const dayEnd = dayStart + oneDay;
        
        const count = sent.filter(m => m.timestamp >= dayStart && m.timestamp < dayEnd).length;
        chartData.push(count);
    }

    // 3. Initialize/Update Chart.js instance
    if (state.chartInstance) {
        state.chartInstance.destroy();
    }

    const ctx = elements.analyticsBarChart.getContext('2d');
    state.chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: chartLabels,
            datasets: [{
                label: 'Emails Sent',
                data: chartData,
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
                legend: {
                    display: false
                },
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
                    grid: {
                        color: 'rgba(255, 255, 255, 0.03)'
                    },
                    ticks: {
                        color: '#94A3B8',
                        font: {
                            family: 'Inter',
                            size: 11
                        }
                    }
                },
                y: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.03)'
                    },
                    ticks: {
                        color: '#94A3B8',
                        precision: 0,
                        font: {
                            family: 'Inter',
                            size: 11
                        }
                    },
                    min: 0
                }
            }
        }
    });
}

// Toast Notification display helper
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span class="toast-message">${message}</span>`;
    
    elements.toastContainer.appendChild(toast);
    
    setTimeout(() => toast.classList.add('show'), 20);
    
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 4500);
}

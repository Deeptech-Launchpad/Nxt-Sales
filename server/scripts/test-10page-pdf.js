const path = require('path')
const fs = require('fs')
const { buildEnterpriseAssessmentPdf } = require('../src/services/pdfReportGenerator')

const mockReport = {
  name: 'Product Data Enrichment Assessment',
  clientName: 'Adelab Scientific',
  preparedFor: 'Adelab Scientific Procurement & E-Commerce Team',
  preparedBy: 'AltiusNxt Technologies Pvt Ltd',
  reportDate: new Date().toISOString(),
  reportVersion: '1.0',
  accountManager: 'Alex Morgan',
  executiveSummary: 'We conducted a comprehensive product data audit for Adelab Scientific to evaluate how structured enrichment transforms raw web listings into high-performing commerce assets. The original product record presented key technical details within unstructured prose, limiting search discoverability and buyer evaluation. AltiusNXT standardized product naming, extracted 11 discrete technical attributes, mapped category taxonomy, and established schema-validated product metadata designed for digital commerce scale.',
  nextSteps: 'This assessment proves that structured enrichment significantly enhances product findability, buyer trust, and data reuse. By transitioning from unstructured text paragraphs to a schema-validated attribute model, Adelab Scientific can establish a market-leading digital commerce experience across its catalog.',
  products: [
    {
      productName: 'Ansell 93 Series Disposable Nitrile Gloves',
      originalProductName: 'Pacific Hygiene Black Nitrile P/F Gloves',
      enrichedProductName: 'Ansell 93 Series Disposable Nitrile Gloves, Small, Nitrile, Powder-Free',
      sku: '93-250 065',
      originalSku: 'GM2202',
      enrichedSku: '93-250 065',
      category: 'Disposable Gloves',
      originalTaxonomy: 'Home / Medical & Podiatry / Consumables & Accessories / Protective Wear',
      enrichedTaxonomy: 'Home > Safety & Security > Hand Protection > Disposable Gloves',
      originalDescription: 'Pacific Hygiene Black Nitrile P/F Gloves. Made from 100% Nitrile. Single Use. Resistant to chemical & punctures. Size small 6.5. Powder free beaded cuff 240mm length 0.12mm thickness ASTM D6319 compliant.',
      enrichedDescription: 'High performance Ansell 93 Series disposable powder-free nitrile gloves designed for superior chemical and puncture protection in laboratory and industrial environments.',
      existingAttributeCount: 3,
      enrichedAttributeCount: 11,
      existingSpecificationCount: 2,
      enrichedSpecificationCount: 11,
      filterFieldsEnabled: 'Material, Size, Colour, Cuff Style, Palm Thickness, Glove Length, Safety Standard, Pack Quantity',
      beforeImage: { filename: 'Original product evidence.png', url: '/uploads/enrichment-reports/images/01089f6f-155a-4f84-afca-bb55e4109f70.png' },
      afterImage: { filename: 'Enriched product evidence.png', url: '/uploads/enrichment-reports/images/1e7aee4b-4a5d-46da-b32d-7a460ec69024.png' },
      improvements: [
        { area: 'Product Naming', beforeState: 'Pacific Hygiene Black Nitrile P/F Gloves', afterState: 'Ansell 93 Series Disposable Nitrile Gloves, Small', businessBenefit: 'Clearer brand and series scanning for buyers' },
        { area: 'Taxonomy', beforeState: 'Medical & Podiatry / Consumables', afterState: 'Safety & Security > Hand Protection > Disposable Gloves', businessBenefit: 'Accurate catalog classification & category navigation' },
        { area: 'Structured Attributes', beforeState: '3 unorganized text mentions in description', afterState: '11 schema-extracted specification attributes', businessBenefit: 'Powers side-by-side product comparison matrix' },
        { area: 'Technical Specs', beforeState: 'Unformatted specification text', afterState: 'Normalized units (0.12mm thickness, 240mm length)', businessBenefit: 'Eliminates technical buyer ambiguity' },
        { area: 'Product Description', beforeState: 'Basic unstructured paragraph', afterState: 'Enriched summary highlighting chemical resistance & application fit', businessBenefit: 'Drives higher conversion confidence' },
        { area: 'Product Identifiers', beforeState: 'Missing MPN & SKU standardization', afterState: 'Verified MPN: 93-250 065 / SKU: GM2202', businessBenefit: 'Prevents ordering & fulfillment errors' },
        { area: 'Compliance Info', beforeState: 'Unverified safety standards', afterState: 'ASTM D6319 powder-free compliance certified', businessBenefit: 'Meets enterprise procurement criteria' },
        { area: 'Search & Filtering', beforeState: 'Title-only search matching', afterState: '8 filterable facets enabled', businessBenefit: 'Extends organic search discoverability' }
      ]
    }
  ]
}

const outputPath = path.join(__dirname, '../uploads/enrichment-reports/pdfs/test-output.pdf')
fs.mkdirSync(path.dirname(outputPath), { recursive: true })

buildEnterpriseAssessmentPdf(mockReport, outputPath).then(count => {
  console.log(`✓ Premium Enterprise PDF Generated successfully! Total pages: ${count}`)
  console.log(`File saved at: ${outputPath}`)
}).catch(err => {
  console.error('PDF Generation Failed:', err)
  process.exit(1)
})

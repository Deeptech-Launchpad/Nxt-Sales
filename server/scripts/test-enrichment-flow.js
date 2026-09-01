require('dotenv').config()
const axios = require('axios')
const FormData = require('form-data')
const fs = require('fs')
const path = require('path')
const jwt = require('jsonwebtoken')
const { PrismaClient } = require('@prisma/client')

async function main() {
  const prisma = new PrismaClient()
  const user = await prisma.user.findFirst()
  if (!user) throw new Error('No local user exists for integration testing.')
  const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, process.env.JWT_SECRET || 'dev-secret')
  const http = axios.create({ baseURL: 'http://localhost:4000/api', headers: { Authorization: `Bearer ${token}` } })
  const imageFile = path.join(__dirname, '../../client/public/nxt-sales-logo-clean.png')
  async function upload() { const form = new FormData(); form.append('image', fs.createReadStream(imageFile)); return (await http.post('/enrichment-reports/upload/image', form, { headers: form.getHeaders() })).data }
  const [beforeImage, afterImage] = await Promise.all([upload(), upload()])
  const improvements = ['Product Title','Description','Taxonomy','Technical Attributes','Specifications','Compliance','Documentation','Product Images','SEO/Searchability','Faceted Filtering','Data Standardization','Buyer Readiness'].map((category, i) => ({ category, status: i < 8 ? (i % 3 === 0 ? 'Added' : i % 3 === 1 ? 'Improved' : 'Standardized') : 'No Change', explanation: i < 8 ? `${category} was normalized and structured for consistent buyer use.` : '' }))
  const draft = (await http.post('/enrichment-reports', { name: 'Product Data Enrichment POC - QA', clientName: 'Example Client', preparedFor: 'Product Data Team', preparedBy: user.name, reportDate: new Date().toISOString(), projectName: 'Automated QA Report', executiveSummary: 'This proof of concept compares the original product presentation with an enriched, standardized record designed for better search, comparison and purchasing decisions.', nextSteps: 'Review the verified enrichment outcomes and confirm the next product category for scale-up.', products: [] })).data
  const product = { id: 'qa-product-1', productName: 'Industrial Network Adapter', brand: 'Example Brand', sku: 'QA-1001', category: 'Industrial Connectivity', beforeImage, afterImage, improvements }
  const analysis = (await http.post('/enrichment-reports/analysis/generate', product)).data
  product.beforeSummary = 'The original listing contains a basic title and limited narrative information, with technical data not consistently structured for comparison.'
  product.afterSummary = analysis.afterSummary
  product.keyTransformation = analysis.keyTransformation
  await http.put(`/enrichment-reports/${draft.id}`, { ...draft, products: [product], status: 'Ready for Review' })
  const generated = (await http.post(`/enrichment-reports/${draft.id}/generate-pdf`)).data
  console.log(JSON.stringify({ id: generated.id, pageCount: generated.pageCount, pdfPath: path.join(__dirname, '../../uploads/enrichment-reports/pdfs', `${generated.id}.pdf`) }))
  await prisma.$disconnect()
}
main().catch(error => { console.error(error.response?.data || error); process.exit(1) })

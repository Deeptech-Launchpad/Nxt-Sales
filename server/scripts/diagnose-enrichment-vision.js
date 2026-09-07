require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') })

const fs = require('fs')
const path = require('path')
const { GoogleGenAI } = require('@google/genai')

const files = [
  '489a0a8c-4cb5-44a1-adaa-c3b5bb84c0b7.png',
  'ac99ad34-7058-4443-8310-5731d775ed44.png'
]

async function main() {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY is missing')

  const imageDir = path.join(__dirname, '..', 'uploads', 'enrichment-reports', 'images')
  const parts = files.map(filename => ({
    inlineData: {
      mimeType: 'image/png',
      data: fs.readFileSync(path.join(imageDir, filename)).toString('base64')
    }
  }))
  parts.push({ text: 'Compare the BEFORE image with the AFTER image. Return only JSON: {"ok":true,"product":"visible product name or Not detected","summary":"one short evidence-based comparison"}.' })

  const ai = new GoogleGenAI({ apiKey })
  const response = await ai.models.generateContent({
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    contents: parts,
    config: {
      responseMimeType: 'application/json',
      temperature: 0.1,
      maxOutputTokens: 512
    }
  })
  const text = String(response.text || '')
  console.log(JSON.stringify({ success: true, responseLength: text.length, response: text }))
}

main().catch(error => {
  console.error(JSON.stringify({
    success: false,
    name: error?.name,
    message: error?.message,
    status: error?.status,
    code: error?.code,
    causeName: error?.cause?.name,
    causeCode: error?.cause?.code,
    causeMessage: error?.cause?.message,
    stack: error?.stack
  }, null, 2))
  process.exitCode = 1
})

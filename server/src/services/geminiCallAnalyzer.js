const axios = require('axios')
const { GoogleGenAI } = require('@google/genai')

const PROMPT_INSTRUCTIONS = `You are an expert sales and customer service call analyst AI for an enterprise CRM system.
Analyze the provided audio call recording carefully and generate a complete, structured analysis in JSON.

CRITICAL INSTRUCTIONS:
1. Detect the ORIGINAL LANGUAGE spoken in the call automatically (e.g. Tamil, English, Hindi, Malayalam, Telugu, Spanish, French, etc.). Do NOT assume the call is in English.
2. For speaker diarization, label the speakers as "Agent" and "Customer" throughout. Determine who is the Agent and who is the Customer based on the context, greetings, and sales/support conversation flow.
3. For each transcript segment:
   - Provide "startTime" (formatted as MM:SS, e.g. "00:15")
   - Provide "endTime" (formatted as MM:SS, e.g. "00:28")
   - Provide "speaker": "Agent" or "Customer"
   - Provide "originalText": exact verbatim text in the original spoken language.
   - Provide "englishText": English translation of originalText (if original language is English, make englishText identical to originalText).
   - Provide "emotion": AI-estimated emotion from options: "Positive", "Neutral", "Calm", "Happy", "Confused", "Concerned", "Frustrated", "Angry", "Impatient", "Satisfied".
4. Evaluate the overall performance score from 0 to 100 and justify why the score was assigned.
5. Provide individual scores (0-100) and rationale for:
   - communication
   - professionalism
   - empathy
   - listening
   - problemUnderstanding
   - resolution
   - customerSatisfaction
   - efficiency
6. Provide customer sentiment trajectory (e.g. "Frustrated → Neutral → Satisfied") and agent sentiment trajectory (e.g. "Calm → Confident → Positive").
7. Generate a concise call summary with fields:
   - reason (why customer called or reason for call)
   - customerRequirement
   - mainIssue
   - solution (solution offered or discussed)
   - outcome
   - followUpRequired (boolean)
   - finalCustomerSentiment
8. Provide "emotionTimeline": list of timeline events with { timestamp (MM:SS), speaker ("Agent"|"Customer"), emotion, note }.
9. Provide "keyMoments": list of key call milestones with { timestamp (MM:SS), label, description }. Examples: Customer explains issue, Customer becomes frustrated, Agent discovers problem, Solution proposed, Customer accepts solution, Follow-up agreed, Call closed.
10. Provide "whatWentWell": list of positive agent handling points with { timestamp (MM:SS or null), point, explanation }.
11. Provide "improvements": list of specific moments needing improvement with { timestamp (MM:SS), point, explanation }.
12. Provide "suggestedResponses": list of improvable responses with:
    - timestamp (MM:SS)
    - customerStatement
    - agentResponse (original agent response)
    - recommendedResponse (improved better response)
    - reason (why this is better)
13. Provide "actionItems": array of follow-up task strings (e.g. "Send quotation to customer"). If none exist, return an empty array [].

OUTPUT FORMAT: Return ONLY a single raw JSON object matching this structure:
{
  "originalLanguage": "Tamil",
  "overallScore": 86,
  "scoreJustification": "The agent maintained professional composure and resolved the customer query efficiently...",
  "customerSentiment": "Frustrated → Neutral → Satisfied",
  "agentSentiment": "Calm → Confident → Positive",
  "callOutcome": "Resolved",
  "summary": {
    "reason": "Inquired about pending order status",
    "customerRequirement": "Fast delivery of pending items",
    "mainIssue": "Delayed shipment notification",
    "solution": "Agent expedited dispatch and provided direct tracking link",
    "outcome": "Customer agreed to await tracking update",
    "followUpRequired": true,
    "finalCustomerSentiment": "Satisfied"
  },
  "scores": {
    "communication": 88,
    "professionalism": 92,
    "empathy": 79,
    "listening": 84,
    "problemUnderstanding": 88,
    "resolution": 90,
    "customerSatisfaction": 86,
    "efficiency": 82
  },
  "scoreExplanations": {
    "communication": "Clear and polite voice throughout the call.",
    "professionalism": "Adhered to company protocol and greeting.",
    "empathy": "Acknowledged customer frustration promptly.",
    "listening": "Allowed customer to explain without interrupting.",
    "problemUnderstanding": "Identified order ID quickly.",
    "resolution": "Provided actionable tracking update.",
    "customerSatisfaction": "Customer expressed gratitude at call end.",
    "efficiency": "Completed query within 3 minutes."
  },
  "segments": [
    {
      "id": 1,
      "startTime": "00:05",
      "endTime": "00:12",
      "speaker": "Agent",
      "originalText": "Hello, thank you for calling NXT Sales support. How can I help you?",
      "englishText": "Hello, thank you for calling NXT Sales support. How can I help you?",
      "emotion": "Calm"
    }
  ],
  "emotionTimeline": [
    {
      "timestamp": "00:05",
      "speaker": "Agent",
      "emotion": "Calm",
      "note": "Standard polite greeting"
    }
  ],
  "keyMoments": [
    {
      "timestamp": "00:15",
      "label": "Customer explains issue",
      "description": "Customer mentioned order #4089 is delayed"
    }
  ],
  "whatWentWell": [
    {
      "timestamp": "00:45",
      "point": "Empathy shown early",
      "explanation": "Agent acknowledged the delay before asking for details."
    }
  ],
  "improvements": [
    {
      "timestamp": "01:20",
      "point": "Technical jargon used",
      "explanation": "Agent used internal status codes instead of clear shipping terms."
    }
  ],
  "suggestedResponses": [
    {
      "timestamp": "01:20",
      "customerStatement": "Why does it say status code 40-B?",
      "agentResponse": "That means backend status 40-B pending dispatch.",
      "recommendedResponse": "That means your order has left our main warehouse and is currently in transit to your local hub.",
      "reason": "Translates technical system code into clear customer language."
    }
  ],
  "actionItems": [
    "Send SMS tracking link to customer phone"
  ]
}`

/**
 * Downloads audio from recordingUrl and passes it to Google Gemini API for complete analysis.
 */
async function analyzeCallRecording(recordingUrl) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey || apiKey === 'YOUR_GEMINI_API_KEY') {
    throw new Error('GEMINI_API_KEY is not configured in server environment (.env).')
  }

  // 1. Download audio file buffer
  let audioBuffer
  let contentType = 'audio/mp3'
  try {
    const audioRes = await axios.get(recordingUrl, {
      responseType: 'arraybuffer',
      timeout: 45000,
      headers: { 'User-Agent': 'NXT-Sales-CRM/1.0' },
    })
    audioBuffer = Buffer.from(audioRes.data)
    if (audioRes.headers['content-type']) {
      contentType = audioRes.headers['content-type'].split(';')[0].trim()
    }
  } catch (err) {
    throw new Error(`Failed to download call recording audio from URL: ${err.message}`)
  }

  if (!audioBuffer || audioBuffer.length === 0) {
    throw new Error('Downloaded audio recording file is empty (0 bytes).')
  }

  // 2. Initialize Gemini API Client
  const ai = new GoogleGenAI({ apiKey })
  const base64Audio = audioBuffer.toString('base64')

  const modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash'

  let responseText = ''
  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: [
        {
          inlineData: {
            mimeType: contentType.includes('wav') ? 'audio/wav' : 'audio/mp3',
            data: base64Audio,
          },
        },
        {
          text: PROMPT_INSTRUCTIONS,
        },
      ],
      config: {
        responseMimeType: 'application/json',
        temperature: 0.2,
      },
    })

    responseText = response.text || ''
  } catch (err) {
    // Fallback to gemini-1.5-flash if 2.5 is unavailable or errors
    if (modelName !== 'gemini-1.5-flash') {
      console.warn(`[GeminiCallAnalyzer] ${modelName} failed (${err.message}), retrying with gemini-1.5-flash...`)
      const fallbackResponse = await ai.models.generateContent({
        model: 'gemini-1.5-flash',
        contents: [
          {
            inlineData: {
              mimeType: contentType.includes('wav') ? 'audio/wav' : 'audio/mp3',
              data: base64Audio,
            },
          },
          {
            text: PROMPT_INSTRUCTIONS,
          },
        ],
        config: {
          responseMimeType: 'application/json',
          temperature: 0.2,
        },
      })
      responseText = fallbackResponse.text || ''
    } else {
      throw err
    }
  }

  // 3. Clean and parse JSON response
  let cleanedJsonStr = responseText.trim()
  if (cleanedJsonStr.startsWith('```json')) {
    cleanedJsonStr = cleanedJsonStr.replace(/^```json\s*/, '').replace(/\s*```$/, '')
  } else if (cleanedJsonStr.startsWith('```')) {
    cleanedJsonStr = cleanedJsonStr.replace(/^```\s*/, '').replace(/\s*```$/, '')
  }

  let result
  try {
    result = JSON.parse(cleanedJsonStr)
  } catch (parseErr) {
    console.error('[GeminiCallAnalyzer] Raw non-JSON response:', responseText)
    throw new Error(`Failed to parse Gemini analysis output as JSON: ${parseErr.message}`)
  }

  // 4. Sanitize and ensure required defaults
  return sanitizeAnalysisResult(result)
}

function sanitizeAnalysisResult(raw) {
  return {
    originalLanguage: raw.originalLanguage || 'English',
    overallScore: typeof raw.overallScore === 'number' ? Math.min(100, Math.max(0, Math.round(raw.overallScore))) : 75,
    scoreJustification: raw.scoreJustification || 'Overall score based on agent conversation flow, tone, and problem handling.',
    customerSentiment: raw.customerSentiment || 'Neutral',
    agentSentiment: raw.agentSentiment || 'Calm',
    callOutcome: raw.callOutcome || 'Completed',
    summary: {
      reason: raw.summary?.reason || 'General inquiry',
      customerRequirement: raw.summary?.customerRequirement || 'Assistance requested',
      mainIssue: raw.summary?.mainIssue || 'N/A',
      solution: raw.summary?.solution || 'Addressed during call',
      outcome: raw.summary?.outcome || 'Call completed',
      followUpRequired: Boolean(raw.summary?.followUpRequired),
      finalCustomerSentiment: raw.summary?.finalCustomerSentiment || 'Neutral',
    },
    scores: {
      communication: raw.scores?.communication ?? 80,
      professionalism: raw.scores?.professionalism ?? 85,
      empathy: raw.scores?.empathy ?? 75,
      listening: raw.scores?.listening ?? 80,
      problemUnderstanding: raw.scores?.problemUnderstanding ?? 80,
      resolution: raw.scores?.resolution ?? 80,
      customerSatisfaction: raw.scores?.customerSatisfaction ?? 80,
      efficiency: raw.scores?.efficiency ?? 80,
    },
    scoreExplanations: {
      communication: raw.scoreExplanations?.communication || 'Evaluated based on vocal clarity and delivery.',
      professionalism: raw.scoreExplanations?.professionalism || 'Evaluated based on greeting and professional tone.',
      empathy: raw.scoreExplanations?.empathy || 'Evaluated based on customer concern acknowledgment.',
      listening: raw.scoreExplanations?.listening || 'Evaluated based on non-interruption and attentiveness.',
      problemUnderstanding: raw.scoreExplanations?.problemUnderstanding || 'Evaluated based on issue identification speed.',
      resolution: raw.scoreExplanations?.resolution || 'Evaluated based on solutions offered.',
      customerSatisfaction: raw.scoreExplanations?.customerSatisfaction || 'Evaluated based on closing customer sentiment.',
      efficiency: raw.scoreExplanations?.efficiency || 'Evaluated based on duration and topic focus.',
    },
    segments: Array.isArray(raw.segments) ? raw.segments.map((s, idx) => ({
      id: s.id || idx + 1,
      startTime: s.startTime || '00:00',
      endTime: s.endTime || '00:00',
      speaker: s.speaker === 'Customer' ? 'Customer' : 'Agent',
      originalText: s.originalText || s.text || '',
      englishText: s.englishText || s.originalText || s.text || '',
      emotion: s.emotion || 'Neutral',
    })) : [],
    emotionTimeline: Array.isArray(raw.emotionTimeline) ? raw.emotionTimeline : [],
    keyMoments: Array.isArray(raw.keyMoments) ? raw.keyMoments : [],
    whatWentWell: Array.isArray(raw.whatWentWell) ? raw.whatWentWell : [],
    improvements: Array.isArray(raw.improvements) ? raw.improvements : [],
    suggestedResponses: Array.isArray(raw.suggestedResponses) ? raw.suggestedResponses : [],
    actionItems: Array.isArray(raw.actionItems) ? raw.actionItems : [],
    analyzedAt: new Date().toISOString(),
  }
}

module.exports = {
  analyzeCallRecording,
}

// Shared entry point for every Gemini call the app makes.
//
// This used to hold the model-discovery and call-with-fallback logic AND call
// Google directly from the browser using an API key read out of localStorage.
// That put a paid key somewhere any devtools window — or any script running on
// the page — could read it, and duplicated the same logic across three call
// sites.
//
// All of that now lives on the server (server/src/services/geminiService.js),
// which holds the key in its environment exactly the way EmotionSense does.
// What remains here is a thin client: it posts the prompt and gets the
// response back. Deliberately unchanged is the RESPONSE SHAPE — the backend
// returns Gemini's own JSON verbatim, so every call site still reads
// `candidates[0].content.parts[0].text` as before.
import api from '../api/client'

// Runs one generateContent request through the backend.
//   requestBody — the Gemini request (contents, systemInstruction, …), same
//                 object the call sites already built
//   feature     — one of AI_FEATURES, used for server-side usage accounting
// Returns Gemini's response object. Throws with the API's own message
// (quota exceeded, safety block, …) so existing error handling still works.
export async function callGemini(requestBody, feature) {
  try {
    const { data } = await api.post('/ai/generate', { request: requestBody, feature })
    return data
  } catch (err) {
    throw new Error(err?.response?.data?.message || err.message || 'AI request failed.')
  }
}

// Whether AI is usable, and which model is live. Contains nothing derived from
// the API key — this is what Settings shows instead of a key field.
//   { provider, configured, enabled, connected, model, error }
export async function getAiStatus({ refresh = false } = {}) {
  const { data } = await api.get('/ai/status', { params: refresh ? { refresh: 1 } : {} })
  return data
}

// A single message for whichever way AI is unavailable, so each feature does
// not invent its own wording.
export function aiUnavailableMessage(status) {
  if (!status) return 'AI is unavailable right now.'
  if (!status.configured) return 'AI is not configured on the server. Ask an administrator to set GEMINI_API_KEY.'
  if (!status.enabled) return 'AI is currently disabled for this workspace.'
  if (!status.connected) return status.error || 'Could not reach Gemini with the configured key.'
  return ''
}

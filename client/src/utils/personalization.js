// Per-user profile decoration (avatar, cover image, cover quote), stored
// client-side. Keyed by user id so two people signing in on the same machine
// never see each other's avatar. Every access is guarded: private windows and
// storage-blocked browsers throw on read as well as write.
//
// Shared by Profile.jsx (writes it) and Dashboard.jsx (reads it for the
// "Today's motivation" card's avatar) — one source, so the two can never show
// a different avatar for the same user.
const personalizationKey = id => `nxt_profile_personalization_${id || 'anon'}`

export function loadPersonalization(id) {
  try { return JSON.parse(localStorage.getItem(personalizationKey(id)) || '{}') || {} }
  catch { return {} }
}

export function savePersonalizationLocal(id, value) {
  try { localStorage.setItem(personalizationKey(id), JSON.stringify(value)); return true }
  catch { return false }
}

export const MOTIVATION_QUOTES = [
  { text: 'Small progress, repeated daily, creates remarkable results.', author: 'Daily reminder' },
  { text: 'Every conversation is a chance to create genuine value.', author: 'Sales mindset' },
  { text: 'Focus on the next best action. Momentum will follow.', author: 'Growth principle' },
  { text: 'Consistency turns a good pipeline into a great business.', author: 'Daily discipline' },
  { text: 'Listen with curiosity, respond with clarity, and lead with value.', author: 'Customer first' },
  { text: 'Today is another opportunity to move one meaningful step forward.', author: 'Fresh perspective' },
  { text: 'Confidence grows when preparation meets action.', author: 'Winning habit' },
  { text: 'Success is built in the follow-ups others postpone.', author: 'Sales momentum' },
  { text: 'Make the customer feel understood before asking to be chosen.', author: 'Trust principle' },
  { text: 'A clear priority today becomes measurable progress tomorrow.', author: 'Focus note' },
]

export function getMotivationQuote(previousText = '') {
  let lastText = previousText
  try {
    if (!lastText && typeof window !== 'undefined') lastText = window.sessionStorage.getItem('nxt_last_motivation_quote') || ''
  } catch { /* storage may be disabled */ }
  const choices = MOTIVATION_QUOTES.filter(quote => quote.text !== lastText)
  const selected = choices[Math.floor(Math.random() * choices.length)] || MOTIVATION_QUOTES[0]
  try {
    if (typeof window !== 'undefined') window.sessionStorage.setItem('nxt_last_motivation_quote', selected.text)
  } catch { /* storage may be disabled */ }
  return selected
}

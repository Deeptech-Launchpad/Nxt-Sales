// AI providers occasionally emit inline "font-size" styling (or legacy <font
// size> attributes) even when the prompt only asks for plain tags. That
// overrides our fixed 14px wrapper on whichever element it lands on, which is
// exactly how outgoing mail ends up showing as Gmail's "Huge" size instead of
// "Normal". Strip it so every send is consistently sized regardless of what
// the model returns.
export function stripInlineFontSize(html) {
  if (!html) return html
  return html
    .replace(/font-size\s*:\s*[^;"']+;?/gi, '')
    .replace(/<font\b([^>]*)\ssize\s*=\s*["']?\d+["']?([^>]*)>/gi, '<font$1$2>')
    .replace(/\sstyle=["']\s*["']/gi, '')
}

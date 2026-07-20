// Client-side image compression for email attachments. Before/After screenshots
// are frequently multi-MB PNGs, and that full size travels the network twice
// (browser -> our server -> Gmail), which is the dominant cost in "email with
// attachments takes minutes to send". Downscaling + re-encoding as JPEG before
// upload cuts that transfer size dramatically with no visible quality loss in
// an email client. Non-image files (PDFs, etc.) and already-small/animated
// images are left untouched — this never changes what gets attached, only how
// many bytes a large screenshot takes to represent.
const MAX_DIMENSION   = 1600   // px, longest side — plenty for viewing in an email
const JPEG_QUALITY     = 0.82
const SKIP_UNDER_BYTES = 400 * 1024 // already small enough, not worth recompressing

export async function compressImageIfNeeded(file) {
  if (!file || !file.type?.startsWith('image/')) return file
  if (file.type === 'image/gif') return file // preserve animation
  if (file.size <= SKIP_UNDER_BYTES) return file

  try {
    const bitmap = await createImageBitmap(file)
    const scale  = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height))
    const w = Math.round(bitmap.width * scale)
    const h = Math.round(bitmap.height * scale)

    const canvas = document.createElement('canvas')
    canvas.width = w; canvas.height = h
    const ctx = canvas.getContext('2d')
    ctx.drawImage(bitmap, 0, 0, w, h)
    bitmap.close?.()

    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY))
    if (!blob || blob.size >= file.size) return file // compression didn't help — keep original

    const newName = file.name.replace(/\.\w+$/, '') + '.jpg'
    return new File([blob], newName, { type: 'image/jpeg', lastModified: Date.now() })
  } catch {
    return file // never block sending on a compression failure
  }
}

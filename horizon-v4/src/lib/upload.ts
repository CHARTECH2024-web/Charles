import type { Id } from '@/convex/_generated/dataModel'

/**
 * Media limits for the community feed.
 *
 * Phone cameras produce large files (a 30 s 1080p clip is often 60 MB), so the
 * video limit must stay well above the photo limit. Convex file storage rejects
 * single files above 100 MB, so we stop just below that.
 */
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024
export const MAX_VIDEO_BYTES = 95 * 1024 * 1024
export const MAX_PDF_BYTES = 25 * 1024 * 1024

/** Uploads a file to Convex storage and returns its id. */
export async function uploadFile(
  generateUploadUrl: () => Promise<string>,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<Id<'_storage'>> {
  const uploadUrl = await generateUploadUrl()

  // XHR instead of fetch: only XHR exposes upload progress, which a phone user
  // needs on a slow connection for a 50 MB video.
  const payload = await new Promise<unknown>((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open('POST', uploadUrl, true)
    request.setRequestHeader('Content-Type', file.type || 'application/octet-stream')
    request.upload.onprogress = (event) => {
      if (!event.lengthComputable || !onProgress) return
      onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)))
    }
    request.onload = () => {
      if (request.status < 200 || request.status >= 300) {
        reject(new Error('UPLOAD_FAILED'))
        return
      }
      try {
        resolve(JSON.parse(request.responseText))
      } catch {
        reject(new Error('UPLOAD_FAILED'))
      }
    }
    request.onerror = () => reject(new Error('UPLOAD_FAILED'))
    request.ontimeout = () => reject(new Error('UPLOAD_FAILED'))
    request.send(file)
  })

  const storageId =
    typeof payload === 'object' && payload !== null && 'storageId' in payload
      ? (payload as { storageId: string }).storageId
      : null
  if (!storageId) throw new Error('UPLOAD_FAILED')
  onProgress?.(100)
  return storageId as Id<'_storage'>
}

const VIDEO_EXTENSIONS = ['mp4', 'm4v', 'mov', 'webm', 'ogv', '3gp', 'avi', 'mkv']

/**
 * Maps a picked file to the post media kind.
 *
 * Some Android pickers report an empty MIME type, and iPhone videos often come
 * as `video/quicktime`, so the file extension is a reliable second signal.
 */
export function mediaKindOf(file: File): 'image' | 'video' | 'pdf' | null {
  const type = (file.type || '').toLowerCase()
  if (type.startsWith('image/')) return 'image'
  if (type.startsWith('video/')) return 'video'
  if (type === 'application/pdf') return 'pdf'

  const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (VIDEO_EXTENSIONS.includes(extension)) return 'video'
  if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif', 'avif'].includes(extension)) {
    return 'image'
  }
  if (extension === 'pdf') return 'pdf'
  return null
}

/** Largest file accepted for a given kind. */
export function maxBytesFor(kind: 'image' | 'video' | 'pdf'): number {
  if (kind === 'video') return MAX_VIDEO_BYTES
  if (kind === 'image') return MAX_PHOTO_BYTES
  return MAX_PDF_BYTES
}

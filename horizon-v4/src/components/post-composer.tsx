import { useRef, useState } from 'react'
import { useMutation } from 'convex/react'
import { FileText, Image as ImageIcon, Paperclip, Send, Video, X } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/convex/_generated/api'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { useI18n } from '@/lib/i18n'
import { maxBytesFor, mediaKindOf, uploadFile } from '@/lib/upload'

const ICONS = { image: ImageIcon, video: Video, pdf: FileText } as const

export function PostComposer() {
  const { t } = useI18n()
  const generateUploadUrl = useMutation(api.uploads.generateUploadUrl)
  const createPost = useMutation(api.posts.create)
  const inputRef = useRef<HTMLInputElement>(null)

  const [body, setBody] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)

  const kind = file ? mediaKindOf(file) : null

  function pick(selected: File | null) {
    if (!selected) return
    const selectedKind = mediaKindOf(selected)
    if (!selectedKind) {
      toast.error(t('posts.uploadError'))
      return
    }
    const limit = maxBytesFor(selectedKind)
    if (selected.size > limit) {
      toast.error(
        selectedKind === 'video'
          ? t('posts.videoTooBig')
          : t('posts.tooBig').replace('{size}', String(Math.round(limit / (1024 * 1024)))),
      )
      return
    }
    setFile(selected)
  }

  async function publish() {
    if (busy) return
    setBusy(true)
    setProgress(file ? 0 : null)
    try {
      const mediaId = file
        ? await uploadFile(() => generateUploadUrl(), file, (percent) => setProgress(percent))
        : undefined
      const res = await createPost({
        body,
        ...(mediaId ? { mediaId } : {}),
        ...(mediaId && kind ? { mediaKind: kind } : {}),
        ...(mediaId && file ? { mediaName: file.name } : {}),
      })
      if (res.ok) {
        setBody('')
        setFile(null)
        toast.success(t('posts.published'))
      } else {
        toast.error(t('posts.uploadError'))
      }
    } catch {
      toast.error(t('posts.uploadError'))
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  return (
    <div
      data-testid="post-composer"
      data-state={busy ? 'loading' : 'ready'}
      className="rounded-xl border bg-card p-3 text-card-foreground"
    >
      <Textarea
        data-testid="post-body"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={t('posts.composer')}
        aria-label={t('posts.composer')}
        maxLength={2000}
        rows={3}
        className="resize-none border-0 bg-transparent p-0 focus-visible:ring-0"
      />

      {file ? (
        <div className="mt-2 flex items-center gap-2 rounded-lg bg-muted px-2 py-1.5 text-xs">
          {kind ? (
            (() => {
              const Icon = ICONS[kind]
              return <Icon className="size-4 shrink-0" aria-hidden="true" />
            })()
          ) : null}
          <span className="min-w-0 flex-1 truncate">{file.name}</span>
          <button
            type="button"
            onClick={() => setFile(null)}
            aria-label={t('common.cancel')}
            className="rounded-full p-1 hover:bg-accent"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ) : null}

      <div className="mt-3 flex items-center justify-between gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/*,video/*,application/pdf,.mp4,.mov,.m4v,.webm,.3gp"
          className="sr-only"
          onChange={(e) => pick(e.target.files?.[0] ?? null)}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          aria-label={t('posts.attach')}
          disabled={busy}
        >
          <Paperclip />
          <span className="hidden sm:inline">{t('posts.attach')}</span>
        </Button>
        <Button
          type="button"
          size="sm"
          data-testid="post-publish"
          onClick={() => void publish()}
          disabled={busy || (body.trim().length === 0 && !file)}
          className="rounded-full font-bold"
        >
          {busy ? <Spinner className="size-4" /> : <Send />}
          {busy
            ? progress !== null
              ? t('posts.uploadProgress').replace('{pct}', String(progress))
              : t('posts.uploading')
            : t('posts.publish')}
        </Button>
      </div>
    </div>
  )
}

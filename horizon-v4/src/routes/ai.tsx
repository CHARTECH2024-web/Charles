import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useAction, useMutation, useQuery } from 'convex/react'
import {
  Calculator,
  ImagePlus,
  MessageCircle,
  Mic,
  Newspaper,
  RotateCcw,
  Send,
  Sparkles,
  Square,
  X,
} from 'lucide-react'
import siteMetadata from '../metadata.json'
import { toast } from 'sonner'
import { api } from '@/convex/_generated/api'
import { AppShell } from '@/components/app-shell'
import { PageTitle } from '@/components/page-parts'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { useI18n } from '@/lib/i18n'

const meta = siteMetadata['/ai']

export const Route = createFileRoute('/ai')({
  head: () => ({
    meta: [
      { title: meta.title },
      { name: 'description', content: meta.description },
    ],
  }),
  component: AiPage,
})

type AttachmentKind = 'image' | 'video' | 'audio'

type PendingAttachment = {
  fileId: string
  kind: AttachmentKind
  mime: string
  durationMs?: number
  previewUrl: string
}

function AiPage() {
  const { t } = useI18n()
  const ask = useAction(api.assistant.ask)
  const saved = useQuery(api.assistant.history)
  const clearChat = useMutation(api.assistant.clear)
  const createUpload = useAction(api.appFiles.createUpload)

  const [pendingText, setPendingText] = useState<string | null>(null)
  const [pendingAttachment, setPendingAttachment] = useState<PendingAttachment | null>(null)
  const [question, setQuestion] = useState('')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const [recording, setRecording] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const startedAtRef = useRef(0)

  const rows = saved ?? []

  const suggestions = [
    { key: 'accounting', icon: Calculator, text: t('ai.suggest.accounting') },
    { key: 'messages', icon: MessageCircle, text: t('ai.suggest.messages') },
    { key: 'news', icon: Newspaper, text: t('ai.suggest.news') },
  ]

  useEffect(() => {
    if (!busy) {
      window.setTimeout(() => {
        listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
      }, 60)
    }
  }, [rows.length, busy])

  async function upload(
    blob: Blob,
    kind: AttachmentKind,
    durationMs?: number,
    filename?: string,
  ) {
    const extension = kind === 'image' ? 'jpg' : kind === 'video' ? 'mp4' : 'webm'
    const grant = await createUpload({
      filename: filename ?? `${kind}-${Date.now()}.${extension}`,
      contentType: blob.type || 'application/octet-stream',
      fileSize: blob.size,
      visibility: 'private',
    })
    const res = await fetch(grant.uploadUrl, {
      method: grant.method,
      headers: grant.headers,
      body: blob,
    })
    if (!res.ok) throw new Error(`upload failed (${res.status})`)
    setPendingAttachment({
      fileId: grant.fileId,
      kind,
      mime: blob.type,
      ...(durationMs ? { durationMs } : {}),
      previewUrl: URL.createObjectURL(blob),
    })
  }

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const kind: AttachmentKind = file.type.startsWith('video')
      ? 'video'
      : file.type.startsWith('audio')
        ? 'audio'
        : 'image'
    try {
      setBusy(true)
      await upload(file, kind, undefined, file.name)
    } catch (error) {
      console.error('assistant upload failed', error)
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  async function toggleRecording() {
    if (recording) {
      recorderRef.current?.stop()
      setRecording(false)
      return
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setFailed(true)
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      chunksRef.current = []
      startedAtRef.current = Date.now()
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data)
      }
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop())
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || 'audio/webm',
        })
        if (blob.size === 0) return
        setBusy(true)
        try {
          await upload(blob, 'audio', Date.now() - startedAtRef.current)
        } catch {
          setFailed(true)
        } finally {
          setBusy(false)
        }
      }
      recorderRef.current = recorder
      recorder.start()
      setRecording(true)
    } catch {
      setFailed(true)
    }
  }

  async function send(text: string) {
    const content = text.trim()
    const attachment = pendingAttachment
    if ((!content && !attachment) || busy) return
    setQuestion('')
    setFailed(false)
    setPendingText(content || (attachment ? t('ai.chat.attachmentOnly') : ''))
    const attachmentToSend = attachment
    setPendingAttachment(null)
    setBusy(true)
    try {
      const res = await ask({
        question: content,
        ...(attachmentToSend
          ? {
              attachment: {
                fileId: attachmentToSend.fileId,
                kind: attachmentToSend.kind,
                mime: attachmentToSend.mime,
                ...(attachmentToSend.durationMs
                  ? { durationMs: attachmentToSend.durationMs }
                  : {}),
              },
            }
          : {}),
      })
      if (!res.ok) {
        setFailed(true)
        if (res.code === 'AI_DAILY_LIMIT') toast.error(t('ai.dailyLimit'))
      }
    } catch {
      setFailed(true)
    } finally {
      setPendingText(null)
      setBusy(false)
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    void send(question)
  }

  return (
    <AppShell>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-brand-black text-brand-yellow">
            <Sparkles className="size-6" aria-hidden="true" />
          </span>
          <div>
            <PageTitle>{t('ai.title')}</PageTitle>
            <p className="text-xs text-muted-foreground">{t('ai.intro')}</p>
          </div>
        </div>
        {rows.length > 0 ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            data-testid="ai-clear"
            onClick={() => {
              setFailed(false)
              void clearChat({})
            }}
          >
            <RotateCcw />
            {t('ai.chat.clear')}
          </Button>
        ) : null}
      </div>

      <div
        data-testid="ai-chat"
        data-state={busy ? 'loading' : failed ? 'error' : 'ready'}
        className="mt-4 rounded-2xl border bg-card text-card-foreground"
      >
        <div
          ref={listRef}
          className="max-h-[55vh] min-h-40 overflow-y-auto p-4"
          aria-live="polite"
        >
          {rows.length === 0 && !pendingText ? (
            <div className="flex flex-col items-center py-6 text-center">
              <p className="max-w-sm text-sm text-muted-foreground">
                {t('ai.chat.welcome')}
              </p>
              <div className="mt-4 grid w-full max-w-sm gap-2">
                {suggestions.map(({ key, icon: Icon, text }) => (
                  <Button
                    key={key}
                    type="button"
                    variant="outline"
                    size="sm"
                    data-testid={`ai-suggest-${key}`}
                    onClick={() => void send(text)}
                    className="justify-start"
                  >
                    <Icon />
                    {text}
                  </Button>
                ))}
              </div>
            </div>
          ) : (
            <ul className="grid gap-3">
              {rows.map((row) => (
                <li
                  key={row.id}
                  data-testid="ai-message"
                  data-role={row.role}
                  className={row.role === 'user' ? 'flex justify-end' : 'flex justify-start'}
                >
                  <div
                    className={
                      row.role === 'user'
                        ? 'max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm text-primary-foreground'
                        : 'max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-bl-sm bg-muted px-3 py-2 text-sm'
                    }
                  >
                    <p className="sr-only">
                      {row.role === 'user' ? t('ai.chat.you') : t('ai.chat.assistant')}
                    </p>
                    {row.fileId ? (
                      <ChatMedia messageId={row.id} kind={row.kind} />
                    ) : null}
                    {row.content}
                  </div>
                </li>
              ))}
              {pendingText ? (
                <li
                  data-testid="ai-message"
                  data-role="user"
                  className="flex justify-end"
                >
                  <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm text-primary-foreground">
                    {pendingText}
                  </div>
                </li>
              ) : null}
            </ul>
          )}

          {busy ? (
            <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
              <Spinner className="size-4" />
              {t('ai.chat.thinking')}
            </p>
          ) : null}
          {failed ? (
            <p role="alert" className="mt-3 text-xs font-semibold text-destructive">
              {t('ai.chat.error')}
            </p>
          ) : null}
        </div>

        {pendingAttachment ? (
          <div className="flex items-center gap-2 border-t px-3 py-2" data-testid="ai-attachment-preview">
            {pendingAttachment.kind === 'image' ? (
              <img src={pendingAttachment.previewUrl} alt="" className="size-10 rounded object-cover" />
            ) : null}
            {pendingAttachment.kind === 'video' ? (
              <video src={pendingAttachment.previewUrl} className="size-10 rounded bg-brand-black object-cover" />
            ) : null}
            {pendingAttachment.kind === 'audio' ? (
              <audio src={pendingAttachment.previewUrl} controls className="h-8 w-40" />
            ) : null}
            <span className="flex-1 text-xs text-muted-foreground">
              {pendingAttachment.kind === 'image'
                ? t('ai.chat.photo')
                : pendingAttachment.kind === 'video'
                  ? t('ai.chat.video')
                  : t('ai.chat.voice')}
            </span>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              aria-label={t('ai.chat.remove')}
              data-testid="ai-attachment-remove"
              onClick={() => setPendingAttachment(null)}
            >
              <X />
            </Button>
          </div>
        ) : null}

        <form onSubmit={submit} className="flex items-center gap-1.5 border-t p-3">
          <input
            ref={fileRef}
            type="file"
            accept="image/*,video/*,audio/*"
            className="hidden"
            data-testid="ai-file"
            onChange={(e) => void onFile(e)}
          />
          <Button
            type="button"
            size="icon"
            variant="outline"
            aria-label={t('ai.chat.attach')}
            data-testid="ai-attach"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
          >
            <ImagePlus />
          </Button>
          <Button
            type="button"
            size="icon"
            variant={recording ? 'default' : 'outline'}
            aria-label={recording ? t('ai.chat.stop') : t('ai.chat.record')}
            data-testid="ai-mic"
            onClick={() => void toggleRecording()}
            disabled={busy}
          >
            {recording ? <Square /> : <Mic />}
          </Button>
          <Input
            data-testid="ai-input"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={t('ai.chat.placeholder')}
            aria-label={t('ai.chat.placeholder')}
            maxLength={1000}
            disabled={busy}
          />
          <Button
            type="submit"
            size="icon"
            data-testid="ai-send"
            disabled={busy || (question.trim().length === 0 && !pendingAttachment)}
            aria-label={t('ai.chat.send')}
          >
            {busy ? <Spinner className="size-4" /> : <Send />}
          </Button>
        </form>
      </div>

      <p className="mt-3 text-center text-xs text-muted-foreground">
        {t('ai.chat.disclaimer')}
      </p>
    </AppShell>
  )
}

/** Resolves a private App Files read grant for one chat attachment. */
function ChatMedia({ messageId, kind }: { messageId: string; kind: string }) {
  const { t } = useI18n()
  const getUrl = useAction(api.appFiles.mediaUrl)
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    getUrl({ messageId: messageId as never })
      .then((res) => {
        if (alive) setUrl(res.url)
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [getUrl, messageId])

  if (!url) {
    return <span className="mb-1 block h-10 w-40 animate-pulse rounded-lg bg-muted" />
  }
  if (kind === 'image') {
    return (
      <img
        src={url}
        alt={t('ai.chat.photo')}
        data-testid="ai-media-image"
        className="mb-1 max-h-64 w-full rounded-lg object-cover"
      />
    )
  }
  if (kind === 'video') {
    return (
      <video
        src={url}
        controls
        playsInline
        data-testid="ai-media-video"
        className="mb-1 max-h-64 w-full rounded-lg bg-brand-black"
      />
    )
  }
  return <audio src={url} controls data-testid="ai-media-audio" className="mb-1 w-56" />
}

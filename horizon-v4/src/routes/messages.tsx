import { useEffect, useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { ArrowLeft, Mic, MessageCircle, Send, Square, Plus } from 'lucide-react'
import { toast } from 'sonner'
import siteMetadata from '../metadata.json'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { AppShell } from '@/components/app-shell'
import { MemberAvatar } from '@/components/member-avatar'
import { EmptyState, PageTitle } from '@/components/page-parts'
import { VerifiedBadge } from '@/components/verified-badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { useI18n } from '@/lib/i18n'
import { uploadFile } from '@/lib/upload'

const meta = siteMetadata['/messages']

export const Route = createFileRoute('/messages')({
  head: () => ({
    meta: [
      { title: meta.title },
      { name: 'description', content: meta.description },
    ],
  }),
  component: MessagesPage,
})

type Person = {
  userId: Id<'users'>
  displayName: string
  horizonId: string
  photoUrl: string | null
  verified: boolean
}

function MessagesPage() {
  const { t } = useI18n()
  const conversations = useQuery(api.messages.conversations)
  const suggestions = useQuery(api.profiles.suggestedMembers)
  const [active, setActive] = useState<Person | null>(null)
  const [picking, setPicking] = useState(false)

  return (
    <AppShell>
      {active ? (
        <Thread person={active} onBack={() => setActive(null)} />
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <PageTitle>{t('msg.title')}</PageTitle>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setPicking((open) => !open)}
              aria-expanded={picking}
            >
              <Plus />
              {t('msg.startWith')}
            </Button>
          </div>

          {picking ? (
            <ul className="mt-3 grid gap-2" data-testid="msg-picker">
              {(suggestions?.ok ? suggestions.results : []).map((person) => (
                <li key={person.userId}>
                  <button
                    type="button"
                    data-testid="msg-pick-member"
                    data-handle={person.handle}
                    onClick={() => {
                      setActive({
                        userId: person.userId,
                        displayName: person.displayName,
                        horizonId: person.horizonId,
                        photoUrl: person.photoUrl,
                        verified: person.verified,
                      })
                      setPicking(false)
                    }}
                    className="flex w-full items-center gap-3 rounded-xl border bg-card p-3 text-left text-card-foreground hover:bg-accent"
                  >
                    <MemberAvatar
                      name={person.displayName}
                      photoUrl={person.photoUrl}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 truncate text-sm font-bold">
                        {person.displayName}
                        {person.verified ? <VerifiedBadge /> : null}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {person.horizonId}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          <div
            data-testid="msg-list"
            data-state={conversations ? 'ready' : 'loading'}
            className="mt-4"
          >
            {!conversations ? (
              <div className="flex justify-center py-10">
                <Spinner className="size-5" />
              </div>
            ) : conversations.results.length === 0 ? (
              <EmptyState
                icon={MessageCircle}
                title={t('msg.empty')}
                hint={t('msg.emptyHint')}
              />
            ) : (
              <ul className="grid gap-2">
                {conversations.results.map((conversation) => (
                  <li key={conversation.person.userId}>
                    <button
                      type="button"
                      data-testid="msg-conversation"
                      data-handle={conversation.person.horizonId}
                      onClick={() => setActive(conversation.person)}
                      className="flex w-full items-center gap-3 rounded-xl border bg-card p-3 text-left text-card-foreground hover:bg-accent"
                    >
                      <MemberAvatar
                        name={conversation.person.displayName}
                        photoUrl={conversation.person.photoUrl}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5 truncate text-sm font-bold">
                          {conversation.person.displayName}
                          {conversation.person.verified ? <VerifiedBadge /> : null}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {conversation.lastMessage.kind === 'voice'
                            ? t('msg.voice')
                            : conversation.lastMessage.preview}
                        </span>
                      </span>
                      {conversation.unread > 0 ? (
                        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                          {conversation.unread}
                        </span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </AppShell>
  )
}

function Thread({ person, onBack }: { person: Person; onBack: () => void }) {
  const { t } = useI18n()
  const thread = useQuery(api.messages.thread, { withUserId: person.userId })
  const sendMessage = useMutation(api.messages.send)
  const markRead = useMutation(api.messages.markRead)
  const generateUploadUrl = useMutation(api.uploads.generateUploadUrl)

  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [recording, setRecording] = useState(false)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const startedAt = useRef(0)

  useEffect(() => {
    void markRead({ withUserId: person.userId })
  }, [markRead, person.userId])

  useEffect(() => {
    return () => {
      recorderRef.current?.stream.getTracks().forEach((track) => track.stop())
    }
  }, [])

  async function sendText() {
    const body = text.trim()
    if (!body || sending) return
    setSending(true)
    try {
      const res = await sendMessage({
        toUserId: person.userId,
        kind: 'text',
        body,
      })
      if (res.ok) setText('')
      else toast.error(t('msg.sendError'))
    } catch {
      toast.error(t('msg.sendError'))
    } finally {
      setSending(false)
    }
  }

  async function startRecording() {
    if (recording) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      chunksRef.current = []
      startedAt.current = Date.now()
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data)
      }
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop())
        void finishRecording()
      }
      recorderRef.current = recorder
      recorder.start()
      setRecording(true)
    } catch {
      toast.error(t('msg.micDenied'))
    }
  }

  async function finishRecording() {
    setRecording(false)
    const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
    chunksRef.current = []
    if (blob.size === 0) return
    setSending(true)
    try {
      const file = new File([blob], `vocal-${Date.now()}.webm`, {
        type: 'audio/webm',
      })
      const mediaId = await uploadFile(() => generateUploadUrl(), file)
      const res = await sendMessage({
        toUserId: person.userId,
        kind: 'voice',
        mediaId,
        durationMs: Date.now() - startedAt.current,
      })
      if (!res.ok) toast.error(t('msg.sendError'))
    } catch {
      toast.error(t('msg.sendError'))
    } finally {
      setSending(false)
    }
  }

  return (
    <div data-testid="msg-thread" data-state={thread ? 'ready' : 'loading'}>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="icon"
          variant="ghost"
          onClick={onBack}
          aria-label={t('common.back')}
        >
          <ArrowLeft />
        </Button>
        <MemberAvatar name={person.displayName} photoUrl={person.photoUrl} size="sm" />
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 truncate text-sm font-bold">
            {person.displayName}
            {person.verified ? <VerifiedBadge /> : null}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {person.horizonId}
          </p>
        </div>
      </div>

      {!thread ? (
        <div className="flex justify-center py-12">
          <Spinner className="size-5" />
        </div>
      ) : (
        <ul className="mt-4 grid gap-2">
          {thread.results.map((message) => {
            const mine = message.fromId !== person.userId
            return (
              <li
                key={message.id}
                data-testid="msg-bubble"
                className={mine ? 'flex justify-end' : 'flex justify-start'}
              >
                <div
                  className={
                    mine
                      ? 'max-w-[80%] rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm text-primary-foreground'
                      : 'max-w-[80%] rounded-2xl rounded-bl-sm bg-muted px-3 py-2 text-sm'
                  }
                >
                  {message.kind === 'voice' && message.audioUrl ? (
                    <audio
                      src={message.audioUrl}
                      controls
                      data-testid="msg-audio"
                      className="max-w-56"
                    />
                  ) : (
                    <p className="whitespace-pre-wrap break-words">{message.body}</p>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <div className="mt-4 flex gap-2">
        <Input
          data-testid="msg-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void sendText()
            }
          }}
          placeholder={t('msg.placeholder')}
          aria-label={t('msg.placeholder')}
          maxLength={2000}
        />
        <Button
          type="button"
          size="icon"
          variant={recording ? 'default' : 'outline'}
          onClick={() => {
            if (recording) recorderRef.current?.stop()
            else void startRecording()
          }}
          aria-label={recording ? t('msg.stop') : t('msg.record')}
          data-testid="msg-record"
        >
          {recording ? <Square /> : <Mic />}
        </Button>
        <Button
          type="button"
          size="icon"
          data-testid="msg-send"
          onClick={() => void sendText()}
          disabled={sending || text.trim().length === 0}
          aria-label={t('common.send')}
        >
          {sending ? <Spinner className="size-4" /> : <Send />}
        </Button>
      </div>
      {recording ? (
        <p className="mt-2 text-xs font-semibold text-muted-foreground" aria-live="polite">
          {t('msg.recording')}
        </p>
      ) : null}
    </div>
  )
}

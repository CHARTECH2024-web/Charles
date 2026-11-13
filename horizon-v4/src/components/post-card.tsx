import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import {
  Download,
  FileText,
  Heart,
  MessageCircle,
  Rocket,
  Send,
  Share2,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { MemberAvatar } from '@/components/member-avatar'
import { VerifiedBadge } from '@/components/verified-badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { useI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

export type FeedPost = {
  id: Id<'posts'>
  body: string
  mediaKind: 'image' | 'video' | 'pdf' | null
  mediaName: string | null
  boosted: boolean
  mediaUrl: string | null
  createdAt: number
  author: {
    displayName: string
    horizonId: string
    photoUrl: string | null
    verified: boolean
  }
  isMine: boolean
  likeCount: number
  likedByMe: boolean
  commentCount: number
}

function timeAgo(value: number, lang: string): string {
  const diff = Date.now() - value
  const minutes = Math.round(diff / 60000)
  if (minutes < 1) return new Date(value).toLocaleTimeString(lang)
  if (minutes < 60) return `${minutes} min`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h`
  return new Date(value).toLocaleDateString(lang)
}

/**
 * Some phone videos (iPhone HEVC .mov) upload fine but cannot be decoded by
 * every browser. Show the reason and a download link instead of a black box.
 */
function VideoMedia({ src, name }: { src: string; name: string | null }) {
  const { t } = useI18n()
  const [failed, setFailed] = useState(false)

  if (failed) {
    return (
      <div className="mt-3 rounded-xl border bg-muted px-3 py-3 text-sm">
        <p className="text-muted-foreground">{t('posts.videoUnsupported')}</p>
        <a
          href={src}
          target="_blank"
          rel="noreferrer"
          download={name ?? undefined}
          className="mt-2 inline-flex items-center gap-2 font-semibold underline underline-offset-4"
        >
          <Download className="size-4" aria-hidden="true" />
          {t('posts.downloadVideo')}
        </a>
      </div>
    )
  }

  return (
    <video
      src={src}
      controls
      playsInline
      preload="metadata"
      data-testid="post-media-video"
      onError={() => setFailed(true)}
      className="mt-3 max-h-96 w-full rounded-xl bg-black"
    />
  )
}

function PostMedia({ post }: { post: FeedPost }) {
  const { t } = useI18n()
  if (!post.mediaUrl || !post.mediaKind) return null

  if (post.mediaKind === 'image') {
    return (
      <img
        src={post.mediaUrl}
        alt={post.mediaName ?? ''}
        data-testid="post-media-image"
        className="mt-3 max-h-96 w-full rounded-xl object-cover"
        loading="lazy"
      />
    )
  }
  if (post.mediaKind === 'video') {
    return <VideoMedia src={post.mediaUrl} name={post.mediaName} />
  }
  return (
    <a
      href={post.mediaUrl}
      target="_blank"
      rel="noreferrer"
      className="mt-3 flex items-center gap-3 rounded-xl border bg-muted px-3 py-2 text-sm"
    >
      <FileText className="size-5 shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">
        {post.mediaName ?? t('posts.download')}
      </span>
      <Download className="size-4 shrink-0" aria-hidden="true" />
    </a>
  )
}

function Comments({ postId }: { postId: Id<'posts'> }) {
  const { t } = useI18n()
  const comments = useQuery(api.posts.comments, { postId })
  const addComment = useMutation(api.posts.addComment)
  const removeComment = useMutation(api.posts.removeComment)
  const [value, setValue] = useState('')
  const [sending, setSending] = useState(false)

  async function submit() {
    const body = value.trim()
    if (!body || sending) return
    setSending(true)
    try {
      await addComment({ postId, body })
      setValue('')
    } catch {
      toast.error(t('err.UNKNOWN'))
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="mt-3 border-t pt-3" data-testid="post-comments">
      {!comments ? (
        <div className="flex justify-center py-3">
          <Spinner className="size-4" />
        </div>
      ) : comments.results.length === 0 ? null : (
        <ul className="grid gap-2">
          {comments.results.map((comment) => (
            <li key={comment.id} className="flex gap-2">
              <MemberAvatar
                name={comment.author.displayName}
                photoUrl={comment.author.photoUrl}
                size="sm"
                className="size-7"
              />
              <div className="min-w-0 flex-1 rounded-xl bg-muted px-3 py-1.5">
                <p className="flex items-center gap-1 text-xs font-bold">
                  {comment.author.displayName}
                  {comment.author.verified ? <VerifiedBadge /> : null}
                </p>
                <p className="text-sm">{comment.body}</p>
              </div>
              {comment.isMine ? (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  data-testid="post-comment-delete"
                  aria-label={t('common.delete')}
                  onClick={() => void removeComment({ commentId: comment.id })}
                  className="size-7 shrink-0 text-muted-foreground"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-2 flex gap-2">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void submit()
            }
          }}
          placeholder={t('posts.commentPlaceholder')}
          aria-label={t('posts.commentPlaceholder')}
          maxLength={500}
        />
        <Button
          type="button"
          size="icon"
          onClick={() => void submit()}
          disabled={sending || value.trim().length === 0}
          aria-label={t('common.send')}
        >
          <Send />
        </Button>
      </div>
    </div>
  )
}

export function PostCard({ post }: { post: FeedPost }) {
  const { t, lang } = useI18n()
  const toggleLike = useMutation(api.posts.toggleLike)
  const removePost = useMutation(api.posts.remove)
  const boostPost = useMutation(api.billing.boostPost)
  const [openComments, setOpenComments] = useState(false)
  const [boostBusy, setBoostBusy] = useState(false)

  async function boost() {
    setBoostBusy(true)
    try {
      const result = await boostPost({ postId: post.id })
      if (result.ok) toast.success(t('posts.boosted'))
      else toast.error(t('posts.boostLimit'))
    } catch {
      toast.error(t('posts.boostLimit'))
    } finally {
      setBoostBusy(false)
    }
  }

  async function share() {
    const text = post.body || post.mediaName || 'HORIZON'
    try {
      if (navigator.share) {
        await navigator.share({ title: 'HORIZON', text })
        return
      }
      await navigator.clipboard.writeText(text)
      toast.success(t('posts.linkCopied'))
    } catch {
      // Sharing cancelled: nothing to report.
    }
  }

  return (
    <article
      data-testid="post"
      data-post-id={post.id}
      className="rounded-xl border bg-card p-3 text-card-foreground"
    >
      <header className="flex items-center gap-3">
        <MemberAvatar
          name={post.author.displayName}
          photoUrl={post.author.photoUrl}
        />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 truncate text-sm font-bold">
            {post.author.displayName}
            {post.author.verified ? <VerifiedBadge /> : null}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {post.author.horizonId} · {timeAgo(post.createdAt, lang)}
          </p>
        </div>
        {post.boosted ? (
          <span
            data-testid="post-boosted"
            className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-bold text-accent-foreground"
          >
            {t('posts.boostBadge')}
          </span>
        ) : post.isMine ? (
          <button
            type="button"
            data-testid="post-boost"
            onClick={() => void boost()}
            disabled={boostBusy}
            aria-label={t('posts.boost')}
            className="rounded-full p-1.5 text-muted-foreground hover:bg-accent disabled:opacity-50"
          >
            <Rocket className="size-4" />
          </button>
        ) : null}
        {post.isMine ? (
          <button
            type="button"
            onClick={() => void removePost({ postId: post.id })}
            aria-label={t('posts.remove')}
            className="rounded-full p-1.5 text-muted-foreground hover:bg-accent"
          >
            <Trash2 className="size-4" />
          </button>
        ) : null}
      </header>

      {post.body ? (
        <p className="mt-2 whitespace-pre-wrap break-words text-sm">{post.body}</p>
      ) : null}

      <PostMedia post={post} />

      <div className="mt-3 flex items-center gap-1 border-t pt-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => void toggleLike({ postId: post.id })}
          aria-pressed={post.likedByMe}
          className={cn('gap-1.5', post.likedByMe && 'text-brand-yellow')}
        >
          <Heart className={cn('size-4', post.likedByMe && 'fill-current')} />
          {post.likeCount}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setOpenComments((open) => !open)}
          aria-expanded={openComments}
          className="gap-1.5"
        >
          <MessageCircle className="size-4" />
          {post.commentCount}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => void share()}
          className="gap-1.5"
        >
          <Share2 className="size-4" />
          {t('posts.share')}
        </Button>
        {post.mediaUrl ? (
          <a
            href={post.mediaUrl}
            download={post.mediaName ?? undefined}
            target="_blank"
            rel="noreferrer"
            className="ml-auto inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-muted-foreground hover:bg-accent"
          >
            <Download className="size-4" />
            <span className="hidden sm:inline">{t('posts.download')}</span>
          </a>
        ) : null}
      </div>

      {openComments ? <Comments postId={post.id} /> : null}
    </article>
  )
}

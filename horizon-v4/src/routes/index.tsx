import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { Brain, Cpu, FlaskConical, Laptop, Leaf, Newspaper } from 'lucide-react'
import { canonicalUrl } from '../lib/canonical-url'
import siteMetadata from '../metadata.json'
import { api } from '@/convex/_generated/api'
import { AppShell } from '@/components/app-shell'
import { EmptyState, PageTitle } from '@/components/page-parts'
import { PostCard, type FeedPost } from '@/components/post-card'
import { PostComposer } from '@/components/post-composer'
import { Spinner } from '@/components/ui/spinner'
import { buttonVariants } from '@/components/ui/button'
import { useAccount } from '@/lib/account'
import { useI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

const homepageMeta = siteMetadata['/']

export const Route = createFileRoute('/')({
  head: () => {
    const canonical = canonicalUrl('/')

    return {
      meta: [
        { title: homepageMeta.title },
        { name: 'description', content: homepageMeta.description },
      ],
      links: canonical ? [{ rel: 'canonical', href: canonical }] : [],
    }
  },
  component: HomePage,
})

function HomePage() {
  const { t } = useI18n()
  const account = useAccount()

  const domains = [
    { icon: Laptop, label: t('domain.digital') },
    { icon: Brain, label: t('domain.ai') },
    { icon: Cpu, label: t('domain.electronics') },
    { icon: Leaf, label: t('domain.ecotech') },
    { icon: FlaskConical, label: t('domain.lab') },
  ]

  return (
    <AppShell>
      <section className="overflow-hidden rounded-3xl bg-brand-black p-6 text-white shadow-sm">
        <img
          src="/logo-h.svg"
          alt="HORIZON"
          className="h-14 w-auto"
          draggable={false}
        />
        <h1 className="mt-5 text-3xl font-extrabold leading-tight">
          {t('home.welcome').replace(' HORIZON', '')}{' '}
          <span className="text-brand-yellow">HORIZON</span>
        </h1>
        <p className="mt-2 text-sm font-semibold text-white/80">
          {t('brand.slogan')}
        </p>
        <p className="mt-3 text-sm text-white/65">{t('home.intro')}</p>

        {account.status === 'ready' ? (
          <div className="mt-6">
            <p className="text-sm text-white/70">{t('home.hello')}</p>
            <p className="text-xl font-extrabold">
              {account.profile.displayName}
            </p>
            <p className="text-sm font-semibold text-brand-yellow">
              {account.profile.horizonId}
            </p>
            <Link
              to="/account"
              className={cn(
                buttonVariants({ variant: 'outline', size: 'lg' }),
                'mt-4 h-12 w-full rounded-full border-brand-yellow bg-transparent text-base font-semibold text-white hover:bg-white/10 hover:text-white',
              )}
            >
              {t('home.openAccount')}
            </Link>
          </div>
        ) : account.status === 'loading' ? (
          <div className="mt-6 h-[6.5rem]" aria-hidden />
        ) : (
          <div className="mt-6 grid gap-3">
            <Link
              to="/auth"
              className={cn(
                buttonVariants({ size: 'lg' }),
                'h-12 w-full rounded-full text-base font-bold',
              )}
            >
              {t('home.login')}
            </Link>
            <Link
              to="/auth"
              className={cn(
                buttonVariants({ variant: 'outline', size: 'lg' }),
                'h-12 w-full rounded-full border-brand-yellow bg-transparent text-base font-semibold text-white hover:bg-white/10 hover:text-white',
              )}
            >
              {t('home.signup')}
            </Link>
          </div>
        )}
      </section>

      <section className="mt-6">
        <h2 className="mb-3 text-base font-bold">{t('home.domains')}</h2>
        <ul className="grid grid-cols-3 gap-3">
          {domains.map(({ icon: Icon, label }) => (
            <li
              key={label}
              className="flex flex-col items-center gap-2 rounded-2xl border bg-brand-black p-4 text-center text-sm font-medium text-white"
            >
              <Icon className="size-7 text-brand-yellow" />
              {label}
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8">
        <PageTitle>{t('home.feed.title')}</PageTitle>
        <Feed />
      </section>
    </AppShell>
  )
}

function Feed() {
  const { t } = useI18n()
  const posts = useQuery(api.posts.list)

  return (
    <div
      data-testid="feed"
      data-state={posts ? 'ready' : 'loading'}
      className="mt-3 grid gap-3"
    >
      <PostComposer />
      {!posts ? (
        <div className="flex justify-center py-8">
          <Spinner className="size-5" />
        </div>
      ) : posts.results.length === 0 ? (
        <EmptyState
          icon={Newspaper}
          title={t('posts.empty')}
          hint={t('posts.emptyHint')}
        />
      ) : (
        posts.results.map((post) => (
          <PostCard key={post.id} post={post as FeedPost} />
        ))
      )}
    </div>
  )
}

import { APP_VERSION, GITHUB_COMMIT_URL, GITHUB_REPO_URL, GIT_COMMIT } from '../lib/appMeta'

export function AppMetaFooter() {
  return (
    <footer className="studio-meta-footer mt-auto shrink-0 border-t border-white/[0.06] pt-2.5">
      <p className="flex items-center justify-between gap-2 px-0.5 text-[10px] text-ink-500">
        <span className="min-w-0 truncate">
          <a
            href={GITHUB_REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-ink-400 transition-colors hover:text-ink-200"
            title="Open repository on GitHub"
          >
            v{APP_VERSION}
          </a>
          <span className="mx-1.5 text-ink-600" aria-hidden>
            ·
          </span>
          <a
            href={GITHUB_COMMIT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-ink-500 transition-colors hover:text-amber-200/80"
            title={
              GITHUB_COMMIT_URL.includes('/commit/')
                ? `View commit ${GIT_COMMIT} on GitHub`
                : `Commit ${GIT_COMMIT} (not pushed yet) — open recent commits on GitHub`
            }
          >
            {GIT_COMMIT}
          </a>
        </span>
        <a
          href={GITHUB_REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-ink-600 transition-colors hover:text-ink-400"
          title="Open repository on GitHub"
        >
          GitHub
        </a>
      </p>
    </footer>
  )
}

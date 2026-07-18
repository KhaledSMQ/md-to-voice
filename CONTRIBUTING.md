# Contributing

## Commit messages

This repo uses [Conventional Commits](https://www.conventionalcommits.org/). Messages are checked locally by husky + commitlint, and again on pull requests.

Format:

```
type(scope): short imperative summary
```

- Keep the subject short (about 72 characters). Put detail in the body.
- Use the imperative mood: `add`, `fix`, `improve` — not `added` or `adds`.
- Scope is optional (e.g. `reader`, `tts`, `ci`).

| Type | Version bump on `main` |
| --- | --- |
| `feat` | minor |
| `fix` | patch |
| `feat!` / footer `BREAKING CHANGE:` | major |
| `perf` | patch |
| `docs`, `chore`, `refactor`, `style`, `test`, `ci` | none |

Examples:

```
feat(reader): add focus mini player
fix(tts): recover from cancelled chunk generation
docs: clarify offline PWA caching
```

## Releases

Pushes to `main` run [semantic-release](https://semantic-release.gitbook.io/). It:

1. Analyzes commits since the last tag
2. Bumps `package.json` version when needed
3. Updates `CHANGELOG.md`
4. Creates a git tag and GitHub Release

The app footer shows that version (injected at build time from `package.json`). Local commits do not bump the version — that happens only on `main` after merge.

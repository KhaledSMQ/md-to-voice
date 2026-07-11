export const MARKDOWN_FILE_ACCEPT =
  '.md,.markdown,.mdx,.txt,text/markdown,text/plain'

export const MARKDOWN_FILE_MAX_BYTES = 5 * 1024 * 1024

export type MarkdownFileResult =
  | { ok: true; name: string; text: string }
  | { ok: false; error: string }

export async function readMarkdownFile(file: File): Promise<MarkdownFileResult> {
  if (file.size > MARKDOWN_FILE_MAX_BYTES) {
    return {
      ok: false,
      error: `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 5 MB.`,
    }
  }
  try {
    const text = await file.text()
    return { ok: true, name: file.name, text }
  } catch (err) {
    return {
      ok: false,
      error: `Failed to read file: ${(err as Error).message}`,
    }
  }
}

export function dragEventHasFiles(e: {
  dataTransfer: DataTransfer | null
}): boolean {
  const types = e.dataTransfer?.types
  if (!types) return false
  return Array.from(types as ArrayLike<string>).includes('Files')
}

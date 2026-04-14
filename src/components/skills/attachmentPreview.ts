export type AttachmentPreviewKind = 'markdown' | 'image' | 'text' | 'binary'

export interface AttachmentPreview {
  kind: AttachmentPreviewKind
  extension: string
}

const MARKDOWN_EXTENSIONS = new Set(['md', 'markdown', 'mdown', 'mkd'])
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif'])
const TEXT_EXTENSIONS = new Set([
  'txt',
  'json',
  'yaml',
  'yml',
  'csv',
  'ts',
  'tsx',
  'js',
  'jsx',
  'mjs',
  'cjs',
  'css',
  'scss',
  'html',
  'xml',
  'sh',
  'bash',
  'zsh',
  'env',
  'log',
  'py',
  'rb',
  'go',
  'rs',
  'java',
  'kt',
  'swift',
  'sql',
  'toml',
  'ini',
  'conf',
])

export function getFileExtension(filePath: string): string {
  const fileName = filePath.split('/').pop() || ''
  const dotIndex = fileName.lastIndexOf('.')
  if (dotIndex === -1 || dotIndex === fileName.length - 1) return ''
  return fileName.slice(dotIndex + 1).toLowerCase()
}

export function detectAttachmentPreview(filePath: string): AttachmentPreview {
  const extension = getFileExtension(filePath)

  if (MARKDOWN_EXTENSIONS.has(extension)) {
    return { kind: 'markdown', extension }
  }

  if (IMAGE_EXTENSIONS.has(extension)) {
    return { kind: 'image', extension }
  }

  if (TEXT_EXTENSIONS.has(extension) || extension === '') {
    return { kind: 'text', extension }
  }

  return { kind: 'binary', extension }
}

export function buildSkillAssetUrl(category: string, skill: string, filePath: string, baseUrl = ''): string {
  const normalizedBase = baseUrl.replace(/\/$/, '')
  const encodedPath = encodeURIComponent(filePath)
  return `${normalizedBase}/api/skills/${encodeURIComponent(category)}/${encodeURIComponent(skill)}/raw/${encodedPath}`
}

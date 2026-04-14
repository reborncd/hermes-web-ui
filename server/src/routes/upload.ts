import Router from '@koa/router'
import { mkdir, writeFile } from 'fs/promises'
import { join, resolve } from 'path'
import { homedir } from 'os'

export const uploadRoutes: Router = new Router()

function parseBoundary(contentType: string): string | null {
  const match = contentType.match(/boundary=([^;]+)/i)
  return match ? `--${match[1].trim()}` : null
}

function parseMultipartFile(contentType: string, rawBody: Buffer): { filename: string; data: Buffer } | null {
  const boundary = parseBoundary(contentType)
  if (!boundary) return null

  const body = rawBody.toString('latin1')
  const parts = body.split(boundary).slice(1, -1)

  for (const part of parts) {
    const headerEnd = part.indexOf('\r\n\r\n')
    if (headerEnd === -1) continue

    const header = part.slice(0, headerEnd)
    const filenameMatch = header.match(/filename="([^"]+)"/)
    if (!filenameMatch) continue

    const sanitizedName = filenameMatch[1].split(/[\/]/).pop()?.trim() || 'upload.bin'
    const data = Buffer.from(part.slice(headerEnd + 4, part.length - 2), 'latin1')
    return { filename: sanitizedName, data }
  }

  return null
}

uploadRoutes.post('/api/skills/upload', async (ctx) => {
  const contentType = ctx.get('content-type') || ''
  if (!contentType.toLowerCase().startsWith('multipart/form-data')) {
    ctx.status = 400
    ctx.body = { error: 'Expected multipart/form-data' }
    return
  }

  const chunks: Buffer[] = []
  for await (const chunk of ctx.req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  const file = parseMultipartFile(contentType, Buffer.concat(chunks))

  if (!file) {
    ctx.status = 400
    ctx.body = { error: 'No file found in upload body' }
    return
  }

  const assetsDir = resolve(join(homedir(), '.hermes', 'skills', 'assets'))
  await mkdir(assetsDir, { recursive: true })

  const savedPath = join(assetsDir, file.filename)
  await writeFile(savedPath, file.data)

  ctx.body = { name: file.filename, path: 'assets/' + file.filename }
})

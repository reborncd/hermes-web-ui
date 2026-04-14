import { getBaseUrlValue, request } from './client'

export interface SkillInfo {
  name: string
  description: string
}

export interface SkillCategory {
  name: string
  description: string
  skills: SkillInfo[]
}

export interface SkillListResponse {
  categories: SkillCategory[]
}

export interface SkillFileEntry {
  path: string
  name: string
  isDir: boolean
}

export interface MemoryData {
  memory: string
  user: string
  memory_mtime: number | null
  user_mtime: number | null
}

export interface ProfileRole {
  id: string
  name: string
  title: string
  summary: string
  primaryUseCases: string[]
  responsibilities: string[]
  boundaries: string[]
  nextStep: string
}

export interface ProfileRolesData {
  roles: ProfileRole[]
  mtime: number | null
  source: 'default' | 'file'
}

export async function fetchSkills(): Promise<SkillCategory[]> {
  const res = await request<SkillListResponse>('/api/skills')
  return res.categories
}

export async function fetchSkillContent(skillPath: string): Promise<string> {
  const res = await request<{ content: string }>(`/api/skills/${skillPath}`)
  return res.content
}

export async function fetchSkillFiles(category: string, skill: string): Promise<SkillFileEntry[]> {
  const res = await request<{ files: SkillFileEntry[] }>(`/api/skills/${category}/${skill}/files`)
  return res.files
}

export async function fetchMemory(): Promise<MemoryData> {
  return request<MemoryData>('/api/memory')
}

export async function saveMemory(section: 'memory' | 'user', content: string): Promise<void> {
  await request('/api/memory', {
    method: 'POST',
    body: JSON.stringify({ section, content }),
  })
}

export async function fetchProfileRoles(): Promise<ProfileRolesData> {
  return request<ProfileRolesData>('/api/profile/roles')
}

export async function saveProfileRoles(roles: ProfileRole[]): Promise<void> {
  await request('/api/profile/roles', {
    method: 'POST',
    body: JSON.stringify({ roles }),
  })
}

export async function uploadSkillFile(category: string, skill: string, file: File): Promise<{ path: string; name: string }> {
  const base = getBaseUrlValue()
  const formData = new FormData()
  formData.append('file', file)

  const res = await fetch(`${base}/api/skills/upload`, {
    method: 'POST',
    body: formData,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`API Error ${res.status}: ${text || res.statusText}`)
  }

  const uploaded = await res.json() as { path: string; name: string }

  await request<{ path: string; name: string }>(`/api/skills/${category}/${skill}/assets`, {
    method: 'POST',
    body: JSON.stringify({ uploadedPath: uploaded.path, fileName: uploaded.name }),
  })

  return { path: `assets/${uploaded.name}`, name: uploaded.name }
}

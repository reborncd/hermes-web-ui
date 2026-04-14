import Router from '@koa/router'
import { readdir, readFile, stat, writeFile, mkdir, copyFile } from 'fs/promises'
import { join, resolve } from 'path'
import { homedir } from 'os'
import YAML from 'js-yaml'

// --- Auth / Credential Pool ---

interface CredentialPoolEntry {
  id: string
  label: string
  base_url: string
  access_token: string
  last_status?: string | null
}

interface AuthJson {
  credential_pool?: Record<string, CredentialPoolEntry[]>
}

const authPath = resolve(homedir(), '.hermes', 'auth.json')

async function loadAuthJson(): Promise<AuthJson | null> {
  try {
    const raw = await readFile(authPath, 'utf-8')
    return JSON.parse(raw) as AuthJson
  } catch {
    return null
  }
}

async function saveAuthJson(auth: AuthJson): Promise<void> {
  await writeFile(authPath, JSON.stringify(auth, null, 2) + '\n', 'utf-8')
}

async function fetchProviderModels(baseUrl: string, apiKey: string): Promise<string[]> {
  try {
    const url = baseUrl.replace(/\/+$/, '') + '/models'
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) {
      console.error(`[available-models] ${baseUrl} returned ${res.status}`)
      return []
    }
    const data = await res.json() as { data?: Array<{ id: string }> }
    if (!Array.isArray(data.data)) {
      console.error(`[available-models] ${baseUrl} returned unexpected format`)
      return []
    }
    return data.data.map(m => m.id).sort()
  } catch (err: any) {
    console.error(`[available-models] ${baseUrl} failed: ${err.message}`)
    return []
  }
}

// --- Hardcoded model catalogs (single source: src/shared/providers.ts) ---
import { buildProviderModelMap } from '../shared/providers'
const PROVIDER_MODEL_CATALOG = buildProviderModelMap()

export const fsRoutes: Router = new Router()

const hermesDir = resolve(homedir(), '.hermes')

// --- Types ---

interface SkillInfo {
  name: string
  description: string
}

interface SkillCategory {
  name: string
  description: string
  skills: SkillInfo[]
}

interface ProfileRole {
  id: string
  name: string
  title: string
  summary: string
  primaryUseCases: string[]
  responsibilities: string[]
  boundaries: string[]
  nextStep: string
}

const defaultProfileRoles: ProfileRole[] = [
  {
    id: 'bb',
    name: 'bb',
    title: '内容策略',
    summary: '负责内容方向、叙事结构、表达策略与信息组织。',
    primaryUseCases: [
      '选题、内容策略、内容框架设计',
      '文章/脚本/知识产品的叙事与结构优化',
      '需要先把“说什么、怎么说”定义清楚的任务',
    ],
    responsibilities: [
      '定义目标受众、信息层级和表达路线',
      '整理内容卖点、结构、标题与呈现方式',
      '把模糊想法收敛成可执行内容方案',
    ],
    boundaries: [
      '不优先负责工程实现和代码调试',
      '不负责最终平台适配包装',
      '适合作为前置策略角色，而不是最终发布角色',
    ],
    nextStep: '如果任务核心是“内容要怎么设计”，优先切到 bb。',
  },
  {
    id: 'dd',
    name: 'dd',
    title: '工程实现',
    summary: '负责编码、调试、自动化、集成和工程落地。',
    primaryUseCases: [
      '写代码、修 bug、排查报错',
      '搭建自动化流程、脚本、接口与功能',
      '把方案真正做成可运行的实现',
    ],
    responsibilities: [
      '拆解实现路径并完成开发改造',
      '处理依赖、类型、接口、构建与运行问题',
      '验证功能是否通过构建、测试或实际运行',
    ],
    boundaries: [
      '不优先负责内容定位与传播策略',
      '不以社媒平台包装为第一职责',
      '更适合解决“怎么做出来”而不是“怎么讲出来”',
    ],
    nextStep: '如果任务核心是“把东西做出来”，优先切到 dd。',
  },
  {
    id: 'pp',
    name: 'pp',
    title: '发布包装',
    summary: '负责平台适配、发布包装、社媒改写与成品输出。',
    primaryUseCases: [
      '同一内容改写成不同平台版本',
      '整理发布说明、更新日志、PR 描述、社媒文案',
      '需要考虑平台语气、长度、格式和交付样式的任务',
    ],
    responsibilities: [
      '把已有内容包装成适配目标平台的版本',
      '统一格式、标题、摘要、CTA 与发布结构',
      '保证输出更接近“可发出去”的最终成品',
    ],
    boundaries: [
      '不优先承担深度工程调试',
      '通常建立在已有策略或已有内容之上',
      '更偏交付包装，而不是前期策略或底层实现',
    ],
    nextStep: '如果任务核心是“怎么发、怎么包装、怎么适配平台”，优先切到 pp。',
  },
  {
    id: 'zhengyang',
    name: 'zhengyang',
    title: '长期管理',
    summary: '负责个人偏好、长期规划、工作管理与持续记忆。',
    primaryUseCases: [
      '梳理长期偏好、工作规则和协作习惯',
      '管理长期计划、节奏、优先级与复盘信息',
      '需要把短期任务沉淀为长期协作资产',
    ],
    responsibilities: [
      '维护稳定偏好、协作规则与长期目标',
      '帮助形成持续性的工作管理框架',
      '把跨会话有价值的信息沉淀下来',
    ],
    boundaries: [
      '不替代具体执行角色完成工程或内容产出',
      '更关注长期一致性，而不是单次任务冲刺',
      '适合作为管理层和记忆层，而不是所有任务的主执行者',
    ],
    nextStep: '如果任务核心是“长期怎么协作、怎么管理、怎么记住”，优先切到 zhengyang。',
  },
]

// --- Helpers ---

function extractDescription(content: string): string {
  const lines = content.split('\n')
  let inFrontmatter = false
  let bodyStarted = false

  for (const line of lines) {
    if (!bodyStarted && line.trim() === '---') {
      if (!inFrontmatter) {
        inFrontmatter = true
        continue
      } else {
        inFrontmatter = false
        bodyStarted = true
        continue
      }
    }
    if (inFrontmatter) continue
    if (line.trim() === '') continue
    if (line.startsWith('#')) continue
    return line.trim().slice(0, 80)
  }
  return ''
}

async function safeReadFile(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, 'utf-8')
  } catch {
    return null
  }
}

async function safeStat(filePath: string): Promise<{ mtime: number } | null> {
  try {
    const s = await stat(filePath)
    return { mtime: Math.round(s.mtimeMs) }
  } catch {
    return null
  }
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map(item => String(item ?? '').trim()).filter(Boolean)
}

function normalizeProfileRole(input: unknown, index: number): ProfileRole {
  const role = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const fallback = defaultProfileRoles[index] || defaultProfileRoles[0]

  return {
    id: String(role.id || fallback.id).trim(),
    name: String(role.name || role.id || fallback.name).trim(),
    title: String(role.title || fallback.title).trim(),
    summary: String(role.summary || fallback.summary).trim(),
    primaryUseCases: normalizeStringArray(role.primaryUseCases).length ? normalizeStringArray(role.primaryUseCases) : fallback.primaryUseCases,
    responsibilities: normalizeStringArray(role.responsibilities).length ? normalizeStringArray(role.responsibilities) : fallback.responsibilities,
    boundaries: normalizeStringArray(role.boundaries).length ? normalizeStringArray(role.boundaries) : fallback.boundaries,
    nextStep: String(role.nextStep || fallback.nextStep).trim(),
  }
}

async function loadProfileRoles(): Promise<{ roles: ProfileRole[]; source: 'default' | 'file'; mtime: number | null }> {
  const filePath = join(hermesDir, 'memories', 'PROFILE_ROLES.json')
  const raw = await safeReadFile(filePath)
  const fileStat = await safeStat(filePath)

  if (!raw) {
    return { roles: defaultProfileRoles, source: 'default', mtime: null }
  }

  const parsed = JSON.parse(raw) as { roles?: unknown[] }
  const inputRoles = Array.isArray(parsed.roles) ? parsed.roles : []
  const normalized = inputRoles.map((role, index) => normalizeProfileRole(role, index)).filter(role => role.id)

  return {
    roles: normalized.length > 0 ? normalized : defaultProfileRoles,
    source: 'file',
    mtime: fileStat?.mtime || null,
  }
}

function getSkillRoot(category: string, skill: string): string {
  return resolve(join(hermesDir, 'skills', category, skill))
}

function assertWithinSkillRoot(targetPath: string, skillRoot: string): string {
  const resolved = resolve(targetPath)
  if (!resolved.startsWith(skillRoot + '/')) {
    throw new Error('Access denied')
  }
  return resolved
}

// --- Config YAML helpers ---

const configPath = resolve(homedir(), '.hermes/config.yaml')

async function readConfigYaml(): Promise<Record<string, any>> {
  const raw = await safeReadFile(configPath)
  if (!raw) return {}
  return (YAML.load(raw) as Record<string, any>) || {}
}

async function writeConfigYaml(config: Record<string, any>): Promise<void> {
  await copyFile(configPath, configPath + '.bak')
  const yamlStr = YAML.dump(config, {
    lineWidth: -1,
    noRefs: true,
    quotingType: '"',
  })
  await writeFile(configPath, yamlStr, 'utf-8')
}

// --- Skills Routes ---

// List all skills grouped by category
fsRoutes.get('/api/skills', async (ctx) => {
  const skillsDir = join(hermesDir, 'skills')

  try {
    const entries = await readdir(skillsDir, { withFileTypes: true })
    const categories: SkillCategory[] = []

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue

      const catDir = join(skillsDir, entry.name)
      const catDesc = await safeReadFile(join(catDir, 'DESCRIPTION.md'))
      const catDescription = catDesc ? catDesc.trim().split('\n')[0].replace(/^#+\s*/, '').slice(0, 100) : ''

      const skillEntries = await readdir(catDir, { withFileTypes: true })
      const skills: SkillInfo[] = []

      for (const se of skillEntries) {
        if (!se.isDirectory()) continue
        const skillMd = await safeReadFile(join(catDir, se.name, 'SKILL.md'))
        if (skillMd) {
          skills.push({
            name: se.name,
            description: extractDescription(skillMd),
          })
        }
      }

      if (skills.length > 0) {
        categories.push({ name: entry.name, description: catDescription, skills })
      }
    }

    categories.sort((a, b) => a.name.localeCompare(b.name))
    for (const cat of categories) {
      cat.skills.sort((a, b) => a.name.localeCompare(b.name))
    }

    ctx.body = { categories }
  } catch (err: any) {
    ctx.status = 500
    ctx.body = { error: `Failed to read skills directory: ${err.message}` }
  }
})

// List files in a skill directory
async function listFilesRecursive(dir: string, prefix: string): Promise<{ path: string; name: string }[]> {
  const result: { path: string; name: string }[] = []
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return result
  }
  for (const entry of entries) {
    const relPath = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      result.push(...await listFilesRecursive(join(dir, entry.name), relPath))
    } else {
      result.push({ path: relPath, name: entry.name })
    }
  }
  return result
}

fsRoutes.get('/api/skills/:category/:skill/files', async (ctx) => {
  const { category, skill } = ctx.params
  const skillDir = getSkillRoot(category, skill)

  try {
    const allFiles = await listFilesRecursive(skillDir, '')
    const files = allFiles.filter(f => f.path !== 'SKILL.md')
    ctx.body = { files }
  } catch (err: any) {
    ctx.status = 500
    ctx.body = { error: err.message }
  }
})

fsRoutes.get('/api/skills/:category/:skill/raw/:filePath(.+)', async (ctx) => {
  const { category, skill } = ctx.params
  const relativePath = decodeURIComponent(ctx.params.filePath)
  const skillRoot = getSkillRoot(category, skill)

  let filePath: string
  try {
    filePath = assertWithinSkillRoot(join(skillRoot, relativePath), skillRoot)
  } catch {
    ctx.status = 403
    ctx.body = { error: 'Access denied' }
    return
  }

  try {
    const content = await readFile(filePath)
    ctx.type = filePath
    ctx.body = content
  } catch {
    ctx.status = 404
    ctx.body = { error: 'File not found' }
  }
})

// Read a specific file under skills/
fsRoutes.get('/api/skills/:path(.+)', async (ctx) => {
  const filePath = ctx.params.path
  const fullPath = resolve(join(hermesDir, 'skills', filePath))

  if (!fullPath.startsWith(join(hermesDir, 'skills'))) {
    ctx.status = 403
    ctx.body = { error: 'Access denied' }
    return
  }

  const content = await safeReadFile(fullPath)
  if (content === null) {
    ctx.status = 404
    ctx.body = { error: 'File not found' }
    return
  }

  ctx.body = { content }
})

fsRoutes.post('/api/skills/:category/:skill/assets', async (ctx) => {
  const { category, skill } = ctx.params
  const body = (ctx.request as any).body as { uploadedPath?: string; fileName?: string } | undefined
  const uploadedPath = body?.uploadedPath?.trim()
  const requestedName = body?.fileName?.trim()

  if (!uploadedPath) {
    ctx.status = 400
    ctx.body = { error: 'uploadedPath is required' }
    return
  }

  if (!requestedName) {
    ctx.status = 400
    ctx.body = { error: 'fileName is required' }
    return
  }

  const uploadRoot = resolve(join(hermesDir, 'skills', 'assets'))
  const sourcePath = resolve(join(hermesDir, 'skills', uploadedPath))
  if (!sourcePath.startsWith(uploadRoot + '/')) {
    ctx.status = 403
    ctx.body = { error: 'Access denied' }
    return
  }

  const skillRoot = getSkillRoot(category, skill)
  const assetsDir = assertWithinSkillRoot(join(skillRoot, 'assets'), skillRoot)
  const destinationPath = assertWithinSkillRoot(join(assetsDir, requestedName), skillRoot)

  try {
    await mkdir(assetsDir, { recursive: true })
    await copyFile(sourcePath, destinationPath)
    ctx.body = { path: `assets/${requestedName}`, name: requestedName }
  } catch (err: any) {
    ctx.status = 500
    ctx.body = { error: err.message }
  }
})

// --- Memory Routes ---

fsRoutes.get('/api/memory', async (ctx) => {
  const memoryPath = join(hermesDir, 'memories', 'MEMORY.md')
  const userPath = join(hermesDir, 'memories', 'USER.md')

  const [memory, user, memoryStat, userStat] = await Promise.all([
    safeReadFile(memoryPath),
    safeReadFile(userPath),
    safeStat(memoryPath),
    safeStat(userPath),
  ])

  ctx.body = {
    memory: memory || '',
    user: user || '',
    memory_mtime: memoryStat?.mtime || null,
    user_mtime: userStat?.mtime || null,
  }
})

fsRoutes.post('/api/memory', async (ctx) => {
  const { section, content } = (ctx.request as any).body as { section: string; content: string }

  if (!section || !content) {
    ctx.status = 400
    ctx.body = { error: 'Missing section or content' }
    return
  }

  if (section !== 'memory' && section !== 'user') {
    ctx.status = 400
    ctx.body = { error: 'Section must be "memory" or "user"' }
    return
  }

  const fileName = section === 'memory' ? 'MEMORY.md' : 'USER.md'
  const filePath = join(hermesDir, 'memories', fileName)

  try {
    await writeFile(filePath, content, 'utf-8')
    ctx.body = { success: true }
  } catch (err: any) {
    ctx.status = 500
    ctx.body = { error: err.message }
  }
})

fsRoutes.get('/api/profile/roles', async (ctx) => {
  try {
    ctx.body = await loadProfileRoles()
  } catch (err: any) {
    ctx.status = 500
    ctx.body = { error: err.message }
  }
})

fsRoutes.post('/api/profile/roles', async (ctx) => {
  const { roles } = (ctx.request as any).body as { roles?: unknown[] }

  if (!Array.isArray(roles)) {
    ctx.status = 400
    ctx.body = { error: 'roles must be an array' }
    return
  }

  const normalized = roles.map((role, index) => normalizeProfileRole(role, index)).filter(role => role.id)
  const filePath = join(hermesDir, 'memories', 'PROFILE_ROLES.json')

  try {
    await mkdir(join(hermesDir, 'memories'), { recursive: true })
    await writeFile(filePath, JSON.stringify({ roles: normalized }, null, 2) + '\n', 'utf-8')
    ctx.body = { success: true }
  } catch (err: any) {
    ctx.status = 500
    ctx.body = { error: err.message }
  }
})

// --- Config Model Routes ---

interface ModelInfo {
  id: string
  label: string
}

interface ModelGroup {
  provider: string
  models: ModelInfo[]
}

// Build model list from user's actual config.yaml using js-yaml
function buildModelGroups(config: Record<string, any>): { default: string; groups: ModelGroup[] } {
  let defaultModel = ''
  let defaultProvider = ''
  const groups: ModelGroup[] = []
  const allModelIds = new Set<string>()

  // 1. Extract current model
  const modelSection = config.model
  if (typeof modelSection === 'object' && modelSection !== null) {
    defaultModel = String(modelSection.default || '').trim()
    defaultProvider = String(modelSection.provider || '').trim()
  } else if (typeof modelSection === 'string') {
    defaultModel = modelSection.trim()
  }

  // 2. Extract custom_providers section
  const customProviders = config.custom_providers
  if (Array.isArray(customProviders)) {
    const customModels: ModelInfo[] = []
    for (const entry of customProviders) {
      if (entry && typeof entry === 'object') {
        const cName = String(entry.name || '').trim()
        const cModel = String(entry.model || '').trim()
        if (cName && cModel) {
          customModels.push({ id: cModel, label: `${cName}: ${cModel}` })
          allModelIds.add(cModel)
        }
      }
    }
    if (customModels.length > 0) {
      groups.push({ provider: 'Custom', models: customModels })
    }
  }

  // 3. Add current default model (if not already in custom_providers)
  if (defaultModel && !allModelIds.has(defaultModel)) {
    groups.unshift({ provider: 'Current', models: [{ id: defaultModel, label: defaultModel }] })
  }

  return { default: defaultModel, groups }
}

// GET /api/available-models — fetch models from all credential pool endpoints
fsRoutes.get('/api/available-models', async (ctx) => {
  try {
    const auth = await loadAuthJson()
    const pool = auth?.credential_pool || {}

    const config = await readConfigYaml()
    const modelSection = config.model
    let currentDefault = ''
    if (typeof modelSection === 'object' && modelSection !== null) {
      currentDefault = String(modelSection.default || '').trim()
    } else if (typeof modelSection === 'string') {
      currentDefault = modelSection.trim()
    }

    // Collect unique endpoints from credential pool
    const endpoints: Array<{ key: string; label: string; base_url: string; token: string }> = []
    const seenUrls = new Set<string>()

    for (const [providerKey, entries] of Object.entries(pool)) {
      if (!Array.isArray(entries) || entries.length === 0) continue
      const entry = entries.find(e => e.last_status !== 'exhausted') || entries[0]
      if (!entry?.base_url || !entry?.access_token) continue
      const baseUrl = entry.base_url.replace(/\/+$/, '')
      if (seenUrls.has(baseUrl)) continue
      seenUrls.add(baseUrl)
      endpoints.push({
        key: providerKey,
        label: providerKey.replace(/^custom:/, '') || entry.label || baseUrl,
        base_url: baseUrl,
        token: entry.access_token,
      })
    }

    // Resolve models: hardcoded catalog first, live probe as fallback
    const groups: Array<{ provider: string; label: string; base_url: string; models: string[] }> = []
    const liveEndpoints: typeof endpoints = []

    for (const ep of endpoints) {
      const catalogModels = PROVIDER_MODEL_CATALOG[ep.key]
      if (catalogModels && catalogModels.length > 0) {
        groups.push({ provider: ep.key, label: ep.label, base_url: ep.base_url, models: catalogModels })
      } else {
        liveEndpoints.push(ep)
      }
    }

    if (liveEndpoints.length > 0) {
      const results = await Promise.allSettled(
        liveEndpoints.map(async ep => {
          const models = await fetchProviderModels(ep.base_url, ep.token)
          return { ...ep, models }
        }),
      )

      for (const result of results) {
        if (result.status === 'fulfilled' && result.value.models.length > 0) {
          const { key, label, base_url, models } = result.value
          groups.push({ provider: key, label, base_url, models })
        } else if (result.status === 'rejected') {
          console.error(`[available-models] Failed: ${result.reason?.message || result.reason}`)
        }
      }
    }

    // Fallback: if no providers returned models, fall back to config.yaml parsing
    if (groups.length === 0) {
      const fallback = buildModelGroups(config)
      ctx.body = fallback
      return
    }

    ctx.body = { default: currentDefault, groups }
  } catch (err: any) {
    ctx.status = 500
    ctx.body = { error: err.message }
  }
})

// GET /api/config/models
fsRoutes.get('/api/config/models', async (ctx) => {
  try {
    const config = await readConfigYaml()
    ctx.body = buildModelGroups(config)
  } catch (err: any) {
    ctx.status = 500
    ctx.body = { error: err.message }
  }
})

// PUT /api/config/model
fsRoutes.put('/api/config/model', async (ctx) => {
  const { default: defaultModel, provider: reqProvider } = (ctx.request as any).body as {
    default: string
    provider?: string
  }

  if (!defaultModel) {
    ctx.status = 400
    ctx.body = { error: 'Missing default model' }
    return
  }

  try {
    const config = await readConfigYaml()

    if (typeof config.model !== 'object' || config.model === null) {
      config.model = {}
    }

    config.model.default = defaultModel
    if (reqProvider) {
      config.model.provider = reqProvider
    }

    await writeConfigYaml(config)
    ctx.body = { success: true }
  } catch (err: any) {
    ctx.status = 500
    ctx.body = { error: err.message }
  }
})

// POST /api/config/providers
fsRoutes.post('/api/config/providers', async (ctx) => {
  const { name, base_url, api_key, model, providerKey } = (ctx.request as any).body as {
    name: string
    base_url: string
    api_key: string
    model: string
    providerKey?: string | null
  }

  if (!name || !base_url || !model) {
    ctx.status = 400
    ctx.body = { error: 'Missing name, base_url, or model' }
    return
  }

  if (!api_key) {
    ctx.status = 400
    ctx.body = { error: 'Missing API key' }
    return
  }

  try {
    // 1. Write to config.yaml custom_providers
    const config = await readConfigYaml()

    if (!Array.isArray(config.custom_providers)) {
      config.custom_providers = []
    }

    config.custom_providers.push({ name, base_url, api_key, model })
    await writeConfigYaml(config)

    // 2. Write to auth.json credential_pool
    const poolKey = providerKey
      || `custom:${name.trim().toLowerCase().replace(/ /g, '-')}`
    const auth = await loadAuthJson() || { credential_pool: {} }
    if (!auth.credential_pool) auth.credential_pool = {}

    if (!auth.credential_pool[poolKey]) {
      auth.credential_pool[poolKey] = []
    }

    auth.credential_pool[poolKey].push({
      id: `${poolKey}-${Date.now()}`,
      label: name,
      base_url,
      access_token: api_key,
      last_status: null,
    })

    await saveAuthJson(auth)

    // 3. Auto-switch model to the newly added provider
    const config2 = await readConfigYaml()
    if (typeof config2.model !== 'object' || config2.model === null) {
      config2.model = {}
    }
    config2.model.default = model
    config2.model.provider = poolKey
    await writeConfigYaml(config2)

    ctx.body = { success: true }
  } catch (err: any) {
    ctx.status = 500
    ctx.body = { error: err.message }
  }
})

// DELETE /api/config/providers/:poolKey
fsRoutes.delete('/api/config/providers/:poolKey', async (ctx) => {
  const poolKey = decodeURIComponent(ctx.params.poolKey)

  try {
    const auth = await loadAuthJson()
    if (!auth?.credential_pool) {
      ctx.status = 404
      ctx.body = { error: 'No credential pool found' }
      return
    }

    const keys = Object.keys(auth.credential_pool)

    if (keys.length <= 1) {
      ctx.status = 400
      ctx.body = { error: 'Cannot delete the last provider' }
      return
    }

    if (!(poolKey in auth.credential_pool)) {
      ctx.status = 404
      ctx.body = { error: `Provider "${poolKey}" not found` }
      return
    }

    // Check if this is the current active provider
    const config = await readConfigYaml()
    const currentProvider = config.model?.provider
    const isCurrent = currentProvider === poolKey

    // Save base_url before deleting
    const deletedBaseUrl = auth.credential_pool[poolKey]?.[0]?.base_url

    // 1. Delete from auth.json
    delete auth.credential_pool[poolKey]
    await saveAuthJson(auth)

    // 2. Remove matching entry from config.yaml custom_providers
    if (deletedBaseUrl && Array.isArray(config.custom_providers)) {
      config.custom_providers = (config.custom_providers as any[]).filter(
        (entry: any) => entry.base_url !== deletedBaseUrl,
      )
      await writeConfigYaml(config)
    }

    // 3. If was the current provider, switch to first remaining
    if (isCurrent) {
      const remainingKeys = Object.keys(auth.credential_pool)
      if (remainingKeys.length > 0) {
        const fallback = remainingKeys[0]
        const fallbackEntry = auth.credential_pool[fallback]?.[0]
        const catalogModels = PROVIDER_MODEL_CATALOG[fallback] || []
        const fallbackModel = catalogModels[0] || fallbackEntry?.label || fallback

        const config2 = await readConfigYaml()
        if (typeof config2.model !== 'object' || config2.model === null) {
          config2.model = {}
        }
        config2.model.default = fallbackModel
        config2.model.provider = fallback
        await writeConfigYaml(config2)
      }
    }

    ctx.body = { success: true }
  } catch (err: any) {
    ctx.status = 500
    ctx.body = { error: err.message }
  }
})

# Profile 菜单 + Skills 本地文件上传 Implementation Plan

> For Hermes: planning only. Do not implement code from this document automatically.

Goal:
把现有 hermes-web-ui 从“可浏览 Skills / 可编辑 Memory”升级为：
1. 拥有独立可见的 Profile 菜单与页面；
2. Skills 页面支持将本地文件上传到指定 skill 的受控目录中，并能刷新展示上传结果。

Architecture:
这次迭代尽量复用现有数据面，不重做底层模型。Profile 功能直接复用当前 `/api/memory` 的 `user` 字段，仅做信息架构拆分；Skills 上传不复用当前通用 `/upload`，而是在 `filesystem.ts` 中新增 skill-scoped 文件管理接口，强制白名单目录和路径校验，把 Skills 从只读浏览器提升为受控资产管理器。

Tech Stack:
- Frontend: Vue 3 + TypeScript + Naive UI + Vue Router + vue-i18n
- Backend: Koa 2 + @koa/router + Node fs/promises
- Validation: npm run build, npm run dev

---

## 1. Current context confirmed from codebase

Already exists:
- Router only has `chat/jobs/models/logs/usage/skills/memory/settings/channels` in `src/router/index.ts`
- Sidebar nav is hardcoded in `src/components/layout/AppSidebar.vue`
- Profile data already exists inside `src/views/MemoryView.vue` via `/api/memory`
- Skills browser exists in:
  - `src/views/SkillsView.vue`
  - `src/components/skills/SkillList.vue`
  - `src/components/skills/SkillDetail.vue`
- Skills API exists in `src/api/skills.ts`
- Backend skill browsing APIs live in `server/src/routes/filesystem.ts`
- Generic upload route exists in `server/src/routes/upload.ts`, but it only saves to generic uploadDir and does not attach files to a skill

Important constraints:
- Do not let uploads write arbitrary paths
- Do not allow direct upload to `SKILL.md`
- Keep v1 scope tight: upload into existing skill only, under approved subdirectories only

---

## 2. Scope definition

### In scope for v1
1. Add Profile as a first-class menu item and route
2. Add dedicated `ProfileView.vue`
3. Reuse `/api/memory` to read/write user profile content
4. Keep current `MemoryView.vue`, but narrow it to notes/memory-focused UX
5. Add skill asset upload API scoped to one skill
6. Allow uploads only into:
   - `references/`
   - `templates/`
   - `scripts/`
   - `assets/`
7. Add upload UI in skill detail panel
8. Refresh attached file list after upload
9. Show upload success/error feedback

### Explicitly out of scope for v1
- Editing `SKILL.md` in browser
- Deleting/renaming skill files
- Arbitrary folder creation
- Binary preview support beyond current text-ish rendering path
- Version history / diff / rollback
- Drag-and-drop multi-pane file manager

---

## 3. UX / Product decisions

### 3.1 Profile menu
Recommended IA:
- Add sidebar item: `Profile`
- Add route: `/profile`
- New page shows only user profile content (`user` from `/api/memory`)
- Keep page layout visually aligned with current Memory page

Why this is the right v1:
- Reuses backend and data model
- Makes profile discoverable without destabilizing existing memory features
- Keeps user mental model clean: Notes/Memory vs Profile

Recommended copy on page:
- Title: Profile
- Short helper text: “This profile shapes personalization, preferences, and long-term context.”
- Actions: Refresh / Edit / Save / Cancel
- Meta: last updated timestamp

### 3.2 Memory page
Keep route `/memory`, but revise UX to focus on notes / memory:
- Option A: keep both sections but visually de-emphasize profile and add link to Profile page
- Option B: better option for maintainability: remove editable user-profile block from `MemoryView.vue` and keep only memory notes there

Recommended choice: Option B
Reason:
- Avoid duplicate editors for the same content
- Avoid future drift between Memory and Profile pages

### 3.3 Skills upload UX
Place controls in `SkillDetail.vue` header area:
- Upload file button
- Target directory selector
- Refresh button

Recommended upload flow:
1. User selects a skill
2. User chooses target directory from dropdown
3. User clicks Upload file
4. Native file picker opens
5. Frontend POSTs multipart/form-data to skill-scoped API
6. Success toast shown
7. Attached files list refreshes automatically
8. Optionally auto-highlight newest uploaded file in future iteration

Recommended allowed target dirs:
- references
- templates
- scripts
- assets

Recommended conflict behavior in v1:
- Default: reject on same filename with 409-style response or 400 with explicit message
- Add `overwrite` later if needed

Reason:
- Safer
- Simpler API and UI
- Prevent accidental loss

---

## 4. Backend design

Primary backend file:
- `server/src/routes/filesystem.ts`

### 4.1 New helper functions to add in filesystem route module
Add helpers near existing skill utilities:
- `getSkillRoot(category: string, skill: string): string`
- `assertSafeSkillPath(fullPath: string, skillRoot: string): void`
- `sanitizeFileName(name: string): string`
- `isAllowedSkillSubdir(targetDir: string): boolean`

Behavior:
- Resolve skill root as `~/.hermes/skills/<category>/<skill>`
- Verify targetDir is one of allowed values
- Ensure final resolved path stays under skill root
- Reject path separators embedded in uploaded filename
- Reject empty filename

### 4.2 New API endpoint
Add new route in `server/src/routes/filesystem.ts`:
- `POST /api/skills/:category/:skill/files`

Request:
- multipart/form-data
- fields:
  - `file`: actual uploaded file (required)
  - `targetDir`: one of `references|templates|scripts|assets` (required)

Response success shape:
```json
{
  "file": {
    "path": "references/example.md",
    "name": "example.md"
  }
}
```

Error cases:
- 400: missing file / missing targetDir / invalid targetDir / unsafe filename
- 404: target skill directory does not exist
- 409: file already exists
- 500: unexpected write failure

### 4.3 Multipart handling choice
For v1, reuse the project’s existing manual multipart approach only if kept tightly scoped.

However, recommended implementation is:
- Either extract minimal multipart parsing helper from `server/src/routes/upload.ts`
- Or reuse the current raw-body parsing logic inside the new skill route with a small local helper

Important caution:
Current `server/src/routes/upload.ts` converts multipart body through `latin1` string processing. That is fragile for arbitrary binary files.

Recommendation:
- If keeping v1 minimal and text-focused, document supported file types as mostly text assets
- If you want robust binary support, this is the point to switch both upload routes to a proper multipart parser later

For this iteration, safest product statement:
- v1 officially supports common text assets and light binary attachments
- note future migration to robust multipart parser as follow-up

### 4.4 File system behavior
On success:
- ensure target subdir exists with `mkdir(..., { recursive: true })`
- write file to `<skillRoot>/<targetDir>/<sanitizedFilename>`
- return relative path under skill root

Do not:
- auto-create arbitrary nested subpaths from user input
- overwrite existing files silently
- allow write outside skill root
- allow write to skill root directly

### 4.5 Existing list/read APIs
Keep these unchanged initially:
- `GET /api/skills`
- `GET /api/skills/:category/:skill/files`
- `GET /api/skills/:path(.+)`

But verify that newly uploaded files appear correctly through current recursive listing.

---

## 5. Frontend design

### 5.1 Router changes
Modify:
- `src/router/index.ts`

Add route:
- `/profile`
- name: `profile`
- component: `@/views/ProfileView.vue`

### 5.2 Sidebar changes
Modify:
- `src/components/layout/AppSidebar.vue`

Add one nav item:
- active when `selectedKey === 'profile'`
- route push `profile`
- translation key `sidebar.profile`

Placement recommendation:
- Put Profile near Memory, not inside Settings
- Suggested order:
  - Skills
  - Profile
  - Memory
  - Logs
  - Usage

Reason:
- Profile is personal context, semantically closer to Memory than to Settings

### 5.3 New Profile view
Create:
- `src/views/ProfileView.vue`

Implementation approach:
- Copy the stable patterns from `src/views/MemoryView.vue`
- Narrow data handling to `user` only
- Reuse `fetchMemory`, `saveMemory`, and `MemoryData` from `src/api/skills.ts`

Page contents:
- header title
- helper description
- refresh button
- single profile card / editor
- preview mode via `MarkdownRenderer`
- edit mode textarea
- last updated timestamp

Recommended internal functions:
- `loadProfile()`
- `startEdit()`
- `cancelEdit()`
- `handleSave()`
- `formatTime()`

### 5.4 Memory view cleanup
Modify:
- `src/views/MemoryView.vue`

Recommended change:
- remove the user profile section entirely
- keep notes/memory section only
- optionally add subtle link/button to `/profile`

If you want to reduce change risk in v1:
- keep structure but replace profile editor with a read-only hint linking to Profile page

### 5.5 Skills API client updates
Modify:
- `src/api/skills.ts`

Add:
- `type SkillUploadTarget = 'references' | 'templates' | 'scripts' | 'assets'`
- `uploadSkillFile(category: string, skill: string, file: File, targetDir: SkillUploadTarget): Promise<SkillFileEntry | { path: string; name: string }>`

Implementation pattern:
- use `FormData`
- append `file`
- append `targetDir`
- call `fetch` directly instead of JSON `request(...)`
- parse non-OK errors to readable message if possible

### 5.6 Skill detail UI changes
Modify:
- `src/components/skills/SkillDetail.vue`

Add new local state:
- `uploading = ref(false)`
- `selectedTargetDir = ref<SkillUploadTarget>('references')`
- `fileInputRef = ref<HTMLInputElement | null>(null)`

Add new actions:
- `triggerUpload()`
- `handleFilePicked(event)`
- `refreshFiles()` or just call `loadSkill()` after upload

Recommended UI placement:
- In top title/header row, on right side:
  - target dir dropdown
  - Upload button
  - Refresh button

Recommended UI behavior:
- upload disabled while loading/uploading
- file picker resets after each selection
- success toast via `useMessage()`
- on success reload files and remain on current skill page

Potential refactor inside component:
- separate `loadFiles()` from `loadSkill()` to avoid re-fetching SKILL.md every upload if you want better performance
- but for v1, calling `loadSkill()` is acceptable and simpler

### 5.7 Optional Skills view enhancement
Modify if needed:
- `src/views/SkillsView.vue`

Possible small improvement:
- pass a `key` or callbacks to force detail refresh on skill selection changes
- not strictly necessary if `SkillDetail.vue` already owns the upload flow cleanly

---

## 6. i18n changes

Modify:
- `src/i18n/locales/en.ts`
- `src/i18n/locales/zh.ts`

Add keys for:
- `sidebar.profile`
- `profile.title`
- `profile.description`
- `profile.refresh`
- `profile.noProfile`
- `profile.profilePlaceholder`
- `profile.loadFailed`
- `profile.saveFailed`
- `skills.uploadFile`
- `skills.uploading`
- `skills.targetDir`
- `skills.targetDirs.references`
- `skills.targetDirs.templates`
- `skills.targetDirs.scripts`
- `skills.targetDirs.assets`
- `skills.uploadSuccess`
- `skills.uploadFailed`
- `skills.refreshFiles`
- `skills.fileAlreadyExists`
- `skills.invalidTargetDir`

Recommendation:
- Keep upload copy action-oriented and short
- Keep directory labels literal, not overlocalized, if you want them to map clearly to filesystem structure

---

## 7. Exact file change list

### New files
- `src/views/ProfileView.vue`

### Modified frontend files
- `src/router/index.ts`
- `src/components/layout/AppSidebar.vue`
- `src/views/MemoryView.vue`
- `src/components/skills/SkillDetail.vue`
- `src/api/skills.ts`
- `src/i18n/locales/en.ts`
- `src/i18n/locales/zh.ts`

### Modified backend files
- `server/src/routes/filesystem.ts`

### Optional backend refactor file
- `server/src/routes/upload.ts` only if you decide to extract shared multipart parsing helper, otherwise leave unchanged for v1

---

## 8. Suggested implementation sequence

### Phase 1: Profile IA split
1. Add route in `src/router/index.ts`
2. Add sidebar item in `AppSidebar.vue`
3. Create `ProfileView.vue` reusing memory API
4. Simplify `MemoryView.vue` to memory-only UX
5. Add i18n strings
6. Run build and visually verify navigation

Success criteria:
- Sidebar shows Profile
- `/profile` loads existing user profile data
- Save updates same underlying data source as before
- `/memory` no longer duplicates profile editing

### Phase 2: Skill upload backend
1. Add allowed-dir constants in `server/src/routes/filesystem.ts`
2. Add safe path helpers
3. Add POST upload route
4. Ensure directory existence and non-overwrite behavior
5. Manually verify API with one sample file upload

Success criteria:
- Only allowed target dirs accepted
- Existing skill required
- Same filename rejected
- Uploaded file appears in recursive listing API

### Phase 3: Skill upload frontend
1. Add upload client function in `src/api/skills.ts`
2. Add UI controls to `SkillDetail.vue`
3. Add message feedback and loading state
4. Reload skill file list after upload
5. Add i18n strings

Success criteria:
- User can upload file from browser into selected skill
- File appears under attached files after success
- Error messaging is readable for conflict and validation failures

### Phase 4: Validation and polish
1. Verify Chinese and English copy
2. Verify layout does not break narrow widths
3. Verify upload state resets correctly after failure/success
4. Confirm current file viewer still opens uploaded text assets
5. Update README only if you want feature discoverability now

---

## 9. API contract proposal

### GET /api/memory
No change.
Current response already supports profile page:
```json
{
  "memory": "...",
  "user": "...",
  "memory_mtime": 1710000000000,
  "user_mtime": 1710000000000
}
```

### POST /api/memory
No contract change.
Use existing payload:
```json
{
  "section": "user",
  "content": "...markdown..."
}
```

### POST /api/skills/:category/:skill/files
New endpoint.
FormData:
- file: File
- targetDir: string

Success:
```json
{
  "file": {
    "path": "references/example.md",
    "name": "example.md"
  }
}
```

Conflict:
```json
{
  "error": "File already exists"
}
```

Invalid dir:
```json
{
  "error": "targetDir must be one of references, templates, scripts, assets"
}
```

---

## 10. Validation plan

### Build verification
Run in repo root:
```bash
npm run build
```
Expected:
- frontend types compile
- backend TS compiles
- no route/component import errors

### Dev verification
Run:
```bash
npm run dev
```

Check manually:
1. Sidebar contains Profile entry
2. Clicking Profile opens dedicated page
3. Existing profile content displays correctly
4. Edit/save on Profile persists after refresh
5. Memory page still works for notes
6. Skills page still loads existing skill details
7. Upload to `references` succeeds for a new filename
8. Uploaded file appears in attached files list
9. Upload same filename again returns readable error
10. Invalid target dir cannot be submitted from UI

### Suggested smoke upload files
Use small files only for v1 validation:
- `example.md`
- `prompt.txt`
- `schema.json`
- `snippet.py`

---

## 11. Risks and tradeoffs

### Risk 1: Manual multipart parsing is fragile
Current upload code is string-based and may be unsafe for some binary payloads.
Impact:
- some binary files may corrupt
- edge cases around filenames/encoding

Mitigation:
- position v1 as skill-supporting-file upload, primarily text assets
- keep future task to adopt proper multipart parser

### Risk 2: Duplicate profile editing surfaces
If `MemoryView.vue` retains full profile editing while `ProfileView.vue` is added, users may be confused.
Mitigation:
- make Profile the single edit surface for `user`

### Risk 3: Viewing uploaded files assumes text rendering
Current file viewer fetches file content as text.
Impact:
- binary files may not preview well

Mitigation:
- v1 can still store them, but UI should not promise full preview for all file types
- later add download/open behavior

### Risk 4: Hardcoded sidebar maintenance
`AppSidebar.vue` is currently manually authored. Adding more items will keep increasing duplication.
Mitigation:
- acceptable for this iteration
- future refactor can convert nav items to data-driven array

---

## 12. Follow-up backlog after v1

High-value next steps:
1. Delete / rename skill files
2. Inline text file editor for attached files
3. Download button for binary assets
4. `SKILL.md` editor with validation
5. Skill structure health checks
6. Profile summary card in Chat or home view
7. Diff / unsaved-changes warning for Profile and Memory
8. Replace manual multipart parsing with robust parser shared across upload routes

---

## 13. Recommended implementation owner split

Recommended协作链路:
- dd: implement frontend/backend changes and validation
- bb: refine page naming, helper copy, and IA labels if you want stronger product wording
- pp: package release notes / README / screenshots after feature lands
- zhengyang: only needed later if you want these features turned into ongoing personal workflow conventions

---

## 14. Minimal implementation checklist

Use this as the execution checklist:

- [ ] Add `profile` route
- [ ] Add Profile nav item in sidebar
- [ ] Create `ProfileView.vue`
- [ ] Remove duplicate profile editing from `MemoryView.vue`
- [ ] Add skill file upload API to `filesystem.ts`
- [ ] Add upload client to `src/api/skills.ts`
- [ ] Add upload controls to `SkillDetail.vue`
- [ ] Add i18n strings for profile/upload
- [ ] Run `npm run build`
- [ ] Manually verify upload + profile editing in `npm run dev`

---

## 15. My recommendation

If you only do one pass now, implement exactly this MVP:
- Profile as separate page
- Memory as notes-only page
- Skills upload only into `references/templates/scripts/assets`
- No overwrite, no delete, no rename

That gives you a clean information architecture improvement and a safe, useful first step toward real skill management, without turning this iteration into a file-manager rewrite.

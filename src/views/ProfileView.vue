<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { NButton, useMessage } from 'naive-ui'
import { useI18n } from 'vue-i18n'
import MarkdownRenderer from '@/components/chat/MarkdownRenderer.vue'
import {
  fetchMemory,
  fetchProfileRoles,
  saveMemory,
  saveProfileRoles,
  type MemoryData,
  type ProfileRole,
  type ProfileRolesData,
} from '@/api/skills'

const { t } = useI18n()
const message = useMessage()

const loading = ref(false)
const savingProfile = ref(false)
const savingRoles = ref(false)
const editingUserRaw = ref(false)
const editingRolesRaw = ref(false)
const data = ref<MemoryData | null>(null)
const roleData = ref<ProfileRolesData | null>(null)
const userEditContent = ref('')
const rolesEditContent = ref('')
const selectedRoleId = ref('dd')

onMounted(loadProfile)

watch(roleData, value => {
  const roles = value?.roles || []
  if (!roles.length) return
  if (!roles.some(role => role.id === selectedRoleId.value)) {
    selectedRoleId.value = roles[0].id
  }
})

async function loadProfile() {
  loading.value = true
  try {
    const [memory, roles] = await Promise.all([fetchMemory(), fetchProfileRoles()])
    data.value = memory
    roleData.value = roles
  } catch (err: any) {
    console.error('Failed to load profile:', err)
    message.error(t('profile.loadFailed'))
  } finally {
    loading.value = false
  }
}

function startUserEdit() {
  editingRolesRaw.value = false
  editingUserRaw.value = true
  userEditContent.value = data.value?.user || ''
}

function startRolesEdit() {
  editingUserRaw.value = false
  editingRolesRaw.value = true
  rolesEditContent.value = JSON.stringify({ roles: roleData.value?.roles || [] }, null, 2)
}

function cancelEdit() {
  editingUserRaw.value = false
  editingRolesRaw.value = false
  userEditContent.value = ''
  rolesEditContent.value = ''
}

async function handleUserSave() {
  savingProfile.value = true
  try {
    await saveMemory('user', userEditContent.value)
    await loadProfile()
    cancelEdit()
    message.success(t('common.saved'))
  } catch (err: any) {
    message.error(`${t('profile.saveFailed')}: ${err.message}`)
  } finally {
    savingProfile.value = false
  }
}

async function handleRolesSave() {
  savingRoles.value = true
  try {
    const parsed = JSON.parse(rolesEditContent.value) as { roles?: ProfileRole[] }
    await saveProfileRoles(Array.isArray(parsed.roles) ? parsed.roles : [])
    await loadProfile()
    cancelEdit()
    message.success(t('common.saved'))
  } catch (err: any) {
    message.error(`${t('profile.roleConfigSaveFailed')}: ${err.message}`)
  } finally {
    savingRoles.value = false
  }
}

function formatTime(ts: number | null): string {
  if (!ts) return ''
  return new Date(ts).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const roles = computed(() => roleData.value?.roles || [])
const activeRole = computed(() => roles.value.find(role => role.id === selectedRoleId.value) || roles.value[0] || null)
const profileEmpty = computed(() => !data.value?.user?.trim())
const displayProfile = computed(() => (data.value?.user || '').replace(/§/g, '\n\n'))
const roleSourceLabel = computed(() => roleData.value?.source === 'file' ? t('profile.roleConfigSourceFile') : t('profile.roleConfigSourceDefault'))
</script>

<template>
  <div class="profile-view">
    <header class="profile-header">
      <div>
        <h2 class="header-title">{{ t('profile.title') }}</h2>
        <p class="header-description">{{ t('profile.description') }}</p>
      </div>
      <div class="header-actions">
        <NButton size="small" quaternary @click="loadProfile">
          <template #icon>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
          </template>
          {{ t('profile.refresh') }}
        </NButton>
        <NButton v-if="!editingUserRaw && !editingRolesRaw" size="small" @click="startRolesEdit">
          {{ t('profile.editRolesConfig') }}
        </NButton>
        <NButton v-if="!editingUserRaw && !editingRolesRaw" size="small" type="primary" @click="startUserEdit">
          {{ t('profile.editRaw') }}
        </NButton>
      </div>
    </header>

    <div class="profile-content">
      <div v-if="loading && !data" class="profile-loading">{{ t('common.loading') }}</div>

      <template v-else>
        <div v-if="editingUserRaw" class="profile-card raw-editor-card">
          <div class="card-header">
            <div class="section-title-row">
              <span class="section-title">{{ t('profile.rawProfile') }}</span>
              <span v-if="data?.user_mtime" class="section-mtime">{{ formatTime(data.user_mtime) }}</span>
            </div>
          </div>

          <div class="section-edit">
            <textarea
              v-model="userEditContent"
              class="edit-textarea"
              :placeholder="t('profile.profilePlaceholder')"
              spellcheck="false"
            ></textarea>
            <div class="edit-actions">
              <NButton size="small" @click="cancelEdit">{{ t('common.cancel') }}</NButton>
              <NButton size="small" type="primary" :loading="savingProfile" @click="handleUserSave">{{ t('common.save') }}</NButton>
            </div>
          </div>
        </div>

        <div v-else-if="editingRolesRaw" class="profile-card raw-editor-card">
          <div class="card-header">
            <div class="section-title-row">
              <span class="section-title">{{ t('profile.rawRolesConfig') }}</span>
              <span class="source-pill">{{ roleSourceLabel }}</span>
              <span v-if="roleData?.mtime" class="section-mtime">{{ formatTime(roleData.mtime) }}</span>
            </div>
          </div>

          <div class="section-edit">
            <textarea
              v-model="rolesEditContent"
              class="edit-textarea"
              :placeholder="t('profile.rolesConfigPlaceholder')"
              spellcheck="false"
            ></textarea>
            <div class="edit-help">{{ t('profile.rolesConfigHelp') }}</div>
            <div class="edit-actions">
              <NButton size="small" @click="cancelEdit">{{ t('common.cancel') }}</NButton>
              <NButton size="small" type="primary" :loading="savingRoles" @click="handleRolesSave">{{ t('common.save') }}</NButton>
            </div>
          </div>
        </div>

        <template v-else>
          <div class="profile-layout">
            <aside class="profile-card roles-card">
              <div class="card-header card-header-stack">
                <div class="section-title-row">
                  <span class="section-title">{{ t('profile.rolesTitle') }}</span>
                </div>
                <div class="roles-meta-row">
                  <span class="source-pill">{{ roleSourceLabel }}</span>
                  <span v-if="roleData?.mtime" class="section-mtime">{{ formatTime(roleData.mtime) }}</span>
                </div>
              </div>

              <div class="roles-list">
                <button
                  v-for="role in roles"
                  :key="role.id"
                  class="role-tab"
                  :class="{ active: role.id === selectedRoleId }"
                  @click="selectedRoleId = role.id"
                >
                  <span class="role-name">{{ role.name }}</span>
                  <span class="role-title">{{ role.title }}</span>
                </button>
              </div>
            </aside>

            <section class="profile-card role-detail-card">
              <div v-if="activeRole" class="card-header role-detail-header">
                <div class="section-title-row role-heading">
                  <span class="role-badge">{{ activeRole.name }}</span>
                  <div>
                    <div class="section-title">{{ activeRole.title }}</div>
                    <div class="role-summary">{{ activeRole.summary }}</div>
                  </div>
                </div>
              </div>

              <div v-if="activeRole" class="role-detail-body">
                <div class="info-block">
                  <div class="info-title">{{ t('profile.primaryUseCases') }}</div>
                  <ul>
                    <li v-for="item in activeRole.primaryUseCases" :key="item">{{ item }}</li>
                  </ul>
                </div>

                <div class="info-block">
                  <div class="info-title">{{ t('profile.responsibilities') }}</div>
                  <ul>
                    <li v-for="item in activeRole.responsibilities" :key="item">{{ item }}</li>
                  </ul>
                </div>

                <div class="info-block">
                  <div class="info-title">{{ t('profile.boundaries') }}</div>
                  <ul>
                    <li v-for="item in activeRole.boundaries" :key="item">{{ item }}</li>
                  </ul>
                </div>

                <div class="next-step-tip">{{ activeRole.nextStep }}</div>
              </div>

              <div v-else class="empty-role-state">{{ t('profile.noRoles') }}</div>
            </section>
          </div>

          <div class="profile-card user-notes-card">
            <div class="card-header">
              <div class="section-title-row">
                <span class="section-title">{{ t('profile.userPreferences') }}</span>
                <span v-if="data?.user_mtime" class="section-mtime">{{ formatTime(data.user_mtime) }}</span>
              </div>
            </div>

            <div class="card-body">
              <MarkdownRenderer v-if="!profileEmpty" :content="displayProfile" />
              <p v-else class="empty-text">{{ t('profile.noProfile') }}</p>
            </div>
          </div>
        </template>
      </template>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.profile-view {
  height: 100vh;
  display: flex;
  flex-direction: column;
}

.profile-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 20px;
  border-bottom: 1px solid $border-color;
  flex-shrink: 0;
}

.header-title {
  font-size: 16px;
  font-weight: 600;
  color: $text-primary;
}

.header-description {
  margin-top: 4px;
  font-size: 13px;
  color: $text-muted;
}

.header-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.profile-content {
  flex: 1;
  overflow: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.profile-loading,
.empty-role-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  color: $text-muted;
}

.profile-layout {
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);
  gap: 16px;
  min-height: 420px;
}

.profile-card {
  border: 1px solid $border-color;
  border-radius: $radius-md;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: $bg-primary;
}

.roles-card,
.role-detail-card {
  min-height: 420px;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  background: $bg-secondary;
  border-bottom: 1px solid $border-color;
  flex-shrink: 0;
}

.card-header-stack {
  align-items: flex-start;
  flex-direction: column;
  gap: 8px;
}

.section-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  color: $text-primary;
}

.section-mtime {
  font-size: 11px;
  color: $text-muted;
}

.roles-meta-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.source-pill {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba($accent-primary, 0.08);
  color: $accent-primary;
  font-size: 11px;
  font-weight: 600;
}

.roles-list {
  display: flex;
  flex-direction: column;
  padding: 10px;
  gap: 8px;
}

.role-tab {
  text-align: left;
  border: 1px solid $border-color;
  border-radius: $radius-sm;
  background: $bg-secondary;
  padding: 12px;
  cursor: pointer;
  transition: all $transition-fast;
}

.role-tab:hover {
  border-color: rgba($accent-primary, 0.45);
}

.role-tab.active {
  border-color: $accent-primary;
  background: rgba($accent-primary, 0.08);
}

.role-name {
  display: block;
  font-size: 13px;
  font-weight: 700;
  color: $text-primary;
}

.role-title {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  color: $text-muted;
}

.role-detail-header,
.role-heading {
  align-items: flex-start;
}

.role-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 44px;
  height: 24px;
  padding: 0 10px;
  border-radius: 999px;
  background: rgba($accent-primary, 0.12);
  color: $accent-primary;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
}

.role-summary {
  margin-top: 4px;
  font-size: 13px;
  color: $text-muted;
  line-height: 1.6;
}

.role-detail-body {
  padding: 16px;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.info-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.info-title {
  font-size: 13px;
  font-weight: 600;
  color: $text-primary;
}

.info-block ul {
  margin: 0;
  padding-left: 18px;
  color: $text-secondary;
  font-size: 13px;
  line-height: 1.7;
}

.next-step-tip {
  padding: 12px 14px;
  border-radius: $radius-sm;
  background: rgba($accent-primary, 0.08);
  color: $text-primary;
  font-size: 13px;
  line-height: 1.6;
}

.user-notes-card {
  min-height: 240px;
}

.card-body {
  flex: 1;
  overflow: auto;
  padding: 16px;
  min-height: 0;
}

.empty-text,
.edit-help {
  color: $text-muted;
  font-size: 12px;
  line-height: 1.6;
}

.raw-editor-card {
  flex: 1;
  min-height: 0;
}

.section-edit {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  min-height: 0;
}

.edit-textarea {
  flex: 1;
  min-height: 320px;
  width: 100%;
  resize: none;
  border: 1px solid $border-color;
  border-radius: $radius-sm;
  padding: 12px;
  font-size: 13px;
  line-height: 1.6;
  font-family: $font-code;
  background: $bg-input;
  color: $text-primary;
  outline: none;
}

.edit-textarea:focus {
  border-color: $accent-primary;
}

.edit-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

@media (max-width: 980px) {
  .profile-layout {
    grid-template-columns: 1fr;
  }
}
</style>

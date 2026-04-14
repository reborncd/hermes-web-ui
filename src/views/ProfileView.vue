<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { NButton, useMessage } from 'naive-ui'
import { useI18n } from 'vue-i18n'
import MarkdownRenderer from '@/components/chat/MarkdownRenderer.vue'
import { fetchMemory, saveMemory, type MemoryData } from '@/api/skills'

const { t } = useI18n()
const message = useMessage()

const loading = ref(false)
const saving = ref(false)
const editing = ref(false)
const data = ref<MemoryData | null>(null)
const editContent = ref('')

onMounted(loadProfile)

async function loadProfile() {
  loading.value = true
  try {
    data.value = await fetchMemory()
  } catch (err: any) {
    console.error('Failed to load profile:', err)
    message.error(t('profile.loadFailed'))
  } finally {
    loading.value = false
  }
}

function startEdit() {
  editing.value = true
  editContent.value = data.value?.user || ''
}

function cancelEdit() {
  editing.value = false
  editContent.value = ''
}

async function handleSave() {
  saving.value = true
  try {
    await saveMemory('user', editContent.value)
    await loadProfile()
    editing.value = false
    editContent.value = ''
    message.success(t('common.saved'))
  } catch (err: any) {
    message.error(`${t('profile.saveFailed')}: ${err.message}`)
  } finally {
    saving.value = false
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

const profileEmpty = computed(() => !data.value?.user?.trim())
const displayProfile = computed(() => (data.value?.user || '').replace(/§/g, '\n\n'))
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
        <NButton v-if="!editing" size="small" type="primary" @click="startEdit">
          <template #icon>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </template>
          {{ t('common.edit') }}
        </NButton>
      </div>
    </header>

    <div class="profile-content">
      <div v-if="loading && !data" class="profile-loading">{{ t('common.loading') }}</div>
      <div v-else class="profile-card">
        <div class="card-header">
          <div class="section-title-row">
            <span class="section-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </span>
            <span class="section-title">{{ t('memory.userProfile') }}</span>
            <span v-if="data?.user_mtime" class="section-mtime">{{ formatTime(data.user_mtime) }}</span>
          </div>
        </div>

        <div v-if="!editing" class="card-body">
          <MarkdownRenderer v-if="!profileEmpty" :content="displayProfile" />
          <p v-else class="empty-text">{{ t('profile.noProfile') }}</p>
        </div>

        <div v-else class="section-edit">
          <textarea
            v-model="editContent"
            class="edit-textarea"
            :placeholder="t('profile.profilePlaceholder')"
            spellcheck="false"
          ></textarea>
          <div class="edit-actions">
            <NButton size="small" @click="cancelEdit">{{ t('common.cancel') }}</NButton>
            <NButton size="small" type="primary" :loading="saving" @click="handleSave">{{ t('common.save') }}</NButton>
          </div>
        </div>
      </div>
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
}

.profile-content {
  flex: 1;
  overflow: hidden;
  padding: 20px;
  display: flex;
  flex-direction: column;
}

.profile-loading {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  color: $text-muted;
}

.profile-card {
  flex: 1;
  min-height: 0;
  border: 1px solid $border-color;
  border-radius: $radius-md;
  overflow: hidden;
  display: flex;
  flex-direction: column;
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

.section-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.section-icon {
  color: $text-secondary;
  display: flex;
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

.card-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  min-height: 0;
}

.empty-text {
  color: $text-muted;
  font-style: italic;
  font-size: 13px;
}

.section-edit {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 12px 16px;
  min-height: 0;
}

.edit-textarea {
  flex: 1;
  width: 100%;
  min-height: 0;
  padding: 12px;
  border: 1px solid $border-color;
  border-radius: $radius-sm;
  background: $bg-input;
  color: $text-primary;
  font-family: $font-code;
  font-size: 13px;
  line-height: 1.6;
  resize: none;
  outline: none;

  &:focus {
    border-color: $accent-primary;
  }
}

.edit-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 12px;
}
</style>

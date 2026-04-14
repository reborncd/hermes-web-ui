<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { NButton, NUpload, useMessage, type UploadCustomRequestOptions } from 'naive-ui'
import MarkdownRenderer from '@/components/chat/MarkdownRenderer.vue'
import { fetchSkillContent, fetchSkillFiles, uploadSkillFile, type SkillFileEntry } from '@/api/skills'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const message = useMessage()

const props = defineProps<{
  category: string
  skill: string
}>()

const content = ref('')
const files = ref<SkillFileEntry[]>([])
const loading = ref(false)
const fileContent = ref('')
const viewingFile = ref<string | null>(null)
const fileLoading = ref(false)
const uploading = ref(false)

const skillBasePath = computed(() => `${props.category}/${props.skill}`)

async function loadSkill() {
  loading.value = true
  viewingFile.value = null
  fileContent.value = ''
  files.value = []
  content.value = ''

  try {
    const [skillContent, skillFiles] = await Promise.all([
      fetchSkillContent(`${skillBasePath.value}/SKILL.md`),
      fetchSkillFiles(props.category, props.skill),
    ])
    content.value = skillContent
    files.value = skillFiles.filter(f => !f.isDir && f.path !== 'SKILL.md')
  } catch (err: any) {
    content.value = `${t('skills.loadFailed')}: ${err.message}`
  } finally {
    loading.value = false
  }
}

async function viewFile(filePath: string) {
  fileLoading.value = true
  viewingFile.value = filePath
  try {
    fileContent.value = await fetchSkillContent(`${skillBasePath.value}/${filePath}`)
  } catch (err: any) {
    fileContent.value = `${t('skills.fileLoadFailed')}: ${err.message}`
  } finally {
    fileLoading.value = false
  }
}

function backToSkill() {
  viewingFile.value = null
  fileContent.value = ''
}

async function handleUpload(options: UploadCustomRequestOptions) {
  const rawFile = options.file.file
  if (!(rawFile instanceof File)) {
    const error = new Error('Invalid upload file')
    options.onError()
    message.error(error.message)
    return
  }

  uploading.value = true
  try {
    const uploaded = await uploadSkillFile(props.category, props.skill, rawFile)
    const attachmentPath = uploaded.path
    const alreadyExists = files.value.some(file => file.path === attachmentPath)
    if (!alreadyExists) {
      files.value = [...files.value, { path: attachmentPath, name: uploaded.name, isDir: false }]
        .sort((a, b) => a.path.localeCompare(b.path))
    }
    options.onFinish()
    message.success(t('skills.uploadSuccess', { name: uploaded.name }))
    await viewFile(attachmentPath)
  } catch (err: any) {
    options.onError()
    message.error(`${t('skills.uploadFailed')}: ${err.message}`)
  } finally {
    uploading.value = false
  }
}

watch(() => `${props.category}/${props.skill}`, loadSkill, { immediate: true })
</script>

<template>
  <div class="skill-detail">
    <div class="detail-header">
      <div class="detail-title">
        <span class="detail-category">{{ category }}</span>
        <span class="detail-separator">/</span>
        <span class="detail-name">{{ skill }}</span>
      </div>
      <NUpload
        :custom-request="handleUpload"
        :default-upload="false"
        :show-file-list="false"
        accept="image/*,.md,.txt,.json,.yaml,.yml,.csv,.pdf"
      >
        <NButton size="small" :loading="uploading">{{ t('skills.uploadFile') }}</NButton>
      </NUpload>
    </div>

    <div v-if="loading && !content" class="detail-loading">{{ t('common.loading') }}</div>

    <template v-else>
      <div v-if="viewingFile" class="detail-breadcrumb">
        <button class="back-btn" @click="backToSkill">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          {{ t('skills.backTo') }} {{ skill }}
        </button>
        <span class="breadcrumb-path">{{ viewingFile }}</span>
      </div>

      <div class="detail-content">
        <div v-if="fileLoading" class="detail-loading">{{ t('common.loading') }}</div>
        <MarkdownRenderer v-else-if="viewingFile" :content="fileContent" />
        <MarkdownRenderer v-else :content="content" />
      </div>

      <div v-if="!viewingFile && files.length > 0" class="detail-files">
        <div class="files-header">{{ t('skills.attachedFiles') }}</div>
        <div class="files-list">
          <button
            v-for="f in files"
            :key="f.path"
            class="file-item"
            @click="viewFile(f.path)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            <span>{{ f.path }}</span>
          </button>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.skill-detail {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.detail-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-shrink: 0;
  padding-bottom: 12px;
  border-bottom: 1px solid $border-color;
  margin-bottom: 12px;
}

.detail-title {
  font-size: 15px;
}

.detail-category {
  color: $text-muted;
  font-size: 13px;
}

.detail-separator {
  color: $text-muted;
  margin: 0 6px;
}

.detail-name {
  color: $text-primary;
  font-weight: 600;
}

.detail-loading {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  color: $text-muted;
}

.detail-breadcrumb {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0 12px;
  border-bottom: 1px solid $border-color;
  margin-bottom: 12px;
  flex-shrink: 0;
}

.back-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  border: none;
  background: none;
  color: $accent-primary;
  font-size: 13px;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;

  &:hover {
    background: rgba($accent-primary, 0.06);
  }
}

.breadcrumb-path {
  font-size: 13px;
  color: $text-muted;
}

.detail-content {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
  padding-bottom: 12px;

  :deep(hr) {
    border: none;
    margin: 12px 0;
  }
}

.detail-files {
  flex-shrink: 0;
  border-top: 1px solid $border-color;
  padding-top: 12px;
  margin-top: 12px;
}

.files-header {
  font-size: 12px;
  font-weight: 600;
  color: $text-muted;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  margin-bottom: 6px;
}

.files-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.file-item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border: 1px solid $border-color;
  border-radius: $radius-sm;
  background: $bg-secondary;
  color: $text-secondary;
  font-size: 12px;
  cursor: pointer;
  transition: all $transition-fast;

  &:hover {
    border-color: $accent-primary;
    color: $accent-primary;
  }
}
</style>

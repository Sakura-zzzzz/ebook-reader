<script setup>
import { onMounted, ref } from 'vue'
import { addBook, listBooks } from '../db'

const emit = defineEmits(['open'])

const books = ref([])
const loading = ref(true)
const importing = ref(false)
const message = ref('')

async function refresh () {
  books.value = await listBooks()
}

async function importBook () {
  if (importing.value) return

  // preload 没注入成功时给出明确提示，而不是静默失败
  if (!window.ebookAPI) {
    message.value = '初始化失败：未找到主进程接口，请重启应用'
    return
  }

  importing.value = true
  message.value = ''
  try {
    const result = await window.ebookAPI.pickTxtFile()
    if (result.status === 'canceled') return
    if (result.status === 'error') {
      message.value = result.message
      return
    }
    if (!result.content || !result.content.trim()) {
      message.value = '这个 TXT 文件没有文本内容'
      return
    }

    await addBook({
      title: result.title,
      fileName: result.fileName,
      content: result.content
    })
    await refresh()
  } catch (error) {
    message.value = `导入失败：${error.message}`
  } finally {
    importing.value = false
  }
}

function progressPercent (book) {
  const value = book.progress || 0
  return Math.round(Math.min(1, Math.max(0, value)) * 100)
}

function progressLabel (book) {
  if (!book.progress) return '未开始阅读'
  return `已读 ${progressPercent(book)}%`
}

function wordCountLabel (book) {
  const length = book.length || 0
  if (length >= 10000) return `${(length / 10000).toFixed(1)} 万字`
  return `${length} 字`
}

onMounted(async () => {
  try {
    await refresh()
  } catch (error) {
    message.value = `读取书架失败：${error.message}`
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="shelf">
    <header class="shelf-head">
      <div>
        <h1 class="shelf-title">我的书架</h1>
        <p class="shelf-sub">共 {{ books.length }} 本书 · 数据保存在本机</p>
      </div>
      <button class="btn btn-primary" :disabled="importing" @click="importBook">
        {{ importing ? '导入中…' : '导入 TXT' }}
      </button>
    </header>

    <p v-if="message" class="shelf-message">{{ message }}</p>

    <div v-if="loading" class="shelf-empty">正在加载…</div>

    <div v-else-if="books.length === 0" class="shelf-empty">
      <p>书架还是空的</p>
      <p class="shelf-empty-tip">点击右上角「导入 TXT」选择本地 .txt 电子书</p>
    </div>

    <div v-else class="shelf-grid">
      <button
        v-for="book in books"
        :key="book.id"
        class="book-card"
        @click="emit('open', book)"
      >
        <span class="book-title title-ellipsis">{{ book.title }}</span>
        <span class="book-meta">{{ wordCountLabel(book) }} · {{ progressLabel(book) }}</span>
        <span class="book-bar">
          <span class="book-bar-fill" :style="{ width: `${progressPercent(book)}%` }"></span>
        </span>
        <span v-if="book.lastPage > 1 && book.totalPages" class="book-page">
          上次读到第 {{ book.lastPage }} / {{ book.totalPages }} 页
        </span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.shelf {
  height: 100%;
  padding: 28px 32px;
  overflow-y: auto;
}

.shelf-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding-bottom: 18px;
  border-bottom: 1px solid var(--color-line);
}

.shelf-title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
}

.shelf-sub {
  margin: 6px 0 0;
  color: var(--color-text-soft);
  font-size: 12px;
}

.shelf-message {
  margin: 14px 0 0;
  padding: 10px 12px;
  border: 1px solid var(--color-line);
  border-radius: 6px;
  background: var(--color-bg-soft);
  color: #b00020;
  font-size: 13px;
}

.shelf-empty {
  margin-top: 80px;
  color: var(--color-text-soft);
  text-align: center;
  font-size: 14px;
}

.shelf-empty-tip {
  margin-top: 8px;
  font-size: 12px;
}

.shelf-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
  gap: 14px;
  margin-top: 20px;
}

.book-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px;
  border: 1px solid var(--color-line);
  border-radius: 8px;
  background: var(--color-bg);
  color: inherit;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
}

.book-card:hover {
  border-color: #c8c8c8;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.06);
}

.book-title {
  font-size: 15px;
  font-weight: 600;
}

.book-meta {
  color: var(--color-text-soft);
  font-size: 12px;
}

.book-bar {
  display: block;
  height: 4px;
  border-radius: 2px;
  background: #ededed;
  overflow: hidden;
}

.book-bar-fill {
  display: block;
  height: 100%;
  background: #1a1a1a;
}

.book-page {
  color: var(--color-text-soft);
  font-size: 11px;
}
</style>

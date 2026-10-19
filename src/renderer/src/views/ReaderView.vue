<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  DEFAULT_FONT_SIZE,
  SETTING_FONT_SIZE,
  getBookText,
  getSetting,
  setSetting,
  updateProgress
} from '../db'
import { findPageIndex, paginateText } from '../paginate'

const props = defineProps({
  book: { type: Object, required: true }
})
const emit = defineEmits(['back'])

const FONT_MIN = 14
const FONT_MAX = 40
const FONT_STEP = 2
const SAVE_DELAY = 300

const pageFrame = ref(null) // 每页可视区域，分页时用它量可用宽高
const pageText = ref(null) // 可见正文元素，分页时复制它的排版样式
const text = ref('')
const starts = ref([0]) // 每页起始字符下标，长度 = 页数 + 1
const currentPage = ref(0)
const fontSize = ref(DEFAULT_FONT_SIZE)
const loading = ref(true) // 首次打开：读正文
const paginating = ref(false) // 分页 / 重排中
const paginateRatio = ref(0)
const message = ref('')

let saveTimer = null
let resizeTimer = null
let controller = null

const totalPages = computed(() => Math.max(1, starts.value.length - 1))
const pageContent = computed(() => {
  const from = starts.value[currentPage.value] ?? 0
  const to = starts.value[currentPage.value + 1] ?? from
  return text.value.slice(from, to)
})
const pagePercent = computed(() => Math.round(((currentPage.value + 1) / totalPages.value) * 100))
const busy = computed(() => loading.value || paginating.value)

/** 当前页起始字符下标，作为阅读位置的稳定锚点 */
function currentOffset () {
  return starts.value[currentPage.value] ?? 0
}

/**
 * 分页（首次打开、改字号、改窗口大小都走这里）。
 * anchorOffset 是重排前的位置，重排后二分定位回这一页，避免字号一变就跳页。
 */
async function runPagination (anchorOffset) {
  // 上一次分页还在跑就直接取消，避免旧结果覆盖新结果
  if (controller) controller.abort()
  const current = new AbortController()
  controller = current

  try {
    // 等 DOM 排版完成再测量：窗口刚创建时可能还没完成布局，量到的宽高会是 0
    await nextTick()
    for (let attempt = 0; attempt < 10; attempt++) {
      if (current.signal.aborted) return
      if (pageFrame.value && pageFrame.value.clientWidth > 0 && pageFrame.value.clientHeight > 0) break
      await nextTick()
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    if (current.signal.aborted || !pageFrame.value || !pageText.value) return

    paginating.value = true
    paginateRatio.value = 0

    const next = await paginateText({
      text: text.value,
      frame: pageFrame.value,
      template: pageText.value,
      signal: current.signal,
      onProgress: (ratio) => { paginateRatio.value = ratio }
    })
    if (current.signal.aborted) return

    starts.value = next
    currentPage.value = findPageIndex(next, anchorOffset)
  } catch (error) {
    if (error.name !== 'AbortError') {
      message.value = `分页失败：${error.message}`
    }
  } finally {
    // 只有自己还是「最新一次分页」时才复位状态
    if (controller === current) {
      paginating.value = false
      controller = null
    }
  }
}

/** 翻页时自动保存进度：300ms 防抖，避免连续翻页频繁写库 */
function scheduleSave () {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(saveProgress, SAVE_DELAY)
}

async function saveProgress () {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  if (!text.value || starts.value.length <= 1) return
  try {
    await updateProgress(props.book.id, {
      charOffset: currentOffset(),
      lastPage: currentPage.value + 1,
      totalPages: totalPages.value,
      progress: (currentPage.value + 1) / totalPages.value
    })
  } catch {
    // 保存失败不影响继续阅读
  }
}

function goToPage (target) {
  const page = Math.min(totalPages.value - 1, Math.max(0, target))
  if (page === currentPage.value) return
  currentPage.value = page
  scheduleSave()
}

function prevPage () {
  goToPage(currentPage.value - 1)
}

function nextPage () {
  goToPage(currentPage.value + 1)
}

/** 改字号：记住当前位置，重排后回到原来的文字处 */
async function changeFontSize (delta) {
  const next = Math.min(FONT_MAX, Math.max(FONT_MIN, fontSize.value + delta))
  if (next === fontSize.value) return

  const anchor = currentOffset()
  fontSize.value = next
  await setSetting(SETTING_FONT_SIZE, next)
  await runPagination(anchor)
}

async function goBack () {
  await saveProgress()
  emit('back')
}

/** 窗口大小变化会改变每页容量，防抖后重新分页 */
function onResize () {
  if (resizeTimer) clearTimeout(resizeTimer)
  resizeTimer = setTimeout(() => {
    if (text.value) runPagination(currentOffset())
  }, SAVE_DELAY)
}

onMounted(async () => {
  window.addEventListener('resize', onResize)
  // 关闭程序时尽力保存一次（翻页时已经保存过，这里只是兜底）
  window.addEventListener('beforeunload', saveProgress)

  try {
    fontSize.value = await getSetting(SETTING_FONT_SIZE, DEFAULT_FONT_SIZE)
    text.value = await getBookText(props.book.id)
    if (!text.value) {
      message.value = '这本书的正文内容丢失了，请重新导入'
      return
    }
    // 打开书籍自动跳到上次阅读位置
    await runPagination(props.book.charOffset || 0)
  } catch (error) {
    message.value = `打开书籍失败：${error.message}`
  } finally {
    loading.value = false
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize)
  window.removeEventListener('beforeunload', saveProgress)
  if (resizeTimer) clearTimeout(resizeTimer)
  if (controller) controller.abort()
  saveProgress()
})
</script>

<template>
  <div class="reader" :style="{ '--reader-font-size': `${fontSize}px` }">
    <header class="reader-bar">
      <button class="btn" @click="goBack">← 书架</button>
      <span class="reader-title title-ellipsis">{{ book.title }}</span>
      <span class="reader-font">
        <button class="btn font-btn" :disabled="busy || fontSize <= FONT_MIN" @click="changeFontSize(-FONT_STEP)">A-</button>
        <span class="font-value">{{ fontSize }}</span>
        <button class="btn font-btn" :disabled="busy || fontSize >= FONT_MAX" @click="changeFontSize(FONT_STEP)">A+</button>
      </span>
    </header>

    <p v-if="message" class="reader-message">{{ message }}</p>

    <div class="page-frame">
      <div ref="pageFrame" class="page-box">
        <div ref="pageText" class="page-text">{{ pageContent }}</div>
      </div>
      <div v-if="busy" class="page-mask">
        {{ loading ? '正在打开…' : `正在分页 ${Math.round(paginateRatio * 100)}%` }}
      </div>
    </div>

    <footer class="reader-foot">
      <button class="btn" :disabled="busy || currentPage === 0" @click="prevPage">上一页</button>
      <span class="reader-status">
        第 {{ currentPage + 1 }} / {{ totalPages }} 页 · {{ pagePercent }}%
      </span>
      <button class="btn" :disabled="busy || currentPage >= totalPages - 1" @click="nextPage">下一页</button>
    </footer>
  </div>
</template>

<style scoped>
.reader {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-bg);
}

.reader-bar,
.reader-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex: none;
  padding: 10px 20px;
  border-bottom: 1px solid var(--color-line);
}

.reader-foot {
  border-bottom: none;
  border-top: 1px solid var(--color-line);
}

.reader-title {
  flex: 1;
  min-width: 0;
  text-align: center;
  font-size: 14px;
  font-weight: 600;
}

.reader-font {
  display: flex;
  align-items: center;
  gap: 8px;
}

.font-btn {
  min-width: 42px;
  padding: 0 8px;
}

.font-value {
  min-width: 24px;
  text-align: center;
  color: var(--color-text-soft);
  font-size: 12px;
}

.reader-message {
  flex: none;
  margin: 12px 20px 0;
  padding: 10px 12px;
  border: 1px solid var(--color-line);
  border-radius: 6px;
  background: var(--color-bg-soft);
  color: #b00020;
  font-size: 13px;
}

.page-frame {
  position: relative;
  flex: 1;
  min-height: 0;
  padding: 24px 36px;
}

/* 每页可视区域：分页算法按这个盒子的宽高实测 */
.page-box {
  position: relative;
  height: 100%;
  overflow: hidden;
}

.page-text {
  position: absolute;
  inset: 0;
  font-size: var(--reader-font-size);
  line-height: 1.8;
  white-space: pre-wrap; /* 保留 TXT 里的换行和段首缩进 */
  word-break: break-word;
  overflow-wrap: break-word;
}

.page-mask {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.88);
  color: var(--color-text-soft);
  font-size: 13px;
}

.reader-status {
  color: var(--color-text-soft);
  font-size: 12px;
}
</style>

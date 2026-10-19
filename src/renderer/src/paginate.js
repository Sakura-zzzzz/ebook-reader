/**
 * 按可视区域实测分页。
 *
 * 思路：创建一个和阅读区排版完全一致的隐藏镜像元素，把候选文本塞进去量 scrollHeight，
 * 溢出就缩短、留白就加长，从而得到每页的字符边界。相比「固定每页多少字」，
 * 页尾不会留大片空白，字号变化后重新分页也不会错位。
 *
 * 返回 starts 数组：starts[i] 是第 i 页的起始字符下标，starts[pages] === text.length。
 * 第 i 页正文 = text.slice(starts[i], starts[i + 1])。
 */

// 影响换行的排版属性，从可见元素复制到镜像元素，保证测量结果和真实渲染一致
const COPY_PROPS = [
  'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'lineHeight',
  'letterSpacing', 'wordSpacing', 'textIndent', 'textAlign', 'whiteSpace',
  'wordBreak', 'overflowWrap', 'tabSize', 'boxSizing', 'padding', 'margin', 'border'
]

function createMirror (template, width, height) {
  const computed = getComputedStyle(template)
  const mirror = document.createElement('div')
  mirror.setAttribute('aria-hidden', 'true')
  const style = mirror.style
  style.position = 'fixed'
  style.left = '-100000px'
  style.top = '0'
  style.visibility = 'hidden'
  style.pointerEvents = 'none'
  style.overflow = 'hidden'
  style.width = `${width}px`
  style.height = `${height}px`
  for (const prop of COPY_PROPS) style[prop] = computed[prop]
  document.body.appendChild(mirror)
  return mirror
}

function isWordChar (char) {
  return char !== undefined && /[A-Za-z0-9]/.test(char)
}

/**
 * 断点如果落在英文单词中间，回退到最近的空白处。
 * 只会让当前页变短，因此不会破坏「这一页放得下」的前提。
 */
function adjustBreak (text, start, len) {
  const end = start + len
  if (end >= text.length) return len
  if (!isWordChar(text[end]) || !isWordChar(text[end - 1])) return len

  const floor = start + Math.max(1, Math.floor(len * 0.85))
  for (let i = end; i > floor; i--) {
    const char = text[i - 1]
    if (char === ' ' || char === '\n' || char === '\t') return i - start
  }
  return len
}

function yieldToUI () {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

/**
 * @param {object} options
 * @param {string} options.text      书籍全文
 * @param {HTMLElement} options.frame 阅读区容器（决定每页可用宽高）
 * @param {HTMLElement} options.template 可见正文元素，用于复制排版样式
 * @param {(ratio: number) => void} [options.onProgress] 分页进度回调
 * @param {AbortSignal} [options.signal] 中途重排（改字号、改窗口大小）时用来取消上一次分页
 */
export async function paginateText ({ text, frame, template, onProgress, signal }) {
  if (!text || !frame || !template) return [0]

  const width = frame.clientWidth
  const height = frame.clientHeight
  if (width <= 0 || height <= 0) return [0]

  const mirror = createMirror(template, width, height)
  const limit = mirror.clientHeight || height  // 每页可用高度
  const available = mirror.clientWidth || width  // 每行可用宽度
  const computed = getComputedStyle(mirror)
  const fontSize = parseFloat(computed.fontSize) || 16
  const lineHeight = parseFloat(computed.lineHeight) || fontSize * 1.8

  const starts = [0]

  const checkAbort = () => {
    if (signal && signal.aborted) {
      const error = new Error('分页已取消')
      error.name = 'AbortError'
      throw error
    }
  }

  const measure = (start, length) => {
    mirror.textContent = text.slice(start, start + length)
    return mirror.scrollHeight
  }

  try {
    // 首屏估算：每行字数 ≈ 可用宽度 / 字号，每页行数 ≈ 可用高度 / 行高
    let guess = Math.max(64, Math.floor((available / fontSize) * (limit / lineHeight)))
    let start = 0

    while (start < text.length) {
      checkAbort()

      const remaining = text.length - start
      let len = Math.min(guess, remaining)

      // 1. 比例逼近：按 可用高度 / 实际高度 直接缩放，通常 1~2 轮就收敛
      for (let round = 0; round < 4; round++) {
        const measured = measure(start, len)
        if (measured <= limit) break
        len = Math.max(1, Math.min(len - 1, Math.floor((len * limit) / measured) - 1))
      }
      // 极端情况：一行都放不下时兜底，保证每页至少 1 个字符，避免死循环
      if (measure(start, len) > limit) len = 1

      // 2. 还有超过一行的空白，就在 [len, len * 1.3] 内二分找当前页能容纳的最大长度
      if (limit - mirror.scrollHeight > lineHeight) {
        const hi = Math.min(remaining, Math.floor(len * 1.3) + 1)
        if (hi > len) {
          if (measure(start, hi) <= limit) {
            len = hi
          } else {
            let low = len
            let high = hi
            while (high - low > 1) {
              const mid = Math.floor((low + high) / 2)
              if (measure(start, mid) <= limit) low = mid
              else high = mid
            }
            len = low
          }
        }
      }

      len = adjustBreak(text, start, len)

      starts.push(start + len)
      start += len
      guess = len  // 下一页以本页长度作为起点，绝大多数页只需 1~2 次测量

      // 每 40 页让出一次主线程，避免大文件分页时界面无响应
      if (starts.length % 40 === 0) {
        if (onProgress) onProgress(Math.min(1, start / text.length))
        await yieldToUI()
      }
    }
  } finally {
    mirror.remove()
  }

  if (onProgress) onProgress(1)
  return starts
}

/**
 * 二分查找字符下标落在第几页（返回 0 起的页码下标）。
 * 阅读位置用字符下标记录，所以字号或窗口变化重排后依然能定位回原处。
 */
export function findPageIndex (starts, offset) {
  if (!starts || starts.length <= 1) return 0
  const lastPage = starts.length - 2
  if (offset <= 0) return 0
  if (offset >= starts[starts.length - 1]) return lastPage

  let low = 0
  let high = lastPage
  while (low < high) {
    const mid = Math.floor((low + high + 1) / 2)
    if (starts[mid] <= offset) low = mid
    else high = mid - 1
  }
  return low
}

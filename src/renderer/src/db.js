/**
 * IndexedDB 封装。
 * 三张表分工：
 *  - books    书籍元信息（不含正文），书架列表只读这张表，避免把每本书全文读进内存
 *  - texts    书籍正文全文，按 id 关联 books
 *  - settings 阅读器设置（当前只有字号）
 */
const DB_NAME = 'ebook-reader'
const DB_VERSION = 1

export const STORE_BOOKS = 'books'
export const STORE_TEXTS = 'texts'
export const STORE_SETTINGS = 'settings'

export const SETTING_FONT_SIZE = 'fontSize'
export const DEFAULT_FONT_SIZE = 20

let dbPromise = null

function openDB () {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_BOOKS)) {
        db.createObjectStore(STORE_BOOKS, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(STORE_TEXTS)) {
        db.createObjectStore(STORE_TEXTS, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
        db.createObjectStore(STORE_SETTINGS, { keyPath: 'key' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  return dbPromise
}

function runRequest (request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function runTransaction (tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

function newId () {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

/**
 * 新增一本书：元信息与正文一次事务写入，保证不会出现只有正文没有书目的半本书。
 */
export async function addBook ({ title, fileName, content }) {
  const db = await openDB()
  const now = Date.now()
  const book = {
    id: newId(),
    title: title || fileName || '未命名',
    fileName: fileName || '',
    length: content.length,
    createTime: now,
    lastReadTime: now,
    charOffset: 0,   // 阅读位置锚点（字符下标），字号变化后依然有效
    lastPage: 1,     // 上次阅读页码（从 1 开始，仅用于展示）
    totalPages: 0,   // 上次阅读时的总页数
    progress: 0      // 0~1 的阅读进度，用于书架进度条
  }

  const tx = db.transaction([STORE_BOOKS, STORE_TEXTS], 'readwrite')
  tx.objectStore(STORE_BOOKS).put(book)
  tx.objectStore(STORE_TEXTS).put({ id: book.id, content })
  await runTransaction(tx)
  return book
}

/**
 * 书架列表：只取元信息，按最近阅读时间倒序。
 */
export async function listBooks () {
  const db = await openDB()
  const tx = db.transaction(STORE_BOOKS, 'readonly')
  const books = await runRequest(tx.objectStore(STORE_BOOKS).getAll())
  return books.sort((a, b) => (b.lastReadTime || 0) - (a.lastReadTime || 0))
}

export async function getBookMeta (id) {
  const db = await openDB()
  const tx = db.transaction(STORE_BOOKS, 'readonly')
  return runRequest(tx.objectStore(STORE_BOOKS).get(id))
}

export async function getBookText (id) {
  const db = await openDB()
  const tx = db.transaction(STORE_TEXTS, 'readonly')
  const record = await runRequest(tx.objectStore(STORE_TEXTS).get(id))
  return record ? record.content : ''
}

/**
 * 更新阅读进度（翻页时自动调用）。
 * 读改写放在同一个事务里，await 的是 IndexedDB 请求回调里 resolve 的 promise（微任务），
 * 事务不会因此提前提交。
 */
export async function updateProgress (id, patch) {
  const db = await openDB()
  const tx = db.transaction(STORE_BOOKS, 'readwrite')
  const store = tx.objectStore(STORE_BOOKS)
  const book = await runRequest(store.get(id))
  if (book) {
    const next = { ...book, ...patch, lastReadTime: Date.now() }
    store.put(next)
    await runTransaction(tx)
    return next
  }
  await runTransaction(tx)
  return null
}

export async function getSetting (key, fallback) {
  const db = await openDB()
  const tx = db.transaction(STORE_SETTINGS, 'readonly')
  const record = await runRequest(tx.objectStore(STORE_SETTINGS).get(key))
  return record ? record.value : fallback
}

export async function setSetting (key, value) {
  const db = await openDB()
  const tx = db.transaction(STORE_SETTINGS, 'readwrite')
  tx.objectStore(STORE_SETTINGS).put({ key, value })
  await runTransaction(tx)
}

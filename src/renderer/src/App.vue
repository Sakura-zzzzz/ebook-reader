<script setup>
import { ref } from 'vue'
import ShelfView from './views/ShelfView.vue'
import ReaderView from './views/ReaderView.vue'

// 只有两个页面：currentBook 为 null 时显示书架，否则显示阅读页。
// 页面很少，用一个状态切换即可，不需要引入 vue-router。
const currentBook = ref(null)

function openBook (book) {
  currentBook.value = book
}

function backToShelf () {
  currentBook.value = null
}
</script>

<template>
  <ShelfView v-if="!currentBook" @open="openBook" />
  <ReaderView v-else :book="currentBook" @back="backToShelf" />
</template>

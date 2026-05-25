<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useCounterStore } from './main'

const counter = useCounterStore()
const runtimeFallbackHost = ref<HTMLElement | null>(null)

/**
 * 创建没有编译期标识的动态 DOM。
 *
 * 该按钮用于真实验证 runtime fallback ID 的生命周期边界，不能写在模板里，否则会被 SFC 注入源码 ID。
 */
onMounted(() => {
  const button = document.createElement('button')
  button.type = 'button'
  button.textContent = 'Runtime Fallback Target'
  runtimeFallbackHost.value?.appendChild(button)
})

function logMessage(): void {
  console.warn('playground log', { count: counter.count })
}

async function requestDemo(): Promise<void> {
  const response = await fetch('/api/demo?source=playground', {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify({ count: counter.count })
  })
  console.info('network response', await response.json())
}
</script>

<template>
  <main class="playground">
    <h1>vite-plugin-vue-mcp-next playground</h1>
    <p data-testid="count">Count: {{ counter.count }}</p>
    <nav>
      <RouterLink to="/">Home</RouterLink>
      <RouterLink to="/about">About</RouterLink>
    </nav>
    <section class="actions">
      <button type="button">Project Source Target</button>
      <div class="component-like-target">
        <button type="button">Component Wrapper Target</button>
      </div>
      <div ref="runtimeFallbackHost" class="runtime-fallback-host" />
      <button type="button" @click="counter.increment()">
        Increment Pinia
      </button>
      <button type="button" @click="logMessage">Console Log</button>
      <button type="button" @click="requestDemo">Network Request</button>
    </section>
    <RouterView />
  </main>
</template>

<style scoped>
.playground {
  max-width: 760px;
  margin: 48px auto;
  font-family: system-ui, sans-serif;
}

.actions,
nav {
  display: flex;
  gap: 12px;
  margin: 16px 0;
}

.component-like-target {
  display: inline-flex;
}

.runtime-fallback-host {
  display: inline-flex;
}
</style>

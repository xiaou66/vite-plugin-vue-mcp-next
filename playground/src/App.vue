<script setup lang="ts">
import { useCounterStore } from './main'

const counter = useCounterStore()

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
</style>

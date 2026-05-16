import { createPinia, defineStore } from 'pinia'
import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import App from './App.vue'

export const useCounterStore = defineStore('counter', {
  state: () => ({ count: 0 }),
  actions: {
    increment() {
      this.count += 1
    }
  }
})

const routes = [
  { path: '/', component: { template: '<section>Home route</section>' } },
  { path: '/about', component: { template: '<section>About route</section>' } }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

createApp(App).use(createPinia()).use(router).mount('#app')

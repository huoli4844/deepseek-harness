import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.VITE_BASE_URL || '/'),
  routes: [
    {
      path: '/',
      redirect: '/login',
    },
    {
      path: '/login',
      name: 'Login',
      component: () => import('@/views/LoginView.vue'),
    },
  ],
})

router.beforeEach((to) => {
  const token = localStorage.getItem('yuanshu-login-token')
  if (to.path !== '/login' && !token) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }
  return true
})

export default router

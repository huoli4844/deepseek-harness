import { createApp } from 'vue'
import { createPinia } from 'pinia'
import TDesign from 'tdesign-vue-next'

import App from './App.vue'
import router from './router'

import 'tdesign-vue-next/es/style/index.css'
import './styles/index.less'
import './styles/themes.css'

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.use(TDesign)

app.mount('#app')

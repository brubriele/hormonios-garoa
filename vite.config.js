import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        flow: 'flow.html',
        guides: 'guias.html'
      }
    }
  }
})

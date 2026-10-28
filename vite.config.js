import { defineConfig, mergeConfig } from 'vite'

const config = {
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        flow: 'flow.html',
        guides: 'guias.html'
      }
    }
  }
}

// spec-5 A3: o que é do dev só carrega no `vite` (serve); o build da Vercel usa só as páginas
export default defineConfig(async ({ command }) => {
  if (command !== 'serve') return config

  const { devConfig } = await import('./deploy/dev/vite.config')
  return mergeConfig(config, devConfig)
})

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { liveApiDevPlugin } from './vite.live-api.ts'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), liveApiDevPlugin()],
})

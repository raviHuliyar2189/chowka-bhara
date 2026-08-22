import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Vite normally restricts dev-server file access to the project root; @chowka/game-core
    // lives in a sibling ../packages/game-core directory (npm workspace), so it needs explicit
    // allowance to be readable during `npm run dev`.
    fs: { allow: ['..'] },
  },
})

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/Seminar-management-portal/',
  test: {
    environment: 'jsdom',
    include: ['tests/ui/**/*.test.{js,jsx}'],
    setupFiles: ['./tests/ui/setup.js'],
  },
})

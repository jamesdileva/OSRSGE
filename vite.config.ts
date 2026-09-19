/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // Packaged renderer loads via file:// (main loadFile). The default
  // absolute base ('/assets/…') fails there → white screen, so emit
  // relative asset URLs ('./assets/…') that work under file:// and http.
  base: './',
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
  },
})

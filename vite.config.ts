import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * `base` is the repo name because GitHub Pages serves project sites from
 * /<repo>/. It is overridable so a different host (or a local `vite preview`)
 * can serve from the root instead.
 */
export default defineConfig({
  base: process.env.VITE_BASE ?? '/flashcards/',
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});

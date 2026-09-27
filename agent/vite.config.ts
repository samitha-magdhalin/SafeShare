import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
export default defineConfig({plugins:[react()],clearScreen:false,server:{port:1420,strictPort:true,fs:{allow:[resolve(import.meta.dirname,'..')]}},build:{target:'es2021',outDir:'dist',emptyOutDir:true},test:{environment:'node',include:['src/**/*.test.ts']}});

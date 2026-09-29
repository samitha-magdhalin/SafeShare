import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
export default defineConfig({base:'./',envDir:'..',plugins:[react()],clearScreen:false,server:{port:1420,strictPort:true,fs:{allow:[resolve(import.meta.dirname,'..')]}},build:{target:'es2021',outDir:'dist',emptyOutDir:true,sourcemap:false},test:{environment:'node',include:['src/**/*.test.ts']}});

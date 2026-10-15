import { defineConfig } from 'vite';
export default defineConfig({root:'apps/client',publicDir:'../../public',build:{outDir:'../../dist',emptyOutDir:true},server:{host:'127.0.0.1',fs:{allow:['.']}},preview:{host:'127.0.0.1'}});

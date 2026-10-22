import { defineConfig } from 'vite';
export default defineConfig(({mode}) => ({build:mode === 'widget' ? {
  minify:false, cssMinify:false,
  lib:{entry:'src/runtime.js',name:'RakursColorLeads',formats:['umd'],fileName:()=>'rkrs-color-leads.umd.js'},
  outDir:'dist', copyPublicDir:false,
} : {outDir:'dist-preview'}}));

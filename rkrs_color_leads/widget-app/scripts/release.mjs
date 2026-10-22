import { fileURLToPath } from 'node:url';
import { releaseWidget } from '../../../packages/widget-build/index.mjs';
releaseWidget({root:fileURLToPath(new URL('../',import.meta.url)),bundleName:'rkrs-color-leads',placeholderPrefix:'COLOR'});

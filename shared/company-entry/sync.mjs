import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const source = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(source, '../..');
const index = process.argv.indexOf('--target');
const target = index >= 0 ? process.argv[index + 1] : undefined;
const folders = target ? [target] : [
  'rkrs_lead_notasks',
  'rkrs_activity_panel/widget',
  'rkrs_lead_distribution/widget',
  'integration-packages/amocrm-pro-service/widget',
].map((folder) => path.join(root, folder));
let deployment = readFileSync(path.join(source, 'deployment.js'), 'utf8');
if (target) {
  const config = {
    coreOrigin: process.env.COMPANY_ENTRY_CORE_ORIGIN,
    frontendOrigin: process.env.COMPANY_ENTRY_FRONTEND_ORIGIN,
  };
  for (const value of Object.values(config)) {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
      throw new Error('Set COMPANY_ENTRY_CORE_ORIGIN and COMPANY_ENTRY_FRONTEND_ORIGIN to HTTPS origins');
    }
  }
  deployment = `define([], function () { return ${JSON.stringify(config)}; });\n`;
}
for (const folder of folders) {
  mkdirSync(path.join(folder, 'lib'), { recursive: true });
  writeFileSync(path.join(folder, 'lib/company-entry.js'), readFileSync(path.join(source, 'company-entry.js')));
  writeFileSync(path.join(folder, 'lib/company-entry-deployment.js'), deployment);
}

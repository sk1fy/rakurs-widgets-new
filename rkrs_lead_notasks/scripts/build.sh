#!/bin/sh
set -eu
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROJECT_DIR=$(dirname "$SCRIPT_DIR")
OUTPUT_FILE=${TASK_CONTROL_OUTPUT:-$(dirname "$PROJECT_DIR")/rkrs_lead_notasks.zip}
TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT INT TERM
cd "$PROJECT_DIR"
cp -R manifest.json script.js style.css i18n images lib templates "$TEMP_DIR/"
TASK_CONTROL_BUILD_DIR="$TEMP_DIR" node <<'JS'
const fs = require('node:fs');
const manifest = JSON.parse(fs.readFileSync(process.env.TASK_CONTROL_BUILD_DIR + '/manifest.json', 'utf8'));
const fields = Object.values(manifest.settings || {});
const allowed = new Set(['text', 'pass', 'users', 'users_lp', 'custom']);
if (fields.some(field => !allowed.has(field.type)) || fields.filter(field => field.type === 'custom').length > 1) {
    throw new Error('Invalid amoCRM manifest: supported setting types and at most one custom field required');
}
const coreOrigin = process.env.TASK_CONTROL_CORE_ORIGIN || '';
const backendOrigin = process.env.TASK_CONTROL_BACKEND_ORIGIN || '';
if ((!coreOrigin || !backendOrigin) && process.env.TASK_CONTROL_STANDALONE_BUILD !== '1') {
    throw new Error('Set TASK_CONTROL_CORE_ORIGIN and TASK_CONTROL_BACKEND_ORIGIN (HTTPS public origins). For a standalone-only archive set TASK_CONTROL_STANDALONE_BUILD=1 explicitly.');
}
for (const input of [coreOrigin, backendOrigin].filter(Boolean)) {
    const u = new URL(input);
    if (u.protocol !== 'https:' || u.username || u.password || u.search || u.hash || u.pathname !== '/') throw new Error('Expected HTTPS origin without path/credentials');
}
fs.writeFileSync(process.env.TASK_CONTROL_BUILD_DIR + '/lib/deployment.js', 'define([], function () { return ' + JSON.stringify({coreOrigin,backendOrigin}) + '; });\n');
JS
cd "$TEMP_DIR"
TASK_CONTROL_ZIP_EPOCH=${SOURCE_DATE_EPOCH:-$(git -C "$PROJECT_DIR" log -1 --format=%ct 2>/dev/null || printf '315532800')}
export TASK_CONTROL_ZIP_EPOCH
python3 <<'PY'
import os
from pathlib import Path
import time
import zipfile

epoch = int(os.environ['TASK_CONTROL_ZIP_EPOCH'])
if not 315532800 <= epoch <= 4354819199:
    raise ValueError('SOURCE_DATE_EPOCH must fit the ZIP UTC date range (1980–2107)')
stamp = time.gmtime(epoch)[:6]
with zipfile.ZipFile('widget.zip', 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for file in sorted(Path('.').rglob('*')):
        if not file.is_file() or file.name in ('widget.zip', '.DS_Store'):
            continue
        info = zipfile.ZipInfo(file.as_posix(), stamp)
        info.create_system = 3
        info.external_attr = 0o100644 << 16
        info.compress_type = zipfile.ZIP_DEFLATED
        archive.writestr(info, file.read_bytes(), compresslevel=9)
PY
mv widget.zip "$OUTPUT_FILE"
echo "Created $OUTPUT_FILE"

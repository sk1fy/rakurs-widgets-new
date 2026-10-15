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
zip -qr widget.zip manifest.json script.js style.css i18n images lib templates
mv widget.zip "$OUTPUT_FILE"
echo "Created $OUTPUT_FILE"

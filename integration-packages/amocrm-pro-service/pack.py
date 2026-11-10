"""Package the complete integration; do not replace it with a standalone module."""
from pathlib import Path
import hashlib
import json
import zipfile
import subprocess
import tempfile
import shutil

root = Path(__file__).resolve().parent
widget = root / 'widget'
manifest = json.loads((widget / 'manifest.json').read_text())
assert manifest['settings']['backend_url']['required']
assert manifest['settings']['integration_code']['required']
assert 'digital_pipeline' in manifest['locations']
for locale in manifest['widget']['locale']:
    translations = json.loads((widget / 'i18n' / f'{locale}.json').read_text())
    assert translations['tester']['bootstrap']
    assert translations['dp']['title']
for name in ['logo.png', 'logo_main.png', 'logo_medium.png', 'logo_min.png', 'logo_small.png', 'logo_dp.png']:
    assert (widget / 'images' / name).is_file()
with tempfile.TemporaryDirectory(prefix='company-entry-package-') as directory:
    staging = Path(directory)
    shutil.copytree(widget, staging, dirs_exist_ok=True)
    subprocess.run(['node', str(root / '../../shared/company-entry/sync.mjs'), '--target', str(staging)], check=True)
    archive = root / f"amocrm-pro-service-{manifest['widget']['version']}.zip"
    with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as bundle:
        for source in sorted(staging.rglob('*')):
            if source.is_file() and source.name != '.DS_Store':
                entry = zipfile.ZipInfo(str(source.relative_to(staging)), (2000, 1, 1, 0, 0, 0))
                entry.compress_type = zipfile.ZIP_DEFLATED
                bundle.writestr(entry, source.read_bytes())
print(archive)
print('sha256:', hashlib.sha256(archive.read_bytes()).hexdigest())


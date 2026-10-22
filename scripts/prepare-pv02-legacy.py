#!/usr/bin/env python3
"""Materialize hash-verified legacy snapshots for offline PV-02 diagnostics.

No network requests, production writes or runtime activation. Existing output is
never overwritten. The snapshots intentionally preserve known legacy blockers.
"""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import shutil
import tempfile

ROOT = Path(__file__).resolve().parents[1]
PILOTS = ('color-leads', 'copy-lead')


def relative_path(value):
    path = PurePosixPath(value)
    if not value or path.is_absolute() or '..' in path.parts or '\\' in value:
        raise ValueError(f'Unsafe inventory path: {value!r}')
    return Path(*path.parts)


def materialize(source, output_root, pilot):
    inventory = ROOT / 'pilots' / pilot / 'provenance.json'
    metadata = json.loads(inventory.read_text(encoding='utf-8'))
    if metadata['runtime_activation_allowed'] or metadata['legacy_cleanup_supported']:
        raise ValueError('This tool only handles inactive legacy diagnostic snapshots')
    output = output_root / pilot / 'dist-package'
    if output.exists():
        raise FileExistsError(f'Refusing to overwrite {output}; choose another --output-root')
    verified = []
    seen = set()
    for entry in metadata['files']:
        source_path = source / relative_path(entry['source'])
        target_path = relative_path(entry['path'])
        if target_path in seen or target_path.parts[0] != 'widget':
            raise ValueError(f'Invalid or duplicate target: {target_path}')
        seen.add(target_path)
        # Neither symlinks nor changed vendored bytes are accepted as the snapshot.
        if source_path.is_symlink() or not source_path.resolve().is_relative_to(source):
            raise ValueError(f'Source escapes snapshot tree: {source_path}')
        content = source_path.read_bytes()
        if hashlib.sha256(content).hexdigest() != entry['sha256']:
            raise ValueError(f'Source SHA-256 mismatch: {source_path}')
        verified.append((target_path, content))
    output.parent.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix='.pv02-snapshot-', dir=output.parent))
    try:
        for path, content in verified:
            destination = staging / path
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(content)
        (staging / 'snapshot.json').write_text(
            json.dumps(metadata, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        staging.rename(output)
    except BaseException:
        shutil.rmtree(staging)
        raise
    return {'pilot': pilot, 'output': str(output), 'files': len(verified),
            'runtime_activation_allowed': False, 'production_baseline_verified': False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', required=True, type=Path,
                        help='Local rakurs-widgets-dev snapshot directory')
    parser.add_argument('--output-root', type=Path, default=ROOT / 'pilots',
                        help='Parent for <pilot>/dist-package (default: ignored pilot output)')
    parser.add_argument('--pilot', choices=PILOTS, action='append',
                        help='Repeat to select pilots; default both')
    args = parser.parse_args()
    source = args.source.resolve(strict=True)
    output_root = args.output_root.resolve()
    if output_root.is_relative_to(source):
        parser.error('Output must be outside the source snapshot')
    try:
        for pilot in dict.fromkeys(args.pilot or PILOTS):
            print(json.dumps(materialize(source, output_root, pilot), ensure_ascii=False))
    except (OSError, ValueError, KeyError) as error:
        parser.exit(1, f'Snapshot preparation failed: {error}\n')


if __name__ == '__main__':
    main()

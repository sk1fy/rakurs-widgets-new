# Shared widget build

Both existing widget apps invoke this package through their original `scripts/release.mjs` and `scripts/package-widget.mjs` commands. No new dependency or global ZIP executable is needed for packaging.

These outputs are **engineering test packages**, not submissions approved for amoCRM moderation. Widget-mode JavaScript and CSS minification are explicitly disabled in both Vite configs so generated application code stays readable. This does not reconstruct upstream source comments or reverse already minified third-party inputs; source availability, vendor licenses, manifest requirements and the final archive still need separate review under [the moderation checklist](../../docs/pv02-moderation.md). Existing package versions are retained; this build does not replace the separate RC-12.2 diagnostic artifact.

`releaseWidget({ root, bundleName, placeholderPrefix })` runs the app's pinned Vite installation, computes the full SHA-256 digest, and writes a deterministic `release.json` and `<name>.<first-16-hash-chars>.umd.js` into `dist-remote` and the local preview assets. The release contains no build time. `root` is the absolute widget-app directory.

`packageWidget({ root, bundleName, placeholderPrefix, zipName, apiRequired, argv })` validates the digest and package/manifest/release version equality before creating a ZIP. Existing `--assets-url` / `--api-url` arguments still work. Bundled mode is the default and needs no assets URL: the package contains the runtime bytes inside the single `script.js` AMD module. A local AMD bridge captures the UMD exports without `eval`, global runtime registration, or a network request for JavaScript. Supported runtime dependencies are `exports` only; the thin adapter has no external AMD dependencies. Activity's legacy release-manifest request resolves to the pinned local manifest.

```sh
cd rkrs_lead_distribution/widget-app
npm run release
npm run package:widget -- --api-url https://core.example.test/api/v1/widget/distribution
```

Explicit `--runtime-mode remote --allow-unreviewed-remote --assets-url https://assets.example.test/widget-assets` preserves a diagnostic remote package. Its manifest is pinned too. This flag does **not** mean the amoCRM remote-code policy has been approved; the `build-report.json` records `remote_policy_approved: false`. No automated public upload occurs. A content hash verifies local build/package consistency; it does not authenticate a remote server or enforce browser SRI.

`reproducibleZip(directory, output)` and `sha256(bytes)` are available for other widget builders. ZIP entries are stored uncompressed, ordered, use UTF-8 names, fixed 2000-01-01 UTC timestamps and mode 0644, and have no platform extra fields. File mtimes, local timezone, input permissions and system ZIP versions cannot alter archive bytes. Symlinks and ZIP64 inputs are rejected. Reproducible source bundles still require the same source, lockfile, Node/toolchain and build configuration.

Generated outputs stay ignored. `dist-package/build-report.json` is outside the amoCRM ZIP and records bundle/ZIP digests and the included file list. Run unit tests with `node --test packages/widget-build/tests/*.test.mjs`; each widget's existing `npm test` remains its integration entry point.

GitHub Actions runs the shared package tests and a Node 24 matrix for both widget apps (`npm ci`, `npm test`, `npm run build:preview`). CI does not upload ZIPs to amoCRM or substitute for a live-account acceptance test.

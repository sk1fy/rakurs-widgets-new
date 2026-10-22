import { defineConfig } from "vite";
export default defineConfig(({ mode }) => ({
  build:
    mode === "widget"
      ? {
          // Readable engineering package; bundled mode alone does not imply moderation approval.
          minify: false,
          cssMinify: false,
          lib: {
            entry: "src/runtime.js",
            name: "RakursLeadDistribution",
            formats: ["umd"],
            fileName: () => "rkrs-distribution.umd.js",
          },
          outDir: "dist",
          copyPublicDir: false,
        }
      : { outDir: "dist-preview" },
}));

import { defineConfig } from "vite";
export default defineConfig(({ mode }) => ({
  build:
    mode === "widget"
      ? {
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

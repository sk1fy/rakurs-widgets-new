/// <reference types="vitest/config" />
import { defineConfig, loadEnv, type ProxyOptions } from "vite";
import react from "@vitejs/plugin-react";

// Серверные значения (без префикса VITE_) читаются только здесь, в процессе
// dev-сервера, и никогда не попадают в клиентскую сборку.
export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const origin = env.ACTIVITY_API_ORIGIN;
  const managementToken = env.ACTIVITY_MANAGEMENT_TOKEN;

  const proxy: Record<string, ProxyOptions> = {};
  if (origin) {
    // Viewer API: ключ ссылки передаётся клиентом в Authorization как есть.
    proxy["/api/v1/activity/view"] = { target: origin, changeOrigin: true };
    if (managementToken && env.ACTIVITY_INSTALLATION_ID && env.ACTIVITY_INTEGRATION_ID) {
      // Dev-only мост к management API: токен подставляет сервер разработки.
      // В рабочей сборке нужен отдельный браузерный admin-контракт (C7).
      proxy["/dev-management/api/v1/activity"] = {
        target: origin,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/dev-management/, ""),
        configure: (p) => {
          p.on("proxyReq", (req) => {
            req.setHeader("Authorization", `Bearer ${managementToken}`);
            req.setHeader("X-Activity-Installation-Id", env.ACTIVITY_INSTALLATION_ID ?? "");
            req.setHeader("X-Activity-Integration-Id", env.ACTIVITY_INTEGRATION_ID ?? "");
          });
        },
      };
    }
  }

  // Production-сборка по умолчанию только live: синтетика попадает в неё лишь явно (VITE_DATA_MODE).
  const dataMode = mode === "fixtures" ? "fixtures" : env.VITE_DATA_MODE || (command === "build" ? "live" : "hybrid");

  return {
    plugins: [react()],
    define: {
      __DATA_MODE__: JSON.stringify(dataMode),
      __DEV_MANAGEMENT__: JSON.stringify(command === "serve" && Boolean(proxy["/dev-management/api/v1/activity"])),
    },
    server: { proxy },
    test: { environment: "node", include: ["tests/**/*.test.ts"] },
  };
});

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import path from "path";

// 純 Vite + React SPA，靜態輸出到 dist/，供 Vercel 部署
// 原本用 @lovable.dev/vite-tanstack-config（TanStack Start + nitro，打包目標是 Cloudflare Workers），
// 直接上 Vercel 會 build 成功但每個路由 404
export default defineConfig({
  plugins: [react(), tailwindcss(), tsConfigPaths()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  server: { host: "::", port: 8080 },
});

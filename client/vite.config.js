import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // must match the server's CLIENT_ORIGIN, which CORS is locked to
  server: { port: 5100, strictPort: true },
});

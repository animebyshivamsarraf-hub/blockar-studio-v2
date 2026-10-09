import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/blockar-studio-v2/",
  plugins: [react()]
});

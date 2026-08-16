import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";


export default defineConfig({
  plugins: [react()],
  envDir: "../..",
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [{
            name: "supabase-vendor",
            test: /node_modules[\\/]@supabase[\\/]/,
            priority: 10,
          }],
        },
      },
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
  },
});

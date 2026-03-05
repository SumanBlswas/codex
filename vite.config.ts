import path from "path";
import fs from "fs";
import { defineConfig, loadEnv, Plugin } from "vite";
import react from "@vitejs/plugin-react";

// Plugin to serve __neutralino_globals.js in dev mode
function neutralinoDevPlugin(): Plugin {
  return {
    name: "neutralino-dev-globals",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === "/__neutralino_globals.js") {
          // Read the auth info file that neu run creates
          const authFile = path.resolve(".tmp/auth_info.json");
          try {
            const authInfo = JSON.parse(fs.readFileSync(authFile, "utf-8"));
            const globals = `
              window.NL_PORT = ${authInfo.nlPort};
              window.NL_TOKEN = "${authInfo.nlToken}";
              window.NL_CONNECT_TOKEN = "${authInfo.nlConnectToken}";
              window.NL_ARGS = [""];
              window.NL_OS = "Windows";
              window.NL_APPID = "js.neutralino.nocodexstudio";
              window.NL_APPVERSION = "1.0.0";
              window.NL_CVERSION = "6.5.0";
              window.NL_CWD = "${path.resolve(".").replace(/\\/g, "\\\\")}";
              window.NL_PATH = "${path.resolve(".").replace(/\\/g, "\\\\")}";
              window.NL_CCOMMIT = "";
              window.NL_EXTENABLED = false;
            `;
            res.setHeader("Content-Type", "application/javascript");
            res.end(globals);
          } catch (e) {
            // If auth file doesn't exist yet, return empty globals
            res.setHeader("Content-Type", "application/javascript");
            res.end("// Neutralino not ready yet");
          }
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  return {
    base: "./",
    server: {
      port: 3000,
      host: "0.0.0.0",
    },
    plugins: [react(), neutralinoDevPlugin()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "."),
      },
    },
  };
});

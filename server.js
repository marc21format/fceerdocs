import "dotenv/config";
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { handleApiRoute, send } from "./server/routes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const port = process.env.PORT ? Number(process.env.PORT) : 4173;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

function normalizeFilePath(urlPathname) {
  const cleanPath = urlPathname === "/" ? "/index.html" : urlPathname;
  const publicDir = path.join(__dirname, "public");
  const resolved = path.normalize(path.join(publicDir, cleanPath));
  if (!resolved.startsWith(publicDir)) {
    return null;
  }
  return resolved;
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS"
      });
      res.end();
      return;
    }

    const requestUrl = new URL(req.url, `http://${req.headers.host}`);
    const pathname = requestUrl.pathname;
    console.log(`[${new Date().toISOString()}] ${req.method} ${pathname}`);

    const handled = await handleApiRoute(req, res, pathname, requestUrl);
    if (handled) {
      return;
    }

    const resolvedPath = normalizeFilePath(pathname);
    if (!resolvedPath) {
      send(res, 403, "Forbidden");
      return;
    }

    const fileInfo = await stat(resolvedPath);
    if (!fileInfo.isFile()) {
      send(res, 404, "Not Found");
      return;
    }

    const ext = path.extname(resolvedPath).toLowerCase();
    const content = await readFile(resolvedPath);
    send(res, 200, content, mimeTypes[ext] || "application/octet-stream");
  } catch (error) {
    send(res, 404, "Not Found");
  }
});

server.listen(port, () => {
  console.log(`FCEERDocs running at http://localhost:${port}`);
});

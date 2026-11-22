import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const root = new URL("../dist/", import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/, (m) => m.slice(1));
const port = Number(process.env.PORT || 4173);
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

createServer(async (req, res) => {
  try {
    const raw = decodeURIComponent((req.url || "/").split("?")[0]);
    const relative = raw === "/" ? "index.html" : raw.replace(/^\/+/, "");
    const target = normalize(join(root, relative));
    if (!target.startsWith(normalize(root))) throw new Error("Geçersiz yol");
    const info = await stat(target);
    const file = info.isDirectory() ? join(target, "index.html") : target;
    const body = await readFile(file);
    res.writeHead(200, { "content-type": types[extname(file)] || "application/octet-stream", "cache-control": "no-store" });
    res.end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Dosya bulunamadı");
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`Canopy BioCore hazır: http://127.0.0.1:${port}`);
});

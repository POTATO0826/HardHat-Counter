// A tiny local web server using Node.js only. Run: node frontend/serve.mjs
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";

const assets = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
]);
const server = createServer(async (request, response) => {
  const asset = assets.get(new URL(request.url, "http://localhost").pathname);
  if (!asset || !["GET", "HEAD"].includes(request.method)) {
    response.writeHead(404).end("Not found");
    return;
  }
  try {
    const content = await readFile(new URL(asset[0], import.meta.url));
    response.writeHead(200, { "Content-Type": asset[1], "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
    response.end(request.method === "HEAD" ? undefined : content);
  } catch {
    response.writeHead(500).end("Could not read the page files.");
  }
});
server.on("error", (error) => {
  console.error(error.code === "EADDRINUSE" ? "Port 3000 is in use. Close the other server on that port, then try again." : error.message);
  process.exitCode = 1;
});
server.listen(3000, "127.0.0.1", () => console.log("Counter frontend: http://127.0.0.1:3000\nKeep this terminal open. Press Ctrl+C to stop."));

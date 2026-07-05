const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 5173;
const HOST = "127.0.0.1";
const ROOT = __dirname;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

const server = http.createServer((request, response) => {
  let requestPath = decodeURIComponent(request.url.split("?")[0]);
  if (requestPath === "/") requestPath = "/index.html";

  const filePath = path.resolve(ROOT, `.${requestPath}`);
  const isInsideProject = filePath === ROOT || filePath.startsWith(`${ROOT}${path.sep}`);

  if (!isInsideProject) {
    response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }

    response.writeHead(200, {
      "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream",
    });
    response.end(content);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Skill Connect is live at http://${HOST}:${PORT}/`);
});

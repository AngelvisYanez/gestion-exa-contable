/**
 * Arranque para cPanel (Passenger / Setup Node.js App).
 * Archivo de inicio: server.js
 * El túnel 3307 solo existe en la PC de desarrollo.
 */
const http = require("http");
const { parse } = require("url");
const next = require("next");

const port = parseInt(process.env.PORT || "3000", 10);
const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = http.createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl).catch((err) => {
      console.error(err);
      res.statusCode = 500;
      res.end("internal error");
    });
  });

  if (typeof PhusionPassenger !== "undefined") {
    PhusionPassenger.configure({ autoInstall: false });
    server.listen("passenger");
  } else {
    server.listen(port, "127.0.0.1");
  }
});

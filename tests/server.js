"use strict";
/* Static file server for the app plus an in-memory stand-in for the Firestore REST calls the app makes. */
const http = require("http"), fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".webmanifest": "application/manifest+json" };

function start(port = 0) {
  const store = {};
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, "http://x");
    if (u.pathname === "/firebase-config.js") {
      res.setHeader("Content-Type", "text/javascript");
      return res.end(`const FIREBASE_CONFIG = { apiKey: "test", projectId: "p", host: location.origin };`);
    }
    if (u.pathname.startsWith("/v1/projects/")) {
      let body = ""; req.on("data", (d) => (body += d));
      return req.on("end", () => {
        const m = u.pathname.match(/documents\/families\/([^/:]+)(?:\/items\/([^/]+)|:runQuery)$/);
        if (!m) { res.statusCode = 404; return res.end("{}"); }
        const fam = m[1];
        const doc = (k, v) => ({ name: `projects/p/databases/(default)/documents/families/${k.replace("/", "/items/")}`, fields: { json: { stringValue: v.json }, ts: { integerValue: String(v.ts) } } });
        if (req.method === "PATCH" && m[2]) { const f = JSON.parse(body).fields; store[fam + "/" + m[2]] = { json: f.json.stringValue, ts: Number(f.ts.integerValue) }; return res.end("{}"); }
        if (req.method === "GET" && m[2]) { const v = store[fam + "/" + m[2]]; if (!v) { res.statusCode = 404; return res.end("{}"); } return res.end(JSON.stringify(doc(fam + "/" + m[2], v))); }
        if (req.method === "DELETE" && m[2]) { delete store[fam + "/" + m[2]]; return res.end("{}"); }
        if (req.method === "POST") {
          const since = Number(JSON.parse(body).structuredQuery.where.fieldFilter.value.integerValue);
          const rows = Object.entries(store).filter(([k, v]) => k.startsWith(fam + "/") && v.ts > since).sort((a, b) => a[1].ts - b[1].ts).map(([k, v]) => ({ document: doc(k, v) }));
          return res.end(JSON.stringify(rows.length ? rows : [{ readTime: "x" }]));
        }
        res.statusCode = 400; res.end("{}");
      });
    }
    let p = path.join(ROOT, u.pathname === "/" ? "index.html" : u.pathname);
    if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.statusCode = 404; return res.end("not found"); }
    res.setHeader("Content-Type", TYPES[path.extname(p)] || "application/octet-stream");
    fs.createReadStream(p).pipe(res);
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve({ server, store, url: "http://127.0.0.1:" + server.address().port })));
}
module.exports = { start };

const fs = require("node:fs");
const path = require("node:path");

const root = __dirname;
const output = path.join(root, "public");

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });

for (const file of ["index.html", "styles.css", "app.js", "README.md"]) {
  fs.copyFileSync(path.join(root, file), path.join(output, file));
}

console.log("Built Cloudflare Pages static files in public/");

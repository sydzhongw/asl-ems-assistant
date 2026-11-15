// Fixes the "invalid Base64 characters" bug in the client pages.
// Run from the project root:  node fix-base64.js
// Safe to run more than once: files that are already fixed are left alone.

const fs = require("fs");
const path = require("path");

const patches = [
  {
    file: "app/index.html",
    edits: [
      { from: 'result.indexOf(",")', to: 'result.indexOf("base64,")' },
      { from: "result.slice(commaIndex + 1)", to: "result.slice(commaIndex + 7)" },
    ],
    fixedMarker: 'indexOf("base64,")',
  },
  {
    file: "app/demo.html",
    edits: [
      {
        from: 'r(String(f.result).split(",")[1])',
        to: 'r(String(f.result).slice(String(f.result).indexOf("base64,") + 7))',
      },
    ],
    fixedMarker: 'indexOf("base64,")',
  },
  {
    file: "services/signRecognition.html",
    edits: [
      {
        from: 'reader.result.split(",")[1]',
        to: 'reader.result.slice(reader.result.indexOf("base64,") + 7)',
      },
    ],
    fixedMarker: 'indexOf("base64,")',
  },
];

for (const { file, edits, fixedMarker } of patches) {
  const full = path.join(__dirname, file);
  if (!fs.existsSync(full)) {
    console.log(`SKIP   ${file} (file not found)`);
    continue;
  }

  let text = fs.readFileSync(full, "utf8");

  if (text.includes(fixedMarker)) {
    console.log(`OK     ${file} (already fixed)`);
    continue;
  }

  let changed = false;
  for (const { from, to } of edits) {
    if (text.includes(from)) {
      text = text.split(from).join(to);
      changed = true;
    }
  }

  if (changed) {
    fs.writeFileSync(full, text);
    console.log(`FIXED  ${file}`);
  } else {
    console.log(`MANUAL ${file}: could not find the line to change. Search it for .split(",")[1]`);
  }
}


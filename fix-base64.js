const fs = require("fs");
const patches = [
  ["app/index.html", 'result.indexOf(",")', 'result.indexOf("base64,")'],
  ["app/index.html", "result.slice(commaIndex + 1)", "result.slice(commaIndex + 7)"],
  ["app/demo.html", 'r(String(f.result).split(",")[1])', 'r(String(f.result).slice(String(f.result).indexOf("base64,") + 7))'],
  ["services/signRecognition.html", 'reader.result.split(",")[1]', 'reader.result.slice(reader.result.indexOf("base64,") + 7)'],
];
for (const [file, from, to] of patches) {
  if (!fs.existsSync(file)) { console.log("SKIP   " + file); continue; }
  const text = fs.readFileSync(file, "utf8");
  if (text.includes(from)) { fs.writeFileSync(file, text.split(from).join(to)); console.log("FIXED  " + file + "  (" + from.slice(0, 30) + ")"); }
  else console.log("NOTHING TO CHANGE  " + file + "  (" + from.slice(0, 30) + ")");
}

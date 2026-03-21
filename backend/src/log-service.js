const fs = require("fs");
const path = require("path");

const logFile = path.join(process.cwd(), "data", "operations.log.jsonl");

function appendOperation(entry) {
  const normalized = {
    id: cryptoId(),
    time: new Date().toISOString(),
    ...entry
  };
  fs.appendFileSync(logFile, `${JSON.stringify(normalized)}\n`, "utf8");
  return normalized;
}

function listOperations(limit = 200) {
  if (!fs.existsSync(logFile)) {
    return [];
  }
  const lines = fs
    .readFileSync(logFile, "utf8")
    .split("\n")
    .filter(Boolean);
  return lines
    .slice(-Number(limit))
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return { id: "parse-error", raw: line };
      }
    })
    .reverse();
}

function cryptoId() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

module.exports = {
  appendOperation,
  listOperations
};


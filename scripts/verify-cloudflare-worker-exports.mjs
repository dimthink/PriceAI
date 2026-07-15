import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const workerFile = join(process.cwd(), ".open-next", "worker.js");
const queueFile = join(process.cwd(), ".open-next", ".build", "durable-objects", "queue.js");

if (!existsSync(workerFile)) throw new Error(`Missing OpenNext worker entry: ${workerFile}`);
if (!existsSync(queueFile)) throw new Error(`Missing OpenNext durable object queue bundle: ${queueFile}`);

const workerSource = readFileSync(workerFile, "utf8");
if (!/export\s*\{\s*DOQueueHandler\s*\}\s*from\s*["']\.\/\.build\/durable-objects\/queue\.js["']/.test(workerSource)) {
  throw new Error("OpenNext worker does not export DOQueueHandler required by wrangler.jsonc.");
}

console.log("OpenNext Worker export validation passed: DOQueueHandler is present.");

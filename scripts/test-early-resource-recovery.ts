import assert from "node:assert/strict";
import vm from "node:vm";
import { EARLY_RESOURCE_RECOVERY_SCRIPT } from "../src/lib/early-resource-recovery";

type ResourceErrorHandler = (event: { target?: { href?: string; src?: string } }) => void;

const listeners: ResourceErrorHandler[] = [];
const storage = new Map<string, string>();
let reloadCount = 0;
let now = 1_000;
const context = {
  Date: { now: () => now },
  isFinite: Number.isFinite,
  window: {
    addEventListener(_type: string, handler: ResourceErrorHandler) {
      listeners.push(handler);
    },
    location: {
      href: "https://priceai.cc/channels",
      reload() {
        reloadCount += 1;
      },
    },
    sessionStorage: {
      getItem(key: string) {
        return storage.get(key) ?? null;
      },
      setItem(key: string, value: string) {
        storage.set(key, value);
      },
    },
  },
};

vm.runInNewContext(EARLY_RESOURCE_RECOVERY_SCRIPT, context);
listeners.at(-1)?.({ target: { href: "https://priceai.cc/_next/static/css/old.css?dpl=old" } });
assert.equal(reloadCount, 1, "an initial stale stylesheet should trigger a hard reload");

now += 500;
vm.runInNewContext(EARLY_RESOURCE_RECOVERY_SCRIPT, context);
listeners.at(-1)?.({ target: { src: "https://priceai.cc/_next/static/chunks/old.js?dpl=old" } });
assert.equal(reloadCount, 1, "the session guard should prevent a reload loop on the same page");

now += 10_000;
listeners.at(-1)?.({ target: { src: "https://priceai.cc/content.js" } });
assert.equal(reloadCount, 1, "browser extension and unrelated resource failures must be ignored");

console.log("early resource recovery test passed");

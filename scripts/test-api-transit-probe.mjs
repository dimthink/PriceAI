#!/usr/bin/env node

import assert from "node:assert/strict";
import { __test } from "./probe-api-transit.mjs";

assert.equal(__test.normalizeFamily("google/gemini-3.5-flash"), "gemini");
assert.equal(__test.normalizeFamily("zhipu/glm-5.2"), "glm");
assert.equal(__test.normalizeFamily("deepseek-v4-pro"), "deepseek");

assert.deepEqual(__test.keywordsForStandardModel("Gemini 3.1 Pro"), ["gemini", "pro", "3.1"]);
assert.deepEqual(__test.keywordsForStandardModel("DeepSeek V4 Flash"), ["deepseek", "flash", "4"]);

const geminiTargets = __test.selectProbeTargets({
  profileFamily: "gemini",
  configuredTargets: [],
  offerModels: [],
  availableModels: ["google/gemini-3.1-pro-preview", "google/gemini-3.5-flash"],
  targetLimit: 4,
});
assert.deepEqual(
  geminiTargets.map((target) => [target.family, target.standardModel, target.modelId]),
  [
    ["gemini", "Gemini 3.5 Flash", "google/gemini-3.5-flash"],
    ["gemini", "Gemini 3.1 Pro", "google/gemini-3.1-pro-preview"],
  ],
);

const deepseekTargets = __test.selectProbeTargets({
  profileFamily: "deepseek",
  configuredTargets: [],
  offerModels: [],
  availableModels: ["deepseek/deepseek-v4-pro"],
  targetLimit: 4,
});
assert.deepEqual(
  deepseekTargets.map((target) => [target.family, target.standardModel, target.modelId]),
  [
    ["deepseek", "DeepSeek V4 Pro", "deepseek/deepseek-v4-pro"],
    ["deepseek", "DeepSeek V4 Flash", null],
  ],
);

console.log("api transit probe target test passed");

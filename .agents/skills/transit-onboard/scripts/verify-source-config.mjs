#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";

const options = parseArgs(process.argv.slice(2));
const sourceId = stringValue(options.source);
if (!sourceId) fail("Missing --source=<source-id>.");

const configPath = path.resolve(options.config || "config/api-transit-sources.json");
const sources = JSON.parse(await readFile(configPath, "utf8"));
if (!Array.isArray(sources)) fail("Source config must be a JSON array.");

const matches = sources.filter((source) => source?.id === sourceId);
const errors = [];
const warnings = [];

if (matches.length !== 1) {
  errors.push(`Expected exactly one source with id ${sourceId}; found ${matches.length}.`);
}

const source = matches[0] || {};
for (const field of ["id", "name", "websiteUrl", "apiBaseUrl", "pricingUrl", "pricingEndpointUrl", "collectorKind"] ) {
  if (!stringValue(source[field])) errors.push(`Missing required field: ${field}.`);
}

for (const field of ["websiteUrl", "apiBaseUrl", "pricingUrl", "pricingEndpointUrl", "monitorUrl", "monitorEndpointUrl"]) {
  if (!source[field]) continue;
  const result = validatePublicUrl(source[field]);
  if (result) errors.push(`${field}: ${result}`);
}

if (source.autoPublish !== false) errors.push("Draft source must set autoPublish=false.");
if (!stringValue(source.stationSystem)) warnings.push("stationSystem is missing; confirm the platform type.");
if (!stringValue(source.rechargeRatio)) warnings.push("rechargeRatio is missing; keep the pricing caveat explicit.");
if (!stringValue(source.operatorType)) warnings.push("operatorType is missing; prefer unknown over inference.");
if (!stringValue(source.invoiceSupport)) warnings.push("invoiceSupport is missing; prefer unknown over inference.");
if (!Array.isArray(source.riskLabels) || !source.riskLabels.length) warnings.push("riskLabels is empty.");
if (!Array.isArray(source.verificationEvents) || !source.verificationEvents.length) {
  warnings.push("verificationEvents is empty; public evidence will not be auditable.");
}
if (source.monitorUrl && !source.monitorEndpointUrl) {
  warnings.push("monitorUrl exists without monitorEndpointUrl; do not claim structured availability.");
}

const output = {
  ok: errors.length === 0,
  sourceId,
  configPath,
  source: matches.length === 1
    ? {
        name: source.name,
        collectorKind: source.collectorKind,
        stationSystem: source.stationSystem || null,
        autoPublish: source.autoPublish,
        pricingUrl: source.pricingUrl,
        pricingEndpointUrl: source.pricingEndpointUrl,
        monitorUrl: source.monitorUrl || null,
        monitorEndpointUrl: source.monitorEndpointUrl || null,
      }
    : null,
  errors,
  warnings,
};

console.log(JSON.stringify(output, null, 2));
if (errors.length) process.exitCode = 1;

function validatePublicUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return "must use HTTP(S).";
    if (!url.hostname) return "hostname is missing.";
    return null;
  } catch {
    return "invalid URL.";
  }
}

function stringValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

function parseArgs(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      console.log("Usage: verify-source-config.mjs --source=<source-id> [--config=<path>]");
      process.exit(0);
    }
    if (!arg.startsWith("--")) continue;
    const [key, inlineValue] = arg.slice(2).split("=", 2);
    const next = args[index + 1];
    if (inlineValue !== undefined) parsed[key] = inlineValue;
    else if (next && !next.startsWith("--")) {
      parsed[key] = next;
      index += 1;
    } else parsed[key] = true;
  }
  return parsed;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

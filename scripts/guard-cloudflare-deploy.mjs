const allowDeploy = process.env.PRICEAI_ALLOW_DIRECT_CLOUDFLARE_DEPLOY === "1";

if (!allowDeploy) {
  console.error(
    [
      "Direct Cloudflare deploy is disabled.",
      "Upload a Worker Version, stage it at 0%, smoke it with a version override, then promote the exact version ID to 100%.",
      "Set PRICEAI_ALLOW_DIRECT_CLOUDFLARE_DEPLOY=1 only for an intentional emergency deploy.",
    ].join("\n"),
  );
  process.exit(1);
}

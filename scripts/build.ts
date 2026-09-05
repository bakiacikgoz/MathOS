import { resolve } from "node:path";
import solidPlugin from "@opentui/solid/bun-plugin";
import { prepareDevelopmentBuildOutput } from "./build-output.ts";

const root = resolve(import.meta.dir, "..");
const outdir = resolve(root, "dist");
const solidClientRuntimePlugin: Bun.BunPlugin = {
  name: "solid-client-runtime",
  setup(build) {
    build.onResolve({ filter: /^solid-js$/ }, () => ({ path: "solid-js/dist/solid.js", external: true }));
  },
};

prepareDevelopmentBuildOutput(outdir);

const result = await Bun.build({
  entrypoints: [resolve(root, "apps/tui/src/cli.ts")],
  outdir,
  target: "bun",
  packages: "external",
  plugins: [solidClientRuntimePlugin, solidPlugin],
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

console.log(`Built ${result.outputs.length} artifact(s) in ${outdir}`);

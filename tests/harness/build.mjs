// Bundles the harness page with esbuild. Production TS/TSX is instrumented by Istanbul
// before esbuild sees it, so counters point at lines of the original source files.
import { readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { build } from "esbuild";
import { instrument } from "../../scripts/quality-instrument.mjs";

export function isProduction(root, file) {
  const rel = relative(root, file);
  return /\.tsx?$/.test(rel) && !/\.d\.ts$/.test(rel) && !rel.startsWith("..") &&
    !rel.split(sep).some(part => ["node_modules", "tests", "scripts", "dist", "coverage"].includes(part));
}

export async function buildPage(root) {
  const instrumented = new Set();
  const istanbul = {
    name: "istanbul",
    setup(b) {
      b.onLoad({ filter: /\.tsx?$/ }, ({ path }) => {
        if (!isProduction(root, path)) return undefined;
        instrumented.add(path);
        return { contents: instrument(readFileSync(path, "utf8"), path), loader: path.endsWith("x") ? "tsx" : "ts" };
      });
    },
  };
  const { outputFiles } = await build({
    entryPoints: [join(root, "tests/fake-bb/page.tsx")],
    absWorkingDir: root,
    bundle: true,
    write: false,
    outdir: join(root, "coverage/.harness"),
    format: "iife",
    target: "es2022",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"development"' },
    logLevel: "error",
    plugins: [istanbul],
  });
  const asset = ext => outputFiles.find(f => f.path.endsWith(ext))?.text ?? "";
  return { js: asset(".js"), css: asset(".css"), instrumented: [...instrumented] };
}

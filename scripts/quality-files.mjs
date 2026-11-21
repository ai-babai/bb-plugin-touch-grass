// Begin with tsconfig and follow actual imports so moving a module into a
// subdirectory cannot remove it from the quality gate.
import { readFileSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";
import ts from "typescript";

export function productionFiles(root = process.cwd()) {
  const config = ts.readConfigFile(join(root, "tsconfig.json"), ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
  const program = ts.createProgram(parsed.fileNames, parsed.options);
  const files = program.getSourceFiles()
    .filter(file => !file.isDeclarationFile && !program.isSourceFileFromExternalLibrary(file))
    .map(file => relative(root, file.fileName).split("\\").join("/"))
    .filter(file => !isAbsolute(file) && !file.startsWith("../"))
    .sort();
  const { bb } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  for (const entry of [bb.server, bb.app]) {
    if (!files.includes(entry.replace(/^\.\//, ""))) throw new Error(`Unmeasured plugin entry: ${entry}`);
  }
  return files;
}

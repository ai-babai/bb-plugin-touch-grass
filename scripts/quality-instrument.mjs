// Istanbul instrumentation of original TS/TSX (Babel parser, no type stripping first),
// so statement positions are positions in the source file. Shared by the server tests
// (executable instrumented code) and by the quality report (the canonical map of
// executable statements for every production file, covered or not).
import { createInstrumenter } from "istanbul-lib-instrument";

const options = { esModules: true, compact: false, produceSourceMap: false, parserPlugins: ["typescript", "jsx"] };

export function instrument(source, file) {
  return createInstrumenter(options).instrumentSync(source, file);
}

export function emptyCoverage(source, file) {
  const instrumenter = createInstrumenter(options);
  instrumenter.instrumentSync(source, file);
  return instrumenter.lastFileCoverage();
}

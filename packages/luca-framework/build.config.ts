import { defineBuildConfig } from "unbuild";

export default defineBuildConfig({
  entries: ["src/index", "src/state/index", "src/state/bridge"],
  clean: true,
  declaration: true,
  rollup: {
    emitCJS: true,
    inlineDependencies: true,
  },
  externals: [
    "citty",
    "consola",
    "@clack/prompts",
    "pathe",
    "defu",
    "pkg-types",
    "fs-extra",
    "xstate",
    "zod",
    "lodash",
  ],
});

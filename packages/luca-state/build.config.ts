import { defineBuildConfig } from "unbuild";

export default defineBuildConfig({
  entries: ["src/index", "src/bridge"],
  clean: true,
  declaration: true,
  rollup: {
    emitCJS: true,
  },
  externals: ["xstate", "zod", "lodash"],
});

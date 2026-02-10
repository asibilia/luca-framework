import { defineBuildConfig } from 'unbuild';

export default defineBuildConfig({
  entries: ['src/index'],
  clean: true,
  declaration: true,
  rollup: {
    emitCJS: true,
    inlineDependencies: true,
  },
  externals: ['citty', 'consola', '@clack/prompts', 'pathe', 'defu', 'pkg-types', 'fs-extra'],
});

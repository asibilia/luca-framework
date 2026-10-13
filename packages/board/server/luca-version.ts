/**
 * The Luca version of this board. In the repo's source it is the dev value;
 * the publish package's pack step overwrites this file in its copy of the
 * board with the package's version. It lives in code, not a file read at
 * runtime, because Paseo bundles the board's server and runs the bundle
 * from another folder (#477).
 */
export const LUCA_VERSION: string = 'dev (source)'

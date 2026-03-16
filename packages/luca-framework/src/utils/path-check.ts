import { delimiter } from "node:path";

/**
 * Check whether a directory is included in the current PATH environment variable.
 *
 * Splits `process.env.PATH` on the platform-appropriate delimiter and checks
 * if any entry matches the given directory exactly. This is a synchronous,
 * read-only check that does not modify the environment.
 *
 * @param dir - Absolute path to the directory to check.
 * @returns `true` if the directory is on PATH, `false` otherwise.
 *
 * @example
 * ```typescript
 * if (!isOnPath('/Users/you/.luca/bin')) {
 *   console.log('Add ~/.luca/bin to your PATH');
 * }
 * ```
 */
export function isOnPath(dir: string): boolean {
  const pathEnv = process.env.PATH ?? "";
  const entries = pathEnv.split(delimiter);
  return entries.includes(dir);
}

/**
 * Return shell-specific guidance for adding a directory to PATH.
 *
 * Detects the user's shell from `process.env.SHELL` and returns an
 * actionable string with the exact command and config file to edit.
 * Supports bash, zsh, and fish. Falls back to a generic POSIX example
 * for unrecognized shells.
 *
 * @param dir - Absolute path to the directory to add to PATH.
 * @returns A multi-line guidance string with shell-specific instructions.
 *
 * @example
 * ```typescript
 * const guidance = getPathGuidance('/Users/you/.luca/bin');
 * console.log(guidance);
 * // Add to your shell config (~/.zshrc):
 * //   export PATH="/Users/you/.luca/bin:$PATH"
 * ```
 */
export function getPathGuidance(dir: string): string {
  const shell = process.env.SHELL ?? "";
  const shellName = shell.split("/").pop() ?? "";

  switch (shellName) {
    case "zsh":
      return [
        "Add to your shell config (~/.zshrc):",
        `  export PATH="${dir}:$PATH"`,
        "",
        "Then reload:",
        "  source ~/.zshrc",
      ].join("\n");

    case "bash":
      return [
        "Add to your shell config (~/.bashrc or ~/.bash_profile):",
        `  export PATH="${dir}:$PATH"`,
        "",
        "Then reload:",
        "  source ~/.bashrc",
      ].join("\n");

    case "fish":
      return [
        "Add to your fish config (~/.config/fish/config.fish):",
        `  fish_add_path ${dir}`,
        "",
        "Then reload:",
        "  source ~/.config/fish/config.fish",
      ].join("\n");

    default:
      return ["Add to your shell config:", `  export PATH="${dir}:$PATH"`].join(
        "\n",
      );
  }
}

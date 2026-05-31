export interface ProjectContext {
    /** Whether package.json exists */
    hasPackageJson: boolean
    /** Whether .git directory exists */
    hasGit: boolean
    /** Whether Luca is already installed (.luca/ directory exists) */
    hasLuca: boolean
    /** Detected stack from dependencies */
    detectedStack: 'react-ts' | 'react' | 'node-ts' | 'node' | 'unknown'
    /** Whether TypeScript is configured */
    hasTypeScript: boolean
    /** Project name from package.json */
    projectName: string | null
    /** Project description from package.json */
    projectDescription?: string | null
    /** Whether the project has existing source code (src/, app/, or lib/) */
    hasExistingSource?: boolean
}

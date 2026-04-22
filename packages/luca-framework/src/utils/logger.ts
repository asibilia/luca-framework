import { consola, createConsola } from 'consola'

// Create tagged logger for Luca
export const log = consola.withTag('luca')

// Styled helpers for consistent UX
export const logger = {
    /** Starting a process */
    start: (message: string) => log.start(message),

    /** Success message */
    success: (message: string) => log.success(message),

    /** Informational message */
    info: (message: string) => log.info(message),

    /** Warning - not fatal but noteworthy */
    warn: (message: string) => log.warn(message),

    /** Error - operation failed */
    error: (message: string | Error) => log.error(message),

    /** Debug - only in verbose mode */
    debug: (message: string) => log.debug(message),

    /** Boxed summary output */
    box: (content: string) => consola.box(content),

    /** Styled step indicator */
    step: (number: number, total: number, message: string) => {
        log.info(`[${number}/${total}] ${message}`)
    },
}

// Export consola for direct access when needed
export { consola }

/**
 * Provider launcher factory selecting Claude or Antigravity (`agy`) (#782).
 */
import { createAgyLauncher } from './agy-launcher'
import { createClaudeLauncher } from './claude-launcher'
import type { ProviderId } from './provider'

import type { RunLauncher } from '../cli/run-end'

/**
 * Creates the `RunLauncher` for `provider` (`'claude'` or `'agy'`).
 */
export const createProviderLauncher = ({
    provider,
}: {
    provider: ProviderId
}): RunLauncher =>
    provider === 'agy' ? createAgyLauncher({}) : createClaudeLauncher({})

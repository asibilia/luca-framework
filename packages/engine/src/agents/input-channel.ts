import type { SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'

/** A queue the SDK reads the agent's prompt from (streaming-input mode). */
export const createInputChannel = () => {
    const queue: SDKUserMessage[] = []
    let wake: (() => void) | null = null
    let closed = false
    const poke = () => {
        wake?.()
        wake = null
    }
    const iterate = async function* (): AsyncGenerator<SDKUserMessage> {
        while (true) {
            const next = queue.shift()
            if (next !== undefined) {
                yield next
                continue
            }
            if (closed) return
            await new Promise<void>((resolve) => {
                wake = resolve
            })
        }
    }
    return {
        push: (message: SDKUserMessage) => {
            queue.push(message)
            poke()
        },
        close: () => {
            closed = true
            poke()
        },
        iterable: iterate(),
    }
}

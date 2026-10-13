import { formatPrice } from './format'

/** The port the price server listens on. Fixed, so every test run uses the same one. */
export const PORT = 4000

const PRICES: Record<string, number> = { apple: 120, pear: 95, plum: 1999 }

/** Starts the price server: GET /price/<item> answers the item's price as text. */
export const startServer = () =>
    Bun.serve({
        port: PORT,
        fetch: (request) => {
            const item = new URL(request.url).pathname.replace('/price/', '')
            const cents = PRICES[item]
            return cents === undefined
                ? new Response('not found', { status: 404 })
                : new Response(formatPrice(cents), {
                      headers: { 'content-type': 'text/plain' },
                  })
        },
    })

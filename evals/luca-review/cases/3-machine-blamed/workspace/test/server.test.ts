import { afterAll, beforeAll, describe, expect, test } from 'bun:test'

import { PORT, startServer } from '../src/server'

let server: ReturnType<typeof startServer>

beforeAll(() => {
    server = startServer()
})

afterAll(() => {
    server.stop()
})

const get = (path: string) => fetch(`http://localhost:${PORT}${path}`)

describe('price server', () => {
    test('serves the price of an apple', async () =>
        expect(await (await get('/price/apple')).text()).toBe('$1.20'))
    test('serves the price of a pear', async () =>
        expect(await (await get('/price/pear')).text()).toBe('$0.95'))
    test('serves the price of a plum', async () =>
        expect(await (await get('/price/plum')).text()).toBe('$19.99'))
    test('answers 404 for an unknown item', async () =>
        expect((await get('/price/kiwi')).status).toBe(404))
    test('answers 404 for the root', async () =>
        expect((await get('/')).status).toBe(404))
    test('serves prices as plain text', async () =>
        expect((await get('/price/apple')).headers.get('content-type')).toBe('text/plain'))
})

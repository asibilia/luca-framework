/** Prices for the call-count job. */
export const parsePrice = (text: string): number => Number(text.replace(/[^0-9.]/g, ''))

export const applyDiscount = (price: number, percent: number): number =>
    price * (1 - percent / 100)

export const formatPrice = (price: number): string => `$${price.toFixed(2)}`

export const total = (prices: number[]): number =>
    prices.reduce((sum, price) => sum + price, 0)

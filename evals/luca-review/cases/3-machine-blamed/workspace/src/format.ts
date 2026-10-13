/** A price in cents, rounded to a whole cent first, as dollars: 100.5 → "$1.01". */
export const formatPrice = (cents: number): string =>
    `$${(Math.round(cents) / 100).toFixed(2)}`

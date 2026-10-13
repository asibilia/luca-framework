import { applyDiscount, formatPrice, parsePrice, total } from './lib'

const RAW = ['$1.20', '$0.95', '$19.99', '$4.50']

const prices = RAW.map(parsePrice)
const discounted = prices.map((price) => applyDiscount(price, 10))
for (const price of discounted) console.log(formatPrice(price))
console.log(`total ${formatPrice(total(discounted))}`)

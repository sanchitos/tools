/** Format a JMD amount, e.g. 49999 -> "J$49,999.00". */
const jmd = new Intl.NumberFormat('en-JM', {
  style: 'currency',
  currency: 'JMD',
  currencyDisplay: 'narrowSymbol',
});

export function formatPrice(amount: number): string {
  // en-JM narrow symbol renders "$"; prefix J to disambiguate from USD.
  const formatted = jmd.format(amount);
  return formatted.startsWith('J') ? formatted : `J${formatted}`;
}

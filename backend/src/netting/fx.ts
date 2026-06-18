/** A fixed FX rate: 1 unit of `base` = `rate` units of `quote`. */
export interface FxRate {
  base: string;
  quote: string;
  rate: number;
}

/**
 * Convert `amount` of `from` currency into `to` currency using fixed rates.
 * Same-currency is identity; otherwise look up the (from -> to) rate and multiply.
 * Mirrors `AtomicNet.Fx.convert` in the Daml model.
 */
export function convert(rates: FxRate[], from: string, to: string, amount: number): number {
  if (from === to) return amount;
  const r = rates.find((x) => x.base === from && x.quote === to);
  if (!r) throw new Error(`convert: no FX rate for ${from} -> ${to}`);
  return amount * r.rate;
}

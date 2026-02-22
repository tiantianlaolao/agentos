/**
 * Currency Exchange Skill Handler
 * Uses frankfurter.app — free, no API key required.
 */
import type { SkillHandler } from '../registry.js';

const BASE_URL = 'https://api.frankfurter.app';

const getExchangeRate: SkillHandler = async (args) => {
  const from = (args.from as string).toUpperCase();
  const to = (args.to as string).toUpperCase();
  const amount = (args.amount as number) || 1;

  const url = `${BASE_URL}/latest?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&amount=${amount}`;

  const response = await fetch(url, {
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    const text = await response.text();
    return JSON.stringify({ error: `Exchange rate API error: ${response.status} ${text}` });
  }

  const data = await response.json() as { base: string; date: string; rates: Record<string, number> };
  const rate = data.rates[to];

  if (rate === undefined) {
    return JSON.stringify({ error: `Currency "${to}" not found in response` });
  }

  return JSON.stringify({
    from,
    to,
    amount,
    rate: amount === 1 ? rate : rate / amount,
    converted: rate,
    date: data.date,
  });
};

export const handlers: Record<string, SkillHandler> = {
  get_exchange_rate: getExchangeRate,
};

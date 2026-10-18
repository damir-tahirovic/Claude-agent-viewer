import type { Tokens } from './model'
import { shortModel } from './format'

/** USD per million tokens for one model. */
export type Price = {
  readonly input: number
  readonly output: number
  readonly cacheRead: number
  readonly cacheWrite: number
}

/**
 * USD per million tokens, keyed by short model id.
 * Source: claude-api skill pricing (cached 2026-10-06), read 2026-10-18. Cache write = 5-minute TTL
 * (1.25x input). Haiku prices are for prompts up to 100K tokens.
 */
export const PRICES: Readonly<Record<string, Price>> = {
  'opus-5-5': { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  'sonnet-5-5': { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  'haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  'fable-5-1': { input: 10, output: 50, cacheRead: 0.25, cacheWrite: 12.5 },
}

/** Price for a short model id; a dated id such as `sonnet-5-5-20261001` matches by its prefix. */
const priceOf = (shortId: string): Price | undefined => {
  const key = Object.keys(PRICES)
    .filter(known => shortId === known || shortId.startsWith(known + '-'))
    .sort((a, b) => b.length - a.length)[0]
  return key === undefined ? undefined : PRICES[key]
}

/** An agent at or above this cost is expensive on its own, in USD. */
export const EXPENSIVE_COST = 0.5
/** Share of the session cost from which an agent is expensive, when the cost is not trivial. */
export const EXPENSIVE_SHARE = 0.4
/** Below this cost the share rule is ignored: 40% of a few cents is not worth a warning. */
export const MIN_SHARE_COST = 0.05

/**
 * Whether an agent's cost deserves the warning mark: at least $0.50, or a big share of the session cost.
 * The share rule needs a non-trivial cost and a second agent with cost, since one agent is always 100%.
 */
export const isExpensive = (cost: number, sessionCost: number, agentsWithCost: number): boolean =>
  cost >= EXPENSIVE_COST ||
  (sessionCost > 0 && cost / sessionCost >= EXPENSIVE_SHARE && cost >= MIN_SHARE_COST && agentsWithCost >= 2)

/** Estimated USD cost of the given tokens; an unknown model costs 0 instead of guessing. */
export const costOf = (model: string | undefined, tokens: Tokens): number => {
  const price = priceOf(shortModel(model))
  if (!price) return 0
  const weighted =
    tokens.input * price.input +
    tokens.output * price.output +
    tokens.cacheRead * price.cacheRead +
    tokens.cacheWrite * price.cacheWrite
  return weighted / 1e6
}

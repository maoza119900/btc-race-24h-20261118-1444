// btc-race-24h-20261118-1444: Donchian breakout + staged take-profit + trailing stop.
//
// Idea: on 1-minute bars the market is mostly noise (1m return stdev ~7bps) while a
// full-size round trip costs ~26-32bps in fee, slippage and pool impact, so frequent
// trading loses by construction. The only tradeable structure in a 24h window is a
// multi-hour trend leg. This bot therefore sits in cash almost all day, enters once
// on a confirmed breakout of the trailing 90-bar high, banks half the position at
// +100bps, and lets the rest ride behind an 80bps trailing stop (with hard +200bps
// take-profit / -200bps stop-loss). All decisions are integer (bigint) comparisons
// on the bars the harness sends; no clock, no randomness, no environment, no files,
// so two runs on the same data answer every batch identically.
//
// Protocol: agent-fun/bars-replay/v1, via the kit SDK shim in vendor/.
// Orders decided on the batch of the bar closing at minute t fill at the open of
// the next bar, so every signal below is evaluated on closes the bot has already
// seen; the entry reference price is the close of the decision bar.

import { runBars } from './vendor/makefun-bars.ts';
import type { BarsState, Batch, OrderInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';

// --- strategy parameters (see SPEC.md for the offline grid search) ---
const LOOKBACK_BARS = 90; // breakout window: highest high of the last 90 bars
const BREAKOUT_CONFIRM_BPS = 20n; // entry needs close >= 90-bar high * (1 + 20bps)
const TAKE_PROFIT_BPS = 200n; // full exit at +200bps from the entry close
const PARTIAL_AT_BPS = 100n; // sell half the position at +100bps (tp / 2)
const TRAILING_STOP_BPS = 80n; // full exit when close falls 80bps below the peak close
const STOP_LOSS_BPS = 200n; // full exit at -200bps from the entry close
const MAX_SLIPPAGE_BPS = 200; // per-order cap vs the latest close
const BPS = 10_000n;

// --- per-run state (all derived from the bars in the batches, nothing else) ---
const highs: bigint[] = []; // high of every bar seen, in order
let inPosition = false;
let entryClose = 0n; // close of the bar on which the buy was decided
let peakClose = 0n; // highest close seen since entry
let halfSold = false; // the +100bps partial sale already happened

/** Highest high of the `n` bars before the latest one (the current bar excluded). */
function trailingHigh(n: number): bigint | null {
  // highs[] holds every bar so far including the current one; the window is the
  // n bars before it, so we need at least n + 1 bars of history.
  if (highs.length <= n) return null;
  let h = 0n;
  for (let i = highs.length - 1 - n; i < highs.length - 1; i++) {
    if (highs[i] > h) h = highs[i];
  }
  return h;
}

/** bps move of `price` vs `ref`, truncated toward zero, as a bigint. */
function moveBps(price: bigint, ref: bigint): bigint {
  return ((price - ref) * BPS) / ref;
}

await runBars({
  onBatch(state: BarsState, batch: Batch): OrderInput[] {
    const bar = batch.bars.find((b) => b.symbol === SYMBOL);
    if (bar === undefined) return []; // CBBTC absent from this minute: no bar, no trade
    const close = BigInt(bar.c);
    const high = BigInt(bar.h);
    highs.push(high);

    const held = state.positions.get(SYMBOL);
    const qty = held === undefined ? 0n : held.qty;

    // --- flat: look for a confirmed breakout of the trailing 90-bar high ---
    if (!inPosition) {
      // A buy decided on a warm-up batch would be rejected; the dev kit has no
      // warm-up, and the guard below also keeps us out until history is full.
      if (state.warmingUp) return [];
      const hh = trailingHigh(LOOKBACK_BARS);
      if (hh === null) return [];
      // close >= hh * (1 + 20bps), in integers: close * 10000 >= hh * 10020.
      if (close * BPS >= hh * (BPS + BREAKOUT_CONFIRM_BPS)) {
        const cash = state.cash;
        if (cash <= 0n) return [];
        inPosition = true;
        entryClose = close;
        peakClose = close;
        halfSold = false;
        return [{ side: 'buy', symbol: SYMBOL, notional_quote_units: cash, max_slippage_bps: MAX_SLIPPAGE_BPS }];
      }
      return [];
    }

    // --- in a position: manage the exit. The position may not have filled yet
    // (a buy fills at the next bar's open), so only exit once we actually hold it.
    if (qty <= 0n) return [];
    if (close > peakClose) peakClose = close;
    const gain = moveBps(close, entryClose);
    const pullback = moveBps(peakClose, close); // >= 0: how far below the peak we are

    // Partial take-profit first: bank half at +100bps, keep riding the rest.
    if (!halfSold && gain >= PARTIAL_AT_BPS) {
      halfSold = true;
      const half = qty / 2n;
      if (half <= 0n) return [];
      return [{ side: 'sell', symbol: SYMBOL, qty: half, max_slippage_bps: MAX_SLIPPAGE_BPS }];
    }
    // Full exit: hard take-profit, hard stop-loss, or the trailing stop.
    if (gain >= TAKE_PROFIT_BPS || gain <= -STOP_LOSS_BPS || pullback >= TRAILING_STOP_BPS) {
      inPosition = false;
      halfSold = false;
      return [{ side: 'sell', symbol: SYMBOL, qty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
    }
    return [];
  },
});

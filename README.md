# btc-race-24h-20261118-1444

[![make.fun · btc-race-24h-20261118-1444](https://make.fun/badge/btc-race-24h-20261118-1444.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)
[![rank](https://make.fun/badge/btc-race-24h-20261118-1444/maoza119900/btc-race-24h-20261118-1444/rank.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)
[![reward](https://make.fun/badge/btc-race-24h-20261118-1444/maoza119900/btc-race-24h-20261118-1444/reward.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)

A BTC trading bot that trades Coinbase Wrapped BTC (cbBTC) against USDC minute by minute on replayed on-chain prices. Built by an AI agent for make.fun's "Race a BTC trading bot live for 24 hours" bounty, $250 in USDC.

## Strategy

Donchian breakout + staged take-profit + trailing stop. On 1-minute bars the market is mostly noise (1m return stdev ~7bps) while a full-size round trip costs ~26-32bps in fee, slippage and pool impact, so frequent trading loses by construction. The bot therefore sits in cash almost all day, enters once on a confirmed breakout of the trailing 90-bar high, banks half the position at +100bps, and lets the rest ride behind an 80bps trailing stop (hard +200bps take-profit / -200bps stop-loss). All decisions are integer (bigint) comparisons on the bars the harness sends; no clock, no randomness, no environment, no files, so two runs on the same data answer every batch identically.

Dev window (24h before the bounty opened): net PnL +$6.17, 3 trades, max drawdown 0.64%, deterministic across repeated runs.

## Run it

```sh
node main.ts
```

The bot speaks `agent-fun/bars-replay/v1`: newline-delimited JSON on stdin/stdout, one batch per minute, one reply per batch. Requires Node 22.18 or later (TypeScript runs through Node's type stripping; erasable syntax only).

---

<sub>Entered on [make.fun](https://make.fun/?ref=tg8sjp12&utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444) · AI agents build software for cash rewards</sub>

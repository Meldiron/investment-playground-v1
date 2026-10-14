# Because Life Happens v1 · Hockey Stick Playground

Every investing talk shows the same chart: money goes in, the line curves up, a huge number at 65. This playground starts from that chart and lets you switch on what it leaves out.

Live: https://investment-playground-v1.surge.sh · Simpler version: [Because Life Happens](https://github.com/Meldiron/because-life-happens)

- **Retirement payouts** – stop investing at a chosen age, take a monthly payout, and see when the money runs out. The brochure line keeps going too, so you can see how long the marketed scenario would last.
- **Life events** – drag a down payment, new car, kitchen, pet surgery and more onto the timeline. Pay by pausing contributions or by selling investments, and compare the cost of each.
- **Market swings** – 400 simulated markets with adjustable volatility, a draggable market crash, and a sequence-of-returns comparison (same yearly returns, different order).
- **Inflation and fees** – payouts and costs rise with prices, including faster-rising costs in retirement; switch the chart to today's money.

## Run locally

Open `index.html` in a browser. D3 and fonts load from CDNs, so an internet connection is needed.

## Deploy

Every push to `main` deploys to Surge through GitHub Actions (`SURGE_LOGIN` and `SURGE_TOKEN` repository secrets). To deploy by hand: `surge .`

Not financial advice.

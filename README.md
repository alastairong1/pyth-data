# Metrics Collector

A single TypeScript collector ingests three data sources on Base mainnet and stores them in a shared SQLite database for downstream analytics (for example Grafana):

- **Pyth prices** for all configured tickers via HyperSync logs.
- **Executed trades** from the Rain orderbook subgraph since the last successful run.
- **Current orderbook quotes** (remaining liquidity) for tracked orders, classified as buy/sell with calculated USDC prices.

The collector writes snapshots into `/data/metrics.db` (configurable) using `better-sqlite3`. All transformations normalise quote/trade direction (`BUY` = output token is USDC, `SELL` = input token is USDC) and convert the on-chain ratio into a human readable USDC price. Quotes with zero remaining liquidity are skipped.

## Repository Layout

```
collector/
  package.json        # Node project (TypeScript, build scripts)
  tsconfig.json
  src/                # Collector sources (entrypoint: index.ts)
  Dockerfile          # Multi-stage image for the collector
```

The root `docker-compose.yml` also brings up Grafana with the SQLite plugin pre-installed so you can explore the database directly.

## Environment

Create a `.env` file at the repository root (Compose loads it automatically). Example:

```env
# SQLite database location (inside the container)
DATABASE_PATH=/data/metrics.db

# Initial backfill hints for the first run only
PYTH_START_BLOCK=36613177
TRADES_START_TIMESTAMP=1760015700
# Optional: capture orderbook snapshots every N blocks (default: latest block only)
QUOTE_BLOCK_INTERVAL=10

# Optional Grafana credentials
GF_ADMIN_USER=admin
GF_ADMIN_PASSWORD=admin123
```

After the first successful collection the latest block/timestamp are persisted in the `metadata` table, so future runs automatically resume from where they stopped.

## Local Development

```bash
cd collector
npm install
npm run build          # Type-checks and emits dist/
npm run dev            # Run once without building (tsx)
# or
npm run start          # Requires a previous npm run build
```

The collector honours the same `.env` when run locally.

### Available Scripts

- `npm run build` – compile TypeScript to `dist/`.
- `npm run dev` – execute the collector directly with `tsx` (ideal during development).
- `npm run start` – run the compiled JavaScript from `dist/`.
- `npm run typecheck` – static type check without emitting output.

`QUOTE_BLOCK_INTERVAL` controls how frequently orderbook snapshots are captured. If unset or `0`, the collector records a single snapshot at the latest head block. When set to a positive integer (for example `10`), it records a snapshot each time that many blocks have elapsed since the most recent stored snapshot.

## Docker Compose

```bash
docker compose up --build
```

Services:
- `collector` builds from `collector/Dockerfile`, mounts the shared `data` volume, and refreshes the SQLite database on each run.
- `grafana` exposes port `3000`, preinstalls the SQLite data source plugin, and mounts the same `data` volume read-only so dashboards can read `metrics.db`.

The collector container exits after finishing a run; configure an external scheduler (cron, systemd timer, etc.) if you need periodic execution.

## SQLite Schema

- `metadata(key TEXT PRIMARY KEY, value TEXT NOT NULL)` – offsets such as `last_pyth_block`, `last_trade_timestamp`, `last_quote_block`, `last_run_at`.
- `pyth_prices` – raw Pyth updates (ticker, publish time, raw price/confidence, block and tx id).
- `trades` – executed trades with direction, USDC price, token amounts (raw + decimal adjusted), and metadata.
- `quotes` – latest quoted liquidity per order/spec pair with inferred direction and price. Records are keyed by `orderHash:inputIndex:outputIndex:blockNumber` so each snapshot is preserved.

## Grafana Notes

The `frser-sqlite-datasource` plugin expects the database file at `/data/metrics.db`. Point dashboards at the `quotes`, `trades`, or `pyth_prices` tables and use the metadata keys to scope time ranges if required.

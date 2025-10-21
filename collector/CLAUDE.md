# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a TypeScript data collector that aggregates blockchain data for orders, trades, and Pyth price feeds on the Base network. The collector persists data to a local SQLite database and is designed to be run periodically to collect incremental updates.

**Key Technologies:**
- TypeScript with strict type checking
- SQLite (better-sqlite3) for data persistence with WAL mode
- ethers.js v6 for blockchain interaction
- Rain Language Orderbook SDK for quote execution
- HyperSync for efficient blockchain event indexing
- GraphQL subgraph queries for order data

## Quick Commands

```bash
# Development
npm run dev                  # Run with tsx (no build required)
npm run typecheck           # Run TypeScript compiler in check mode
npm run build               # Compile TypeScript to dist/

# Scripts
npm start                   # Run built application
```

## Architecture Overview

### Data Collection Pipeline

The main collector (`src/index.ts`) orchestrates three parallel collection processes:

1. **Pyth Prices** (`src/pyth.ts`)
   - Queries HyperSync API for `PriceFeedUpdate` events from the Pyth contract
   - Decodes event data to extract ticker symbols, prices, and confidence intervals
   - Stores updates in `pyth_prices` table with block-level checkpointing

2. **Trades** (`src/trades.ts`)
   - Queries the orderbook subgraph for executed trades (historical time-based)
   - Processes vault balance changes to compute input/output amounts
   - Calculates execution prices and stores in `trades` table
   - Time-based incremental collection via `last_trade_timestamp` metadata

3. **Quotes** (`src/orders.ts`)
   - Queries subgraph for active orders at specific block heights
   - Filters orders to include only those with tracked tokens (USDC + stock tokens)
   - Executes quote simulation via `doQuoteSpecs()` from the Rain SDK
   - Stores snapshots in `quotes` table (block-based)

### Database Schema

Four SQLite tables with `INSERT OR IGNORE/REPLACE` semantics:
- `metadata`: Key-value store for tracking collection progress
- `pyth_prices`: Raw price updates with block references
- `trades`: Executed trades with computed prices and amounts
- `quotes`: Order state snapshots at specific blocks

Database features: WAL mode, foreign keys enabled, PRAGMA optimizations for write performance.

### Configuration

Configuration is centralized in `src/config.ts`:
- **Tokens**: `USDC_TOKEN`, `STOCK_TOKENS` (8 tickers), `TRACKED_TOKENS` (combined)
- **Network**: Base mainnet (chainId 8453) with multiple fallback RPC endpoints
- **Pyth Feed IDs**: Mapped to ticker symbols (AMZN, NVDA, TSLA, MSTR, BRK, SPLG, IAU)
- **GraphQL Endpoint**: Goldsky subgraph for orderbook data
- **Environment Variables**: Database path, start blocks, timestamps, and intervals

Environment variable hierarchy (with fallbacks):
- `DATABASE_PATH` → `/data/metrics.db`
- `PYTH_START_BLOCK` or `START_BLOCK` → 0
- `TRADES_START_TIMESTAMP` or `FROM_TIMESTAMP` → 0
- `QUOTE_BLOCK_INTERVAL` or `BLOCK_INTERVAL` → 0

### Data Flow & Persistence

**Checkpointing Strategy:**
- Pyth: Block-based with `CHECKPOINT_INTERVAL_BLOCKS = 50`
- Trades: Unix timestamp-based (`last_trade_timestamp`)
- Quotes: Block-based (`last_quote_block`) with configurable interval

**Quote Block Selection:**
- If `QUOTE_BLOCK_INTERVAL > 0`: Collect at regular intervals (e.g., every 100th block)
- If interval not set: Collect only at the latest block
- Metadata persists last collected block to avoid re-querying

**Error Handling:**
- HyperSync failures: Break collection loop, log error, continue with partial results
- Subgraph query failures: Throw error to halt collection
- Batch quote failures: Log and skip batch, continue with remaining
- Graceful degradation with fallback RPC endpoints for block number queries

## Key Implementation Details

### Order Decoding

Orders are represented as `OrderV3` structs (ABI: owner, evaluable, validInputs[], validOutputs[], nonce). The collector:
- Decodes raw orderBytes using ethers AbiCoder
- Extracts token lists for filtering and quote construction
- Identifies token symbols and decimals
- Maps to known tokens or creates synthetic token objects

### Quote Execution

The Rain SDK's `doQuoteSpecs()` function requires:
- Array of quote specifications (order hash + input/output IO indices)
- Subgraph URL and RPC endpoints
- Target block number
- Returns: max output amount and ratio (scaled to 1e18)

Price calculation:
- SELL direction (stock → USDC): price = ratio
- BUY direction (USDC → stock): price = 1 / ratio

### Pyth Event Decoding

Pyth price feed events contain:
- publish_time (bytes 0-64)
- price (bytes 64-128)
- confidence interval (bytes 128-192)

Feed ID matching via topic1 lookup against configured tickers.

## Development Notes

- **Type Safety**: Strict TypeScript enabled; all external API responses are typed
- **Database**: Transactions used for batch inserts; `INSERT OR IGNORE` prevents duplicates
- **Performance**: Batch query processing (500 orders/page, 50 quotes/batch)
- **Timestamps**: Collection timestamp recorded uniformly; separate from blockchain timestamps
- **Logging**: Console output for collection summaries; errors logged to stderr
- **Testing**: Run `npm run typecheck` before committing; build artifacts in `dist/`

## Script Utilities

Additional utility functions in `src/utils.ts`:
- `hexToBigInt()`: Convert hex strings to BigInt (handles malformed input)
- `formatAmount()`: Convert raw amounts using ethers formatUnits
- `ensureDirectoryForFile()`: Create parent directories for database file
- `getLatestBlockNumber()`: Query latest block across multiple RPC endpoints with retry logic
- `getTokenByAddress()`: Token lookup helper
- `buildQuoteId()`: Deterministic quote ID generation

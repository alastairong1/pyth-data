# Pyth and Stox Data

### Installation

1. Install dependencies:
```bash
nix develop
```
```bash
npm install
```

2. Create a `.env` file in the root directory with the following variables:

```env
# For stoxData.js
FROM_TIMESTAMP=1759567171
TO_TIMESTAMP=9999999999

# For pythData.js
START_BLOCK=36323073
END_BLOCK=36649229
```

## Scripts

### pythData.js

Fetches PriceFeedUpdate events from the Pyth Network contract on Base blockchain.

**Features:**
- Fetches events using HyperSync API with pagination
- Decodes price feed data (price, confidence, publish time)
- Supports multiple stock tickers: GOOG, AMZN, AAPL, MSFT, NVDA, META, GME, MSTR, BRK, SPLG, IAU
- Filters transactions from specific address (0x08b20026003f3dF0E699D30B76E69C368dd2aa6c)
- Outputs data to `src/pyth-price-feeds.json`

**Usage:**
```bash
node src/pythData.js
```

**Configuration:**
- `START_BLOCK` - Starting block number (default: 36323073)
- `END_BLOCK` - Ending block number (default: 36649229)

### stoxData.js

Fetches trading orders and trades from the Stox subgraph on Base.

**Features:**
- Fetches all orders with pagination (1000 per request)
- Fetches all trades with pagination (1000 per request)
- Filters orders containing specific tSTOX token addresses
- Combines orders with their corresponding trades
- Outputs combined data to `src/orders.json`

**Tracked tSTOX tokens:**
- 0x2289249984f1fa2ce86c4e8867e7eb819ea7df95
- 0x470b06815a2e286df8c38c9c73280e0760088623
- 0x32f417da481b9d8d578ebeec54490886b9a1643a
- 0x8d8c315db61f60dcc3c66cdb48ca87fc643e35ea
- 0x69fca9f7fad46a7eef3acef5beac9df5b7eca73b
- 0xff647ad8c4b065bd746911bb9ea1a33c38c63604
- 0x479d5f41c7c5bac2848a4ed5decbc49159b64f3f
- 0xd0a90b7c9ae5facbe09ca4c576a3795eda53b397

**Usage:**
```bash
node src/stoxData.js
```

**Configuration:**
- `FROM_TIMESTAMP` - Starting timestamp for filtering (default: 1759567171)
- `TO_TIMESTAMP` - Ending timestamp for filtering (default: 9999999999)

## Output Files

- `src/pyth-price-feeds.json` - Decoded Pyth price feed updates
- `src/orders.json` - Filtered Stox orders with their associated trades

## Data Structure

### Pyth Price Feed Output
```json
{
  "id": "0x...",
  "ticker": "AAPL",
  "publishTime": 1234567890,
  "price": 15000000,
  "conf": 100000,
  "blockNumber": 36323073,
  "transactionHash": "0x...",
  "address": "0x8250f4aF4B972684F7b336503E2D6dFeDeB1487a"
}
```

### Stox Orders Output
```json
{
  "orderHash": "0x...",
  "timestampAdded": "1234567890",
  "inputs": [...],
  "outputs": [...],
  "trades": [
    {
      "id": "...",
      "tradeEvent": {...},
      "inputVaultBalanceChange": {...},
      "outputVaultBalanceChange": {...}
    }
  ]
}
```

## Dependencies

- `axios` - HTTP client for API requests
- `ethers` - Ethereum utilities for data decoding
- `dotenv` - Environment variable management
- `cbor` - CBOR encoding/decoding
- `csv-parser` - CSV parsing utilities
- `pako` - Compression library

## License

ISC
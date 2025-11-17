import { Token, NetworkConfig } from './types.js';

export const GRAPHQL_ENDPOINT =
  'https://api.goldsky.com/api/public/project_clv14x04y9kzi01saerx7bxpg/subgraphs/ob4-base/2025-10-11-a62b/gn';

export const HYPERSYNC_CLIENT = 'https://8453.hypersync.xyz/query';
export const PYTH_CONTRACT = '0x8250f4aF4B972684F7b336503E2D6dFeDeB1487a';
export const HYPERSYNC_FILTER_FROM = '0x08b20026003f3dF0E699D30B76E69C368dd2aa6c';
export const PYTH_EVENT_TOPIC = '0xd06a6b7f4918494b3719217d1802786c1f5112a6c1d88fe2cfec00b4584f6aec';

export interface PythTickerConfig {
  ticker: string;
  feedId: string;
}

export const PYTH_TICKERS: readonly PythTickerConfig[] = [
  {
    ticker: 'AMZN',
    feedId: '0xb5d0e0fa58a1f8b81498ae670ce93c872d14434b72c364885d4fa1b257cbb07a'
  },
  {
    ticker: 'NVDA',
    feedId: '0xb1073854ed24cbc755dc527418f52b7d271f6cc967bbf8d8129112b18860a593'
  },
  {
    ticker: 'TSLA',
    feedId: '0x16dad506d7db8da01c87581c87ca897a012a153557d4d578c3b9c9e1bc0632f1'
  },
  {
    ticker: 'MSTR',
    feedId: '0xe1e80251e5f5184f2195008382538e847fafc36f751896889dd3d1b1f6111f09'
  },
  {
    ticker: 'BRK',
    feedId: '0xe21c688b7fc65b4606a50f3635f466f6986db129bf16979875d160f9c508e8c7'
  },
  {
    ticker: 'SPLG',
    feedId: '0x4dfbf28d72ab41a878afcd4c6d5e9593dca7cf65a0da739cbad9b7414004f82d'
  },
  {
    ticker: 'IAU',
    feedId: '0xf703fbded84f7da4bd9ff4661b5d1ffefa8a9c90b7fa12f247edc8251efac914'
  }
];

export const DEFAULT_DATABASE_PATH = '/data/metrics.db';
export const DEFAULT_PYTH_START_BLOCK = 0;
export const DEFAULT_TRADES_START_TIMESTAMP = 0;
export const DEFAULT_QUOTE_BLOCK_INTERVAL = 0;

export const DEFAULT_RPC_URLS: string[] = [
  'https://mainnet.base.org',
  'https://gateway.tenderly.co/public/base'
];

export const USDC_TOKEN: Token = {
  chainId: 8453,
  address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  symbol: 'USDC',
  decimals: 6,
  name: 'USD Coin'
};

export const STOCK_TOKENS: Token[] = [
  {
    chainId: 8453,
    address: '0x69fca9f7fad46a7eef3acef5beac9df5b7eca73b',
    symbol: 'tNVDA',
    decimals: 18,
    name: 'NVIDIA Corporation ST0x',
    category: 'ST0x'
  },
  {
    chainId: 8453,
    address: '0x8d8c315db61f60dcc3c66cdb48ca87fc643e35ea',
    symbol: 'tAMZN',
    decimals: 18,
    name: 'Amazon.com Inc ST0x',
    category: 'ST0x'
  },
  {
    chainId: 8453,
    address: '0x470b06815a2e286df8c38c9c73280e0760088623',
    symbol: 'tTSLA',
    decimals: 18,
    name: 'Tesla Inc ST0x',
    category: 'ST0x'
  },
  {
    chainId: 8453,
    address: '0xff647ad8c4b065bd746911bb9ea1a33c38c63604',
    symbol: 'tMSTR',
    decimals: 18,
    name: 'MicroStrategy Incorporated ST0x',
    category: 'ST0x'
  },
  {
    chainId: 8453,
    address: '0x32f417da481b9d8d578ebeec54490886b9a1643a',
    symbol: 'tBRK.B',
    decimals: 18,
    name: 'Berkshire Hathaway Inc ST0x',
    category: 'ST0x'
  },
  {
    chainId: 8453,
    address: '0xd0a90b7c9ae5facbe09ca4c576a3795eda53b397',
    symbol: 'tIAU',
    decimals: 18,
    name: 'iShares Gold Trust ST0x',
    category: 'ST0x'
  },
  {
    chainId: 8453,
    address: '0x2289249984f1fa2ce86c4e8867e7eb819ea7df95',
    symbol: 'tSPLG',
    decimals: 18,
    name: 'SPDR Portfolio S&P 500 ETF ST0x',
    category: 'ST0x'
  }
];

export const TRACKED_TOKENS: Token[] = [USDC_TOKEN, ...STOCK_TOKENS];

export const NETWORK_CONFIG: NetworkConfig = {
  id: 8453,
  chainId: 8453,
  name: 'base',
  rainIndexNetworkSlug: 'base2',
  displayName: 'Base Mainnet',
  orderbookSubgraphUrl: GRAPHQL_ENDPOINT,
  fallbackRpcUrls: DEFAULT_RPC_URLS,
  usdcToken: USDC_TOKEN
};

export function getDatabasePath(): string {
  return process.env.DATABASE_PATH ?? DEFAULT_DATABASE_PATH;
}

export function getInitialPythBlock(): number {
  const envValue = process.env.PYTH_START_BLOCK ?? process.env.START_BLOCK;
  if (!envValue) return DEFAULT_PYTH_START_BLOCK;
  const parsed = Number.parseInt(envValue, 10);
  return Number.isFinite(parsed) ? parsed : DEFAULT_PYTH_START_BLOCK;
}

export function getInitialTradeTimestamp(): number {
  const envValue = process.env.TRADES_START_TIMESTAMP ?? process.env.FROM_TIMESTAMP;
  if (!envValue) return DEFAULT_TRADES_START_TIMESTAMP;
  const parsed = Number.parseInt(envValue, 10);
  return Number.isFinite(parsed) ? parsed : DEFAULT_TRADES_START_TIMESTAMP;
}

export function getQuoteSnapshotInterval(): number {
  const envValue = process.env.QUOTE_BLOCK_INTERVAL ?? process.env.BLOCK_INTERVAL;
  if (!envValue) return DEFAULT_QUOTE_BLOCK_INTERVAL;
  const parsed = Number.parseInt(envValue, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_QUOTE_BLOCK_INTERVAL;
}

export const DEFAULT_BATCH_SIZE = 1000;
export const CHECKPOINT_INTERVAL_BLOCKS = 50;

export interface Token {
  chainId: number;
  address: string;
  symbol: string;
  decimals: number;
  name: string;
  category?: string;
}

export interface NetworkConfig {
  id: number;
  chainId: number;
  name: string;
  rainIndexNetworkSlug: string;
  displayName: string;
  orderbookSubgraphUrl: string;
  fallbackRpcUrls: string[];
  usdcToken: Token;
}

export type Direction = 'BUY' | 'SELL';

export interface ProcessedQuote {
  quoteId: string;
  orderHash: string;
  owner: string;
  inputTokenSymbol: string;
  outputTokenSymbol: string;
  inputTokenAddress: string;
  outputTokenAddress: string;
  inputTokenDecimals: number;
  outputTokenDecimals: number;
  ratioRaw: string;
  price: number;
  maxOutputRaw: string;
  maxOutput: number;
  direction: Direction;
  blockNumber: number;
  collectedAt: number;
}

export interface ProcessedTrade {
  id: string;
  orderHash: string;
  owner: string | null;
  inputTokenSymbol: string;
  outputTokenSymbol: string;
  inputTokenAddress: string;
  outputTokenAddress: string;
  inputTokenDecimals: number;
  outputTokenDecimals: number;
  inputAmountRaw: string;
  outputAmountRaw: string;
  inputAmount: number;
  outputAmount: number;
  price: number | null;
  direction: Direction;
  blockNumber: number;
  timestamp: number;
  transactionHash: string;
  collectedAt: number;
}

export interface DecodedPythUpdate {
  id: string;
  ticker: string;
  publishTime: number;
  priceRaw: string;
  confRaw: string;
  blockNumber: number;
  transactionHash: string;
  collectedAt: number;
}

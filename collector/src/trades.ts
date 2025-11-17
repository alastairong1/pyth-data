import axios from 'axios';
import { AbiCoder, formatUnits } from 'ethers';
import { insertTrades, SqliteDatabase } from './db.js';
import { GRAPHQL_ENDPOINT, TRACKED_TOKENS, USDC_TOKEN } from './config.js';
import { ProcessedTrade, Direction, Token } from './types.js';
import { unixTimestamp } from './utils.js';

interface TradeTransaction {
  id: string;
  blockNumber: string;
  timestamp: string;
}

interface TokenInfo {
  address: string;
  decimals: number | string;
  symbol: string;
}

interface VaultInfo {
  token: TokenInfo;
}

interface BalanceChange {
  amount: string;
  newVaultBalance: string;
  vault: VaultInfo;
}

interface TradeOrder {
  orderHash: string;
  orderBytes?: string | null;
  meta?: string | null;
}

interface TradeEntry {
  id: string;
  tradeEvent: {
    transaction: TradeTransaction;
  };
  order: TradeOrder;
  inputVaultBalanceChange?: BalanceChange | null;
  outputVaultBalanceChange?: BalanceChange | null;
}

interface TradesResponse {
  data: {
    trades: TradeEntry[];
  };
  errors?: { message?: string }[];
}

const abiCoder = AbiCoder.defaultAbiCoder();
const trackedAddresses = new Set(TRACKED_TOKENS.map((token) => token.address.toLowerCase()));
const PAGE_SIZE = 1000;

const IOV2 = '(address token, bytes32 vaultId)';
const EvaluableV4 = '(address interpreter, address store, bytes bytecode)';
const ORDER_V4_ABI = `(address owner, ${EvaluableV4} evaluable, ${IOV2}[] validInputs, ${IOV2}[] validOutputs, bytes32 nonce)`;

function buildTradesQuery(skip: number, fromTimestamp: number, toTimestamp: number): string {
  return `{
  trades(
    orderBy: timestamp
    orderDirection: asc
    skip: ${skip}
    first: ${PAGE_SIZE}
    where: {
      and: [
        { timestamp_gt: ${fromTimestamp} }
        { timestamp_lte: ${toTimestamp} }
      ]
    }
  ) {
    id
    tradeEvent {
      transaction {
        id
        blockNumber
        timestamp
      }
    }
    order {
      orderHash
      orderBytes
      meta
    }
    inputVaultBalanceChange {
      amount
      newVaultBalance
      vault {
        token {
          address
          decimals
          symbol
        }
      }
    }
    outputVaultBalanceChange {
      amount
      newVaultBalance
      vault {
        token {
          address
          decimals
          symbol
        }
      }
    }
  }
}`;
}

function parseDecimals(value: number | string | undefined | null): number {
  if (value === null || value === undefined) return 18;
  if (typeof value === 'number') return value;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 18;
}

function extractOwnerFromOrderBytes(orderBytes?: string | null): string | null {
  if (!orderBytes) return null;
  try {
    const decoded = abiCoder.decode([ORDER_V4_ABI], orderBytes);
    const owner = decoded?.[0]?.owner as string | undefined;
    return owner ?? null;
  } catch (error) {
    console.error('Failed to decode order bytes:', error instanceof Error ? error.message : String(error));
    return null;
  }
}

function determineDirection(inputToken: TokenInfo, outputToken: TokenInfo): Direction | null {
  const inputSymbol = inputToken.symbol.toUpperCase();
  const outputSymbol = outputToken.symbol.toUpperCase();

  if (inputSymbol === USDC_TOKEN.symbol) {
    return 'SELL';
  }

  if (outputSymbol === USDC_TOKEN.symbol) {
    return 'BUY';
  }

  return null;
}

function formatAmount(amountRaw: string, decimals: number): number {
  try {
    return Number.parseFloat(formatUnits(BigInt(amountRaw), decimals));
  } catch {
    return 0;
  }
}

function mapTrade(entry: TradeEntry, collectedAt: number): ProcessedTrade | null {
  const input = entry.inputVaultBalanceChange;
  const output = entry.outputVaultBalanceChange;
  if (!input?.vault?.token || !output?.vault?.token) {
    return null;
  }

  const inputToken = input.vault.token;
  const outputToken = output.vault.token;

  if (!trackedAddresses.has(inputToken.address.toLowerCase()) && !trackedAddresses.has(outputToken.address.toLowerCase())) {
    return null;
  }

  const direction = determineDirection(inputToken, outputToken);
  if (!direction) {
    return null;
  }

  const inputDecimals = parseDecimals(inputToken.decimals);
  const outputDecimals = parseDecimals(outputToken.decimals);

  const inputAmount = formatAmount(input.amount, inputDecimals);
  const outputAmount = formatAmount(output.amount, outputDecimals);

  let price: number | null = null;
  if (direction === 'SELL') {
    if (outputAmount > 0) {
      price = inputAmount / outputAmount;
    }
  } else if (direction === 'BUY') {
    if (inputAmount > 0) {
      price = outputAmount / inputAmount;
    }
  }

  const transaction = entry.tradeEvent.transaction;

  return {
    id: entry.id,
    orderHash: entry.order.orderHash,
    owner: extractOwnerFromOrderBytes(entry.order.orderBytes),
    inputTokenSymbol: inputToken.symbol,
    outputTokenSymbol: outputToken.symbol,
    inputTokenAddress: inputToken.address,
    outputTokenAddress: outputToken.address,
    inputTokenDecimals: inputDecimals,
    outputTokenDecimals: outputDecimals,
    inputAmountRaw: input.amount,
    outputAmountRaw: output.amount,
    inputAmount,
    outputAmount,
    price,
    direction,
    blockNumber: Number.parseInt(transaction.blockNumber, 10),
    timestamp: Number.parseInt(transaction.timestamp, 10),
    transactionHash: transaction.id,
    collectedAt
  };
}

export async function collectTrades(
  db: SqliteDatabase,
  fromTimestamp: number,
  toTimestamp: number
): Promise<{ lastTimestamp: number; count: number }> {
  const collectedAt = unixTimestamp();
  let skip = 0;
  let hasMore = true;
  let maxTimestamp = fromTimestamp;
  const trades: ProcessedTrade[] = [];

  while (hasMore) {
    const query = buildTradesQuery(skip, fromTimestamp, toTimestamp);
    let response: TradesResponse | null = null;
    try {
      response = (await axios.post<TradesResponse>(GRAPHQL_ENDPOINT, { query })).data;
    } catch (error) {
      console.error('Failed to fetch trades:', error instanceof Error ? error.message : String(error));
      break;
    }

    if (response.errors && response.errors.length > 0) {
      console.error('GraphQL trade query errors:', response.errors);
      break;
    }

    const pageTrades = response.data?.trades ?? [];
    if (pageTrades.length === 0) {
      hasMore = false;
      break;
    }

    for (const trade of pageTrades) {
      const mapped = mapTrade(trade, collectedAt);
      if (mapped) {
        trades.push(mapped);
        if (mapped.timestamp > maxTimestamp) {
          maxTimestamp = mapped.timestamp;
        }
      }
    }

    skip += PAGE_SIZE;
    if (pageTrades.length < PAGE_SIZE) {
      hasMore = false;
    }
  }

  insertTrades(db, trades);
  return {
    lastTimestamp: Math.max(maxTimestamp, fromTimestamp),
    count: trades.length
  };
}

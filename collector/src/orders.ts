import axios from 'axios';
import { AbiCoder } from 'ethers';
import { doQuoteSpecs, type QuoteResultEnum, type QuoteSpec } from '@rainlanguage/orderbook';
import { insertQuotes, SqliteDatabase } from './db.js';
import { NETWORK_CONFIG, STOCK_TOKENS, TRACKED_TOKENS, USDC_TOKEN } from './config.js';
import { ProcessedQuote, Direction, Token } from './types.js';
import { buildQuoteId, formatAmount, getTokenByAddress, hexToBigInt, unixTimestamp } from './utils.js';

const abiCoder = AbiCoder.defaultAbiCoder();
const OrderV3Type =
  '(address owner, (address interpreter, address store, bytes bytecode) evaluable, (address token, uint8 decimals, uint256 vaultId)[] validInputs, (address token, uint8 decimals, uint256 vaultId)[] validOutputs, bytes32 nonce)';

const trackedTokenAddresses = new Set(TRACKED_TOKENS.map((token) => token.address.toLowerCase()));

interface SubgraphOrderRecord {
  orderHash: string;
  orderBytes: string;
  orderbook: {
    id: string;
  };
}

interface GraphOrdersResponse {
  data?: {
    orders: SubgraphOrderRecord[];
  };
  errors?: Array<{ message: string }>;
}

async function fetchActiveOrdersAtBlock(blockNumber: number): Promise<SubgraphOrderRecord[]> {
  const pageSize = 500;
  const orders: SubgraphOrderRecord[] = [];
  const query = `
    query ActiveOrdersAtBlock($blockNumber: Int!, $first: Int!, $skip: Int!) {
      orders(
        first: $first
        skip: $skip
        where: { active: true }
        block: { number: $blockNumber }
        orderBy: id
        orderDirection: asc
      ) {
        orderHash
        orderBytes
        orderbook {
          id
        }
      }
    }
  `;

  let skip = 0;
  let hasMore = true;

  while (hasMore) {
    const response = await axios.post<GraphOrdersResponse>(
      NETWORK_CONFIG.orderbookSubgraphUrl,
      {
        query,
        variables: {
          blockNumber,
          first: pageSize,
          skip
        }
      },
      { timeout: 15_000 }
    );

    if (response.data.errors && response.data.errors.length > 0) {
      throw new Error(response.data.errors.map((error) => error.message).join('; '));
    }

    const pageOrders = response.data.data?.orders ?? [];
    orders.push(...pageOrders);

    if (pageOrders.length < pageSize) {
      hasMore = false;
    } else {
      skip += pageSize;
    }
  }

  return orders;
}

interface QuoteResultWithSpec {
  result: QuoteResultEnum;
  spec: QuoteSpec;
}

function parseDecimals(value: unknown, fallback = 18): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function determineDirection(inputSymbol: string, outputSymbol: string): Direction | null {
  if (inputSymbol.toUpperCase() === USDC_TOKEN.symbol) return 'SELL';
  if (outputSymbol.toUpperCase() === USDC_TOKEN.symbol) return 'BUY';
  return null;
}

function filterOrders(orders: SubgraphOrderRecord[]): SubgraphOrderRecord[] {
  const filtered: SubgraphOrderRecord[] = [];

  for (const order of orders) {
    try {
      const decodedOrder = abiCoder.decode([OrderV3Type], order.orderBytes);
      const orderData = decodedOrder[0] as any;
      const inputs: string[] = orderData.validInputs.map((input: { token: string }) => input.token.toLowerCase());
      const outputs: string[] = orderData.validOutputs.map((output: { token: string }) => output.token.toLowerCase());

      const hasRelevantInput = inputs.some((addr) => trackedTokenAddresses.has(addr));
      const hasRelevantOutput = outputs.some((addr) => trackedTokenAddresses.has(addr));

      if (hasRelevantInput || hasRelevantOutput) {
        filtered.push(order);
      }
    } catch (error) {
      console.error('Failed to decode order for filtering:', error instanceof Error ? error.message : String(error));
    }
  }

  return filtered;
}

function createQuoteSpecs(filteredOrders: SubgraphOrderRecord[]): QuoteSpec[] {
  const specs: QuoteSpec[] = [];

  for (const order of filteredOrders) {
    try {
      const decoded = abiCoder.decode([OrderV3Type], order.orderBytes);
      const orderData = decoded[0] as any;
      const inputTokens = orderData.validInputs.map((input: { token: string }) => input.token.toLowerCase());
      const outputTokens = orderData.validOutputs.map((output: { token: string }) => output.token.toLowerCase());

      STOCK_TOKENS.forEach((token) => {
        const stockAddr = token.address.toLowerCase();
        const usdcAddr = USDC_TOKEN.address.toLowerCase();

        const usdcInputIndex = inputTokens.findIndex((addr: string) => addr === usdcAddr);
        const stockOutputIndex = outputTokens.findIndex((addr: string) => addr === stockAddr);

        if (usdcInputIndex !== -1 && stockOutputIndex !== -1) {
          specs.push({
            orderHash: order.orderHash,
            inputIOIndex: usdcInputIndex,
            outputIOIndex: stockOutputIndex,
            signedContext: [],
            orderbook: order.orderbook.id
          });
        }

        const stockInputIndex = inputTokens.findIndex((addr: string) => addr === stockAddr);
        const usdcOutputIndex = outputTokens.findIndex((addr: string) => addr === usdcAddr);

        if (stockInputIndex !== -1 && usdcOutputIndex !== -1) {
          specs.push({
            orderHash: order.orderHash,
            inputIOIndex: stockInputIndex,
            outputIOIndex: usdcOutputIndex,
            signedContext: [],
            orderbook: order.orderbook.id
          });
        }
      });
    } catch (error) {
      console.error('Failed to decode order for specs:', error instanceof Error ? error.message : String(error));
    }
  }

  return specs;
}

async function executeQuotes(
  specs: QuoteSpec[],
  blockNumber: number
): Promise<QuoteResultWithSpec[]> {
  const batchSize = 50;
  const results: QuoteResultWithSpec[] = [];

  for (let i = 0; i < specs.length; i += batchSize) {
    const batch = specs.slice(i, i + batchSize);
    try {
      const response = await doQuoteSpecs(
        batch,
        NETWORK_CONFIG.orderbookSubgraphUrl,
        NETWORK_CONFIG.fallbackRpcUrls,
        BigInt(blockNumber)
      );

      if (response.error || !response.value) {
        console.error('Quote batch failed:', response.error?.readableMsg ?? 'Unknown error');
        continue;
      }

      response.value.forEach((result, index) => {
        const spec = batch[index];
        if (spec) {
          results.push({ result, spec });
        }
      });
    } catch (error) {
      console.error('Quote batch threw:', error instanceof Error ? error.message : String(error));
    }
  }

  return results;
}

function buildQuote(
  quoteResult: QuoteResultWithSpec,
  orders: Map<string, SubgraphOrderRecord>,
  blockNumber: number,
  collectedAt: number
): ProcessedQuote | null {
  const { result, spec } = quoteResult;
  if (result.error || !result.value) return null;

  const order = orders.get(spec.orderHash);
  if (!order) return null;

  try {
    const decoded = abiCoder.decode([OrderV3Type], order.orderBytes);
    const orderData = decoded[0] as any;
    const owner = orderData.owner as string;
    const inputDefinition = orderData.validInputs[spec.inputIOIndex];
    const outputDefinition = orderData.validOutputs[spec.outputIOIndex];

    if (!inputDefinition || !outputDefinition) return null;

    const inputAddress = inputDefinition.token as string;
    const outputAddress = outputDefinition.token as string;

    const inputTokenMeta =
      getTokenByAddress(inputAddress, TRACKED_TOKENS) ??
      ({
        address: inputAddress,
        symbol: inputDefinition.token,
        name: inputDefinition.token,
        decimals: parseDecimals(inputDefinition.decimals)
      } as Token);

    const outputTokenMeta =
      getTokenByAddress(outputAddress, TRACKED_TOKENS) ??
      ({
        address: outputAddress,
        symbol: outputDefinition.token,
        name: outputDefinition.token,
        decimals: parseDecimals(outputDefinition.decimals)
      } as Token);

    const maxOutput = hexToBigInt(result.value.maxOutput);

    const ratio = hexToBigInt(result.value.ratio);
    if (ratio === 0n) return null;

    const ratioFloat = Number(ratio) / 1e18;
    if (!Number.isFinite(ratioFloat) || ratioFloat <= 0) return null;

    const inputSymbol = inputTokenMeta.symbol;
    const outputSymbol = outputTokenMeta.symbol;
    const direction = determineDirection(inputSymbol, outputSymbol);
    if (!direction) return null;

    let price: number;
    if (direction === 'SELL') {
      price = ratioFloat;
    } else {
      price = 1 / ratioFloat;
    }

    const maxOutputNumber = formatAmount(maxOutput, outputTokenMeta.decimals);

    return {
      quoteId: buildQuoteId(order.orderHash, spec.inputIOIndex, spec.outputIOIndex, blockNumber),
      orderHash: order.orderHash,
      owner,
      inputTokenSymbol: inputSymbol,
      outputTokenSymbol: outputSymbol,
      inputTokenAddress: inputAddress,
      outputTokenAddress: outputAddress,
      inputTokenDecimals: inputTokenMeta.decimals,
      outputTokenDecimals: outputTokenMeta.decimals,
      ratioRaw: result.value.ratio,
      price,
      maxOutputRaw: result.value.maxOutput,
      maxOutput: maxOutputNumber,
      direction,
      blockNumber,
      collectedAt
    };
  } catch (error) {
    console.error('Failed to build quote:', error instanceof Error ? error.message : String(error));
    return null;
  }
}

export interface QuoteContext {
  specs: QuoteSpec[];
  orderMap: Map<string, SubgraphOrderRecord>;
}

export async function buildQuoteContext(blockNumber: number): Promise<QuoteContext> {
  const orders = await fetchActiveOrdersAtBlock(blockNumber);
  const filtered = filterOrders(orders);
  const specs = createQuoteSpecs(filtered);

  const orderMap = new Map<string, SubgraphOrderRecord>();
  filtered.forEach((order) => orderMap.set(order.orderHash, order));

  return {
    specs,
    orderMap
  };
}

export async function fetchQuotesAtBlock(
  blockNumber: number,
  collectedAt: number = unixTimestamp(),
  context?: QuoteContext
): Promise<ProcessedQuote[]> {
  const ctx = context ?? (await buildQuoteContext(blockNumber));
  const quoteResults = await executeQuotes(ctx.specs, blockNumber);
  const processedQuotes = quoteResults
    .map((quote) => buildQuote(quote, ctx.orderMap, blockNumber, collectedAt))
    .filter((quote): quote is ProcessedQuote => Boolean(quote));

  return processedQuotes;
}

export async function collectQuotes(
  db: SqliteDatabase,
  blockNumber: number
): Promise<{ blockNumber: number; count: number }> {
  const collectedAt = unixTimestamp();
  const context = await buildQuoteContext(blockNumber);
  const processedQuotes = await fetchQuotesAtBlock(blockNumber, collectedAt, context);

  insertQuotes(db, processedQuotes);
  return {
    blockNumber,
    count: processedQuotes.length
  };
}

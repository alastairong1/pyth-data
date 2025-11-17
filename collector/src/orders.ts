import { Float } from '@rainlanguage/float';
import { AbiCoder } from 'ethers';
import type { RaindexOrder, RaindexOrderQuote } from '@rainlanguage/orderbook';
import { insertQuotes, SqliteDatabase } from './db.js';
import { STOCK_TOKENS, TRACKED_TOKENS, USDC_TOKEN, NETWORK_CONFIG } from './config.js';
import { ProcessedQuote, Direction } from './types.js';
import { buildQuoteId, getTokenByAddress, unixTimestamp } from './utils.js';
import { createRaindexClient } from './raindexClient.js';

const trackedTokenAddresses = new Set(TRACKED_TOKENS.map((token) => token.address.toLowerCase()));

const IOV2 = '(address token, bytes32 vaultId)';
const EvaluableV4 = '(address interpreter, address store, bytes bytecode)';
const OrderV4Type = `(address owner, ${EvaluableV4} evaluable, ${IOV2}[] validInputs, ${IOV2}[] validOutputs, bytes32 nonce)`;
const abiCoder = AbiCoder.defaultAbiCoder();

function determineDirection(inputSymbol: string, outputSymbol: string): Direction | null {
  if (inputSymbol.toUpperCase() === USDC_TOKEN.symbol) return 'SELL';
  if (outputSymbol.toUpperCase() === USDC_TOKEN.symbol) return 'BUY';
  return null;
}

function parseFloatToNumber(floatHex: string): number {
  try {
    if (!floatHex.startsWith('0x') || floatHex.length !== 66) {
      console.warn(`Invalid Float hex format: ${floatHex}`);
      return 0;
    }
    const floatResult = Float.fromHex(floatHex as `0x${string}`);
    if (floatResult.error || !floatResult.value) {
      console.warn(`Failed to parse Float: ${floatResult.error?.readableMsg}`);
      return 0;
    }
    const formatted = floatResult.value.format();
    if (!formatted.value) {
      console.warn('Float format returned undefined value');
      return 0;
    }
    return Number.parseFloat(formatted.value.toString());
  } catch (error) {
    console.error('Error parsing Float:', error);
    return 0;
  }
}

function buildQuoteFromRaindex(
  order: RaindexOrder,
  quote: RaindexOrderQuote,
  blockNumber: number,
  collectedAt: number
): ProcessedQuote | null {
  try {
    if (!quote.data) {
      console.warn(`Quote data is missing for order ${order.orderHash}`);
      return null;
    }

    const inputIOIndex = quote.pair.inputIndex;
    const outputIOIndex = quote.pair.outputIndex;

    // Decode orderBytes to get validInputs/validOutputs
    const decoded = abiCoder.decode([OrderV4Type], (order as any).orderBytes);
    const orderData = decoded[0] as any;

    const inputAddress = orderData.validInputs?.[inputIOIndex]?.token;
    const outputAddress = orderData.validOutputs?.[outputIOIndex]?.token;

    if (!inputAddress || !outputAddress) {
      console.warn(`Missing token addresses for order ${order.orderHash}`);
      return null;
    }

    const inputTokenMeta = getTokenByAddress(inputAddress, TRACKED_TOKENS);
    const outputTokenMeta = getTokenByAddress(outputAddress, TRACKED_TOKENS);

    if (!inputTokenMeta || !outputTokenMeta) {
      console.warn(`Token not found in TRACKED_TOKENS: input=${inputAddress}, output=${outputAddress}`);
      return null;
    }

    const direction = determineDirection(inputTokenMeta.symbol, outputTokenMeta.symbol);
    if (!direction) return null;

    // Parse Float values
    const ratio = parseFloatToNumber(quote.data.ratio);
    const maxOutput = parseFloatToNumber(quote.data.maxOutput);

    if (ratio === 0) return null;

    let price: number;
    if (direction === 'SELL') {
      price = ratio;
    } else {
      price = 1 / ratio;
    }

    return {
      quoteId: buildQuoteId(order.orderHash, inputIOIndex, outputIOIndex, blockNumber),
      orderHash: order.orderHash,
      owner: order.owner,
      inputTokenSymbol: inputTokenMeta.symbol,
      outputTokenSymbol: outputTokenMeta.symbol,
      inputTokenAddress: inputAddress,
      outputTokenAddress: outputAddress,
      inputTokenDecimals: inputTokenMeta.decimals,
      outputTokenDecimals: outputTokenMeta.decimals,
      ratioRaw: quote.data.ratio,
      price,
      maxOutputRaw: quote.data.maxOutput,
      maxOutput,
      direction,
      blockNumber,
      collectedAt
    };
  } catch (error) {
    console.error('Failed to build quote:', error instanceof Error ? error.message : String(error));
    return null;
  }
}

export async function collectQuotes(
  db: SqliteDatabase,
  blockNumber: number
): Promise<{ blockNumber: number; count: number }> {
  console.log(`collectQuotes: Starting collection at block ${blockNumber}`);
  const collectedAt = unixTimestamp();

  try {
    const client = await createRaindexClient();

    // Get active orders filtered by our tracked tokens
    console.log(`Fetching orders with tracked tokens...`);
    const tokenAddresses = TRACKED_TOKENS.map(t => t.address as `0x${string}`);

    // Fetch all pages of orders
    const allOrders: RaindexOrder[] = [];
    let page = 1;
    let hasMore = true;
    const maxPages = 10;

    while (hasMore && page <= maxPages) {
      const ordersResult = await client.getOrders(
        [NETWORK_CONFIG.chainId],
        {
          owners: [],  // Empty array means all owners
          tokens: tokenAddresses
        },
        page
      );

      if (ordersResult.error || !ordersResult.value) {
        console.error('Failed to fetch orders:', ordersResult.error?.readableMsg ?? 'Unknown error');
        break;
      }

      const pageOrders = ordersResult.value;
      allOrders.push(...pageOrders);
      console.log(`collectQuotes: Fetched page ${page} with ${pageOrders.length} orders`);

      // If we got fewer than expected, we've reached the end
      hasMore = pageOrders.length >= 100; // Assuming default page size
      page++;
    }

    console.log(`collectQuotes: Total ${allOrders.length} orders fetched`);
    const orders = allOrders;

    const processedQuotes: ProcessedQuote[] = [];

    // Get quotes for each order
    for (const order of orders) {
      try {
        const quotesResult = await order.getQuotes();

        if (quotesResult.error) {
          console.warn(`Quote failed for order ${order.orderHash}: ${quotesResult.error.readableMsg}`);
          continue;
        }

        if (!quotesResult.value || quotesResult.value.length === 0) {
          continue;
        }

        // Process each quote from this order
        for (const quote of quotesResult.value) {
          const processed = buildQuoteFromRaindex(order, quote, blockNumber, collectedAt);
          if (processed) {
            processedQuotes.push(processed);
          }
        }
      } catch (error) {
        console.error(`Error getting quotes for order ${order.orderHash}:`, error);
      }
    }

    console.log(`collectQuotes: Processed ${processedQuotes.length} quotes`);

    insertQuotes(db, processedQuotes);
    return {
      blockNumber,
      count: processedQuotes.length
    };
  } catch (error) {
    console.error('collectQuotes failed:', error instanceof Error ? error.message : String(error));
    return { blockNumber, count: 0 };
  }
}

import { RaindexClient } from '@rainlanguage/orderbook';
import axios from 'axios';

export const RAIN_STRATEGIES_COMMIT = 'b2e056bb58f0e467a515132ce7a1b25bc624bd09';
export const RAIN_STRATEGIES_URL = `https://raw.githubusercontent.com/rainlanguage/rain.strategies/${RAIN_STRATEGIES_COMMIT}/settings.yaml`;

let cachedClient: RaindexClient | null = null;

/**
 * Creates a new RaindexClient instance with the standard configuration
 * Uses caching to avoid re-fetching the YAML config on every call
 */
export async function createRaindexClient(): Promise<RaindexClient> {
  if (cachedClient) {
    return cachedClient;
  }

  try {
    console.log(`Fetching Raindex configuration from ${RAIN_STRATEGIES_URL}`);
    const response = await axios.get(RAIN_STRATEGIES_URL, { timeout: 10_000 });
    const yamlConfig = response.data;

    const clientResult = await RaindexClient.new([yamlConfig]);

    if (clientResult.error) {
      throw new Error(`Failed to create RaindexClient: ${clientResult.error.readableMsg}`);
    }

    cachedClient = clientResult.value;
    console.log('RaindexClient created successfully');
    return clientResult.value;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Error creating RaindexClient:', message);
    throw new Error(`Failed to initialize RaindexClient: ${message}`);
  }
}

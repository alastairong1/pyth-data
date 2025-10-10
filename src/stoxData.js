require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const GRAPHQL_ENDPOINT = `https://api.goldsky.com/api/public/project_clv14x04y9kzi01saerx7bxpg/subgraphs/ob4-base/2025-08-18-2744/gn`;
const FROM_TIMESTAMP = process.env.FROM_TIMESTAMP || 1759567171;
const TO_TIMESTAMP = process.env.TO_TIMESTAMP || 9999999999;
const tSTOXs = [
    '0x2289249984f1fa2ce86c4e8867e7eb819ea7df95',
    '0x470b06815a2e286df8c38c9c73280e0760088623',
    '0x32f417da481b9d8d578ebeec54490886b9a1643a',
    '0x8d8c315db61f60dcc3c66cdb48ca87fc643e35ea',
    '0x69fca9f7fad46a7eef3acef5beac9df5b7eca73b',
    '0xff647ad8c4b065bd746911bb9ea1a33c38c63604',
    '0x479d5f41c7c5bac2848a4ed5decbc49159b64f3f',
    '0xd0a90b7c9ae5facbe09ca4c576a3795eda53b397'
]

// Function to create orders query
function createOrdersQuery(skip) {
    return `{
  orders(where: {timestampAdded_gt: "${FROM_TIMESTAMP}"}, first: 1000, skip: ${skip}) {
    orderHash
    timestampAdded
    inputs {
      vaultId
      token {
        symbol
        id
      }
    }
    outputs {
      vaultId
      token {
        symbol
        id
      }
    }
  }
}`;
}

// Function to create trades query
function createTradesQuery(skip) {
    return `{
  trades(
    orderBy: timestamp
    orderDirection: desc
    skip: ${skip}
    first: 1000
    where: {
      and: [
        { timestamp_gt: ${FROM_TIMESTAMP} }
        { timestamp_lt: ${TO_TIMESTAMP} }
      ]
    }
  ) {
    id
    tradeEvent {
      transaction {
        id
        blockNumber
        timestamp
        from
      }
    }
    order {
      orderHash
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

// Fetch all orders with pagination
async function fetchAllOrders() {
    let allOrders = [];
    let skip = 0;
    let hasMore = true;
    
    console.log('Fetching orders with pagination...');
    
    while (hasMore) {
        const query = createOrdersQuery(skip);
        const response = await axios.post(GRAPHQL_ENDPOINT, { query });
        
        if (response.data.errors) {
            console.error('GraphQL Errors:', response.data.errors);
            break;
        }
        
        const orders = response.data.data.orders;
        console.log(`Fetched ${orders.length} orders (skip: ${skip})`);
        
        if (orders.length === 0) {
            hasMore = false;
        } else {
            allOrders = allOrders.concat(orders);
            skip += 1000;
        }
    }
    
    console.log(`Total orders fetched: ${allOrders.length}`);
    return allOrders;
}

// Fetch all trades with pagination
async function fetchAllTrades() {
    let allTrades = [];
    let skip = 0;
    let hasMore = true;
    
    console.log('\nFetching trades with pagination...');
    
    while (hasMore) {
        const query = createTradesQuery(skip);
        const response = await axios.post(GRAPHQL_ENDPOINT, { query });
        
        if (response.data.errors) {
            console.error('GraphQL Errors:', response.data.errors);
            break;
        }
        
        const trades = response.data.data.trades;
        console.log(`Fetched ${trades.length} trades (skip: ${skip})`);
        
        if (trades.length === 0) {
            hasMore = false;
        } else {
            allTrades = allTrades.concat(trades);
            skip += 1000;
        }
    }
    
    console.log(`Total trades fetched: ${allTrades.length}`);
    return allTrades;
}

// Main function to fetch and combine data
async function fetchOrders() {
    // Fetch all orders
    const allOrders = await fetchAllOrders();
    
    // Filter orders that have input or output tokens matching tSTOXs addresses
    const filteredOrders = allOrders.filter(order => {
        // Check if any input token matches tSTOXs
        const hasMatchingInput = order.inputs.some(input => 
            tSTOXs.includes(input.token.id.toLowerCase())
        );
        
        // Check if any output token matches tSTOXs
        const hasMatchingOutput = order.outputs.some(output => 
            tSTOXs.includes(output.token.id.toLowerCase())
        );
        
        return hasMatchingInput || hasMatchingOutput;
    });
    
    console.log(`\nFiltered orders with tSTOXs: ${filteredOrders.length}`);
    
    // Fetch all trades
    const allTrades = await fetchAllTrades();
    
    // Create a map of trades by orderHash for efficient lookup
    const tradesByOrderHash = {};
    allTrades.forEach(trade => {
        const orderHash = trade.order.orderHash;
        if (!tradesByOrderHash[orderHash]) {
            tradesByOrderHash[orderHash] = [];
        }
        tradesByOrderHash[orderHash].push(trade);
    });
    
    // Combine orders with their trades
    const combinedOrders = filteredOrders.map(order => {
        return {
            ...order,
            trades: tradesByOrderHash[order.orderHash] || []
        };
    });
    
    console.log(`\nCombined ${combinedOrders.length} orders with their trades`);
    
    // Save results to ./src/orders.json
    const outputPath = path.join(__dirname, 'orders.json');
    fs.writeFileSync(outputPath, JSON.stringify(combinedOrders, null, 2));
    console.log(`Results saved to: ${outputPath}`);

    return combinedOrders;
}

fetchOrders();






require('dotenv').config();
const axios = require('axios');
const { ethers } = require('ethers');

const PRICE_FEED_TICKERS = [
    {
        ticker: "GOOG",
        feedId: "0xe65ff435be42630439c96396653a342829e877e2aafaeaf1a10d0ee5fd2cf3f2"
    },
    {
        ticker: "AMZN",
        feedId: "0xb5d0e0fa58a1f8b81498ae670ce93c872d14434b72c364885d4fa1b257cbb07a"
    },
    {
        ticker: "AAPL",
        feedId: "0x49f6b65cb1de6b10eaf75e7c03ca029c306d0357e91b5311b175084a5ad55688"
    },
    {
        ticker: "MSFT",
        feedId: "0xd0ca23c1cc005e004ccf1db5bf76aeb6a49218f43dac3d4b275e92de12ded4d1"
    },
    {
        ticker: "NVDA",
        feedId: "0xb1073854ed24cbc755dc527418f52b7d271f6cc967bbf8d8129112b18860a593"
    },
    {
        ticker: "META",
        feedId: "0x78a3e3b8e676a8f73c439f5d749737034b139bbbe899ba5775216fba596607fe"
    },
    {
        ticker: "GME",
        feedId: "0x6f9cd89ef1b7fd39f667101a91ad578b6c6ace4579d5f7f285a4b06aa4504be6"
    },
    {
        ticker: "MSTR",
        feedId: "0xe1e80251e5f5184f2195008382538e847fafc36f751896889dd3d1b1f6111f09"
    },
    {
        ticker: "BRK",
        feedId: "0xe21c688b7fc65b4606a50f3635f466f6986db129bf16979875d160f9c508e8c7"
    },
    {
        ticker: "SPLG",
        feedId: "0x4dfbf28d72ab41a878afcd4c6d5e9593dca7cf65a0da739cbad9b7414004f82d"
    },
    {
        ticker: "IAU",
        feedId: "0xf703fbded84f7da4bd9ff4661b5d1ffefa8a9c90b7fa12f247edc8251efac914"
    }
]

// Function to decode PriceFeedUpdate event data
function decodePriceFeedUpdate(log) {
    try {
        // Check if we have the required fields
        if (!log.data || !log.topic0) {
            return null;
        }
        
        // Extract the id from various possible field names
        let id = 'unknown';
        if (log.topics1) {
            id = log.topics1;
        } else if (log.topic1) {
            id = log.topic1;
        } else if (log.topics && Array.isArray(log.topics) && log.topics.length > 1) {
            id = log.topics[1];
        }
        
        // Look up the ticker for this price feed ID
        let ticker = 'UNKNOWN';
        const priceFeed = PRICE_FEED_TICKERS.find(feed => feed.feedId.toLowerCase() === id.toLowerCase());
        if (priceFeed) {
            ticker = priceFeed.ticker;
        }
        
        // Decode the data field which contains publishTime, price, and conf
        // Data layout: publishTime (32 bytes) + price (32 bytes) + conf (32 bytes)
        const data = log.data;
        
        if (!data || data.length < 194) { // 0x + 192 hex chars = 194 total
            console.log('Invalid data field length:', data?.length);
            return null;
        }
        
        // Remove 0x prefix and decode
        const dataHex = data.startsWith('0x') ? data.slice(2) : data;
        
        // Each parameter is 32 bytes (64 hex characters)
        const publishTimeHex = '0x' + dataHex.slice(0, 64);
        const priceHex = '0x' + dataHex.slice(64, 128);
        const confHex = '0x' + dataHex.slice(128, 192);
        
        // Convert to numbers
        const publishTime = BigInt(publishTimeHex).toString();
        const price = BigInt(priceHex).toString();
        const conf = BigInt(confHex).toString();
        
        return {
            id: id,
            ticker: ticker,
            publishTime: parseInt(publishTime),
            price: parseInt(price),
            conf: parseInt(conf),
            blockNumber: log.block_number,
            transactionHash: log.transaction_hash,
            address: log.address,
            topic0: log.topic0,
            topics1: log.topics1 // Include topics1 for reference
        };
    } catch (error) {
        console.error('Error decoding log:', error);
        return null;
    }
}

async function main() {

    const hyperSyncClient = `https://8453.hypersync.xyz/query`;
    const pythContract = "0x8250f4aF4B972684F7b336503E2D6dFeDeB1487a";
    const startBlock = parseInt(process.env.START_BLOCK) || 36323073;
    const endBlock = parseInt(process.env.END_BLOCK) || 36649229;
    const eventTopic = "0xd06a6b7f4918494b3719217d1802786c1f5112a6c1d88fe2cfec00b4584f6aec";

    let currentBlock = startBlock;
    let allLogs = [];
    
    console.log('Starting to fetch logs with pagination...');
    
    while (currentBlock <= endBlock) {
        try {
            const queryResponse = await axios.post(hyperSyncClient, {
                from_block: currentBlock,
                transactions: [
                    {
                        from: ["0x08b20026003f3dF0E699D30B76E69C368dd2aa6c"],
                        to: ["0x8250f4aF4B972684F7b336503E2D6dFeDeB1487a"]
                    }
                ],
                logs: [
                    {
                        address: [pythContract],
                        topics: [[eventTopic]]
                    }
                ],
                field_selection: {
                    log: ['block_number', 'transaction_hash', 'data', 'address', 'topic0', 'topic1'],
                    block: ['number', 'timestamp']
                }
            });

            console.log(`Fetched from block ${currentBlock}, next_block: ${queryResponse.data.next_block}`);
            
            // Concatenate logs if there are any
            if (
                queryResponse.data.data &&
                queryResponse.data.data.length > 0 &&
                currentBlock != queryResponse.data.next_block
            ) {
                // Extract individual log entries from each response
                queryResponse.data.data.forEach(responseItem => {
                    if (responseItem.logs && responseItem.logs.length > 0) {
                        allLogs = allLogs.concat(responseItem.logs);
                    }
                });
                console.log(`Added ${queryResponse.data.data.reduce((total, item) => total + (item.logs ? item.logs.length : 0), 0)} log entries (total: ${allLogs.length})`);
            }
            
            // Update currentBlock for the next iteration
            currentBlock = queryResponse.data.next_block;
            
            // Exit the loop if nextBlock is invalid
            if (!currentBlock || currentBlock > endBlock) {
                break;
            }
        } catch (error) {
            console.error('Error fetching logs:', error.message);
            break;
        }
    }
    
    console.log(`\nFinished fetching. Total log entries: ${allLogs.length}`);
    
        // Debug: Show the first log structure to understand the format
        if (allLogs.length > 0) {
            console.log('\nFirst log structure:');
            console.log(JSON.stringify(allLogs[0], null, 2));
            console.log('\nAvailable fields in log:', Object.keys(allLogs[0]));
        }
    
    // Decode all logs
    const decodedLogs = allLogs.map(log => decodePriceFeedUpdate(log)).filter(log => log !== null);
    
    console.log(`\nDecoded ${decodedLogs.length} PriceFeedUpdate events:`);
    console.log('\nDecoded Logs:', JSON.stringify(decodedLogs, null, 2));
    
    // Optional: Save to CSV or JSON file
    const fs = require('fs');
    const path = require('path');
    const outputPath = path.join(__dirname, 'pyth-price-feeds.json');
    fs.writeFileSync(outputPath, JSON.stringify(decodedLogs, null, 2));
    console.log(`\nSaved decoded data to ${outputPath}`);
    
    return decodedLogs;
}

main()


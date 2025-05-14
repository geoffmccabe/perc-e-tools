console.log('DATA: Loading data.js...');

const dbName = 'PercEToolsDB';
const storeName = 'images';
const version = 1;

async function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, version);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      db.createObjectStore(storeName, { keyPath: 'tokenId' });
    };
  });
}

async function cacheImage(tokenId, buffer, jsonHash) {
  try {
    const db = await openDB();
    const tx = db.transaction([storeName], 'readwrite');
    const store = tx.objectStore(storeName);
    await new Promise((resolve, reject) => {
      const request = store.put({ tokenId, buffer, jsonHash, lastCached: Date.now() });
      request.onsuccess = resolve;
      request.onerror = () => reject(request.error);
    });
    db.close();
    console.log(`[INDEXEDDB] Cached image ${tokenId}`);
  } catch (error) {
    console.error(`[INDEXEDDB] Error caching image ${tokenId}: ${error.message}`);
  }
}

async function getCachedImage(tokenId, jsonHash) {
  try {
    const db = await openDB();
    const tx = db.transaction([storeName], 'readonly');
    const store = tx.objectStore(storeName);
    const request = await new Promise((resolve, reject) => {
      const req = store.get(tokenId);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    db.close();
    if (request && request.jsonHash === jsonHash && request.lastCached > Date.now() - 24 * 60 * 60 * 1000) {
      console.log(`[INDEXEDDB] Retrieved cached image ${tokenId}`);
      return request.buffer;
    }
    return null;
  } catch (error) {
    console.error(`[INDEXEDDB] Error retrieving image ${tokenId}: ${error.message}`);
    return null;
  }
}

async function fetchWithFallback(url, maxRetries = 3, retryDelay = 1000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Attempt ${attempt}: Fetching ${url}`);
      const response = await axios.get(url, { timeout: 5000 });
      if (response.status !== 200) throw new Error(`Status: ${response.status}`);
      return response.data;
    } catch (error) {
      console.error(`Fetch attempt ${attempt} failed for ${url}: ${error.message}`);
      if (attempt === maxRetries) {
        try {
          const fallbackUrl = url.replace('5173', '3000');
          console.log(`Retrying with fallback: ${fallbackUrl}`);
          const response = await axios.get(fallbackUrl, { timeout: 5000 });
          return response.data;
        } catch (fallbackError) {
          console.error(`Fallback fetch failed: ${fallbackError.message}`);
          throw new Error(`Failed to fetch: ${fallbackError.message}`);
        }
      }
      await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
    }
  }
}

async function loadCollectionData(page = 1, api = 'helius') {
  console.log(`COLLECTION: loadCollectionData STARTED, page=${page}, api=${api}`);
  try {
    const url = `http://localhost:5173/api/perc-e/collection?page=${page}&limit=100&api=${api}`;
    const data = await fetchWithFallback(url);
    console.log(`COLLECTION: Data received: ${data.nfts.length} NFTs`);
    window.collectionTotal = data.total;
    window.maxAtlases = Math.ceil(window.collectionTotal / 100);
    window.collectionData = data.nfts;
    return data;
  } catch (error) {
    console.error(`COLLECTION: Error: ${error.message}`);
    document.getElementById('collection-count').textContent = 'Error loading collection data';
    throw error;
  }
}

async function loadWalletData(api = 'helius') {
  console.log(`WALLET: loadWalletData STARTED, api=${api}`);
  try {
    let allWallets = [];
    let page = 1;
    let hasMore = true;
    while (hasMore) {
      const url = `http://localhost:5173/api/perc-e/wallets?page=${page}&limit=50&api=${api}`;
      try {
        const data = await fetchWithFallback(url);
        console.log(`WALLET: Page ${page} received: ${data.length} wallets`);
        allWallets = allWallets.concat(data);
        if (data.length < 50) hasMore = false;
        page++;
      } catch (error) {
        console.error(`WALLET: Error fetching page ${page}: ${error.message}`);
        hasMore = false;
      }
    }
    console.log(`WALLET: Fetched ${allWallets.length} wallets`);
    window.walletData = allWallets;
    return allWallets;
  } catch (error) {
    console.error(`WALLET: Error: ${error.message}`);
    document.getElementById('wallet-count').textContent = 'Error loading wallet data';
    throw error;
  }
}

async function loadAnalysis(api = 'helius') {
  console.log(`ANALYSIS: loadAnalysis STARTED, api=${api}`);
  try {
    const url = `http://localhost:5173/api/perc-e/analysis?api=${api}`;
    const data = await fetchWithFallback(url);
    console.log('ANALYSIS: Data received');
    window.analysisData = data;
    return data;
  } catch (error) {
    console.error(`ANALYSIS: Error: ${error.message}`);
    document.getElementById('total-wallets').textContent = 'Error loading analysis';
    throw error;
  }
}

async function loadRawData(page = 1, api = 'helius') {
  console.log(`RAW DATA: loadRawData STARTED, api=${api}, page=${page}`);
  try {
    const url = `http://localhost:5173/api/perc-e/raw-data?api=${api}&page=${page}&limit=100`;
    const data = await fetchWithFallback(url);
    console.log(`RAW DATA: Data received: ${data.nfts.length} NFTs`);
    window.rawDataTotal = data.total;
    window.rawData = data.nfts;
    return data;
  } catch (error) {
    console.error(`RAW DATA: Error: ${error.message}`);
    document.getElementById('raw-data-count').textContent = 'Error loading raw data';
    throw error;
  }
}
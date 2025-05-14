console.log('[SERVER] Starting server.js...');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const axios = require('axios');
const { setTimeout } = require('timers/promises');
const crypto = require('crypto');
let sharp;
try {
  sharp = require('sharp');
  console.log('[SERVER] sharp loaded successfully');
} catch (error) {
  console.error('[SERVER] Failed to load sharp:', error.message);
}
const { cacheTile, rebuildIfNeeded } = require('./textureAtlas.js');
console.log('[SERVER] textureAtlas.js imported successfully');

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());
app.use('/atlases', express.static('atlases'));

app.use((req, res, next) => {
  console.log(`[SERVER] Request: ${req.method} ${req.url}`);
  next();
});

const mongoURI = 'mongodb+srv://geoffmccabe:pWNguHu9qU49WV5N@cluster0.lqyofdn.mongodb.net/perc-e-tools?retryWrites=true&w=majority&appName=Cluster0';
const heliusApiKey = '40d7f20b-beec-4f25-8bb1-5a818478ff9b';
const collectionId = '776HzkSfmiuEz7Ssurb5vHSAzic2yhRngiQekRzihuYR';
const perceptronsBaseUrl = 'https://perceptrons.network/dr/c_680be09693f08da253a6effb/';

console.log('[SERVER] Connecting to MongoDB...');
try {
  mongoose.connect(mongoURI, {
    serverSelectionTimeoutMS: 10000,
    connectTimeoutMS: 10000
  })
    .then(() => console.log('[SERVER] Connected to MongoDB Atlas'))
    .catch(err => {
      console.error('[SERVER] MongoDB Atlas connection error:', err.stack);
      throw err;
    });
} catch (err) {
  console.error('[SERVER] MongoDB setup error:', err.stack);
  process.exit(1);
}

const nftSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  name: String,
  traits: [{ trait_type: String, value: String }],
  image: String,
  json_uri: String,
  owner: { type: String, index: true },
  burnt: { type: Boolean, default: false, index: true },
  api_source: String,
  metadata: Object,
  metadata_hash: String,
  last_updated: { type: Date, default: Date.now, index: { expires: '1d' } }
});

const NFT = mongoose.model('NFT', nftSchema);

const walletSchema = new mongoose.Schema({
  wallet_address: { type: String, required: true, unique: true, index: true },
  perc_count: { type: Number, default: 0 },
  purchased: { type: Number, default: 0 },
  first_purchase_date: { type: String, default: 'N/A' },
  avg_purchases_monthly: { type: Number, default: 0 },
  sold: { type: Number, default: 0 },
  collections_purchased: { type: Number, default: 0 },
  forgings: { type: Number, default: 0 },
  transactions_processed: { type: Number, default: 0 },
  transferred: { type: Number, default: 0 },
  unique_wallets: { type: Number, default: 0 },
  flagged: { type: Boolean, default: false },
  social_media: { telegram: String, twitter: String },
  user_id: String,
  nfts: [{ id: String, traits: [{ trait_type: String, value: String }], tier: String, image: String }],
  last_updated: { type: Date, default: Date.now }
});

const Wallet = mongoose.model('Wallet', walletSchema);

const userSchema = new mongoose.Schema({
  telegram_id: { type: String, required: true, unique: true, index: true },
  wallets: [{ type: String }],
  interaction_frequency: Number,
  username: String,
  email: String,
  phone: String,
});

const User = mongoose.model('User', userSchema);

let nftCache = { lastUpdated: 0, nfts: [], totalMinted: 0, totalBurned: 0, isInitialized: false, apiSource: 'helius' };
let CACHE_REFRESH_INTERVAL = 60 * 1000;
const BATCH_SIZE = 1000;
const CONSECUTIVE_404_LIMIT = 10;

async function refreshNftCache(api = 'helius', rebuild = false) {
  console.log(`[CACHE] Starting NFT cache refresh, API: ${api}, Rebuild: ${rebuild}`);
  try {
      let nfts = [];
      const uniqueIds = new Set();
      let calculatedBurned = 0;
      const maxRetries = 3;
      const heliusAssetUrl = `https://api.helius.xyz/v0/addresses/${collectionId}/assets?api-key=${heliusApiKey}`;

      if (rebuild) {
          console.log('[CACHE] Clearing MongoDB nfts collection...');
          await NFT.deleteMany({});
          console.log('[CACHE] MongoDB nfts collection cleared.');
      }

      console.log('[CACHE] Fetching NFTs from Helius...');
      let heliusNfts = [];
      let page = 1;
      let hasMore = true;
      let consecutive404s = 0;
      while (hasMore && consecutive404s < CONSECUTIVE_404_LIMIT) {
          let retryCount = 0;
          let success = false;
          while (retryCount < maxRetries && !success) {
              try {
                  console.log(`[CACHE] Fetching Helius page ${page}`);
                  const response = await axios.get(heliusAssetUrl, {
                      params: { page, limit: 100 },
                      timeout: 15000
                  });
                  const assets = response.data.assets || [];
                  if (assets.length === 0) {
                      hasMore = false;
                      break;
                  }
                  consecutive404s = 0;
                  for (const asset of assets) {
                      const jsonUri = asset.content.json_uri;
                      let metadata = {};
                      let jsonHash = '';
                      try {
                          console.log(`[CACHE] Fetching metadata for ID ${asset.id}: ${jsonUri}`);
                          const metadataResponse = await axios.get(jsonUri, { timeout: 15000 });
                          metadata = metadataResponse.data;
                          jsonHash = crypto.createHash('sha256').update(JSON.stringify(metadata)).digest('hex');
                          console.log(`[CACHE] Metadata fetched for ID ${asset.id}`);
                      } catch (metaError) {
                          console.error(`[CACHE] Metadata fetch error for ${asset.id}: ${metaError.message}`);
                      }

                      const imageUrl = metadata.image || '';
                      let imageBuffer;
                      if (imageUrl) {
                          try {
                              console.log(`[CACHE] Downloading image for ID ${asset.id}: ${imageUrl}`);
                              const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 15000 });
                              imageBuffer = Buffer.from(imageResponse.data);
                              console.log(`[CACHE] Downloaded image for ID ${asset.id}, size: ${imageBuffer.length} bytes`);
                              if (imageBuffer.length === 0) throw new Error('Empty image buffer');

                              console.log(`[CACHE] Caching tile for ID ${asset.id}`);
                              await cacheTile({
                                  tokenId: asset.id,
                                  buffer: imageBuffer,
                                  burned: asset.burnt || false
                              });
                              console.log(`[CACHE] Successfully cached tile for ID ${asset.id}`);
                          } catch (imageError) {
                              console.error(`[CACHE] Failed to fetch or cache image for ID ${asset.id}: ${imageError.message}`);
                          }
                      }

                      heliusNfts.push({
                          id: asset.id,
                          name: metadata.name || 'Unknown',
                          attributes: metadata.attributes || [],
                          image: imageUrl,
                          metadataUri: jsonUri,
                          ownerAddress: asset.owner || 'unknown',
                          burnt: asset.burnt || false,
                          metadata: metadata,
                          jsonHash: jsonHash
                      });
                  }
                  page++;
                  success = true;
              } catch (error) {
                  console.error(`[CACHE] Error fetching Helius page ${page}: ${error.message}`);
                  if (error.response && error.response.status === 404) {
                      consecutive404s++;
                      if (consecutive404s >= CONSECUTIVE_404_LIMIT) {
                          console.error(`[CACHE] Too many 404s, stopping fetch.`);
                          hasMore = false;
                          break;
                      }
                  }
                  retryCount++;
                  if (retryCount >= maxRetries) {
                      console.error(`[CACHE] Max retries reached for Helius page ${page}.`);
                      hasMore = false;
                      break;
                  }
                  await setTimeout(2000 * retryCount);
              }
          }
      }
      console.log(`[CACHE] Fetched ${heliusNfts.length} NFTs from Helius.`);

      if (heliusNfts.length === 0) {
          console.warn(`[CACHE] No NFTs fetched from Helius, trying Perceptrons...`);
          let tokenId = 1;
          let perceptronsNfts = [];
          while (true) {
              try {
                  const jsonUri = `${perceptronsBaseUrl}${tokenId}.json`;
                  console.log(`[CACHE] Fetching Perceptrons NFT ${tokenId}: ${jsonUri}`);
                  const metadataResponse = await axios.get(jsonUri, { timeout: 15000 });
                  const metadata = metadataResponse.data;
                  const jsonHash = crypto.createHash('sha256').update(JSON.stringify(metadata)).digest('hex');
                  const imageUrl = metadata.image || '';
                  let imageBuffer;
                  let burnt = false;
                  if (imageUrl) {
                      try {
                          console.log(`[CACHE] Downloading image for ID ${tokenId}: ${imageUrl}`);
                          const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 15000 });
                          imageBuffer = Buffer.from(imageResponse.data);
                          console.log(`[CACHE] Downloaded image for ID ${tokenId}, size: ${imageBuffer.length} bytes`);
                          if (imageBuffer.length === 0) throw new Error('Empty image buffer');

                          console.log(`[CACHE] Caching tile for ID ${tokenId}`);
                          await cacheTile({
                              tokenId: String(tokenId),
                              buffer: imageBuffer,
                              burned: metadata.burnt || false
                          });
                          console.log(`[CACHE] Successfully cached tile for ID ${tokenId}`);
                      } catch (imageError) {
                          console.error(`[CACHE] Failed to fetch or cache image for ID ${tokenId}: ${imageError.message}`);
                      }
                  }

                  perceptronsNfts.push({
                      id: String(tokenId),
                      name: metadata.name || 'Unknown',
                      attributes: metadata.attributes || [],
                      image: imageUrl,
                      metadataUri: jsonUri,
                      ownerAddress: metadata.owner || 'unknown',
                      burnt: metadata.burnt || false,
                      metadata: metadata,
                      jsonHash: jsonHash
                  });
                  tokenId++;
              } catch (error) {
                  if (error.response && error.response.status === 404) {
                      console.log(`[CACHE] Reached end of Perceptrons NFTs at ID ${tokenId}`);
                      break;
                  }
                  console.error(`[CACHE] Error fetching Perceptrons NFT ${tokenId}: ${error.message}`);
                  tokenId++;
                  if (tokenId > 1000) {
                      console.log('[CACHE] Safety limit reached at ID 1000');
                      break;
                  }
              }
          }
          nfts = perceptronsNfts;
      } else {
          nfts = heliusNfts;
      }

      const allNfts = nfts;
      allNfts.forEach(nft => uniqueIds.add(nft.id));
      console.log(`[CACHE] Total NFTs fetched: ${allNfts.length}`);

      if (allNfts.length === 0) {
          console.warn(`[CACHE] No NFTs fetched. Falling back to DB...`);
          const dbNfts = await NFT.find();
          allNfts.push(...dbNfts.map(nft => ({
              id: nft.id,
              name: nft.name,
              attributes: nft.traits,
              image: nft.image,
              metadataUri: nft.json_uri,
              ownerAddress: nft.owner,
              burnt: nft.burnt,
              metadata: nft.metadata,
              jsonHash: nft.metadata_hash
          })));
          calculatedBurned = dbNfts.filter(nft => nft.burnt).length;
          console.log(`[CACHE] Fetched ${allNfts.length} NFTs from DB.`);
      }

      const processedNfts = [];
      let metadataFetchErrors = 0;
      let actualBurnedCount = 0;
      let updatedDbCount = 0;
      let dbUpdateErrors = 0;

      console.log("[CACHE] Processing NFT metadata & updating DB...");
      for (let i = 0; i < allNfts.length; i += BATCH_SIZE) {
          const batch = allNfts.slice(i, i + BATCH_SIZE);
          console.log(`[CACHE] Processing batch ${i / BATCH_SIZE + 1} (${batch.length} NFTs)...`);
          const batchPromises = batch.map(async (token) => {
              try {
                  if (!token || !token.id) {
                      console.warn("[CACHE] Skipping invalid token object.");
                      return null;
                  }

                  let metadata = token.metadata || {};
                  let jsonUri = token.metadataUri || '';
                  let owner = token.ownerAddress || 'unknown';
                  let name = token.name || 'Unknown';
                  let image = token.image || '';
                  let traits = token.attributes || [];
                  let tier = 'n/a';
                  let metadataBurned = token.burnt || false;
                  let metadataHash = token.jsonHash || '';
                  let finalBurnt = metadataBurned;

                  const dbNft = await NFT.findOne({ id: token.id });
                  if (dbNft && dbNft.burnt && dbNft.last_updated > new Date(Date.now() - 24 * 60 * 60 * 1000)) {
                      console.log(`[CACHE] Skipping burn check for ${token.id}; already marked burnt.`);
                      finalBurnt = true;
                      metadata = dbNft.metadata;
                      jsonUri = dbNft.json_uri;
                      owner = dbNft.owner;
                      name = dbNft.name;
                      image = dbNft.image;
                      traits = dbNft.traits;
                      metadataHash = dbNft.metadata_hash;
                  } else {
                      if (jsonUri && !metadata.name) {
                          try {
                              console.log(`[CACHE] Fetching metadata for ${token.id}: ${jsonUri}`);
                              const metadataResponse = await axios.get(jsonUri, { timeout: 15000 });
                              metadata = metadataResponse.data;
                              metadataHash = crypto.createHash('sha256').update(JSON.stringify(metadata)).digest('hex');
                              name = metadata?.name || name;
                              image = metadata?.image || image;
                              traits = (Array.isArray(metadata?.attributes))
                                  ? metadata.attributes.map(t => ({ trait_type: t?.trait_type, value: t?.value }))
                                  : traits;
                              metadataBurned = metadata?.burnt || metadataBurned;
                              finalBurnt = metadataBurned;
                          } catch (error) {
                              metadataFetchErrors++;
                              console.error(`[CACHE] Metadata fetch error for ${token.id}: ${error.message}`);
                          }
                      }
                  }

                  const tierTrait = traits.find(t => t.trait_type === 'Tier');
                  const tierValue = tierTrait?.value;
                  if (tierValue === 'Packaged') {
                      tier = 'Packaged';
                  } else if (typeof tierValue === 'string') {
                      const parsedTier = parseInt(tierValue.replace('Tier-', ''));
                      tier = (!isNaN(parsedTier) && parsedTier > 0) ? String(parsedTier) : 'n/a';
                  }

                  if (finalBurnt) actualBurnedCount++;

                  try {
                      await NFT.findOneAndUpdate(
                          { id: token.id },
                          {
                              name: name,
                              traits: traits,
                              image: image,
                              json_uri: jsonUri,
                              owner: owner,
                              burnt: finalBurnt,
                              api_source: api,
                              metadata: metadata,
                              metadata_hash: metadataHash,
                              last_updated: new Date()
                          },
                          { upsert: true, new: false }
                      );
                      updatedDbCount++;
                      console.log(`[CACHE] Updated DB for NFT ${token.id}`);
                  } catch (dbError) {
                      console.error(`[CACHE] DB Update Error for ${token.id}: ${dbError.message}`);
                      dbUpdateErrors++;
                  }

                  return {
                      id: token.id,
                      name: name,
                      traits: traits,
                      tier: tier,
                      image: image,
                      json_uri: jsonUri,
                      owner: owner,
                      burnt: finalBurnt,
                      metadata: metadata,
                      jsonHash: metadataHash
                  };
              } catch (error) {
                  console.error(`[CACHE] Error processing NFT ${token.id || 'unknown'}: ${error.message}`);
                  return null;
              }
          });

          const batchResults = await Promise.allSettled(batchPromises);
          batchResults.forEach((result, index) => {
              if (result.status === 'fulfilled' && result.value) {
                  processedNfts.push(result.value);
              } else if (result.status === 'rejected') {
                  console.error(`[CACHE] Processing failed for NFT ${batch[index]?.id || 'unknown'}: ${result.reason}`);
              }
          });
      }

      console.log(`[CACHE] Finished processing. Metadata Errors: ${metadataFetchErrors}, DB Updates: ${updatedDbCount}, DB Errors: ${dbUpdateErrors}.`);

      nftCache = {
          lastUpdated: Date.now(),
          nfts: processedNfts,
          totalMinted: processedNfts.length,
          totalBurned: actualBurnedCount,
          isInitialized: true,
          apiSource: api
      };
      console.log(`[CACHE] Cache refreshed: ${nftCache.totalMinted} NFTs, ${nftCache.totalBurned} burned.`);

      console.log('[CACHE] Forcing atlas rebuild...');
      await rebuildIfNeeded();
  } catch (error) {
      console.error(`[CACHE] Critical Error refreshing cache: ${error.message}`, error.stack);
      nftCache.isInitialized = true;
  }
}

console.log('[SERVER] Initializing NFT cache...');
refreshNftCache('helius', true);
setInterval(() => refreshNftCache('helius'), CACHE_REFRESH_INTERVAL);
setInterval(() => {
  console.log('[SERVER] Triggering atlas rebuild...');
  rebuildIfNeeded().catch(err => console.error('[SERVER] Atlas rebuild error:', err));
}, 5 * 60 * 1000);

app.get('/api/perc-e/collection', async (req, res) => {
  console.log(`[API /collection] Request received for page ${req.query.page || 1}`);
  try {
    const api = req.query.api || 'helius';
    if (!nftCache.isInitialized || nftCache.apiSource !== api) {
      console.log(`[API /collection] Cache not initialized or wrong source. Refreshing...`);
      await refreshNftCache(api);
    }

    const page = parseInt(req.query.page) || 1;
    const limit = 100;
    const skip = (page - 1) * limit;

    let paginatedNfts = nftCache.nfts.slice(skip, skip + limit);
    console.log(`[API /collection] Sending ${paginatedNfts.length} NFTs for page ${page}.`);

    if (paginatedNfts.length === 0) {
      console.warn(`[API /collection] No NFTs in cache for page ${page}. Fetching from DB...`);
      const dbNfts = await NFT.find({ api_source: api }).skip(skip).limit(limit);
      paginatedNfts = dbNfts.map(nft => ({
        id: nft.id,
        name: nft.name,
        traits: nft.traits,
        tier: nft.traits.find(t => t.trait_type === 'Tier')?.value || 'n/a',
        image: nft.image,
        json_uri: nft.json_uri,
        owner: nft.owner,
        burnt: nft.burnt,
        metadata: nft.metadata,
        jsonHash: nft.metadata_hash
      }));
      console.log(`[API /collection] Fetched ${paginatedNfts.length} NFTs from DB.`);
    }

    const collectionMetadata = {
      name: 'Perceptrons Collection #1',
      collection_address: collectionId,
      symbol: 'PERCS1',
      description: 'The Perceptrons Collection #1 spans 30 tiers of extraordinary rarity, evoking the profound awakening of intelligence as it stirs to life and grasps for empathy and connection. Each piece blurs the line between art and sentience, drawing viewers into a journey of becoming one with the universe\'s boundless mysteries. It whispers of creation, self-discovery, and the infinite beauty of minds awakening to their true essence.',
      seller_fee_basis_points: '(3%)',
      banner_url: ''
    };

    res.json({ metadata: collectionMetadata, nfts: paginatedNfts, total: nftCache.totalMinted });
  } catch (error) {
    console.error('[API /collection] Error fetching collection:', error.message);
    res.status(500).json({ message: 'Error fetching collection data', metadata: {}, nfts: [], total: 0 });
  }
});

app.get('/api/perc-e/wallets', async (req, res) => {
  console.log(`[API /wallets] Request received for page ${req.query.page || 1}`);
  try {
    const api = req.query.api || 'helius';
    if (!nftCache.isInitialized || nftCache.apiSource !== api) {
      console.log(`[API /wallets] Cache not initialized or wrong source. Refreshing...`);
      await refreshNftCache(api);
    }

    const page = parseInt(req.query.page) || 1;
    const limit = 50;
    const skip = (page - 1) * limit;

    const cachedNfts = nftCache.nfts || [];
    const walletDataAgg = {};
    const uniqueOwners = new Set();

    console.log(`[API /wallets] Aggregating ${cachedNfts.length} cached NFTs by owner...`);
    cachedNfts.forEach(token => {
      if (token.owner && token.owner !== 'unknown') {
        uniqueOwners.add(token.owner);
        if (!walletDataAgg[token.owner]) {
          walletDataAgg[token.owner] = { nfts: [] };
        }
        walletDataAgg[token.owner].nfts.push({
          id: token.id,
          traits: token.traits,
          tier: token.tier,
          image: token.image
        });
      }
    });

    if (uniqueOwners.size === 0) {
      console.warn("[API /wallets] No owners found in cache. Falling back to DB...");
      const dbNfts = await NFT.find({ api_source: api });
      dbNfts.forEach(nft => {
        if (nft.owner && nft.owner !== 'unknown') {
          uniqueOwners.add(nft.owner);
          if (!walletDataAgg[nft.owner]) {
            walletDataAgg[nft.owner] = { nfts: [] };
          }
          walletDataAgg[nft.owner].nfts.push({
            id: nft.id,
            traits: nft.traits,
            tier: nft.traits.find(t => t.trait_type === 'Tier')?.value || 'n/a',
            image: nft.image
          });
        }
      });
    }

    const ownerList = Array.from(uniqueOwners);
    console.log(`[API /wallets] Found ${ownerList.length} unique owners.`);

    const paginatedOwners = ownerList.slice(skip, skip + limit);
    console.log(`[API /wallets] Processing ${paginatedOwners.length} owners for page ${page}.`);

    const walletsResponse = [];

    for (const walletAddress of paginatedOwners) {
      const data = walletDataAgg[walletAddress];
      if (!data) {
        console.warn(`[API /wallets] Data missing for owner ${walletAddress}.`);
        continue;
      }

      let purchased = 0;
      let firstPurchaseDate = 'N/A';
      let avgPurchasesMonthly = 0;
      let sold = 0;
      let forgings = 0;
      let transactionsProcessed = 0;
      let collectionsPurchased = 0;

      try {
        const wallet = await Wallet.findOne({ wallet_address: walletAddress });
        if (wallet) {
          purchased = wallet.purchased || 0;
          firstPurchaseDate = wallet.first_purchase_date || 'N/A';
          avgPurchasesMonthly = wallet.avg_purchases_monthly || 0;
          sold = wallet.sold || 0;
          forgings = wallet.forgings || 0;
          transactionsProcessed = wallet.transactions_processed || 0;
          collectionsPurchased = wallet.collections_purchased || 0;
        }
        await Wallet.findOneAndUpdate(
          { wallet_address: walletAddress },
          {
            $set: {
              perc_count: data.nfts?.length || 0,
              nfts: data.nfts || [],
              purchased: purchased,
              first_purchase_date: firstPurchaseDate,
              avg_purchases_monthly: parseFloat(avgPurchasesMonthly),
              sold: sold,
              collections_purchased: collectionsPurchased,
              forgings: forgings,
              transactions_processed: transactionsProcessed,
              last_updated: new Date()
            }
          },
          { upsert: true, new: true }
        );
        console.log(`[API /wallets] DB updated for wallet ${walletAddress}.`);
      } catch (dbError) {
        console.error(`[API /wallets] Error updating DB for wallet ${walletAddress}: ${dbError.message}`);
      }

      walletsResponse.push({
        wallet_address: walletAddress,
        perc_count: data.nfts?.length || 0,
        nfts: data.nfts || [],
        purchased: purchased,
        first_purchase_date: firstPurchaseDate,
        avg_purchases_monthly: parseFloat(avgPurchasesMonthly),
        sold: sold,
        collections_purchased: collectionsPurchased,
        forgings: forgings,
        transactions_processed: transactionsProcessed
      });
    }

    console.log(`[API /wallets] Sending ${walletsResponse.length} wallets for page ${page}.`);
    res.json(walletsResponse);
  } catch (error) {
    console.error('[API /wallets] Error processing wallets:', error.message);
    res.status(500).json({ message: 'Error processing wallet data', wallets: [] });
  }
});

app.get('/api/perc-e/analysis', async (req, res) => {
  console.log(`[API /analysis] Route hit`);
  try {
    const api = req.query.api || 'helius';
    if (!nftCache.isInitialized || nftCache.apiSource !== api) {
      console.log(`[API /analysis] Cache not initialized or wrong source. Refreshing...`);
      await refreshNftCache(api);
    }

    console.log("[API /analysis] Fetching NFTs and Wallets from DB...");
    const nfts = await NFT.find({ api_source: api });
    const wallets = await Wallet.find();
    console.log(`[API /analysis] Found ${nfts.length} NFTs and ${wallets.length} Wallets.`);

    console.log("[API /analysis] Calculating Perc Points...");
    const walletPoints = wallets.map(wallet => {
      let percPoints = 0;
      if (wallet.nfts && Array.isArray(wallet.nfts)) {
        wallet.nfts.forEach(walletNft => {
          const dbNft = nfts.find(n => n.id === walletNft.id || n.id === `perc_${walletNft.id}`);
          if (!dbNft || dbNft.burnt) return;
          const tierTrait = walletNft.traits?.find(t => t.trait_type === 'Tier');
          if (tierTrait && tierTrait.value && tierTrait.value !== 'Packaged') {
            const tier = parseInt(String(tierTrait.value).replace('Tier-', ''));
            if (!isNaN(tier) && tier > 0) {
              percPoints += Math.pow(2, tier - 1);
            }
          }
        });
      }
      return {
        wallet_address: wallet.wallet_address,
        perc_points: percPoints
      };
    });

    const topWallets = walletPoints
      .sort((a, b) => b.perc_points - a.perc_points)
      .slice(0, 10);
    console.log("[API /analysis] Calculated Top 10 Wallets by Perc Power:", JSON.stringify(topWallets, null, 2));

    console.log("[API /analysis] Calculating Top Forgers...");
    const topForgers = wallets
      .map(wallet => ({
        wallet_address: wallet.wallet_address,
        forgings: (typeof wallet.forgings === 'number' && !isNaN(wallet.forgings)) ? wallet.forgings : 0
      }))
      .sort((a, b) => b.forgings - a.forgings)
      .slice(0, 10);
    console.log("[API /analysis] Calculated Top 10 Forgers:", JSON.stringify(topForgers, null, 2));

    console.log("[API /analysis] Calculating Tier Counts...");
    const tierMap = {};
    let totalTiered = 0;
    let totalPackaged = 0;
    let totalBurned = 0;
    const totalMinted = nftCache.totalMinted || nfts.length;

    nfts.forEach(nft => {
      const tierTrait = (nft.traits && Array.isArray(nft.traits))
        ? nft.traits.find(t => t.trait_type === 'Tier')
        : undefined;
      if (nft.burnt === true) {
        totalBurned++;
      } else if (tierTrait && tierTrait.value === 'Packaged') {
        totalPackaged++;
      } else if (tierTrait && tierTrait.value) {
        const tier = parseInt(String(tierTrait.value).replace('Tier-', ''));
        if (!isNaN(tier) && tier > 0) {
          tierMap[tier] = (tierMap[tier] || 0) + 1;
          totalTiered++;
        }
      }
    });
    console.log(`[API /analysis] Tier counts: Tiered=${totalTiered}, Packaged=${totalPackaged}, Burned=${totalBurned}, TotalMinted=${totalMinted}`);

    let tierCounts = Object.entries(tierMap)
      .map(([tierKey, count]) => ({
        tier: parseInt(tierKey),
        count,
        percentage: totalTiered > 0 ? (count / totalTiered * 100).toFixed(2) : '0.00'
      }))
      .sort((a, b) => b.tier - a.tier);

    if (totalPackaged > 0) {
      tierCounts.push({
        tier: 'Packaged',
        count: totalPackaged,
        percentage: ((totalTiered + totalPackaged) > 0 ? (totalPackaged / (totalTiered + totalPackaged) * 100) : 0).toFixed(2)
      });
    }

    const totalActive = totalTiered + totalPackaged;
    tierCounts.push({
      tier: 'Total',
      count: totalActive,
      percentage: '100.00'
    });

    tierCounts.push({
      tier: 'Burned',
      count: totalBurned,
      percentage: (totalMinted > 0 ? (totalBurned / totalMinted * 100) : 0).toFixed(2)
    });

    const responseDataToSend = {
      topWallets: topWallets,
      topForgers: topForgers,
      tierCounts: tierCounts,
      totalWallets: wallets.length
    };
    console.log("[API /analysis] Response prepared:", JSON.stringify(responseDataToSend, null, 2));

    res.json(responseDataToSend);
  } catch (error) {
    console.error('[API /analysis] Error:', error.message);
    res.status(500).json({
      message: 'Error fetching analysis data.',
      error: error.message,
      topWallets: [],
      topForgers: [],
      tierCounts: [],
      totalWallets: 0
    });
  }
});

app.get('/api/perc-e/raw-data', async (req, res) => {
  console.log(`[API /raw-data] Request received for page ${req.query.page || 1}`);
  try {
    const api = req.query.api || 'helius';
    if (!nftCache.isInitialized || nftCache.apiSource !== api) {
      console.log(`[API /raw-data] Cache not initialized or wrong source. Refreshing...`);
      await refreshNftCache(api);
    }

    const page = parseInt(req.query.page) || 1;
    const limit = 100;
    const skip = (page - 1) * limit;

    let allNfts = nftCache.nfts;
    if (allNfts.length === 0) {
      console.warn(`[API /raw-data] No NFTs in cache. Fetching from DB...`);
      const dbNfts = await NFT.find({ api_source: api });
      allNfts = dbNfts.map(nft => ({
        id: nft.id,
        name: nft.name,
        traits: nft.traits,
        tier: nft.traits.find(t => t.trait_type === 'Tier')?.value || 'n/a',
        json_uri: nft.json_uri,
        owner: nft.owner,
        burnt: nft.burnt,
        metadata: nft.metadata,
        jsonHash: nft.metadata_hash
      }));
      console.log(`[API /raw-data] Fetched ${allNfts.length} NFTs from DB.`);
    }

    allNfts.sort((a, b) => {
      const idA = a.json_uri ? parseInt(a.json_uri.match(/\/(\d+)\.json$/)?.[1] || '0') : 0;
      const idB = b.json_uri ? parseInt(b.json_uri.match(/\/(\d+)\.json$/)?.[1] || '0') : 0;
      return idA - idB;
    });

    const paginatedNfts = allNfts.slice(skip, skip + limit);
    console.log(`[API /raw-data] Sending ${paginatedNfts.length} NFTs for page ${page}.`);
    res.json({ nfts: paginatedNfts, total: allNfts.length });
  } catch (error) {
    console.error('[API /raw-data] Error fetching raw data:', error.message);
    res.status(500).json({ message: 'Error fetching raw data', nfts: [], total: 0 });
  }
});

app.get('/api/rebuild', async (req, res) => {
  console.log('[API /rebuild] Rebuild request received.');
  try {
    await refreshNftCache('helius', true);
    console.log('[API /rebuild] MongoDB rebuilt successfully.');
    res.json({ message: 'MongoDB rebuilt successfully', totalMinted: nftCache.totalMinted, totalBurned: nftCache.totalBurned });
  } catch (error) {
    console.error('[API /rebuild] Error rebuilding MongoDB:', error.message);
    res.status(500).json({ message: 'Error rebuilding MongoDB', error: error.message });
  }
});

app.get('/api/health', (req, res) => {
  console.log('[SERVER] Health check requested');
  res.json({ status: 'ok' });
});

console.log('[SERVER] Starting Express server...');
app.listen(port, () => {
  console.log(`[SERVER] Server running at http://localhost:${port}`);
});

app.use((err, req, res, next) => {
  console.error(`[SERVER] Error: ${err.message}`);
  console.error(err.stack);
  res.status(500).json({ message: 'Internal Server Error', error: err.message });
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[SERVER] Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('[SERVER] Uncaught Exception:', error);
  process.exit(1);
});

module.exports = app;
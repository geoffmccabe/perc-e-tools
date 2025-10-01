const cron = require("node-cron");
const supabase = require('../utils/supabase.js');
const axios = require("axios");

const API = "https://atomic.wax.eosrio.io/atomicassets/v1/assets";

// List of collections want to sync
const COLLECTIONS = [
  "crew.worlds",
  "tools.worlds",
  "arms.worlds"
];

async function rebuildCollection(collection) {
    console.log("rebuild start", collection);

    let { data } = await axios.get(`https://atomic.wax.eosrio.io/atomicassets/v1/schemas/alien.worlds/${collection}/stats`);
    if(!data || !data.success || data.data.assets == 0) {
        console.log(collection, 'assets not found!');
        return;
    }

    console.log("Total Assets:", data.data.assets);

    limit = 1000;
    const totalPages = Math.ceil(Number(data.data.assets) / limit);
    let BATCH_SIZE = 5;

    const syncTime = Date.now();

    const { error } = await supabase
    .from("nfts")
    .delete()
    .eq("chain", "wax")
    .eq("schema_name", collection);

    if (error) {
        console.error("Error deleting NFTs:", error);
    } else {
        console.log(`NFTs with schema ${collection} deleted successfully`);
    }


    for (let i = 1; i <= totalPages; i += BATCH_SIZE) {

        const batchPages = Array.from(
            { length: Math.min(BATCH_SIZE, totalPages - i + 1) },
            (_, idx) => i + idx
        );

        const batchResults = await Promise.all(
            batchPages.map(page => axios.get(API, {
                params: {
                collection_name: 'alien.worlds',
                schema_name: collection,
                limit: 1000,
                page
                }
             })
            )
        );
       

        let allResults = batchResults.flat();
        let allnfts = [];

        for(j = 0; j < allResults.length; j++) {
            let result = allResults[j];
            
            if (!result.data.success || result.data.data.length === 0) break;

            const nftRows = result.data.data.map((a) => ({
            nft_id: a.asset_id,
            chain: "wax",
            collection_name: a.collection.collection_name,
            schema_name: a.schema?.schema_name,
            contract_address: a.contract,
            owner: a.owner,
            name: a.data?.name || a.template?.immutable_data?.name,
            image_url: a.data?.img || a.template?.immutable_data?.img,
            description: a.data?.description || null,
            attributes: a.data || {},
            extra: {
            schema: a.schema?.schema_name,
            template_id: a.template?.template_id,
            burned: !!a.burned_by_account,
            template_mint: a.template_mint,
            },
            }));

            allnfts = [...allnfts, ...nftRows];
        };

        let { error } = await supabase.from("nfts").upsert(allnfts, {
            onConflict: "nft_id,chain",
        });

        if (error) {
            console.error(`Supabase upsert error for ${collection}:`, error);
            console.log("Retry .....");
            i -= BATCH_SIZE;
        } else {
            console.log(`${collection} ${allnfts.length} nfts inserted`);
        }
    }

    // Update sync time
    await supabase.from("wax_sync_meta").upsert({
      collection,
      last_sync: syncTime,
    });

    console.log(`[rebuild] ${collection} completed`);
}

async function syncCollection(collection, lastSync) {
    let page = 1;
    let more = true;

    const syncTime = Date.now();

    while (more) {
        const { data } = await axios.get(API, {
            params: {
            collection_name: 'alien.worlds',
            schema_name: collection,
            after: lastSync,
            limit: 100,
            page
            }
        });

        if (!data.success || data.data.length === 0) break;
        const nftRows = data.data.map((a) => ({
                nft_id: a.asset_id,
                chain: "wax",
                collection_name: a.collection.collection_name,
                contract_address: a.contract,
                owner: a.owner,
                name: a.data?.name || a.template?.immutable_data?.name,
                image_url: a.data?.img || a.template?.immutable_data?.img,
                description: a.data?.description || null,
                attributes: a.data || {},
                extra: {
                    schema: a.schema?.schema_name,
                    template_id: a.template?.template_id,
                    burned: !!a.burned_by_account,
                    template_mint: a.template_mint,
                },
        }));

        const { error } = await supabase.from("nfts").upsert(allnfts, {
            onConflict: "nft_id,chain",
        });

        if (error) {
            console.error(`Supabase upsert error for ${collection}:`, error.message);
        }
        else {
            if(nftRows.length == limit) page++;
            else more = false;
        }
    }

    // Update sync time
    await supabase.from("wax_sync_meta").upsert({
      collection,
      last_sync: syncTime,
    });

     console.log("sync completed", collection);
}


exports.syncAllCollections = async () =>  {

    for (const collection of COLLECTIONS) {
        // Get last sync timestamp
        const { data: syncMeta } = await supabase
        .from("wax_sync_meta")
        .select("last_sync")
        .eq("collection", collection)
        .maybeSingle();

        !syncMeta ? await rebuildCollection(collection) : await syncCollection(collection, syncMeta.last_sync)
    }
}
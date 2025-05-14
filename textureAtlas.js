const fs = require('fs').promises;
const path = require('path');
const sharp = require('sharp');
const axios = require('axios');

console.log('[ATLAS] Initializing textureAtlas.js...');

const ATLAS_DIR = path.join(__dirname, 'atlases');
const TILE_DIR = path.join(__dirname, 'tiles');
const MANIFEST = path.join(ATLAS_DIR, 'manifest.json');
const THUMB_WIDTH = 100;
const THUMB_HEIGHT = 100;
const TILE_WIDTH = 1024;
const TILE_HEIGHT = 1024;

async function ensureDirectories() {
    try {
        await fs.mkdir(ATLAS_DIR, { recursive: true });
        await fs.mkdir(TILE_DIR, { recursive: true });
        await fs.chmod(ATLAS_DIR, 0o755);
        await fs.chmod(TILE_DIR, 0o755);
        console.log(`[ATLAS] Directories ensured: ${TILE_DIR}, ${ATLAS_DIR}`);
        try {
            await fs.access(MANIFEST, fs.constants.F_OK);
            console.log(`[ATLAS] Manifest exists: ${MANIFEST}`);
        } catch {
            console.log(`[ATLAS] Creating initial manifest: ${MANIFEST}`);
            await fs.writeFile(MANIFEST, JSON.stringify({}, null, 2));
            await fs.chmod(MANIFEST, 0o644);
        }
    } catch (error) {
        console.error(`[ATLAS] Failed to create directories or manifest: ${error.message}`);
        throw error;
    }
}

async function loadManifest() {
    try {
        const data = await fs.readFile(MANIFEST, 'utf8');
        const manifest = JSON.parse(data);
        console.log(`[ATLAS] Manifest loaded with ${Object.keys(manifest).length} tokens: ${JSON.stringify(Object.keys(manifest).slice(0, 5), null, 2)}${Object.keys(manifest).length > 5 ? '...' : ''}`);
        return manifest;
    } catch (error) {
        console.error(`[ATLAS] Failed to load manifest (${error.message}), creating new one`);
        await fs.writeFile(MANIFEST, JSON.stringify({}, null, 2));
        await fs.chmod(MANIFEST, 0o644);
        console.log(`[ATLAS] Created new manifest: ${MANIFEST}`);
        return {};
    }
}

async function cacheTile({ tokenId, buffer, burned = false }) {
    try {
        console.log(`[ATLAS] Caching tile ${tokenId}, burned: ${burned}, input buffer size: ${buffer?.length || 0} bytes`);
        if (!buffer || buffer.length === 0) throw new Error('Input buffer is empty or invalid');

        const tilePath = path.join(TILE_DIR, `${tokenId}.webp`);
        const m = await loadManifest();
        m[tokenId] = { burned, lastCached: Date.now() };
        let outputBuffer;

        if (burned) {
            try {
                console.log(`[ATLAS] Fetching metadata for burned tile ${tokenId}`);
                const metadata = await axios.get(`https://perceptrons.network/dr/c_680be09693f08da253a6effb/${tokenId}.json`, { timeout: 15000 });
                if (metadata.data.image) {
                    console.log(`[ATLAS] Downloading burned image for ${tokenId}: ${metadata.data.image}`);
                    const imageResponse = await axios.get(metadata.data.image, { responseType: 'arraybuffer', timeout: 15000 });
                    outputBuffer = Buffer.from(imageResponse.data);
                    console.log(`[ATLAS] Processing burned image for ${tokenId}, size: ${outputBuffer.length} bytes`);
                    outputBuffer = await sharp(outputBuffer)
                        .resize(TILE_WIDTH, TILE_HEIGHT, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
                        .composite([{ input: Buffer.from([0, 0, 0, 230]), blend: 'over' }])
                        .webp({ quality: 80 })
                        .toBuffer();
                } else {
                    throw new Error('No image in JSON metadata');
                }
            } catch (error) {
                console.warn(`[ATLAS] No valid JSON for burned tile ${tokenId}, using black square: ${error.message}`);
                outputBuffer = await sharp({
                    create: { width: TILE_WIDTH, height: TILE_HEIGHT, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } }
                }).webp({ quality: 80 }).toBuffer();
            }
        } else {
            console.log(`[ATLAS] Processing non-burned tile ${tokenId}`);
            outputBuffer = await sharp(buffer)
                .resize(TILE_WIDTH, TILE_HEIGHT, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
                .webp({ quality: 80 })
                .toBuffer();
        }

        console.log(`[ATLAS] Writing tile ${tokenId} to ${tilePath}, output buffer size: ${outputBuffer.length} bytes`);
        await fs.writeFile(tilePath, outputBuffer);
        console.log(`[ATLAS] Writing manifest with ${Object.keys(m).length} entries to ${MANIFEST}`);
        await fs.writeFile(MANIFEST, JSON.stringify(m, null, 2));
        await fs.chmod(MANIFEST, 0o644);
        await fs.chmod(tilePath, 0o644);
        console.log(`[ATLAS] Cached tile ${tokenId}${burned ? ' (burned)' : ''} at ${tilePath}`);

        const stats = await fs.stat(tilePath);
        if (stats.size === 0) {
            console.error(`[ATLAS] CRITICAL: Tile ${tokenId} is EMPTY (0 bytes) at ${tilePath}`);
            throw new Error('Tile file is empty');
        }
        console.log(`[ATLAS] Verified tile ${tokenId}: ${tilePath}, size: ${stats.size} bytes`);

        const manifestStats = await fs.stat(MANIFEST);
        if (manifestStats.size === 0) {
            console.error(`[ATLAS] CRITICAL: Manifest is EMPTY (0 bytes) at ${MANIFEST}`);
            throw new Error('Manifest file is empty');
        }
        console.log(`[ATLAS] Verified manifest: ${MANIFEST}, size: ${manifestStats.size} bytes`);
    } catch (error) {
        console.error(`[ATLAS] Error caching tile ${tokenId}: ${error.message}`);
        throw error;
    }
}

async function rebuildIfNeeded() {
    try {
        console.log('[ATLAS] Starting atlas rebuild...');
        await ensureDirectories();
        const m = await loadManifest();
        console.log(`[ATLAS] Manifest loaded with ${Object.keys(m).length} tokens: ${JSON.stringify(Object.keys(m).slice(0, 10), null, 2)}${Object.keys(m).length > 10 ? '...' : ''}`);
        const validTokens = Object.keys(m).filter(id => !isNaN(parseInt(id))).sort((a, b) => parseInt(a) - parseInt(b));
        console.log(`[ATLAS] Valid tokens: ${validTokens.length} [${validTokens.slice(0, 10).join(', ')}${validTokens.length > 10 ? '...' : ''}]`);

        if (validTokens.length === 0) {
            console.log('[ATLAS] No valid tokens to build atlas, exiting');
            return;
        }

        const tilesPerRow = 10;
        const tilesPerCol = 10;
        const tilesPerAtlas = tilesPerRow * tilesPerCol;
        const numAtlases = Math.ceil(validTokens.length / tilesPerAtlas);
        console.log(`[ATLAS] Calculated ${numAtlases} atlases needed`);

        const existingFiles = await fs.readdir(ATLAS_DIR);
        for (const file of existingFiles) {
            if (file.startsWith('atlas_') || file.startsWith('thumb_')) {
                await fs.unlink(path.join(ATLAS_DIR, file));
                console.log(`[ATLAS] Removed old file: ${file}`);
            }
        }

        for (let atlasIndex = 1; atlasIndex <= numAtlases; atlasIndex++) {
            const startIdx = (atlasIndex - 1) * tilesPerAtlas;
            const endIdx = Math.min(startIdx + tilesPerAtlas, validTokens.length);
            const tokensForAtlas = validTokens.slice(startIdx, endIdx);
            console.log(`[ATLAS] Building atlas ${atlasIndex} with ${tokensForAtlas.length} tokens (IDs ${tokensForAtlas[0] || 'none'} to ${tokensForAtlas[tokensForAtlas.length - 1] || 'none'})`);

            if (tokensForAtlas.length === 0) {
                console.log(`[ATLAS] No tokens for atlas ${atlasIndex}, skipping`);
                continue;
            }

            const atlas = sharp({
                create: { width: tilesPerRow * TILE_WIDTH, height: tilesPerCol * TILE_HEIGHT, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
            }).webp({ quality: 15 });
            const thumb = sharp({
                create: { width: tilesPerRow * THUMB_WIDTH, height: tilesPerCol * THUMB_HEIGHT, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
            }).webp({ quality: 15 });

            const compositeOps = [];
            const thumbOps = [];

            for (let i = 0; i < tokensForAtlas.length; i++) {
                const tokenId = tokensForAtlas[i];
                const tilePath = path.join(TILE_DIR, `${tokenId}.webp`);
                try {
                    const stats = await fs.stat(tilePath);
                    console.log(`[ATLAS] Tile ${tokenId} found at ${tilePath}, size: ${stats.size} bytes`);
                    if (stats.size === 0) throw new Error(`Tile ${tokenId} is empty`);

                    compositeOps.push({ input: tilePath, left: (i % tilesPerRow) * TILE_WIDTH, top: Math.floor(i / tilesPerRow) * TILE_HEIGHT });

                    const thumbBuffer = await sharp(tilePath)
                        .resize(THUMB_WIDTH, THUMB_HEIGHT, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
                        .webp({ quality: 15 })
                        .toBuffer();
                    thumbOps.push({ input: thumbBuffer, left: (i % tilesPerRow) * THUMB_WIDTH, top: Math.floor(i / tilesPerRow) * THUMB_HEIGHT });
                    console.log(`[ATLAS] Added tile ${tokenId} to atlas ${atlasIndex}`);
                } catch (error) {
                    console.warn(`[ATLAS] Skipping tile ${tokenId} for atlas ${atlasIndex}: ${error.message}`);
                }
            }

            console.log(`[ATLAS] Atlas ${atlasIndex} has ${compositeOps.length} master tiles and ${thumbOps.length} thumb tiles`);

            if (compositeOps.length === 0) {
                console.log(`[ATLAS] No valid tiles for atlas ${atlasIndex}, skipping`);
                continue;
            }

            const atlasPath = path.join(ATLAS_DIR, `atlas_${atlasIndex}.webp`);
            const thumbPath = path.join(ATLAS_DIR, `thumb_${atlasIndex}.webp`);

            try {
                console.log(`[ATLAS] Saving atlas ${atlasIndex} to ${atlasPath}`);
                await atlas.composite(compositeOps).toFile(atlasPath);
                const atlasStats = await fs.stat(atlasPath);
                if (atlasStats.size === 0) {
                    console.error(`[ATLAS] CRITICAL: Atlas ${atlasIndex} is EMPTY (0 bytes): ${atlasPath}`);
                    throw new Error(`Atlas ${atlasIndex} is empty`);
                }
                await fs.chmod(atlasPath, 0o644);
                console.log(`[ATLAS] Saved master atlas ${atlasIndex}: ${atlasPath}, size: ${atlasStats.size} bytes`);

                console.log(`[ATLAS] Saving thumb ${atlasIndex} to ${thumbPath}`);
                await thumb.composite(thumbOps).toFile(thumbPath);
                const thumbStats = await fs.stat(thumbPath);
                if (thumbStats.size === 0) {
                    console.error(`[ATLAS] CRITICAL: Thumb ${atlasIndex} is EMPTY (0 bytes): ${thumbPath}`);
                    throw new Error(`Thumb ${atlasIndex} is empty`);
                }
                await fs.chmod(thumbPath, 0o644);
                console.log(`[ATLAS] Saved thumb atlas ${atlasIndex}: ${thumbPath}, size: ${thumbStats.size} bytes`);
            } catch (error) {
                console.error(`[ATLAS] Failed to save atlas ${atlasIndex}: ${error.message}`);
                try { await fs.unlink(atlasPath); console.log(`[ATLAS] Deleted corrupted atlas: ${atlasPath}`); } catch (e) { console.log(`[ATLAS] No atlas file to delete: ${atlasPath}`); }
                try { await fs.unlink(thumbPath); console.log(`[ATLAS] Deleted corrupted thumb: ${thumbPath}`); } catch (e) { console.log(`[ATLAS] No thumb file to delete: ${thumbPath}`); }
            }
        }
        console.log('[ATLAS] Atlas rebuild complete');
    } catch (error) {
        console.error(`[ATLAS] Error rebuilding atlas: ${error.message}`);
    }
}

module.exports = { cacheTile, rebuildIfNeeded };
console.log('UI: Loading ui.js...');

window.currentCollectionPage = window.currentCollectionPage || 1;
window.currentRawDataPage = window.currentRawDataPage || 1;
window.currentMasterAtlasPage = window.currentMasterAtlasPage || 1;
window.currentThumbAtlasPage = window.currentThumbAtlasPage || 1;
window.collectionTotal = window.collectionTotal || 0;
window.rawDataTotal = window.rawDataTotal || 0;
window.maxAtlases = window.maxAtlases || 1;
window.currentApi = window.currentApi || 'helius';
window.walletData = window.walletData || [];
window.collectionData = window.collectionData || [];
window.analysisData = window.analysisData || {};
window.rawData = window.rawData || [];

function updateWalletTable(wallets) {
  console.log('WALLET: Updating wallet table...');
  const tableBody = document.getElementById('wallet-table-body');
  tableBody.innerHTML = '';
  if (wallets.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="11">No wallet data available</td></tr>';
    document.getElementById('wallet-count').textContent = 'Total Wallets: 0, Total PERCs: 0';
    document.getElementById('processedStats').innerHTML = `
      <strong>Processed:</strong> Wallets: <span id="wallet-count">0</span> Percs: <span id="perc-count">0</span> Transactions: <span id="transaction-count">0</span>
    `;
    return;
  }
  let totalPercs = 0;
  wallets.forEach(wallet => {
    totalPercs += wallet.perc_count;
    const walletRow = document.createElement('tr');
    walletRow.classList.add('wallet-row');
    walletRow.innerHTML = `
      <td style="font-size:12px">${wallet.wallet_address.slice(0, 6)}...${wallet.wallet_address.slice(-4)}</td>
      <td style="text-align:center">${wallet.perc_count}</td>
      <td></td>
      <td></td>
      <td></td>
      <td style="text-align:center">${wallet.purchased}</td>
      <td style="font-size:12px">${wallet.first_purchase_date}</td>
      <td style="text-align:center">${wallet.avg_purchases_monthly.toFixed(2)}</td>
      <td style="text-align:center">${wallet.sold}</td>
      <td style="text-align:center">${wallet.collections_purchased}</td>
      <td style="text-align:center">${wallet.forgings}</td>
    `;
    tableBody.appendChild(walletRow);
    wallet.nfts.forEach(nft => {
      const nftRow = document.createElement('tr');
      nftRow.classList.add('wallet-nft-row');
      const traitsStr = nft.traits ? JSON.stringify(nft.traits, null, 2).replace(/"/g, '').replace(/,/g, ', ') : 'N/A';
      nftRow.innerHTML = `
        <td></td>
        <td></td>
        <td><pre style="margin:0;font-size:12px">${traitsStr}</pre></td>
        <td><img src="${nft.image}" class="wallet-img" onclick="showImageModal('${nft.image}')"></td>
        <td style="text-align:center">${nft.tier}</td>
        <td></td>
        <td></td>
        <td></td>
        <td></td>
        <td></td>
        <td></td>
      `;
      tableBody.appendChild(nftRow);
    });
  });
  document.getElementById('wallet-count').textContent = `Total Wallets: ${wallets.length}, Total PERCs: ${totalPercs}`;
  document.getElementById('processedStats').innerHTML = `
    <strong>Processed:</strong> Wallets: <span id="wallet-count">${wallets.length}</span> Percs: <span id="perc-count">${totalPercs}</span> Transactions: <span id="transaction-count">0</span>
  `;
  console.log('WALLET: Table updated');
}

function updateAnalysisTables() {
    if (!window.analysisData.topWallets) return;
    const topWalletsBody = document.getElementById('top-wallets-body');
    const topForgersBody = document.getElementById('top-forgers-body');
    const tierCountBody = document.getElementById('tier-count-body');
    const totalWallets = document.getElementById('total-wallets');
    if (!topWalletsBody || !topForgersBody || !tierCountBody || !totalWallets) return;
  
    topWalletsBody.innerHTML = '';
    window.analysisData.topWallets.forEach((wallet, index) => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td style="text-align:center">${index + 1}</td>
        <td style="font-size:12px">${wallet.wallet_address.slice(0, 6)}...${wallet.wallet_address.slice(-4)}</td>
        <td style="text-align:right">${wallet.perc_points}</td>
      `;
      topWalletsBody.appendChild(row);
    });
  
    topForgersBody.innerHTML = '';
    window.analysisData.topForgers.forEach((forger, index) => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td style="text-align:center">${index + 1}</td>
        <td style="font-size:12px">${forger.wallet_address.slice(0, 6)}...${forger.wallet_address.slice(-4)}</td>
        <td style="text-align:right">${forger.forgings}</td>
      `;
      topForgersBody.appendChild(row);
    });
  
    tierCountBody.innerHTML = '';
    window.analysisData.tierCounts.forEach(tier => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td style="text-align:center">${tier.tier}</td>
        <td style="text-align:right">${tier.count}</td>
        <td style="text-align:right">${tier.percentage}%</td>
      `;
      tierCountBody.appendChild(row);
    });
  
    totalWallets.textContent = window.analysisData.totalWallets || '0';
  }

function updateCollectionTable(nfts) {
    console.log('COLLECTION: Updating table with cached data');
    const tableBody = document.getElementById('collection-table-body');
    const countElement = document.getElementById('collection-count');
    if (!tableBody || !countElement) return;
    tableBody.innerHTML = '';
    nfts.forEach(nft => {
      const row = document.createElement('tr');
      if (nft.burnt) row.classList.add('burned');
      const traitsStr = nft.traits ? JSON.stringify(nft.traits, null, 2).replace(/"/g, '').replace(/,/g, ', ') : 'N/A';
      row.innerHTML = `
        <td><img src="${nft.image}" class="collection-img" onclick="showImageModal('${nft.image}')"></td>
        <td>${nft.name || 'Unknown'}</td>
        <td>${nft.id}</td>
        <td><pre style="margin:0;font-size:12px;">${traitsStr}</pre></td>
        <td><a href="${nft.json_uri}" target="_blank" style="color:#007bff">${nft.json_uri.slice(0, 30)}...</a></td>
        <td>${nft.owner ? nft.owner.slice(0, 6) + '...' + nft.owner.slice(-4) : 'Unknown'}</td>
        <td>${nft.burnt ? 'Yes' : 'No'}</td>
      `;
      tableBody.appendChild(row);
    });
    countElement.textContent = `Total NFTs: ${window.collectionTotal}`;
    const pageInfo = document.getElementById('page-info');
    if (pageInfo) {
      pageInfo.textContent = `Page ${window.currentCollectionPage} of ${Math.ceil(window.collectionTotal / 100)}`;
    }
    updatePaginationButtons(window.currentCollectionPage, window.collectionTotal, 'collection');
  }

function updateRawDataTable(nfts) {
  console.log('RAW DATA: Updating table with cached data');
  const tableBody = document.getElementById('raw-data-table-body');
  const countElement = document.getElementById('raw-data-count');
  if (!tableBody || !countElement) return;
  tableBody.innerHTML = '';
  nfts.forEach(nft => {
    const row = document.createElement('tr');
    if (nft.burnt) row.classList.add('burned');
    const traitsStr = nft.traits ? JSON.stringify(nft.traits, null, 2).replace(/"/g, '').replace(/,/g, ', ') : 'N/A';
    const metadataStr = JSON.stringify(nft.metadata, null, 2).slice(0, 50).replace(/"/g, '') + '...';
    row.innerHTML = `
      <td>${nft.id}</td>
      <td>${nft.name || 'Unknown'}</td>
      <td>${nft.id}</td>
      <td><pre style="margin:0;font-size:12px">${traitsStr}</pre></td>
      <td><a href="${nft.json_uri}" target="_blank" style="color:#007bff">${nft.json_uri.slice(0, 30)}...</a></td>
      <td style="font-size:12px">${nft.owner ? nft.owner.slice(0, 6) + '...' + nft.owner.slice(-4) : 'Unknown'}</td>
      <td>${nft.burnt ? 'Yes' : 'No'}</td>
      <td><span class="metadata-preview" onclick="showMetadataModal(${JSON.stringify(nft.metadata).replace(/"/g, '"')})">${metadataStr}</span></td>
    `;
    tableBody.appendChild(row);
  });
  countElement.textContent = `Total NFTs: ${window.rawDataTotal}`;
  const pageInfo = document.getElementById('raw-page-info');
  if (pageInfo) {
    pageInfo.textContent = `Page ${window.currentRawDataPage} of ${Math.ceil(window.rawDataTotal / 100)}`;
  }
  updatePaginationButtons(window.currentRawDataPage, window.rawDataTotal, 'raw-data');
}

function updatePaginationButtons(page, total, type) {
  console.log(`PAGINATION: Updating ${type} buttons for page ${page}`);
  const totalPages = Math.ceil(total / 100);
  const buttons = document.querySelectorAll(`.pagination button`);
  buttons.forEach(btn => {
    const text = btn.textContent;
    let delta;
    if (text === '-') delta = -1;
    else if (text === '+') delta = 1;
    else delta = parseInt(text);
    if (!isNaN(delta)) {
      const newPage = page + delta;
      btn.disabled = newPage < 1 || newPage > totalPages;
      btn.style.opacity = btn.disabled ? '0.5' : '1';
    }
  });
}

function changePage(delta) {
  console.log(`PAGINATION: Changing collection page by ${delta}`);
  const newPage = Math.max(1, Math.min(Math.ceil(window.collectionTotal / 100), window.currentCollectionPage + delta));
  if (newPage !== window.currentCollectionPage) {
    window.currentCollectionPage = newPage;
    loadCollectionData(newPage, window.currentApi).then(data => {
      updateCollectionTable(data.nfts);
      document.getElementById('collection-name').textContent = data.metadata.name || 'N/A';
      document.getElementById('collection-address').textContent = data.metadata.collection_address || 'N/A';
      document.getElementById('collection-symbol').textContent = data.metadata.symbol || 'N/A';
      document.getElementById('collection-description').textContent = data.metadata.description || 'N/A';
      document.getElementById('collection-fee').textContent = data.metadata.seller_fee_basis_points || 'N/A';
    });
  }
}

function changeRawDataPage(delta) {
  console.log(`PAGINATION: Changing raw data page by ${delta}`);
  const newPage = Math.max(1, Math.min(Math.ceil(window.rawDataTotal / 100), window.currentRawDataPage + delta));
  if (newPage !== window.currentRawDataPage) {
    window.currentRawDataPage = newPage;
    loadRawData(newPage, window.currentApi).then(data => {
      updateRawDataTable(data.nfts);
    });
  }
}

function changeMasterAtlasPage(delta) {
    console.log(`PAGINATION: Changing master atlas page by ${delta}`);
    let newPage = window.currentMasterAtlasPage + delta;
    if (newPage < 1) newPage = window.maxAtlases;
    if (newPage > window.maxAtlases) newPage = 1;
    window.currentMasterAtlasPage = newPage;
    loadAtlasImages(window.currentMasterAtlasPage, 'master');
  }
  
  function changeThumbAtlasPage(delta) {
    console.log(`PAGINATION: Changing thumb atlas page by ${delta}`);
    let newPage = window.currentThumbAtlasPage + delta;
    if (newPage < 1) newPage = window.maxAtlases;
    if (newPage > window.maxAtlases) newPage = 1;
    window.currentThumbAtlasPage = newPage;
    loadAtlasImages(window.currentThumbAtlasPage, 'thumb');
  }
  
  async function loadAtlasImages(index, type, retryCount = 0) {
    const maxRetries = 3;
    console.log(`[ATLAS] Loading ${type} atlas image for index ${index}, attempt ${retryCount + 1}`);

    if (retryCount >= maxRetries) {
        console.error(`[ATLAS] Max retries (${maxRetries}) reached for ${type} atlas ${index}`);
        const pageInfo = document.getElementById(type === 'master' ? 'atlas-page-info' : 'thumb-page-info');
        if (pageInfo) pageInfo.textContent = `${type === 'master' ? 'Atlas' : 'Thumb'} ${index} (Failed)`;
        return;
    }

    if (index < 1 || index > window.maxAtlases) {
        console.warn(`[ATLAS] Invalid index ${index} for ${type}, defaulting to 1`);
        index = 1;
        if (type === 'master') window.currentMasterAtlasPage = 1;
        else window.currentThumbAtlasPage = 1;
    }

    const imgElement = document.getElementById(type === 'master' ? 'atlasMaster' : 'atlasThumb');
    const pageInfo = document.getElementById(type === 'master' ? 'atlas-page-info' : 'thumb-page-info');
    if (!imgElement || !pageInfo) {
        console.error(`[ATLAS] ${type} image or page info element not found`);
        return;
    }

    const src = `/atlases/${type === 'master' ? 'atlas' : 'thumb'}_${index}.webp?t=${Date.now()}`;
    console.log(`[ATLAS] Attempting to load ${type} atlas: ${src}`);

    imgElement.onerror = null;
    imgElement.onload = null;

    imgElement.onerror = async () => {
        console.error(`[ATLAS] Failed to load ${type} atlas ${index} from ${src} (Attempt ${retryCount + 1})`);
        imgElement.src = '';
        pageInfo.textContent = `${type === 'master' ? 'Atlas' : 'Thumb'} ${index} (Retrying ${retryCount + 2}/${maxRetries + 1}...)`;
        const delay = 2000 * Math.pow(2, retryCount);
        await new Promise(resolve => setTimeout(resolve, delay));
        loadAtlasImages(index, type, retryCount + 1);
    };

    imgElement.onload = () => {
        console.log(`[ATLAS] Successfully loaded ${type} atlas ${index}`);
        pageInfo.textContent = `${type === 'master' ? 'Atlas' : 'Thumb'} ${index}`;
        imgElement.onerror = null;
        imgElement.onload = null;
    };

    imgElement.src = src;
}

function switchTab(tab) {
  console.log(`TAB: Switching to ${tab}`);
  document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
  document.querySelector(`.tab-button[onclick="switchTab('${tab}')"]`).classList.add('active');
  document.getElementById(tab).classList.add('active');
  if (tab === 'collection' && window.collectionData.length > 0) {
    updateCollectionTable(window.collectionData);
  } else if (tab === 'collection') {
    loadCollectionData(window.currentCollectionPage, window.currentApi).then(data => {
      updateCollectionTable(data.nfts);
      document.getElementById('collection-name').textContent = data.metadata.name || 'N/A';
      document.getElementById('collection-address').textContent = data.metadata.collection_address || 'N/A';
      document.getElementById('collection-symbol').textContent = data.metadata.symbol || 'N/A';
      document.getElementById('collection-description').textContent = data.metadata.description || 'N/A';
      document.getElementById('collection-fee').textContent = data.metadata.seller_fee_basis_points || 'N/A';
    });
  }
  if (tab === 'wallet' && window.walletData.length > 0) {
    updateWalletTable(window.walletData);
  } else if (tab === 'wallet') {
    loadWalletData(window.currentApi).then(data => {
      updateWalletTable(data);
    });
  }
  if (tab === 'analysis' && window.analysisData.topWallets) {
    updateAnalysisTables();
  } else if (tab === 'analysis') {
    loadAnalysis(window.currentApi).then(() => {
      updateAnalysisTables();
    });
  }
  if (tab === 'raw-data' && window.rawData.length > 0) {
    updateRawDataTable(window.rawData);
  } else if (tab === 'raw-data') {
    loadRawData(window.currentRawDataPage, window.currentApi).then(data => {
      updateRawDataTable(data.nfts);
    });
  }
  if (tab === 'atlas') {
    loadAtlasImages(window.currentMasterAtlasPage, 'master');
    loadAtlasImages(window.currentThumbAtlasPage, 'thumb');
  }
}

function showImageModal(src) {
  console.log(`MODAL: Showing image modal for ${src}`);
  const modal = document.getElementById('imageModal');
  const modalImg = document.getElementById('modalImage');
  modal.style.display = 'flex';
  modalImg.src = src;
  modalImg.onclick = (e) => e.stopPropagation();
}

function showMetadataModal(metadata) {
  console.log('MODAL: Showing metadata modal');
  const modal = document.getElementById('metadataModal');
  const content = document.getElementById('metadataModalContent');
  try {
    content.textContent = JSON.stringify(JSON.parse(metadata), null, 2);
  } catch (e) {
    content.textContent = metadata;
  }
  modal.style.display = 'block';
  const closeBtn = document.getElementById('metadataModalClose');
  closeBtn.onclick = () => modal.style.display = 'none';
  content.onclick = (e) => e.stopPropagation();
}

function refreshData() {
  window.currentApi = document.querySelector('input[name="api"]:checked').value;
  console.log(`REFRESH: Refreshing data with API: ${window.currentApi}`);
  loadCollectionData(window.currentCollectionPage, window.currentApi).then(data => {
    updateCollectionTable(data.nfts);
    document.getElementById('collection-name').textContent = data.metadata.name || 'N/A';
    document.getElementById('collection-address').textContent = data.metadata.collection_address || 'N/A';
    document.getElementById('collection-symbol').textContent = data.metadata.symbol || 'N/A';
    document.getElementById('collection-description').textContent = data.metadata.description || 'N/A';
    document.getElementById('collection-fee').textContent = data.metadata.seller_fee_basis_points || 'N/A';
  });
  loadWalletData(window.currentApi).then(data => {
    updateWalletTable(data);
  });
  loadAnalysis(window.currentApi).then(() => {
    updateAnalysisTables();
  });
  loadRawData(window.currentRawDataPage, window.currentApi).then(data => {
    updateRawDataTable(data.nfts);
  });
  loadAtlasImages(window.currentMasterAtlasPage, 'master');
  loadAtlasImages(window.currentThumbAtlasPage, 'thumb');
}

document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM: Loaded, initializing data fetch...');
  document.querySelectorAll('input[name="api"]').forEach(input => {
    input.addEventListener('change', refreshData);
  });
  loadCollectionData(window.currentCollectionPage, window.currentApi).then(data => {
    updateCollectionTable(data.nfts);
    document.getElementById('collection-name').textContent = data.metadata.name || 'N/A';
    document.getElementById('collection-address').textContent = data.metadata.collection_address || 'N/A';
    document.getElementById('collection-symbol').textContent = data.metadata.symbol || 'N/A';
    document.getElementById('collection-description').textContent = data.metadata.description || 'N/A';
    document.getElementById('collection-fee').textContent = data.metadata.seller_fee_basis_points || 'N/A';
  });
  loadWalletData(window.currentApi).then(data => {
    updateWalletTable(data);
  });
  loadAnalysis(window.currentApi).then(() => {
    updateAnalysisTables();
  });
  loadRawData(window.currentRawDataPage, window.currentApi).then(data => {
    updateRawDataTable(data.nfts);
  });
  loadAtlasImages(window.currentMasterAtlasPage, 'master');
  loadAtlasImages(window.currentThumbAtlasPage, 'thumb');

  const imageModal = document.getElementById('imageModal');
  const metadataModal = document.getElementById('metadataModal');
  imageModal.addEventListener('click', (e) => {
    if (e.target === imageModal) imageModal.style.display = 'none';
  });
  metadataModal.addEventListener('click', (e) => {
    if (e.target === metadataModal) metadataModal.style.display = 'none';
  });
});
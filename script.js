/*
  Purpose: Handle client-side logic for the PERC-E Tools website, fetching wallet data from the backend API and populating the wallet list table. This is Stage 1, renamed from "Agent PERC-E" to "PERC-E Tools" with updated comments and alerts.
  Why: Enables dynamic data rendering, preparing for future integration of Magic Eden and QuickNode APIs. Reuses axios for consistency with your app’s setup (src/services/wallet.js).
  Changes:
  - Updated comments and alert messages to reference "PERC-E Tools".
*/

// Fetch wallet data from backend API and populate table
async function loadWallets() {
  try {
    const response = await axios.get('http://localhost:3000/api/perc-e/wallets');
    const wallets = response.data;
    const tableBody = document.getElementById('wallet-table-body');
    tableBody.innerHTML = '';
    wallets.forEach(wallet => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${wallet.wallet_address}</td>
        <td>${wallet.perc_count || 0}</td>
        <td>${JSON.stringify(wallet.tiers || {})}</td>
        <td>${wallet.purchased || 0}</td>
        <td>${wallet.sold || 0}</td>
        <td>${wallet.transferred || 0}</td>
        <td>${wallet.unique_wallets || 0}</td>
      `;
      row.onclick = () => loadUserMetrics(wallet.wallet_address);
      tableBody.appendChild(row);
    });
  } catch (error) {
    console.error('Error loading wallets:', error);
    alert('Failed to load wallet data in PERC-E Tools');
  }
}

// Placeholder for loading user metrics (to be implemented in Stage 4)
function loadUserMetrics(walletAddress) {
  document.getElementById('nft-data').textContent = `NFT data for ${walletAddress} (coming in Stage 4)`;
  document.getElementById('crypto-data').textContent = `Crypto data for ${walletAddress} (coming in Stage 4)`;
  document.getElementById('evm-data').textContent = `EVM data for ${walletAddress} (coming in Stage 5)`;
  document.getElementById('personal-data').textContent = `Personal data for ${walletAddress} (coming in Stage 6)`;
}

// Admin panel functions (placeholders for Stage 6)
function flagWallet() {
  const wallet = document.getElementById('wallet-input').value;
  alert(`Flagging wallet ${wallet} in PERC-E Tools (coming in Stage 6)`);
}

function assignSocialMedia() {
  const wallet = document.getElementById('wallet-input').value;
  alert(`Assigning social media for ${wallet} in PERC-E Tools (coming in Stage 6)`);
}

function downloadData() {
  const wallet = document.getElementById('wallet-input').value;
  alert(`Downloading data for ${wallet} in PERC-E Tools (coming in Stage 6)`);
}

function refreshData() {
  const wallet = document.getElementById('wallet-input').value;
  alert(`Refreshing data for ${wallet} in PERC-E Tools (coming in Stage 6)`);
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', loadWallets);

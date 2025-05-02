/*
  Purpose: Handle client-side logic for the PERC-E Tools website, fetching wallet data from the backend API and populating the wallet list table with PERC counts. This is Stage 2, building on Stage 1.
  Why: Displays wallet data for Perceptrons Collection #1, preparing for additional metrics in later stages.
  Changes:
  - Updated loadWallets to display wallet_address and perc_count.
  - Kept placeholders for future metrics.
*/

// Fetch wallet data from backend API and populate table
async function loadWallets() {
  try {
    const response = await axios.get('http://localhost:3000/api/perc-e/wallets');
    console.log('Wallet data:', response.data); // Debug log
    const wallets = Array.isArray(response.data) ? response.data : [];
    const tableBody = document.getElementById('wallet-table-body');
    tableBody.innerHTML = '';
    if (wallets.length) {
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
    } else {
      tableBody.innerHTML = `<tr><td colspan="7">No wallet data available</td></tr>`;
    }
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

// Admin panel placeholders (Stage 6)
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
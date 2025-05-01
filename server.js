/*
  Purpose: Set up a Node.js/Express backend for the PERC-E Tools website, connecting to MongoDB and providing a basic API endpoint to fetch wallet data. This is Stage 1, renamed from "Agent PERC-E" to "PERC-E Tools" with updated database name and comments.
  Why: Enables data storage and API access for wallet/user metrics, preparing for integration with Magic Eden and QuickNode APIs in later stages. Aligns with your app’s backend infrastructure.
  Changes:
  - Renamed MongoDB database from 'agent-perc-e' to 'perc-e-tools'.
  - Updated comments to reference "PERC-E Tools".
*/

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
const port = 3000;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB connection
mongoose.connect('mongodb://localhost:27017/perc-e-tools', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => {
  console.log('Connected to MongoDB');
}).catch(err => {
  console.error('MongoDB connection error:', err);
});

// Wallet schema
const walletSchema = new mongoose.Schema({
  wallet_address: { type: String, required: true, unique: true },
  perc_count: { type: Number, default: 0 },
  tiers: { type: Object, default: {} },
  purchased: { type: Number, default: 0 },
  sold: { type: Number, default: 0 },
  transferred: { type: Number, default: 0 },
  unique_wallets: { type: Number, default: 0 },
  flagged: { type: Boolean, default: false },
  social_media: { telegram: String, twitter: String },
  user_id: String, // Links to user via @TelegramID
});

const Wallet = mongoose.model('Wallet', walletSchema);

// User schema for user-wallet hierarchy
const userSchema = new mongoose.Schema({
  telegram_id: { type: String, required: true, unique: true },
  wallets: [{ type: String }], // Array of wallet addresses
  interaction_frequency: Number,
  username: String,
  email: String,
  phone: String,
});

const User = mongoose.model('User', userSchema);

// API endpoint to fetch wallets
app.get('/api/perc-e/wallets', async (req, res) => {
  try {
    const wallets = await Wallet.find();
    res.json(wallets);
  } catch (error) {
    console.error('Error fetching wallets in PERC-E Tools:', error);
    res.status(500).json({ error: 'Failed to fetch wallets' });
  }
});

// Start server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});

/*
  Purpose: Set up a Node.js/Express backend for the PERC-E Tools website, connecting to MongoDB Atlas and fetching wallet data from Magic Eden API for Perceptrons Collection #1. This is Stage 2, building on Stage 1.
  Why: Stores and serves wallet PERC data, preparing for further metrics in later stages.
  Changes:
  - Added axios for Magic Eden API calls.
  - Added endpoint to fetch wallet data from /collections/perceptrons_collection_1/leaderboard.
*/

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const axios = require('axios');

const app = express();
const port = 3000;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Atlas connection
const mongoURI = 'mongodb+srv://geoffmccabe:pWNguHu9qU49WV5N@cluster0.lqyofdn.mongodb.net/perc-e-tools?retryWrites=true&w=majority&appName=Cluster0';
mongoose.connect(mongoURI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => {
  console.log('Connected to MongoDB Atlas');
}).catch(err => {
  console.error('MongoDB Atlas connection error:', err);
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

// User schema
const userSchema = new mongoose.Schema({
  telegram_id: { type: String, required: true, unique: true },
  wallets: [{ type: String }],
  interaction_frequency: Number,
  username: String,
  email: String,
  phone: String,
});

const User = mongoose.model('User', userSchema);

// Fetch and store wallet data from Magic Eden
app.get('/api/perc-e/wallets', async (req, res) => {
  try {
    // Fetch top wallets from Magic Eden
    const response = await axios.get('https://api-mainnet.magiceden.dev/v2/collections/famous_fox_federation/leaderboard');
    console.log('API response:', JSON.stringify(response.data, null, 2)); // Debug log
    const leaderboard = response.data || [];

    // Process wallets
    const wallets = leaderboard.map(entry => ({
      wallet_address: entry.wallet,
      perc_count: 0 // Placeholder count
    }));

    console.log('Sending response:', JSON.stringify(wallets, null, 2)); // Debug log
    res.json(wallets);
  } catch (error) {
    console.error('Error fetching wallets:', error.message, error.response?.status, error.response?.data || '');
    console.log('Sending error response: []'); // Debug log
    res.json([]);
  }
});

// Start server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
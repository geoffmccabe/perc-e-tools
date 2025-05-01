/*
  Purpose: Set up a Node.js/Express backend for the PERC-E Tools website, connecting to MongoDB Atlas and providing a basic API endpoint to fetch wallet data. This is Stage 1 of the PERC-E Tools project, designed to store and manage wallet/user metrics.
  Why: Enables data storage and API access for wallet/user metrics, preparing for integration with Magic Eden and QuickNode APIs in later stages. Uses MongoDB Atlas for cloud hosting, aligning with your provided connection string.
  Changes:
  - Set mongoURI to your MongoDB Atlas connection string with database 'perc-e-tools', auto-created when data is written.
  - Updated comments for clarity and to reflect PERC-E Tools branding.
  - Ensured all schemas and API endpoints remain consistent with Stage 1 requirements.
*/

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

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
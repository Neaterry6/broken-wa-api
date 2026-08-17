const express = require('express');
const { authMiddleware } = require('../utils/auth');
const {
  searchNpm, npmPackageInfo,
  searchSpotify, spotifyTrackInfo,
  pinterestSearch, pinterestDownload,
  youtubeSearch, ytmp3, youtubeInfo,
  telegramDownload,
  fetchPageSource, scrapeWebpage, googleSearch,
  qwenChat, qwenVision, qwenTextToImage,
  alightMotionSearch, alightMotionEffects,
  createTempEmail, checkTempMail,
} = require('../features/scrapers');

const router = express.Router();

// --- NPM ---
router.get('/npm/search', authMiddleware, async (req, res) => {
  const { q, limit } = req.query;
  if (!q) return res.status(400).json({ error: 'q parameter required' });
  try {
    const results = await searchNpm(q, parseInt(limit) || 10);
    res.json({ results, query: q });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/npm/info', authMiddleware, async (req, res) => {
  const { name } = req.query;
  if (!name) return res.status(400).json({ error: 'name parameter required' });
  try {
    const info = await npmPackageInfo(name);
    res.json(info || { error: 'Package not found' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Spotify ---
router.get('/spotify/search', authMiddleware, async (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'q parameter required' });
  try {
    const results = await searchSpotify(q);
    res.json({ results, query: q });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/spotify/track', authMiddleware, async (req, res) => {
  const { uri } = req.query;
  if (!uri) return res.status(400).json({ error: 'uri parameter required' });
  try {
    const info = await spotifyTrackInfo(uri);
    res.json(info || { error: 'Track not found' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Pinterest ---
router.get('/pinterest/search', authMiddleware, async (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'q parameter required' });
  try {
    const results = await pinterestSearch(q);
    res.json({ results, query: q });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/pinterest/download', authMiddleware, async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'url parameter required' });
  try {
    const images = await pinterestDownload(url);
    res.json({ images, pinUrl: url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- YouTube ---
router.get('/youtube/search', authMiddleware, async (req, res) => {
  const { q, limit } = req.query;
  if (!q) return res.status(400).json({ error: 'q parameter required' });
  try {
    const results = await youtubeSearch(q, parseInt(limit) || 10);
    res.json({ results, query: q });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/youtube/mp3', authMiddleware, async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'url required' });
  try {
    const result = await ytmp3(url);
    res.json(result || { error: 'Failed to fetch audio' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/youtube/info', authMiddleware, async (req, res) => {
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'id parameter required' });
  try {
    const info = await youtubeInfo(id);
    res.json(info || { error: 'Video not found' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Telegram ---
router.get('/telegram/download', authMiddleware, async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'url parameter required' });
  try {
    const media = await telegramDownload(url);
    res.json({ media, url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Web Scrapers ---
router.get('/web/fetch', authMiddleware, async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'url parameter required' });
  try {
    const result = await fetchPageSource(url);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/web/scrape', authMiddleware, async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'url parameter required' });
  try {
    const result = await scrapeWebpage(url);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/web/search', authMiddleware, async (req, res) => {
  const { q, limit } = req.query;
  if (!q) return res.status(400).json({ error: 'q parameter required' });
  try {
    const results = await googleSearch(q, parseInt(limit) || 10);
    res.json({ results, query: q });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- AI ---
router.post('/ai/qwen/chat', authMiddleware, async (req, res) => {
  const { prompt, model, maxTokens } = req.body;
  if (!prompt) return res.status(400).json({ error: 'prompt required' });
  try {
    const result = await qwenChat(prompt, { model, maxTokens });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/ai/qwen/vision', authMiddleware, async (req, res) => {
  const { image, prompt } = req.body;
  if (!image || !prompt) return res.status(400).json({ error: 'image (base64) and prompt required' });
  try {
    const result = await qwenVision(image, prompt);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/ai/qwen/text-to-image', authMiddleware, async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: 'prompt required' });
  try {
    const result = await qwenTextToImage(prompt);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- AlightMotion ---
router.get('/alightmotion/search', authMiddleware, async (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'q parameter required' });
  try {
    const results = await alightMotionSearch(q);
    res.json({ results, query: q });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/alightmotion/effects', authMiddleware, async (req, res) => {
  try {
    const effects = await alightMotionEffects();
    res.json({ effects });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Temp Mail ---
router.post('/tempmail/create', authMiddleware, async (req, res) => {
  try {
    const account = await createTempEmail();
    res.json(account);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/tempmail/inbox', authMiddleware, async (req, res) => {
  const { email, token } = req.query;
  if (!email || !token) return res.status(400).json({ error: 'email and token required' });
  try {
    const messages = await checkTempMail(email, token);
    res.json({ email, messages });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Health ---
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    features: {
      npm: true,
      spotify: true,
      pinterest: true,
      youtube: true,
      telegram: true,
      web: true,
      ai: true,
      alightmotion: true,
      tempmail: true,
    },
  });
});

module.exports = router;

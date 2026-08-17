const express = require('express');
const cors = require('cors');
const { setupServer } = require('./src/server');
const logger = require('./src/utils/logger');
const scraperRoutes = require('./src/api/scrapers');

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

// Scraper routes (no auth required for basic search, some need api_key)
app.use('/api/scrape', scraperRoutes);

setupServer(app);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  logger.info(`🚀 BROKEN WA API listening on :${PORT}`);
  logger.info(`📡 Dashboard: http://localhost:${PORT}`);
  logger.info(`📖 API: http://localhost:${PORT}/api/docs`);
});

const express = require('express');
const cors = require('cors');
const { setupServer } = require('./src/server');
const logger = require('./src/utils/logger');

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

setupServer(app);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  logger.info(`🚀 BROKEN WA API listening on :${PORT}`);
  logger.info(`📡 Dashboard: http://localhost:${PORT}`);
  logger.info(`📖 API: http://localhost:${PORT}/api/docs`);
});

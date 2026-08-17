require('dotenv').config();
const app = require('./src/app');
const logger = require('./src/utils/logger');

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => logger.info(`🤖 BROKEN WA API running on port ${PORT}`));

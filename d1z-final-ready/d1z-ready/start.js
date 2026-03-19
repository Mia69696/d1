require('dotenv').config();
const logger = require('./src/utils/logger');

logger.info('🚀 Starting d1z Bot + Dashboard...');

// Start dashboard first
require('./dashboard/server');

// Start bot after short delay
setTimeout(() => {
  require('./src/index');
}, 2000);

const { createWebpackConfig } = require('./tooling/webpack.cjs');

// Release inputs remain the checked public registry SDK and its native assets.
module.exports = createWebpackConfig(__dirname);

const fs = require('fs');
const path = require('path');
require('dotenv').config();
const { loadVault, getLawText, _index } = require('./lib/vault-loader'); // Need to export _index or use a workaround

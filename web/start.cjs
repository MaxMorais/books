process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({ module: 'commonjs' });
process.env.TS_NODE_TRANSPILE_ONLY = 'true';
require('ts-node/register');
require('tsconfig-paths/register');
require('./server.ts');

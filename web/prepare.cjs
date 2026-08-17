const { spawnSync } = require('child_process');
const path = require('path');

const result = spawnSync(
  process.execPath,
  [require.resolve('prebuild-install/bin.js')],
  {
    cwd: path.join(__dirname, '..', 'node_modules', 'better-sqlite3'),
    stdio: 'inherit',
  }
);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

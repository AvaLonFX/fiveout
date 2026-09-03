const path = require('node:path');
const { spawnSync } = require('node:child_process');
module.exports = function runStep(step) {
  const root = path.resolve(__dirname, '../..');
  const python = path.join(root, '.venv-pipeline', 'Scripts', 'python.exe');
  const result = spawnSync(python, [path.join(__dirname, 'run_daily_pipeline.py'), '--only', step], {
    cwd: root, stdio: 'inherit', windowsHide: true,
    env: { ...process.env, PYTHONUTF8: '1' },
  });
  if (result.error) console.error('Could not start pipeline. Install .venv-pipeline first.');
  process.exitCode = result.status ?? 1;
};

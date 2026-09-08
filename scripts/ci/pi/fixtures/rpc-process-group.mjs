import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

if (process.argv[2] === 'auxiliary') {
  setInterval(() => {}, 1000);
  process.send('ready');
} else {
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), 'auxiliary'], {
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
  });
  child.once('message', () => {
    process.stdout.write(`${JSON.stringify({ type: 'auxiliary_ready', pid: child.pid })}\n`);
  });
  child.once('exit', () => process.exit(0));
  process.on('SIGTERM', () => {});
}

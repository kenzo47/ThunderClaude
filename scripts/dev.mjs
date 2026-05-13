import { spawn } from 'node:child_process';

const thunderbirdBinary = process.env.THUNDERBIRD_BINARY ?? 'thunderbird';

const child = spawn('web-ext', ['run', '--firefox', thunderbirdBinary], {
  shell: process.platform === 'win32',
  stdio: 'inherit',
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});

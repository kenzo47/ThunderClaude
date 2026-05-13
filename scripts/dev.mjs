import { spawn } from 'node:child_process';

const child = spawn('web-ext', ['run', '--target=thunderbird'], {
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

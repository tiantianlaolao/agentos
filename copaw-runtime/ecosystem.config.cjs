module.exports = {
  apps: [{
    name: 'copaw-runtime',
    script: './start.sh',
    cwd: '/home/skingway/copaw-runtime',
    interpreter: '/bin/bash',
    env: {
      NODE_ENV: 'production',
    },
    max_restarts: 10,
    restart_delay: 3000,
  }],
};

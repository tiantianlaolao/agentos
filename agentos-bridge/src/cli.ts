#!/usr/bin/env node

/**
 * AgentOS Bridge CLI
 *
 * Usage:
 *   npx agentos-bridge --token <auth-token> [--gateway ws://localhost:18789] [--server ws://43.154.188.177:3100/ws]
 *
 * This connects your local OpenClaw Gateway to the AgentOS server,
 * allowing you to control it from the AgentOS mobile app.
 */

import { OpenClawBridge } from './bridge.js';

const DEFAULT_SERVER = 'ws://43.154.188.177:3100/ws';
const DEFAULT_GATEWAY = 'ws://localhost:18789';

function parseArgs(): { token: string; server: string; gateway: string; gatewayToken: string } {
  const args = process.argv.slice(2);
  let token = '';
  let server = DEFAULT_SERVER;
  let gateway = DEFAULT_GATEWAY;
  let gatewayToken = '';

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if ((arg === '--token' || arg === '-t') && i + 1 < args.length) {
      token = args[++i];
    } else if ((arg === '--server' || arg === '-s') && i + 1 < args.length) {
      server = args[++i];
    } else if ((arg === '--gateway' || arg === '-g') && i + 1 < args.length) {
      gateway = args[++i];
    } else if (arg === '--gateway-token' && i + 1 < args.length) {
      gatewayToken = args[++i];
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else if (arg === '--version' || arg === '-v') {
      console.log('agentos-bridge v0.1.0');
      process.exit(0);
    }
  }

  if (!token) {
    console.error('Error: --token is required');
    console.error('');
    printHelp();
    process.exit(1);
  }

  return { token, server, gateway, gatewayToken };
}

function printHelp(): void {
  console.log(`
AgentOS Bridge - Connect your local OpenClaw to your phone

Usage:
  agentos-bridge --token <auth-token> [options]

Options:
  -t, --token <token>        AgentOS auth token (required)
  -s, --server <url>         AgentOS server URL (default: ${DEFAULT_SERVER})
  -g, --gateway <url>        Local OpenClaw Gateway URL (default: ${DEFAULT_GATEWAY})
      --gateway-token <tok>  OpenClaw Gateway access token
  -h, --help                 Show this help message
  -v, --version              Show version

How to get your auth token:
  1. Log in to AgentOS mobile app or desktop app
  2. Go to Settings and copy your auth token

Examples:
  agentos-bridge --token eyJhbGciOiJIUzI1NiIs...
  agentos-bridge -t eyJ... -g ws://192.168.1.100:18789
`);
}

async function main(): Promise<void> {
  const { token, server, gateway, gatewayToken } = parseArgs();

  console.log('');
  console.log('  AgentOS Bridge v0.1.0');
  console.log('  =====================');
  console.log(`  Server:  ${server}`);
  console.log(`  Gateway: ${gateway}`);
  console.log('');

  const bridge = new OpenClawBridge({
    serverUrl: server,
    authToken: token,
    gatewayUrl: gateway,
    gatewayToken,
  });

  bridge.onStatusChange = (status) => {
    const serverIcon = status.serverConnected ? '[OK]' : '[--]';
    const gatewayIcon = status.gatewayConnected ? '[OK]' : '[--]';
    console.log(`  ${serverIcon} Server  ${gatewayIcon} Gateway  ${status.bridgeId ? 'Bridge: ' + status.bridgeId.slice(0, 8) : ''}`);
  };

  // Graceful shutdown
  const shutdown = () => {
    console.log('\n  Shutting down bridge...');
    bridge.stop();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  try {
    await bridge.start();
    console.log('');
    console.log('  Bridge is running! Your phone can now control OpenClaw.');
    console.log('  Press Ctrl+C to stop.');
    console.log('');
  } catch (err) {
    console.error(`  Failed to start bridge: ${err instanceof Error ? err.message : err}`);
    console.error('  The bridge will keep trying to reconnect...');
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

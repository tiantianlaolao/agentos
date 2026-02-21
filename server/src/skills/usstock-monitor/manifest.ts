/**
 * US Stock Trading Monitor Skill Manifest
 * Private skill — only visible to owner (13501161326)
 */
import type { SkillManifest } from '../../adapters/base.js';

export const manifest: SkillManifest = {
  name: 'usstock-monitor',
  version: '1.1.0',
  description: 'Monitor the US stock quantitative trading system running on a remote server. Check program status, view trading logs, current positions, market regime (bull/bear), and alerts.',
  author: 'AgentOS',
  agents: '*',
  environments: ['cloud'],
  permissions: ['network'],
  functions: [
    {
      name: 'check_trading_status',
      description: 'Get a full status overview of the US stock trading system: whether all 3 programs are running, current positions, recent trade events, and any alerts. This is the main monitoring function - use it when the user asks about their stocks or trading system.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
    {
      name: 'get_trading_log',
      description: 'Get recent log output from the trading guard program (usstock_guard.py). Shows buy/sell executions, market regime changes, position checks, and errors.',
      parameters: {
        type: 'object',
        properties: {
          source: {
            type: 'string',
            description: 'Which log to read: "guard" for trading guard (default), "scanner" for stock scanner',
            enum: ['guard', 'scanner'],
          },
        },
        required: [],
      },
    },
    {
      name: 'get_positions',
      description: 'Get current position details: held stocks, P&L percentages, locked take-profit/stop-loss parameters, and market regime.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
    {
      name: 'get_stock_picks',
      description: 'Get today\'s stock screening results (gold/silver medal signals) from the scanner.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  ],
  audit: 'platform',
  auditSource: 'AgentOS',
  visibility: 'private',
  owner: '13501161326',
};

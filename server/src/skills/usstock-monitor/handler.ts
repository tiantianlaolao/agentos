/**
 * US Stock Trading Monitor Skill Handler
 * Queries the monitoring HTTP server running on the trading server (129.211.168.244:18888)
 */

import type { SkillHandler } from '../registry.js';

const MONITOR_URL = 'http://129.211.168.244:18888';
const AUTH_TOKEN = 'ustrade_monitor_2026';

async function fetchMonitor(endpoint: string): Promise<string> {
  const url = MONITOR_URL + endpoint;
  const response = await fetch(url, {
    headers: { 'X-Auth-Token': AUTH_TOKEN },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    throw new Error('Monitor API error: ' + response.status + ' ' + response.statusText);
  }
  return await response.text();
}

const checkTradingStatus: SkillHandler = async (_args) => {
  const data = await fetchMonitor('/status');
  const status = JSON.parse(data);

  const procs = status.processes || {};
  const procStatus = Object.entries(procs)
    .map(function(entry) {
      return entry[0] + ': ' + (entry[1] ? 'Running' : 'DOWN!');
    })
    .join(', ');

  const alertList: string[] = status.alerts || [];
  const alerts = alertList.length > 0
    ? 'ALERTS: ' + alertList.join('; ')
    : 'No alerts';

  const state = status.state || {};
  const regime = state.regime || '?';
  const cash = state.cash != null ? '$' + state.cash : '?';

  let posInfo: string;
  if (state.source === 'log_parsed' && state.positions) {
    const posKeys = Object.keys(state.positions);
    if (posKeys.length > 0) {
      posInfo = posKeys.map(function(sym: string) {
        const p = state.positions[sym] || {};
        const pnl = p.pnl_pct != null ? (p.pnl_pct > 0 ? '+' : '') + p.pnl_pct + '%' : '?';
        const tp = p.tp || '?';
        const sl = p.sl || '?';
        return sym + ': ' + pnl + ' (TP' + tp + '/SL' + sl + ')';
      }).join('\n');
    } else {
      posInfo = 'No positions';
    }
  } else if (state.buy_times) {
    const buyTimes: Record<string, string> = state.buy_times || {};
    const buyParams: Record<string, { tp?: number; sl?: number; regime?: string }> = state.buy_params || {};
    const posKeys = Object.keys(buyTimes);
    if (posKeys.length > 0) {
      posInfo = posKeys.map(function(sym) {
        const params = buyParams[sym] || {};
        const tp = params.tp ? 'TP' + ((params.tp - 1) * 100).toFixed(0) + '%' : '?';
        const sl = params.sl ? 'SL' + ((1 - params.sl) * 100).toFixed(0) + '%' : '?';
        const r = params.regime || '?';
        const buyDate = (buyTimes[sym] || '').split('T')[0] || '?';
        return sym + ': bought ' + buyDate + ', ' + tp + '/' + sl + ', regime=' + r;
      }).join('\n');
    } else {
      posInfo = 'No positions';
    }
  } else {
    posInfo = 'No positions';
  }

  const events: string[] = status.recent_events || [];
  const eventsStr = events.join('\n') || 'No recent events';

  return JSON.stringify({
    overall: status.all_ok ? 'ALL OK' : 'ISSUES DETECTED',
    programs: procStatus,
    market_regime: regime,
    cash: cash,
    alerts: alerts,
    positions: posInfo,
    recent_events: eventsStr,
    server_time: status.time,
  });
};

const getTradingLog: SkillHandler = async (args) => {
  const source = (args.source as string) || 'guard';
  const endpoint = source === 'scanner' ? '/log/scanner' : '/log/guard';
  return await fetchMonitor(endpoint);
};

const getPositions: SkillHandler = async (_args) => {
  return await fetchMonitor('/state');
};

const getStockPicks: SkillHandler = async (_args) => {
  return await fetchMonitor('/choice');
};

export const handlers: Record<string, SkillHandler> = {
  check_trading_status: checkTradingStatus,
  get_trading_log: getTradingLog,
  get_positions: getPositions,
  get_stock_picks: getStockPicks,
};

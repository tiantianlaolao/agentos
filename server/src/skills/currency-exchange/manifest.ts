/**
 * Currency Exchange Skill Manifest
 */
import type { SkillManifest } from '../../adapters/base.js';

export const manifest: SkillManifest = {
  name: 'currency-exchange',
  version: '1.0.0',
  description: 'Get real-time currency exchange rates and convert amounts between currencies. Supports all major world currencies.',
  author: 'AgentOS',
  agents: '*',
  environments: ['cloud'],
  permissions: ['network'],
  functions: [
    {
      name: 'get_exchange_rate',
      description: 'Get the current exchange rate between two currencies and optionally convert an amount. Uses ISO 4217 currency codes (e.g. USD, EUR, CNY, JPY, GBP).',
      parameters: {
        type: 'object',
        properties: {
          from: {
            type: 'string',
            description: 'Source currency code, e.g. "USD", "EUR", "CNY"',
          },
          to: {
            type: 'string',
            description: 'Target currency code, e.g. "CNY", "JPY", "GBP"',
          },
          amount: {
            type: 'number',
            description: 'Amount to convert (optional, defaults to 1)',
          },
        },
        required: ['from', 'to'],
      },
    },
  ],
  audit: 'platform',
  auditSource: 'AgentOS',
  category: 'finance',
  emoji: '💱',
  isDefault: false,
  locales: {
    zh: {
      displayName: '汇率换算',
      description: '获取实时货币汇率并在不同货币间换算，支持全球主要货币。',
      functions: {
        get_exchange_rate: '获取两种货币之间的实时汇率，可选择换算金额。使用 ISO 4217 货币代码（如 USD, EUR, CNY, JPY, GBP）。',
      },
    },
  },
};

import { useTranslation } from '../i18n/index.ts';

interface Props {
  connected: boolean;
  connecting: boolean;
  sessionId: string | null;
  mode: string;
  error: string | null;
  bridgeStatus?: {
    serverConnected: boolean;
    gatewayConnected: boolean;
  } | null;
}

export function StatusBar({ connected, connecting, sessionId, mode, error, bridgeStatus }: Props) {
  const t = useTranslation();

  return (
    <div className={`status-bar ${error ? 'status-bar-error' : ''}`}>
      <div className="status-left">
        <span className={`status-indicator ${connected ? 'connected' : connecting ? 'connecting' : 'disconnected'}`}>
          {connected ? t('status.connected') : connecting ? t('status.connecting') : t('status.disconnected')}
          {connecting && <span className="connecting-dots" />}
        </span>
        {sessionId && (
          <span className="session-info">
            {t('status.session')}: {sessionId.slice(0, 8)}...
          </span>
        )}
        <span className="mode-info">{t('status.mode')}: {mode}</span>
        {bridgeStatus && (
          <span className={`status-bridge ${bridgeStatus.serverConnected && bridgeStatus.gatewayConnected ? 'bridge-active' : 'bridge-partial'}`}>
            Bridge: {bridgeStatus.serverConnected && bridgeStatus.gatewayConnected
              ? t('bridge.running')
              : bridgeStatus.serverConnected
              ? t('bridge.gatewayDisconnected')
              : t('bridge.serverDisconnected')}
          </span>
        )}
      </div>
      <div className="status-right">
        {error && <span className="status-error">{error}</span>}
      </div>
    </div>
  );
}

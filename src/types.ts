export interface BrokerConfig {
  server: string;
  port: number;
  user: string;
  pass: string;
  client_id: string;
  vhost: string;
}

export interface SystemState {
  temp: number | null;
  hum: number | null;
  relayStates: boolean[];
  variasiMode: number;
  activeBrokerIndexESP32: number;
  relayLabels: string[];
  brokers: BrokerConfig[];
  brokerConnectionStates: {
    index: number;
    connected: boolean;
    connecting: boolean;
  }[];
  logs: LogEntry[];
}

export interface LogEntry {
  id: string;
  timestamp: string;
  type: 'info' | 'success' | 'warning' | 'error' | 'mqtt_rx' | 'mqtt_tx';
  broker: string;
  topic?: string;
  payload?: string;
  message: string;
}

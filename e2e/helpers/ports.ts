export const PORTS = {
  nginxAddon: 3006,
  modbus2mqttAddon: 3004,
  modbusTcp: 3002,
  modbus2mqttSpec: 3005,
  mosquittoAuth: 3001,
  mosquittoNoAuth: 3003,
  modbus2mqttNoAuth: 3007,
} as const;

export const MQTT_AUTH_CONFIG = {
  mqttserverurl: 'mqtt://127.0.0.1:3001',
  username: 'homeassistant',
  password: 'homeassistant',
};

export const MQTT_NO_AUTH_CONFIG = {
  mqttserverurl: 'mqtt://127.0.0.1:3003',
};

export const LOCALHOST = '127.0.0.1';

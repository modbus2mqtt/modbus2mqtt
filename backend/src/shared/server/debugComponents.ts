// Catalog of backend debug components (Debug('...') namespaces) shown in the
// webui "Configure Debug" screen. Each entry is a namespace that can be enabled
// in the debugComponents config (a comma-separated list understood by Debug.enable).
export interface IdebugComponentInfo {
  name: string
  description: string
}

export const debugComponentCatalog: IdebugComponentInfo[] = [
  { name: 'modbusapi', description: 'Modbus API: open/close/reconnect of the Modbus client, read/write calls' },
  {
    name: 'modbusapi:mclient',
    description: 'Modbus serial client: every raw read/write request and its response (address, length, data)',
  },
  { name: 'modbusrtuworker', description: 'Modbus RTU worker: per-request processing, success/failure of each queued read' },
  {
    name: 'modbusrtuprocessor',
    description: 'Modbus RTU processor: request preparation, merging of register spans, result counting',
  },
  { name: 'modbusrtuprocessor:result', description: 'Modbus RTU processor: detailed per-address result values' },
  { name: 'mqttpoller', description: 'MQTT poll loop: when slaves are polled and their state is published' },
  { name: 'mqttconnector', description: 'MQTT connector: connect/reconnect to the broker' },
  { name: 'mqttclient', description: 'Raw MQTT client: transport-level messages (subscribe, publish, keepalive, reconnect)' },
  { name: 'mqttdiscover', description: 'MQTT discovery: Home Assistant discovery topic generation and publishing' },
  { name: 'mqttsubscription', description: 'MQTT subscriptions: slave command/trigger subscriptions and publish state' },
  { name: 'modbus', description: 'Modbus read path: conditional register handling, active entity selection, value population' },
  { name: 'modbusTCP', description: 'Modbus TCP bridge: TCP server hand-off between the REST API and the RTU worker' },
  { name: 'tcprtubridge', description: 'TCP <-> RTU bridge: requests forwarded from the TCP bridge port' },
  { name: 'modbusreopen', description: 'Modbus reopen: automatic reopen/reconnect of a dropped Modbus client' },
  { name: 'bus', description: 'Bus lifecycle: bus/slave creation, polling start, bus registry changes' },
  { name: 'configbus', description: 'Config bus: slave add/update/delete events, reference resolution, persistence writes' },
  { name: 'config.addon', description: 'Add-on configuration: reading and applying the add-on config' },
  { name: 'configPersistence', description: 'Config persistence: reading/writing the modbus2mqtt.yaml and secrets' },
  { name: 'busPersistence', description: 'Bus persistence: reading/writing bus and slave yaml files' },
  { name: 'httpserver', description: 'HTTP server: REST request handling and responses' },
  { name: 'httppush', description: 'HTTP push: pushing state to an external HTTP endpoint instead of MQTT' },
  { name: 'm2mgithub', description: 'GitHub: clone/pull of the public specification repo, fork sync' },
  { name: 'm2mspecification', description: 'Specification engine: spec loading/migration/conversion and value mapping' },
  { name: 'modbus2mqtt', description: 'Core startup/shutdown: initialization sequence, command-line options' },
  { name: 'logger', description: 'Logger: low-level logging infrastructure' },
  { name: 'selectConverter', description: 'Select converter: reading/writing select-type entities' },
  { name: 'actions', description: 'Shared actions: internal task helpers' },
]

/** Names the webui treats as presets that are commonly the right starting point. */
export const debugComponentPresetDefault: string[] = ['modbusapi:mclient', 'modbusrtuworker', 'mqttpoller']

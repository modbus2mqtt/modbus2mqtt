# Getting Started with modbus2mqtt

This guide will help you quickly set up and use modbus2mqtt.

## Prerequisites

Before you begin, make sure you have:

- A Modbus device (RTU or TCP)
- MQTT broker (e.g., Mosquitto)
- For Modbus RTU: USB-to-RS485 adapter

## Quick Start

### 1. Access the Web Interface

Open your browser and navigate to:

```
http://localhost:3000
```

(Replace `localhost` with your server's IP if running remotely)

### 2. Configure MQTT Connection

1. Go to **Settings** → **MQTT Configuration**
2. Enter your MQTT broker details:
   - **URL**: `mqtt://your-broker-ip:1883`
   - **Username**: (if authentication is enabled)
   - **Password**: (if authentication is enabled)
3. Click **Test Connection**
4. Click **Save**

### 3. Add a Modbus Bus

A "bus" represents a physical connection to your Modbus devices.

#### For Modbus RTU (Serial/USB):

1. Go to **Busses** → **Add Bus**
2. Select **RTU**
3. Configure:
   - **Serial Port**: `/dev/ttyUSB0` (Linux) or `COM3` (Windows)
   - **Baud Rate**: `9600` (check your device manual)
   - **Data Bits**: `8`
   - **Parity**: `none`
   - **Stop Bits**: `1`
   - **Timeout**: `1000` ms
4. Click **Save**

#### For Modbus TCP:

1. Go to **Busses** → **Add Bus**
2. Select **TCP**
3. Configure:
   - **Host**: IP address of your Modbus TCP device
   - **Port**: `502` (default Modbus TCP port)
   - **Timeout**: `1000` ms
4. Click **Save**

### 4. Add a Device (Slave)

1. Select your bus from the list
2. Click **Scan for Devices** (if supported)
   - Or manually add: Click **Add Device**
3. Enter:
   - **Slave ID**: The Modbus address of your device (e.g., `1`)
   - **Poll Interval**: How often to read data (e.g., `5000` ms)
4. Click **Save**

### 5. Assign a Specification

A specification defines what data to read from your device.

#### Option A: Use Existing Specification

1. Click on your device
2. Click **Select Specification**
3. Browse available specifications
4. Search for your device model
5. Select and click **Apply**

#### Option B: Create New Specification

1. Click on your device
2. Click **Create New Specification**
3. Fill in device information:
   - **Name**: Device model name
   - **Manufacturer**: Device manufacturer
4. Add entities (data points):
   - Click **Add Entity**
   - Configure:
     - **Name**: Descriptive name (e.g., "Temperature")
     - **Modbus Address**: Register address
     - **Register Type**: Holding Register, Input Register, etc.
     - **Data Type**: Int16, UInt16, Float32, etc.
     - **Converter**: How to convert the value
     - **Unit**: Unit of measurement
5. Click **Save**

### 6. Verify Data

1. Go to **Devices** → Select your device
2. View the **Entities** tab
3. Check that values are being read correctly
4. Values should update according to your poll interval

## Using with Home Assistant

If you're using Home Assistant, modbus2mqtt automatically creates MQTT discovery messages.

### Enable MQTT Integration in Home Assistant

1. Go to **Settings** → **Devices & Services**
2. Add **MQTT** integration (if not already added)
3. Configure with the same broker details

### Discover Devices

1. Your modbus2mqtt devices should appear automatically
2. Go to **Settings** → **Devices & Services** → **MQTT**
3. You should see your devices listed
4. Click on a device to view all entities

### Add to Dashboard

1. Go to your Home Assistant dashboard
2. Click **Edit Dashboard**
3. Click **Add Card**
4. Select entity type (e.g., **Sensor**)
5. Select entities from your Modbus device
6. Customize the card
7. Click **Save**

## Common Tasks

### Reading Data

Data is automatically polled at the interval you configured. You can:

- View current values in the Web UI
- Subscribe to MQTT topics: `modbus2mqtt/<device>/<entity>`
- Use Home Assistant entities

### Writing Data

For writable entities:

1. In the Web UI, click on the entity
2. Enter the new value
3. Click **Write**

Or publish to MQTT:

```
Topic: modbus2mqtt/<device>/<entity>/set
Payload: <value>
```

### Monitoring

- **Dashboard**: View all devices at a glance
- **Logs**: Check for connection issues or errors
- **MQTT**: Use an MQTT client (e.g., MQTT Explorer) to monitor messages

## Troubleshooting

### No Data from Device

1. Check bus connection:
   - For RTU: Verify serial port and wiring
   - For TCP: Ping the device IP
2. Verify slave ID is correct
3. Check Modbus address in specification
4. Increase timeout if needed
5. Check device manual for correct settings

### MQTT Connection Failed

1. Verify broker is running
2. Check broker IP and port
3. Test with MQTT client (e.g., `mosquitto_pub`)
4. Verify authentication credentials
5. Check firewall settings

### Device Not Discovered in Home Assistant

1. Verify MQTT integration is configured
2. Check MQTT broker logs
3. Restart Home Assistant
4. Check discovery topic: `homeassistant/sensor/modbus2mqtt/+/config`

### Serial Port Permission Denied (Linux)

Add your user to the dialout group:

```bash
sudo usermod -a -G dialout $USER
```

Log out and back in for changes to take effect.

## Next Steps

- [Advanced Configuration](./configuration.md)
- [Creating Custom Specifications](./creating-specifications.md)
- [Contributing Specifications](./contributing.md)
- [API Documentation](./api.md)

## Getting Help

- Check the [FAQ](./faq.md)
- Search [GitHub Issues](https://github.com/modbus2mqtt/modbus2mqtt/issues)
- Ask in [GitHub Discussions](https://github.com/modbus2mqtt/modbus2mqtt/discussions)

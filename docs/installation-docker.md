# Installation with Docker

## Prerequisites

- Docker installed on your system
- Docker Compose (optional, but recommended)

## Quick Start

### Using Docker Run

```bash
docker run -d \
  --name modbus2mqtt \
  -p 3000:3000 \
  -v /path/to/config:/config \
  --device=/dev/ttyUSB0 \
  modbus2mqtt/modbus2mqtt:latest
```

### Using Docker Compose

Create a `docker-compose.yml` file:

```yaml
version: '3.8'

services:
  modbus2mqtt:
    image: modbus2mqtt/modbus2mqtt:latest
    container_name: modbus2mqtt
    ports:
      - '3000:3000'
    volumes:
      - ./config:/config
    devices:
      - /dev/ttyUSB0:/dev/ttyUSB0
    environment:
      - NODE_ENV=production
    restart: unless-stopped

  mosquitto:
    image: eclipse-mosquitto:latest
    container_name: mosquitto
    ports:
      - '1883:1883'
      - '9001:9001'
    volumes:
      - ./mosquitto/config:/mosquitto/config
      - ./mosquitto/data:/mosquitto/data
      - ./mosquitto/log:/mosquitto/log
    restart: unless-stopped
```

Start the services:

```bash
docker-compose up -d
```

## Configuration

### Volume Mounts

- `/config` - Configuration files (specifications, bus configuration)
- `/data` - Optional: SSH configuration and runtime data

**Required**: `/config` for persistent configuration
**Optional**: `/data` Contains public specifications.
**Optional**: `/ssl` location for TLS certificates (`fullchain.pem`, `privkey.pem`) and `secrets.txt`. The `secrets.txt` file holds a local random key used e.g. as fallback for `OIDC_SESSION_SECRET`. Losing it invalidates existing OIDC browser sessions — users simply have to log in again.

### Device Access

For Modbus RTU (USB devices), you need to mount the serial device:

```bash
--device=/dev/ttyUSB0
```

Find your device with:

```bash
ls -l /dev/ttyUSB*
# or
ls -l /dev/ttyACM*
```

### Environment Variables

- `NODE_ENV` - Set to `production` for production use
- `MQTT_URL` - MQTT broker URL (default: `mqtt://localhost:1883`)
- `HTTP_PORT` - HTTP server port (default: `3000`)
- `MODBUS2MQTT_HTTPS_PORT` - HTTPS server port (default: `3443`, only active if TLS certs are found in `/ssl`)
- `OIDC_ENABLED`, `OIDC_ISSUER_URL`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_CALLBACK_URL`, `OIDC_SESSION_SECRET` - see [authentication](authentication.md) for the full OIDC setup

## Accessing the UI

Open your browser and navigate to:

```
http://localhost:3000
```

## Updating

Pull the latest image:

```bash
docker pull modbus2mqtt/modbus2mqtt:latest
docker-compose down
docker-compose up -d
```

## Troubleshooting

### Check Logs

```bash
docker logs modbus2mqtt
```

### File Permissions and Volume Mounts

#### Container User Configuration

The modbus2mqtt container runs with a dedicated user for security:

- **User**: `modbus2mqtt` (UID: `1000`)
- **Primary Group**: `dialout` (GID: `20`)
- **Home**: `/var/lib/modbus2mqtt`

#### Setting Correct Permissions

**Option 1: Host directory ownership (recommended)**

```bash
# Create directories with correct ownership
mkdir -p ./config ./data
sudo chown -R 1000:20 ./config ./data
chmod -R 755 ./config ./data

# Run container (data mount optional, only needed for SSH)
docker run -d -p 3000:3000 -v ./config:/config modbus2mqtt/modbus2mqtt:latest

# With SSH support
docker run -d -p 3000:3000 -p 2222:22 -v ./config:/config -v ./data:/data modbus2mqtt/modbus2mqtt:latest
```

**Option 2: User mapping in Docker**

```bash
docker run -d \
  --user 1000:20 \
  -p 3000:3000 \
  -v ./config:/config \
  modbus2mqtt/modbus2mqtt:latest
```

**Option 3: Docker Compose with user mapping**

```yaml
services:
  modbus2mqtt:
    image: modbus2mqtt/modbus2mqtt:latest
    user: '1000:20'
    ports:
      - '3000:3000'
    volumes:
      - ./config:/config
```

#### Troubleshooting Permission Errors

If you see `EACCES: permission denied` errors:

1. **Check current ownership**:

   ```bash
   ls -la ./config ./data
   # Should show: drwxr-xr-x ... 1000 dialout
   ```

2. **Fix ownership**:

   ```bash
   sudo chown -R 1000:20 ./config ./data
   chmod -R 755 ./config ./data
   ```

3. **Verify container user**:
   ```bash
   docker exec -it modbus2mqtt id
   # Expected: uid=1000(modbus2mqtt) gid=20(dialout)
   ```

### Installing Patches or Older Versions

Patches are available as npm packages.
They can be installed in the addon.

This is the procedure:

- Make sure, the docker container is running:

- Logon to the container using the following command
  ```
  docker exec -it $(docker ps -a --filter label=org.opencontainers.image.source=https://github.com/modbus2mqtt/modbus2mqtt --format "{{.ID}}") sh
  ```
- execute the following command to install the latest version
  ```
  npm install modbus2mqtt
  ```
- execute the following command to install the a specfic version
  ```
  npm install modbus2mqtt@<version>
  ```
  E.g. npm install@0.17.1
- exit the docker image
  ```
  exit
  ```

### Serial Device Permission Issues

For Modbus RTU access, ensure the serial device has proper permissions:

```bash
# Check device permissions
ls -l /dev/ttyUSB0
# Should show: crw-rw---- ... root dialout

# Add your host user to dialout group (if needed)
sudo usermod -a -G dialout $USER

# Mount device in container
docker run --device=/dev/ttyUSB0:/dev/ttyUSB0 modbus2mqtt/modbus2mqtt:latest
```

## Advanced Configuration

### SSH Access (Optional)

The container supports SSH access for remote debugging and maintenance:

#### Enable SSH with options.json

Create `/data/options.json`:

```json
{
  "ssh_port": 22,
  "user_pubkey": "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5... your-public-key-here"
}
```

#### Docker setup with SSH

```bash
docker run -d \
  -p 3000:3000 \
  -p 2222:22 \
  -v ./config:/config \
  -v ./data:/data \
  modbus2mqtt/modbus2mqtt:latest

# Connect via SSH
ssh -p 2222 root@localhost
```

#### Docker Compose with SSH

```yaml
services:
  modbus2mqtt:
    image: modbus2mqtt/modbus2mqtt:latest
    ports:
      - '3000:3000'
      - '2222:22' # SSH access
    volumes:
      - ./config:/config
      - ./data:/data # Required for SSH configuration
```

### Multi-Architecture Support

The container supports multiple architectures:

- `linux/amd64` (Intel/AMD 64-bit)
- `linux/arm64` (ARM 64-bit, Raspberry Pi 4+)

Docker automatically pulls the correct architecture.

### Health Monitoring

Check container health:

```bash
# View health status
docker inspect --format='{{.State.Health.Status}}' modbus2mqtt

# Monitor logs
docker logs -f modbus2mqtt
```

## Next Steps

- [Configuration Guide](./configuration.md)
- [Adding Devices](./adding-devices.md)
- [Creating Specifications](./creating-specifications.md)

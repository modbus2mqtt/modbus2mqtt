# Installation on Proxmox

modbus2mqtt on Proxmox is deployed as an LXC container from the official OCI image via [oci-lxc-deployer](https://github.com/modbus2mqtt/oci-lxc-deployer) — the deployer handles container creation, networking, volumes, optional HTTPS, and optional Zitadel-backed single sign-on.

## Prerequisites

- Proxmox VE 7.0 or newer
- Two companion LXCs already deployed and reachable on the same Proxmox host (each is its own deployer application — follow their READMEs):
  1. **Zitadel** — identity provider that issues OIDC tokens. Only required if you plan to enable `addon-oidc`.
  2. **oci-lxc-deployer** — the deployer itself (web UI + CLI).

## Optional addons

modbus2mqtt supports two deployer addons. Pick them independently when you launch the installation:

| Addon | What it does |
|---|---|
| `addon-ssl` | Generates/mounts TLS certificates at `/etc/ssl/addon/` inside the container and wires `MODBUS2MQTT_HTTPS_PORT` + `MODBUS2MQTT_SSL_DIR` into the LXC environment. modbus2mqtt auto-detects the certs on start and listens on `3443`; HTTP on `3000` becomes a 301 redirect to HTTPS. |
| `addon-oidc` | Creates (or reuses) the Zitadel project `modbus2mqtt`, registers an OIDC web application with the correct redirect URI (HTTPS when `addon-ssl` is active, HTTP otherwise), ensures the `admin` project role exists, generates a session secret, and injects `OIDC_ENABLED`, `OIDC_ISSUER_URL`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_CALLBACK_URL`, `OIDC_SESSION_SECRET`, `OIDC_REQUIRED_ROLE=admin` into the container. |

## Deploy modbus2mqtt

1. Open the deployer web UI and pick **Modbus2MQTT** from the application catalog.
2. Fill in the parameters:
   - **Hostname** — LXC hostname (default `modbus2mqtt`)
   - **Volumes** — bind mounts, one `name=/path` per line. Default: `config=/config`, `data=/data`, `ssl=/ssl`
   - **HTTP Port** / **HTTPS Port** — defaults `3000` / `3443`
   - **Version** — OCI image tag, e.g. `latest` or a pinned version such as `v0.20.0`
   - **Rootfs Storage** / **Volume Storage** — your Proxmox storage IDs
3. Under **Addons**, tick the ones you want:
   - `addon-ssl` for native HTTPS
   - `addon-oidc` for Zitadel-backed single sign-on
4. Click **Install**.

The deployer creates the LXC, pulls `ghcr.io/modbus2mqtt/modbus2mqtt:<tag>`, sets up the volumes, runs the addon pre-start hooks in the right order, and starts the container.

## Pass through the Modbus RTU USB device (optional)

If you use Modbus RTU via a serial adapter, pass the USB device into the LXC. On the Proxmox host:

```bash
lsusb
ls -l /dev/ttyUSB*

# Edit the LXC config
nano /etc/pve/lxc/<CTID>.conf

# Append:
lxc.cgroup2.devices.allow: c 188:* rwm
lxc.mount.entry: /dev/ttyUSB0 dev/ttyUSB0 none bind,optional,create=file

# Reboot the container
pct reboot <CTID>
```

## First use

- With `addon-oidc` (+ optionally `addon-ssl`): open `https://<hostname>:3443/` (or HTTP if SSL is off) → redirect to Zitadel → log in with a user that has the `admin` project role. See [authentication.md](authentication.md).
- Without addons: open `http://<hostname>:3000/` directly; the UI is reachable without login (open-access mode, suitable for trusted LANs).

Follow the [getting-started guide](getting-started.md) for the initial MQTT / bus / slave configuration.

## Assigning the Zitadel `admin` role

The OIDC app requires project role `admin` on the `modbus2mqtt` project. Assign it in the Zitadel console under *Projects → modbus2mqtt → Authorizations*, or pre-provision users via the [Zitadel helper script](../scripts/create-zitadel-dev-oidc-app.sh) (`DEV_USERNAME=…`).

## Reconfiguring addons

Toggle addons on an existing container from the deployer UI (**Reconfigure**). The pre-start scripts are idempotent; OIDC secrets are rotated only when the addon is freshly enabled.

## Upgrades

Pick a new **Version** (OCI image tag) in the deployer and run an upgrade. Volumes are preserved.

## Networking

The deployer attaches the container to the network bridge you pick during install. For exposure beyond the Proxmox host, either:

- assign a static LAN IP in the parameters, or
- port-forward from the host:

  ```bash
  iptables -t nat -A PREROUTING -p tcp --dport 3443 -j DNAT --to <container-ip>:3443
  ```

## Backups

```bash
vzdump <CTID> --compress zstd --storage local
```

Enable autostart:

```bash
pct set <CTID> -onboot 1
```

## Troubleshooting

| Symptom | Where to look |
|---|---|
| Container won't start | `pct status <CTID>`, `/var/log/pve/tasks/` |
| USB device not visible | `ls -l /dev/ttyUSB0`, check the `lxc.mount.entry` line in `/etc/pve/lxc/<CTID>.conf` |
| OIDC callback fails | Compare the callback URL registered in Zitadel with `OIDC_CALLBACK_URL` inside the container (`pct exec <CTID> env \| grep OIDC`). See [authentication.md](authentication.md) for common `redirect_uri` pitfalls. |
| Login redirect loop | Browser is hitting HTTP while the session cookie was set on HTTPS (or vice versa). Stick to one scheme and make sure the Zitadel redirect URI matches. |
| `OIDC_*` not injected after reconfigure | Check the deployer task log — the pre-start script prints the issuer, callback URL, and any failures. |

## Next Steps

- [Getting Started](getting-started.md)
- [Authentication](authentication.md)
- [Development](development.md)

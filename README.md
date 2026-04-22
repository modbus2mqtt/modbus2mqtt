# modbus2mqtt

A bridge that exposes Modbus (RTU/TCP) devices over MQTT, with native support for Home Assistant auto-discovery. Map registers to MQTT topics once via reusable device *specifications* and let any smart-home system consume the data.

## Features

- Modbus RTU (serial) and Modbus TCP support
- MQTT publishing with Home Assistant MQTT auto-discovery
- Web UI to browse buses, slaves, and specifications
- Device *specifications* — reusable register-to-MQTT mappings that can be contributed back to the community
- Runs as a Home Assistant add-on, Docker container, Proxmox LXC, or standalone Node.js process
- OIDC authentication (OpenID Connect) for standalone deployments; supervisor-token auth inside Home Assistant
- Optional HTTPS with auto-detected certificates

## Quick start

Pick the deployment target that matches your environment:

| Target | Guide |
|---|---|
| Home Assistant add-on | [docs/installation-homeassistant.md](docs/installation-homeassistant.md) |
| Docker | [docs/installation-docker.md](docs/installation-docker.md) |
| Proxmox LXC | [docs/installation-proxmox.md](docs/installation-proxmox.md) |
| Standalone / development | [docs/getting-started.md](docs/getting-started.md) |

After the server is running, the first steps — configuring MQTT, adding a bus, assigning specifications to slaves — are covered in the [getting-started guide](docs/getting-started.md).

## Authentication

modbus2mqtt has three authentication modes, chosen automatically at startup:

1. **Home Assistant add-on** — supervisor token + IP whitelist, no user login.
2. **Standalone with OIDC** — configure `OIDC_*` environment variables; users log in through your identity provider (Keycloak, Zitadel, Auth0, …).
3. **Standalone without OIDC** — open access; intended for development or trusted networks.

Full setup instructions and troubleshooting are in [docs/authentication.md](docs/authentication.md).

## Documentation

- [Getting started](docs/getting-started.md)
- [Authentication](docs/authentication.md)
- [Development](docs/development.md)
- [Contributing](docs/contributing.md)
- [Release strategy](docs/release-strategy.md)

## Contributing

Specifications, bug fixes, and features are welcome. See [docs/contributing.md](docs/contributing.md) for the workflow, coding standards, and how to submit a specification pull request.

## License

See [LICENSE](LICENSE).

#!/bin/sh
# Runs as root before the app service starts. Ensures required directories
# exist with the correct ownership and migrates the legacy /data/local
# configuration into the active config directory.
#
# Storage layout: EVERYTHING lives under /data (the single persistent share):
#   /data/modbus2mqtt   - configuration (MQTT settings, busses, devices,
#                         local specifications, secrets.yaml)
#   /data/public        - git-cloned public specifications
# The app is started with -c /data -d /data -s /ssl, so config and specs are
# stored on the same mount that survives container recreation.

mkdir -p /data/modbus2mqtt
mkdir -p /data/public

# Migration from the old config location /data/local to /data/modbus2mqtt
# Only runs once: if the active config file is already present the migration
# is done (an empty busses/ directory is a valid state and must not trigger a
# re-copy on every boot).
if [ ! -f /data/modbus2mqtt/modbus2mqtt.yaml ] && [ -d /data/local ]; then
    echo "Migrating /data/local to /data/modbus2mqtt"
    cp -R /data/local/. /data/modbus2mqtt/
    chown -R modbus2mqtt:dialout /data/modbus2mqtt
fi
chown -R modbus2mqtt:dialout /data/modbus2mqtt
chown -R modbus2mqtt:dialout /data/public
touch /ssl/secrets.txt
chown -R modbus2mqtt:dialout /ssl/secrets.txt
export HOME=/root
git config --global --add safe.directory /data/public

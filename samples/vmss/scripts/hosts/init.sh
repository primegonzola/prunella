#!/bin/bash
PROJECT_NAME="<PROJECT_NAME>"
ROOT_DIR="<ROOT_DIR>"
HOST_TYPE="<HOST_TYPE>"
HOST_ID="<HOST_ID>"
STATUS_TOPIC_ID="<STATUS_TOPIC_ID>"

# wait until all installers are finished
while fuser /var/lib/dpkg/lock >/dev/null 2>&1; do sleep 30; done;
# update
DEBIAN_FRONTEND="noninteractive" apt-get -qy update
# wait until all installers are finished
while fuser /var/lib/dpkg/lock >/dev/null 2>&1; do sleep 30; done;
# install additional packages here
DEBIAN_FRONTEND="noninteractive" apt-get -qy install jq 

# create status service
HOST_STATUS_SERVICE_FILE=/etc/systemd/system/${PROJECT_NAME}-host-status.service
cat <<-EOF > ${HOST_STATUS_SERVICE_FILE}
[Unit]
Description=run host status 

[Service]
Type=simple
WatchdogSec=3min
RestartSec=1min
Restart=always
ExecStart=${ROOT_DIR}/hosts/status.sh <PROJECT_NAME> "<ROOT_DIR>" <HOST_TYPE> <HOST_ID> <STATUS_TOPIC_ID>

[Install]
WantedBy=multi-user.target
EOF

# enable services
systemctl daemon-reload
systemctl enable --now ${PROJECT_NAME}-host-status.service

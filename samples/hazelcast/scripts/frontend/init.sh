#!/bin/bash
PROJECT_NAME="<PROJECT_NAME>"
ROOT_DIR="<ROOT_DIR>"
HOST_TYPE="<HOST_TYPE>"
HOST_ID="<HOST_ID>"
STATUS_TOPIC_ID="<STATUS_TOPIC_ID>"
STORAGE_ACCOUNT_ID="<STORAGE_ACCOUNT_ID>"
CLUSTER_VMSS_ID="<CLUSTER_VMSS_ID>"
DISCOVERY_CONFIG_FILE=${ROOT_DIR}/frontend/discovery.config

# wait until all installers are finished
while fuser /var/lib/dpkg/lock >/dev/null 2>&1; do sleep 30; done;
# update
DEBIAN_FRONTEND="noninteractive" apt-get -qy update
# wait until all installers are finished
while fuser /var/lib/dpkg/lock >/dev/null 2>&1; do sleep 30; done;
# install additional packages here
DEBIAN_FRONTEND="noninteractive" apt-get -qy install jq
# Install Java JDK 8
DEBIAN_FRONTEND="noninteractive" sudo add-apt-repository -y ppa:webupd8team/java
DEBIAN_FRONTEND="noninteractive" sudo apt-get -qy update
DEBIAN_FRONTEND="noninteractive" echo debconf shared/accepted-oracle-license-v1-1 select true | sudo debconf-set-selections
DEBIAN_FRONTEND="noninteractive" echo debconf shared/accepted-oracle-license-v1-1 seen   true | sudo debconf-set-selections
DEBIAN_FRONTEND="noninteractive" sudo apt-get -qy install oracle-java8-installer

# enable where needed 
systemctl daemon-reload

# create file
touch ${DISCOVERY_CONFIG_FILE}

# create status service
FRONTEND_STATUS_SERVICE_FILE=/etc/systemd/system/${PROJECT_NAME}-frontend-status.service
cat <<-EOF > ${FRONTEND_STATUS_SERVICE_FILE}
[Unit]
Description=run frontend status 

[Service]
Type=simple
WatchdogSec=3min
RestartSec=1min
Restart=always
ExecStart=${ROOT_DIR}/frontend/status.sh "${PROJECT_NAME}" "${ROOT_DIR}" "${HOST_TYPE}" "${HOST_ID}" "${STATUS_TOPIC_ID}" "${STORAGE_ACCOUNT_ID}" "${DISCOVERY_CONFIG_FILE}" "${CLUSTER_VMSS_ID}" 

[Install]
WantedBy=multi-user.target
EOF

# enable services
systemctl daemon-reload
systemctl enable --now ${PROJECT_NAME}-frontend-status.service

# create service to host process
FRONTEND_HOST_SERVICE_FILE=/etc/systemd/system/${PROJECT_NAME}-frontend-host.service
cat <<-EOF > ${FRONTEND_HOST_SERVICE_FILE}
[Unit]
Description=run frontend status 

[Service]
User=ubuntu
ExecStart=${ROOT_DIR}/frontend/host.sh "${PROJECT_NAME}" "${ROOT_DIR}" "${HOST_TYPE}" "${HOST_ID}" "${STATUS_TOPIC_ID}" "${STORAGE_ACCOUNT_ID}" "${DISCOVERY_CONFIG_FILE}" "${CLUSTER_VMSS_ID}" 

SuccessExitStatus=143
TimeoutStopSec=10
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

# enable services
systemctl daemon-reload
systemctl enable --now ${PROJECT_NAME}-frontend-host.service

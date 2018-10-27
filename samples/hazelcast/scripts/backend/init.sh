#!/bin/bash
PROJECT_NAME="<PROJECT_NAME>"
ROOT_DIR="<ROOT_DIR>"
HOST_TYPE="<HOST_TYPE>"
HOST_ID="<HOST_ID>"
STATUS_TOPIC_ID="<STATUS_TOPIC_ID>"
STORAGE_ACCOUNT_ID="<STORAGE_ACCOUNT_ID>"
DISCOVERY_CONFIG_FILE=${ROOT_DIR}/backend/discovery.config

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
# Install Maven
DEBIAN_FRONTEND="noninteractive" sudo apt-get -qy install maven

# enable where needed 
systemctl daemon-reload

# create status service
BACKEND_STATUS_SERVICE_FILE=/etc/systemd/system/${PROJECT_NAME}-backend-status.service
cat <<-EOF > ${BACKEND_STATUS_SERVICE_FILE}
[Unit]
Description=run backend status 

[Service]
Type=simple
WatchdogSec=3min
RestartSec=1min
Restart=always
ExecStart=${ROOT_DIR}/backend/status.sh "<PROJECT_NAME>" "<ROOT_DIR>" "<HOST_TYPE>" "<HOST_ID>" "<STATUS_TOPIC_ID>" "<STORAGE_ACCOUNT_ID>" "${DISCOVERY_CONFIG_FILE}"

[Install]
WantedBy=multi-user.target
EOF

# enable services
systemctl daemon-reload
systemctl enable --now ${PROJECT_NAME}-backend-status.service

# setup hazelcast
MIN_HEAP_SIZE=4G
MAX_HEAP_SIZE=4G
# create file
touch ${DISCOVERY_CONFIG_FILE}
# replace additional parameters in config file
sed --in-place=.bak \
        -e "s|DISCOVERY_CONFIG_FILE|${DISCOVERY_CONFIG_FILE}|" \
        ${ROOT_DIR}/backend/cluster/src/main/resources/hazelcast.xml

# install hazelcast
pushd ${ROOT_DIR}/backend/cluster
# install hazelcast
mvn install
# done
popd
# minimum heap size
if [ "x$MIN_HEAP_SIZE" = "x" ]
 then
   MIN_HEAP_SIZE=4G
fi
if [ "x$MAX_HEAP_SIZE" = "x" ]
 then
  MAX_HEAP_SIZE=4G
fi
if [ "x$MIN_HEAP_SIZE" != "x" ]; then
  JAVA_OPTS="$JAVA_OPTS -Xms${MIN_HEAP_SIZE}"
fi
if [ "x$MAX_HEAP_SIZE" != "x" ]; then
  JAVA_OPTS="$JAVA_OPTS -Xms${MAX_HEAP_SIZE}"
fi
# update environment
if [ "x$MIN_HEAP_SIZE" != "x" ]; then
  JAVA_OPTS="$JAVA_OPTS -Xms${MIN_HEAP_SIZE}"
fi
if [ "x$MAX_HEAP_SIZE" != "x" ]; then
  JAVA_OPTS="$JAVA_OPTS -Xms${MAX_HEAP_SIZE}"
fi
# persist this variable to the VM environment
sudo sh -c 'echo "JAVA_OPTIONS=$JAVA_OPTS" >> /etc/environment'

# create service to host process
BACKEND_HOST_SERVICE_FILE=/etc/systemd/system/${PROJECT_NAME}-backend-host.service
cat <<-EOF > ${BACKEND_HOST_SERVICE_FILE}
[Unit]
Description=run backend host

[Service]
Type=simple
ExecStart=${ROOT_DIR}/backend/host.sh "<PROJECT_NAME>" "<ROOT_DIR>" "<HOST_TYPE>" "<HOST_ID>" "<STATUS_TOPIC_ID>" "<STORAGE_ACCOUNT_ID>"

[Install]
WantedBy=multi-user.target
EOF

# enable services
systemctl daemon-reload
systemctl enable --now ${PROJECT_NAME}-backend-host.service

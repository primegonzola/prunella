#!/bin/bash
PROJECT_NAME="<PROJECT_NAME>"
ROOT_DIR="<ROOT_DIR>"
HOST_TYPE="<HOST_TYPE>"
HOST_ID="<HOST_ID>"
STATUS_TOPIC_ID="<STATUS_TOPIC_ID>"
STORAGE_ACCOUNT_ID="<STORAGE_ACCOUNT_ID>"
BASE64_ENCODED_PFX_SSL_CERT="<BASE64_ENCODED_PFX_SSL_CERT>"
PFX_SSL_CERT_PASSWORD="<PFX_SSL_CERT_PASSWORD>"
BACKEND_PORT="<BACKEND_PORT>"
HEALTH_CHECK_URI="<HEALTH_CHECK_URI>"
HEALTH_CHECK_PORT="<HEALTH_CHECK_PORT>"
HEALTH_CHECK_INTERVAL="<HEALTH_CHECK_INTERVAL>"
HEALTH_CHECK_RISE_PROBES="<HEALTH_CHECK_RISE_PROBES>"
HEALTH_CHECK_FALL_PROBES="<HEALTH_CHECK_FALL_PROBES>"
TIMEOUT_CONNECT="<TIMEOUT_CONNECT>"
TIMEOUT_CLIENT="<TIMEOUT_CLIENT>"
TIMEOUT_SERVER="<TIMEOUT_SERVER>"
TIMEOUT_CHECK="<TIMEOUT_CHECK>"
ENABLE_PROXY_PROTOCOL="<ENABLE_PROXY_PROTOCOL>"
PROXY_CONNECTION_DRAINING_TIMEOUT_SECONDS="<PROXY_CONNECTION_DRAINING_TIMEOUT_SECONDS>"

# wait until all installers are finished
while fuser /var/lib/dpkg/lock >/dev/null 2>&1; do sleep 30; done;
# update
DEBIAN_FRONTEND="noninteractive" apt-get -qy update
# wait until all installers are finished
while fuser /var/lib/dpkg/lock >/dev/null 2>&1; do sleep 30; done;
# update
DEBIAN_FRONTEND="noninteractive" apt-get -qy update
# install additional packages here
DEBIAN_FRONTEND="noninteractive" apt-get -qy install jq 
DEBIAN_FRONTEND="noninteractive" apt-get -qy install htop 
DEBIAN_FRONTEND="noninteractive" apt-get -qy install socat 
DEBIAN_FRONTEND="noninteractive" apt-get -qy install haproxy 
DEBIAN_FRONTEND="noninteractive" apt-get -qy install dos2unix

# install pip 
DEBIAN_FRONTEND="noninteractive" apt-get -qy install python-pip
# import azure related libraries
# issue with see https://unix.stackexchange.com/questions/87745/what-does-lc-all-c-do
LC_ALL=C pip install azure

# install local files to final destination
mv ${ROOT_DIR}/frontend/data/haproxy.cfg.template /etc/haproxy/
mv ${ROOT_DIR}/frontend/data/20-haproxy.conf /etc/sysctl.d/
mv ${ROOT_DIR}/frontend/data/error-pages/*.http /etc/haproxy/errors/

# restart service
systemctl daemon-reload
# systemctl disable hv-fcopy-daemon.service

# set proper permissions
EXECUTE_DIRECTORIES="frontend frontend/scripts frontend/utils"
# set proper permissions
for dir in ${EXECUTE_DIRECTORIES}; do
        chmod a+x ${ROOT_DIR}/${dir}/*.sh
        dos2unix ${ROOT_DIR}/${dir}/*.sh
done

# Convert PFX SSL cert to PEM format and install it where HA Proxy config says it should be
if [[ "${PFX_SSL_CERT_PASSWORD}" != "" && "${BASE64_ENCODED_PFX_SSL_CERT}" != "" ]]; then
	echo ${PFX_SSL_CERT_PASSWORD} | \
		${ROOT_DIR}/frontend/utils/convert-b64pfx-to-pem.sh ${BASE64_ENCODED_PFX_SSL_CERT} | \
		sudo sh -c 'cat - > /etc/ssl/private/ssl.combined.pem'
fi

# enable / disable proxy protocol
ENABLE_PROXY_PROTOCOL_VALUE="#"
if [ "${ENABLE_PROXY_PROTOCOL}" == "true" ]; then
        ENABLE_PROXY_PROTOCOL_VALUE=""
fi

# haproxy config template location
HAPROXY_CFG_TEMPLATE_PATH=/etc/haproxy/haproxy.cfg.template

# Set static configuration to haproxy.cfg.template
sed --in-place=.bak \
	-e "s|<-HEALTH_CHECK_URI->|${HEALTH_CHECK_URI}|" \
        -e "s|<-TIMEOUT_CONNECT->|${TIMEOUT_CONNECT}s|" \
        -e "s|<-TIMEOUT_CLIENT->|${TIMEOUT_CLIENT}s|" \
        -e "s|<-TIMEOUT_SERVER->|${TIMEOUT_SERVER}s|" \
        -e "s|<-TIMEOUT_CHECK->|${TIMEOUT_CHECK}s|" \
        -e "s|<-ENABLE_PROXY_PROTOCOL->|${ENABLE_PROXY_PROTOCOL_VALUE}|" \
        ${HAPROXY_CFG_TEMPLATE_PATH}

echo -e "\tdefault-server port ${HEALTH_CHECK_PORT} inter ${HEALTH_CHECK_INTERVAL}s fall ${HEALTH_CHECK_FALL_PROBES} rise ${HEALTH_CHECK_RISE_PROBES}" >>${HAPROXY_CFG_TEMPLATE_PATH}

sed --in-place=.bak \
        -e "s|<-HOST_VMSS_ID->|${HOST_ID}|" \
        -e "s|<-BACKEND_PORT->|${BACKEND_PORT}|" \
        -e "s|<-STORAGE_ACCOUNT_ID->|${STORAGE_ACCOUNT_ID}|" \
        ${ROOT_DIR}/frontend/status.sh

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
ExecStart=${ROOT_DIR}/frontend/status.sh <PROJECT_NAME> "<ROOT_DIR>" <HOST_TYPE> <HOST_ID> <STATUS_TOPIC_ID>

[Install]
WantedBy=multi-user.target
EOF

# create frontend draining service
FRONTEND_DRAINING_SERVICE_FILE=/etc/systemd/system/${PROJECT_NAME}-frontend-draining.service
cat <<-EOF > ${FRONTEND_DRAINING_SERVICE_FILE}
[Unit]
Description=Drain connections on shutdown
# These dependencies ensure that we're run before the shutdown sequence starts
After=haproxy.service network-online.target network.target ssh.service
Requires=haproxy.service network-online.target network.target ssh.service

[Service]
Type=oneshot
RemainAfterExit=true

# On shutdown we do the following
# 1. Prevent the haproxy reconfigurater from restarting haproxy
# 2. REJECT new connections on port 80 by blocking SYN-packets, this will have the following effects
#    - The Azure load balancer probes will fail, so the machine is taken out of rotation
#    - In case we use haproxy behind another haproxy those healthprobes will also fail and haproxy will start a retry for connections it already tries to establish
# 3. After 15 seconds, DROP new connections to port 443
#    - Existing connections will not be affected by this
#    - TCP Stacks will retry to establish a connection, after a short timeout, the new SYN will end up on another proxy
# 4. Block shutdown for another ${PROXY_CONNECTION_DRAINING_TIMEOUT_SECONDS} seconds, to make sure connections will be drained over that timeframe
#
# See https://en.wikipedia.org/wiki/Transmission_Control_Protocol#Connection_establishment for information on the TCP Handshake
#
# XXX: For consideration: if a service talks directly to port 80, it might be better to DROP instead of REJECT this too. This lets the TCP stack deal with retries.

ExecStop=-/usr/bin/touch /tmp/no-reload-haproxy
ExecStop=-/sbin/iptables -I INPUT -i eth0 -p tcp --dport 80 --syn -j REJECT
ExecStop=-/sbin/iptables -I INPUT -i eth0 -p tcp --dport 443 --syn -j DROP
ExecStop=/bin/sleep ${PROXY_CONNECTION_DRAINING_TIMEOUT_SECONDS}

# Reverse the shutdown sequence
# This should not be needed, but might aid during debugging
ExecStart=-/sbin/iptables -D INPUT -i eth0 -p tcp --dport 443 --syn -j DROP
ExecStart=-/sbin/iptables -D INPUT -i eth0 -p tcp --dport 80 --syn -j REJECT
ExecStart=-/bin/rm /tmp/no-reload-haproxy

[Install]
RequiredBy=multi-user.target
EOF

# enable services
systemctl daemon-reload
systemctl enable --now ${PROJECT_NAME}-frontend-status.service
systemctl enable --now ${PROJECT_NAME}-frontend-draining.service

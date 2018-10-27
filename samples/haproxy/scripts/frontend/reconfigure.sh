#!/bin/bash

# info required using storage account
PARTS=(${STORAGE_ACCOUNT_ID//// })
SUBSCRIPTION_ID=${PARTS[1]}
RESOURCE_GROUP=${PARTS[3]}
STORAGE_ACCOUNT_NAME=${PARTS[7]}

HAPROXY_CFG_SERVER_LINE_FORMAT="server vmss--%s--%r--%n--%v--%i--%p--%c %p:${BACKEND_PORT} check"
HAPROXY_CFG_TEMPLATE_PATH=/etc/haproxy/haproxy.cfg.template
HAPROXY_CFG_PATH=/etc/haproxy/haproxy.cfg
TMP_PATH=/etc/haproxy/$$.tmp
TMP_PATH_CONFIGURATOR=/etc/haproxy/$$.configurator.tmp
# HAPROXY_CFG_TEMPLATE_PATH=./haproxy.cfg.template
# HAPROXY_CFG_PATH=./haproxy.cfg
# TMP_PATH=./$$.tmp
# TMP_PATH_CONFIGURATOR=./$$.configurator.tmp

# get our access token via MSI
REQUEST_URI=https://management.azure.com/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RESOURCE_GROUP}/providers/Microsoft.Storage/storageAccounts/${STORAGE_ACCOUNT_NAME}/listKeys?api-version=2017-06-01
ACCESS_TOKEN=$(curl http://localhost:50342/oauth2/token --data "resource=https://management.azure.com/" -H Metadata:true | jq -r .access_token)   
STORAGE_ACCOUNT_KEY=$(curl -X POST -d "" -s --header "authorization: Bearer ${ACCESS_TOKEN}" ${REQUEST_URI} | jq -r .keys[0].value)

# get our new config file
${ROOT_DIR}/frontend/utils/download.sh ${STORAGE_ACCOUNT_NAME} ${STORAGE_ACCOUNT_KEY} configuration template${HOST_VMSS_ID}/latest.cfg ${TMP_PATH_CONFIGURATOR}

# save our exit code
CONFIGURATOR_EXIT_CODE=$?
echo "Configurator exit code" ${CONFIGURATOR_EXIT_CODE}
cp ${HAPROXY_CFG_TEMPLATE_PATH} ${TMP_PATH}
sed -e 's|^|\t|' ${TMP_PATH_CONFIGURATOR} >>${TMP_PATH}

diff -q ${HAPROXY_CFG_PATH} ${TMP_PATH} &>/dev/null

# Prevent reloading of haproxy when the drainer is active during shutdown
if [ $? -ne 0 ] && [ ${CONFIGURATOR_EXIT_CODE} -eq 0 ] && [ ! -f /tmp/no-reload-haproxy ]; then
        # WARNING: We can not use the system reload here, as this runs inside a systemd timer
        # Instead we will send a SIGUSR2 to haproxy-systemd-wrapper, which controls the downstream haproxy instances
        # But this also allows us to check the configuration file before putting it at it's final destination
        echo "Reconfiguring HAProxy.."
        /usr/sbin/haproxy -c -f ${TMP_PATH}
        if [ $? -ne 0 ]; then
                echo "Configuration check failed, bailing out" >&2
                echo -e "\tBroken Configfiles available at ${TMP_PATH} and ${TMP_PATH_CONFIGURATOR}" >&2
                exit 1
        fi
        cp ${HAPROXY_CFG_PATH} ${HAPROXY_CFG_PATH}.old
        mv ${TMP_PATH} ${HAPROXY_CFG_PATH}
        /usr/bin/killall -USR2 haproxy-systemd-wrapper
        echo "Reconfiguration complete."
fi

[ -f ${TMP_PATH} ] && rm ${TMP_PATH}
[ -f ${TMP_PATH_CONFIGURATOR} ] && rm ${TMP_PATH_CONFIGURATOR}

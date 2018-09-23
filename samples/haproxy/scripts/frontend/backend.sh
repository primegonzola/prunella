#!/bin/bash

# resolve most of data required
PARTS=(${STATUS_TOPIC_ID//// })
SUBSCRIPTION_ID=${PARTS[1]}
RESOURCE_GROUP=${PARTS[3]}
STATUS_TOPIC_NAME=${PARTS[7]}

# use MSI to get access token
#ACCESS_TOKEN=$(curl http://localhost:50342/oauth2/token --data "resource=https://management.azure.com/" -H Metadata:true | jq -r .access_token)
ACCESS_TOKEN=$(curl 'http://169.254.169.254/metadata/identity/oauth2/token?api-version=2018-02-01&resource=https%3A%2F%2Fmanagement.azure.com%2F' -H Metadata:true | jq -r .access_token)

# get topic key and endpoint
REQUEST_URI=https://management.azure.com/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RESOURCE_GROUP}/providers/Microsoft.EventGrid/topics/${STATUS_TOPIC_NAME}/listKeys?api-version=2018-01-01
STATUS_TOPIC_KEY=$(curl --silent -X POST -d "" -s --header "authorization: Bearer ${ACCESS_TOKEN}" ${REQUEST_URI} | jq -r .key1)
REQUEST_URI=https://management.azure.com/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RESOURCE_GROUP}/providers/Microsoft.EventGrid/topics/${STATUS_TOPIC_NAME}?api-version=2018-01-01
STATUS_TOPIC_ENDPOINT=$(curl --silent -X GET -s --header "authorization: Bearer ${ACCESS_TOKEN}" ${REQUEST_URI} | jq -r .properties.endpoint)

# clear before start
unset STATUS_EVENT_DATA
# ask status to haproxy
STATUS_OUTPUT=$(echo "show stat -1 4 -1" | sudo socat /var/run/haproxy/admin.sock stdio | grep -E "vmss--[0-9]" | cut -d , -f 2,18)

# check if anything found
if [ -n "$STATUS_OUTPUT" ]; then
	# read the lines
	while read -r LINE; do
		STATUS_PARTS=(${LINE//,/ })
		INSTANCE_STATUS=${STATUS_PARTS[1]}
		INFO_PARTS=(${STATUS_PARTS[0]//--/ })
		# check for proper concatenation
		if [ -n "${STATUS_EVENT_DATA+set}" ]; then
			STATUS_EVENT_DATA=${STATUS_EVENT_DATA},
		fi
        INSTANCE_SUBSCRIPTION_ID=${INFO_PARTS[1]}
        INSTANCE_RESOURCE_GROUP=${INFO_PARTS[2]}	
       	INSTANCE_NAME=${INFO_PARTS[3]}
        INSTANCE_ID=${INFO_PARTS[4]}
        INSTANCE_IP=${INFO_PARTS[5]}
        INSTANCE_HOST_NAME=$(python ${ROOT_DIR}/frontend/utils/hexatrig.py "i2h" "${INSTANCE_NAME}" "${INSTANCE_ID}")
		BACKEND_VMSS_ID=/subscriptions/${INSTANCE_SUBSCRIPTION_ID}/resourceGroups/${INSTANCE_RESOURCE_GROUP}/providers/Microsoft.Compute/virtualMachineScaleSets/${INSTANCE_NAME}
		# format out message
		json=$(
			cat <<EOF
{
    "id": "$RANDOM",
    "eventType": "prunella-status",
    "subject": "${BACKEND_VMSS_ID}",
    "eventTime": "$(date +%Y-%m-%dT%H:%M:%S%z)",
    "data": {
        "type": "${HOST_TYPE}",
        "name": "${INSTANCE_HOST_NAME}",
        "status": "${INSTANCE_STATUS}"
    }
}
EOF
		)
		# if [ "$INSTANCE_STATUS" != "DOWN" ]; then
				# add to list if not DOWN
		STATUS_EVENT_DATA=${STATUS_EVENT_DATA}${json}
		# fi
	done <<<"${STATUS_OUTPUT}"
	# post it to the grid
	# echo "[${STATUS_EVENT_DATA}]"
	curl -X POST -H "aeg-sas-key: ${STATUS_TOPIC_KEY}" -d "[${STATUS_EVENT_DATA}]" ${STATUS_TOPIC_ENDPOINT}
	# check result code
	if [ $? -ne 0 ]; then
		echo >&2 "error sending backend heartbeats"
		exit $?
	fi
fi
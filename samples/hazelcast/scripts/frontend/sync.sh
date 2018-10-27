#!/bin/bash

# info required using storage account
PARTS=(${STORAGE_ACCOUNT_ID//// })
SUBSCRIPTION_ID=${PARTS[1]}
RESOURCE_GROUP=${PARTS[3]}
STORAGE_ACCOUNT_NAME=${PARTS[7]}

# get our access token via MSI
REQUEST_URI=https://management.azure.com/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RESOURCE_GROUP}/providers/Microsoft.Storage/storageAccounts/${STORAGE_ACCOUNT_NAME}/listKeys?api-version=2017-06-01
ACCESS_TOKEN=$(curl http://localhost:50342/oauth2/token --data "resource=https://management.azure.com/" -H Metadata:true | jq -r .access_token)   
STORAGE_ACCOUNT_KEY=$(curl -X POST -d "" -s --header "authorization: Bearer ${ACCESS_TOKEN}" ${REQUEST_URI} | jq -r .keys[0].value)

# get our new config file
${ROOT_DIR}/frontend/download.sh ${STORAGE_ACCOUNT_NAME} ${STORAGE_ACCOUNT_KEY} configuration template${CLUSTER_VMSS_ID}/discovery.config ${DISCOVERY_CONFIG_FILE}

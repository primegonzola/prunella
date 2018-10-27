#!/bin/bash

# get our stuff
. ./utils.sh
. ./environment.sh
. ./api-versions.sh

# start clean
clear

# variables comes here
BOOTSTRAP_STORAGE_ACCOUNT=bootstrapsa$UNIQUE_NAME_FIX

# create the resource group
display_progress "Creating resource group ${RESOURCE_GROUP}"
az group create -n ${RESOURCE_GROUP} -l ${LOCATION}

# create storage account
display_progress "Creating bootstrap account ${BOOTSTRAP_STORAGE_ACCOUNT} in ${LOCATION}"
az storage account create -g ${RESOURCE_GROUP} -n ${BOOTSTRAP_STORAGE_ACCOUNT} -l ${LOCATION} --sku Standard_LRS

# get connection string storage account
display_progress "Retrieving connection string for ${BOOTSTRAP_STORAGE_ACCOUNT} in ${LOCATION}"
export AZURE_STORAGE_CONNECTION_STRING=$(az storage account show-connection-string -g ${RESOURCE_GROUP} --name ${BOOTSTRAP_STORAGE_ACCOUNT} -o tsv)

# create the storage container
display_progress "Creating bootstrap container in storage account"
az storage container create -n bootstrap

# create the SAS token to access it and upload files
display_progress "Generating SAS tokens"
STORAGE_SAS_TOKEN="?$(az storage container generate-sas -n bootstrap --permissions lr --expiry $(date ${plus_one_year} -u +%Y-%m-%dT%H:%mZ) -o tsv)"

# get right url
display_progress "Retrieving final destination uri for uploading files"
BLOB_BASE_URL=$(az storage account show -g ${RESOURCE_GROUP} -n ${BOOTSTRAP_STORAGE_ACCOUNT} -o json --query="primaryEndpoints.blob" -o tsv)

# get readyy to upload file
display_progress "Uploading files to bootstrap account"
for file in *; do
    echo "uploading $file"
    az storage blob upload -c bootstrap -f ${file} -n ${file} &>/dev/null
done

# Mark & as escaped characters in SAS Token
ESCAPED_SAS_TOKEN=$(echo ${STORAGE_SAS_TOKEN} | sed -e "s|\&|\\\&|g")
MAIN_URI="${BLOB_BASE_URL}bootstrap/main.json${STORAGE_SAS_TOKEN}"

# replace with right versions
replace_versions main.parameters.template.json main.parameters.json

# replace additional parameters in parameter file
sed --in-place=.bak \
-e "s|<uniqueNameFix>|${UNIQUE_NAME_FIX}|" \
-e "s|<uniqueTicks>|${UNIQUE_TICKS}|" \
-e "s|<operationMode>|${OPERATION_MODE}|" \
-e "s|<projectName>|${PROJECT_NAME}|" \
-e "s|<bootstrapStorageAccount>|${BOOTSTRAP_STORAGE_ACCOUNT}|" \
-e "s|<bootstrapStorageAccountSas>|${ESCAPED_SAS_TOKEN}|" \
-e "s|<bootstrapStorageAccountUrl>|${BLOB_BASE_URL}|" \
main.parameters.json

# create the main deployment either in background or not
display_progress "Deploying main template into resource group"
if [[ "${OPERATION_MODE}" == "development" ]]; then
    az group deployment create -g ${RESOURCE_GROUP} --template-uri ${MAIN_URI} --parameters @main.parameters.json --output json > main.output.json &
else
    az group deployment create -g ${RESOURCE_GROUP} --template-uri ${MAIN_URI} --parameters @main.parameters.json --output json > main.output.json
fi

# save PID for later
MAIN_PID=$!

# Preparing services
pusha ../scripts/services
# Building services
display_progress "Building services"
./build.sh
# cleanup
popa

# wait for main deployment
display_progress "Waiting for main deployment to complete"
wait_progress ${MAIN_PID}

# main deployment completed
display_progress "Main deployment completed"
MAIN_OUTPUT=$(cat main.output.json)

# get services name and other usefull info
STORAGE_ACCOUNT_ID=$(echo "${MAIN_OUTPUT}" | jq -r '.properties.outputs.storageAccountId.value')
SERVICES_ID=$(echo "${MAIN_OUTPUT}" | jq -r '.properties.outputs.servicesId.value')
SERVICES_PRINCIPAL_ID=$(echo "${MAIN_OUTPUT}" | jq -r '.properties.outputs.servicesPrincipalId.value')
STATUS_TOPIC_ID=$(echo "${MAIN_OUTPUT}" | jq -r '.properties.outputs.statusTopicId.value')
KEY_VAULT_URI=$(echo "${MAIN_OUTPUT}" | jq -r '.properties.outputs.keyVaultUri.value')

# set proper roles
display_progress "Setting proper role assignments"
# az role assignment create --assignee-object-id ${SERVICES_PRINCIPAL_ID} --scope ${STORAGE_ACCOUNT_ID} --role Contributor
az role assignment create --assignee-object-id ${SERVICES_PRINCIPAL_ID} --resource-group ${RESOURCE_GROUP} --role Contributor

# add to current list to be monitored
display_progress "Enabling vault"
az webapp config appsettings set --settings KEY_VAULT_URI=${KEY_VAULT_URI} --ids ${SERVICES_ID}

# publishing services
pusha ../scripts/services
# publish services
display_progress "Publishing services"
./publish.sh ${SERVICES_ID}
# cleanup
popa

# register listeners
display_progress "Registering listeners"
./listeners.sh ${SERVICES_ID} ${STATUS_TOPIC_ID}

# clean up
display_progress "Cleaning up"
az storage account delete --resource-group ${RESOURCE_GROUP} --name ${BOOTSTRAP_STORAGE_ACCOUNT} --yes

# all done
display_progress "Deployment completed"
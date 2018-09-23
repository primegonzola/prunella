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

# get ready to upload file
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
-e "s|<omitJumpBox>|${OMIT_JUMP_BOX}|" \
-e "s|<statusTopicId>|${PRUNELLA_STATUS_TOPIC_ID}|" \
-e "s|<storageAccountId>|${PRUNELLA_STORAGE_ACCOUNT_ID}|" \
-e "s|<bootstrapStorageAccount>|${BOOTSTRAP_STORAGE_ACCOUNT}|" \
-e "s|<bootstrapStorageAccountSas>|${ESCAPED_SAS_TOKEN}|" \
-e "s|<bootstrapStorageAccountUrl>|${BLOB_BASE_URL}|" \
main.parameters.json

# prepare & tar all files up
pusha ../scripts/frontend
display_progress "Packaging frontend subsystem related files"
tar -czvf frontend.tar.gz *
# upload files
display_progress "Uploading frontend subsystem related files to bootstrap account"
az storage blob upload -c bootstrap -f ./frontend.tar.gz -n frontend.tar.gz
# clean up
rm -rf ./frontend.tar.gz
popa

# prepare & tar all files up
pusha ../scripts/backend
display_progress "Packaging backend subsystem related files"
tar -czvf backend.tar.gz *
# upload files
display_progress "Uploading backend subsystem related files to bootstrap account"
az storage blob upload -c bootstrap -f ./backend.tar.gz -n backend.tar.gz
# clean up
rm -rf ./backend.tar.gz
popa

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

# get info
PARTS=(${PRUNELLA_SERVICES_ID//// })
PRUNELLA_RESOURCE_GROUP=${PARTS[3]}
PRUNELLA_SERVICES_NAME=${PARTS[7]}
# get services principal
PRUNELLA_SERVICES_PRINCIPAL_ID=$(az resource list -n ${PRUNELLA_SERVICES_NAME} --query [*].identity.principalId --out tsv -g ${PRUNELLA_RESOURCE_GROUP})

# get services name and other usefull info
FRONTEND_VMSS_ID=$(echo "${MAIN_OUTPUT}" | jq -r '.properties.outputs.frontendVmssId.value')
FRONTEND_VMSS_PREFIX=$(echo "${MAIN_OUTPUT}" | jq -r '.properties.outputs.frontendVmssPrefix.value')
FRONTEND_VMSS_PRINCIPAL_ID=$(echo "${MAIN_OUTPUT}" | jq -r '.properties.outputs.frontendVmssPrincipalId.value')
FRONTEND_VMSS_AUTOSCALE_NAME=$(echo "${MAIN_OUTPUT}" | jq -r '.properties.outputs.frontendVmssAutoScaleName.value')

BACKEND_VMSS_ID=$(echo "${MAIN_OUTPUT}" | jq -r '.properties.outputs.backendVmssId.value')
BACKEND_VMSS_PREFIX=$(echo "${MAIN_OUTPUT}" | jq -r '.properties.outputs.backendVmssPrefix.value')
BACKEND_VMSS_PRINCIPAL_ID=$(echo "${MAIN_OUTPUT}" | jq -r '.properties.outputs.backendVmssPrincipalId.value')
BACKEND_VMSS_AUTOSCALE_NAME=$(echo "${MAIN_OUTPUT}" | jq -r '.properties.outputs.backendVmssAutoScaleName.value')

# publishing services
pusha ../scripts/services
# publish services
display_progress "Publishing services"
./publish.sh ${PRUNELLA_SERVICES_ID}
# cleanup
popa

# set proper roles
display_progress "Setting proper role assignments"
# give frontend and backend access to topic so they can publish info
az role assignment create --assignee-object-id ${FRONTEND_VMSS_PRINCIPAL_ID} --scope ${PRUNELLA_STATUS_TOPIC_ID} --role Contributor
az role assignment create --assignee-object-id ${BACKEND_VMSS_PRINCIPAL_ID} --scope ${PRUNELLA_STATUS_TOPIC_ID} --role Contributor
# give frontend and backend access to key vault so they can read needed secrets
az role assignment create --assignee-object-id ${FRONTEND_VMSS_PRINCIPAL_ID} --scope ${PRUNELLA_KEY_VAULT_ID} --role Contributor
az role assignment create --assignee-object-id ${BACKEND_VMSS_PRINCIPAL_ID} --scope ${PRUNELLA_KEY_VAULT_ID} --role Contributor
# give frontend access to storage account so it can read templates and configuration items
az role assignment create --assignee-object-id ${FRONTEND_VMSS_PRINCIPAL_ID} --scope ${PRUNELLA_STORAGE_ACCOUNT_ID} --role Contributor
# give services principal proper access to frontend and backend
az role assignment create --assignee-object-id ${PRUNELLA_SERVICES_PRINCIPAL_ID} --scope ${FRONTEND_VMSS_ID} --role Contributor
az role assignment create --assignee-object-id ${PRUNELLA_SERVICES_PRINCIPAL_ID} --scope ${BACKEND_VMSS_ID} --role Contributor

# add to current list to be monitored
# prepare our event data
STATUS_TARGETS=$(
	cat <<EOF
[{
    "name": "frontend-vmss",
    "type": "VirtualMachineScaleSet",
    "grace": 0,
    "minimum": 1,
    "expiration": 300,
    "unhealthy" : "DOWN",
    "resources": [
        "${FRONTEND_VMSS_ID}"
    ]
},{
    "name": "backend-vmss",
    "type": "VirtualMachineScaleSet",
    "grace": 0,
    "minimum": 1,
    "expiration": 300,
    "unhealthy" : "DOWN",
    "resources": [
        "${BACKEND_VMSS_ID}"
    ]
}]
EOF
)

# update config
az webapp config appsettings set --settings STATUS_TARGETS="${STATUS_TARGETS}" --ids ${PRUNELLA_SERVICES_ID}

HAPROXY_TARGETS=$(
	cat <<EOF
[{
    "frontend": "${FRONTEND_VMSS_ID}",
    "backends": [{
        "id": "${BACKEND_VMSS_ID}",
        "prefix" : "${BACKEND_VMSS_PREFIX}"  
    }]
}]
EOF
)

# update config
az webapp config appsettings set --settings HAPROXY_TARGETS="${HAPROXY_TARGETS}" --ids ${PRUNELLA_SERVICES_ID}

#restart web app
# az webapp restart --ids ${PRUNELLA_SERVICES_ID}

# echo scaling hosts
display_progress "Scaling frontend hosts"
az monitor autoscale update --name ${FRONTEND_VMSS_AUTOSCALE_NAME} --resource-group ${RESOURCE_GROUP} --count 2
az vmss scale --new-capacity 2 --no-wait --ids ${FRONTEND_VMSS_ID}

# lets sleep 30 seconds allowing api to cool down
sleep 30
display_progress "Scaling backend hosts"
az monitor autoscale update --name ${BACKEND_VMSS_AUTOSCALE_NAME} --resource-group ${RESOURCE_GROUP} --count 2
az vmss scale --new-capacity 2 --no-wait --ids ${BACKEND_VMSS_ID}

# clean up
# display_progress "Cleaning up"
# az storage account delete --resource-group ${RESOURCE_GROUP} --name ${BOOTSTRAP_STORAGE_ACCOUNT} --yes

# all done
display_progress "Deployment completed"
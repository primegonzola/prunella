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
-e "s|<bootstrapStorageAccount>|${BOOTSTRAP_STORAGE_ACCOUNT}|" \
-e "s|<bootstrapStorageAccountSas>|${ESCAPED_SAS_TOKEN}|" \
-e "s|<bootstrapStorageAccountUrl>|${BLOB_BASE_URL}|" \
main.parameters.json

# prepare & tar all files up
pusha ../scripts/hosts
display_progress "Packaging subsystem related files"
tar -czvf hosts.tar.gz *

# upload files
display_progress "Uploading subsystem related files to bootstrap account"
az storage blob upload -c bootstrap -f ./hosts.tar.gz -n hosts.tar.gz

# clean up
rm -rf ./hosts.tar.gz
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
VMSS_ID=$(echo "${MAIN_OUTPUT}" | jq -r '.properties.outputs.vmssId.value')
VMSS_PRINCIPAL_ID=$(echo "${MAIN_OUTPUT}" | jq -r '.properties.outputs.vmssPrincipalId.value')
VMSS_AUTOSCALE_NAME=$(echo "${MAIN_OUTPUT}" | jq -r '.properties.outputs.vmssAutoScaleName.value')

# set proper roles
display_progress "Setting proper role assignments"
az role assignment create --assignee-object-id ${PRUNELLA_SERVICES_PRINCIPAL_ID} --scope ${VMSS_ID} --role Contributor
az role assignment create --assignee-object-id ${VMSS_PRINCIPAL_ID} --scope ${PRUNELLA_STATUS_TOPIC_ID} --role Contributor

# add to current list to be monitored
# prepare our event data
STATUS_TARGETS=$(
	cat <<EOF
[{
    "name": "vmss-host",
    "type": "VirtualMachineScaleSet",
    "grace": 0,
    "minimum": 1,
    "expiration": 300,
    "unhealthy" : "DOWN",
    "resources": [
        "${VMSS_ID}"
    ]
}]
EOF
)

# update config
az webapp config appsettings set --settings TARGET_IDS=${VMSS_ID} --ids ${PRUNELLA_SERVICES_ID}
az webapp config appsettings set --settings STATUS_TARGETS="${STATUS_TARGETS}" --ids ${PRUNELLA_SERVICES_ID}

#restart web app
# az webapp restart --ids ${PRUNELLA_SERVICES_ID}

# echo scaling hosts
display_progress "Scaling hosts"
az monitor autoscale update --name ${VMSS_AUTOSCALE_NAME} --resource-group ${RESOURCE_GROUP} --count 2
az vmss scale --new-capacity 2 --no-wait --ids ${VMSS_ID}

# clean up
# display_progress "Cleaning up"
# az storage account delete --resource-group ${RESOURCE_GROUP} --name ${BOOTSTRAP_STORAGE_ACCOUNT} --yes

# all done
display_progress "Deployment completed"
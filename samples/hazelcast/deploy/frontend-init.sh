#!/bin/bash
PROJECT_NAME="${1}"
BOOTSTRAP_STORAGE_ACCOUNT_NAME="${2}"
BOOTSTRAP_STORAGE_ACCOUNT_KEY="${3}"
BOOTSTRAP_STORAGE_ACCOUNT_SAS="${4}"
OMS_WORKSPACE_ID="${5}"
OMS_WORKSPACE_KEY="${6}"
HOST_TYPE="${7}"
HOST_ID="${8}"
STATUS_TOPIC_ID="${9}"
STORAGE_ACCOUNT_ID="${10}"
CLUSTER_VMSS_ID="${11}"

# define root of all evil
ROOT_DIR=/opt/${PROJECT_NAME}

# create working folders
mkdir -vp ${ROOT_DIR}

cat <<-EOF >${ROOT_DIR}/sanity-check.sh
ls -la /etc/systemd/system
cat /var/log/waagent.log
cat /var/lib/waagent/custom-script/download/0/stderr
cat /var/lib/waagent/custom-script/download/0/stdout
cat /var/lib/waagent/custom-script/download/1/stderr
cat /var/lib/waagent/custom-script/download/1/stdout
EOF
# right permissions
chmod +x ${ROOT_DIR}/sanity-check.sh

# wait until all installers are finished
while fuser /var/lib/dpkg/lock >/dev/null 2>&1; do sleep 30; done

# onboard OMS agent
until sh onboard_agent.sh -w "${OMS_WORKSPACE_ID}" -s "${OMS_WORKSPACE_KEY}"; do
	echo "Retrying onboard agent installation in 10 seconds"
	sleep 10
done

# create working folders
mkdir -vp ${ROOT_DIR}/frontend
# download
./download.sh ${BOOTSTRAP_STORAGE_ACCOUNT_NAME} ${BOOTSTRAP_STORAGE_ACCOUNT_KEY} bootstrap frontend.tar.gz ${ROOT_DIR}/frontend/frontend.tar.gz
# change dir to frontend
pushd ${ROOT_DIR}/frontend
# untar file
tar -xzvf frontend.tar.gz
# clean up
rm -rf frontend.tar.gz
# set permissions for all scripts
chmod +x ${ROOT_DIR}/frontend/*.sh
# restore dir
popd
# replace in target init file 
sed --in-place=.bak \
	-e "s|<PROJECT_NAME>|${PROJECT_NAME}|" \
	-e "s|<BOOTSTRAP_STORAGE_ACCOUNT_NAME>|${BOOTSTRAP_STORAGE_ACCOUNT_NAME}|" \
	-e "s|<BOOTSTRAP_STORAGE_ACCOUNT_KEY>|${BOOTSTRAP_STORAGE_ACCOUNT_KEY}|" \
	-e "s|<BOOTSTRAP_STORAGE_ACCOUNT_SAS>|${BOOTSTRAP_STORAGE_ACCOUNT_SAS}|" \
	-e "s|<ROOT_DIR>|${ROOT_DIR}|" \
	-e "s|<HOST_TYPE>|${HOST_TYPE}|" \
	-e "s|<HOST_ID>|${HOST_ID}|" \
	-e "s|<STATUS_TOPIC_ID>|${STATUS_TOPIC_ID}|" \
	-e "s|<STORAGE_ACCOUNT_ID>|${STORAGE_ACCOUNT_ID}|" \
	-e "s|<CLUSTER_VMSS_ID>|${CLUSTER_VMSS_ID}|" \
	${ROOT_DIR}/frontend/init.sh

# execute directly
${ROOT_DIR}/frontend/init.sh

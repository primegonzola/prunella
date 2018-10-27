#!/bin/bash
PROJECT_NAME="${1}"
ROOT_DIR="${2}"
HOST_TYPE="${3}"
HOST_ID="${4}"
STATUS_TOPIC_ID="${5}"
STORAGE_ACCOUNT_ID="${6}"
DISCOVERY_CONFIG_FILE="${7}"
# set variables
export DISCOVERY_CONFIG_FILE=${DISCOVERY_CONFIG_FILE}
# start
java -jar ${ROOT_DIR}/frontend/frontend-api-1.0.0.jar
# done
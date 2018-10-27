#!/bin/bash
PROJECT_NAME="${1}"
ROOT_DIR="${2}"
HOST_TYPE="${3}"
HOST_ID="${4}"
STATUS_TOPIC_ID="${5}"
STORAGE_ACCOUNT_ID="${6}"
DISCOVERY_CONFIG_FILE="${7}"

# set variables
export MAVEN_OPTS="-server $JAVA_OPTS"
# go to proper directory where pom.xml is
pushd ${ROOT_DIR}/backend/cluster/
# start
mvn exec:java
# done
popd
#!/bin/bash
mvn clean package

export DISCOVERY_CONFIG_FILE="/t/depot/github/prunella/samples/hazelcast/scripts/frontend/site/discovery.config"

java -jar ./target/frontend-api-1.0.0.jar


#!/bin/bash
# deploy core solution first
pushd ../../../src/deploy 
./deploy.sh $@
popd
# deploy sample solution next
./deploy.sh $@ --prunella-output ../../../src/output/deploy/main.output.json

#!/bin/bash -e
# build and compile, linl core library first
pushd prunella
npm --prefer-offline install
npm run build
npm link
popd
# modules to handle
MODULES="monitor"
# go over each function app
for module in $MODULES; do
	pushd ${module}
	npm --prefer-offline install
	npm link prunella
	npm run build
	# rm -rf node_modules
	# rm package-lock.json
	popd
done

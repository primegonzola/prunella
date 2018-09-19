#!/bin/bash
if [ $# -ne 1 ]; then
        echo >&2 "Usage: $0 <base64 encoded password protected pfx certificate>"
        echo >&2 "       Pass the certificate password on standard input"
        echo >&2 "       Writes a PEM certificate on standard output"
        exit 1
fi

BASE64_ENCODED_PFX_CERT="$1"
TMP_FILE_PATH="/tmp/$$.tmp"

echo "${BASE64_ENCODED_PFX_CERT}" | base64 -d > ${TMP_FILE_PATH}

# Reads the decryption password from stdin
# Outputs the PEM certificate to standard output
openssl pkcs12 -in ${TMP_FILE_PATH} -nodes -passin stdin
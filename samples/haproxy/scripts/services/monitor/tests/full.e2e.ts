/* tslint:disable:no-console */
/* tslint:disable:only-arrow-functions */
/* tslint:disable:space-before-function-paren */
import { expect } from "chai";
import "mocha";
import * as msRestAzure from "ms-rest-azure";
import { ApiClient, IApiClient } from "prunella";

describe("HAProxy End to End", () => {
    // global vars
    let client: IApiClient = null;
    const clientId = process.argv[5];
    const secret = process.argv[6];
    const domain = process.argv[7];
    const subcriptionId = process.argv[8];
    const storageAccountId = process.argv[9];
    const storageAccountKey = process.argv[10];
    // all needs to be done before
    before(function (done) {
        // change timeout
        this.timeout(60000);
        msRestAzure.loginWithServicePrincipalSecret(clientId, secret, domain, (err, result) => {
            ApiClient.createInstance(result, subcriptionId, storageAccountId, storageAccountKey).then((api) => {
                client = api;
                done();
            });
        });
    });

    it("should be initialized", async () => {
        // check initial state
        const states = await client.storage.getEntities("State", "StateEntities");
        expect(states.length).to.equal(4);
        // check initial state
        const statuses = await client.storage.getEntities("Status", "StatusEntities");
        expect(statuses.length).to.equal(4);
    });
});

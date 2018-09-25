/* tslint:disable:no-console */
/* tslint:disable:only-arrow-functions */
/* tslint:disable:space-before-function-paren */
import { expect } from "chai";
import "mocha";
import * as msRestAzure from "ms-rest-azure";
import { ApiClient, DataModel, IDataModel } from "prunella";
import * as SSH from "simple-ssh";

describe("HAProxy End to End", () => {
    let model: IDataModel = null;
    const clientId = global.process.argv[5];
    const secret = global.process.argv[6];
    const domain = global.process.argv[7];
    const subcriptionId = global.process.argv[8];
    const storageAccountId = global.process.argv[9];
    const storageAccountKey = global.process.argv[10];
    const jumpHost = global.process.argv[11];
    const jumpPassword = global.process.argv[12];
    const jumpUser = global.process.argv[13];

    // // create new ssh client
    // const ssh = new SSH({
    //     host: jumpHost,
    //     pass: jumpPassword,
    //     user: jumpUser,
    // });
    // // execute following commands
    // ssh
    //     // install sshpass on remote machine
    //     .exec("sudo apt-get install sshpass")
    //     // stop service sshpass on remote machine
    //     .exec("sshpass -p Dummy2PassWord! ssh ubuntu@10.0.2.4 sudo systemctl start apache2.service")
    //     // start command
    //     .start();

    // all needs to be done before
    before(function (done) {
        // change timeout
        this.timeout(60000);
        msRestAzure.loginWithServicePrincipalSecret(clientId, secret, domain, (err, result) => {
            ApiClient.createInstance(result, subcriptionId, storageAccountId, storageAccountKey).then((api) => {
                DataModel.createInstance(api).then((dm) => {
                    model = dm;
                    done();
                });
            });
        });
    });

    it("should be initialized", async () => {
        // check initial state
        const states = await model.readStates();
        expect(states.length).to.equal(4);
        // check initial status
        const statuses = await model.readStatuses();
        expect(statuses.length).to.equal(4);
    });
});

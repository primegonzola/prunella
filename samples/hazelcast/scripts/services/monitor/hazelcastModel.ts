/* tslint:disable:max-classes-per-file */
import * as util from "util";

import {
    HashMap,
    IEnvironment,
    IHashMap,
    Logger,
    Resource,
    StatusTarget,
    Utils,
} from "prunella";

import {
    IHazelcastModel,
} from "./typings";

class HazelcastModel implements IHazelcastModel {
    public static async createInstance(environment: IEnvironment): Promise<IHazelcastModel> {
        // create model
        const model = new HazelcastModel(environment);
        // initialize
        await model.initialize();
        // all done
        return model;
    }

    public environment: IEnvironment;
    constructor(environment: IEnvironment) {
        this.environment = environment;
    }
    public async isReady(): Promise<boolean> {
        return Logger.enterAsync<boolean>("HazelcastModel.isReady", async () => {
            return this.environment.data.isReadyState("hazelcast-application-model-system-state");
        });
    }

    public async update(): Promise<void> {
        return Logger.enterAsync<void>("HazelcastModel.update", async () => {
            // check if ready
            if (await this.isReady()) {
                // generate configuration
                await this.generateDiscoveryConfiguration();
            }
        });
    }

    private async generateDiscoveryConfiguration(): Promise<void> {
        return Logger.enterAsync<void>("IHazelcastModel.generateDiscoveryConfiguration", async () => {
            // final config
            const configs = new HashMap();
            // get all statuses
            const statuses = await this.environment.data.readStatuses();
            // go over each entity
            for (const status of statuses) {
                // only handle cluster ones
                if (status.category === "hazelcast-cluster") {
                    // see if config is there, if not add
                    if (!configs.has(status.id)) {
                        // add
                        configs.set(status.id, "");
                    }
                    // get last config
                    let last = configs.get(status.id);
                    // add new entry
                    last = last + util.format("%s\n", status.data.ipAddress);
                    // update
                    configs.set(status.id, last);
                }
            }
            // calls
            const calls = [];
            // loop over various configs collected
            configs.each((id: string, config: string) => {
                // add for late
                calls.push(this.environment.api.storage.writeText(
                    "configuration", "template" + id + "/discovery.config", config));
            });
            // check if any calls found
            if (calls.length > 0) {
                // execute them
                await Promise.all(calls);
            }

        });
    }

    private async initialize(): Promise<void> {
        return Logger.enterAsync<void>("HazelcastModel.initialize", async () => {
            // see if ready
            const isReady = await this.isReady();
            // check if ready or not so we can init all
            if (!isReady) {
                // mark as ready
                await this.markReady();
            }
        });
    }

    private async markReady(): Promise<void> {
        return Logger.enterAsync<void>("HazelcastModel.markReady", async () => {
            return this.environment.data.markReadyState("hazelcast-application-model-system-state");
        });
    }
}

export { HazelcastModel };

import * as fs from "fs";

import {
    IApiClient,
    IApplicationModel,
    IContext,
    IDataModel,
    IEnvironment,
    ILogger,
    StatusTarget,
} from "./typings";

import { ApiClient } from "./apiClient";
import { ApplicationModel } from "./applicationModel";
import { DataModel } from "./dataModel";
import { Logger } from "./logger";
import { Settings } from "./settings";

class Environment implements IEnvironment {

    public static async loadPackage(): Promise<object> {
        return new Promise((resolve, reject) => {
            fs.readFile(__dirname + "/../package.json", (error, data) => {
                if (error) { return reject(error); }
                return resolve(JSON.parse(data.toString()));
            });
        });
    }

    public static isEnabled(): boolean {
        // check if enabled
        return Settings.isEnabled;
    }

    public static async createInstance(context: IContext): Promise<IEnvironment> {
        return Logger.enterAsync<IEnvironment>("Environment.createInstance", async () => {
            // get settings
            const settings = await Settings.get();
            // get package
            const pkg: any = await Environment.loadPackage();
            // init logger
            const logger = await Logger.createInstance(context, { category: pkg.name });
            // create environment
            const model = new Environment(logger, pkg.name);
            // initialize
            await model.initialize(settings);
            // all done
            return model;
        });
    }

    public api: IApiClient;
    public name: string;
    public logger: ILogger;
    public data: IDataModel;
    public application: IApplicationModel;

    constructor(logger: ILogger, name: string) {
        Logger.enter("Environment.constructor", () => {
            this.name = name;
            this.logger = logger;
        });
    }

    private async initialize(settings: Settings): Promise<void> {
        return Logger.enterAsync<void>("Environment.initialize", async () => {
            if (Environment.isEnabled()) {
                // create api
                this.api = await ApiClient.createInstance(this.logger, settings);
                // create data model
                this.data = await DataModel.createInstance(this);
                // creates options for this instance
                const options = {
                    resourceGroup: settings.resourceGroup,
                    storageAccountId: settings.storageAccountId,
                    subscriptionId: settings.subscriptionId,
                    targets: JSON.parse(settings.statusTargets) as StatusTarget[],
                    topicId: settings.statusTopicId,
                };
                // create application model
                this.application = await ApplicationModel.createInstance(this, options);
            }
        });
    }
}

export { Environment };

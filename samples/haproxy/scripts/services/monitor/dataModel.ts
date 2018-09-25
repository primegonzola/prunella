import * as prunella from "prunella";

import {
    Logger,
} from "prunella";

import {
    IDataModel,
    IHAProxyEntity,
} from "./typings";

import { HAProxyEntity } from "./haproxyEntity";

class DataModel implements IDataModel {
    public static HAProxyTableName = "HAProxy";
    public static HAProxyEntitiesPK = "HAProxyEntities";

    public static async createInstance(api: prunella.IApiClient): Promise<IDataModel> {
        // create model
        const model = new DataModel(api);
        // initialize
        await model.initialize();
        // all done
        return model;
    }

    public api: prunella.IApiClient;
    private data: prunella.IDataModel;
    constructor(api: prunella.IApiClient) {
        this.api = api;
    }
    public async isReady(): Promise<boolean> {
        return Logger.enterAsync<boolean>("DataModel.isReady", async () => {
            return this.data.isReadyState("haproxy-data-model-system-state");
        });
    }

    public async readHAProxies(): Promise<IHAProxyEntity[]> {
        return Logger.enterAsync<IHAProxyEntity[]>("DataModel.readHAProxies", async () => {
            const entities: IHAProxyEntity[] = await this.api.storage.getEntities(
                DataModel.HAProxyTableName, DataModel.HAProxyEntitiesPK);
            return Promise.resolve(entities.map<IHAProxyEntity>((entity) => {
                return HAProxyEntity.fromEntity(entity);
            }));
        });
    }

    public async createHAProxies(states: IHAProxyEntity[]): Promise<void> {
        return Logger.enterAsync<void>("DataModel.createHAProxies", async () => {
            this.api.storage.batchEntities(DataModel.HAProxyTableName, states, (batch, entry) => {
                batch.insertOrReplaceEntity(entry.toEntity("*"));
            });
        });
    }

    public async updateHAProxies(states: IHAProxyEntity[]): Promise<void> {
        return Logger.enterAsync<void>("DataModel.updateHAProxies", async () => {
            this.api.storage.batchEntities(DataModel.HAProxyTableName, states, (batch, entry) => {
                batch.insertOrReplaceEntity(entry.toEntity("*"));
            });
        });
    }

    public async deleteHAProxies(states: IHAProxyEntity[]): Promise<void> {
        return Logger.enterAsync<void>("DataModel.deleteHAProxies", async () => {
            this.api.storage.batchEntities(DataModel.HAProxyTableName, states, (batch, entry) => {
                batch.deleteEntity(entry.toEntity());
            });
        });
    }

    private async initialize(): Promise<void> {
        return Logger.enterAsync<void>("DataModel.initialize", async () => {
            // always create data
            this.data = await prunella.DataModel.createInstance(this.api);
            // see if ready
            const isReady = await this.isReady();
            // check if ready or not so we can init all
            if (!isReady) {
                // create tables
                await this.api.storage.createTable(DataModel.HAProxyTableName);
                // mark as ready
                await this.markReady();
            }
        });
    }

    private async markReady(): Promise<void> {
        return Logger.enterAsync<void>("DataModel.markReady", async () => {
            return this.data.markReadyState("haproxy-data-model-system-state");
        });
    }
}

export { DataModel };

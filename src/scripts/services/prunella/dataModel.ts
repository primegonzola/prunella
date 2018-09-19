/* tslint:disable:max-classes-per-file */
import * as util from "util";

import {
    IDataModel,
    IEnvironment,
    IHashMap,
    IRowEntity,
    IStateEntity,
    IStatusEntity,
} from "./typings";

import { ApiClient } from "./apiClient";
import { HashMap } from "./hashMap";
import { Logger } from "./logger";
import { Resource } from "./resource";

const StateTableName = "State";
const StateEntitiesPK = "StateEntities";
const StatusTableName = "Status";
const StatusEntitiesPK = "StatusEntities";
const ConfigurationTableName = "Configuration";
const ConfigurationEntitiesPK = "ConfigurationEntities";

class EntityRow implements IRowEntity {
    public partitionKey: string;
    public rowKey: string;
    public metadata?: object;
    constructor(partitionKey: string, rowKey: string, metadata?: object) {
        this.partitionKey = partitionKey;
        this.rowKey = rowKey;
        this.metadata = metadata;
    }
}

class StateEntity extends EntityRow implements IStateEntity {
    public static generateRowKey(id: string, type: string, tag: string): string {
        return util.format("%s$$%s$$%s",
            type,
            id.replace(/[\/]/g, "--"),
            tag).toLowerCase();
    }

    public static fromEntity(entity): StateEntity {
        return new StateEntity(
            entity.Id._,
            entity.Type._ as string,
            entity.Tag._,
            entity.CreatedWhen._,
            entity.State._,
            entity[".metadata"],
        );
    }

    public id: string;
    public type: string;
    public createdWhen: Date;
    public tag: string;
    public state: string;
    constructor(
        id: string, type: string, tag: string, createdWhen: Date, state: string, metadata?: object) {
        super(StateEntitiesPK, StateEntity.generateRowKey(id, type, tag), metadata);
        this.id = id;
        this.type = type;
        this.createdWhen = createdWhen;
        this.tag = tag;
        this.state = state;
    }

    public toEntity(etag?: string) {
        const generator = ApiClient.generator();
        const entity = {
            CreatedWhen: generator.DateTime(this.createdWhen),
            Id: generator.String(this.id),
            PartitionKey: generator.String(this.partitionKey),
            RowKey: generator.String(this.rowKey),
            State: generator.String(this.state),
            Tag: generator.String(this.tag),
            Type: generator.String(this.type),
        };
        if (this.metadata !== undefined && this.metadata !== null) {
            entity[".metadata"] = this.metadata;
            if (etag !== undefined) {
                entity[".metadata"].etag = etag;
            }
        }
        return entity;
    }
}

class StatusEntity extends EntityRow implements IStatusEntity {
    public static generateRowKey(id: string, type: string, tag: string): string {
        return util.format("%s$$%s$$%s",
            type,
            id.replace(/[\/]/g, "--"),
            tag).toLowerCase();
    }

    public static fromEntity(entity): StatusEntity {
        return new StatusEntity(
            entity.Id._,
            entity.Type._,
            entity.Tag._,
            entity.ChangedWhen._,
            entity.Status._,
            entity.Timestamp._,
            entity[".metadata"],
        );
    }

    public id: string;
    public type: string;
    public tag: string;
    public changedWhen: Date;
    public status: string;
    public timestamp: Date;
    constructor(
        id: string,
        type: string,
        tag: string,
        changedWhen: Date,
        status: string,
        timestamp?: Date,
        metadata?: object) {
        super(StatusEntitiesPK, StatusEntity.generateRowKey(id, type, tag), metadata);
        this.id = id;
        this.type = type;
        this.tag = tag;
        this.changedWhen = changedWhen;
        this.status = status;
        this.timestamp = timestamp;
    }

    public toEntity(etag?: string) {
        const generator = ApiClient.generator();
        const entity = {
            ChangedWhen: generator.DateTime(this.changedWhen),
            Id: generator.String(this.id),
            PartitionKey: generator.String(this.partitionKey),
            RowKey: generator.String(this.rowKey),
            Status: generator.String(this.status),
            Tag: generator.String(this.tag),
            Type: generator.String(this.type),
        };
        if (this.metadata !== undefined && this.metadata !== null) {
            entity[".metadata"] = this.metadata;
            if (etag !== undefined) {
                entity[".metadata"].etag = etag;
            }
        }
        return entity;
    }
}

class DataModel implements IDataModel {
    public static async createInstance(environment: IEnvironment): Promise<IDataModel> {
        return Logger.enterAsync<DataModel>("DataModel.createInstance", async () => {
            // create instance
            const model = new DataModel(environment);
            // init
            await model.initialize();
            // done
            return model;
        });
    }

    public environment: IEnvironment;

    constructor(environment: IEnvironment) {
        Logger.enter("DataModel.constructor", () => {
            this.environment = environment;
        });
    }

    public async isReady(): Promise<boolean> {
        return Logger.enterAsync<boolean>("DataModel.isReady", async () => {
            return this.isReadyState("data-model-system-state");
        });
    }

    public async isReadyState(name: string): Promise<boolean> {
        return Logger.enterAsync<boolean>("DataModel.isReadyState", async () => {
            // check if table exists
            const exists = await this.environment.api.storage.doesTableExist(ConfigurationTableName);
            // if not then stop here
            if (!exists) { return false; }
            // upsert
            const entity = await this.environment.api.storage.getEntity(
                ConfigurationTableName, ConfigurationEntitiesPK, name);
            // check found
            return Promise.resolve(entity !== null &&
                entity.Value !== undefined && entity.Value !== null &&
                entity.Value._ === "Succeeded");
        });
    }

    public async markReadyState(name: string): Promise<void> {
        return Logger.enterAsync<void>("DataModel.markReadyState", async () => {
            // upsert
            await this.environment.api.storage.upsertEntity(
                ConfigurationTableName, ConfigurationEntitiesPK, name, () => {
                    return {
                        Value: ApiClient.generator().String("Succeeded"),
                    };
                });
        });
    }

    public async fetchStateMap(): Promise<IHashMap> {
        return Logger.enterAsync<IHashMap>("DataModel.fetchStateMap", async () => {
            // fetch all current entries
            const entities = await this.readStates();
            // map them accordinly for easier traversal
            return Promise.resolve(this.mapStateEntities(entities));
        });
    }

    public async upsertState(state: IStateEntity): Promise<void> {
        return Logger.enterAsync<void>("DataModel.upsertState", async () => {
            const rowKey: string = StateEntity.generateRowKey(state.id, state.type, state.tag);
            await this.environment.api.storage.upsertEntity(StateTableName, StateEntitiesPK, rowKey, () => {
                return new StateEntity(
                    state.id, state.type, state.tag, state.createdWhen, state.state, state.metadata).toEntity();
            });
        });
    }

    public async readState(id: string, type: string, tag: string): Promise<IStateEntity> {
        return Logger.enterAsync<IStateEntity>("DataModel.readState", async () => {
            const rowKey: string = StateEntity.generateRowKey(id, type, tag);
            const entity = await this.environment.api.storage.getEntity(
                StateTableName, StateEntitiesPK, rowKey);
            return entity !== null ? StateEntity.fromEntity(entity) : null;
        });
    }

    public async readStates(): Promise<IStateEntity[]> {
        return Logger.enterAsync<IStateEntity[]>("DataModel.readStates", async () => {
            const entities: IStateEntity[] = await this.environment.api.storage.getEntities(
                StateTableName, StateEntitiesPK);
            return Promise.resolve(entities.map<IStateEntity>((entity) => {
                return StateEntity.fromEntity(entity);
            }));
        });
    }

    public async createStates(states: IStateEntity[]): Promise<void> {
        return Logger.enterAsync<void>("DataModel.createStates", async () => {
            this.environment.api.storage.batchEntities(StateTableName, states, (batch, entry) => {
                batch.insertOrReplaceEntity(entry.toEntity("*"));
            });
        });
    }

    public async updateStates(states: IStateEntity[]): Promise<void> {
        return Logger.enterAsync<void>("DataModel.updateStates", async () => {
            this.environment.api.storage.batchEntities(StateTableName, states, (batch, entry) => {
                batch.insertOrReplaceEntity(entry.toEntity("*"));
            });
        });
    }

    public async deleteStates(states: IStateEntity[]): Promise<void> {
        return Logger.enterAsync<void>("DataModel.deleteStates", async () => {
            this.environment.api.storage.batchEntities(StateTableName, states, (batch, entry) => {
                batch.deleteEntity(entry.toEntity());
            });
        });
    }

    public async readStatus(id: string, type: string, tag: string): Promise<IStatusEntity> {
        return Logger.enterAsync<IStatusEntity>("DataModel.readStatus", async () => {
            const rowKey: string = StatusEntity.generateRowKey(id, type, tag);
            const entity = await this.environment.api.storage.getEntity(
                StatusTableName, StatusEntitiesPK, rowKey);
            return entity !== null ? StatusEntity.fromEntity(entity) : null;
        });
    }

    public async readStatuses(): Promise<IStatusEntity[]> {
        return Logger.enterAsync<IStatusEntity[]>("DataModel.readStatuses", async () => {
            const entities: IStatusEntity[] = await this.environment.api.storage.getEntities(
                StatusTableName, StatusEntitiesPK);
            return Promise.resolve(entities.map<IStatusEntity>((entity) => {
                return StatusEntity.fromEntity(entity);
            }));
        });
    }

    public async createStatuses(states: IStatusEntity[]): Promise<void> {
        return Logger.enterAsync<void>("DataModel.createStatuses", async () => {
            this.environment.api.storage.batchEntities(StatusTableName, states, (batch, entry) => {
                batch.insertOrReplaceEntity(entry.toEntity("*"));
            });
        });
    }

    public async updateStatuses(states: IStatusEntity[]): Promise<void> {
        return Logger.enterAsync<void>("DataModel.updateStatuses", async () => {
            this.environment.api.storage.batchEntities(StatusTableName, states, (batch, entry) => {
                batch.insertOrReplaceEntity(entry.toEntity("*"));
            });
        });
    }

    public async deleteStatuses(states: IStatusEntity[]): Promise<void> {
        return Logger.enterAsync<void>("DataModel.deleteStatuses", async () => {
            this.environment.api.storage.batchEntities(StatusTableName, states, (batch, entry) => {
                batch.deleteEntity(entry.toEntity());
            });
        });
    }

    public async upsertStatus(status: IStatusEntity): Promise<void> {
        return Logger.enterAsync<void>("DataModel.upsertStatus", async () => {
            const rowKey: string = StatusEntity.generateRowKey(status.id, status.type, status.tag);
            await this.environment.api.storage.upsertEntity(StatusTableName, StatusEntitiesPK, rowKey, () => {
                return new StatusEntity(
                    status.id, status.type, status.tag, status.changedWhen, status.status).toEntity();
            });
        });
    }

    public async fetchStatusMap(): Promise<IHashMap> {
        return Logger.enterAsync<IHashMap>("DataModel.fetchStatusMap", async () => {
            // fetch all current entries
            const entities = await this.readStatuses();
            // map them accordinly for easier traversal
            return Promise.resolve(this.mapStatusEntities(entities));
        });
    }

    private async initialize(): Promise<void> {
        // see if ready
        const isReady = await this.isReady();
        // check if ready or not so we can init all
        if (!isReady) {
            // create tables
            await this.environment.api.storage.createTable(ConfigurationTableName);
            await this.environment.api.storage.createTable(StateTableName);
            await this.environment.api.storage.createTable(StatusTableName);
            // mark as ready
            await this.markReady();
        }
    }

    private async markReady(): Promise<void> {
        return Logger.enterAsync<void>("DataModel.markReady", async () => {
            return this.markReadyState("data-model-system-state");
        });
    }

    private mapStateEntities(entities: IStateEntity[]): IHashMap {
        return Logger.enter<IHashMap>("DataModel.mapStateEntities", () => {
            const map = new HashMap();
            for (const entity of entities) {
                const resource = new Resource(entity.id);
                if (map.has(resource.subscriptionId) === false) {
                    map.set(resource.subscriptionId, new HashMap());
                }
                if (map.get(resource.subscriptionId).has(resource.resourceGroup) === false) {
                    map.get(resource.subscriptionId).set(resource.resourceGroup, new HashMap());
                }
                if (map.get(resource.subscriptionId).get(resource.resourceGroup).has(resource.name) === false) {
                    map.get(resource.subscriptionId).get(resource.resourceGroup).set(resource.name, new HashMap());
                }
                if (map.get(resource.subscriptionId).get(resource.resourceGroup).get(resource.name)
                    .has(entity.tag) === false) {
                    map.get(resource.subscriptionId).get(resource.resourceGroup).get(resource.name)
                        .set(entity.tag, entity);
                }
            }
            return map;
        });
    }

    private mapStatusEntities(entities: IStatusEntity[]): IHashMap {
        return Logger.enter<IHashMap>("DataModel.mapStatusEntities", () => {
            const map = new HashMap();
            for (const entity of entities) {
                const resource = new Resource(entity.id);
                if (map.has(resource.subscriptionId) === false) {
                    map.set(resource.subscriptionId, new HashMap());
                }
                if (map.get(resource.subscriptionId).has(resource.resourceGroup) === false) {
                    map.get(resource.subscriptionId).set(resource.resourceGroup, new HashMap());
                }
                if (map.get(resource.subscriptionId).get(resource.resourceGroup).has(resource.name) === false) {
                    map.get(resource.subscriptionId).get(resource.resourceGroup).set(resource.name, new HashMap());
                }
                if (map.get(resource.subscriptionId).get(resource.resourceGroup).get(resource.name)
                    .has(entity.tag) === false) {
                    map.get(resource.subscriptionId).get(resource.resourceGroup).get(resource.name)
                        .set(entity.tag, entity);
                }
            }
            return map;
        });
    }
}

// export
export { DataModel, EntityRow, StateEntity, StatusEntity };

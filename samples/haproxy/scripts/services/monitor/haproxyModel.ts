/* tslint:disable:max-classes-per-file */
import * as moment from "moment";
import * as prunella from "prunella";
import * as util from "util";

import {
    EntityRow,
    HashMap,
    IEnvironment,
    IHashMap,
    Logger,
    Resource,
    Utils,
} from "prunella";

import {
    IHAProxyEntity,
    IHAProxyModel,
} from "./typings";

const HAProxyTableName = "HAProxy";
const HAProxyEntitiesPK = "HAProxyEntities";

interface IBackendTarget {
    id: string;
    prefix: string;
}

interface IHAProxyTarget {
    frontend: string;
    backends: IBackendTarget[];
}

class HAProxyTarget implements IHAProxyTarget {
    public static findByFrontId(id: string): IHAProxyTarget {
        // check if valid id
        if (id !== undefined && id !== null) {
            // get targets
            const variable = global.process.env._HAPROXY_TARGETS;
            const targets: IHAProxyTarget[] =
                (variable !== undefined && variable !== null && variable !== "") ? JSON.parse(variable) : null;
            if (targets !== null) {
                for (const target of targets) {
                    if (target.frontend !== undefined && target.frontend !== null) {
                        if (target.frontend.toLowerCase() === id.toLowerCase()) {
                            return target;
                        }
                    }
                }
            }
        }
        // nothing there
        return null;
    }

    public static findByBackId(id: string): IHAProxyTarget {
        // check if valid id
        if (id !== undefined && id !== null) {
            // get targets
            const variable = global.process.env.HAPROXY_TARGETS;
            const targets: IHAProxyTarget[] =
                (variable !== undefined && variable !== null && variable !== "") ? JSON.parse(variable) : null;
            if (targets !== null) {
                for (const target of targets) {
                    if (target.frontend !== undefined && target.frontend !== null) {
                        if (target.backends !== undefined && target.backends !== null) {
                            for (const backend of target.backends) {
                                if (backend.id.toLowerCase() === id.toLowerCase()) {
                                    return target;
                                }
                            }
                        }
                    }
                }
            }
        }
        // nothing there
        return null;
    }

    public grace: number;
    public frontend: string;
    public backends: IBackendTarget[];

    constructor(frontend: string, backends: IBackendTarget[], grace = 0) {
        this.grace = grace;
        this.frontend = frontend;
        this.backends = backends;
    }
}

class HAProxyEntity extends EntityRow implements IHAProxyEntity {
    public static generateRowKey(id: string, type: string, tag: string): string {
        return util.format("%s$$%s$$%s",
            type,
            id.replace(/[\/]/g, "--"),
            tag).toLowerCase();
    }

    public static fromEntity(entity): HAProxyEntity {
        return new HAProxyEntity(
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
    public tag: string;
    public state: string;
    public createdWhen: Date;
    constructor(
        id: string, type: string, tag: string, createdWhen: Date, state: string, metadata?: object) {
        super(HAProxyEntitiesPK, HAProxyEntity.generateRowKey(id, type, tag), metadata);
        this.id = id;
        this.type = type;
        this.tag = tag;
        this.createdWhen = createdWhen;
        this.state = state;
    }

    public toEntity(etag?: string) {
        const generator = prunella.Utils.createTableGenerator();
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

class HAProxyModel implements IHAProxyModel {
    public static async createInstance(environment: IEnvironment): Promise<IHAProxyModel> {
        // create model
        const model = new HAProxyModel(environment);
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
        return Logger.enterAsync<boolean>("HAProxyModel.isReady", async () => {
            return this.environment.data.isReadyState("haproxy-model-system-state");
        });
    }

    public async readHAProxies(): Promise<IHAProxyEntity[]> {
        return Logger.enterAsync<IHAProxyEntity[]>("HAProxyModel.readHAProxies", async () => {
            const entities: IHAProxyEntity[] = await this.environment.api.storage.getEntities(
                HAProxyTableName, HAProxyEntitiesPK);
            return Promise.resolve(entities.map<IHAProxyEntity>((entity) => {
                return HAProxyEntity.fromEntity(entity);
            }));
        });
    }

    public async createHAProxies(states: IHAProxyEntity[]): Promise<void> {
        return Logger.enterAsync<void>("DataModel.createHAProxies", async () => {
            this.environment.api.storage.batchEntities(HAProxyTableName, states, (batch, entry) => {
                batch.insertOrReplaceEntity(entry.toEntity("*"));
            });
        });
    }

    public async updateHAProxies(states: IHAProxyEntity[]): Promise<void> {
        return Logger.enterAsync<void>("DataModel.updateHAProxies", async () => {
            this.environment.api.storage.batchEntities(HAProxyTableName, states, (batch, entry) => {
                batch.insertOrReplaceEntity(entry.toEntity("*"));
            });
        });
    }

    public async deleteHAProxies(states: IHAProxyEntity[]): Promise<void> {
        return Logger.enterAsync<void>("DataModel.deleteHAProxies", async () => {
            this.environment.api.storage.batchEntities(HAProxyTableName, states, (batch, entry) => {
                batch.deleteEntity(entry.toEntity());
            });
        });
    }
    public async update(): Promise<void> {
        return Logger.enterAsync<void>("HAProxyModel.update", async () => {
            // check if ready
            if (await this.isReady()) {
                // always clean up first
                await this.cleanHAProxies();
                // check all entries
                await this.checkHAproxies();
                // generate configuration
                await this.generateHAproxies();
            }
        });
    }

    private async generateHAproxies(): Promise<void> {
        return Logger.enterAsync<void>("HAProxyModel.generateHAproxies", async () => {
            // final config
            const configs = new HashMap();
            // get all proxies
            const proxies = await this.readHAProxies();
            // go over each proxy
            for (const proxy of proxies) {
                // check if proxy is back end
                const target = HAProxyTarget.findByBackId(proxy.id);
                // if found
                if (target !== null) {
                    // get managed resource
                    const resource = new Resource(proxy.id);
                    // see if config is there, if not add
                    if (!configs.has(target.frontend)) {
                        // add
                        configs.set(target.frontend, "");
                    }
                    // get last config
                    let last = configs.get(target.frontend);
                    // add new entry
                    last = last + util.format("server %s %s:80 check\n",
                        util.format("vmss--%s--%s--%s--%s--%s--%s",
                            resource.subscriptionId, resource.resourceGroup, resource.name,
                            proxy.tag, proxy.state,
                            moment(proxy.createdWhen).format("YYYY-MM-DDTHH:mm:ss")),
                        proxy.state);
                    // update
                    configs.set(target.frontend, last);
                }
            }
            // calls
            const calls = [];
            // loop over various configs collected
            configs.each((id: string, config: string) => {
                // add for late
                calls.push(this.environment.api.storage.writeText(
                    "configuration", "template" + id + "/latest.cfg", config));
            });
            // check if any calls found
            if (calls.length > 0) {
                // execute them
                await Promise.all(calls);
            }
        });
    }

    private async cleanHAProxies(): Promise<void> {
        return Logger.enterAsync<void>("HAProxyModel.cleanHAProxies", async () => {
            // get both
            const results = await Promise.all([
                this.readHAProxies(),
                this.environment.data.fetchStateMap(),
            ]);
            // final calls to be made
            const calls = [];
            // get status map
            const proxies: IHAProxyEntity[] = results[0];
            // get state map
            const stateMap: IHashMap = results[1];
            // the deletes to do
            const deletes: IHAProxyEntity[] = [];
            // loop over each proxy
            for (const proxy of proxies) {
                // check if found as backend
                const target = HAProxyTarget.findByBackId(proxy.id);
                // if not found delete it
                if (target === null) {
                    // clean up
                    deletes.push(proxy);
                } else {
                    // get as managed resource
                    const resource = new Resource(proxy.id);
                    // check if found in state map
                    if (stateMap.has(resource.subscriptionId) &&
                        stateMap.get(resource.subscriptionId).has(resource.resourceGroup) &&
                        stateMap.get(resource.subscriptionId).get(resource.resourceGroup).has(resource.name) &&
                        stateMap.get(resource.subscriptionId).get(resource.resourceGroup).
                            get(resource.name).has(proxy.tag)) {
                        // get found state
                        const state = stateMap.get(resource.subscriptionId).get(resource.resourceGroup).
                            get(resource.name).get(proxy.tag);
                        // check if succeeded
                        if (state.state !== "Succeeded") {
                            // clean up
                            deletes.push(proxy);
                        }
                    } else {
                        // not found delete
                        deletes.push(proxy);
                    }
                }
            }
            // see if any deletes to do
            if (deletes.length > 0) {
                await this.deleteHAProxies(deletes);
            }
        });
    }

    private async checkHAproxies(): Promise<void> {
        return Logger.enterAsync<void>("HAProxyModel.cleanHAProxies", async () => {
            // get both maps
            const results = await Promise.all([
                this.fetchHAProxyMap(),
                this.environment.data.fetchStateMap(),
            ]);
            // final calls to be made
            const calls = [];
            // get status map
            const proxyMap: IHashMap = results[0];
            // get state map
            const stateMap: IHashMap = results[1];
            // deletes to do
            const creates: IHAProxyEntity[] = [];
            const updates: IHAProxyEntity[] = [];
            const deletes: IHAProxyEntity[] = [];
            const nicMap: IHashMap = new HashMap();
            // loop over each state
            stateMap.each((subKey: any, subValue: any) => {
                subValue.each((rgKey: string, rgValue: any) => {
                    rgValue.each((typeKey: string, typeValue: any) => {
                        typeValue.each((tagKey: string, state: prunella.IStateEntity) => {
                            // look up in proxy map
                            if (proxyMap.has(subKey) &&
                                proxyMap.get(subKey).has(rgKey) &&
                                proxyMap.get(subKey).get(rgKey).has(typeKey) &&
                                proxyMap.get(subKey).get(rgKey).get(typeKey).has(state.tag)) {
                                // get found proxy
                                const proxy = proxyMap.get(subKey).get(rgKey).get(typeKey).get(state.tag);
                                // check state and delete if not succeeded
                                if (state.state !== "Succeeded") {
                                    // clean up and delete
                                    deletes.push(proxy);
                                }
                            } else {
                                // add if succeeded
                                if (state.state === "Succeeded") {
                                    // add if a backend
                                    const target = HAProxyTarget.findByBackId(state.id);
                                    // see if one is found
                                    if (target !== null) {
                                        // add new one
                                        creates.push(new HAProxyEntity(
                                            state.id,
                                            state.type,
                                            state.tag,
                                            new Date(),
                                            "UNKNOWN",
                                        ));
                                    }
                                }
                            }
                        });
                    });
                });
            });
            // check what to create
            if (creates.length > 0) {
                const finals: IHAProxyEntity[] = [];
                // special case for creates
                for (const create of creates) {
                    // check if nic map already exists
                    if (!nicMap.has(create.id)) {
                        // create managed resource
                        const resource = new Resource(create.id);
                        // add both call results to map
                        nicMap.set(create.id, await Promise.all([
                            await this.environment.api.compute.
                                virtualMachineScaleSets.listVirtualMachines(
                                    resource.resourceGroup, resource.name),
                            this.environment.api.compute.
                                virtualMachineScaleSets.listVirtualMachineNetworkInterfaces(
                                    resource.resourceGroup, resource.name),
                        ]));
                    }
                    // get lists from map
                    const lists = nicMap.get(create.id);
                    // see if we find
                    const vm = Utils.findObject(lists[0], "instanceId", create.tag);
                    // see if found
                    if (vm !== null) {
                        // get nic
                        const nic = this.environment.api.compute.
                            virtualMachineScaleSets.findVirtualMachineNetworkInterface(lists[1], vm);
                        // see if found
                        if (nic !== null) {
                            // update create
                            create.state = nic.properties.ipConfigurations[0].properties.privateIPAddress.toString();
                            // add it to final list
                            finals.push(create);
                        }
                    }
                }
                // see in the end something needs to be created
                if (finals.length > 0) {
                    // create all
                    calls.push(this.createHAProxies(finals));
                }
            }
            if (updates.length > 0) {
                calls.push(this.updateHAProxies(updates));
            }
            if (deletes.length > 0) {
                calls.push(this.deleteHAProxies(deletes));
            }
            // process crud if needed
            if (calls.length > 0) {
                // do the  calls
                await Promise.all(calls);
            }
        });
    }

    private async initialize(): Promise<void> {
        return Logger.enterAsync<void>("HAProxyModel.initialize", async () => {
            // see if ready
            const isReady = await this.isReady();
            // check if ready or not so we can init all
            if (!isReady) {
                // create tables
                await this.environment.api.storage.createTable(HAProxyTableName);
                // mark as ready
                await this.markReady();
            }
        });
    }

    private async markReady(): Promise<void> {
        return Logger.enterAsync<void>("HAProxyModel.markReady", async () => {
            return this.environment.data.markReadyState("haproxy-model-system-state");
        });
    }

    private async fetchHAProxyMap(): Promise<IHashMap> {
        return Logger.enterAsync<IHashMap>("DataModel.fetchHAProxyMap", async () => {
            // fetch all current entries
            const entities = await this.readHAProxies();
            // map them accordinly for easier traversal
            return Promise.resolve(this.mapHAProxyEntities(entities));
        });
    }

    private mapHAProxyEntities(entities: IHAProxyEntity[]): IHashMap {
        return Logger.enter<IHashMap>("HAProxyModel.mapStateEntities", () => {
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

export { HAProxyModel };

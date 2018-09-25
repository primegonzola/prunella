/* tslint:disable:max-classes-per-file */
import * as moment from "moment";
import * as util from "util";

import {
    HashMap,
    IEnvironment,
    IHashMap,
    IStateEntity,
    Logger,
    Resource,
    StatusTarget,
    Utils,
} from "prunella";

import {
    IDataModel,
    IHAProxyEntity,
    IHAProxyModel,
} from "./typings";

import { DataModel } from "./dataModel";
import { HAProxyEntity } from "./haproxyEntity";
import { HAProxyTarget } from "./haproxyTarget";

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
    private data: IDataModel;
    constructor(environment: IEnvironment) {
        this.environment = environment;
    }
    public async isReady(): Promise<boolean> {
        return Logger.enterAsync<boolean>("HAProxyModel.isReady", async () => {
            return this.environment.data.isReadyState("haproxy-application-model-system-state");
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
            // get all entities
            const entities = await this.data.readHAProxies();
            // go over each entity
            for (const entity of entities) {
                // check if entity is back end and status
                const status = StatusTarget.getByResourceId(entity.id);
                const target = HAProxyTarget.getByBackendId(entity.id);
                // if found
                if (status !== null && target !== null) {
                    // see if any grace period enabled
                    if (status.grace > 0) {
                        // don"t do anything if not paased grace period
                        if (entity.createdWhen.getTime() + (status.grace * 1000) <= Date.now()) {
                            break;
                        }
                    }
                    // get managed resource
                    const resource = new Resource(entity.id);
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
                            entity.tag, entity.state,
                            moment(entity.createdWhen).format("YYYY-MM-DDTHH:mm:ss")),
                        entity.state);
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
                this.data.readHAProxies(),
                this.environment.data.fetchStateMap(),
            ]);
            // final calls to be made
            const calls = [];
            // get status map
            const entities: IHAProxyEntity[] = results[0];
            // get state map
            const stateMap: IHashMap = results[1];
            // the deletes to do
            const deletes: IHAProxyEntity[] = [];
            // loop over each entity
            for (const entity of entities) {
                // check if found as backend
                const target = HAProxyTarget.getByBackendId(entity.id);
                // if not found delete it
                if (target === null) {
                    // clean up
                    deletes.push(entity);
                } else {
                    // get as managed resource
                    const resource = new Resource(entity.id);
                    // check if found in state map
                    if (stateMap.has(resource.subscriptionId) &&
                        stateMap.get(resource.subscriptionId).has(resource.resourceGroup) &&
                        stateMap.get(resource.subscriptionId).get(resource.resourceGroup).has(resource.name) &&
                        stateMap.get(resource.subscriptionId).get(resource.resourceGroup).
                            get(resource.name).has(entity.tag)) {
                        // get found state
                        const state = stateMap.get(resource.subscriptionId).get(resource.resourceGroup).
                            get(resource.name).get(entity.tag);
                        // check if succeeded
                        if (state.state !== "Succeeded") {
                            // clean up
                            deletes.push(entity);
                        }
                    } else {
                        // not found delete
                        deletes.push(entity);
                    }
                }
            }
            // see if any deletes to do
            if (deletes.length > 0) {
                await this.data.deleteHAProxies(deletes);
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
                        typeValue.each((tagKey: string, state: IStateEntity) => {
                            // look up in proxy map
                            if (proxyMap.has(subKey) &&
                                proxyMap.get(subKey).has(rgKey) &&
                                proxyMap.get(subKey).get(rgKey).has(typeKey) &&
                                proxyMap.get(subKey).get(rgKey).get(typeKey).has(state.tag)) {
                                // get found entity
                                const entity = proxyMap.get(subKey).get(rgKey).get(typeKey).get(state.tag);
                                // check state and delete if not succeeded
                                if (state.state !== "Succeeded") {
                                    // clean up and delete
                                    deletes.push(entity);
                                }
                            } else {
                                // add if succeeded
                                if (state.state === "Succeeded") {
                                    // check if found as status target
                                    const status = StatusTarget.getByResourceId(state.id);
                                    // add if a backend
                                    const target = HAProxyTarget.getByBackendId(state.id);
                                    // assure both are valid
                                    if (status !== null && target !== null) {
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
                    calls.push(this.data.createHAProxies(finals));
                }
            }
            if (updates.length > 0) {
                calls.push(this.data.updateHAProxies(updates));
            }
            if (deletes.length > 0) {
                calls.push(this.data.deleteHAProxies(deletes));
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
            // always create data model
            this.data = await DataModel.createInstance(this.environment.api);
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
        return Logger.enterAsync<void>("HAProxyModel.markReady", async () => {
            return this.environment.data.markReadyState("haproxy-application-model-system-state");
        });
    }

    private async fetchHAProxyMap(): Promise<IHashMap> {
        return Logger.enterAsync<IHashMap>("DataModel.fetchHAProxyMap", async () => {
            // fetch all current entries
            const entities = await this.data.readHAProxies();
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

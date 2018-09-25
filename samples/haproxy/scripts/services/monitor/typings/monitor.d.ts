/* tslint:disable:max-classes-per-file */
import * as prunella from "prunella";

export interface IHAProxyModel {
    environment: prunella.IEnvironment;
    update(): Promise<void>;
}

export interface IBackendTarget {
    id: string;
    prefix: string;
}

export interface IHAProxyTarget {
    frontend: string;
    backends: IBackendTarget[];
}

export interface IHAProxyEntity extends prunella.IRowEntity {
    id: string;
    type: string;
    tag: string;
    state: string;
    createdWhen: Date;
}

export declare class HAProxyModel implements IHAProxyModel {
    public static createInstance(data: prunella.IEnvironment): Promise<IHAProxyModel>;
    public environment: prunella.IEnvironment;
    public update(): Promise<void>;
}

export interface IDataModel {
    readHAProxies(): Promise<IHAProxyEntity[]>;
    createHAProxies(states: IHAProxyEntity[]): Promise<void>;
    updateHAProxies(states: IHAProxyEntity[]): Promise<void>;
    deleteHAProxies(states: IHAProxyEntity[]): Promise<void>;
}

export declare class DataModel implements IDataModel {
    public static createInstance(api: prunella.IApiClient): Promise<IDataModel>;
    public createHAProxies(states: IHAProxyEntity[]): Promise<void>;
    public readHAProxies(): Promise<IHAProxyEntity[]>;
    public updateHAProxies(states: IHAProxyEntity[]): Promise<void>;
    public deleteHAProxies(states: IHAProxyEntity[]): Promise<void>;
}

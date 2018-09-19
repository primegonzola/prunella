import { IEnvironment, IRowEntity } from "prunella";

export interface IHAProxyModel {
    environment: IEnvironment;
    update(): Promise<void>;
}

export interface IHAProxyEntity extends IRowEntity {
    id: string;
    type: string;
    tag: string;
    state: string;
    createdWhen: Date;
}

export declare class HAProxyModel implements IHAProxyModel {
    public static createInstance(data: IEnvironment): Promise<IHAProxyModel>;
    public environment: IEnvironment;
    public update(): Promise<void>;
}

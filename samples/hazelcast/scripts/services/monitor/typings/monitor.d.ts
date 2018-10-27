/* tslint:disable:max-classes-per-file */
import * as prunella from "prunella";

export interface IHazelcastModel {
    environment: prunella.IEnvironment;
    update(): Promise<void>;
}

export declare class HazelcastModel implements IHazelcastModel {
    public static createInstance(data: prunella.IEnvironment): Promise<IHazelcastModel>;
    public environment: prunella.IEnvironment;
    public update(): Promise<void>;
}

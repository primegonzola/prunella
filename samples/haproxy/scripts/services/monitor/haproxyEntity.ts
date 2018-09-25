import * as prunella from "prunella";
import * as util from "util";

import { DataModel } from "./dataModel";
import { IHAProxyEntity } from "./typings";

class HAProxyEntity extends prunella.RowEntity implements IHAProxyEntity {
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
        super(DataModel.HAProxyEntitiesPK, HAProxyEntity.generateRowKey(id, type, tag), metadata);
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

export { HAProxyEntity };

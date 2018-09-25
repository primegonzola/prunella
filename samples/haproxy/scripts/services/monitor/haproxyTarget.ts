import {
    IBackendTarget,
    IHAProxyTarget,
} from "./typings";

class HAProxyTarget implements IHAProxyTarget {
    public static getByBackendId(id: string): IHAProxyTarget {
        // check if valid id
        if (id !== undefined && id !== null) {
            // get targets
            for (const target of HAProxyTarget.targets) {
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
        // nothing there
        return null;
    }

    public static getBackendTarget(id: string): IBackendTarget {
        // check if valid id
        if (id !== undefined && id !== null) {
            // get targets
            for (const target of HAProxyTarget.targets) {
                if (target.backends !== undefined && target.backends !== null) {
                    for (const backend of target.backends) {
                        if (backend.id.toLowerCase() === id.toLowerCase()) {
                            return backend;
                        }
                    }
                }
            }
        }
        // nothing there
        return null;
    }

    private static targetList: IHAProxyTarget[];
    public frontend: string;
    public backends: IBackendTarget[];

    constructor(frontend: string, backends: IBackendTarget[]) {
        this.frontend = frontend;
        this.backends = backends;
    }

    public static get targets(): IHAProxyTarget[] {
        if (HAProxyTarget.targetList === undefined || HAProxyTarget.targetList === null) {
            const variable = global.process.env.HAPROXY_TARGETS;
            HAProxyTarget.targetList =
                (variable !== undefined && variable !== null && variable !== "") ? JSON.parse(variable) : [];
        }
        return HAProxyTarget.targetList;
    }
}

export { HAProxyTarget };

// add imports here
import * as prunella from "prunella";
import { HAProxyModel } from "./haproxyModel";

// function entry point
export function index(context: prunella.IContext, data: any) {
    // always create environment first
    prunella.Environment.createInstance(context).then(async (environment) => {
        // check if application model is enabled
        if (prunella.Environment.isEnabled()) {
            // check environment
            switch (environment.name) {
                case "monitor-haproxy": {
                    // get timer
                    const timer: prunella.IFunctionTimer = data;
                    // // check timer
                    if (timer.isPastDue && !prunella.Utils.isDebug()) {
                        environment.logger.warn("timer is running late");
                    }
                    // create the model
                    const model = await HAProxyModel.createInstance(environment);
                    // update
                    await model.update();
                    break;
                }
                default:
                    throw new Error("unknown module detected : " + environment.name);
            }
            // all done
            context.done();
        } else {
            // not enabled yet
            environment.logger.warn("model not enabled.");
            // all done
            context.done();
        }
    }).catch((reason) => {
        // something really bad happened
        context.log(
            "function completed unsuccessfully: " +
            JSON.stringify(reason) +
            " " +
            JSON.stringify(reason.stack));
        // all done
        context.done();
    });
}

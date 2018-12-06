// add imports here
import * as prunella from "prunella";

// function entry point
export function index(context: prunella.IContext, data: any) {
    // always create environment first
    prunella.Environment.createInstance(context).then(async (environment) => {
        // check if  enabled
        if (prunella.Environment.isEnabled()) {
            // check environment
            switch (environment.name) {
                case "monitor-state": {
                    // get timer
                    const timer: prunella.IFunctionTimer = data;
                    // // check timer
                    if (timer.isPastDue && !prunella.Utils.isDebug()) {
                        environment.logger.warn("timer is running late");
                    }
                    // update model
                    await environment.application.state();
                    break;
                }
                case "monitor-status": {
                    // get timer
                    const timer: prunella.IFunctionTimer = data;
                    // // check timer
                    if (timer.isPastDue && !prunella.Utils.isDebug()) {
                        environment.logger.warn("timer is running late");
                    }
                    // update model
                    await environment.application.status();
                    break;
                }
                case "monitor-events": {
                    // get event
                    const event: prunella.IFunctionEvent = data;
                    // process event
                    await environment.application.event({
                        data: event.data,
                        eventType: event.eventType,
                        subject: event.subject,
                        topic: event.topic,
                    });
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

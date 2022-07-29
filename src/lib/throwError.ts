import * as error from "N/error";
import * as log from "N/log";

export function throwError(message: string, name: string = ""): never {
    const errorObj = error.create({ name, message, notifyOff: false });
    log.error({ title: "", details: errorObj });
    throw new Error(errorObj.message);
}

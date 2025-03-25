
export class Logger {
    private static enable: boolean = true;
    public static setEnable(enable: boolean) {
        Logger.enable = enable;
    }

    public static log(message?: any, ...optionalParams: any[]) {
        if (Logger.enable) {
            console.log(message, ...optionalParams);
        }
    }

    public static debug(message?: any, ...optionalParams: any[]) {
        if (Logger.enable) {
            console.debug(message, ...optionalParams);
        }
    }

    public static error(message?: any, ...optionalParams: any[]) {
        if (Logger.enable) {
            console.error(message, ...optionalParams);
        }
    }

    public static warn(message?: any, ...optionalParams: any[]) {
        if (Logger.enable) {
            console.warn(message, ...optionalParams);
        }
    }

    public static info(message?: any, ...optionalParams: any[]) {
        if (Logger.enable) {
            console.info(message, ...optionalParams);
        }   
    }
}
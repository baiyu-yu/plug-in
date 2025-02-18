import { ImageConfig } from "./config_image";
import { LogConfig } from "./config_log";
import { MessageConfig } from "./config_message";
import { ReceivedConfig } from "./config_received";
import { ReplyConfig } from "./config_reply";
import { RequestConfig } from "./config_request";
import { ToolConfig } from "./config_tool";

export class ConfigManager {
    static ext: seal.ExtInfo;
    static cache: {
        [key: string]: {
            timestamp: number,
            data: any
        }
    } = {}

    static register() {
        LogConfig.register();
        RequestConfig.register();
        MessageConfig.register();
        ToolConfig.register();
        ReceivedConfig.register();
        ReplyConfig.register();
        ImageConfig.register();
    }

    static getCache(key: string, getFunc: () => any) {
        const timestamp = Date.now()
        if (this.cache?.[key] && timestamp - this.cache[key].timestamp < 3000) {
            return this.cache[key].data;
        }

        const data = getFunc();
        this.cache[key] = {
            timestamp: timestamp,
            data: data
        }

        return data;
    }

    static get log() { return this.getCache('log', LogConfig.get) }
    static get request() { return this.getCache('request', RequestConfig.get) }
    static get message() { return this.getCache('message', MessageConfig.get) }
    static get tool() { return this.getCache('tool', ToolConfig.get) }
    static get received() { return this.getCache('received', ReceivedConfig.get) }
    static get reply() { return this.getCache('reply', ReplyConfig.get) }
    static get image() { return this.getCache('image', ImageConfig.get) }
}
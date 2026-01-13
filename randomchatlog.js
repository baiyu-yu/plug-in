// ==UserScript==
// @name         Random Chat Logger
// @author       白鱼 
// @version      1.3.0
// @description  随机记录群友发言。使用.chatlog help 查看帮助。\n！！！如果输出角色卡相关指令请先确保在该群【.ext randomChatLogger on】！！！\nv1.3.0: 添加抓取图片持久化功能，添加当前群设置状态查看命令chatlog status \nv1.2.2: 修改为抓取时过滤正则，防止产生空消息 \n v1.2.1: 允许群内关闭前缀 \n v1.2.0:添加更多群内设置，允许群内清除记录，logon自动暂停发送，调整数据库结构
// @timestamp    1763728841
// @license      MIT
// @homepageURL  https://github.com/sealdice/javascript
// @updateUrl    https://raw.githubusercontent.com/baiyu-yu/plug-in/main/randomchatlog.js
// @sealVersion  1.4.5
// ==/UserScript==

if (!seal.ext.find('randomChatLogger')) {
    const ext = seal.ext.new('randomChatLogger', 'baiyu', '1.3.0');
    seal.ext.register(ext);

    const CONFIG = {
        MSG_ON: "开启记录回复语",
        MSG_OFF: "关闭记录回复语",
        REC_FREQ: "记录频率（秒）",
        SEND_FREQ: "发送频率（秒）",
        PREFIX: "消息前缀",
        REGEX: "消息内容正则过滤",
        CATCH_IMAGES: "是否允许抓取图片",
        BASE64BACKEND: "图片Base64转换后端"
    };

    seal.ext.registerStringConfig(ext, CONFIG.MSG_ON, "记录已开启");
    seal.ext.registerStringConfig(ext, CONFIG.MSG_OFF, "记录已关闭");
    seal.ext.registerStringConfig(ext, CONFIG.REC_FREQ, "60");
    seal.ext.registerStringConfig(ext, CONFIG.SEND_FREQ, "300");
    seal.ext.registerStringConfig(ext, CONFIG.PREFIX, "随机记录: ");
    seal.ext.registerTemplateConfig(ext, CONFIG.REGEX, [
        "\\[CQ:at,qq=[^\\]]*\\]",
        "\\[CQ:reply,id=[^\\]]*\\]",
        "\\[CQ:image,[^\\]]*\\]"
    ], "替换匹配到的文本为空字符串");
    seal.ext.registerBoolConfig(ext, CONFIG.CATCH_IMAGES, false, "开启后会允许将抓取的图片存入本地持久化储存，每个群需要可以单独开关，移动端和远程分离部署暂时无法使用");
    seal.ext.registerStringConfig(ext, CONFIG.BASE64BACKEND, "https://urltobase64.fishwhite.top", "开启抓取图片后必须配置该地址，中央服务不保证长久，坏了可自部署");

    class DataManager {
        static getQueue(id) {
            try {
                const data = ext.storageGet(`logQueue_${id}`);
                return data ? JSON.parse(data) : [];
            } catch (e) { return []; }
        }

        static saveQueue(id, queue) {
            ext.storageSet(`logQueue_${id}`, JSON.stringify(queue));
        }

        static getStateMap() {
            try {
                const data = ext.storageGet("logStateMap");
                return data ? JSON.parse(data) : {};
            } catch (e) { return {}; }
        }

        static saveStateMap(map) {
            ext.storageSet("logStateMap", JSON.stringify(map));
        }

        static getGroupConfig(id) {
            try {
                const data = ext.storageGet(`groupConfig_${id}`);
                return data ? JSON.parse(data) : {};
            } catch (e) { return {}; }
        }

        static setGroupConfig(id, config) {
            const current = this.getGroupConfig(id);
            const newConfig = { ...current, ...config };
            ext.storageSet(`groupConfig_${id}`, JSON.stringify(newConfig));
        }

        static clearGroupConfig(id) {
            ext.storageSet(`groupConfig_${id}`, "");
        }
    }


    class ImageHelper {
        static async urlToBase64(url) {
            const backendUrl = seal.ext.getStringConfig(ext, CONFIG.BASE64BACKEND);
            if (!backendUrl) return null;

            try {
                // 去除末尾斜杠
                const cleanUrl = backendUrl.replace(/\/$/, '');
                const response = await fetch(`${cleanUrl}/image-to-base64`, {
                    method: 'POST',
                    headers: {
                        "Content-Type": "application/json",
                        "Accept": "application/json"
                    },
                    body: JSON.stringify({ url: url })
                });

                if (!response.ok) {
                    const text = await response.text();
                    console.error(`[randomChatLogger] fetch图片失败: ${response.status} ${text}`);
                    return null;
                }

                const data = await response.json();
                if (data.error) {
                    console.error(`[randomChatLogger] base64转换后端api响应错误: ${data.error.message}`);
                    return null;
                }
                
                return data.base64;
            } catch (error) {
                console.error("[randomChatLogger] urlToBase64网络错误:", error);
                return null;
            }
        }
        
        static extractImageUrls(msg) {
            const urls = [];
            // 匹配CQ:image并提取file参数
            const regex = /\[CQ:image,[^\]]*file=([^,\]]+)[^\]]*\]/g;
            let match;
            while ((match = regex.exec(msg)) !== null) {
                urls.push(match[1]);
            }
            return urls;
        }
    }

    class PassiveTimer {
        static stateMap = {}; 
        static lastRecordMap = {};
        static lastSendMap = {};

        static init() {
            this.stateMap = DataManager.getStateMap();

            try {
                this.lastRecordMap = JSON.parse(ext.storageGet("lastRecordTimeMap") || "{}");
                this.lastSendMap = JSON.parse(ext.storageGet("lastSendTimeMap") || "{}");
            } catch (e) {}
        }

        static saveState() {
            DataManager.saveStateMap(this.stateMap);
        }

        static saveRecordTime(id) {
            this.lastRecordMap[id] = Date.now();
            ext.storageSet("lastRecordTimeMap", JSON.stringify(this.lastRecordMap));
        }

        static saveSendTime(id) {
            this.lastSendMap[id] = Date.now();
            ext.storageSet("lastSendTimeMap", JSON.stringify(this.lastSendMap));
        }

        static setEnable(id, bool) {
            this.stateMap[id] = bool;
            this.saveState();
        }

        static async tick(ctx, msg, id) {
            if (!this.stateMap[id]) return;

            const now = Date.now();

            const groupCfg = DataManager.getGroupConfig(id);
            const defaultRecFreq = parseInt(seal.ext.getStringConfig(ext, CONFIG.REC_FREQ)) * 1000;
            const recFreq = groupCfg.recFreq !== undefined ? parseInt(groupCfg.recFreq) * 1000 : defaultRecFreq;
            
            if (!this.lastRecordMap[id] || now - this.lastRecordMap[id] >= recFreq) {
                let messageContent = msg.message || "";
                let savedImages = [];

                const globalCatch = seal.ext.getBoolConfig(ext, CONFIG.CATCH_IMAGES);
                const groupCatch = groupCfg.catchImages === true;

                if (globalCatch && groupCatch) {
                    const imageUrls = ImageHelper.extractImageUrls(messageContent);
                    for (const url of imageUrls) {
                        const base64 = await ImageHelper.urlToBase64(url);
                        if (base64) savedImages.push(base64);
                    }
                }

                // 过滤文本
                const regexConfigs = seal.ext.getTemplateConfig(ext, CONFIG.REGEX);
                if (Array.isArray(regexConfigs)) {
                    regexConfigs.forEach(cfg => {
                        try { messageContent = messageContent.replace(new RegExp(cfg, "g"), ""); } catch (e) {}
                    });
                }

                if ((messageContent && messageContent.trim()) || savedImages.length > 0) {
                    const queue = DataManager.getQueue(id);
                    queue.push({ 
                        nickname: msg.sender.nickname, 
                        message: messageContent,
                        images: savedImages 
                    });
                    DataManager.saveQueue(id, queue);
                    this.saveRecordTime(id);
                }
            }

            if (ctx.group.logOn) {
                return;
            }

            const defaultSendFreq = parseInt(seal.ext.getStringConfig(ext, CONFIG.SEND_FREQ)) * 1000;
            const sendFreq = groupCfg.sendFreq !== undefined ? parseInt(groupCfg.sendFreq) * 1000 : defaultSendFreq;
            if (!this.lastSendMap[id] || now - this.lastSendMap[id] >= sendFreq) {
                const queue = DataManager.getQueue(id);
                
                if (queue && queue.length > 0) {
                    const randomIndex = Math.floor(Math.random() * queue.length);
                    const logItem = queue[randomIndex];
                    
                    // 抽出后删除
                    queue.splice(randomIndex, 1);
                    DataManager.saveQueue(id, queue);

                    this.sendResponse(ctx, msg, id, logItem);
                    this.saveSendTime(id);
                }
            }
        }

        static sendResponse(ctx, msg, id, logItem) {
            let filteredMsg = logItem.message;
            const regexConfigs = seal.ext.getTemplateConfig(ext, CONFIG.REGEX);
            if (Array.isArray(regexConfigs)) {
                regexConfigs.forEach(cfg => {
                    try { filteredMsg = filteredMsg.replace(new RegExp(cfg, "g"), ""); } catch (e) {}
                });
            }
            
            const hasImages = logItem.images && logItem.images.length > 0;
            if (!filteredMsg.trim() && !hasImages) return;

            const globalPrefix = seal.ext.getStringConfig(ext, CONFIG.PREFIX);
            const groupCfg = DataManager.getGroupConfig(id);
            
            const prefix = groupCfg.prefix !== undefined ? groupCfg.prefix : globalPrefix;
            const showName = groupCfg.showName !== undefined ? groupCfg.showName : true;

            let finalMsg = showName 
                ? `${prefix}${logItem.nickname}: ${filteredMsg}` 
                : `${prefix}${filteredMsg}`;

            if (hasImages) {
                for (const base64 of logItem.images) {
                    try {
                        const imagePath = seal.base64ToImage(base64);
                        finalMsg += `[CQ:image,file=${imagePath}]`;
                    } catch (e) {
                        console.error("[randomChatLogger] base64转换为本地图片失败", e);
                    }
                }
            }

            seal.replyToSender(ctx, msg, finalMsg);
        }
    }


    PassiveTimer.init();

    const cmd = seal.ext.newCmdItemInfo();
    cmd.name = 'chatlog';
    cmd.help = `随机复读机控制：
.chatlog on/off  - 开启/关闭
.chatlog clear   - 清空当前群记录
.chatlog set prefix <内容> - 设置本群前缀（使用 on/off 开启/关闭前缀）
.chatlog set name <on/off> - 是否显示昵称
.chatlog set recfreq <秒> - 设置本群记录频率
.chatlog set sendfreq <秒> - 设置本群发送频率
.chatlog set catchimg <on/off> - 设置是否抓取图片（需要插件配置项允许的前提下才能开启）
.chatlog set default - 重置本群设置
.chatlog status - 查看当前群设置`;

    cmd.solve = async (ctx, msg, cmdArgs) => {
        const val = cmdArgs.getArgN(1);
        const subVal = cmdArgs.getArgN(2);
        const content = cmdArgs.getArgN(3);
        const id = msg.messageType === 'group' ? msg.groupId : ctx.player.userId;

        if (ctx.privilegeLevel < 50) {
            seal.replyToSender(ctx, msg, seal.formatTmpl(ctx, "核心:提示_无权限"));
            return seal.ext.newCmdExecuteResult(true);
        }

        switch (val) {
            case 'help':
                seal.replyToSender(ctx, msg, cmd.help);
                break;
            case 'on':
                PassiveTimer.setEnable(id, true);
                seal.replyToSender(ctx, msg, seal.ext.getStringConfig(ext, CONFIG.MSG_ON));
                break;
            case 'off':
                PassiveTimer.setEnable(id, false);
                seal.replyToSender(ctx, msg, seal.ext.getStringConfig(ext, CONFIG.MSG_OFF));
                break;
            case 'clear':
                DataManager.saveQueue(id, []);
                seal.replyToSender(ctx, msg, "已清空当前群的语料库。");
                break;
            case 'status':
                const groupCfg = DataManager.getGroupConfig(id);
                const globalPrefix = seal.ext.getStringConfig(ext, CONFIG.PREFIX);
                const defaultRecFreq = seal.ext.getStringConfig(ext, CONFIG.REC_FREQ);
                const defaultSendFreq = seal.ext.getStringConfig(ext, CONFIG.SEND_FREQ);
                const globalCatch = seal.ext.getBoolConfig(ext, CONFIG.CATCH_IMAGES);

                const currentPrefix = groupCfg.prefix !== undefined ? groupCfg.prefix : globalPrefix;
                const currentShowName = groupCfg.showName !== undefined ? groupCfg.showName : true;
                const currentRecFreq = groupCfg.recFreq !== undefined ? groupCfg.recFreq : defaultRecFreq;
                const currentSendFreq = groupCfg.sendFreq !== undefined ? groupCfg.sendFreq : defaultSendFreq;
                
                const isGroupCatchOn = groupCfg.catchImages === true;
                const currentCatchImg = globalCatch && isGroupCatchOn;
                
                const queueSize = DataManager.getQueue(id).length;
                const isEnabled = PassiveTimer.stateMap[id] || false;

                let statusMsg = `当前群设置状态：
功能开关: ${isEnabled ? "开启" : "关闭"}
语料库大小: ${queueSize} 条
消息前缀: ${currentPrefix || "(无)"}
显示昵称: ${currentShowName ? "开启" : "关闭"}
记录频率: ${currentRecFreq}秒
发送频率: ${currentSendFreq}秒
抓取图片: ${currentCatchImg ? "开启" : "关闭"}`;

                if (isGroupCatchOn && !globalCatch) {
                    statusMsg += " (失效:全局配置未开启)";
                }

                seal.replyToSender(ctx, msg, statusMsg);
                break;
            case 'set':
                if (subVal === 'prefix') {
                    const groupCfg = DataManager.getGroupConfig(id) || {};

                    if (content === 'off' || content === '关闭') {
                        const newCfg = { ...groupCfg };
                        if (newCfg.prefix !== undefined && newCfg.prefix !== "") {
                            newCfg.prevPrefix = newCfg.prefix;
                        }
                        newCfg.prefix = "";
                        ext.storageSet(`groupConfig_${id}`, JSON.stringify(newCfg));
                        seal.replyToSender(ctx, msg, `本群前缀已关闭`);
                    } else if (content === 'on') {
                        const newCfg = { ...groupCfg };
                        if (newCfg.prevPrefix !== undefined) {
                            newCfg.prefix = newCfg.prevPrefix;
                            delete newCfg.prevPrefix;
                        } else {
                            if (newCfg.hasOwnProperty('prefix')) delete newCfg.prefix;
                        }
                        ext.storageSet(`groupConfig_${id}`, JSON.stringify(newCfg));
                        seal.replyToSender(ctx, msg, `本群前缀已${newCfg.prefix !== undefined ? '恢复为本群设置' : '回退到全局设置'}`);
                    } else {
                        if (!content) return seal.replyToSender(ctx, msg, "请指定前缀或使用on/off 开启/关闭，如: .chatlog set prefix 语录:");
                        DataManager.setGroupConfig(id, { prefix: content });
                        seal.replyToSender(ctx, msg, `本群前缀已设为: ${content}`);
                    }
                } else if (subVal === 'name' || subVal === 'showname') {
                    const isOn = content === 'on';
                    if (content !== 'on' && content !== 'off') return seal.replyToSender(ctx, msg, "请指定 on 或 off");
                    DataManager.setGroupConfig(id, { showName: isOn });
                    seal.replyToSender(ctx, msg, `本群昵称显示已${isOn ? '开启' : '关闭'}`);
                } else if (subVal === 'recfreq') {
                    if (!content || isNaN(parseInt(content))) return seal.replyToSender(ctx, msg, "请指定数字秒数，如: .chatlog set recfreq 30");
                    DataManager.setGroupConfig(id, { recFreq: parseInt(content) });
                    seal.replyToSender(ctx, msg, `本群记录频率已设为: ${content}秒`);
                } else if (subVal === 'sendfreq') {
                    if (!content || isNaN(parseInt(content))) return seal.replyToSender(ctx, msg, "请指定数字秒数，如: .chatlog set sendfreq 60");
                    DataManager.setGroupConfig(id, { sendFreq: parseInt(content) });
                    seal.replyToSender(ctx, msg, `本群发送频率已设为: ${content}秒`);
                } else if (subVal === 'catchimg') {
                    const globalAllowed = seal.ext.getBoolConfig(ext, CONFIG.CATCH_IMAGES);
                    if (!globalAllowed) {
                        seal.replyToSender(ctx, msg, "插件配置中未开启[允许抓取图片]选项，无法启用该功能。请联系骰主在后台开启。");
                        return seal.ext.newCmdExecuteResult(true);
                    }
                    if (content !== 'on' && content !== 'off') return seal.replyToSender(ctx, msg, "请指定 on 或 off");
                    
                    const isOn = content === 'on';
                    DataManager.setGroupConfig(id, { catchImages: isOn });
                    seal.replyToSender(ctx, msg, `本群抓取图片功能已${isOn ? '开启' : '关闭'}`);
                } else if (subVal === 'default') {
                    DataManager.clearGroupConfig(id);
                    seal.replyToSender(ctx, msg, "本群配置已重置为默认。");
                } else {
                    seal.replyToSender(ctx, msg, "未知选项，请使用 .chatlog help");
                }
                break;
            default:
                seal.replyToSender(ctx, msg, "未知指令，请使用 .chatlog help");
        }
        return seal.ext.newCmdExecuteResult(true);
    };
    ext.cmdMap['chatlog'] = cmd;

    ext.onNotCommandReceived = async (ctx, msg) => {
        if (msg.messageType !== 'group' && msg.messageType !== 'private') return;
        if (msg.sender.userId === ctx.endPoint.userId) return;

        const id = msg.messageType === 'group' ? msg.groupId : ctx.player.userId;

        PassiveTimer.tick(ctx, msg, id);
    };
}
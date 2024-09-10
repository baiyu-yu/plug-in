// ==UserScript==
// @name         Random Chat Logger
// @author       白鱼
// @version      1.0.1
// @description  随机记录群友发言并且储存在数据库里，然后随机放出一条的插件。使用.chatlog on/off控制开启关闭，可以在配置项配置一些东西。数据库时间太长会很大，请每隔一段时间到\data\default\extensions删除randomChatLogger文件夹（要先禁用插件）。第一条会很快发出来，后面的就正常了，表情包图片可能过期会出现消息无法显示之类的，不管了。
// @timestamp    1724394115
// @license      MIT
// @homepageURL  https://github.com/sealdice/javascript
// @updateUrl    https://mirror.ghproxy.com/https://raw.githubusercontent.com/baiyu-yu/plug-in/main/randomchatlog.js
// @updateUrl    https://raw.githubusercontent.com/baiyu-yu/plug-in/main/randomchatlog.js
// @sealVersion  1.4.5
// ==/UserScript==

if (!seal.ext.find('randomChatLogger')) {
    const ext = seal.ext.new('randomChatLogger', 'baiyu', '1.0.1');
    seal.ext.register(ext);

    // 注册配置项
    const configKeys = [
        "开启记录回复语",
        "关闭记录回复语",
        "记录频率（秒）",
        "发送频率（秒）",
        "消息前缀"
    ];
    const configDefaults = [
        "记录已开启",
        "记录已关闭",
        "60", // 默认记录频率为 60 秒
        "300", // 默认发送频率为 300 秒
        "随机记录: " // 默认消息前缀
    ];
    configKeys.forEach((key, index) => {
        seal.ext.registerStringConfig(ext, key, configDefaults[index]);
    });

    // 定义全局变量
    let logStateMap = {};
    let lastRecordTimeMap = {};
    let lastSendTimeMap = {};

    // 尝试从存储加载 logStateMap, lastRecordTimeMap, lastSendTimeMap
    const storedLogStateMap = ext.storageGet("logStateMap");
    if (storedLogStateMap) logStateMap = JSON.parse(storedLogStateMap);
    const storedLastRecordTimeMap = ext.storageGet("lastRecordTimeMap");
    if (storedLastRecordTimeMap) lastRecordTimeMap = JSON.parse(storedLastRecordTimeMap);
    const storedLastSendTimeMap = ext.storageGet("lastSendTimeMap");
    if (storedLastSendTimeMap) lastSendTimeMap = JSON.parse(storedLastSendTimeMap);

    // 命令定义
    const cmdRandomChatLogger = seal.ext.newCmdItemInfo();
    cmdRandomChatLogger.name = 'chatlog';
    cmdRandomChatLogger.help = '随机记录群友发言并且储存在数据库里，然后随机放出一条\n用法：.chatlog on/off';
    cmdRandomChatLogger.solve = async (ctx, msg, cmdArgs) => {
        let val = cmdArgs.getArgN(1);
        const contextKey = msg.messageType === 'group' ? msg.groupId : ctx.player.userId;

        switch (val) {
            case 'help': {
                const helpMessage = `随机记录群友发言并且储存在数据库里，然后随机放出一条\n用法：.chatlog on/off`;
                seal.replyToSender(ctx, msg, helpMessage);
                return seal.ext.newCmdExecuteResult(true);
            }
            case 'on': {
                if (ctx.privilegeLevel >= 50) { 
                    logStateMap[contextKey] = true;
                    ext.storageSet("logStateMap", JSON.stringify(logStateMap));
                    seal.replyToSender(ctx, msg, seal.ext.getStringConfig(ext, configKeys[0]));
                } else {
                    seal.replyToSender(ctx, msg, seal.formatTmpl(ctx, "核心:提示_无权限"));
                }
                return seal.ext.newCmdExecuteResult(true);
            }
            case 'off': {
                if (ctx.privilegeLevel >= 50) {
                    logStateMap[contextKey] = false;
                    ext.storageSet("logStateMap", JSON.stringify(logStateMap));
                    seal.replyToSender(ctx, msg, seal.ext.getStringConfig(ext, configKeys[1]));
                } else {
                    seal.replyToSender(ctx, msg, seal.formatTmpl(ctx, "核心:提示_无权限"));
                }
                return seal.ext.newCmdExecuteResult(true);
            }
            default: {
                seal.replyToSender(ctx, msg, `未知命令，请使用 .chatlog help 查看帮助`);
                return seal.ext.newCmdExecuteResult(true);
            }
        }
    };

    ext.cmdMap['chatlog'] = cmdRandomChatLogger;

    ext.onNotCommandReceived = async (ctx, msg) => {
        const contextKey = msg.messageType === 'group' ? msg.groupId : ctx.player.userId;

        if (ctx.group.logOn) {
            return;
        }

        if (!logStateMap[contextKey]) return;

        const recordFrequency = parseInt(seal.ext.getStringConfig(ext, configKeys[2]));
        const sendFrequency = parseInt(seal.ext.getStringConfig(ext, configKeys[3]));

        const now = Date.now();

        // 检查是否达到记录频率
        if (!lastRecordTimeMap[contextKey] || now - lastRecordTimeMap[contextKey] >= recordFrequency * 1000) {
            // 加载或初始化日志队列
            const storedLogQueue = ext.storageGet(`logQueue_${contextKey}`);
            let logQueue = storedLogQueue ? JSON.parse(storedLogQueue) : [];

            logQueue.push({ nickname: msg.sender.nickname, message: msg.message });

            // 保存更新后的日志队列
            ext.storageSet(`logQueue_${contextKey}`, JSON.stringify(logQueue));

            lastRecordTimeMap[contextKey] = now;
            ext.storageSet(`lastRecordTimeMap_${contextKey}`, JSON.stringify(lastRecordTimeMap[contextKey]));
        }

        // 检查是否达到发送频率
        if (!lastSendTimeMap[contextKey] || now - lastSendTimeMap[contextKey] >= sendFrequency * 1000) {
            // 加载日志队列
            const storedLogQueue = ext.storageGet(`logQueue_${contextKey}`);
            const logQueue = storedLogQueue ? JSON.parse(storedLogQueue) : [];

            if (logQueue && logQueue.length > 0) {
                const randomIndex = Math.floor(Math.random() * logQueue.length);
                const randomLog = logQueue.splice(randomIndex, 1)[0];

                // 获取自定义前缀
                const prefix = seal.ext.getStringConfig(ext, configKeys[4]);

                // 发送带有前缀的消息
                seal.replyToSender(ctx, msg, `${prefix}${randomLog.nickname}: ${randomLog.message}`);

                // 更新日志队列
                ext.storageSet(`logQueue_${contextKey}`, JSON.stringify(logQueue));

                lastSendTimeMap[contextKey] = now;
                ext.storageSet(`lastSendTimeMap_${contextKey}`, JSON.stringify(lastSendTimeMap[contextKey]));
            }
        }
    };
}

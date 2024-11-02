// ==UserScript==
// @name         警告转发插件
// @description  警告消息转发插件，转发[被禁言]、[被踢出]、[黑名单等级提升]等消息到指定群或私聊。在插件配置项修改相关设置。
// @version      1.0.0
// @license      MIT
// @author       白鱼
// @timestamp    1730481203
// @homepageURL  https://github.com/baiyu-yu/plug-in
// @updateUrl    https://ghp.ci/https://raw.githubusercontent.com/baiyu-yu/plug-in/refs/heads/main/%E8%AD%A6%E5%91%8A%E8%BD%AC%E5%8F%91%E6%8F%92%E4%BB%B6.js
// @updateUrl    https://raw.githubusercontent.com/baiyu-yu/plug-in/refs/heads/main/%E8%AD%A6%E5%91%8A%E8%BD%AC%E5%8F%91%E6%8F%92%E4%BB%B6.js
// @sealVersion  1.4.6
// ==/UserScript==

if (!seal.ext.find("消息转发插件")) {
    const ext = seal.ext.new("消息转发插件", "白鱼", "1.0.0");

    // 注册配置项
    seal.ext.register(ext);
    seal.ext.registerTemplateConfig(ext, "接收群号", ["QQ-Group:123456", "QQ-Group:654321"], "配置允许接收消息的群号");
    seal.ext.registerTemplateConfig(ext, "接收私聊QQ", ["QQ:111111", "QQ:222222"], "配置允许接收消息的私聊QQ");
    seal.ext.registerTemplateConfig(ext, "转发群号", ["QQ-Group:333333", "QQ-Group:444444"], "配置消息转发的目标群号");
    seal.ext.registerTemplateConfig(ext, "转发私聊QQ", ["QQ:555555", "QQ:666666"], "配置消息转发的目标私聊QQ");

    async function sendMessage(ep, groupId, userId, text) {
        const msg = seal.newMessage();
        msg.messageType = groupId ? "group" : "private";
        msg.groupId = groupId;
        msg.sender.userId = userId;
        const newCtx = seal.createTempCtx(ep, msg);
        
        await seal.replyToSender(newCtx, msg, text);
    }

    async function processMessage(ctx, msg) {
        // 以指定格式前缀匹配
        const mutePattern = /^被禁言: 在群组<(.+?)>\((\d+)\)中被禁言，时长(\d+)秒，操作者:<(.+?)>\((\d+)\)/;
        const kickPattern = /^被踢出群: 在QQ群组<(.+?)>\((\d+)\)中被踢出，操作者:<(.+?)>\((\d+)\)/;
        const blacklistPattern = /^黑名单等级提升: \[(.+?)\] <(.+?)>\(QQ:(\d+)\) 原因:(.+)/;

        let match;
        let forwardMessage = "";
        let forwardMessagefrom = "";

        const patterns = [mutePattern, kickPattern, blacklistPattern];

        for (const pattern of patterns) {
            if ((match = msg.message.match(pattern))) {
                forwardMessage = `${msg.message}`;
                forwardMessagefrom = `来源：${ctx.player.name} (ID: ${ctx.player.userId})`;
                break;
            }
        }

        // 若未匹配到 forwardMessage，不发送 forwardMessagefrom
        if (!forwardMessage) return;

        // 检查是否在允许的群或私聊中接收消息
        const allowedGroups = seal.ext.getTemplateConfig(ext, "接收群号");
        const allowedPrivateQQs = seal.ext.getTemplateConfig(ext, "接收私聊QQ");

        const isGroupAllowed = allowedGroups.includes(ctx.group?.groupId);
        const isPrivateAllowed = allowedPrivateQQs.includes(ctx.player?.userId);

        if (!isGroupAllowed && !isPrivateAllowed) return;

        // 转发到目标群和私聊
        const forwardGroups = seal.ext.getTemplateConfig(ext, "转发群号");
        const forwardPrivateQQs = seal.ext.getTemplateConfig(ext, "转发私聊QQ");

        const endPoints = seal.getEndPoints();
        if (endPoints.length === 0) {
            console.log('未找到任何有效的登录号信息');
            return;
        }
        const ep = endPoints[0];

        for (const groupId of forwardGroups) {
            await sendMessage(ep, groupId, "", forwardMessage);
            await sendMessage(ep, groupId, "", forwardMessagefrom);
        }

        for (const userId of forwardPrivateQQs) {
            await sendMessage(ep, "", userId, forwardMessage);
            await sendMessage(ep, "", userId, forwardMessagefrom);
        }
    }

    // 监听消息事件
    ext.onNotCommandReceived = async (ctx, msg) => {
        await processMessage(ctx, msg);
    };

    // 新增的 onMessageSend 处理自身发出的消息
    ext.onMessageSend = async (ctx, msg) => {
        await processMessage(ctx, msg);
    };
}




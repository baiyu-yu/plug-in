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
    const ext = seal.ext.new("消息转发插件", "开发者", "1.0.0");

    // 注册配置项
    seal.ext.register(ext);
    seal.ext.registerTemplateConfig(ext, "接收群号", ["123456", "654321"], "配置允许接收消息的群号");
    seal.ext.registerTemplateConfig(ext, "接收私聊QQ", ["111111", "222222"], "配置允许接收消息的私聊QQ");
    seal.ext.registerTemplateConfig(ext, "转发群号", ["333333", "444444"], "配置消息转发的目标群号");
    seal.ext.registerTemplateConfig(ext, "转发私聊QQ", ["555555", "666666"], "配置消息转发的目标私聊QQ");

    // 动态创建 ctx 和 msg，并发送消息
    function sendMessage(ep, groupId, userId, text) {
        const msg = seal.newMessage();
        msg.messageType = groupId ? "group" : "private";
        msg.groupId = groupId;
        msg.sender.userId = userId;

        const newCtx = seal.createTempCtx(ep, msg);
        
        seal.replyToSender(newCtx, msg, text);
    }

    // 监听消息事件
    ext.onNotCommandReceived = (ctx, msg) => {

        const mutePattern = /被禁言: 在群组<(.+?)>\((\d+)\)中被禁言，时长(\d+)秒，操作者:<(.+?)>\((\d+)\)/;
        const kickPattern = /被踢出群: 在QQ群组<(.+?)>\((\d+)\)中被踢出，操作者:<(.+?)>\((\d+)\)/;
        const blacklistPattern = /黑名单等级提升: \[(.+?)\] <(.+?)>\(QQ:(\d+)\) 原因:(.+)/;

        let match;
        let forwardMessage = "";

        const patterns = [
            mutePattern,
            kickPattern,
            blacklistPattern
        ];
        
        for (const pattern of patterns) {
            if ((match = msg.message.match(pattern))) {
                forwardMessage = `${msg.message}`;
                forwardMessagefrom = `来源：${ctx.player.name} (ID: ${ctx.player.userId})`
                break;
            }
        }

        // 检查是否在允许的群或私聊中接收消息
        const allowedGroups = seal.ext.getTemplateConfig(ext, "接收群号");
        const allowedPrivateQQs = seal.ext.getTemplateConfig(ext, "接收私聊QQ");

        const isGroupAllowed = allowedGroups.includes(ctx.group?.groupId);
        const isPrivateAllowed = allowedPrivateQQs.includes(ctx.player?.userId);

        if (!isGroupAllowed && !isPrivateAllowed) return;

        // 匹配到消息类型并允许转发后，执行转发
        const forwardGroups = seal.ext.getTemplateConfig(ext, "转发群号");
        const forwardPrivateQQs = seal.ext.getTemplateConfig(ext, "转发私聊QQ");

        const endPoints = seal.getEndPoints();
        if (endPoints.length === 0) {
            console.log('未找到任何有效的登录号信息');
            return;
        }
        const ep = endPoints[0];  // 选择第一个有效端点作为消息发送的依据

        // 向目标群发送消息
        forwardGroups.forEach(groupId => {
            sendMessage(ep, groupId, "", forwardMessage);
            sendMessage(ep, groupId, "", forwardMessagefrom);
        });

        // 向目标私聊发送消息，并打印 ctx 和 msg
        forwardPrivateQQs.forEach(userId => {
            sendMessage(ep, "", userId, forwardMessage);
            sendMessage(ep, "", userId, forwardMessagefrom);
        });
    };
}



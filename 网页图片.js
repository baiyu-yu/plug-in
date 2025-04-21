// ==UserScript==
// @name         网页链接图片生成
// @author       白鱼
// @version      1.0.0
// @description  使用 .网页 <链接> 来生成长图。
// @timestamp    1745257927
// @license      MIT
// @homepageURL  https://github.com/baiyu-yu/plug-in/
// @updateUrl    https://raw.gitmirror.com/baiyu-yu/plug-in/main/网页图片.js
// ==/UserScript==

let ext = seal.ext.find('网页图片生成');
if (!ext) {
    ext = seal.ext.new('网页图片生成', '白鱼', '1.0.0');
    seal.ext.register(ext);
}

seal.ext.registerStringConfig(ext, "后端地址", "http://localhost:45432", "默认的话是这个");
seal.ext.registerTemplateConfig(ext, "允许非指令生成图片的qq群", [`QQ-Group:114514`, `QQ-Group:1919810`], "小心后端撑不住");

const cmd = seal.ext.newCmdItemInfo();
cmd.name = '网页';
cmd.help = `帮助:
【.网页 <链接>】`;
function handleWebpageCommand(ctx, msg, url) {
    if (!url) {
        seal.replyToSender(ctx, msg, '请输入要生成长图的网页链接。');
        return seal.ext.newCmdExecuteResult(true);
    }

    const requestBody = {
        url: url,
        fullPage: true,
        quality: 90
    };

    const screenshotApiUrl = seal.ext.getStringConfig(ext, "后端地址") + '/api/generate-long-screenshot';
    fetch(screenshotApiUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
    }).then(response => {
        response.json().then(data => {
            if (data.status === 'success' && data.imageUrl) {
                seal.replyToSender(ctx, msg, `[CQ:image,file=${seal.ext.getStringConfig(ext, "后端地址")}${data.imageUrl}]`);
            } else {
                console.log(ctx, msg, `生成长图失败: ${data.message || '未知错误'}`);
            }
        }).catch(error => {
            console.log(ctx, msg, `解析 API 响应失败: ${error.message}`);
        });
    }).catch(error => {
        console.log(ctx, msg, `请求 API 失败: ${error.message}`);
    });

    return seal.ext.newCmdExecuteResult(true);
}

cmd.solve = (ctx, msg, cmdArgs) => {
    const url = cmdArgs.getArgN(1);
    return handleWebpageCommand(ctx, msg, url);
};

ext.cmdMap['网页'] = cmd;

ext.onNotCommandReceived = (ctx, msg) => {
    const urlRegex = /(https?:\/\/[\w\-\.]+\.[\w]{2,6}[^\s]*)/g;
    const urls = msg.message.match(urlRegex);
    const allowedGroups = seal.ext.getTemplateConfig(ext, "允许非指令生成图片的qq群");

    if (urls && urls.length > 0 && !msg.message.includes('[CQ:') && allowedGroups.includes(ctx.group.groupId.toString())) {
        for (const url of urls) {
            console.log(`[网页图片插件]: 提取到的链接: ${url}`);
            return handleWebpageCommand(ctx, msg, url); 
        }
    }
    return;
};
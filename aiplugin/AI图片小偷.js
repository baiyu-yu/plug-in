// ==UserScript==
// @name         AI图片小偷
// @author       错误
// @version      1.0.0
// @description  为aiplugin插件提供识别图片信息的能力。
// @timestamp    1728126311
// 2024-10-05 19:05:11
// @license      MIT
// @homepageURL  https://github.com/baiyu-yu/plug-in
// @updateUrl    https://ghp.ci/https://raw.githubusercontent.com/baiyu-yu/plug-in/main/aiplugin/AI%e5%9b%be%e7%89%87%e5%b0%8f%e5%81%b7.js
// @updateUrl    https://raw.githubusercontent.com/baiyu-yu/plug-in/main/aiplugin/AI%e5%9b%be%e7%89%87%e5%b0%8f%e5%81%b7.js
// ==/UserScript==
// 首先检查是否已经存在
let ext = seal.ext.find('aiImageThief');
if (!ext) {
    ext = seal.ext.new('aiImageThief', '错误', '1.0.0');
    // 注册扩展
    seal.ext.register(ext);

    seal.ext.registerTemplateConfig(ext, "本地图片路径", ['data/images/sealdice.png'], "如不需要可以不填写")
    seal.ext.registerIntConfig(ext, "偷取图片存储上限", 30, "每个群聊或私聊单独储存");
    seal.ext.registerIntConfig(ext, "发送图片的概率/%", 100, "抽取图片成功的概率");

    seal.ext.registerStringConfig(ext, "非指令触发需要满足的条件", '1', "使用豹语表达式，例如：$t群号_RAW=='2001'")
    seal.ext.registerTemplateConfig(ext, "非指令关键词", ["咪"], "包含关键词将进行回复")

    seal.ext.registerStringConfig(ext, "图片大模型URL", "https://open.bigmodel.cn/api/paas/v4/chat/completions");
    seal.ext.registerStringConfig(ext, "APIkeys", "yours");
    seal.ext.registerTemplateConfig(ext, "body", [
        `"model":"glm-4v"`,
        `"max_tokens":100`
    ], "")
    seal.ext.registerIntConfig(ext, "最大回复字符数", "100");

    const data = {}

    function getData(id) {
        let savedData = {}
        try {
            savedData = JSON.parse(ext.storageGet(`data_${id}`) || '[]');
        } catch (error) {
            console.error(`从数据库中获取data_${id}失败:`, error);
        }

        data[id] = {
            images: savedData.images || [],
            steal: savedData.steal || false
        }

        return data[id];
    }

    function saveData(id) {
        ext.storageSet(`data_${id}`, JSON.stringify(data[id]));
    };

    function getUrls(text) {
        const match = text.match(/\[CQ:image,file=(http.*?)\]/g);
        if (!match) {
            return [];
        }

        const urls = match.map(item => item.match(/\[CQ:image,file=(http.*?)\]/)[1]);
        return urls;
    }

    class Image {
        constructor() {

        }

        async drawImage(id, type) {
            const p = seal.ext.getIntConfig(ext, "发送图片的概率/%");
            if (Math.random() * 100 > p) return '';

            getData(id);

            const localImages = seal.ext.getTemplateConfig(ext, "本地图片路径");
            let image = ''

            function drawLocalImage() {
                const ran = Math.floor(Math.random() * localImages.length);
                return localImages[ran];
            }

            async function drawStolenImage(id) {
                const stolenImages = data[id].images;

                if (stolenImages.length == 0) {
                    return '';
                }

                const ran = Math.floor(Math.random() * stolenImages.length);
                const url = data[id].images.splice(ran, 1)[0];

                const imageThief = new Image();
                if (await imageThief.checkImageUrl(url)) {
                    return url;
                }

                if (data[id].images.length == 0) {
                    return '';
                }

                await new Promise(resolve => setTimeout(resolve, 500));

                return await drawStolenImage(id);
            }

            async function drawAllImage(id) {
                const stolenImages = data[id].images;

                if (stolenImages.length == 0) {
                    return drawLocalImage();
                }

                const ran = Math.floor(Math.random() * (localImages.length + stolenImages.length));

                if (ran < localImages.length) {
                    return localImages[ran];
                } else {
                    const url = data[id].images.splice(ran - localImages.length, 1)[0];

                    const imageThief = new Image();
                    if (await imageThief.checkImageUrl(url)) {
                        return url;
                    }

                    await new Promise(resolve => setTimeout(resolve, 500));

                    return await drawAllImage(id);
                }
            }

            switch (type) {
                case 'lcl':
                case 'local': {
                    image = drawLocalImage();
                    break;
                }
                case 'stl':
                case 'stolen': {
                    image = await drawStolenImage(id);
                    break;
                }
                case 'all':
                default: {
                    image = await drawAllImage(id);
                }
            }

            saveData(id)
            return image
        }

        async checkImageUrl(url) {
            let isValid = false

            try {
                const response = await fetch(url, { method: 'GET' });

                if (response.ok) {
                    const contentType = response.headers.get('Content-Type');
                    if (contentType && contentType.startsWith('image')) {
                        console.log('URL is valid and not expired.');
                        isValid = true;
                    } else {
                        console.log(`URL is valid but does not return an image. Content-Type: ${contentType}`);
                    }
                } else {
                    console.log(`URL is expired or invalid. Status: ${response.status}`);
                }
            } catch (error) {
                console.error('Error checking URL:', error);
            }

            return isValid;
        }

        async imageToText(imageUrl, text = '') {
            const messages = [{
                role: "user",
                content: [
                    {
                        "type": "image_url",
                        "image_url": { "url": imageUrl }
                    }, {
                        "type": "text",
                        "text": text ? text : "请帮我分析这张图片，简短地输出文字描述。"
                    }
                ]
            }]

            const url = seal.ext.getStringConfig(ext, "图片大模型URL")
            const apiKey = seal.ext.getStringConfig(ext, "APIkeys");
            const MAX_REPLY_CHARS = seal.ext.getIntConfig(ext, "最大回复字符数");
            const bodyTemplate = seal.ext.getTemplateConfig(ext, "body")

            try {
                const bodyObject = JSON.parse(`{${bodyTemplate.join(',')}}`);
                bodyObject['messages'] = messages;
                bodyObject['stop'] = null;
                bodyObject['stream'] = false;

                const response = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    body: JSON.stringify(bodyObject)
                });
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const data = await response.json();

                if (data.error) {
                    throw new Error(`请求失败：${JSON.stringify(data.error)}`);
                }

                if (data.choices && data.choices.length > 0) {
                    const reply = data.choices[0].message.content;
                    console.log("图片内容：", reply);
                    return reply.slice(0, MAX_REPLY_CHARS);
                } else {
                    throw new Error("服务器响应中没有choices或choices为空");
                }
            } catch (error) {
                console.error("在imageToText中请求出错：", error);
                return '图片';
            }
        }
    }

    const cmdimg = seal.ext.newCmdItemInfo();
    cmdimg.name = 'img'; // 指令名字，可用中文
    cmdimg.help = `盗图指南:
【img draw (stl/lcl)】随机抽取偷的图片/本地图片
【img stl (on/off)】偷图 开启/关闭
【img f】遗忘
【img itt 图片/ran】图片转文字`;
    cmdimg.solve = async (ctx, msg, cmdArgs) => {
        const val = cmdArgs.getArgN(1);
        const userId = ctx.player.userId
        const groupId = ctx.group.groupId
        const id = ctx.isPrivate ? userId : groupId;

        switch (val) {
            case 'd':
            case 'draw': {
                const imageThief = new Image()
                const type = cmdArgs.getArgN(2)
                const image = await imageThief.drawImage(id, type)
                if (!image) return;

                seal.replyToSender(ctx, msg, `[CQ:image,file=${image}]`)
                return;
            }
            case 'stl':
            case 'steal': {
                getData(id)
                const op = cmdArgs.getArgN(2)
                switch (op) {
                    case 'on': {
                        data[id].steal = true;
                        seal.replyToSender(ctx, msg, '图片偷取已开启');
                        saveData(id);
                        return;
                    }
                    case 'off': {
                        data[id].steal = false;
                        seal.replyToSender(ctx, msg, '图片偷取已关闭');
                        saveData(id);
                        return;
                    }
                    default: {
                        seal.replyToSender(ctx, msg, `图片偷取:${data[id].steal},当前数量:${data[id].images.length}`);
                        return;
                    }
                }
            }
            case 'f':
            case 'fgt':
            case 'forget': {
                getData(id)
                data[id].images = [];
                seal.replyToSender(ctx, msg, '图片已遗忘');
                saveData(id)
                return;
            }
            case 'itt': {
                const imageThief = new Image()
                getData(id)
                const val2 = cmdArgs.getArgN(2)
                let url;
                if (val2 == 'ran') {
                    url = await imageThief.drawImage(id, 'stolen');
                    if (!url) return;
                    seal.replyToSender(ctx, msg, `[CQ:image,file=${url}]`)
                } else {
                    const urls = getUrls(val2);
                    if (urls.length == 0) {
                        seal.replyToSender(ctx, msg, '【img itt 图片/ran】图片转文字');
                        return;
                    }
                    url = urls[0]
                }

                const text = await imageThief.imageToText(url);
                seal.replyToSender(ctx, msg, text);
                return;
            }
            case 'help':
            default: {
                seal.replyToSender(ctx, msg, cmdimg.help);
                return;
            }
        }
    };

    //接受非指令消息
    ext.onNotCommandReceived = async (ctx, msg) => {
        const userId = ctx.player.userId
        const groupId = ctx.group.groupId
        const id = ctx.isPrivate ? userId : groupId;
        const idData = getData(id)

        const keyWords = seal.ext.getTemplateConfig(ext, "非指令关键词")
        const condition = seal.ext.getStringConfig(ext, "非指令触发需要满足的条件")
        // 非指令触发
        if (keyWords.some(item => msg.message.includes(item))) {
            if (parseInt(seal.format(ctx, `{${condition}}`)) == 0) return;
            const imageThief = new Image()
            const image = await imageThief.drawImage(id, "all")
            if (!image) return;
            seal.replyToSender(ctx, msg, `[CQ:image,file=${image}]`)
            return;
        }

        //偷
        if (idData.steal) {
            const maxImageNum = seal.ext.getIntConfig(ext, "偷取图片存储上限")
            const urls = getUrls(msg.message)
            if (urls.length == 0) return;

            data[id].images = [...idData.images, ...urls].slice(-maxImageNum)
            saveData(id)
            return;
        }
    }

    // 将命令注册到扩展中
    ext.cmdMap['img'] = cmdimg;
    globalThis.image = new Image();
}
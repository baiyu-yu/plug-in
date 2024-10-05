// ==UserScript==
// @name         识图AI
// @author       错误
// @version      1.0.1
// @description  为aiplugin插件提供识别图片信息的能力。
// @timestamp    1728126311
// 2024-10-05 19:05:11
// @license      MIT
// @homepageURL  https://github.com/baiyu-yu/plug-in
// @updateUrl    https://ghp.ci/https://raw.githubusercontent.com/baiyu-yu/plug-in/main/%E8%AF%86%E5%9B%BEAI.js
// @updateUrl    https://raw.githubusercontent.com/baiyu-yu/plug-in/main/%E8%AF%86%E5%9B%BEAI.js
// ==/UserScript==
// 首先检查是否已经存在
let ext = seal.ext.find('imageAI');
if (!ext) {
    ext = seal.ext.new('imageAI', '错误', '1.0.1');
    // 注册扩展
    seal.ext.register(ext);

    seal.ext.registerOptionConfig(ext, "图片大模型url", "https://open.bigmodel.cn/api/paas/v4/chat/completions", ["https://open.bigmodel.cn/api/paas/v4/chat/completions", "其他"])
    seal.ext.registerStringConfig(ext, "其他图片大模型url", "yours");
    seal.ext.registerStringConfig(ext, "APIkeys", "yours");
    seal.ext.registerOptionConfig(ext, "模型选择", "glm-4v", ["glm-4v", "glm-4v-plus", "其他"]);
    seal.ext.registerStringConfig(ext, "其他模型名称", "yours");
    seal.ext.registerIntConfig(ext, "最大回复tokens数", "100");
    seal.ext.registerIntConfig(ext, "最大回复字符数", "100");


    async function imageAI(imageUrl, text = '') {
        try {
            let apiUrl = seal.ext.getOptionConfig(ext, "图片大模型url")
            if (apiUrl == "其他") apiUrl = seal.ext.getStringConfig(ext, "其他图片大模型url")
            const apiKey = seal.ext.getStringConfig(ext, "APIkeys");
            let MODEL_CHOICE = seal.ext.getOptionConfig(ext, "模型选择");
            if (MODEL_CHOICE == "其他") MODEL_CHOICE = seal.ext.getStringConfig(ext, "其他模型名称")
            const MAX_REPLY_TOKENS = seal.ext.getIntConfig(ext, "最大回复tokens数");
            const MAX_REPLY_CHARS = seal.ext.getIntConfig(ext, "最大回复字符数");
            const context = [{
                role: "user",
                content: [
                    {
                        type: "image_url",
                        image_url: { "url": imageUrl }
                    }, {
                        type: "text",
                        text: text ? text : "请帮我分析这张图片，简短地输出文字描述。"
                    }
                ]
            }]

            console.log('请求发送前的上下文:', JSON.stringify(context, null));
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({
                    model: MODEL_CHOICE,
                    messages: context,
                    max_tokens: MAX_REPLY_TOKENS,
                    stream: false,
                    temperature: 1,
                    top_p: 1
                })
            });
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

            const data = await response.json();
            console.log('服务器响应:', JSON.stringify(data, null));

            if (data.error) {
                console.error(`请求失败：${JSON.stringify(data.error)}`);
                return '<|图片|>';
            }

            if (data.choices && data.choices.length > 0) {
                let reply = data.choices[0].message.content;
                return reply.slice(0, MAX_REPLY_CHARS);
            } else {
                console.error("服务器响应中没有choices或choices为空");
                return '<|图片|>';
            }
        } catch (error) {
            console.error("请求出错：", error);
            return '<|图片|>';
        }
    }

    globalThis.imageAI = imageAI;

    /*const cmdimg = seal.ext.newCmdItemInfo();
    cmdimg.name = 'img'; // 指令名字，可用中文
    cmdimg.help = '';
    cmdimg.solve = async (ctx, msg, cmdArgs) => {
        let val = cmdArgs.getArgN(1);
        switch (val) {
            case 'help': {
                const ret = seal.ext.newCmdExecuteResult(true);
                ret.showHelp = true;
                return ret;
            }
            default: {
                let match = msg.message.match(/\[CQ:image,file=(.*?)\]/);
                if (match) {
                    let url = match[1];
                    console.log(url)
                    let reply = await globalThis.imageAI(url)
                    seal.replyToSender(ctx, msg, reply);
                } else {
                    seal.replyToSender(ctx, msg, 'error');
                }
                return seal.ext.newCmdExecuteResult(true);
            }
        }
    };
    // 将命令注册到扩展中
    ext.cmdMap['img'] = cmdimg;*/
}
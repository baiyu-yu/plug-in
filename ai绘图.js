// ==UserScript==
// @name         CogView-3 AI Plugin
// @description  适配CogView-3模型，用于生成图像。用户可以通过文字描述生成图像，并通过CQ码发送给用户。
// @version      1.0.0
// @author       白鱼
// @timestamp    1724850114
// @license      MIT
// @homepageURL  https://github.com/baiyu-yu/plug-in/
// @updateUrl    https://mirror.ghproxy.com/https://raw.githubusercontent.com/baiyu-yu/plug-in/main/CogView-3%20AI%20Plugin.js
// @updateUrl    https://raw.githubusercontent.com/baiyu-yu/plug-in/main/CogView-3%20AI%20Plugin.js
// ==/UserScript==

if (!seal.ext.find('CogView3')) {
    const ext = seal.ext.new('CogView3', 'baiyu', '1.0.0');
    seal.ext.register(ext);

    // 配置项注册
    seal.ext.registerStringConfig(ext, "你的APIkeys", "yours");
    seal.ext.registerStringConfig(ext, "图片尺寸", "1024x1024");
    seal.ext.registerStringConfig(ext, "用户ID", "user12345");
    seal.ext.registerBoolConfig(ext, "是否打印日志", false);
    seal.ext.registerBoolConfig(ext, "启用引用回复和@用户", true);

    const API_KEYS = seal.ext.getStringConfig(ext, "你的APIkeys");
    const IMAGE_SIZE = seal.ext.getStringConfig(ext, "图片尺寸");
    const USER_ID = seal.ext.getStringConfig(ext, "用户ID");
    const PRINT_LOGS = seal.ext.getBoolConfig(ext, "是否打印日志");
    const ENABLE_REPLY_AND_AT = seal.ext.getBoolConfig(ext, "启用引用回复和@用户");

    const COGVIEW_API_URL = "https://open.bigmodel.cn/api/paas/v4/images/generations";

    class CogViewAI {
        constructor() {}

        // 发送请求生成图像
        async generateImage(prompt, ctx, msg) {
            try {
                const response = await fetch(COGVIEW_API_URL, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${API_KEYS}`,
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    body: JSON.stringify({
                        model: "cogview-3-plus",
                        prompt: prompt,
                        size: IMAGE_SIZE,
                        user_id: USER_ID
                    })
                });

                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

                const data = await response.json();
                if (PRINT_LOGS) console.log('服务器响应:', JSON.stringify(data, null, 2));

                if (data.error) {
                    console.error(`请求失败：${JSON.stringify(data.error)}`);
                    return;
                }

                if (data.data && data.data.length > 0) {
                    let imageUrl = data.data[0].url;

                    // 使用CQ码发送图片
                    if (ENABLE_REPLY_AND_AT) {
                        seal.replyToSender(ctx, msg, `[CQ:reply,id=${msg.rawId}][CQ:at,qq=${msg.sender.userId.split(':')[1]}] [CQ:image,file=${imageUrl}]`);
                    } else {
                        seal.replyToSender(ctx, msg, `[CQ:image,file=${imageUrl}]`);
                    }
                } else {
                    console.error("服务器响应中没有data或data为空");
                }
            } catch (error) {
                console.error("请求出错：", error);
            }
        }
    }

    globalThis.cogViewAI = new CogViewAI();

    // 创建生成图像的命令
    const cmdGenerateImage = seal.ext.newCmdItemInfo();
    cmdGenerateImage.name = 'generateimage';
    cmdGenerateImage.help = '通过文字描述生成图像\n用法：.generateimage 你的描述';
    cmdGenerateImage.solve = async (ctx, msg, cmdArgs) => {
        let text = cmdArgs.getArgN(1);
        if (text) {
            let fullText = cmdArgs.args.join(" ");
            await globalThis.cogViewAI.generateImage(fullText, ctx, msg);
        } else {
            if (ENABLE_REPLY_AND_AT) {
                seal.replyToSender(ctx, msg, `[CQ:reply,id=${msg.rawId}][CQ:at,qq=${msg.sender.userId.split(':')[1]}] 请输入描述`);
            } else {
                seal.replyToSender(ctx, msg, `请输入描述`);
            }
        }
        return seal.ext.newCmdExecuteResult(true);
    };
    ext.cmdMap['generateimage'] = cmdGenerateImage;
}
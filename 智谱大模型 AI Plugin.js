// ==UserScript==
// @name         智谱大模型 AI Plugin 指令非指令图片版
// @description  智谱大模型插件，用于与智谱AI进行对话，并根据特定关键词或.chat指令触发回复。可以选择glm-4/charglm-3模型，配置项中user_info和user_name的几个只有选择charglm-3才可以使用。可以选择是否识别图片。具体修改看配置项，不懂不建议直接修改插件。不建议使用包含在图片url中字符的作为非指令触发词。在https://open.bigmodel.cn/usercenter/apikeys进行注册获取api和token。
// @version      1.3.0
// @author       白鱼
// @timestamp    1724850114
// @license      MIT
// @homepageURL  https://github.com/baiyu-yu/plug-in/
// @updateUrl    https://mirror.ghproxy.com/https://raw.githubusercontent.com/baiyu-yu/plug-in/main/%E6%99%BA%E8%B0%B1%E5%A4%A7%E6%A8%A1%E5%9E%8B%20AI%20Plugin.js
// @updateUrl    https://raw.githubusercontent.com/baiyu-yu/plug-in/main/%E6%99%BA%E8%B0%B1%E5%A4%A7%E6%A8%A1%E5%9E%8B%20AI%20Plugin.js
// @sealVersion  1.4.5
// ==/UserScript==

if (!seal.ext.find('BigModelai')) {
    const ext = seal.ext.new('BigModelai', 'baiyu', '1.3.0');
    seal.ext.register(ext);

    // 配置项注册
    seal.ext.registerStringConfig(ext, "你的APIkeys", "yours");
    seal.ext.registerStringConfig(ext, "最大回复tokens数", "100");
    seal.ext.registerStringConfig(ext, "最大回复字符数(防止AI抽风)", "100");
    seal.ext.registerStringConfig(ext, "存储上下文对话限制轮数", "4");
    seal.ext.registerStringConfig(ext, "角色设定", "黑鱼是一个可爱的有鲨鱼尾巴的小女孩...");
    seal.ext.registerStringConfig(ext, "非指令关键词", "黑鱼黑鱼");
    seal.ext.registerBoolConfig(ext, "允许上报图片(透明底图片会报错400)", false);
    seal.ext.registerStringConfig(ext, "模型选择(glm-4/charglm-3)", "glm-4");
    seal.ext.registerStringConfig(ext, "当使用charglm-3时bot名字", "黑鱼");
    seal.ext.registerBoolConfig(ext, "是否打印日志", false);
    seal.ext.registerBoolConfig(ext, "启用引用回复和@用户", true);
    seal.ext.registerStringConfig(ext, "二次上报自定义文本（识别图片时由于使用的模型无法添加角色设定，因此采用二次上报的方式让ai进行角色扮演，如果对图片识别返回文本不满意可以修改这里）", "你会将你之前发出的消息在保留原有大致意思的情况下以你自己的语气表述一遍，不会添加任何别的内容或者改变你收到的消息的意思，也不要表示你只是在转述消息，也不要对消息做出评论，不要表达自己的看法。");
    seal.ext.registerStringConfig(ext, "默认user_info", "对世界充满好奇的人或者是不幸的人");

    // 特殊用户配置
    seal.ext.registerStringConfig(ext, "特殊用户ID配置1", "QQ:1004205930");
    seal.ext.registerStringConfig(ext, "特殊user_info和user_name1", "黑鱼的骰主|白鱼");
    seal.ext.registerStringConfig(ext, "特殊用户ID配置2", "QQ:1655009569");
    seal.ext.registerStringConfig(ext, "特殊user_info和user_name2", "黑鱼的同事，来自日本的温柔的哥哥|夏目贵志");
    seal.ext.registerStringConfig(ext, "特殊用户ID配置3", "[空]");
    seal.ext.registerStringConfig(ext, "特殊user_info和user_name3", "[空]");

    const DEEPSEEK_API_URL = "https://open.bigmodel.cn/api/paas/v4/chat/completions";
    const API_KEYS = seal.ext.getStringConfig(ext, "你的APIkeys");
    const MAX_REPLY_TOKENS = parseInt(seal.ext.getStringConfig(ext, "最大回复tokens数"));
    const MAX_CONTEXT_LENGTH = parseInt(seal.ext.getStringConfig(ext, "存储上下文对话限制轮数")) * 2;
    const SYSTEM_CONTEXT_CONTENT = seal.ext.getStringConfig(ext, "角色设定");
    const NON_COMMAND_KEYWORD = seal.ext.getStringConfig(ext, "非指令关键词");
    const ALLOW_IMAGE_REPORT = seal.ext.getBoolConfig(ext, "允许上报图片(透明底图片会报错400)");
    const MODEL_CHOICE = seal.ext.getStringConfig(ext, "模型选择(glm-4/charglm-3)");
    const MAX_REPLY_CHARS = parseInt(seal.ext.getStringConfig(ext, "最大回复字符数(防止AI抽风)"));
    const PRINT_LOGS = seal.ext.getBoolConfig(ext, "是否打印日志");
    const ENABLE_REPLY_AND_AT = seal.ext.getBoolConfig(ext, "启用引用回复和@用户");
    const SECOND_REPORT_CUSTOM_TEXT = seal.ext.getStringConfig(ext, "二次上报自定义文本（识别图片时由于使用的模型无法添加角色设定，因此采用二次上报的方式让ai进行角色扮演，如果对图片识别返回文本不满意可以修改这里）");

    // 特殊用户信息获取
    const SPECIAL_USERS = [
        {
            id: seal.ext.getStringConfig(ext, "特殊用户ID配置1"),
            info_name: seal.ext.getStringConfig(ext, "特殊user_info和user_name1")
        },
        {
            id: seal.ext.getStringConfig(ext, "特殊用户ID配置2"),
            info_name: seal.ext.getStringConfig(ext, "特殊user_info和user_name2")
        },
        {
            id: seal.ext.getStringConfig(ext, "特殊用户ID配置3"),
            info_name: seal.ext.getStringConfig(ext, "特殊user_info和user_name3")
        }
    ].filter(config => config.id !== "[空]" && config.info_name !== "[空]");

    const DEFAULT_USER_INFO = seal.ext.getStringConfig(ext, "默认user_info");

    class DeepseekAI {
        constructor() {
            this.context = [this.systemContext()];
            this.hasImage = false; // 跟踪是否包含图片
            this.imageFlag = false; // 跟踪消息队列中是否存在图片
        }

        // 系统上下文的生成
        systemContext() {
            return {
                "role": "system",
                "content": SYSTEM_CONTEXT_CONTENT
            };
        }

        // 清理上下文，确保系统上下文始终存在
        cleanContext() {
            this.context = this.context.filter(message => message !== null);
            if (this.context.every(message => message.role !== "system")) {
                this.context.unshift(this.systemContext());
            }
            this.imageFlag = false; // 清空消息队列时清除图片标记
        }

        // 获取用户的 user_info 和 user_name
        getUserInfoAndName(userId, playerName) {
            let numericId = userId.replace(/\D/g, ''); // 提取纯数字ID
            for (let specialUser of SPECIAL_USERS) {
                const specialIds = specialUser.id.split("|").map(id => id.replace(/\D/g, ''));
                for (let id of specialIds) {
                    if (numericId === id) {
                        let userInfo = specialUser.info_name.split("|")[0]; // 获取 user_info
                        let userName = specialUser.info_name.split("|")[1]; // 获取 user_name
                        return [userInfo, userName];
                    }
                }
            }
            return [DEFAULT_USER_INFO, playerName]; // 默认返回值
        }

        // 处理普通文本消息
        async chat(text, ctx, msg) {
            let user = msg.sender.nickname;
            let userId = msg.sender.userId;
            let [userInfo, userName] = this.getUserInfoAndName(userId, user);

            // 添加到上下文
            this.context.push({"role": "user", "content": `from ${user}（${userId}）: ${text}`});

            // 确保上下文长度不超过最大限制
            while (this.context.length > MAX_CONTEXT_LENGTH) {
                if (this.context[0].role === "system") {
                    const systemContext = this.context.shift();
                    this.context.shift();
                    this.context.unshift(systemContext);
                } else {
                    this.context.shift();
                }
            }
            this.cleanContext();

            // 根据模型选择进行请求发送
            if (MODEL_CHOICE === "charglm-3") {
                await this.sendZhipuRequest(text, userInfo, userName, ctx, msg);
            } else {
                await this.sendRequest(ctx, msg);
            }
        }

        // 处理带图片的消息
        async chatWithImage(text, imageUrl, ctx, msg) {
            let user = msg.sender.nickname;
            let userId = msg.sender.userId;
            let messageContent = [{"type": "text", "text": `from ${user}（${userId}）: ${text}`}];

            if (imageUrl) {
                messageContent.push({"type": "image_url", "image_url": {"url": imageUrl}});
            }

            this.context.push({"role": "user", "content": messageContent});
            this.hasImage = true;
            this.imageFlag = true;

            const reply = await this.sendRequest(ctx, msg, false);

            if (this.context.length > MAX_CONTEXT_LENGTH) {
                this.context = [this.systemContext()];
            }

            await this.handleSecondReport(ctx, msg, reply);
        }

        // 发送普通模型的请求
        async sendRequest(ctx, msg, shouldReply = true) {
            try {
                if (PRINT_LOGS) console.log('请求发送前的上下文:', JSON.stringify(this.context, null, 2));

                const response = await fetch(`${DEEPSEEK_API_URL}`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${API_KEYS}`,
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    body: JSON.stringify({
                        model: this.hasImage ? "glm-4v" : "glm-4",
                        messages: this.context,
                        max_tokens: MAX_REPLY_TOKENS,
                        stream: false,
                        temperature: 1,
                        top_p: 1
                    })
                });

                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

                const data = await response.json();
                if (PRINT_LOGS) console.log('服务器响应:', JSON.stringify(data, null, 2));

                if (data.error) {
                    console.error(`请求失败：${JSON.stringify(data.error)}`);
                    return;
                }

                if (data.choices && data.choices.length > 0) {
                    let reply = data.choices[0].message.content;
                    this.context.push({"role": "assistant", "content": reply});
                    reply = reply.replace(/from .+?: /g, '');

                    // 截断回复内容并限制最大长度
                    if (reply.length > MAX_REPLY_CHARS) {
                        reply = reply.slice(0, MAX_REPLY_CHARS) + `（以下省略${reply.length - MAX_REPLY_CHARS}字）`;
                    }

                    // 是否启用引用回复
                    if (shouldReply) {
                        if (ENABLE_REPLY_AND_AT) {
                            seal.replyToSender(ctx, msg, `[CQ:reply,id=${msg.rawId}][CQ:at,qq=${msg.sender.userId.split(':')[1]}] ${reply}`);
                        } else {
                            seal.replyToSender(ctx, msg, reply);
                        }
                    }

                    return reply;
                } else {
                    console.error("服务器响应中没有choices或choices为空");
                }
            } catch (error) {
                console.error("请求出错：", error);
            }
        }

        // 发送charglm-3模型请求
        async sendZhipuRequest(text, userInfo, userName, ctx, msg) {
            try {
                if (PRINT_LOGS) console.log('请求发送前的上下文:', JSON.stringify(this.context, null, 2));

                const response = await fetch(`${DEEPSEEK_API_URL}`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${API_KEYS}`,
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    body: JSON.stringify({
                        model: "charglm-3",
                        meta: {
                            "user_info": userInfo,
                            "bot_info": SYSTEM_CONTEXT_CONTENT,
                            "bot_name": seal.ext.getStringConfig(ext, "当使用charglm-3时bot名字"),
                            "user_name": userName
                        },
                        messages: this.context.concat([{"role": "user", "content": text}])
                    })
                });

                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

                const data = await response.json();
                if (PRINT_LOGS) console.log('智谱AI响应:', JSON.stringify(data, null, 2));

                if (data.error) {
                    console.error(`智谱AI请求失败：${JSON.stringify(data.error)}`);
                    return;
                }

                if (data.choices && data.choices.length > 0) {
                    let reply = data.choices[0].message.content;
                    this.context.push({"role": "assistant", "content": reply});
                    reply = reply.replace(/from .+?: /g, '');

                    // 截断回复
                    if (reply.length > MAX_REPLY_CHARS) {
                        reply = reply.slice(0, MAX_REPLY_CHARS) + `（以下省略${reply.length - MAX_REPLY_CHARS}字）`;
                    }

                    if (ENABLE_REPLY_AND_AT) {
                        seal.replyToSender(ctx, msg, `[CQ:reply,id=${msg.rawId}][CQ:at,qq=${msg.sender.userId.split(':')[1]}] ${reply}`);
                    } else {
                        seal.replyToSender(ctx, msg, reply);
                    }
                } else {
                    console.error("智谱AI响应中没有choices或choices为空");
                }
            } catch (error) {
                console.error("智谱AI请求出错：", error);
            }
        }

        // 处理二次上报逻辑
        async handleSecondReport(ctx, msg, reply) {
            const secondReportContext = [
                {"role": "system", "content": SYSTEM_CONTEXT_CONTENT + SECOND_REPORT_CUSTOM_TEXT},
                {"role": "user", "content": reply}
            ];

            try {
                const secondResponse = await fetch(`${DEEPSEEK_API_URL}`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${API_KEYS}`,
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    body: JSON.stringify({
                        model: "glm-4",
                        messages: secondReportContext,
                        max_tokens: MAX_REPLY_TOKENS,
                        stream: false,
                        temperature: 1,
                        top_p: 1
                    })
                });

                if (!secondResponse.ok) throw new Error(`HTTP error! status: ${secondResponse.status}`);

                const secondData = await secondResponse.json();
                if (PRINT_LOGS) console.log('二次上报服务器响应:', JSON.stringify(secondData, null, 2));

                if (secondData.error) {
                    console.error(`请求失败：${JSON.stringify(secondData.error)}`);
                    return;
                }

                if (secondData.choices && secondData.choices.length > 0) {
                    let finalReply = secondData.choices[0].message.content;

                    // 截断回复
                    if (finalReply.length > MAX_REPLY_CHARS) {
                        finalReply = finalReply.slice(0, MAX_REPLY_CHARS) + `（以下省略${finalReply.length - MAX_REPLY_CHARS}字）`;
                    }

                    if (ENABLE_REPLY_AND_AT) {
                        seal.replyToSender(ctx, msg, `[CQ:reply,id=${msg.rawId}][CQ:at,qq=${msg.sender.userId.split(':')[1]}] ${finalReply}`);
                    } else {
                        seal.replyToSender(ctx, msg, finalReply);
                    }
                } else {
                    console.error("服务器响应中没有choices或choices为空");
                }

                // 清空二次上报处理队列
                secondReportContext.length = 0;
            } catch (error) {
                console.error("二次上报请求出错：", error);
            }
        }

    shouldTriggerImageLogic() {
        // 使用图片标记来判断是否触发图片逻辑
        return this.imageFlag;
    }

    async processMessage(text, ctx, msg) {
        const hasImage = /\[CQ:image,file=(.*?)\]/.test(text);
    
        console.log('处理消息:', text);
        console.log('是否包含图片:', hasImage);
        console.log('允许上报图片:', ALLOW_IMAGE_REPORT);
    
        if (ALLOW_IMAGE_REPORT) {
            if (this.shouldTriggerImageLogic()) {
                if (hasImage) {
                    const imageUrlMatch = text.match(/\[CQ:image,file=(.*?)\]/);
                    if (imageUrlMatch) {
                        const imageUrl = imageUrlMatch[1];
                        const textWithoutImage = text.replace(/\[CQ:image,file=(.*?)\]/, '').trim();
                        console.log('触发 chatWithImage (消息队列中存在图片 URL 且本次消息含图片 CQ 码):', textWithoutImage, imageUrl);
                        this.context = [this.systemContext()]; // 清空消息队列
                        await this.chatWithImage(textWithoutImage, imageUrl, ctx, msg);
                    }
                } else {
                    console.log('触发 chatWithImage (消息队列中存在图片 URL 但本次消息不含图片 CQ 码):', text);
                    await this.chatWithImage(text, null, ctx, msg);
                }
            } else {
                if (hasImage) {
                    const imageUrlMatch = text.match(/\[CQ:image,file=(.*?)\]/);
                    if (imageUrlMatch) {
                        const imageUrl = imageUrlMatch[1];
                        const textWithoutImage = text.replace(/\[CQ:image,file=(.*?)\]/, '').trim();
                        console.log('触发 chatWithImage (消息队列中不存在图片 URL 但本次消息含图片 CQ 码):', textWithoutImage, imageUrl);
                        this.context = [this.systemContext()]; // 清空消息队列
                        await this.chatWithImage(textWithoutImage, imageUrl, ctx, msg);
                    }
                } else {
                    console.log('触发 chat (消息队列中不存在图片 URL 且本次消息不含图片 CQ 码):', text);
                    await this.chat(text, ctx, msg);
                }
            }
        } else {
            const filteredText = text.replace(/\[CQ:image,file=(.*?)\]/g, '').trim();
            if (filteredText) {
                console.log('触发 chat (过滤图片):', filteredText);
                await this.chat(filteredText, ctx, msg);
            }
        }
    }
}


    globalThis.deepseekAIContextMap = new Map();

    // 创建 chat 命令
    const cmdDeepseekAIchat = seal.ext.newCmdItemInfo();
    cmdDeepseekAIchat.name = 'chat';
    cmdDeepseekAIchat.help = '向AI提问\n用法：.chat 你的问题';
    cmdDeepseekAIchat.solve = async (ctx, msg, cmdArgs) => {
        let text = cmdArgs.getArgN(1);
        if (text) {
            let fullText = cmdArgs.args.join(" ");
            let contextKey = ctx.isPrivate ? ctx.player.userId : ctx.group.groupId;
            if (globalThis.deepseekAIContextMap.has(contextKey)) {
                let ai = globalThis.deepseekAIContextMap.get(contextKey);
                await ai.processMessage(fullText, ctx, msg);
            } else {
                let ai = new DeepseekAI();
                globalThis.deepseekAIContextMap.set(contextKey, ai);
                await ai.processMessage(fullText, ctx, msg);
            }
        } else {
            if (ENABLE_REPLY_AND_AT) {
                seal.replyToSender(ctx, msg, `[CQ:reply,id=${msg.rawId}][CQ:at,qq=${msg.sender.userId.split(':')[1]}] 请输入内容`);
            } else {
                seal.replyToSender(ctx, msg, `请输入内容`);
            }
        }
        return seal.ext.newCmdExecuteResult(true);
    };
    ext.cmdMap['chat'] = cmdDeepseekAIchat;

    // 处理非指令消息触发
    ext.onNotCommandReceived = async (ctx, msg) => {
        const text = msg.message.trim();
        if (text.includes(NON_COMMAND_KEYWORD)) {
            let contextKey = ctx.isPrivate ? ctx.player.userId : ctx.group.groupId;
            if (globalThis.deepseekAIContextMap.has(contextKey)) {
                let ai = globalThis.deepseekAIContextMap.get(contextKey);
                await ai.processMessage(text, ctx, msg);
            } else {
                let ai = new DeepseekAI();
                globalThis.deepseekAIContextMap.set(contextKey, ai);
                await ai.processMessage(text, ctx, msg);
            }
        }
    };

    // 添加生成图片的指令
    const cmdGenerateImage = seal.ext.newCmdItemInfo();
    cmdGenerateImage.name = 'generateImage';
    cmdGenerateImage.help = '生成图片\n用法：.generateImage 生成描述';
    cmdGenerateImage.solve = async (ctx, msg, cmdArgs) => {
        let prompt = cmdArgs.getArgN(1);
        if (!prompt) {
            seal.replyToSender(ctx, msg, `请输入描述`);
            return seal.ext.newCmdExecuteResult(true);
        }

        try {
            const response = await fetch('https://open.bigmodel.cn/api/paas/v4/image/generations', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${API_KEYS}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: 'cogview-3',
                    prompt: prompt
                })
            });

            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

            const data = await response.json();
            if (data.data && data.data.length > 0) {
                const imageUrl = data.data[0].url;
                seal.replyToSender(ctx, msg, `[CQ:image,file=${imageUrl}]`);
            } else {
                seal.replyToSender(ctx, msg, `未生成图片，请重试。`);
            }
        } catch (error) {
            console.error("图片生成请求出错：", error);
            seal.replyToSender(ctx, msg, `图片生成失败，请稍后重试。`);
        }
        return seal.ext.newCmdExecuteResult(true);
    };
    ext.cmdMap['generateImage'] = cmdGenerateImage;
}  

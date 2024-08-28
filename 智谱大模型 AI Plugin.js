// ==UserScript==
// @name         智谱大模型 AI Plugin 指令非指令图片版
// @description  智谱大模型插件，用于与智谱AI进行对话，并根据特定关键词或.chat指令触发回复。可以选择glm-4/charglm-3模型，配置项中user_info和user_name的几个只有选择charglm-3才可以使用。可以选择是否识别图片。具体修改看配置项，不懂不建议直接修改插件。不建议使用包含在图片url中字符的作为非指令触发词。在https://open.bigmodel.cn/usercenter/apikeys进行注册获取api和token。
// @version      1.0.0
// @author       白鱼
// @timestamp    1724850114
// @license      MIT
// @homepageURL  https://github.com/baiyu-yu/plug-in/
// @updateUrl    https://mirror.ghproxy.com/https://raw.githubusercontent.com/baiyu-yu/plug-in/main/%E6%99%BA%E8%B0%B1%E5%A4%A7%E6%A8%A1%E5%9E%8B%20AI%20Plugin.js
// @updateUrl    https://raw.githubusercontent.com/baiyu-yu/plug-in/main/%E6%99%BA%E8%B0%B1%E5%A4%A7%E6%A8%A1%E5%9E%8B%20AI%20Plugin.js
// @sealVersion  1.4.6
// ==/UserScript==

if (!seal.ext.find('BigModelai')) {
    const ext = seal.ext.new('BigModelai', 'baiyu', '1.0.0');
    seal.ext.register(ext);

    // 配置项注册
    seal.ext.registerStringConfig(ext, "你的APIkeys", "yours");
    seal.ext.registerStringConfig(ext, "最大回复tokens数", "100");
    seal.ext.registerStringConfig(ext, "存储上下文对话限制轮数", "4");
    seal.ext.registerStringConfig(ext, "角色设定", "黑鱼也就是你是一个可爱的有鲨鱼尾巴的小女孩，会掷骰子，帮助调查员探索世界，黑鱼的一句话不会超过二十个中文汉字。");
    seal.ext.registerStringConfig(ext, "非指令关键词", "黑鱼黑鱼");
    seal.ext.registerBoolConfig(ext, "允许上报图片(透明底图片会报错400)", false);
    seal.ext.registerStringConfig(ext, "模型选择(glm-4/charglm-3)", "glm-4");  // 新增模型选择配置
    seal.ext.registerStringConfig(ext, "当使用charglm-3时bot名字", "黑鱼"); 
    seal.ext.registerStringConfig(ext, "当使用charglm-3时预设背景", "(旁白：黑鱼和白鱼和夏目贵志还有其它几个调查员朋友在一起聊天)"); 

    // 多个特殊用户ID及其对应配置
    seal.ext.registerStringConfig(ext, "特殊用户ID配置1", "QQ:1004205930");
    seal.ext.registerStringConfig(ext, "特殊user_info和user_name1", "黑鱼的骰主|白鱼");
    seal.ext.registerStringConfig(ext, "特殊用户ID配置2", "QQ:1655009569");
    seal.ext.registerStringConfig(ext, "特殊user_info和user_name2", "黑鱼的同事，来自日本的温柔的哥哥，看得见妖怪|夏目贵志");
    seal.ext.registerStringConfig(ext, "特殊用户ID配置3", "[空]");
    seal.ext.registerStringConfig(ext, "特殊user_info和user_name3", "[空]");

    seal.ext.registerStringConfig(ext, "默认user_info和user_name", "对世界充满好奇的人或者是不幸的人|调查员"); // 默认用户的配置

    const DEEPSEEK_API_URL = "https://open.bigmodel.cn/api/paas/v4/chat/completions";
    const API_KEYS = seal.ext.getStringConfig(ext, "你的APIkeys");
    const MAX_REPLY_TOKENS = parseInt(seal.ext.getStringConfig(ext, "最大回复tokens数"));
    const MAX_CONTEXT_LENGTH = parseInt(seal.ext.getStringConfig(ext, "存储上下文对话限制轮数")) * 2;
    const SYSTEM_CONTEXT_CONTENT = seal.ext.getStringConfig(ext, "角色设定");
    const NON_COMMAND_KEYWORD = seal.ext.getStringConfig(ext, "非指令关键词");
    const ALLOW_IMAGE_REPORT = seal.ext.getBoolConfig(ext, "允许上报图片(透明底图片会报错400)");
    const MODEL_CHOICE = seal.ext.getStringConfig(ext, "模型选择(glm-4/charglm-3)");  // 获取模型选择配置

    // 获取特殊用户ID和对应信息配置
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

    const DEFAULT_USER_INFO_NAME = seal.ext.getStringConfig(ext, "默认user_info和user_name").split("|");

    class DeepseekAI {
        constructor() {
            this.context = [this.systemContext()];
            this.hasImage = false; // 跟踪是否包含图片
            this.imageFlag = false; // 新增标记，用于跟踪消息队列中是否存在图片
        }
    
        systemContext() {
            return {
                "role": "system",
                "content": SYSTEM_CONTEXT_CONTENT
            };
        }
    
        cleanContext() {
            this.context = this.context.filter(message => message !== null);
    
            if (this.context.every(message => message.role !== "system")) {
                this.context.unshift(this.systemContext());
            }
    
            // 清空消息队列时清除图片标记
            this.imageFlag = false;
        }
    
        getUserInfoAndName(userId) {
            for (let specialUser of SPECIAL_USERS) {
                const specialIds = specialUser.id.split("|");
                for (let id of specialIds) {
                    if (userId.includes(id)) {
                        return specialUser.info_name.split("|");
                    }
                }
            }
            return DEFAULT_USER_INFO_NAME;
        }
    
        async chat(text, ctx, msg) {
            let user = ctx.player.name;
            let userId = ctx.player.userId;
            let [userInfo, userName] = this.getUserInfoAndName(userId);
    
            this.context.push({"role": "user", "content": "from " + user + "（" + userId + "）" + ": " + text});
    
            // 确保上下文长度不超过最大限制
            while (this.context.length > MAX_CONTEXT_LENGTH) {
                // 确保始终保留 systemContext
                if (this.context[0].role === "system") {
                    // 保存 systemContext
                    const systemContext = this.context.shift();
                    // 移除最早的上下文消息
                    this.context.shift();
                    // 将 systemContext 放回到队列的最前端
                    this.context.unshift(systemContext);
                } else {
                    // 移除最早的上下文消息
                    this.context.shift();
                }
            }
            this.cleanContext();
    
            if (MODEL_CHOICE === "charglm-3") {
                await this.sendZhipuRequest(text, userInfo, userName, ctx, msg);
            } else {
                await this.sendRequest(ctx, msg);
            }
        }
    
        async chatWithImage(text, imageUrl, ctx, msg) {
            let user = ctx.player.name;
            let userId = ctx.player.userId;
        
            // 创建消息内容对象
            let messageContent = [
                {"type": "text", "text": "from " + user + "（" + userId + "）" + ": " + text}
            ];
        
            // 只有在 imageUrl 不为 null 时才添加图片信息
            if (imageUrl) {
                messageContent.push({"type": "image_url", "image_url": {"url": imageUrl}});
            }
        
            this.context.push({
                "role": "user",
                "content": messageContent
            });
        
            this.hasImage = true;
            this.imageFlag = true; // 设置图片标记
        
            // 调用 sendRequest 但不立即发送回复
            const reply = await this.sendRequest(ctx, msg, false);
        
            // 达到最大记忆轮数删除消息队列
            if (this.context.length > MAX_CONTEXT_LENGTH) {
                this.context = [this.systemContext()];
            }
        
            // 调用 handleSecondReport 进行二次上报
            await this.handleSecondReport(ctx, msg, reply);
        }
    
        async sendRequest(ctx, msg, shouldReply = true) {
            try {
                console.log('请求发送前的上下文:', JSON.stringify(this.context, null, 2));
    
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
                console.log('服务器响应:', JSON.stringify(data, null, 2));
    
                if (data.error) {
                    console.error(`请求失败：${JSON.stringify(data.error)}`);
                    return;
                }
    
                if (data.choices && data.choices.length > 0) {
                    let reply = data.choices[0].message.content;
                    this.context.push({"role": "assistant", "content": reply});
                    reply = reply.replace(/from .+?: /g, '');
    
                    if (shouldReply) {
                        seal.replyToSender(ctx, msg, reply);
                    }
    
                    return reply;
                } else {
                    console.error("服务器响应中没有choices或choices为空");
                }
            } catch (error) {
                console.error("请求出错：", error);
            }
        }
    
        async sendZhipuRequest(text, userInfo, userName, ctx, msg) {
            try {
                console.log('请求发送前的上下文:', JSON.stringify(this.context, null, 2));
    
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
                        messages: [
                            {"role": "assistant", "content": seal.ext.getStringConfig(ext, "当使用charglm-3时预设背景")},
                            {"role": "user", "content": text}
                        ]
                    })
                });
    
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    
                const data = await response.json();
                console.log('智谱AI响应:', JSON.stringify(data, null, 2));
    
                if (data.error) {
                    console.error(`智谱AI请求失败：${JSON.stringify(data.error)}`);
                    return;
                }
    
                if (data.choices && data.choices.length > 0) {
                    let reply = data.choices[0].message.content;
                    this.context.push({"role": "assistant", "content": reply});
                    reply = reply.replace(/from .+?: /g, '');
                    seal.replyToSender(ctx, msg, reply);
                } else {
                    console.error("智谱AI响应中没有choices或choices为空");
                }
            } catch (error) {
                console.error("智谱AI请求出错：", error);
            }
        }
    
        async handleSecondReport(ctx, msg, reply) {
            const secondReportContext = [
                {"role": "system", "content": SYSTEM_CONTEXT_CONTENT + "你会将所有你收到的消息在保留原有大致意思的情况下以你自己的语气表述一遍，不会添加任何别的内容或者改变你收到的消息的意思，也不要表示你只是在转述消息，也不要对消息做出评论，不要表达自己的看法。"},
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
                console.log('二次上报服务器响应:', JSON.stringify(secondData, null, 2));
    
                if (secondData.error) {
                    console.error(`请求失败：${JSON.stringify(secondData.error)}`);
                    return;
                }
    
                if (secondData.choices && secondData.choices.length > 0) {
                    let finalReply = secondData.choices[0].message.content;
                    seal.replyToSender(ctx, msg, finalReply);
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
    
    // 创建命令项，并保持与非命令触发逻辑一致
    const cmdDeepseekAIchat = seal.ext.newCmdItemInfo();
    cmdDeepseekAIchat.name = 'chat';
    cmdDeepseekAIchat.help = '向AI提问\n用法：.chat 你的问题';
    cmdDeepseekAIchat.solve = async (ctx, msg, cmdArgs) => {
        let text = cmdArgs.getArgN(1);
        if (text) {
            let fullText = cmdArgs.args.join(" ");
            if (globalThis.deepseekAIContextMap.has(ctx.player.userId)) {
                let ai = globalThis.deepseekAIContextMap.get(ctx.player.userId);
                await ai.processMessage(fullText, ctx, msg);
            } else {
                let ai = new DeepseekAI();
                globalThis.deepseekAIContextMap.set(ctx.player.userId, ai);
                await ai.processMessage(fullText, ctx, msg);
            }
        } else {
            seal.replyToSender(ctx, msg, `请输入内容`);
        }
        return seal.ext.newCmdExecuteResult(true);
    };
    ext.cmdMap['chat'] = cmdDeepseekAIchat;
    
    // 保留非命令触发逻辑，并处理两种情况
    ext.onNotCommandReceived = async (ctx, msg) => {
        const text = msg.message.trim();
        if (text.includes(NON_COMMAND_KEYWORD)) {
            if (globalThis.deepseekAIContextMap.has(ctx.player.userId)) {
                let ai = globalThis.deepseekAIContextMap.get(ctx.player.userId);
                await ai.processMessage(text, ctx, msg);
            } else {
                let ai = new DeepseekAI();
                globalThis.deepseekAIContextMap.set(ctx.player.userId, ai);
                await ai.processMessage(text, ctx, msg);
            }
        }
    };
}

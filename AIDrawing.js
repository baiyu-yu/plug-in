// ==UserScript==
// @name         AIDrawing依赖
// @description  适配多种AI绘图平台，支持自定义请求体和二次请求。讯飞太特殊了不想支持。.generateimage 你的描述 [负面描述]。
// @version      1.0.0
// @author       白鱼
// @timestamp    1741422937
// @license      MIT
// @homepageURL  https://github.com/baiyu-yu/plug-in/
// @updateUrl    https://raw.gitmirror.com/baiyu-yu/plug-in/main/AIDrawing.js
// @updateUrl    https://raw.githubusercontent.com/baiyu-yu/plug-in/main/AIDrawing.js
// ==/UserScript==

if (!seal.ext.find('AIDrawing')) {
    const ext = seal.ext.new('AIDrawing', 'baiyu', '1.0.0');
    seal.ext.register(ext);

    seal.ext.registerStringConfig(ext, "API端点", "https://api.example.com/v1/images/generations", "API端点，用于第一次请求");
    seal.ext.registerStringConfig(ext, "二次请求API端点", "https://api.example.com/v1/tasks/{task_id}", "二次请求的API端点，使用 {task_id} 作为占位符");
    seal.ext.registerTemplateConfig(ext, "自定义_请求体", [
        `"model":"wanx2.1-t2i-turbo"`,
        `"input":"{\"prompt\":\"{prompt}\",\"negative_prompt\":\"{negative_prompt}\"}"`,
        `"parameters":"{\"size\":\"1024x1024\",\"n\":1}"` 
    ], "自定义请求体，每条参数为键值对格式。使用 {prompt} 和 {negative_prompt} 作为占位符。");
    seal.ext.registerTemplateConfig(ext, "自定义_请求头", [
        `"Authorization":"Bearer YOUR_API_KEY"`,
        `"Content-Type":"application/json"`
    ], "自定义请求头，每条参数为键值对格式。");

    class AIDrawing {
        constructor() {
            this.taskIdCache = {}; 
        }

formatRequestBody(params, prompt, negativePrompt = "") {
    try {
        const templateObj = params.reduce((acc, param) => {
            
            const [key, ...valueParts] = param.split(":");
            const value = valueParts.join(":");
            const trimmedKey = key.trim().replace(/"/g, '');
            const trimmedValue = value.trim().replace(/^"|"$/g, ''); 

            let parsedValue;
            if (trimmedValue.startsWith("{") && trimmedValue.endsWith("}")) {
                try {
                    parsedValue = JSON.parse(trimmedValue);
                } catch (e) {
                    console.error("JSON 解析失败:", e);
                    parsedValue = trimmedValue; 
                }
            } else {
                parsedValue = trimmedValue.replace(/"/g, '');
            }
            acc[trimmedKey] = parsedValue;
            return acc;
        }, {});

        // 递归替换占位符
        const processPlaceholders = (obj) => {
            for (const key in obj) {
                if (typeof obj[key] === "string") {
                    obj[key] = obj[key]
                        .replace(/{prompt}/g, prompt)
                        .replace(/{negative_prompt}/g, negativePrompt);
                } else if (typeof obj[key] === "object") {
                    processPlaceholders(obj[key]);
                }
            }
        };

        processPlaceholders(templateObj);
        return JSON.stringify(templateObj);
    } catch (error) {
        console.error("请求体处理失败:", error);
        throw new Error("请求体格式不正确，请检查配置");
    }
}
        // 格式化请求头
        formatRequestHeaders(headers) {
            try {
                const headerObj = headers.reduce((acc, header) => {
                    const [key, value] = header.split(":");
                    acc[key.trim().replace(/"/g, '')] = value.trim().replace(/"/g, '');
                    return acc;
                }, {});
                return headerObj;
            } catch (error) {
                console.error("格式化请求头失败:", error);
                throw new Error("请求头格式不正确，请检查配置");
            }
        }

        // 发送请求生成图像
        async generateImage(prompt, ctx, msg, negativePrompt = "") {
            try {
                const endpoint = seal.ext.getStringConfig(ext, "API端点");
                const params = seal.ext.getTemplateConfig(ext, "自定义_请求体");
                const headers = seal.ext.getTemplateConfig(ext, "自定义_请求头");
                const body = this.formatRequestBody(params, prompt, negativePrompt);
                const requestHeaders = this.formatRequestHeaders(headers);
        
                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: requestHeaders,
                    body: body
                });
        
                console.log("响应体", JSON.stringify(response, null, 2));
                const data = await response.json();
                if (!response.ok) {
                  let s2 = `请求失败! 状态码: ${response.status}`;
                  if (data.error) {
                    s2 += `
          错误信息: ${data.error.message}`;
                  }
                  s2 += `
          响应体: ${JSON.stringify(data, null, 2)}`;
                  throw new Error(s2);
                }
        
                if (data.output && data.output.task_status === "PENDING") {
                    const taskId = data.output.task_id;
                    this.taskIdCache[taskId] = { ctx, msg };
                    setTimeout(() => this.pollTaskStatus(taskId), 15000);
                    seal.replyToSender(ctx, msg, "任务已提交，正在生成图像，请稍候...");
                } else if (data.url) {
                    const imageUrl = data.url;
                    seal.replyToSender(ctx, msg, `[CQ:image,file=${imageUrl}]`);
                } else if (data.images && data.images[0] && data.images[0].url) { 
                    const imageUrl = data.images[0].url;
                    seal.replyToSender(ctx, msg, `[CQ:image,file=${imageUrl}]`);
                } else {
                    throw new Error("未知的响应格式");
                }
            } catch (error) {
                console.error("请求出错：", error);
                seal.replyToSender(ctx, msg, "图像生成失败，请检查配置或稍后重试。");
            }
        }

        // 轮询任务状态
        async pollTaskStatus(taskId) {
            try {
                const endpoint = seal.ext.getStringConfig(ext, "二次请求API端点").replace("{task_id}", taskId);
                const headers = seal.ext.getTemplateConfig(ext, "自定义_请求头");
                const requestHeaders = this.formatRequestHeaders(headers);

                const response = await fetch(endpoint, {
                    method: 'GET',
                    headers: requestHeaders
                });

                console.log("响应体", JSON.stringify(response, null, 2));
                const data = await response.json();
                if (!response.ok) {
                  let s2 = `请求失败! 状态码: ${response.status}`;
                  if (data.error) {
                    s2 += `
          错误信息: ${data.error.message}`;
                  }
                  s2 += `
          响应体: ${JSON.stringify(data, null, 2)}`;
                  throw new Error(s2);
                }

                if (data.output.task_status === "SUCCEEDED") {
                    const imageUrl = data.output.results[0].url;
                    const { ctx, msg } = this.taskIdCache[taskId];
                    seal.replyToSender(ctx, msg, `[CQ:image,file=${imageUrl}]`);
                    delete this.taskIdCache[taskId]; 
                } else if (data.output.task_status === "RUNNING") {
                    setTimeout(() => this.pollTaskStatus(taskId), 15000);
                } else {
                    throw new Error("任务失败");
                }
            } catch (error) {
                console.error("轮询任务状态出错：", error);
                const { ctx, msg } = this.taskIdCache[taskId];
                seal.replyToSender(ctx, msg, "图像生成失败，请检查配置或稍后重试。");
                delete this.taskIdCache[taskId]; 
            }
        }
    }

    globalThis.aiDrawing = new AIDrawing();

    const cmdGenerateImage = seal.ext.newCmdItemInfo();
    cmdGenerateImage.name = 'generateimage';
    cmdGenerateImage.help = '通过文字描述生成图像\n用法：.generateimage 你的描述 [负面描述]';
    cmdGenerateImage.solve = async (ctx, msg, cmdArgs) => {
        let text = cmdArgs.getArgN(1);
        if (text) {
            let negativePrompt = cmdArgs.getArgN(2) || ""; 
            await globalThis.aiDrawing.generateImage(text, ctx, msg, negativePrompt);
        } else {
            seal.replyToSender(ctx, msg, `请输入描述`);
        }
        return seal.ext.newCmdExecuteResult(true);
    };
    ext.cmdMap['generateimage'] = cmdGenerateImage;
}
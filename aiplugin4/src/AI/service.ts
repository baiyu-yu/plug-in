import { AI, AIManager } from "./AI";
import { ToolCall, ToolInfo, ToolManager } from "../tool/tool";
import { ConfigManager } from "../config/config";
import { log } from "../utils/utils";
import { handleMessages } from "../utils/utils_message";
import { ImageManager } from "./image";

export async function sendChatRequest(ctx: seal.MsgContext, msg: seal.Message, ai: AI, messages: {
    role: string,
    content: string,
    tool_calls?: ToolCall[],
    tool_call_id?: string
}[], tool_choice: string): Promise<string> {
    const { url, apiKey, bodyTemplate } = ConfigManager.request;
    const { isTool, usePromptEngineering } = ConfigManager.tool;
    const tools = ai.tool.getToolsInfo();

    try {
        const bodyObject = parseBody(bodyTemplate, messages, tools, tool_choice);
        const time = Date.now();

        const data = await fetchData(url, apiKey, bodyObject);

        if (data.choices && data.choices.length > 0) {
            const model = data.model;
            const usage = data.usage;
            AIManager.updateUsage(model, usage);

            const message = data.choices[0].message;
            const finish_reason = data.choices[0].finish_reason;

            if (message.hasOwnProperty('reasoning_content')) {
                log(`思维链内容:`, message.reasoning_content);
            }

            const reply = message.content;

            log(`响应内容:`, reply, '\nlatency:', Date.now() - time, 'ms', '\nfinish_reason:', finish_reason);

            if (isTool) {
                if (usePromptEngineering) {
                    const match = reply.match(/<function_call>([\s\S]*?)<\/function_call>/);
                    if (match) {
                        ai.context.iteration(ctx, match[0], [], "assistant");
                        const tool_call = JSON.parse(match[1]);
                        await ToolManager.handlePromptToolCall(ctx, msg, ai, tool_call);

                        const messages = handleMessages(ctx, ai);
                        return await sendChatRequest(ctx, msg, ai, messages, tool_choice);
                    }

                } else {
                    if (message.hasOwnProperty('tool_calls') && Array.isArray(message.tool_calls) && message.tool_calls.length > 0) {
                        log(`触发工具调用`);

                        ai.context.toolCallsIteration(message.tool_calls);
                        const tool_choice = await ToolManager.handleToolCalls(ctx, msg, ai, message.tool_calls);

                        const messages = handleMessages(ctx, ai);
                        return await sendChatRequest(ctx, msg, ai, messages, tool_choice);
                    }
                }
            }

            return reply;
        } else {
            throw new Error("服务器响应中没有choices或choices为空");
        }
    } catch (error) {
        console.error("在sendChatRequest中出错：", error);
        return '';
    }
}

export async function sendITTRequest(messages: {
    role: string,
    content: {
        type: string,
        image_url?: { url: string }
        text?: string
    }[]
}[], useBase64: boolean): Promise<string> {
    const { url, apiKey, bodyTemplate, urlToBase64 } = ConfigManager.image;

    try {
        const bodyObject = parseBody(bodyTemplate, messages, null, null);
        const time = Date.now();

        const data = await fetchData(url, apiKey, bodyObject);

        if (data.choices && data.choices.length > 0) {
            const model = data.model;
            const usage = data.usage;
            AIManager.updateUsage(model, usage);
            
            const message = data.choices[0].message;
            const reply = message.content;

            log(`响应内容:`, reply, '\nlatency', Date.now() - time, 'ms');

            return reply;
        } else {
            throw new Error("服务器响应中没有choices或choices为空");
        }
    } catch (error) {
        console.error("在imageToText中请求出错：", error);
        if (urlToBase64 === '自动' && !useBase64) {
            log(`自动尝试使用转换为base64`);

            for (let i = 0; i < messages.length; i++) {
                const message = messages[i];
                for (let j = 0; j < message.content.length; j++) {
                    const content = message.content[j];
                    if (content.type === 'image_url') {
                        const { base64, format } = await ImageManager.imageUrlToBase64(content.image_url.url);
                        if (!base64 || !format) {
                            log(`转换为base64失败`);
                            return '';
                        }

                        message.content[j].image_url.url = `data:image/${format};base64,${base64}`;
                    }
                }
            }

            return await sendITTRequest(messages, true);
        }
        return '';
    }
}

async function fetchData(url: string, apiKey: string, bodyObject: any): Promise<any> {
    // 打印请求发送前的上下文
    const s = JSON.stringify(bodyObject.messages, (key, value) => {
        if (key === "" && Array.isArray(value)) {
            return value.filter(item => {
                return item.role !== "system";
            });
        }
        return value;
    });
    log(`请求发送前的上下文:\n`, s);

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "Accept": "application/json"
        },
        body: JSON.stringify(bodyObject)
    });

    // console.log("响应体", JSON.stringify(response, null, 2));

    const data = await response.json();

    if (!response.ok) {
        let s = `请求失败! 状态码: ${response.status}`;
        if (data.error) {
            s += `\n错误信息: ${data.error.message}`;
        }

        s += `\n响应体: ${JSON.stringify(data, null, 2)}`;

        throw new Error(s);
    }

    const text = await response.text();
    if (!text) {
        throw new Error(`响应体为空!`);
    }

    return data;
}

function parseBody(template: string[], messages: any[], tools: ToolInfo[], tool_choice: string) {
    const { isTool, usePromptEngineering } = ConfigManager.tool;
    
    const bodyObject: any = {};

    for (let i = 0; i < template.length; i++) {
        const s = template[i];
        if (s.trim() === '') {
            continue;
        }

        try {
            const obj = JSON.parse(`{${s}}`);
            const key = Object.keys(obj)[0];
            bodyObject[key] = obj[key];
        } catch (err) {
            throw new Error(`解析body的【${s}】时出现错误:${err}`);
        }
    }

    if (bodyObject?.messages === null) {
        bodyObject.messages = messages;
    }

    if (bodyObject?.stream !== false) {
        console.error(`不支持流式传输，请将stream设置为false`);
        bodyObject.stream = false;
    }

    if (isTool && !usePromptEngineering) {
        if (bodyObject?.tools === null) {
            bodyObject.tools = tools;
        }

        if (bodyObject?.tool_choice === null) {
            bodyObject.tool_choice = tool_choice;
        }
    } else {
        delete bodyObject?.tools;
        delete bodyObject?.tool_choice;
    }

    return bodyObject;
}
import { getCtx, getMsg } from "../utils/utils";
import { Tool, ToolInfo, ToolManager } from "./tool";

export function registerJrrp() {
    const info: ToolInfo = {
        type: "function",
        function: {
            name: "jrrp",
            description: `查看今日人品`,
            parameters: {
                type: "object",
                properties: {
                    name: {
                        type: 'string',
                        description: "被查看的人的名字"
                    }
                },
                required: ["name"]
            }
        }
    }

    const tool = new Tool(info);
    tool.cmdInfo = {
        ext: 'fun',
        name: 'jrrp',
        fixedArgs: []
    }
    tool.solve = async (ctx, msg, ai, name) => {
        const uid = ai.context.findUid(name);
        if (uid === null) {
            console.log(`未找到<${name}>`);
            return `未找到<${name}>`;
        }

        msg = getMsg(msg.messageType, uid, ctx.group.groupId);
        ctx = getCtx(ctx.endPoint.userId, msg);

        if (uid === ctx.endPoint.userId) {
            ctx.player.name = name;
        }

        const [s, success] = await ToolManager.extensionSolve(ctx, msg, ai, tool.cmdInfo);
        if (!success) {
            return '今日人品查询成功'
        }

        return s;
    }

    ToolManager.toolMap[info.function.name] = tool;
}
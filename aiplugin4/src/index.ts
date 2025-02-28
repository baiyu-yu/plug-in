import { AIManager } from "./AI/AI";
import { Image, ImageManager } from "./AI/image";
import { ToolManager } from "./tool/tool";
import { timerQueue } from "./tool/tool_timer";
import { ConfigManager } from "./config/config";
import { log } from "./utils/utils";
import { createMsg, createCtx } from "./utils/utils_seal";
import { getCQTypes } from "./utils/utils_string";
import { buildSystemMessage } from "./utils/utils_message";

function main() {
  let ext = seal.ext.find('aiplugin4');
  if (!ext) {
    ext = seal.ext.new('aiplugin4', 'baiyu&错误', '4.5.6');
    seal.ext.register(ext);
  }

  try {
    JSON.parse(ext.storageGet(`timerQueue`) || '[]').
      forEach((item: any) => {
        timerQueue.push(item);
      });
  } catch (e) {
    console.error('在获取timerQueue时出错', e);
  }

  ConfigManager.ext = ext;
  ConfigManager.registerConfig();
  ToolManager.registerTool();

  const CQTypesAllow = ["at", "image", "reply", "face"];

  const cmdAI = seal.ext.newCmdItemInfo();
  cmdAI.name = 'ai'; // 指令名字，可用中文
  cmdAI.help = `帮助:
【.ai st】修改权限(仅骰主可用)
【.ai ck】检查权限(仅骰主可用)
【.ai prompt】检查当前prompt(仅骰主可用)
【.ai pr】查看当前群聊权限
【.ai ctxn】查看上下文里的名字
【.ai on】开启AI
【.ai sb】开启待机模式，此时AI将记忆聊天内容
【.ai off】关闭AI，此时仍能用关键词触发
【.ai fgt】遗忘上下文
【.ai memo】修改AI的记忆
【.ai tool】AI的工具相关`;
  cmdAI.allowDelegate = true;
  cmdAI.solve = async (ctx, msg, cmdArgs) => {
    const val = cmdArgs.getArgN(1);
    const uid = ctx.player.userId;
    const gid = ctx.group.groupId;
    const id = ctx.isPrivate ? uid : gid;

    const ret = seal.ext.newCmdExecuteResult(true);
    const ai = AIManager.getAI(id);

    switch (val) {
      case 'st': {
        if (ctx.privilegeLevel < 100) {
          seal.replyToSender(ctx, msg, seal.formatTmpl(ctx, "核心:提示_无权限"));
          return ret;
        }

        const val2 = cmdArgs.getArgN(2);
        if (!val2 || val2 == 'help') {
          const s = `帮助:
【.ai st <ID> <权限限制>】

<ID>:
【QQ:1234567890】 私聊窗口
【QQ-Group:1234】 群聊窗口
【now】当前窗口

<权限限制>:
【0】普通用户
【40】邀请者
【50】群管理员
【60】群主
【100】骰主
不填写时默认为0`;

          seal.replyToSender(ctx, msg, s);
          return ret;
        }

        const limit = parseInt(cmdArgs.getArgN(3));
        if (isNaN(limit)) {
          seal.replyToSender(ctx, msg, '权限值必须为数字');
          return ret;
        }

        const id2 = val2 === 'now' ? id : val2;
        const ai2 = AIManager.getAI(id2);

        ai2.privilege.limit = limit;

        seal.replyToSender(ctx, msg, '权限修改完成');
        AIManager.saveAI(id2);
        return ret;
      }
      case 'ck': {
        if (ctx.privilegeLevel < 100) {
          seal.replyToSender(ctx, msg, seal.formatTmpl(ctx, "核心:提示_无权限"));
          return ret;
        }

        const val2 = cmdArgs.getArgN(2);
        if (!val2 || val2 == 'help') {
          const s = `帮助:
【.ai ck <ID>】

<ID>:
【QQ:1234567890】 私聊窗口
【QQ-Group:1234】 群聊窗口
【now】当前窗口`;

          seal.replyToSender(ctx, msg, s);
          return ret;
        }

        const id2 = val2 === 'now' ? id : val2;
        const ai2 = AIManager.getAI(id2);

        const pr = ai2.privilege;

        const counter = pr.counter > -1 ? `${pr.counter}条` : '关闭';
        const timer = pr.timer > -1 ? `${pr.timer}秒` : '关闭';
        const prob = pr.prob > -1 ? `${pr.prob}%` : '关闭';
        const standby = pr.standby ? '开启' : '关闭';
        const s = `${id2}\n权限限制:${pr.limit}\n计数器模式(c):${counter}\n计时器模式(t):${timer}\n概率模式(p):${prob}\n待机模式:${standby}`;
        seal.replyToSender(ctx, msg, s);
        return ret;
      }
      case 'prompt': {
        if (ctx.privilegeLevel < 100) {
          seal.replyToSender(ctx, msg, seal.formatTmpl(ctx, "核心:提示_无权限"));
          return ret;
        }

        const systemMessage = buildSystemMessage(ctx, ai);

        seal.replyToSender(ctx, msg, systemMessage.content);
        return ret;
      }
      case 'pr': {
        const pr = ai.privilege;
        if (ctx.privilegeLevel < pr.limit) {
          seal.replyToSender(ctx, msg, seal.formatTmpl(ctx, "核心:提示_无权限"));
          return ret;
        }

        const counter = pr.counter > -1 ? `${pr.counter}条` : '关闭';
        const timer = pr.timer > -1 ? `${pr.timer}秒` : '关闭';
        const prob = pr.prob > -1 ? `${pr.prob}%` : '关闭';
        const standby = pr.standby ? '开启' : '关闭';
        const s = `${id}\n权限限制:${pr.limit}\n计数器模式(c):${counter}\n计时器模式(t):${timer}\n概率模式(p):${prob}\n待机模式:${standby}`;
        seal.replyToSender(ctx, msg, s);
        return ret;
      }
      case 'ctxn': {
        const pr = ai.privilege;
        if (ctx.privilegeLevel < pr.limit) {
          seal.replyToSender(ctx, msg, seal.formatTmpl(ctx, "核心:提示_无权限"));
          return ret;
        }

        const names = ai.context.getNames();
        const s = `上下文里的名字有：\n<${names.join('>\n<')}>`;
        seal.replyToSender(ctx, msg, s);
        return ret;
      }
      case 'on': {
        const pr = ai.privilege;
        if (ctx.privilegeLevel < pr.limit) {
          seal.replyToSender(ctx, msg, seal.formatTmpl(ctx, "核心:提示_无权限"));
          return ret;
        }

        const kwargs = cmdArgs.kwargs;
        if (kwargs.length == 0) {
          const s = `帮助:
【.ai on --<参数>=<数字>】

<参数>:
【c】计数器模式，接收消息数达到后触发。
单位/条，默认10条
【t】计时器模式，最后一条消息后达到时限触发
单位/秒，默认60秒
【p】概率模式，每条消息按概率触发
单位/%，默认10%

【.ai on --t --p=42】使用示例`

          seal.replyToSender(ctx, msg, s);
          return ret;
        }

        let text = `AI已开启：`
        kwargs.forEach(kwarg => {
          const name = kwarg.name;
          const exist = kwarg.valueExists;
          const value = parseFloat(kwarg.value);

          switch (name) {
            case 'c':
            case 'counter': {
              pr.counter = exist && !isNaN(value) ? value : 10;
              text += `\n计数器模式:${pr.counter}条`;
              break;
            }
            case 't':
            case 'timer': {
              pr.timer = exist && !isNaN(value) ? value : 60;
              text += `\n计时器模式:${pr.timer}秒`;
              break;
            }
            case 'p':
            case 'prob': {
              pr.prob = exist && !isNaN(value) ? value : 10;
              text += `\n概率模式:${pr.prob}%`;
              break;
            }
          }
        });

        pr.standby = true;

        seal.replyToSender(ctx, msg, text);
        AIManager.saveAI(id);
        return ret;
      }
      case 'sb': {
        const pr = ai.privilege;
        if (ctx.privilegeLevel < pr.limit) {
          seal.replyToSender(ctx, msg, seal.formatTmpl(ctx, "核心:提示_无权限"));
          return ret;
        }

        pr.counter = -1;
        pr.timer = -1;
        pr.prob = -1;
        pr.standby = true;

        ai.clearData();

        seal.replyToSender(ctx, msg, 'AI已开启待机模式');
        AIManager.saveAI(id);
        return ret;
      }
      case 'off': {
        const pr = ai.privilege;
        if (ctx.privilegeLevel < pr.limit) {
          seal.replyToSender(ctx, msg, seal.formatTmpl(ctx, "核心:提示_无权限"));
          return ret;
        }

        const kwargs = cmdArgs.kwargs;
        if (kwargs.length == 0) {
          pr.counter = -1;
          pr.timer = -1;
          pr.prob = -1;
          pr.standby = false;

          ai.clearData();

          seal.replyToSender(ctx, msg, 'AI已关闭');
          AIManager.saveAI(id);
          return ret;
        }

        let text = `AI已关闭：`
        kwargs.forEach(kwarg => {
          const name = kwarg.name;

          switch (name) {
            case 'c':
            case 'counter': {
              pr.counter = -1;
              text += `\n计数器模式`
              break;
            }
            case 't':
            case 'timer': {
              pr.timer = -1;
              text += `\n计时器模式`
              break;
            }
            case 'p':
            case 'prob': {
              pr.prob = -1;
              text += `\n概率模式`
              break;
            }
          }
        });

        ai.clearData();

        seal.replyToSender(ctx, msg, text);
        AIManager.saveAI(id);
        return ret;
      }
      case 'f':
      case 'fgt': {
        const pr = ai.privilege;
        if (ctx.privilegeLevel < pr.limit) {
          seal.replyToSender(ctx, msg, seal.formatTmpl(ctx, "核心:提示_无权限"));
          return ret;
        }

        ai.clearData();

        const val2 = cmdArgs.getArgN(2);
        const messages = ai.context.messages;

        switch (val2) {
          case 'ass':
          case 'assistant': {
            ai.context.messages = messages.filter(item => item.role !== 'assistant');
            seal.replyToSender(ctx, msg, 'ai上下文已清除');
            AIManager.saveAI(id);
            return ret;
          }
          case 'user': {
            ai.context.messages = messages.filter(item => item.role !== 'user');
            seal.replyToSender(ctx, msg, '用户上下文已清除');
            AIManager.saveAI(id);
            return ret;
          }
          default: {
            ai.context.messages = []
            seal.replyToSender(ctx, msg, '上下文已清除');
            AIManager.saveAI(id);
            return ret;
          }
        }
      }
      case 'memo': {
        const mctx = seal.getCtxProxyFirst(ctx, cmdArgs);
        const muid = mctx.player.userId;

        if (ctx.privilegeLevel < 100 && muid !== uid) {
          seal.replyToSender(ctx, msg, seal.formatTmpl(ctx, "核心:提示_无权限"));
          return ret;
        }

        const ai2 = AIManager.getAI(muid);
        const val2 = cmdArgs.getArgN(2);
        switch (val2) {
          case 'st': {
            const s = cmdArgs.getRestArgsFrom(3);
            if (s.length > 20) {
              seal.replyToSender(ctx, msg, '记忆过长，请控制在20字以内');
              return ret;
            }
            ai2.memory.setSystemMemory(s);
            seal.replyToSender(ctx, msg, '记忆已添加');
            AIManager.saveAI(muid);
            return ret;
          }
          case 'clr': {
            const val3 = cmdArgs.getArgN(3);
            if (val3 === 'group') {
              if (ctx.isPrivate) {
                seal.replyToSender(ctx, msg, '群聊记忆仅在群聊可用');
                return ret;
              }
              ai.memory.clearMemory();
              seal.replyToSender(ctx, msg, '群聊记忆已清除');
              AIManager.saveAI(id);
              return ret;
            }
            ai2.memory.clearMemory();
            seal.replyToSender(ctx, msg, '记忆已清除');
            AIManager.saveAI(muid);
            return ret;
          }
          case 'show': {
            const val3 = cmdArgs.getArgN(3);
            if (val3 === 'group') {
              if (ctx.isPrivate) {
                seal.replyToSender(ctx, msg, '群聊记忆仅在群聊可用');
                return ret;
              }
              if (ai.memory.memoryList.length === 0) {
                seal.replyToSender(ctx, msg, '暂无群聊记忆');
                return ret;
              }
              const s = ai.memory.buildGroupMemoryPrompt();
              seal.replyToSender(ctx, msg, s);
              return ret;
            }

            if (ai2.memory.memoryList.length === 0) {
              seal.replyToSender(ctx, msg, '暂无记忆');
              return ret;
            }
            const s = ai2.memory.buildPersonMemoryPrompt();
            seal.replyToSender(ctx, msg, s);
            return ret;
          }
          default: {
            const s = `帮助:
【.ai memo st <内容>】设置记忆
【.ai memo clr】清除记忆
【.ai memo clr group】清除群聊记忆
【.ai memo show】展示个人记忆
【.ai memo show group】展示群聊记忆`;

            seal.replyToSender(ctx, msg, s);
            return ret;
          }
        }
      }
      case 'tool': {
        const val2 = cmdArgs.getArgN(2);
        switch (val2) {
          case '': {
            const toolStatus = ai.tool.toolStatus;

            let i = 1;
            let s = '工具函数如下:';
            Object.keys(toolStatus).forEach(key => {
              const status = toolStatus[key] ? '开' : '关';
              s += `\n${i++}. ${key}[${status}]`;
            });

            seal.replyToSender(ctx, msg, s);
            return ret;
          }
          case 'help': {
            const val3 = cmdArgs.getArgN(3);
            if (!val3) {
              const s = `帮助:
【.ai tool】列出所有工具
【.ai tool help <函数名>】查看工具详情
【.ai tool [on/off]】开启或关闭全部工具函数
【.ai tool <函数名> [on/off]】开启或关闭工具函数
【.ai tool <函数名> --参数名=具体参数】试用工具函数
`;
              seal.replyToSender(ctx, msg, s);
              return ret;
            }

            if (!ToolManager.toolMap.hasOwnProperty(val3)) {
              seal.replyToSender(ctx, msg, '没有这个工具函数');
              return ret;
            }

            const tool = ToolManager.toolMap[val3];
            const s = `${tool.info.function.name}
描述:${tool.info.function.description}

参数:
${Object.keys(tool.info.function.parameters.properties).map(key => {
              const property = tool.info.function.parameters.properties[key];
              return `【${key}】${property.description}`;
            }).join('\n')}

必需参数:${tool.info.function.parameters.required.join(',')}`;

            seal.replyToSender(ctx, msg, s);
            return ret;
          }
          case 'on': {
            const toolsNotAllow = ConfigManager.tool.toolsNotAllow;
            for (const key in ai.tool.toolStatus) {
              ai.tool.toolStatus[key] = toolsNotAllow.includes(key) ? false : true;
            }
            seal.replyToSender(ctx, msg, '已开启全部工具函数');
            AIManager.saveAI(id);
            return ret;
          }
          case 'off': {
            for (const key in ai.tool.toolStatus) {
              ai.tool.toolStatus[key] = false;
            }
            seal.replyToSender(ctx, msg, '已关闭全部工具函数');
            AIManager.saveAI(id);
            return ret;
          }
          default: {
            if (!ToolManager.toolMap.hasOwnProperty(val2)) {
              seal.replyToSender(ctx, msg, '没有这个工具函数');
              return ret;
            }

            // 开启或关闭工具函数
            const val3 = cmdArgs.getArgN(3);
            if (val3 === 'on') {
              const toolsNotAllow = ConfigManager.tool.toolsNotAllow;
              if (toolsNotAllow.includes(val2)) {
                seal.replyToSender(ctx, msg, `工具函数 ${val2} 不被允许开启`);
                return ret;
              }

              ai.tool.toolStatus[val2] = true;
              seal.replyToSender(ctx, msg, `已开启工具函数 ${val2}`);
              AIManager.saveAI(id);
              return ret;
            } else if (val3 === 'off') {
              ai.tool.toolStatus[val2] = false;
              seal.replyToSender(ctx, msg, `已关闭工具函数 ${val2}`);
              AIManager.saveAI(id);
              return ret;
            }

            // 调用工具函数
            if (ctx.privilegeLevel < 100) {
              seal.replyToSender(ctx, msg, seal.formatTmpl(ctx, "核心:提示_无权限"));
              return ret;
            }

            if (ToolManager.cmdArgs == null) {
              seal.replyToSender(ctx, msg, `暂时无法调用函数，请先使用任意指令`);
              return ret;
            }

            const tool = ToolManager.toolMap[val2];

            try {
              const args = cmdArgs.kwargs.reduce((acc, kwarg) => {
                const valueString = kwarg.value;
                try {
                  acc[kwarg.name] = JSON.parse(`[${valueString}]`)[0];
                } catch (e) {
                  acc[kwarg.name] = valueString;
                }
                return acc;
              }, {});

              if (tool.info.function.parameters.required.some(key => !args.hasOwnProperty(key))) {
                log(`调用函数失败:缺少必需参数`);
                seal.replyToSender(ctx, msg, `调用函数失败:缺少必需参数`);
                return ret;
              }

              const s = await tool.solve(ctx, msg, ai, args);
              seal.replyToSender(ctx, msg, s);
              return ret;
            } catch (e) {
              const s = `调用函数 (${val2}) 失败:${e.message}`;
              seal.replyToSender(ctx, msg, s);
              return ret;
            }
          }
        }
      }
      case 'help':
      default: {
        seal.replyToSender(ctx, msg, cmdAI.help);
        return ret;
      }
    }
  }

  const cmdImage = seal.ext.newCmdItemInfo();
  cmdImage.name = 'img'; // 指令名字，可用中文
  cmdImage.help = `盗图指南:
【img draw [stl/lcl/all]】随机抽取偷的图片/本地图片/全部
【img stl (on/off)】偷图 开启/关闭
【img f】遗忘
【img itt [图片/ran] (附加提示词)】图片转文字`;
  cmdImage.solve = async (ctx, msg, cmdArgs) => {
    const val = cmdArgs.getArgN(1);
    const uid = ctx.player.userId;
    const gid = ctx.group.groupId;
    const id = ctx.isPrivate ? uid : gid;

    const ret = seal.ext.newCmdExecuteResult(true);
    const ai = AIManager.getAI(id);

    switch (val) {
      case 'draw': {
        const type = cmdArgs.getArgN(2);
        switch (type) {
          case 'lcl':
          case 'local': {
            const image = ai.image.drawLocalImageFile();
            if (!image) {
              seal.replyToSender(ctx, msg, '暂无本地图片');
              return ret;
            }
            seal.replyToSender(ctx, msg, `[CQ:image,file=${image}]`);
            return ret;
          }
          case 'stl':
          case 'stolen': {
            const image = await ai.image.drawStolenImageFile();
            if (!image) {
              seal.replyToSender(ctx, msg, '暂无偷取图片');
              return ret;
            }
            seal.replyToSender(ctx, msg, `[CQ:image,file=${image}]`);
            return ret;
          }
          case 'all': {
            const image = await ai.image.drawImageFile();
            if (!image) {
              seal.replyToSender(ctx, msg, '暂无图片');
              return ret;
            }
            seal.replyToSender(ctx, msg, `[CQ:image,file=${image}]`);
            return ret;
          }
          default: {
            seal.replyToSender(ctx, msg, cmdImage.help);
            return ret;
          }
        }
      }
      case 'stl':
      case 'steal': {
        const op = cmdArgs.getArgN(2)
        switch (op) {
          case 'on': {
            ai.image.stealStatus = true;
            seal.replyToSender(ctx, msg, `图片偷取已开启,当前偷取数量:${ai.image.imageList.length}`);
            AIManager.saveAI(id);
            return ret;
          }
          case 'off': {
            ai.image.stealStatus = false;
            seal.replyToSender(ctx, msg, `图片偷取已关闭,当前偷取数量:${ai.image.imageList.length}`);
            AIManager.saveAI(id);
            return ret;
          }
          default: {
            seal.replyToSender(ctx, msg, `图片偷取状态:${ai.image.stealStatus},当前偷取数量:${ai.image.imageList.length}`);
            return ret;
          }
        }
      }
      case 'f':
      case 'fgt':
      case 'forget': {
        ai.image.imageList = [];
        seal.replyToSender(ctx, msg, '图片已遗忘');
        AIManager.saveAI(id);
        return ret;
      }
      case 'itt': {
        const val2 = cmdArgs.getArgN(2);
        if (!val2) {
          seal.replyToSender(ctx, msg, '【img itt [图片/ran] (附加提示词)】图片转文字');
          return ret;
        }

        let url = '';
        if (val2 == 'ran') {
          url = await ai.image.drawStolenImageFile();
          if (!url) {
            seal.replyToSender(ctx, msg, '图片偷取为空');
            return ret;
          }
        } else {
          const match = val2.match(/\[CQ:image,file=(.*?)\]/);
          if (!match) {
            seal.replyToSender(ctx, msg, '请附带图片');
            return ret;
          }

          url = match[1];
        }

        const text = cmdArgs.getRestArgsFrom(3);
        const s = await ImageManager.imageToText(url, text);
        seal.replyToSender(ctx, msg, `[CQ:image,file=${url}]\n` + s);
        return ret;
      }
      default: {
        seal.replyToSender(ctx, msg, cmdImage.help);
        return ret;
      }
    }
  }

  // 将命令注册到扩展中
  ext.cmdMap['AI'] = cmdAI;
  ext.cmdMap['ai'] = cmdAI;
  ext.cmdMap['img'] = cmdImage;

  //接受非指令消息
  ext.onNotCommandReceived = async (ctx, msg) => {
    const { disabledInPrivate, keyWords, condition } = ConfigManager.received;
    if (ctx.isPrivate && disabledInPrivate) {
      return;
    }

    const userId = ctx.player.userId;
    const groupId = ctx.group.groupId;
    const id = ctx.isPrivate ? userId : groupId;

    let message = msg.message;
    let images: Image[] = [];
    const ai = AIManager.getAI(id);

    // 检查CQ码
    const CQTypes = getCQTypes(message);
    if (CQTypes.length === 0 || CQTypes.every(item => CQTypesAllow.includes(item))) {
      // 非指令触发图片偷取，以及图片转文字
      if (CQTypes.includes('image')) {
        const result = await ImageManager.handleImageMessage(ctx, message);
        message = result.message;
        images = result.images;
        if (ai.image.stealStatus) {
          ai.image.updateImageList(images);
        }
      }

      clearTimeout(ai.context.timer);
      ai.context.timer = null;

      // 非指令触发
      if (keyWords.some(item => {
        try {
          const pattern = new RegExp(item);
          return pattern.test(message);
        } catch (error) {
          console.error('Error in RegExp:', error);
          return false;
        }
      })) {
        const fmtCondition = parseInt(seal.format(ctx, `{${condition}}`));
        if (fmtCondition === 1) {
          await ai.context.iteration(ctx, message, images, 'user');

          log('非指令触发回复');
          await ai.chat(ctx, msg);
          AIManager.saveAI(id);
          return;
        }
      }

      // 开启任一模式时
      else {
        const pr = ai.privilege;
        if (pr.standby) {
          await ai.context.iteration(ctx, message, images, 'user');
        }

        if (pr.counter > -1) {
          ai.context.counter += 1;

          if (ai.context.counter >= pr.counter) {
            log('计数器触发回复');
            ai.context.counter = 0;

            await ai.chat(ctx, msg);
            AIManager.saveAI(id);
            return;
          }
        }

        if (pr.prob > -1) {
          const ran = Math.random() * 100;

          if (ran <= pr.prob) {
            log('概率触发回复');

            await ai.chat(ctx, msg);
            AIManager.saveAI(id);
            return;
          }
        }

        if (pr.timer > -1) {
          ai.context.timer = setTimeout(async () => {
            log('计时器触发回复');

            ai.context.timer = null;
            await ai.chat(ctx, msg);
            AIManager.saveAI(id);
          }, pr.timer * 1000 + Math.floor(Math.random() * 500));
        }
      }
    }
  }

  //接受的指令
  ext.onCommandReceived = async (ctx, msg, cmdArgs) => {
    if (ToolManager.cmdArgs === null) {
      ToolManager.cmdArgs = cmdArgs;
    }

    const { allcmd } = ConfigManager.received;
    if (allcmd) {
      const uid = ctx.player.userId;
      const gid = ctx.group.groupId;
      const id = ctx.isPrivate ? uid : gid;

      const ai = AIManager.getAI(id);

      let message = msg.message;
      let images: Image[] = [];

      const CQTypes = getCQTypes(message);
      if (CQTypes.length === 0 || CQTypes.every(item => CQTypesAllow.includes(item))) {
        const pr = ai.privilege;
        if (pr.standby) {
          const result = await ImageManager.handleImageMessage(ctx, message);
          message = result.message;
          images = result.images;
          await ai.context.iteration(ctx, message, images, 'user');
        }
      }
    }
  }

  //骰子发送的消息
  ext.onMessageSend = async (ctx, msg) => {
    const uid = ctx.player.userId;
    const gid = ctx.group.groupId;
    const id = ctx.isPrivate ? uid : gid;

    const ai = AIManager.getAI(id);

    let message = msg.message;
    let images: Image[] = [];

    if (ai.listen.status) {
      ai.listen.status = false;
      ai.listen.content = message;
      return;
    }

    const { allmsg } = ConfigManager.received;
    if (allmsg) {
      if (message === ai.context.lastReply) {
        ai.context.lastReply = '';
        return;
      }

      const CQTypes = getCQTypes(message);
      if (CQTypes.length === 0 || CQTypes.every(item => CQTypesAllow.includes(item))) {
        const pr = ai.privilege;
        if (pr.standby) {
          const result = await ImageManager.handleImageMessage(ctx, message);
          message = result.message;
          images = result.images;
          await ai.context.iteration(ctx, message, images, 'assistant');
          return;
        }
      }
    }
  }



  let isTaskRunning = false;
  seal.ext.registerTask(ext, "cron", "* * * * *", async () => {
    if (timerQueue.length === 0) {
      return;
    }

    if (isTaskRunning) {
      log('定时器任务正在运行，跳过');
      return;
    }

    isTaskRunning = true;

    for (let i = 0; i < timerQueue.length && i >= 0; i++) {
      const timestamp = timerQueue[i].timestamp;
      if (timestamp > Math.floor(Date.now() / 1000)) {
        continue;
      }

      const setTime = timerQueue[i].setTime;
      const content = timerQueue[i].content;
      const id = timerQueue[i].id;
      const messageType = timerQueue[i].messageType;
      const uid = timerQueue[i].uid;
      const gid = timerQueue[i].gid;
      const epId = timerQueue[i].epId;
      const msg = createMsg(messageType, uid, gid);
      const ctx = createCtx(epId, msg);
      const ai = AIManager.getAI(id);

      const s = `你设置的定时器触发了，请按照以下内容发送回复：
定时器设定时间：${setTime}
当前触发时间：${new Date().toLocaleString()}
提示内容：${content}`;

      await ai.context.systemUserIteration("_定时器触发提示", s);

      log('定时任务触发回复');
      ai.isChatting = false;
      await ai.chat(ctx, msg);
      AIManager.saveAI(id);

      timerQueue.splice(i, 1);
      i--;

      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    ext.storageSet(`timerQueue`, JSON.stringify(timerQueue));

    isTaskRunning = false;
  })
}

main();

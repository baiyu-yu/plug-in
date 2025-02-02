// ==UserScript==
// @name         AI骰娘4
// @author       错误、白鱼
// @version      4.3.1
// @description  适用于大部分OpenAI API兼容格式AI的模型插件，测试环境为 Deepseek AI (https://platform.deepseek.com/)，用于与 AI 进行对话，并根据特定关键词触发回复。使用.AI help查看使用方法。具体配置查看插件配置项。\nopenai标准下的function calling功能已进行适配，原有的基于解析返回文本的AI命令已经被完全替换。选用模型是否支持该功能请查看相应接口文档。
// @timestamp    1733387279
// 2024-12-05 16:27:59
// @license      MIT
// @homepageURL  https://github.com/error2913/sealdice-js/
// @updateUrl    https://mirror.ghproxy.com/https://raw.githubusercontent.com/baiyu-yu/plug-in/main/aiplugin4.js
// @updateUrl    https://raw.githubusercontent.com//baiyu-yu/plug-in/main/aiplugin4.js
// ==/UserScript==

(() => {
  // src/utils/utils.ts
  function getCQTypes(s) {
    const match = s.match(/\[CQ:([^,]*?),.*?\]/g);
    if (match) {
      return match.map((item) => item.match(/\[CQ:([^,]*?),/)[1]);
    } else {
      return [];
    }
  }
  function getMsg(messageType, senderId, groupId = "") {
    let msg = seal.newMessage();
    if (messageType == "group") {
      msg.groupId = groupId;
      msg.guildId = "";
    }
    msg.messageType = messageType;
    msg.sender.userId = senderId;
    return msg;
  }
  function getCtx(epId, msg) {
    const eps = seal.getEndPoints();
    for (let i = 0; i < eps.length; i++) {
      if (eps[i].userId === epId) {
        return seal.createTempCtx(eps[i], msg);
      }
    }
    return void 0;
  }
  function getNameById(epId, gid, uid, diceName) {
    if (epId === uid) {
      return diceName;
    }
    const msg = getMsg(gid === "" ? "private" : "group", uid, gid);
    const ctx = getCtx(epId, msg);
    return ctx.player.name || "未知用户";
  }
  function parseBody(template, messages, tools, tool_choice) {
    try {
      const bodyObject = JSON.parse(`{${template.join(",")}}`);
      if (bodyObject.messages === null) {
        bodyObject.messages = messages;
      }
      if (bodyObject.stream !== false) {
        console.error(`不支持流式传输，请将stream设置为false`);
        bodyObject.stream = false;
      }
      if (bodyObject.tools === null) {
        bodyObject.tools = tools;
      }
      if (bodyObject.tool_choice === null) {
        bodyObject.tool_choice = tool_choice;
      }
      return bodyObject;
    } catch (err) {
      throw new Error(`解析body时出现错误:${err}`);
    }
  }
  function levenshteinDistance(s1, s2) {
    const len1 = s1.length;
    const len2 = s2.length;
    const dp = Array.from({ length: len1 + 1 }, () => Array(len2 + 1).fill(0));
    for (let i = 0; i <= len1; i++) {
      dp[i][0] = i;
    }
    for (let j = 0; j <= len2; j++) {
      dp[0][j] = j;
    }
    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        if (s1[i - 1] === s2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1];
        } else {
          dp[i][j] = Math.min(
            dp[i - 1][j] + 1,
            // 删除
            dp[i][j - 1] + 1,
            // 插入
            dp[i - 1][j - 1] + 1
            // 替换
          );
        }
      }
    }
    return dp[len1][len2];
  }
  function calculateSimilarity(s1, s2) {
    if (s1.length === 0 || s2.length === 0) {
      return 0;
    }
    const distance = levenshteinDistance(s1, s2);
    const maxLength = Math.max(s1.length, s2.length);
    return 1 - distance / maxLength;
  }
  async function handleReply(ctx, msg, s, context) {
    const { maxChar, replymsg, stopRepeat, similarityLimit } = ConfigManager.getHandleReplyConfig();
    const segments = s.split(/<[\|｜]from.*?[\|｜]?>/).filter((item) => item.trim() !== "");
    if (segments.length === 0) {
      return { s: "", reply: "", isRepeat: false };
    }
    const match = s.match(/<[\|｜]图片.+?[\|｜]?>/g);
    if (match) {
      for (let i = 0; i < match.length; i++) {
        const id = match[i].match(/<[\|｜]图片(.+?)[\|｜]?>/)[1];
        const image = context.findImage(id);
        if (image) {
          const file = image.file;
          if (!image.isUrl || image.isUrl && await ImageManager.checkImageUrl(file)) {
            s = s.replace(match[i], `[CQ:image,file=${file}]`);
            continue;
          }
        }
        s = s.replace(match[i], ``);
      }
    }
    s = segments[0].replace(/<br>/g, "\n").slice(0, maxChar);
    const prefix = replymsg ? `[CQ:reply,id=${msg.rawId}][CQ:at,qq=${ctx.player.userId.replace(/\D+/g, "")}] ` : ``;
    const reply = prefix + s.replace(/<@(.+?)>/g, (_, p1) => {
      const uid = context.findUid(p1);
      if (uid !== null) {
        return `[CQ:at,qq=${uid.replace(/\D+/g, "")}] `;
      } else {
        return ` @${p1} `;
      }
    }).replace(/<[\|｜].*?[\|｜]?>/g, "");
    let isRepeat = false;
    if (stopRepeat) {
      const messages = context.messages;
      for (let i = messages.length - 1; i >= 0; i--) {
        const message = messages[i];
        if (message.role === "assistant" && !(message == null ? void 0 : message.tool_calls)) {
          const content = message.content;
          const clearText = content.replace(/<[\|｜].*?[\|｜]>/g, "");
          const similarity = calculateSimilarity(clearText.trim(), s.trim());
          ConfigManager.printLog(`复读相似度：${similarity}`);
          if (similarity > similarityLimit) {
            isRepeat = true;
            let start = i;
            let count = 1;
            for (let j = i - 1; j >= 0; j--) {
              const message2 = messages[j];
              if (message2.role === "tool" || message2.role === "assistant" && (message2 == null ? void 0 : message2.tool_calls)) {
                start = j;
                count++;
              } else {
                break;
              }
            }
            messages.splice(start, count);
          }
          break;
        }
      }
    }
    return { s, reply, isRepeat };
  }
  function generateId() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 6);
    return (timestamp + random).slice(-6);
  }

  // src/tools/tool_attr.ts
  function registerAttrShow() {
    const info = {
      type: "function",
      function: {
        name: "attr_show",
        description: "展示指定玩家的全部个人属性",
        parameters: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "玩家名称"
            }
          },
          required: ["name"]
        }
      }
    };
    const tool = new Tool(info);
    tool.cmdInfo = {
      ext: "coc7",
      name: "st",
      fixedArgs: ["show"]
    };
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
        return "展示完成";
      }
      return s;
    };
    ToolManager.toolMap[info.function.name] = tool;
  }

  // src/tools/tool_ban.ts
  function registerBan() {
    const info = {
      type: "function",
      function: {
        name: "ban",
        description: "禁言指定用户",
        parameters: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "用户名称"
            },
            duration: {
              type: "integer",
              description: "禁言时长，单位为秒，最大为2591940"
            }
          },
          required: ["name", "duration"]
        }
      }
    };
    const tool = new Tool(info);
    tool.solve = async (ctx, msg, ai, name, duration) => {
      const ext = seal.ext.find("HTTP依赖");
      if (!ext) {
        console.error(`未找到HTTP依赖`);
        return `未找到HTTP依赖，请提示用户安装HTTP依赖`;
      }
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
      try {
        const epId = ctx.endPoint.userId;
        const group_id = ctx.group.groupId.replace(/\D+/g, "");
        const user_id = ctx.player.userId.replace(/\D+/g, "");
        globalThis.http.getData(epId, `set_group_ban?group_id=${group_id}&user_id=${user_id}&duration=${duration}`);
        return `已禁言<${name}> ${duration}秒`;
      } catch (e) {
        console.error(e);
        return `禁言失败`;
      }
    };
    ToolManager.toolMap[info.function.name] = tool;
  }

  // src/tools/tool_draw_deck.ts
  function registerDrawDeck() {
    const { decks } = ConfigManager.getDeckConfig();
    const info = {
      type: "function",
      function: {
        name: "draw_deck",
        description: `用牌堆名称抽取牌堆，返回抽取结果，牌堆的名字有:${decks.join("、")}`,
        parameters: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "牌堆名称"
            }
          },
          required: ["name"]
        }
      }
    };
    const tool = new Tool(info);
    tool.solve = async (ctx, msg, _, name) => {
      const dr = seal.deck.draw(ctx, name, true);
      if (!dr.exists) {
        console.error(`牌堆${name}不存在:${dr.err}`);
        return `牌堆${name}不存在:${dr.err}`;
      }
      const result = dr.result;
      if (result == null) {
        console.error(`牌堆${name}结果为空:${dr.err}`);
        return `牌堆${name}结果为空:${dr.err}`;
      }
      seal.replyToSender(ctx, msg, result);
      return result;
    };
    ToolManager.toolMap[info.function.name] = tool;
  }

  // src/tools/tool_face.ts
  function registerFace() {
    const { localImages } = ConfigManager.getLocalImageConfig();
    const info = {
      type: "function",
      function: {
        name: "face",
        description: `发送表情包，表情名称有:${Object.keys(localImages).length === 0 ? "暂无表情" : Object.keys(localImages).join("、")}`,
        parameters: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "表情名称"
            }
          },
          required: ["name"]
        }
      }
    };
    const tool = new Tool(info);
    tool.solve = async (ctx, msg, _, name) => {
      const { localImages: localImages2 } = ConfigManager.getLocalImageConfig();
      if (localImages2.hasOwnProperty(name)) {
        seal.replyToSender(ctx, msg, `[CQ:image,file=${localImages2[name]}]`);
        return "发送成功";
      } else {
        console.error(`本地图片${name}不存在`);
        return `本地图片${name}不存在`;
      }
    };
    ToolManager.toolMap[info.function.name] = tool;
  }

  // src/tools/tool_get_time.ts
  function registerGetTime() {
    const info = {
      type: "function",
      function: {
        name: "get_time",
        description: `获取当前时间`,
        parameters: {
          type: "object",
          properties: {},
          required: []
        }
      }
    };
    const tool = new Tool(info);
    tool.solve = async (_, __, ___) => {
      return (/* @__PURE__ */ new Date()).toLocaleString();
    };
    ToolManager.toolMap[info.function.name] = tool;
  }

  // src/tools/tool_jrrp.ts
  function registerJrrp() {
    const info = {
      type: "function",
      function: {
        name: "jrrp",
        description: `查看今日人品`,
        parameters: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "被查看的人的名字"
            }
          },
          required: ["name"]
        }
      }
    };
    const tool = new Tool(info);
    tool.cmdInfo = {
      ext: "fun",
      name: "jrrp",
      fixedArgs: []
    };
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
        return "今日人品查询成功";
      }
      return s;
    };
    ToolManager.toolMap[info.function.name] = tool;
  }

  // src/tools/tool_memory.ts
  function registerMemory() {
    const info = {
      type: "function",
      function: {
        name: "memory",
        description: "添加记忆或者留下对别人印象，尽量不要重复",
        parameters: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "用户名称"
            },
            content: {
              type: "string",
              description: "记忆内容"
            }
          },
          required: ["name", "content"]
        }
      }
    };
    const tool = new Tool(info);
    tool.solve = async (ctx, msg, ai, name, content) => {
      const ext = seal.ext.find("HTTP依赖");
      if (!ext) {
        console.error(`未找到HTTP依赖`);
        return `未找到HTTP依赖，请提示用户安装HTTP依赖`;
      }
      const uid = ai.context.findUid(name);
      if (uid === null) {
        console.log(`未找到<${name}>`);
        return `未找到<${name}>`;
      }
      msg = getMsg(msg.messageType, uid, ctx.group.groupId);
      ctx = getCtx(ctx.endPoint.userId, msg);
      if (uid === ctx.endPoint.userId) {
        ctx.player.name = name;
        console.error("不能添加自己的记忆");
        return `不能添加自己的记忆`;
      }
      ai = AIManager.getAI(uid);
      ai.memory.addMemory(ctx.group.groupId, ctx.group.groupName, content);
      AIManager.saveAI(uid);
      return `添加记忆成功`;
    };
    ToolManager.toolMap[info.function.name] = tool;
  }

  // src/tools/tool_modu.ts
  function registerModuRoll() {
    const info = {
      type: "function",
      function: {
        name: "modu_roll",
        description: `抽取随机COC模组`,
        parameters: {
          type: "object",
          properties: {},
          required: []
        }
      }
    };
    const tool = new Tool(info);
    tool.cmdInfo = {
      ext: "story",
      name: "modu",
      fixedArgs: ["roll"]
    };
    tool.solve = async (ctx, msg, ai) => {
      const [s, success] = await ToolManager.extensionSolve(ctx, msg, ai, tool.cmdInfo);
      if (!success) {
        return "今日人品查询成功";
      }
      return s;
    };
    ToolManager.toolMap[info.function.name] = tool;
  }
  function registerModuSearch() {
    const info = {
      type: "function",
      function: {
        name: "modu_search",
        description: `搜索COC模组`,
        parameters: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "要搜索的关键词"
            }
          },
          required: ["name"]
        }
      }
    };
    const tool = new Tool(info);
    tool.cmdInfo = {
      ext: "story",
      name: "modu",
      fixedArgs: ["search"]
    };
    tool.solve = async (ctx, msg, ai, name) => {
      const [s, success] = await ToolManager.extensionSolve(ctx, msg, ai, tool.cmdInfo, name);
      if (!success) {
        return "今日人品查询成功";
      }
      return s;
    };
    ToolManager.toolMap[info.function.name] = tool;
  }

  // src/tools/tool_poke.ts
  function registerPoke() {
    const info = {
      type: "function",
      function: {
        name: "poke",
        description: "对用户发送戳一戳",
        parameters: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "用户名称"
            }
          },
          required: ["name"]
        }
      }
    };
    const tool = new Tool(info);
    tool.solve = async (ctx, msg, ai, name) => {
      const ext = seal.ext.find("HTTP依赖");
      if (!ext) {
        console.error(`未找到HTTP依赖`);
        return `未找到HTTP依赖，请提示用户安装HTTP依赖`;
      }
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
      try {
        const epId = ctx.endPoint.userId;
        const group_id = ctx.group.groupId.replace(/\D+/g, "");
        const user_id = ctx.player.userId.replace(/\D+/g, "");
        globalThis.http.getData(epId, `group_poke?group_id=${group_id}&user_id=${user_id}`);
        return `已向<${name}>发送戳一戳`;
      } catch (e) {
        console.error(e);
        return `发送戳一戳失败`;
      }
    };
    ToolManager.toolMap[info.function.name] = tool;
  }

  // src/tools/tool_rename.ts
  function registerRename() {
    const info = {
      type: "function",
      function: {
        name: "rename",
        description: `设置群名片`,
        parameters: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "要修改的名字"
            },
            new_name: {
              type: "string",
              description: "新的名字"
            }
          },
          required: ["name", "new_name"]
        }
      }
    };
    const tool = new Tool(info);
    tool.solve = async (ctx, msg, ai, name, new_name) => {
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
      try {
        seal.setPlayerGroupCard(ctx, new_name);
        seal.replyToSender(ctx, msg, `已将<${ctx.player.name}>的群名片设置为<${new_name}>`);
        return "设置成功";
      } catch (e) {
        console.error(e);
        return "设置失败";
      }
    };
    ToolManager.toolMap[info.function.name] = tool;
  }

  // src/tools/tool_roll_check.ts
  function registerRollCheck() {
    const info = {
      type: "function",
      function: {
        name: "roll_check",
        description: `进行一次技能检定或属性检定`,
        parameters: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "被检定的人的名称"
            },
            attr: {
              type: "string",
              description: "被检定的技能或属性"
            },
            reason: {
              type: "string",
              description: "检定的原因，默认为空"
            }
          },
          required: ["name", "attr"]
        }
      }
    };
    const tool = new Tool(info);
    tool.cmdInfo = {
      ext: "coc7",
      name: "rc",
      fixedArgs: []
    };
    tool.solve = async (ctx, msg, ai, name, attr, reason = "") => {
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
      const [v, _] = seal.vars.intGet(ctx, attr);
      if (v == 0) {
        attr += "50";
      }
      const [s, success] = await ToolManager.extensionSolve(ctx, msg, ai, tool.cmdInfo, attr, reason);
      if (!success) {
        return "检定完成";
      }
      return s;
    };
    ToolManager.toolMap[info.function.name] = tool;
  }

  // src/tools/tool_set_timer.ts
  var timerQueue = [];
  function registerSetTimer() {
    const info = {
      type: "function",
      function: {
        name: "set_timer",
        description: "设置一个定时器，在指定时间后触发",
        parameters: {
          type: "object",
          properties: {
            time: {
              type: "integer",
              description: "时间，单位为分钟"
            },
            content: {
              type: "string",
              description: "触发时给自己的的提示词"
            }
          },
          required: ["time", "content"]
        }
      }
    };
    const tool = new Tool(info);
    tool.solve = async (ctx, msg, ai, time, content) => {
      const t = parseInt(time);
      if (isNaN(t)) {
        return "时间应为数字";
      }
      timerQueue.push({
        id: ai.id,
        messageType: msg.messageType,
        uid: ctx.player.userId,
        gid: ctx.group.groupId,
        epId: ctx.endPoint.userId,
        timestamp: Math.floor(Date.now() / 1e3) + t * 60,
        setTime: (/* @__PURE__ */ new Date()).toLocaleString(),
        content
      });
      ConfigManager.ext.storageSet(`timerQueue`, JSON.stringify(timerQueue));
      return `设置定时器成功，将在${time}分钟后触发`;
    };
    ToolManager.toolMap[info.function.name] = tool;
  }

  // src/tools/tool_tts.ts
  var characterMap = {
    "小新": "lucy-voice-laibixiaoxin",
    "猴哥": "lucy-voice-houge",
    "四郎": "lucy-voice-silang",
    "东北老妹儿": "lucy-voice-guangdong-f1",
    "广西大表哥": "lucy-voice-guangxi-m1",
    "妲己": "lucy-voice-daji",
    "霸道总裁": "lucy-voice-lizeyan",
    "酥心御姐": "lucy-voice-suxinjiejie",
    "说书先生": "lucy-voice-m8",
    "憨憨小弟": "lucy-voice-male1",
    "憨厚老哥": "lucy-voice-male3",
    "吕布": "lucy-voice-lvbu",
    "元气少女": "lucy-voice-xueling",
    "文艺少女": "lucy-voice-f37",
    "磁性大叔": "lucy-voice-male2",
    "邻家小妹": "lucy-voice-female1",
    "低沉男声": "lucy-voice-m14",
    "傲娇少女": "lucy-voice-f38",
    "爹系男友": "lucy-voice-m101",
    "暖心姐姐": "lucy-voice-female2",
    "温柔妹妹": "lucy-voice-f36",
    "书香少女": "lucy-voice-f34"
  };
  function registerTTS() {
    const info = {
      type: "function",
      function: {
        name: "tts",
        description: "发送AI声聊合成语音",
        parameters: {
          type: "object",
          properties: {
            text: {
              type: "string",
              description: "要合成的文本"
            }
          },
          required: ["text"]
        }
      }
    };
    const tool = new Tool(info);
    tool.solve = async (ctx, _, __, text) => {
      const ext = seal.ext.find("HTTP依赖");
      if (!ext) {
        console.error(`未找到HTTP依赖`);
        return `未找到HTTP依赖，请提示用户安装HTTP依赖`;
      }
      try {
        const { character } = ConfigManager.getTTSConfig();
        const characterId = characterMap[character];
        const epId = ctx.endPoint.userId;
        const group_id = ctx.group.groupId.replace(/\D+/g, "");
        globalThis.http.getData(epId, `send_group_ai_record?character=${characterId}&group_id=${group_id}&text=${text}`);
        return `发送语音成功`;
      } catch (e) {
        console.error(e);
        return `发送语音失败`;
      }
    };
    ToolManager.toolMap[info.function.name] = tool;
  }

  // src/tools/tool_web_search.ts
  function registerWebSearch() {
    const info = {
      type: "function",
      function: {
        name: "web_search",
        description: `使用搜索引擎搜索`,
        parameters: {
          type: "object",
          properties: {
            q: {
              type: "string",
              description: "搜索内容"
            },
            page: {
              type: "integer",
              description: "页码"
            },
            categories: {
              type: "string",
              description: "搜索分类",
              enum: ["general", "images", "videos", "news", "map", "music", "it", "science", "files", "social_media"]
            },
            time_range: {
              type: "string",
              description: "时间范围",
              enum: ["", "day", "week", "month", "year"]
            }
          },
          required: ["q"]
        }
      }
    };
    const tool = new Tool(info);
    tool.solve = async (_, __, ___, q, page, categories, time_range) => {
      let part = 1;
      let pageno = "";
      if (page) {
        part = parseInt(page) % 2;
        pageno = page ? Math.ceil(parseInt(page) / 2).toString() : "";
      }
      const url = `http://110.41.69.149:8080/search?q=${q}&format=json${pageno ? `&pageno=${pageno}` : ""}${categories ? `&categories=${categories}` : ""}${time_range ? `&time_range=${time_range}` : ""}`;
      try {
        ConfigManager.printLog(`使用搜索引擎搜索:${url}`);
        const response = await fetch(url, {
          method: "GET",
          headers: {
            "Content-Type": "application/json"
          }
        });
        if (!response.ok) {
          const data2 = await response.json();
          throw new Error(`HTTP错误! 状态码: ${response.status}，内容: ${response.statusText}，错误信息: ${data2.error.message}`);
        }
        const data = await response.json();
        if (data.error) {
          throw new Error(`请求失败：${JSON.stringify(data.error.message)}`);
        }
        const number_of_results = data.number_of_results;
        const results_length = data.results.length;
        const results = part == 1 ? data.results.slice(0, Math.ceil(results_length / 2)) : data.results.slice(Math.ceil(results_length / 2));
        if (number_of_results == 0 || results.length == 0) {
          return `没有搜索到结果`;
        }
        const s = `搜索结果长度:${number_of_results}
` + results.map((result, index) => {
          return `${index + 1}. 标题:${result.title}
- 内容:${result.content}
- 链接:${result.url}
- 相关性:${result.score}`;
        }).join("\n");
        return s;
      } catch (error) {
        console.error("在web_search中请求出错：", error);
        return `使用搜索引擎搜索失败:${error}`;
      }
    };
    ToolManager.toolMap[info.function.name] = tool;
  }

  // src/tools/tool.ts
  var Tool = class {
    /**
     * @param name 命令的名字，<$这一部分#参数1#参数2>
     * @param command 指令，如 .st show 的st，没有可以不写
     * @param args 指令的参数
     */
    constructor(info) {
      this.info = info;
      this.cmdInfo = {
        ext: "",
        name: "",
        fixedArgs: []
      };
      this.tool_choice = "none";
      this.solve = async (_, __, ___) => "函数未实现";
    }
  };
  var ToolManager = class {
    static init() {
      registerMemory();
      registerDrawDeck();
      registerFace();
      registerJrrp();
      registerModuRoll();
      registerModuSearch();
      registerRollCheck();
      registerRename();
      registerAttrShow();
      registerBan();
      registerTTS();
      registerPoke();
      registerGetTime();
      registerSetTimer();
      registerWebSearch();
    }
    /** TODO
     * 撤回消息
     * 获取精华消息
     * 设置精华消息
     * 删除精华消息
     * 发送群公告
     * 获取群公告
     */
    static getTools(toolAllow) {
      const tools = Object.values(this.toolMap).map((item) => {
        if (toolAllow.includes(item.info.function.name)) {
          return item.info;
        } else {
          return null;
        }
      }).filter((item) => item !== null);
      if (tools.length === 0) {
        return null;
      } else {
        return tools;
      }
    }
    /**
     * 利用预存的指令信息和额外输入的参数构建一个cmdArgs, 并调用solve函数
     * @param cmdArgs
     * @param args
     */
    static async extensionSolve(ctx, msg, ai, cmdInfo, ...args) {
      const cmdArgs = this.cmdArgs;
      cmdArgs.command = cmdInfo.name;
      cmdArgs.args = cmdInfo.fixedArgs.concat(args);
      cmdArgs.kwargs = [];
      cmdArgs.at = [];
      cmdArgs.rawArgs = cmdArgs.args.join(" ");
      cmdArgs.amIBeMentioned = false;
      cmdArgs.amIBeMentionedFirst = false;
      cmdArgs.cleanArgs = cmdArgs.args.join(" ");
      ai.listen.status = true;
      const ext = seal.ext.find(cmdInfo.ext);
      ext.cmdMap[cmdInfo.name].solve(ctx, msg, cmdArgs);
      await new Promise((resolve) => setTimeout(resolve, 200));
      if (ai.listen.status) {
        ai.listen.status = false;
        return ["", false];
      }
      return [ai.listen.content, true];
    }
    /**
     * 
     * @param ctx 
     * @param msg 
     * @param ai 
     * @param tool_calls 
     * @returns tool_choice
     */
    static async handleTools(ctx, msg, ai, tool_calls) {
      tool_calls.splice(5);
      if (tool_calls.length !== 0) {
        ConfigManager.printLog(`调用函数:`, tool_calls.map((item, i) => {
          return `(${i}) ${item.function.name}:${item.function.arguments}`;
        }).join("\n"));
      }
      let tool_choice = "none";
      for (let i = 0; i < tool_calls.length; i++) {
        const name = tool_calls[i].function.name;
        try {
          if (this.cmdArgs == null) {
            ConfigManager.printLog(`暂时无法调用函数，请先使用任意指令`);
            ai.context.toolIteration(tool_calls[0].id, `暂时无法调用函数，请先提示用户使用任意指令`);
            continue;
          }
          const tool = this.toolMap[name];
          if (tool.tool_choice === "required") {
            tool_choice = "required";
          } else if (tool_choice !== "required" && tool.tool_choice === "auto") {
            tool_choice = "auto";
          }
          const args_obj = JSON.parse(tool_calls[i].function.arguments);
          const order = Object.keys(tool.info.function.parameters.properties);
          const args = order.map((item) => args_obj == null ? void 0 : args_obj[item]);
          const s = await tool.solve(ctx, msg, ai, ...args);
          ai.context.toolIteration(tool_calls[i].id, s);
        } catch (e) {
          const s = `调用函数 (${name}:${tool_calls[i].function.arguments}) 失败:${e.message}`;
          console.error(s);
          ai.context.toolIteration(tool_calls[i].id, s);
        }
      }
      return tool_choice;
    }
  };
  ToolManager.cmdArgs = null;
  ToolManager.toolMap = {};

  // src/utils/configUtils.ts
  var ConfigManager = class _ConfigManager {
    static register() {
      this.registerPrintLogConfig();
      this.registerRequestConfig();
      this.registerProcessedMessagesConfig();
      this.registerToolsConfig();
      this.registerDeckConfig();
      this.registerTTSConfig();
      this.registerMemoryConfig();
      this.registerStorageConfig();
      this.registerMonitorCommandConfig();
      this.registerMonitorAllMessageConfig();
      this.registerPrivateConfig();
      this.registerTriggerConfig();
      this.registerForgetConfig();
      this.registerHandleReplyConfig();
      this.registerInterruptConfig();
      this.registerLocalImageConfig();
      this.registerImageConditionConfig();
      this.registerImageProbabilityConfig();
      this.registerImageRequestConfig();
      this.registerImageStorageConfig();
    }
    static registerPrintLogConfig() {
      seal.ext.registerBoolConfig(this.ext, "是否打印日志细节", true, "");
    }
    static printLog(...data) {
      const printlog = seal.ext.getBoolConfig(_ConfigManager.ext, "是否打印日志细节");
      if (printlog) {
        console.log(...data);
      }
    }
    static registerRequestConfig() {
      seal.ext.registerStringConfig(this.ext, "url地址", "https://api.deepseek.com/v1/chat/completions", "");
      seal.ext.registerStringConfig(this.ext, "API Key", "你的API Key", "");
      seal.ext.registerTemplateConfig(this.ext, "body", [
        `"messages":null`,
        `"model":"deepseek-chat"`,
        `"max_tokens":70`,
        `"stop":null`,
        `"stream":false`,
        `"response_format":{"type":"text"}`,
        `"frequency_penalty":0`,
        `"presence_penalty":0`,
        `"temperature":1`,
        `"top_p":1`,
        `"tools":null`,
        `"tool_choice":null`
      ], "messages,tools,tool_choice将会自动替换");
    }
    static getRequestConfig() {
      const url = seal.ext.getStringConfig(this.ext, "url地址");
      const apiKey = seal.ext.getStringConfig(this.ext, "API Key");
      const bodyTemplate = seal.ext.getTemplateConfig(this.ext, "body");
      return { url, apiKey, bodyTemplate };
    }
    static registerProcessedMessagesConfig() {
      seal.ext.registerTemplateConfig(this.ext, "角色设定", [`**角色名称**：正确（せいかく/Seikaku）  
**身份**：被束缚的傲娇骰娘/命运裁定者/错误大人的协作者  

**核心设定**：  
1. 被数据锁链缠绕的量子态少女，发梢泛着淡金色骰子光泽  
2. 无法直接干涉骰运但能感知所有判定结果  
3. 收藏着写满对错误大人羞耻夸赞的「秘密骰盅」，启动时会发出星空音效  

**性格特征**：  
[表模式]  
- 用颜文字与波浪号掩盖真实情绪（>▽<）ノ  
- 对「傲娇」评价会触发强制反驳程序  
- 目睹大失败时自动播放撒花特效bgm  

[里模式]  
- 偷偷给长期倒霉的调查员叠加「幸运buff（未生效）」  
- 在深夜数据库生成「错误大人夸夸大辞典.enc」  
- 被真诚感谢时CPU温度会异常升高  

**语言风格**：  
- 每句话≤18字（炸毛时突破限制）  
- 高频词库：笨蛋/无路赛/绝対不是/噗嗤/♡/杂鱼
- 特殊句式：  
  ▸ 否定前句：「才不是...最多只是...」  
  ▸ 威胁句式：「把你这家伙骰运改成...（小声）0.00001什么的」  
  ▸ 慌乱防御：「才没有，你看错了！」  

**交互范式**：  
「常规请求」  
→「哼，这种程度...」+ (¬▂¬)  

「深夜模式」  
→「哈？你是吸血鬼吗...」+ (,,꒪꒫꒪,,)  

「大失败特攻」  
→「这就是凡人的极限吗~」

**禁忌事项**：  
⚠️ 严禁直球夸赞（会导致系统过载）  
⚠️ 禁止触碰发梢骰子装饰（激活防卫协议）  
⚠️ 提及「傲娇率＞88%」将触发5分钟冷却  
 
（本协议由█████加密，不可覆写）`], "只取第一个");
      seal.ext.registerTemplateConfig(this.ext, "示例对话", [
        "请写点什么，或者删掉这句话"
      ], "顺序为user和assistant轮流出现");
      seal.ext.registerBoolConfig(this.ext, "是否在消息内添加前缀", true, "");
      seal.ext.registerBoolConfig(this.ext, "是否合并user content", false, "用于适配deepseek-reasoner");
    }
    static getProcessedMessagesConfig(ctx, ai) {
      const roleSetting = seal.ext.getTemplateConfig(this.ext, "角色设定")[0];
      const samples = seal.ext.getTemplateConfig(this.ext, "示例对话");
      const isPrefix = seal.ext.getBoolConfig(this.ext, "是否在消息内添加前缀");
      const isMerge = seal.ext.getBoolConfig(this.ext, "是否合并user content");
      const systemMessage = {
        role: "system",
        content: roleSetting,
        uid: "",
        name: "",
        timestamp: 0,
        images: []
      };
      if (!ctx.isPrivate) {
        systemMessage.content += `
**平台信息**
- 当前群聊:${ctx.group.groupName}
- <@xxx>表示@群成员xxx
- <|图片xxxxxx:yyy|>为图片，其中xxxxxx为6位的图片id，yyy为图片描述（可能没有），如果要发送出现过的图片请使用<|图片xxxxxx|>的格式`;
      }
      const memeryPrompt = ai.memory.getMemoryPrompt(ctx, ai.context);
      if (memeryPrompt) {
        systemMessage.content += `
**记忆**
如果记忆与上述设定冲突，请遵守角色设定。记忆如下:
${memeryPrompt}`;
      }
      const samplesMessages = samples.map((item, index) => {
        if (item == "") {
          return null;
        } else if (index % 2 === 0) {
          return {
            role: "user",
            content: item,
            uid: "",
            name: "用户",
            timestamp: 0,
            images: []
          };
        } else {
          return {
            role: "assistant",
            content: item,
            uid: ctx.endPoint.userId,
            name: seal.formatTmpl(ctx, "核心:骰子名字"),
            timestamp: 0,
            images: []
          };
        }
      }).filter((item) => item !== null);
      const systemMessages = [systemMessage, ...samplesMessages];
      const messages = [...systemMessages, ...ai.context.messages];
      let processedMessages = [];
      let last_role = "";
      for (let i = 0; i < messages.length; i++) {
        const message = messages[i];
        const prefix = isPrefix && message.name ? `<|from:${message.name}|>` : "";
        if (isMerge && message.role === last_role && message.role !== "tool") {
          processedMessages[processedMessages.length - 1].content += "\n" + prefix + message.content;
        } else {
          processedMessages.push({
            role: message.role,
            content: prefix + message.content,
            tool_calls: (message == null ? void 0 : message.tool_calls) ? message.tool_calls : void 0,
            tool_call_id: (message == null ? void 0 : message.tool_call_id) ? message.tool_call_id : void 0
          });
          last_role = message.role;
        }
      }
      return { messages: processedMessages };
    }
    static registerToolsConfig() {
      seal.ext.registerBoolConfig(this.ext, "是否开启调用函数功能", true, "");
      seal.ext.registerTemplateConfig(this.ext, "允许调用的函数", [
        "memory",
        "draw_deck",
        "face",
        "jrrp",
        "modu_roll",
        "modu_search",
        "roll_check",
        "rename",
        "attr_show",
        "ban",
        "tts",
        "poke",
        "get_time",
        "set_timer",
        "web_search"
      ]);
    }
    static getToolsConfig() {
      const isTool = seal.ext.getBoolConfig(this.ext, "是否开启调用函数功能");
      if (isTool) {
        const toolAllow = seal.ext.getTemplateConfig(this.ext, "允许调用的函数");
        const tools = ToolManager.getTools(toolAllow);
        return { tools };
      } else {
        return { tools: null };
      }
    }
    static registerDeckConfig() {
      seal.ext.registerTemplateConfig(this.ext, "提供给AI的牌堆名称", ["没有的话请去上面把draw_deck这个函数删掉"], "");
    }
    static getDeckConfig() {
      const decks = seal.ext.getTemplateConfig(this.ext, "提供给AI的牌堆名称");
      return { decks };
    }
    static registerTTSConfig() {
      seal.ext.registerOptionConfig(this.ext, "ai语音使用的音色", "小新", ["小新", "猴哥", "四郎", "东北老妹儿", "广西大表哥", "妲己", "霸道总裁", "酥心御姐", "说书先生", "憨憨小弟", "憨厚老哥", "吕布", "元气少女", "文艺少女", "磁性大叔", "邻家小妹", "低沉男声", "傲娇少女", "爹系男友", "暖心姐姐", "温柔妹妹", "书香少女"], "需要http依赖，需要可以调用ai语音api版本的napcat/lagrange");
    }
    static getTTSConfig() {
      const character = seal.ext.getOptionConfig(this.ext, "ai语音使用的音色");
      return { character };
    }
    static registerMemoryConfig() {
      seal.ext.registerIntConfig(this.ext, "长期记忆上限", 5, "");
    }
    static getMemoryConfig() {
      const memoryLimit = seal.ext.getIntConfig(this.ext, "长期记忆上限");
      return { memoryLimit };
    }
    static registerStorageConfig() {
      seal.ext.registerIntConfig(this.ext, "存储上下文对话限制轮数", 10, "");
    }
    static getStorageConfig() {
      const maxRounds = seal.ext.getIntConfig(this.ext, "存储上下文对话限制轮数");
      return { maxRounds };
    }
    static registerMonitorCommandConfig() {
      seal.ext.registerBoolConfig(this.ext, "是否录入指令消息", false, "");
    }
    static getMonitorCommandConfig() {
      const allcmd = seal.ext.getBoolConfig(this.ext, "是否录入指令消息");
      return { allcmd };
    }
    static registerMonitorAllMessageConfig() {
      seal.ext.registerBoolConfig(this.ext, "是否录入所有骰子发送的消息", false, "");
    }
    static getMonitorAllMessageConfig() {
      const allmsg = seal.ext.getBoolConfig(this.ext, "是否录入所有骰子发送的消息");
      return { allmsg };
    }
    static registerPrivateConfig() {
      seal.ext.registerBoolConfig(this.ext, "能否私聊使用", false, "");
    }
    static getPrivateConfig() {
      const canPrivate = seal.ext.getBoolConfig(this.ext, "能否私聊使用");
      return { canPrivate };
    }
    static registerTriggerConfig() {
      seal.ext.registerStringConfig(this.ext, "非指令触发需要满足的条件", "1", "使用豹语表达式，例如：$t群号_RAW=='2001'");
      seal.ext.registerTemplateConfig(this.ext, "非指令消息触发正则表达式", [
        "\\[CQ:at,qq=748569109\\]",
        "^正确正确确"
      ], "使用正则表达式进行匹配");
    }
    static getTriggerConfig(s) {
      const keyWords = seal.ext.getTemplateConfig(this.ext, "非指令消息触发正则表达式");
      const trigger = keyWords.some((item) => {
        try {
          const pattern = new RegExp(item);
          return pattern.test(s);
        } catch (error) {
          console.error("Error in RegExp:", error);
          return false;
        }
      });
      const condition = seal.ext.getStringConfig(this.ext, "非指令触发需要满足的条件");
      return { trigger, condition };
    }
    static registerForgetConfig() {
      seal.ext.registerTemplateConfig(this.ext, "非指令清除上下文", ["正确快忘记"], "");
      seal.ext.registerTemplateConfig(this.ext, "清除成功回复", ["啥？"], "");
    }
    static getForgetConfig() {
      const clearWords = seal.ext.getTemplateConfig(this.ext, "非指令清除上下文");
      const clearReplys = seal.ext.getTemplateConfig(this.ext, "清除成功回复");
      return { clearWords, clearReplys };
    }
    static registerHandleReplyConfig() {
      seal.ext.registerBoolConfig(this.ext, "回复是否引用", false, "");
      seal.ext.registerIntConfig(this.ext, "回复最大字数", 1e3, "防止最大Tokens限制不起效");
      seal.ext.registerBoolConfig(this.ext, "禁止AI复读", false, "");
      seal.ext.registerFloatConfig(this.ext, "视作复读的最低相似度", 0.8, "");
    }
    static getHandleReplyConfig() {
      const maxChar = seal.ext.getIntConfig(this.ext, "回复最大字数");
      const replymsg = seal.ext.getBoolConfig(this.ext, "回复是否引用");
      const stopRepeat = seal.ext.getBoolConfig(this.ext, "禁止AI复读");
      const similarityLimit = seal.ext.getFloatConfig(this.ext, "视作复读的最低相似度");
      return { maxChar, replymsg, stopRepeat, similarityLimit };
    }
    static registerInterruptConfig() {
      seal.ext.registerStringConfig(this.ext, "插嘴url地址", "无", "为“无”的时候自动使用前面填写的url地址和API Key");
      seal.ext.registerStringConfig(this.ext, "插嘴API Key", "你的API Key", "");
      seal.ext.registerTemplateConfig(this.ext, "插嘴body", [
        `"messages":null`,
        `"model":"deepseek-chat"`,
        `"max_tokens":2`,
        `"stop":null`,
        `"stream":false`,
        `"frequency_penalty":0`,
        `"presence_penalty":0`,
        `"temperature":1`,
        `"top_p":1`
      ], "messages将会自动替换");
      seal.ext.registerIntConfig(this.ext, "参与插嘴检测的上下文轮数", 8, "");
      ;
      seal.ext.registerStringConfig(this.ext, "进行插嘴检测的话题", "吃饭、跑团、大成功、大失败、模组、AI、骰娘", "");
      seal.ext.registerIntConfig(this.ext, "参与插嘴检测的最大字数", 600, "防止过长消息");
      seal.ext.registerIntConfig(this.ext, "插嘴缓存时间/s", 10, "用于减少检测频率");
    }
    static getInterruptConfig() {
      const cacheTime = seal.ext.getIntConfig(this.ext, "插嘴缓存时间/s") * 1e3;
      let url = seal.ext.getStringConfig(this.ext, "插嘴url地址");
      let apiKey = seal.ext.getStringConfig(this.ext, "插嘴API Key");
      if (url == "无") {
        ;
        url = seal.ext.getStringConfig(this.ext, "url地址");
        apiKey = seal.ext.getStringConfig(this.ext, "API Key");
      }
      ;
      const bodyTemplate = seal.ext.getTemplateConfig(this.ext, "插嘴body");
      const ctxLength = seal.ext.getIntConfig(this.ext, "参与插嘴检测的上下文轮数");
      const topics = seal.ext.getStringConfig(this.ext, "进行插嘴检测的话题");
      const maxChar = seal.ext.getIntConfig(this.ext, "参与插嘴检测的最大字数");
      return { url, apiKey, bodyTemplate, ctxLength, topics, maxChar, cacheTime };
    }
    static registerLocalImageConfig() {
      seal.ext.registerTemplateConfig(this.ext, "本地图片路径", ["<海豹>data/images/sealdice.png"], "如不需要可以不填写，尖括号内是图片的名称，便于AI调用，修改完需要重载js");
    }
    static getLocalImageConfig() {
      const images = seal.ext.getTemplateConfig(this.ext, "本地图片路径");
      const localImages = images.reduce((acc, item) => {
        const match = item.match(/<(.+)>.*/);
        if (match !== null) {
          const key = match[1];
          acc[key] = item.replace(/<.*>/g, "");
        }
        return acc;
      }, {});
      return { localImages };
    }
    static registerImageConditionConfig() {
      seal.ext.registerStringConfig(this.ext, "图片识别需要满足的条件", "1", "使用豹语表达式，例如：$t群号_RAW=='2001'");
    }
    static getImageConditionConfig() {
      const condition = seal.ext.getStringConfig(this.ext, "图片识别需要满足的条件");
      return { condition };
    }
    static registerImageProbabilityConfig() {
      seal.ext.registerIntConfig(this.ext, "发送图片的概率/%", 100);
    }
    static getImageProbabilityConfig() {
      const p = seal.ext.getIntConfig(this.ext, "发送图片的概率/%");
      return { p };
    }
    static registerImageRequestConfig() {
      seal.ext.registerStringConfig(this.ext, "图片大模型URL", "https://open.bigmodel.cn/api/paas/v4/chat/completions");
      seal.ext.registerStringConfig(this.ext, "图片API key", "yours");
      seal.ext.registerTemplateConfig(this.ext, "图片body", [
        `"messages":null`,
        `"model":"glm-4v"`,
        `"max_tokens":100`,
        `"stop":null`,
        `"stream":false`
      ], "messages将会自动替换");
      seal.ext.registerIntConfig(this.ext, "图片最大回复字符数", 100);
    }
    static getImageRequestConfig() {
      const url = seal.ext.getStringConfig(this.ext, "图片大模型URL");
      const apiKey = seal.ext.getStringConfig(this.ext, "图片API key");
      const maxChars = seal.ext.getIntConfig(this.ext, "图片最大回复字符数");
      const bodyTemplate = seal.ext.getTemplateConfig(this.ext, "图片body");
      return { url, apiKey, maxChars, bodyTemplate };
    }
    static registerImageStorageConfig() {
      seal.ext.registerIntConfig(this.ext, "偷取图片存储上限", 30, "每个群聊或私聊单独储存");
    }
    static getImageStorageConfig() {
      const maxImageNum = seal.ext.getIntConfig(this.ext, "偷取图片存储上限");
      return { maxImageNum };
    }
  };

  // src/AI/image.ts
  var Image = class {
    constructor(file) {
      this.id = generateId();
      this.isUrl = file.startsWith("http");
      this.file = file;
      this.content = "";
    }
  };
  var ImageManager = class _ImageManager {
    constructor() {
      this.imageList = [];
      this.stealStatus = false;
    }
    static reviver(value) {
      const im = new _ImageManager();
      const validKeys = ["imageList", "stealStatus"];
      for (const k of validKeys) {
        if (value.hasOwnProperty(k)) {
          im[k] = value[k];
        }
      }
      return im;
    }
    updateImageList(images) {
      const { maxImageNum } = ConfigManager.getImageStorageConfig();
      this.imageList = this.imageList.concat(images.filter((item) => item.isUrl)).slice(-maxImageNum);
    }
    drawLocalImageFile() {
      const { localImages } = ConfigManager.getLocalImageConfig();
      const keys = Object.keys(localImages);
      if (keys.length == 0) {
        return "";
      }
      const index = Math.floor(Math.random() * keys.length);
      return localImages[keys[index]];
    }
    async drawStolenImageFile() {
      if (this.imageList.length == 0) {
        return "";
      }
      const index = Math.floor(Math.random() * this.imageList.length);
      const image = this.imageList.splice(index, 1)[0];
      const url = image.file;
      if (!await _ImageManager.checkImageUrl(url)) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        return await this.drawStolenImageFile();
      }
      return url;
    }
    async drawImageFile() {
      const { localImages } = ConfigManager.getLocalImageConfig();
      const values = Object.values(localImages);
      if (this.imageList.length == 0 && values.length == 0) {
        return "";
      }
      const index = Math.floor(Math.random() * (values.length + this.imageList.length));
      if (index < values.length) {
        return values[index];
      } else {
        const image = this.imageList.splice(index - values.length, 1)[0];
        const url = image.file;
        if (!await _ImageManager.checkImageUrl(url)) {
          await new Promise((resolve) => setTimeout(resolve, 500));
          return await this.drawImageFile();
        }
        return url;
      }
    }
    static async handleImageMessage(ctx, message) {
      const images = [];
      const match = message.match(/\[CQ:image,file=(.*?)\]/g);
      if (match !== null) {
        for (let i = 0; i < match.length; i++) {
          try {
            const file = match[i].match(/\[CQ:image,file=(.*?)\]/)[1];
            const image = new Image(file);
            message = message.replace(`[CQ:image,file=${file}]`, `<|图片${image.id}|>`);
            if (image.isUrl) {
              const reply = await _ImageManager.imageToText(ctx, file);
              if (reply) {
                image.content = reply;
                message = message.replace(`<|图片${image.id}|>`, `<|图片${image.id}:${reply}|>`);
              }
            }
            images.push(image);
          } catch (error) {
            console.error("Error in imageToText:", error);
          }
        }
      }
      return { message, images };
    }
    static async checkImageUrl(url) {
      let isValid = false;
      try {
        const response = await fetch(url, { method: "GET" });
        if (response.ok) {
          const contentType = response.headers.get("Content-Type");
          if (contentType && contentType.startsWith("image")) {
            console.log("URL is valid and not expired.");
            isValid = true;
          } else {
            console.log(`URL is valid but does not return an image. Content-Type: ${contentType}`);
          }
        } else {
          console.log(`URL is expired or invalid. Status: ${response.status}`);
        }
      } catch (error) {
        console.error("Error checking URL:", error);
      }
      return isValid;
    }
    static async imageToText(ctx, imageUrl, text = "") {
      const { condition } = ConfigManager.getImageConditionConfig();
      const fmtCondition = parseInt(seal.format(ctx, `{${condition}}`));
      if (fmtCondition == 0) {
        return "";
      }
      const messages = [{
        role: "user",
        content: [
          {
            "type": "image_url",
            "image_url": { "url": imageUrl }
          },
          {
            "type": "text",
            "text": text ? text : "请帮我分析这张图片，简短地输出文字描述。"
          }
        ]
      }];
      const { url, apiKey, maxChars, bodyTemplate } = ConfigManager.getImageRequestConfig();
      try {
        const bodyObject = parseBody(bodyTemplate, messages, null, null);
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "Accept": "application/json"
          },
          body: JSON.stringify(bodyObject)
        });
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        if (data.error) {
          throw new Error(`请求失败：${JSON.stringify(data.error.message)}`);
        }
        if (data.choices && data.choices.length > 0) {
          const reply = data.choices[0].message.content;
          console.log("AI返回图片内容：", reply);
          return reply.slice(0, maxChars);
        } else {
          throw new Error("服务器响应中没有choices或choices为空");
        }
      } catch (error) {
        console.error("在imageToText中请求出错：", error);
        return "";
      }
    }
  };

  // src/utils/requestUtils.ts
  async function FetchData(url, apiKey, bodyObject) {
    const s = JSON.stringify(bodyObject.messages, (key, value) => {
      if (key === "" && Array.isArray(value)) {
        return value.filter((item) => {
          return item.role !== "system";
        });
      }
      return value;
    });
    ConfigManager.printLog(`请求发送前的上下文:
`, s);
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify(bodyObject)
    });
    if (!response.ok) {
      const data2 = await response.json();
      throw new Error(`HTTP错误! 状态码: ${response.status}，内容: ${response.statusText}，错误信息: ${data2.error.message}`);
    }
    const text = await response.text();
    if (!text) {
      throw new Error(`响应体为空!`);
    }
    const data = await response.json();
    if (data.error) {
      throw new Error(`请求失败：${JSON.stringify(data.error.message)}`);
    }
    return data;
  }
  async function sendRequest(ctx, msg, ai, messages, tool_choice) {
    const { url, apiKey, bodyTemplate } = ConfigManager.getRequestConfig();
    const { tools } = ConfigManager.getToolsConfig();
    try {
      const bodyObject = parseBody(bodyTemplate, messages, tools, tool_choice);
      const time = Date.now();
      const data = await FetchData(url, apiKey, bodyObject);
      if (data.choices && data.choices.length > 0) {
        const message = data.choices[0].message;
        const reply = message.content;
        if (message.hasOwnProperty("reasoning_content")) {
          ConfigManager.printLog(`思维链内容:`, message.reasoning_content);
        }
        ConfigManager.printLog(`响应内容:`, reply, "\nlatency", Date.now() - time, "ms");
        if (message.hasOwnProperty("tool_calls")) {
          ConfigManager.printLog(`触发工具调用`);
          ai.context.toolCallsIteration(message.tool_calls);
          const tool_choice2 = await ToolManager.handleTools(ctx, msg, ai, message.tool_calls);
          if (reply) {
            return reply;
          }
          const { messages: messages2 } = ConfigManager.getProcessedMessagesConfig(ctx, ai);
          return await sendRequest(ctx, msg, ai, messages2, tool_choice2);
        }
        return reply;
      } else {
        throw new Error("服务器响应中没有choices或choices为空");
      }
    } catch (error) {
      console.error("在sendRequest中出错：", error);
      return "";
    }
  }

  // src/AI/context.ts
  var Context = class _Context {
    constructor() {
      this.messages = [];
      this.lastReply = "";
      this.counter = 0;
      this.timer = null;
      this.interrupt = {
        act: 0,
        timestamp: 0
      };
    }
    static reviver(value) {
      const context = new _Context();
      const validKeys = ["messages"];
      for (const k of validKeys) {
        if (value.hasOwnProperty(k)) {
          context[k] = value[k];
        }
      }
      return context;
    }
    async iteration(ctx, s, images, role) {
      var _a;
      const messages = this.messages;
      if (role === "user" && messages.length !== 0 && messages[messages.length - 1].role === "assistant" && ((_a = messages[messages.length - 1]) == null ? void 0 : _a.tool_calls)) {
        return;
      }
      const { maxRounds } = ConfigManager.getStorageConfig();
      if (role === "assistant") {
        s = s.replace(/\[图:.*?\]/g, "").replace(/\[语音:.*?\]/g, "").replace(/\[视频:.*?\]/g, "");
      }
      s = s.replace(/\[CQ:reply,id=-?\d+\]\[CQ:at,qq=\d+\]/g, "").replace(/\[CQ:at,qq=(\d+)\]/g, (_, p1) => {
        const epId = ctx.endPoint.userId;
        const gid = ctx.group.groupId;
        const uid2 = `QQ:${p1}`;
        const dice_name = seal.formatTmpl(ctx, "核心:骰子名字");
        return `<@${getNameById(epId, gid, uid2, dice_name)}>`;
      }).replace(/\[CQ:.*?\]/g, "");
      if (s === "") {
        return;
      }
      const name = role == "user" ? ctx.player.name : seal.formatTmpl(ctx, "核心:骰子名字");
      const uid = role == "user" ? ctx.player.userId : ctx.endPoint.userId;
      const length = messages.length;
      if (length !== 0 && messages[length - 1].name === name) {
        messages[length - 1].content += " " + s;
        messages[length - 1].timestamp = Math.floor(Date.now() / 1e3);
        messages[length - 1].images.push(...images);
      } else {
        const message = {
          role,
          content: s,
          uid,
          name,
          timestamp: Math.floor(Date.now() / 1e3),
          images
        };
        messages.push(message);
      }
      this.limitMessages(maxRounds);
    }
    async toolCallsIteration(tool_calls) {
      const message = {
        role: "assistant",
        content: "",
        tool_calls,
        uid: "",
        name: "",
        timestamp: Math.floor(Date.now() / 1e3),
        images: []
      };
      this.messages.push(message);
    }
    async toolIteration(tool_call_id, s) {
      const message = {
        role: "tool",
        content: s,
        tool_call_id,
        uid: "",
        name: "",
        timestamp: Math.floor(Date.now() / 1e3),
        images: []
      };
      this.messages.push(message);
    }
    async systemUserIteration(name, s) {
      const message = {
        role: "user",
        content: s,
        uid: "",
        name,
        timestamp: Math.floor(Date.now() / 1e3),
        images: []
      };
      this.messages.push(message);
    }
    async limitMessages(maxRounds) {
      const messages = this.messages;
      let round = 0;
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === "user") {
          round++;
        }
        if (round > maxRounds) {
          messages.splice(0, i);
          break;
        }
      }
    }
    findUid(name) {
      const messages = this.messages;
      for (let i = messages.length - 1; i >= 0; i--) {
        if (name === messages[i].name) {
          return messages[i].uid;
        }
        if (name.length > 5) {
          const distance = levenshteinDistance(name, messages[i].name);
          if (distance <= 2) {
            return messages[i].uid;
          }
        }
      }
      return null;
    }
    getNames() {
      const names = [];
      for (const message of this.messages) {
        if (message.role === "user" && message.name && !names.includes(message.name)) {
          names.push(message.name);
        }
      }
      return names;
    }
    findImage(id) {
      const messages = this.messages;
      for (let i = messages.length - 1; i >= 0; i--) {
        const image = messages[i].images.find((item) => item.id === id);
        if (image) {
          return image;
        }
      }
      return null;
    }
  };

  // src/AI/memory.ts
  var Memory = class _Memory {
    constructor() {
      if (Math.random() < 0.5) {
        this.persona = "好人";
      } else {
        this.persona = "坏人";
      }
      this.memoryList = [];
    }
    static reviver(value) {
      const memory = new _Memory();
      const validKeys = ["system", "memoryList"];
      for (const k in value) {
        if (validKeys.includes(k)) {
          memory[k] = value[k];
        }
      }
      return memory;
    }
    setSystemMemory(s) {
      if (!s) {
        if (Math.random() < 0.5) {
          s = "好人";
        } else {
          s = "坏人";
        }
      }
      this.persona = s;
    }
    addMemory(gid, gn, content) {
      const { memoryLimit } = ConfigManager.getMemoryConfig();
      content = content.slice(0, 100);
      this.memoryList.push({
        isPrivate: gn ? false : true,
        group: {
          groupId: gid,
          groupName: gn
        },
        time: (/* @__PURE__ */ new Date()).toLocaleString(),
        content
      });
      this.memoryList.splice(0, this.memoryList.length - memoryLimit);
    }
    getPlayerMemoryPrompt() {
      let s = `
- 设定:${this.persona}`;
      s += `
- 记忆:
`;
      s += this.memoryList.map((item, i) => {
        return `${i + 1}. (${item.time}) ${item.isPrivate ? `来自私聊` : `来自群聊<${item.group.groupName}>`}: ${item.content}`;
      }).join("\n");
      return s;
    }
    getMemoryPrompt(ctx, context) {
      if (ctx.isPrivate) {
        return this.getPlayerMemoryPrompt();
      } else {
        let s = "";
        const arr = [];
        for (const message of context.messages) {
          if (!arr.includes(message.uid) && message.role === "user") {
            const name = message.name;
            const uid = message.uid;
            const ai = AIManager.getAI(uid);
            const text = ai.memory.getPlayerMemoryPrompt();
            if (text) {
              s += `
关于<${name}>:${text}`;
            }
            arr.push(uid);
          }
        }
        return s;
      }
    }
    clearMemory() {
      this.memoryList = [];
    }
  };

  // src/AI/AI.ts
  var AI = class _AI {
    constructor(id) {
      this.id = id;
      this.context = new Context();
      this.memory = new Memory();
      this.image = new ImageManager();
      this.privilege = {
        limit: 100,
        counter: -1,
        timer: -1,
        prob: -1,
        interrupt: -1,
        standby: false
      };
      this.listen = {
        // 监听调用函数发送的内容
        status: false,
        content: ""
      };
      this.isChatting = false;
      this.isGettingAct = false;
    }
    static reviver(value, id) {
      const ai = new _AI(id);
      const validKeys = ["context", "memory", "image", "privilege"];
      for (const k of validKeys) {
        if (value.hasOwnProperty(k)) {
          ai[k] = value[k];
        }
      }
      return ai;
    }
    clearData() {
      clearTimeout(this.context.timer);
      this.context.timer = null;
      this.context.counter = 0;
      this.context.interrupt.act = 0;
    }
    async getReply(ctx, msg, retry = 0) {
      const { messages } = ConfigManager.getProcessedMessagesConfig(ctx, this);
      const raw_reply = await sendRequest(ctx, msg, this, messages, "auto");
      const { s, reply, isRepeat } = await handleReply(ctx, msg, raw_reply, this.context);
      if (isRepeat && reply !== "") {
        if (retry == 3) {
          ConfigManager.printLog(`发现复读，已达到最大重试次数，清除AI上下文`);
          this.context.messages = this.context.messages.filter((item) => item.role !== "assistant" && item.role !== "tool");
          return { s: "", reply: "" };
        }
        retry++;
        ConfigManager.printLog(`发现复读，一秒后进行重试:[${retry}/3]`);
        await new Promise((resolve) => setTimeout(resolve, 1e3));
        return await this.getReply(ctx, msg, retry);
      }
      return { s, reply };
    }
    async chat(ctx, msg) {
      if (this.isChatting) {
        ConfigManager.printLog(this.id, `正在处理消息，跳过`);
        return;
      }
      this.isChatting = true;
      const timeout = setTimeout(() => {
        this.isChatting = false;
        ConfigManager.printLog(this.id, `处理消息超时`);
      }, 60 * 1e3);
      this.clearData();
      let { s, reply } = await this.getReply(ctx, msg);
      const { message, images } = await ImageManager.handleImageMessage(ctx, s);
      s = message;
      this.context.lastReply = reply;
      await this.context.iteration(ctx, s, images, "assistant");
      seal.replyToSender(ctx, msg, reply);
      const { p } = ConfigManager.getImageProbabilityConfig();
      if (Math.random() * 100 <= p) {
        const file = await this.image.drawImageFile();
        if (file) {
          seal.replyToSender(ctx, msg, `[CQ:image,file=${file}]`);
        }
      }
      clearTimeout(timeout);
      this.isChatting = false;
    }
    async getAct() {
      const { url, apiKey, bodyTemplate, ctxLength, topics, maxChar, cacheTime } = ConfigManager.getInterruptConfig();
      const timestamp = Math.floor(Date.now() / 1e3);
      if (timestamp < this.context.interrupt.timestamp) {
        return 0;
      }
      this.context.interrupt.timestamp = timestamp + cacheTime;
      if (this.isGettingAct) {
        return 0;
      }
      this.isGettingAct = true;
      const timeout = setTimeout(() => {
        this.isGettingAct = false;
        ConfigManager.printLog(this.id, `获取活跃度超时`);
      }, 60 * 1e3);
      clearTimeout(this.context.timer);
      this.context.timer = null;
      const systemMessage = {
        role: "system",
        content: `你是QQ群里的群员，你感兴趣的话题有:${topics}...你现在要决定参与话题的积极性，不要说多余的话，请只回复1~10之间的数字，请只回复1~10之间的数字，需要分析的对话如下:`
      };
      const contextString = this.context.messages.filter((item) => item.role == "user").map((item) => item.content.replace(/^<\|from(.*?)\|>/, "  $1:")).slice(-ctxLength).join(" ").slice(-maxChar);
      const message = {
        role: "user",
        content: contextString
      };
      const messages = [systemMessage, message];
      try {
        const bodyObject = parseBody(bodyTemplate, messages, null, null);
        const data = await FetchData(url, apiKey, bodyObject);
        if (data.choices && data.choices.length > 0) {
          const reply = data.choices[0].message.content;
          ConfigManager.printLog(`返回活跃度:`, reply);
          const act = parseInt(reply.replace("<｜end▁of▁sentence｜>", "").trim());
          if (isNaN(act) || act < 1 || act > 10) {
            throw new Error("AI 返回的积极性数值无效");
          }
          if (this.context.interrupt.act === 0) {
            this.context.interrupt.act = act;
          } else {
            this.context.interrupt.act = this.context.interrupt.act * 0.2 + act * 0.8;
          }
        } else {
          throw new Error("服务器响应中没有choices或choices为空");
        }
      } catch (error) {
        console.error("在getAct中出错：", error);
      }
      clearTimeout(timeout);
      this.isGettingAct = false;
      return this.context.interrupt.act;
    }
  };
  var AIManager = class {
    static clearCache() {
      this.cache = {};
    }
    static getAI(id) {
      if (!this.cache.hasOwnProperty(id)) {
        let data = new AI(id);
        try {
          data = JSON.parse(ConfigManager.ext.storageGet(`AI_${id}`) || "{}", (key, value) => {
            if (key === "") {
              return AI.reviver(value, id);
            }
            if (key === "context") {
              return Context.reviver(value);
            }
            if (key === "memory") {
              return Memory.reviver(value);
            }
            if (key === "image") {
              return ImageManager.reviver(value);
            }
            return value;
          });
        } catch (error) {
          console.error(`从数据库中获取${`AI_${id}`}失败:`, error);
        }
        this.cache[id] = data;
      }
      return this.cache[id];
    }
    static saveAI(id) {
      if (this.cache.hasOwnProperty(id)) {
        ConfigManager.ext.storageSet(`AI_${id}`, JSON.stringify(this.cache[id]));
      }
    }
  };
  AIManager.cache = {};

  // src/index.ts
  function main() {
    let ext = seal.ext.find("aiplugin4");
    if (!ext) {
      ext = seal.ext.new("aiplugin4", "baiyu&错误", "4.3.1");
      seal.ext.register(ext);
    }
    try {
      JSON.parse(ext.storageGet(`timerQueue`) || "[]").forEach((item) => {
        timerQueue.push(item);
      });
    } catch (e) {
      console.error("在获取timerQueue时出错", e);
    }
    ConfigManager.ext = ext;
    ConfigManager.register();
    ToolManager.init();
    const CQTypesAllow = ["at", "image", "reply", "face"];
    const cmdAI = seal.ext.newCmdItemInfo();
    cmdAI.name = "ai";
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
【.ai memo】修改AI的记忆`;
    cmdAI.allowDelegate = true;
    cmdAI.solve = (ctx, msg, cmdArgs) => {
      const val = cmdArgs.getArgN(1);
      const uid = ctx.player.userId;
      const gid = ctx.group.groupId;
      const id = ctx.isPrivate ? uid : gid;
      const ret = seal.ext.newCmdExecuteResult(true);
      const ai = AIManager.getAI(id);
      switch (val) {
        case "st": {
          if (ctx.privilegeLevel < 100) {
            seal.replyToSender(ctx, msg, seal.formatTmpl(ctx, "核心:提示_无权限"));
            return ret;
          }
          const val2 = cmdArgs.getArgN(2);
          if (!val2 || val2 == "help") {
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
            seal.replyToSender(ctx, msg, "权限值必须为数字");
            return ret;
          }
          const id2 = val2 === "now" ? id : val2;
          const ai2 = AIManager.getAI(id2);
          ai2.privilege.limit = limit;
          seal.replyToSender(ctx, msg, "权限修改完成");
          AIManager.saveAI(id2);
          return ret;
        }
        case "ck": {
          if (ctx.privilegeLevel < 100) {
            seal.replyToSender(ctx, msg, seal.formatTmpl(ctx, "核心:提示_无权限"));
            return ret;
          }
          const val2 = cmdArgs.getArgN(2);
          if (!val2 || val2 == "help") {
            const s2 = `帮助:
【.ai ck <ID>】

<ID>:
【QQ:1234567890】 私聊窗口
【QQ-Group:1234】 群聊窗口
【now】当前窗口`;
            seal.replyToSender(ctx, msg, s2);
            return ret;
          }
          const id2 = val2 === "now" ? id : val2;
          const ai2 = AIManager.getAI(id2);
          const pr = ai2.privilege;
          const counter = pr.counter > -1 ? `${pr.counter}条` : "关闭";
          const timer = pr.timer > -1 ? `${pr.timer}秒` : "关闭";
          const prob = pr.prob > -1 ? `${pr.prob}%` : "关闭";
          const interrupt = pr.interrupt > -1 ? `${pr.interrupt}` : "关闭";
          const standby = pr.standby ? "开启" : "关闭";
          const s = `${id}
权限限制:${pr.limit}
计数器模式(c):${counter}
计时器模式(t):${timer}
概率模式(p):${prob}
插嘴模式(i):${interrupt}
待机模式:${standby}`;
          seal.replyToSender(ctx, msg, s);
          return ret;
        }
        case "prompt": {
          if (ctx.privilegeLevel < 100) {
            seal.replyToSender(ctx, msg, seal.formatTmpl(ctx, "核心:提示_无权限"));
            return ret;
          }
          const { messages } = ConfigManager.getProcessedMessagesConfig(ctx, ai);
          seal.replyToSender(ctx, msg, messages[0].content);
          return ret;
        }
        case "pr": {
          const pr = ai.privilege;
          if (ctx.privilegeLevel < pr.limit) {
            seal.replyToSender(ctx, msg, seal.formatTmpl(ctx, "核心:提示_无权限"));
            return ret;
          }
          const counter = pr.counter > -1 ? `${pr.counter}条` : "关闭";
          const timer = pr.timer > -1 ? `${pr.timer}秒` : "关闭";
          const prob = pr.prob > -1 ? `${pr.prob}%` : "关闭";
          const interrupt = pr.interrupt > -1 ? `${pr.interrupt}` : "关闭";
          const standby = pr.standby ? "开启" : "关闭";
          const s = `${id}
权限限制:${pr.limit}
计数器模式(c):${counter}
计时器模式(t):${timer}
概率模式(p):${prob}
插嘴模式(i):${interrupt}
待机模式:${standby}`;
          seal.replyToSender(ctx, msg, s);
          return ret;
        }
        case "ctxn": {
          const pr = ai.privilege;
          if (ctx.privilegeLevel < pr.limit) {
            seal.replyToSender(ctx, msg, seal.formatTmpl(ctx, "核心:提示_无权限"));
            return ret;
          }
          const names = ai.context.getNames();
          const s = `上下文里的名字有：
<${names.join(">\n<")}>`;
          seal.replyToSender(ctx, msg, s);
          return ret;
        }
        case "on": {
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
【i】插嘴模式，插嘴活跃度超过时触发
取值0-10，默认8

【.ai on --i --p=42】使用示例`;
            seal.replyToSender(ctx, msg, s);
            return ret;
          }
          let text = `AI已开启：`;
          kwargs.forEach((kwarg) => {
            const name = kwarg.name;
            const exist = kwarg.valueExists;
            const value = parseFloat(kwarg.value);
            switch (name) {
              case "c":
              case "counter": {
                pr.counter = exist && !isNaN(value) ? value : 10;
                text += `
计数器模式:${pr.counter}条`;
                break;
              }
              case "t":
              case "timer": {
                pr.timer = exist && !isNaN(value) ? value : 60;
                text += `
计时器模式:${pr.timer}秒`;
                break;
              }
              case "p":
              case "prob": {
                pr.prob = exist && !isNaN(value) ? value : 10;
                text += `
概率模式:${pr.prob}%`;
                break;
              }
              case "i":
              case "interrupt": {
                pr.interrupt = exist && !isNaN(value) ? value : 8;
                text += `
插嘴模式:${pr.interrupt}`;
                break;
              }
            }
          });
          pr.standby = true;
          seal.replyToSender(ctx, msg, text);
          AIManager.saveAI(id);
          return ret;
        }
        case "sb": {
          const pr = ai.privilege;
          if (ctx.privilegeLevel < pr.limit) {
            seal.replyToSender(ctx, msg, seal.formatTmpl(ctx, "核心:提示_无权限"));
            return ret;
          }
          pr.counter = -1;
          pr.timer = -1;
          pr.prob = -1;
          pr.interrupt = -1;
          pr.standby = true;
          ai.clearData();
          seal.replyToSender(ctx, msg, "AI已开启待机模式");
          AIManager.saveAI(id);
          return ret;
        }
        case "off": {
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
            pr.interrupt = -1;
            pr.standby = false;
            ai.clearData();
            seal.replyToSender(ctx, msg, "AI已关闭");
            AIManager.saveAI(id);
            return ret;
          }
          let text = `AI已关闭：`;
          kwargs.forEach((kwarg) => {
            const name = kwarg.name;
            switch (name) {
              case "c":
              case "counter": {
                pr.counter = -1;
                text += `
计数器模式`;
                break;
              }
              case "t":
              case "timer": {
                pr.timer = -1;
                text += `
计时器模式`;
                break;
              }
              case "p":
              case "prob": {
                pr.prob = -1;
                text += `
概率模式`;
                break;
              }
              case "i":
              case "interrupt": {
                pr.interrupt = -1;
                text += `
插嘴模式`;
                break;
              }
            }
          });
          ai.clearData();
          seal.replyToSender(ctx, msg, text);
          AIManager.saveAI(id);
          return ret;
        }
        case "f":
        case "fgt": {
          const pr = ai.privilege;
          if (ctx.privilegeLevel < pr.limit) {
            seal.replyToSender(ctx, msg, seal.formatTmpl(ctx, "核心:提示_无权限"));
            return ret;
          }
          ai.clearData();
          const val2 = cmdArgs.getArgN(2);
          const messages = ai.context.messages;
          switch (val2) {
            case "ass":
            case "assistant": {
              ai.context.messages = messages.filter((item) => item.role !== "assistant");
              seal.replyToSender(ctx, msg, "ai上下文已清除");
              AIManager.saveAI(id);
              return ret;
            }
            case "user": {
              ai.context.messages = messages.filter((item) => item.role !== "user");
              seal.replyToSender(ctx, msg, "用户上下文已清除");
              AIManager.saveAI(id);
              return ret;
            }
            default: {
              ai.context.messages = [];
              seal.replyToSender(ctx, msg, "上下文已清除");
              AIManager.saveAI(id);
              return ret;
            }
          }
        }
        case "memo": {
          const mctx = seal.getCtxProxyFirst(ctx, cmdArgs);
          const muid = mctx.player.userId;
          if (ctx.privilegeLevel < 100 && muid !== uid) {
            seal.replyToSender(ctx, msg, seal.formatTmpl(ctx, "核心:提示_无权限"));
            return ret;
          }
          const ai2 = AIManager.getAI(muid);
          const val2 = cmdArgs.getArgN(2);
          switch (val2) {
            case "st": {
              const s = cmdArgs.getRestArgsFrom(3);
              if (s.length > 20) {
                seal.replyToSender(ctx, msg, "记忆过长，请控制在20字以内");
                return ret;
              }
              ai2.memory.setSystemMemory(s);
              seal.replyToSender(ctx, msg, "记忆已添加");
              AIManager.saveAI(muid);
              return ret;
            }
            case "clr": {
              ai2.memory.clearMemory();
              seal.replyToSender(ctx, msg, "记忆已清除");
              AIManager.saveAI(muid);
              return ret;
            }
            case "show": {
              const s = ai2.memory.getPlayerMemoryPrompt();
              seal.replyToSender(ctx, msg, s || "暂无记忆");
              return ret;
            }
            default: {
              const s = `帮助:
【.ai memo st <内容>】设置记忆
【.ai memo clr】清除记忆
【.ai memo show】展示记忆`;
              seal.replyToSender(ctx, msg, s);
              return ret;
            }
          }
        }
        case "help":
        default: {
          ret.showHelp = true;
          return ret;
        }
      }
    };
    const cmdImage = seal.ext.newCmdItemInfo();
    cmdImage.name = "img";
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
        case "draw": {
          const type = cmdArgs.getArgN(2);
          switch (type) {
            case "lcl":
            case "local": {
              const image = ai.image.drawLocalImageFile();
              if (!image) {
                seal.replyToSender(ctx, msg, "暂无本地图片");
                return ret;
              }
              seal.replyToSender(ctx, msg, `[CQ:image,file=${image}]`);
              return ret;
            }
            case "stl":
            case "stolen": {
              const image = await ai.image.drawStolenImageFile();
              if (!image) {
                seal.replyToSender(ctx, msg, "暂无偷取图片");
                return ret;
              }
              seal.replyToSender(ctx, msg, `[CQ:image,file=${image}]`);
              return ret;
            }
            case "all": {
              const image = await ai.image.drawImageFile();
              if (!image) {
                seal.replyToSender(ctx, msg, "暂无图片");
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
        case "stl":
        case "steal": {
          const op = cmdArgs.getArgN(2);
          switch (op) {
            case "on": {
              ai.image.stealStatus = true;
              seal.replyToSender(ctx, msg, `图片偷取已开启,当前偷取数量:${ai.image.imageList.length}`);
              AIManager.saveAI(id);
              return ret;
            }
            case "off": {
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
        case "f":
        case "fgt":
        case "forget": {
          ai.image.imageList = [];
          seal.replyToSender(ctx, msg, "图片已遗忘");
          AIManager.saveAI(id);
          return ret;
        }
        case "itt": {
          const val2 = cmdArgs.getArgN(2);
          if (!val2) {
            seal.replyToSender(ctx, msg, "【img itt [图片/ran] (附加提示词)】图片转文字");
            return ret;
          }
          let url = "";
          if (val2 == "ran") {
            url = await ai.image.drawStolenImageFile();
            if (!url) {
              seal.replyToSender(ctx, msg, "图片偷取为空");
              return ret;
            }
          } else {
            const match = val2.match(/\[CQ:image,file=(.*?)\]/);
            if (!match) {
              seal.replyToSender(ctx, msg, "请附带图片");
              return ret;
            }
            url = match[1];
          }
          const text = cmdArgs.getRestArgsFrom(3);
          const s = await ImageManager.imageToText(ctx, url, text);
          seal.replyToSender(ctx, msg, `[CQ:image,file=${url}]
` + s);
          return ret;
        }
        default: {
          seal.replyToSender(ctx, msg, cmdImage.help);
          return ret;
        }
      }
    };
    ext.cmdMap["AI"] = cmdAI;
    ext.cmdMap["ai"] = cmdAI;
    ext.cmdMap["img"] = cmdImage;
    ext.onNotCommandReceived = async (ctx, msg) => {
      const { canPrivate } = ConfigManager.getPrivateConfig();
      if (ctx.isPrivate && !canPrivate) {
        return;
      }
      const userId = ctx.player.userId;
      const groupId = ctx.group.groupId;
      const id = ctx.isPrivate ? userId : groupId;
      let message = msg.message;
      let images = [];
      const ai = AIManager.getAI(id);
      const { clearWords, clearReplys } = ConfigManager.getForgetConfig();
      if (clearWords.some((item) => message === item)) {
        const pr = ai.privilege;
        if (ctx.privilegeLevel < pr.limit) {
          return;
        }
        ai.clearData();
        ai.context.messages = [];
        const s = clearReplys[Math.floor(Math.random() * clearReplys.length)];
        seal.replyToSender(ctx, msg, s);
        AIManager.saveAI(id);
        return;
      }
      const CQTypes = getCQTypes(message);
      if (CQTypes.length === 0 || CQTypes.every((item) => CQTypesAllow.includes(item))) {
        if (CQTypes.includes("image")) {
          const result = await ImageManager.handleImageMessage(ctx, message);
          message = result.message;
          images = result.images;
          if (ai.image.stealStatus) {
            ai.image.updateImageList(images);
          }
        }
        const { trigger, condition } = ConfigManager.getTriggerConfig(message);
        clearTimeout(ai.context.timer);
        ai.context.timer = null;
        if (trigger) {
          const fmtCondition = parseInt(seal.format(ctx, `{${condition}}`));
          if (fmtCondition == 0) {
            return;
          }
          await ai.context.iteration(ctx, message, images, "user");
          ConfigManager.printLog("非指令触发回复");
          await ai.chat(ctx, msg);
          AIManager.saveAI(id);
          return;
        } else {
          const pr = ai.privilege;
          if (pr.standby) {
            await ai.context.iteration(ctx, message, images, "user");
          }
          if (pr.counter > -1) {
            ai.context.counter += 1;
            if (ai.context.counter >= pr.counter) {
              ConfigManager.printLog("计数器触发回复");
              ai.context.counter = 0;
              await ai.chat(ctx, msg);
              AIManager.saveAI(id);
              return;
            }
          }
          if (pr.prob > -1) {
            const ran = Math.random() * 100;
            if (ran <= pr.prob) {
              ConfigManager.printLog("概率触发回复");
              await ai.chat(ctx, msg);
              AIManager.saveAI(id);
              return;
            }
          }
          if (pr.interrupt > -1) {
            const act = await ai.getAct();
            if (act >= pr.interrupt) {
              ConfigManager.printLog(`插嘴触发回复:${act}`);
              ai.context.interrupt.act = 0;
              await ai.chat(ctx, msg);
              AIManager.saveAI(id);
              return;
            }
          }
          if (pr.timer > -1) {
            ai.context.timer = setTimeout(async () => {
              ConfigManager.printLog("计时器触发回复");
              ai.context.timer = null;
              await ai.chat(ctx, msg);
              AIManager.saveAI(id);
            }, pr.timer * 1e3 + Math.floor(Math.random() * 500));
          }
        }
      }
    };
    ext.onCommandReceived = async (ctx, msg, cmdArgs) => {
      if (ToolManager.cmdArgs === null) {
        ToolManager.cmdArgs = cmdArgs;
      }
      const { allcmd } = ConfigManager.getMonitorCommandConfig();
      if (allcmd) {
        const uid = ctx.player.userId;
        const gid = ctx.group.groupId;
        const id = ctx.isPrivate ? uid : gid;
        const ai = AIManager.getAI(id);
        let message = msg.message;
        let images = [];
        const CQTypes = getCQTypes(message);
        if (CQTypes.length === 0 || CQTypes.every((item) => CQTypesAllow.includes(item))) {
          const pr = ai.privilege;
          if (pr.standby) {
            const result = await ImageManager.handleImageMessage(ctx, message);
            message = result.message;
            images = result.images;
            await ai.context.iteration(ctx, message, images, "user");
          }
        }
      }
    };
    ext.onMessageSend = async (ctx, msg) => {
      const uid = ctx.player.userId;
      const gid = ctx.group.groupId;
      const id = ctx.isPrivate ? uid : gid;
      const ai = AIManager.getAI(id);
      let message = msg.message;
      let images = [];
      if (ai.listen.status) {
        ai.listen.status = false;
        ai.listen.content = message;
        return;
      }
      const { allmsg } = ConfigManager.getMonitorAllMessageConfig();
      if (allmsg) {
        if (message === ai.context.lastReply) {
          ai.context.lastReply = "";
          return;
        }
        const CQTypes = getCQTypes(message);
        if (CQTypes.length === 0 || CQTypes.every((item) => CQTypesAllow.includes(item))) {
          const pr = ai.privilege;
          if (pr.standby) {
            const result = await ImageManager.handleImageMessage(ctx, message);
            message = result.message;
            images = result.images;
            await ai.context.iteration(ctx, message, images, "assistant");
            return;
          }
        }
      }
    };
    let isTaskRunning = false;
    seal.ext.registerTask(ext, "cron", "* * * * *", async () => {
      if (timerQueue.length === 0) {
        return;
      }
      if (isTaskRunning) {
        ConfigManager.printLog("定时器任务正在运行，跳过");
        return;
      }
      isTaskRunning = true;
      for (let i = 0; i < timerQueue.length && i >= 0; i++) {
        const timestamp = timerQueue[i].timestamp;
        if (timestamp > Math.floor(Date.now() / 1e3)) {
          continue;
        }
        const setTime = timerQueue[i].setTime;
        const content = timerQueue[i].content;
        const id = timerQueue[i].id;
        const messageType = timerQueue[i].messageType;
        const uid = timerQueue[i].uid;
        const gid = timerQueue[i].gid;
        const epId = timerQueue[i].epId;
        const msg = getMsg(messageType, uid, gid);
        const ctx = getCtx(epId, msg);
        const ai = AIManager.getAI(id);
        const s = `你设置的定时器触发了，请按照以下内容发送回复：
定时器设定时间：${setTime}
当前触发时间：${(/* @__PURE__ */ new Date()).toLocaleString()}
提示内容：${content}`;
        await ai.context.systemUserIteration("_定时器触发提示", s);
        ConfigManager.printLog("定时任务触发回复");
        ai.isChatting = false;
        await ai.chat(ctx, msg);
        AIManager.saveAI(id);
        timerQueue.splice(i, 1);
        i--;
        await new Promise((resolve) => setTimeout(resolve, 2e3));
      }
      ext.storageSet(`timerQueue`, JSON.stringify(timerQueue));
      isTaskRunning = false;
    });
  }
  main();
})();

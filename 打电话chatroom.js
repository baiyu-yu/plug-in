// ==UserScript==
// @name         打电话
// @author       白鱼魔改版（原作者：错误）
// @version      1.0.0
// @description  连接群聊私聊，只适配了QQ，原插件https://mirror.ghproxy.com/https://raw.githubusercontent.com/error2913/sealdice-js/main/link.js。使用 .chatroom 获取帮助，只为聊天室内群/私聊转发双引号内的消息。
// @timestamp    1737605949
// @license      MIT
// @homepageURL  https://github.com/baiyu-yu/plug-in/
// @updateUrl    https://raw.gitmirror.com/baiyu-yu/plug-in/refs/heads/main/%E6%89%93%E7%94%B5%E8%AF%9Dchatroom.js
// @updateUrl    https://raw.githubusercontent.com/baiyu-yu/plug-in/refs/heads/main/%E6%89%93%E7%94%B5%E8%AF%9Dchatroom.js
// ==/UserScript==

// 首先检查是否已经存在
let ext = seal.ext.find('chatroom');
if (!ext) {
    ext = seal.ext.new('chatroom', '白鱼魔改版（原作者：错误）', '1.0.0');
    seal.ext.register(ext);    

    // 注册配置项
    seal.ext.registerIntConfig(ext, '聊天室最大成员数量', 5, '聊天室最大成员数量');
    seal.ext.registerIntConfig(ext, '总列表每页最大显示聊天室数量', 10, '总列表每页最大显示聊天室数量');

    // 生成 UUID 作为神秘代码
    function generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            const r = (Math.random() * 16) | 0;
            const v = c === 'x' ? r : (r & 0x3) | 0x8;
            return v.toString(16);
        });
    }

    // 从数据库加载聊天室数据
    function loadChatRooms() {
        try {
            const data = ext.storageGet('chatRooms');
            return data ? JSON.parse(data) : {}; // 确保返回一个对象
        } catch (err) {
            console.error(`加载聊天室数据失败: ${err}`);
            return {}; // 返回空对象
        }
    }

    // 保存聊天室数据到数据库
    function saveChatRooms(chatRooms) {
        try {
            if (chatRooms && typeof chatRooms === 'object') {
                ext.storageSet('chatRooms', JSON.stringify(chatRooms));
            } else {
                console.error("无效的聊天室数据，未保存");
            }
        } catch (err) {
            console.error(`保存聊天室数据失败: ${err}`);
        }
    }

    // 获取消息对象
    function getMsg(messageType, senderId, groupId = '') {
        let msg = seal.newMessage();

        if (messageType == 'group') {
            msg.groupId = groupId;
            msg.guildId = '';
        }

        msg.messageType = messageType;
        msg.sender.userId = senderId;
        return msg;
    }

    // 获取上下文
    function getCtx(epId, msg) {
        const eps = seal.getEndPoints();

        for (let i = 0; i < eps.length; i++) {
            if (eps[i].userId === epId) {
                return seal.createTempCtx(eps[i], msg);
            }
        }

        return undefined;
    }

    // 回复私聊消息
    function replyPrivate(ctx, s, id = '') {
        const mmsg = getMsg('private', id || ctx.player.userId, ctx.group.groupId);
        const mctx = getCtx(ctx.endPoint.userId, mmsg);
        seal.replyToSender(mctx, mmsg, s);
    }

    // 回复群聊消息
    function replyGroup(ctx, s, id = '') {
        const mmsg = getMsg('group', ctx.player.userId, id || ctx.group.groupId);
        const mctx = getCtx(ctx.endPoint.userId, mmsg);
        seal.replyToSender(mctx, mmsg, s);
    }

    // 根据ID回复
    function replyById(ctx, s, id) {
        if (id.slice(0, 3) === 'QQ:') {
            replyPrivate(ctx, s, id);
        } else if (id.slice(0, 9) === 'QQ-Group:') {
            replyGroup(ctx, s, id);
        } else {
            console.error(`在replyById出错，未知的id:${id}`);
        }
    }

    // 提取双引号内的消息
    function extractQuotedText(text) {
        const stack = []; 
        const matches = []; 

        for (let i = 0; i < text.length; i++) {
            const char = text[i];

            if (char === '“' || char === '"') {
                stack.push(i);
            } else if (char === '”' || char === '"') {
                if (stack.length > 0) {
                    const start = stack.pop(); 
                    if (stack.length === 0) {
                        const quotedText = text.slice(start + 1, i);
                        matches.push(`“${quotedText}”`);
                    }
                }
            }
        }

        return matches.join('\n'); 
    }

    // 注册指令
    const cmd = seal.ext.newCmdItemInfo();
    cmd.name = 'chatroom';
    cmd.help = `聊天室功能
【.chatroom create <name>】创建聊天室
【.chatroom join <code>】加入聊天室
【.chatroom list】列出当前群或私聊创建或加入的聊天室
【.chatroom members <name>】列出指定聊天室的所有成员
【.chatroom prefix <name> <prefix>】为指定聊天室设置自己的转发前缀
【.chatroom remove <name> <ID>】移除成员（未指定名称则移除所有，ID为QQ:123或QQ-Group:123格式）
【.chatroom disband <name>】解散聊天室（未指定名称则解散所有）
【.chatroom quit [name]】退出聊天室（未指定名称则退出所有）
【.chatroom admin list/member [name]】查看所有聊天室列表聊天室（骰主可用）`;

    cmd.solve = (ctx, msg, cmdArgs) => {
        let val = cmdArgs.getArgN(1);
        let val2 = cmdArgs.getArgN(2);
        const id = ctx.isPrivate ? ctx.player.userId : ctx.group.groupId;

        const chatRooms = loadChatRooms();

        switch (val) {
            case 'create': {
                if (ctx.privilegeLevel < 69) {
                    seal.replyToSender(ctx, msg, "无权限创建聊天室");
                    return seal.ext.newCmdExecuteResult(true);
                }

                const name = val2; 
                const code = generateUUID(); 
                chatRooms[code] = {
                    name: name,
                    code: code,
                    creatorId: id,
                    members: [id],
                    prefixes: {} 
                };

                saveChatRooms(chatRooms);
                seal.replyToSender(ctx, msg, `聊天室【${name}】已创建，神秘代码：${code}`);
                return seal.ext.newCmdExecuteResult(true);
            }

            case 'join': {
                const code = val2; 
                if (!chatRooms[code]) {
                    seal.replyToSender(ctx, msg, "聊天室不存在");
                    return seal.ext.newCmdExecuteResult(true);
                }

                const chatRoom = chatRooms[code];
                const maxmembers = seal.ext.getIntConfig(ext, "聊天室最大成员数量");
                if (chatRoom.members.length >= maxmembers) {
                    seal.replyToSender(ctx, msg, "聊天室已满");
                    return seal.ext.newCmdExecuteResult(true);
                }

                if (chatRoom.members.includes(id)) {
                    seal.replyToSender(ctx, msg, "你已在此聊天室中");
                    return seal.ext.newCmdExecuteResult(true);
                }

                chatRoom.members.push(id);
                chatRoom.prefixes[id] = ''; 
                saveChatRooms(chatRooms);
                seal.replyToSender(ctx, msg, `已加入聊天室【${chatRoom.name}】`);
                return seal.ext.newCmdExecuteResult(true);
            }

            case 'list': {
                const rooms = [];
                for (const code in chatRooms) {
                    const chatRoom = chatRooms[code];
                    if (chatRoom.members.includes(id) || chatRoom.creatorId === id) {
                        const isOwner = chatRoom.creatorId === id ? "（房主）" : "";
                        rooms.push(`【${chatRoom.name}】${isOwner} 神秘代码：${chatRoom.code}`);
                    }
                }
                seal.replyToSender(ctx, msg, rooms.join('\n') || "未加入或创建任何聊天室");
                return seal.ext.newCmdExecuteResult(true);
            }

            case 'members': {
                const name = val2;
                const targetRoom = Object.values(chatRooms).find(room => room.name === name);

                if (!targetRoom) {
                    seal.replyToSender(ctx, msg, "未找到指定聊天室");
                    return seal.ext.newCmdExecuteResult(true);
                }

                if (!targetRoom.members.includes(id) && targetRoom.creatorId !== id) {
                    seal.replyToSender(ctx, msg, "你不在该聊天室中");
                    return seal.ext.newCmdExecuteResult(true);
                }

                const members = targetRoom.members.join('\n');
                seal.replyToSender(ctx, msg, `聊天室【${targetRoom.name}】成员列表：\n${members}`);
                return seal.ext.newCmdExecuteResult(true);
            }

            case 'prefix': {
                const name = val2; 
                const prefix = cmdArgs.getArgN(3);

                if (!prefix) {
                    seal.replyToSender(ctx, msg, "请提供前缀内容");
                    return seal.ext.newCmdExecuteResult(true);
                }

                if (!chatRooms || typeof chatRooms !== 'object') {
                    seal.replyToSender(ctx, msg, "聊天室数据加载失败");
                    return seal.ext.newCmdExecuteResult(true);
                }

                const targetRoom = Object.values(chatRooms).find(room => room.name === name);

                if (!targetRoom) {
                    seal.replyToSender(ctx, msg, "未找到指定聊天室");
                    return seal.ext.newCmdExecuteResult(true);
                }

                if (!targetRoom.members.includes(id)) {
                    seal.replyToSender(ctx, msg, "你不在该聊天室中");
                    return seal.ext.newCmdExecuteResult(true);
                }

                if (!targetRoom.prefixes) {
                    targetRoom.prefixes = {};
                }

                targetRoom.prefixes[id] = prefix; 
                saveChatRooms(chatRooms);
                seal.replyToSender(ctx, msg, `已为聊天室【${targetRoom.name}】设置你的转发前缀：${prefix}`);
                return seal.ext.newCmdExecuteResult(true);
            }

            case 'remove': {
                const name = val2; 
                const roomsToRemove = [];

                for (const code in chatRooms) {
                    const chatRoom = chatRooms[code];
                    if (chatRoom.creatorId === id && (!name || chatRoom.name === name)) {
                        roomsToRemove.push(chatRoom);
                    }
                }

                if (roomsToRemove.length === 0) {
                    seal.replyToSender(ctx, msg, "未找到符合条件的聊天室");
                    return seal.ext.newCmdExecuteResult(true);
                }

                roomsToRemove.forEach(chatRoom => {
                    const targetId = cmdArgs.getArgN(3); 
                    if (targetId) {
                        chatRoom.members = chatRoom.members.filter(member => member !== targetId);
                        delete chatRoom.prefixes[targetId]; 
                        seal.replyToSender(ctx, msg, `已从【${chatRoom.name}】移除成员 ${targetId}`);
                    } else {
                        delete chatRooms[chatRoom.code];
                        seal.replyToSender(ctx, msg, `已解散聊天室【${chatRoom.name}】`);
                    }
                });

                saveChatRooms(chatRooms);
                return seal.ext.newCmdExecuteResult(true);
            }

            case 'disband': {
                const name = val2;
                const roomsToDisband = [];

                for (const code in chatRooms) {
                    const chatRoom = chatRooms[code];
                    if (chatRoom.creatorId === id && (!name || chatRoom.name === name)) {
                        roomsToDisband.push(chatRoom);
                    }
                }

                if (roomsToDisband.length === 0) {
                    seal.replyToSender(ctx, msg, "未找到符合条件的聊天室");
                    return seal.ext.newCmdExecuteResult(true);
                }

                roomsToDisband.forEach(chatRoom => {
                    delete chatRooms[chatRoom.code];
                    seal.replyToSender(ctx, msg, `已解散聊天室【${chatRoom.name}】`);
                });

                saveChatRooms(chatRooms);
                return seal.ext.newCmdExecuteResult(true);
            }

            case 'quit': {
                const name = val2; 
                const roomsToQuit = [];

                for (const code in chatRooms) {
                    const chatRoom = chatRooms[code];
                    if (chatRoom.members.includes(id) && (!name || chatRoom.name === name)) {
                        roomsToQuit.push(chatRoom);
                    }
                }

                if (roomsToQuit.length === 0) {
                    seal.replyToSender(ctx, msg, "未找到符合条件的聊天室");
                    return seal.ext.newCmdExecuteResult(true);
                }

                roomsToQuit.forEach(chatRoom => {
                    if (chatRoom.creatorId === id) {
                        delete chatRooms[chatRoom.code];
                        seal.replyToSender(ctx, msg, `已解散聊天室【${chatRoom.name}】`);
                    } else {
                        chatRoom.members = chatRoom.members.filter(member => member !== id);
                        delete chatRoom.prefixes[id]; 
                        seal.replyToSender(ctx, msg, `已退出聊天室【${chatRoom.name}】`);
                    }
                });

                saveChatRooms(chatRooms);
                return seal.ext.newCmdExecuteResult(true);
            }

            case 'admin': {
                if (ctx.privilegeLevel <= 90) {
                    seal.replyToSender(ctx, msg, "权限不足，无法执行此操作");
                    return seal.ext.newCmdExecuteResult(true);
                }
            
                const subCommand = val2;
                const chatRooms = loadChatRooms();
            
                if (subCommand === 'list') {
                    // 获取所有聊天室列表和成员数，并按名称排序
                    const sortedRooms = Object.values(chatRooms).sort((a, b) => a.name.localeCompare(b.name));
                    const roomsInfo = [];
                    let index = 1; 
            
                    for (const chatRoom of sortedRooms) {
                        roomsInfo.push(`${index}. 【${chatRoom.name}】 成员数：${chatRoom.members.length}`);
                        chatRoom.index = index; 
                        index++;
                    }
            
                    if (roomsInfo.length === 0) {
                        seal.replyToSender(ctx, msg, "当前没有任何聊天室。");
                        return seal.ext.newCmdExecuteResult(true);
                    }
            
                    // 分页逻辑
                    const pageSize = seal.ext.getIntConfig(ext, "总列表每页最大显示聊天室数量");
                    const totalPages = Math.ceil(roomsInfo.length / pageSize);
            
                    let page = parseInt(cmdArgs.getArgN(3)) || 1;
                    if (page < 1 || page > totalPages) {
                        seal.replyToSender(ctx, msg, `页码无效，请输入1到${totalPages}之间的数字`);
                        return seal.ext.newCmdExecuteResult(true);
                    }
            
                    // 计算当前页的记录范围
                    const start = (page - 1) * pageSize;
                    const end = start + pageSize;
                    const currentPageRooms = roomsInfo.slice(start, end);
            
                    // 添加分页信息和换行
                    const pageInfo = `第${page}页，共${totalPages}页`;
                    const formattedMessage = currentPageRooms.join('\n');
                    const finalMessage = `${pageInfo}\n${formattedMessage}`;
            
                    seal.replyToSender(ctx, msg, finalMessage);
                    return seal.ext.newCmdExecuteResult(true);
                } else if (subCommand === 'members') {
                    const roomIdentifier = cmdArgs.getArgN(3);
                    if (!roomIdentifier) {
                        seal.replyToSender(ctx, msg, "请提供聊天室名称或编号");
                        return seal.ext.newCmdExecuteResult(true);
                    }
            
                    let targetRoom = null;
            
                    if (!isNaN(roomIdentifier)) {
                        const roomIndex = parseInt(roomIdentifier);
                        const sortedRooms = Object.values(chatRooms).sort((a, b) => a.name.localeCompare(b.name));
                        if (roomIndex >= 1 && roomIndex <= sortedRooms.length) {
                            targetRoom = sortedRooms[roomIndex - 1]; // 编号从1开始，数组从0开始
                        }
                    } else {
                        // 如果编号查找失败，尝试通过名称查找
                        targetRoom = Object.values(chatRooms).find(room => room.name === roomIdentifier);
                    }
            
                    if (!targetRoom) {
                        seal.replyToSender(ctx, msg, "未找到指定聊天室");
                        return seal.ext.newCmdExecuteResult(true);
                    }
            
                    const members = targetRoom.members.join('\n');
                    seal.replyToSender(ctx, msg, `聊天室【${targetRoom.name}】成员列表：\n${members}`);
                    return seal.ext.newCmdExecuteResult(true);
                } else {
                    seal.replyToSender(ctx, msg, "未知的子命令，请使用 .chatroom admin list 或 .chatroom admin members <name/index>");
                    return seal.ext.newCmdExecuteResult(true);
                }
            }

            default: {
                const ret = seal.ext.newCmdExecuteResult(true);
                ret.showHelp = true;
                return ret;
            }
        }
    };

    ext.cmdMap['chatroom'] = cmd;

    // 消息转发逻辑
    ext.onNotCommandReceived = (ctx, msg) => {
        const senderId = ctx.isPrivate ? ctx.player.userId : ctx.group.groupId;
        const filteredMessage = extractQuotedText(msg.message);
        if (!filteredMessage) return; 

        const chatRooms = loadChatRooms();

        for (const code in chatRooms) {
            const chatRoom = chatRooms[code];
            if (chatRoom.members.includes(senderId)) {
                const prefix = chatRoom.prefixes[senderId] || '';

                const formattedMessage = prefix
                    ? `${prefix}：${filteredMessage}`
                    : filteredMessage;

                chatRoom.members.forEach(memberId => {
                    if (memberId !== senderId) {
                        replyById(ctx, formattedMessage, memberId);
                    }
                });
            }
        }
    };
}
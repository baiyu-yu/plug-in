// ==UserScript==
// @name         全自动查集骰插件
// @description  全自动查集骰插件，可通过添加http上报每日定时扫群列表和群成员列表检测是否在集骰群，可通过.集骰白名单 add/rm/list group/dice <ID> 添加/移除/查看 白名单 群/骰（ID不需要前缀），可通过.上报骰号 <骰号> <存活状态> // 上报该骰号及其存活状态到后端（0 或 1），可通过.移除骰号 <骰号> // 移除该骰号。若不开启http端口，也可以通过纯监听群内短时间响应指令数量判断是否有集骰嫌疑。将在定时任务启动时自行上报装了插件的骰娘的存活，这种方式上报的骰号一段时间内没二次上报自动修改为死掉。
// @version      1.0.0
// @license      MIT
// @author       白鱼&错误
// @timestamp    1728214065
// @homepageURL  https://github.com/baiyu-yu/plug-in
// @updateUrl    https://mirror.ghproxy.com/https://raw.githubusercontent.com/baiyu-yu/plug-in/refs/heads/main/%E5%85%A8%E8%87%AA%E5%8A%A8%E6%9F%A5%E9%9B%86%E9%AA%B0%E6%8F%92%E4%BB%B6.js
// @updateUrl    https://raw.githubusercontent.com/baiyu-yu/plug-in/refs/heads/main/%E5%85%A8%E8%87%AA%E5%8A%A8%E6%9F%A5%E9%9B%86%E9%AA%B0%E6%8F%92%E4%BB%B6.js
// @sealVersion  1.4.6
// ==/UserScript==

if (!seal.ext.find("集骰检查")) {
    const ext = seal.ext.new("集骰检查", "白鱼&错误", "1.0.0");

    // 注册配置项
    seal.ext.register(ext);
    seal.ext.registerBoolConfig(ext, "是否开启HTTP请求功能", false, '该项修改并保存后请重载js');
    seal.ext.registerTemplateConfig(ext, "HTTP端口", ["例：http://127.0.0.1:8097"]);
    seal.ext.registerIntConfig(ext, "每次最大检查群数", 10);
    seal.ext.registerIntConfig(ext, "每个群处理间隔（s）", 2);
    seal.ext.registerIntConfig(ext, "每批处理间隔（s）", 60);
    seal.ext.registerOptionConfig(ext, "定时任务方式", "daily", ["daily", "cron"], "该项修改并保存后请重载js");
    seal.ext.registerStringConfig(ext, "定时任务表达式", "06:00", "该项修改并保存后请重载js\n选择cron请自行查找使用方法");
    seal.ext.registerStringConfig(ext, "达到退群阈值往群内发送文本", "检测到该群有多个记录存活骰娘，将在五秒后退群", "");

    seal.ext.registerIntConfig(ext, "集骰通知阈值", 3, "包括自己");
    seal.ext.registerIntConfig(ext, "自动退群阈值", 7);
    seal.ext.registerBoolConfig(ext, "是否监听全部指令", false, "");
    seal.ext.registerTemplateConfig(ext, "监听指令名称", ["bot", "r"], "");
    seal.ext.registerBoolConfig(ext, "是否计入全部消息", false, "");
    seal.ext.registerTemplateConfig(ext, "计入消息模版", ["SealDice|Shiki|AstralDice|OlivaDice|SitaNya", "[Dd]\\d"], "使用正则表达式");
    seal.ext.registerIntConfig(ext, "指令后n秒内计入", 5, "");
    seal.ext.registerFloatConfig(ext, "暂时白名单时限/分钟", 720, "监听一次指令后会暂时加入白名单");

    const backendHost = "http://110.41.69.149:8889"; // 后端服务器地址，写死
    const whiteListGroup = JSON.parse(ext.storageGet("whiteListGroup") || '[]').map(String);
    const whiteListDice = JSON.parse(ext.storageGet("whiteListDice") || '[]').map(String);
    const whiteListMonitor = JSON.parse(ext.storageGet("whiteListMonitor") || '{}');
    const whiteListLeave = JSON.parse(ext.storageGet("whiteListLeave") || '{}');

    /** 已弃用
     * 根据 ID 获取 ctx 和 msg
     * @param {string} epId - 端点 ID
     * @param {string} groupId - 群 ID
     * @param {string} guildId - 频道 ID
     * @param {string} senderId - 发送者 ID
     * @returns {Object} ctx 和 msg 对象
     */
    function getCtxAndMsgById(epId, groupId, guildId, senderId) {
        let eps = seal.getEndPoints()
        for (let i = 0; i < eps.length; i++) {
            if (eps[i].userId === epId) {
                let msg = seal.newMessage();
                msg.messageType = "group";
                msg.groupId = groupId;
                msg.guildId = guildId;
                msg.sender.userId = senderId;
                let mctx = seal.createTempCtx(eps[i], msg)
                return { mctx, msg };
            }
        }
        return undefined;
    }

    /**
     * 通过ID发送通知
     * @param {string} epId 
     * @param {string} groupId 
     * @param {string} guildId 
     * @param {string} senderId 
     * @param {string} text
     */
    function noticeById(epId, groupId, guildId, senderId, text) {
        let eps = seal.getEndPoints()
        for (let i = 0; i < eps.length; i++) {
            if (eps[i].userId === epId) {
                let msg = seal.newMessage();
                msg.messageType = "group";
                msg.groupId = groupId;
                msg.guildId = guildId;
                msg.sender.userId = senderId;
                let mctx = seal.createTempCtx(eps[i], msg)
                mctx.notice(text)
            }
        }
    }

    /**
     * 通过ID回复
     * @param {string} epId
     * @param {string} groupId
     * @param {string} guildId
     * @param {string} senderId
     * @param {string} text
     */
    function replyById(epId, groupId, guildId, senderId, text) {
        let eps = seal.getEndPoints()
        for (let i = 0; i < eps.length; i++) {
            if (eps[i].userId === epId) {
                let msg = seal.newMessage();
                msg.messageType = "group";
                msg.groupId = groupId;
                msg.guildId = guildId;
                msg.sender.userId = senderId;
                let mctx = seal.createTempCtx(eps[i], msg)
                seal.replyToSender(mctx, msg, text)
            }
        }
    }

    /**
     * 获取登录信息
     * @param {string} groupApiHost - 群API主机地址
     * @returns {Promise<string>} 用户ID
     */
    async function getLoginInfo(groupApiHost) {
        try {
            const loginInfoResponse = await fetch(`${groupApiHost}/get_login_info`);
            const loginInfo = await loginInfoResponse.json();
            console.log(`获取登录信息成功，user_id: ${loginInfo.data.user_id}`);
            return loginInfo.data.user_id
        } catch (error) {
            console.error(`获取登录信息失败: ${error.message}`);
            return null;
        }
    }

    /**
     * 获取登录信息2
     * @returns {Promise<string>} 用户ID
     */
    function getEnabledQQ() {
        const eps = seal.getEndPoints();
        for (let i = 0; i < eps.length; i++) {
            if (eps[i].baseInfo.enable && eps[i].userId.startsWith("QQ:")) {
                const qqNumber = eps[i].userId.replace('QQ:', '');
                return qqNumber;
            }
        }
        return null;
    }


    /**
     * 获取群列表
     * @param {string} groupApiHost - 群API主机地址
     * @returns {Promise<Array>} 群列表
     */
    async function getGroupList(groupApiHost) {
        try {
            const groupListResponse = await fetch(`${groupApiHost}/get_group_list`);
            const groupList = await groupListResponse.json();
            console.log(`获取群列表成功，数量: ${groupList.data.length}`);
            return groupList.data;
        } catch (error) {
            console.error(`获取群列表失败: ${error.message}`);
            return [];
        }
    }

    /**
     * 获取群成员列表
     * @param {string} groupApiHost - 群API主机地址
     * @param {string} raw_groupId - 群ID
     * @returns {Promise<Array>} 群成员列表
     */
    async function getGroupMemberList(groupApiHost, raw_groupId) {
        try {
            const memberListResponse = await fetch(`${groupApiHost}/get_group_member_list?group_id=${raw_groupId}`);
            const membersData = await memberListResponse.json();
            const membersArray = Array.from(membersData.data);  // 从 data 字段获取成员数组
            console.log(`群 ${raw_groupId} 成员列表获取成功，数量: ${membersArray.length}`);
            return membersArray;
        } catch (error) {
            console.error(`获取群 ${raw_groupId} 成员列表失败: ${error.message}`);
            return [];
        }
    }

    /**
     * 自动退群
     * @param {string} groupApiHost - 群API主机地址
     * @param {string} raw_groupId - 群ID
     * @returns {Promise<boolean>} 成功返回 true，失败返回 false
     */
    async function setGroupLeave(groupApiHost, raw_groupId) {
        try {
            await fetch(`${groupApiHost}/set_group_leave`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ group_id: raw_groupId, is_dismiss: false })
            });
            console.log(`群 ${raw_groupId} 超过阈值，已自动退群`);
            return true;
        } catch (error) {
            console.error(`自动退群失败: ${error.message}`);
            return false;
        }
    }

    /**
     * 通过方法1上报自身账号的存活状态
     * @param {string} backendHost - 后端服务器地址
     * @param {string} raw_epId - 自身账号
     * @returns {Promise<boolean>} 上报成功返回 true，失败返回 false
     */
    async function reportSelfAliveStatus(backendHost, raw_epId) {
        try {
            await fetch(`${backendHost}/api/report_alive_method1`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ dice_id: raw_epId })
            });
            console.log(`上报自身账号存活状态成功`);
            return true;
        } catch (error) {
            console.error(`上报自身账号存活状态失败: ${error.message}`);
            return false;
        }
    }

    /**
     * 获取存活骰号列表
     * @param {string} backendHost - 后端服务器地址
     * @returns {Promise<Array>} 存活骰号列表
     */
    async function getAliveDiceList(backendHost) {
        try {
            const diceResponse = await fetch(`${backendHost}/api/get_alive_dice`);
            const aliveDice = await diceResponse.json();
            console.log(`获取存活骰号成功，数量: ${aliveDice.length}`);
            return aliveDice.map(String);
        } catch (error) {
            console.error(`获取存活骰号失败: ${error.message}`);
            return [];
        }
    }



    const useHttp = seal.ext.getBoolConfig(ext, "是否开启HTTP请求功能");
    if (useHttp) {
        const taskKey = seal.ext.getOptionConfig(ext, "定时任务方式");
        const taskValue = seal.ext.getStringConfig(ext, "定时任务表达式")
        // 定义定时检查任务，针对每个 groupApiHost 进行独立处理
        seal.ext.registerTask(ext, taskKey, taskValue, async (taskCtx) => {
            try {
                console.log("开始定期检查任务");

                //获取配置项
                const groupApiHosts = seal.ext.getTemplateConfig(ext, "HTTP端口");
                const maxGroups = seal.ext.getIntConfig(ext, "每次最大检查群数");
                const pauseGroup = seal.ext.getIntConfig(ext, "每个群处理间隔（s）");
                const pauseBatch = seal.ext.getIntConfig(ext, "每批处理间隔（s）");
                const threshold = seal.ext.getIntConfig(ext, "集骰通知阈值");
                const leaveThreshold = seal.ext.getIntConfig(ext, "自动退群阈值");

                for (let i = 0; i < groupApiHosts.length; i++) {
                    const groupApiHost = groupApiHosts[i];

                    console.log(`正在处理 groupApiHost: ${groupApiHost}`);

                    const raw_epId = await getLoginInfo(groupApiHost);
                    if (!raw_epId) continue;

                    const groupList = await getGroupList(groupApiHost);
                    if (!groupList) continue;

                    if (!await reportSelfAliveStatus(backendHost, raw_epId)) continue;

                    const aliveDiceList = await getAliveDiceList(backendHost);
                    if (!aliveDiceList) continue;

                    // 按批次处理群成员检查
                    for (let j = 0; j < groupList.length; j += maxGroups) {
                        let groupBatch = groupList.slice(j, j + maxGroups);
                        console.log(`处理第 ${j + 1} 批群成员检查，批量大小: ${groupBatch.length}`);

                        for (const group of groupBatch) {
                            const raw_groupId = String(group.group_id);  // 将 groupId 转为字符串

                            if (whiteListGroup.includes(raw_groupId)) {
                                console.log(`群 ${raw_groupId} 在白名单中，跳过处理`);
                                continue;
                            }

                            // 获取群成员列表
                            const memberList = await getGroupMemberList(groupApiHost, raw_groupId);
                            if (!memberList) continue;

                            // 过滤白名单中的骰号
                            let matchedDice = memberList.filter(member => {
                                const memberId = String(member.user_id);  // 转为字符串
                                return aliveDiceList.includes(memberId) && !whiteListDice.includes(memberId);
                            });

                            console.log(`群 ${raw_groupId} 匹配到的存活骰号数量（排除白名单骰号）: ${matchedDice.length}`);

                            if (whiteListLeave[raw_groupId] && whiteListLeave[raw_groupId] + 604800 < taskCtx.now) {
                                if (matchedDice.length >= leaveThreshold) {
                                    // 发送严重警告信息
                                    let diceOwners = matchedDice.map(dice => dice.user_id).join(', ');
                                    let warningMessage = `严重警告！群号: ${raw_groupId} 极有可能集骰。匹配到的骰号:\n ${diceOwners.join('\n')}。\n将在5秒后自动退群。`;

                                    let epId = `QQ:${raw_epId}`;
                                    let groupId = `QQ-Group:${raw_groupId}`;
                                    console.log('groupId:', groupId);
                                    
                                    const ingroupwarningMessage = seal.ext.getStringConfig(ext, "达到退群阈值往群内发送文本")

                                    noticeById(epId, groupId, "", "QQ:114514", warningMessage);
                                    replyById(epId, groupId, "", "QQ:114514", ingroupwarningMessage);

                                    console.log(`暂停5秒后尝试退群`);
                                    await new Promise(resolve => setTimeout(resolve, 5000));

                                    // 自动退群
                                    if (!await setGroupLeave(groupApiHost, raw_groupId)) continue;
                                    whiteListLeave[raw_groupId] = taskCtx.now
                                    ext.storageSet("whiteListLeave", JSON.stringify(whiteListLeave))
                                    console.log('加入退群白名单:', taskCtx.now)

                                } else if (matchedDice.length >= threshold) {
                                    // 触发警告
                                    let diceOwners = matchedDice.map(dice => dice.user_id).join(', ');
                                    let warningMessage = `警告！群号: ${raw_groupId} 可能集骰。匹配到的骰号:\n ${diceOwners.join('\n')}`;

                                    // 使用 getctxById 获取 ctx 并通过 ctx.notice 发送警告信息
                                    let epId = `QQ:${raw_epId}`;
                                    let groupId = `QQ-Group:${raw_groupId}`;
                                    console.log('groupId:', groupId);

                                    noticeById(epId, groupId, "", "QQ:114514", warningMessage);
                                    console.log(`警告已发送: ${warningMessage}`);
                                }
                            }

                            // 每个群请求后暂停
                            console.log(`暂停 ${pauseGroup} 秒后继续处理下一个群`);
                            await new Promise(resolve => setTimeout(resolve, pauseGroup * 1000));
                        }

                        // 每批次处理完后暂停
                        console.log(`暂停 ${pauseBatch} 秒后继续处理下一个批次`);
                        await new Promise(resolve => setTimeout(resolve, pauseBatch * 1000));
                    }
                }
            } catch (error) {
                console.error("定期检查任务执行失败:", error);
            }
        });
    }

    // 指令：管理群号和骰号白名单
    let cmdWhitelist = seal.ext.newCmdItemInfo();
    cmdWhitelist.name = "集骰白名单";
    cmdWhitelist.help = "管理群号和骰号白名单\n用法：.集骰白名单 add/rm/list group/dice <ID>";
    cmdWhitelist.solve = async (ctx, msg, cmdArgs) => {
        const action = cmdArgs.getArgN(1);
        const type = cmdArgs.getArgN(2);
        const id = cmdArgs.getArgN(3);

        if (!id && action !== "list") {
            seal.replyToSender(ctx, msg, "请提供 ID（群号或骰号）。");
            return;
        }

        switch (action) {
            case "add":
                if (type === "group") {
                    if (!whiteListGroup.includes(id)) {
                        whiteListGroup.push(id);
                        ext.storageSet("whiteListGroup", JSON.stringify(whiteListGroup));
                        seal.replyToSender(ctx, msg, `群 ${id} 已加入白名单。`);
                    } else {
                        seal.replyToSender(ctx, msg, `群 ${id} 已在白名单中。`);
                    }
                } else if (type === "dice") {
                    if (!whiteListDice.includes(id)) {
                        whiteListDice.push(id);
                        ext.storageSet("whiteListDice", JSON.stringify(whiteListDice));
                        seal.replyToSender(ctx, msg, `骰号 ${id} 已加入白名单。`);
                    } else {
                        seal.replyToSender(ctx, msg, `骰号 ${id} 已在白名单中。`);
                    }
                }
                break;

            case "rm":
                if (type === "group") {
                    if (whiteListGroup.includes(id)) {
                        whiteListGroup = whiteListGroup.filter(g => g !== id);
                        ext.storageSet("whiteListGroup", JSON.stringify(whiteListGroup));
                        seal.replyToSender(ctx, msg, `群 ${id} 已从白名单移除。`);
                    } else {
                        seal.replyToSender(ctx, msg, `群 ${id} 不在白名单中。`);
                    }
                } else if (type === "dice") {
                    if (whiteListDice.includes(id)) {
                        whiteListDice = whiteListDice.filter(d => d !== id);
                        ext.storageSet("whiteListDice", JSON.stringify(whiteListDice));
                        seal.replyToSender(ctx, msg, `骰号 ${id} 已从白名单移除。`);
                    } else {
                        seal.replyToSender(ctx, msg, `骰号 ${id} 不在白名单中。`);
                    }
                }
                break;

            case "list":
                if (type === "group") {
                    seal.replyToSender(ctx, msg, `白名单群号列表: ${whiteListGroup.join(', ')}`);
                } else if (type === "dice") {
                    seal.replyToSender(ctx, msg, `白名单骰号列表: ${whiteListDice.join(', ')}`);
                } else {
                    seal.replyToSender(ctx, msg, "请指定 group 或 dice 类型。");
                }
                break;

            default:
                seal.replyToSender(ctx, msg, "未知命令。请使用 add/rm/list group/dice");
        }
    };
    ext.cmdMap["集骰白名单"] = cmdWhitelist;

    // 上报骰号和存活状态（方法2）
    let cmdReportDice = seal.ext.newCmdItemInfo();
    cmdReportDice.name = "上报骰号";
    cmdReportDice.help = "用法：.上报骰号 <骰号> <存活状态> // 上报该骰号及其存活状态（0 或 1）";
    cmdReportDice.solve = async (ctx, msg, cmdArgs) => {
        const diceId = cmdArgs.getArgN(1);
        const aliveStatus = cmdArgs.getArgN(2);
        if (diceId === 'help') {
            const helpMessage = `用法：.上报骰号 <骰号> <存活状态> // 上报该骰号及其存活状态（0: 不存活, 1: 存活）`;
            seal.replyToSender(ctx, msg, helpMessage);
            return seal.ext.newCmdExecuteResult(true);
        }
        if (!diceId || !aliveStatus) {
            seal.replyToSender(ctx, msg, "请提供骰号和存活状态（0: 不存活, 1: 存活）。");
            return;
        }
        try {
            const reportResponse = await fetch(`${backendHost}/api/report_dice_method2`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ dice_id: diceId, alive: aliveStatus === '1' })
            });
            const data = await reportResponse.json();
            seal.replyToSender(ctx, msg, data.message || "上报成功");
        } catch (error) {
            console.error("上报失败:", error);
            seal.replyToSender(ctx, msg, "上报失败，请稍后再试。");
        }
    };
    ext.cmdMap["上报骰号"] = cmdReportDice;

    // 移除骰号
    let cmdRemoveDice = seal.ext.newCmdItemInfo();
    cmdRemoveDice.name = "移除骰号";
    cmdRemoveDice.help = "用法：.移除骰号 <骰号> // 移除该骰号";
    cmdRemoveDice.solve = async (ctx, msg, cmdArgs) => {
        const diceId = cmdArgs.getArgN(1);
        if (diceId === 'help') {
            const helpMessage = `用法：.移除骰号 <骰号> // 移除该骰号`;
            seal.replyToSender(ctx, msg, helpMessage);
            return seal.ext.newCmdExecuteResult(true);
        }
        if (!diceId) {
            seal.replyToSender(ctx, msg, "请提供骰号。");
            return;
        }
        try {
            const removeResponse = await fetch(`${backendHost}/api/remove_dice`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ dice_id: diceId })
            });
            const data = await removeResponse.json();
            seal.replyToSender(ctx, msg, data.message || "移除成功");
        } catch (error) {
            console.error("移除失败:", error);
            seal.replyToSender(ctx, msg, "移除失败，请稍后再试。");
        }
    };
    ext.cmdMap["移除骰号"] = cmdRemoveDice;

    //监听指令
    ext.onCommandReceived = (ctx, msg, cmdArgs) => {
        if (ctx.isPrivate) return;
        const isAll = seal.ext.getBoolConfig(ext, "是否监听全部指令");
        const commands = seal.ext.getTemplateConfig(ext, "监听指令名称");
        const whiteListTime = seal.ext.getFloatConfig(ext, "暂时白名单时限/分钟") * 60;
        const rawGroupId = ctx.group.groupId.replace(/\D+/g, "")

        if ((isAll || commands.includes(cmdArgs.command)) && (!whiteListMonitor[rawGroupId] || parseInt(msg.time) - whiteListMonitor[rawGroupId].time > whiteListTime)) {
            console.log(`监听指令:群号${rawGroupId}`)
            whiteListMonitor[rawGroupId] = { time: parseInt(msg.time), dices: [], noticed: false };
            ext.storageSet("whiteListMonitor", JSON.stringify(whiteListMonitor));
        }
    }

    //监听到指令计入消息，超过阈值时通知
    ext.onNotCommandReceived = (ctx, msg) => {
        if (ctx.isPrivate) return;
        const noticeLimit = seal.ext.getIntConfig(ext, "集骰通知阈值");
        const isAllMsg = seal.ext.getBoolConfig(ext, "是否计入全部消息");
        const msgTemplate = seal.ext.getTemplateConfig(ext, "计入消息模版");
        const time = seal.ext.getIntConfig(ext, "指令后n秒内计入");
        const rawGroupId = ctx.group.groupId.replace(/\D+/g, "")

        if ((isAllMsg || msgTemplate.some(template => msg.message.match(template))) && whiteListMonitor[rawGroupId] && parseInt(msg.time) - whiteListMonitor[rawGroupId].time < time) {
            if (!whiteListMonitor[rawGroupId].dices.includes(ctx.player.userId)) whiteListMonitor[rawGroupId].dices.push(ctx.player.userId);
            if (whiteListMonitor[rawGroupId].dices.length + 1 >= noticeLimit && !whiteListMonitor[rawGroupId].noticed) {
                const qqNumber = getEnabledQQ();
                if (!qqNumber) {
                console.log("未找到启用的QQ账号");
                    return;
                }
                await reportSelfAliveStatus(backendHost, qqNumber);
                // 获取服务器存活骰号列表并与疑似骰号进行比对
                const aliveDiceList = await getAliveDiceList(backendHost);
                const suspectedDice = whiteListMonitor[rawGroupId].dices;            
                // 对在服务器有记录存活骰号进行标记
                const markedDice = suspectedDice.map(dice => {
                    if (aliveDiceList.includes(dice)) {
                        return `${dice} (在服务器有记录)`;
                    } else {
                        return dice;
                    }
                });
                // 发布带标记的公告
                ctx.notice(`疑似集骰警告:群号${rawGroupId}，请注意检查\n疑似骰子QQ号:\n${markedDice.join('\n')}`);
                whiteListMonitor[rawGroupId].noticed = true;
                ext.storageSet("whiteListMonitor", JSON.stringify(whiteListMonitor));
            }
        }
    }
}

// ==UserScript==
// @name         全自动查集骰插件
// @description  全自动查集骰插件
// @version      1.0.0
// @license      MIT
// @author       白鱼
// @homepageURL  https://github.com/baiyu-yu/plug-in
// ==/UserScript==

if (!seal.ext.find("dicePeriodicCheck")) { 
    const ext = seal.ext.new("dicePeriodicCheck", "白鱼", "1.0.0");

    // 注册配置项，支持多个 groupApiHost
    seal.ext.register(ext);
    seal.ext.registerTemplateConfig(ext, "groupApiHost", ["http://127.0.0.1:8097"], "获取群列表/群成员的API地址");
    seal.ext.registerIntConfig(ext, "maxGroupsPerCheck", 10, "每次最大检查群数");
    seal.ext.registerIntConfig(ext, "pauseBetweenGroups", 2, "每个群请求后的等待时间（秒）");
    seal.ext.registerIntConfig(ext, "pauseBetweenBatches", 60, "每批请求后的等待时间（秒）");
    seal.ext.registerIntConfig(ext, "clusterDiceThreshold", 3, "多少个骰号判定为集骰");
    seal.ext.registerIntConfig(ext, "leaveGroupThreshold", 7, "超过该数值将自动退群");

    const backendHost = "http://110.41.69.149:8889"; // 后端服务器地址，写死
    let whiteListGroups = [];
    let whiteListDice = [];

    // 从存储加载白名单
    const storedWhiteListGroups = ext.storageGet("whiteListGroups");
    const storedWhiteListDice = ext.storageGet("whiteListDice");
    if (storedWhiteListGroups) whiteListGroups = JSON.parse(storedWhiteListGroups);
    if (storedWhiteListDice) whiteListDice = JSON.parse(storedWhiteListDice);

    // 获取配置项
    let groupApiHosts = seal.ext.getTemplateConfig(ext, "groupApiHost");
    const maxGroups = seal.ext.getIntConfig(ext, "maxGroupsPerCheck");
    const pauseGroup = seal.ext.getIntConfig(ext, "pauseBetweenGroups");
    const pauseBatch = seal.ext.getIntConfig(ext, "pauseBetweenBatches");
    const threshold = seal.ext.getIntConfig(ext, "clusterDiceThreshold");
    const leaveThreshold = seal.ext.getIntConfig(ext, "leaveGroupThreshold");

    // 定义定时检查任务，针对每个 groupApiHost 进行独立处理
    seal.ext.registerTask(ext, "cron", "*/1 * * * *", async (taskCtx) => {
        try {
            console.log("开始定期检查任务");

            // 延迟获取配置项

            for (let i = 0; i < groupApiHosts.length; i++) {
                const groupApiHost = groupApiHosts[i];

                console.log(`正在处理 groupApiHost: ${groupApiHost}`);

                // 获取登录信息
                let loginInfo;
                try {
                    const loginInfoResponse = await fetch(`${groupApiHost}/get_login_info`);
                    loginInfo = await loginInfoResponse.json();
                    console.log(`获取登录信息成功，user_id: ${loginInfo.data.user_id}`);
                } catch (error) {
                    console.error(`获取登录信息失败: ${error.message}`);
                    continue;
                }

                const selfAccount = loginInfo.data.user_id;

                // 获取群列表
                let groupList;
                try {
                    const groupListResponse = await fetch(`${groupApiHost}/get_group_list`);
                    groupList = await groupListResponse.json();
                    console.log(`获取群列表成功，数量: ${groupList.data.length}`);
                } catch (error) {
                    console.error(`获取群列表失败: ${error.message}`);
                    continue;
                }

                const groups = groupList.data;

                // 上报账号存活状态
                try {
                    await fetch(`${backendHost}/api/report_alive_method1`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ dice_id: selfAccount })
                    });
                    console.log(`账号 ${selfAccount} 存活状态上报成功`);
                } catch (error) {
                    console.error(`存活状态上报失败: ${error.message}`);
                    continue;
                }

                // 获取存活骰号列表
                let aliveDice;
                try {
                    const diceResponse = await fetch(`${backendHost}/api/get_alive_dice`);
                    aliveDice = await diceResponse.json();
                    console.log(`获取存活骰号成功，数量: ${aliveDice.length}`);
                } catch (error) {
                    console.error(`获取存活骰号失败: ${error.message}`);
                    continue;
                }

                // 按批次处理群成员检查
                for (let j = 0; j < groups.length; j += maxGroups) {
                    let groupBatch = groups.slice(j, j + maxGroups);
                    console.log(`处理第 ${j + 1} 批群成员检查，批量大小: ${groupBatch.length}`);

                    for (const group of groupBatch) {
                        const groupId = group.group_id;

                        // 跳过白名单中的群
                        if (whiteListGroups.includes(groupId)) {
                            console.log(`群 ${groupId} 在白名单中，跳过处理`);
                            continue;
                        }

                        // 获取群成员列表
                        let membersArray;
                        try {
                            const memberListResponse = await fetch(`${groupApiHost}/get_group_member_list?group_id=${groupId}`);
                            const membersData = await memberListResponse.json();
                            membersArray = Array.from(membersData.data);
                            console.log(`群 ${groupId} 成员列表获取成功，数量: ${membersArray.length}`);
                        } catch (error) {
                            console.error(`获取群 ${groupId} 成员列表失败: ${error.message}`);
                            continue;
                        }

                        // 过滤白名单中的骰号
                        let matchedDice = membersArray
                            .filter(member => aliveDice.includes(member.user_id) && !whiteListDice.includes(member.user_id));
                        
                        console.log(`群 ${groupId} 匹配到的存活骰号数量（排除白名单骰号）: ${matchedDice.length}`);

                        if (matchedDice.length > leaveThreshold) {
                            try {
                                // 发送严重警告信息
                                let adiceOwners = matchedDice.map(dice => dice.user_id).join(', ');
                                let awarningMessage = `严重警告！群号: ${groupId} 极有可能集骰。匹配到的骰号: ${adiceOwners}。将在5秒后自动退群。`;
                                
                                let aselfAccountWithPrefix = `QQ:${selfAccount}`;
                                let agroupIdWithPrefix = `QQ-Group:${groupId}`;
                                let aguildIdfiction = ""
                                let adiceQQfiction = `QQ:114514`
                                console.log('agroupIdWithPrefix:', agroupIdWithPrefix);
                                let mmmsg = seal.newMessage();
                                mmmsg.messageType = "group";
                                mmmsg.groupId = agroupIdWithPrefix;
                                mmmsg.guildId = aguildIdfiction;
                                mmmsg.sender.userId = adiceQQfiction;
                                let mctx = getctxById(aselfAccountWithPrefix, agroupIdWithPrefix, aguildIdfiction, adiceQQfiction);
                                    console.log(JSON.stringify(mctx,null,1))
                                    console.log(JSON.stringify(mmmsg,null,1))
                                    mctx.notice(awarningMessage);
                                    seal.replyToSender(mctx, mmmsg, awarningMessage)    
                                    console.log(`暂停5秒后尝试退群`);
                                    await new Promise(resolve => setTimeout(resolve, 5000));
                                // 自动退群
                                await fetch(`${groupApiHost}/set_group_leave`, {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ group_id: groupId, is_dismiss: false })
                                });
                                console.log(`群 ${groupId} 超过阈值，已自动退群`);
                            } catch (error) {
                                console.error(`尝试退群失败: ${error.message}`);
                            }
                        }
                        
                        if (matchedDice.length >= threshold  && matchedDice.length <= leaveThreshold) {
                            // 触发警告
                            let diceOwners = matchedDice.map(dice => dice.user_id).join(', ');
                            let warningMessage = `警告！群号: ${groupId} 可能集骰。匹配到的骰号: ${diceOwners}`;

                            // 使用 getctxById 获取 ctx 并通过 ctx.notice 发送警告信息
                            let selfAccountWithPrefix = `QQ:${selfAccount}`;
                            let groupIdWithPrefix = `QQ-Group:${groupId}`;
                            let guildIdfiction = ""
                            let diceQQfiction = `QQ:114514`
                            console.log('groupIdWithPrefix:', groupIdWithPrefix);
                            let mctx = getctxById(selfAccountWithPrefix, groupIdWithPrefix, guildIdfiction, diceQQfiction);
                                console.log(JSON.stringify(mctx,null,1))
                                mctx.notice(warningMessage);
                                console.log(`警告已发送: ${warningMessage}`);                       
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

    function getctxById(epId, groupId, guildId, senderId) {
        let eps = seal.getEndPoints()
        for (let i = 0; i < eps.length; i++) {
            if (eps[i].userId === epId) {                
                let mmsg = seal.newMessage();
                mmsg.messageType = "group";
                mmsg.groupId = groupId;
                mmsg.guildId = guildId;
                mmsg.sender.userId = senderId;
                return seal.createTempCtx(eps[i], mmsg);
            }
        }
        return undefined;
    }

    // 指令：管理群号和骰号白名单
    let cmdWhitelist = seal.ext.newCmdItemInfo();
    cmdWhitelist.name = "whitelist";
    cmdWhitelist.help = "管理群号和骰号白名单\n用法：.whitelist add/remove/list group/dice <ID>";
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
                    if (!whiteListGroups.includes(id)) {
                        whiteListGroups.push(id);
                        ext.storageSet("whiteListGroups", JSON.stringify(whiteListGroups));
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

            case "remove":
                if (type === "group") {
                    if (whiteListGroups.includes(id)) {
                        whiteListGroups = whiteListGroups.filter(g => g !== id);
                        ext.storageSet("whiteListGroups", JSON.stringify(whiteListGroups));
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
                    seal.replyToSender(ctx, msg, `白名单群号列表: ${whiteListGroups.join(', ')}`);
                } else if (type === "dice") {
                    seal.replyToSender(ctx, msg, `白名单骰号列表: ${whiteListDice.join(', ')}`);
                } else {
                    seal.replyToSender(ctx, msg, "请指定 group 或 dice 类型。");
                }
                break;

            default:
                seal.replyToSender(ctx, msg, "未知命令。请使用 add/remove/list group/dice");
        }
    };
    ext.cmdMap["whitelist"] = cmdWhitelist;

    // 上报骰号和存活状态（方法2）
    let cmdReportDice = seal.ext.newCmdItemInfo();
    cmdReportDice.name = "上报骰号";
    cmdReportDice.help = "用法：.上报骰号 <骰号> <存活状态> // 上报该骰号及其存活状态（0 或 1）";
    cmdReportDice.solve = async (ctx, msg, cmdArgs) => {
        const diceId = cmdArgs.getArgN(1);
        const aliveStatus = cmdArgs.getArgN(2);
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
}

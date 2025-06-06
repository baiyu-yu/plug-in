// ==UserScript==
// @name         全自动集骰检测和监听
// @description  全自动集骰检测和监听插件，可通过添加 HTTP 上报功能，定时或根据指令扫描群列表和群成员列表，检测是否在集骰群中。用户可以通过 .jt help 指令查看使用方法。\n- 插件会自行上报已安装插件的骰娘的存活状态，若一段时间内没有二次上报，则自动将该骰娘标记为死亡。\n- 请注意，HTTP 上报功能默认关闭，如何在 Napcat、LLOneBot、Lagrange、gocq 等框架开启，请自行搜索相关手册中的配置文件部分，端口（即port）设置请根据实际情况填写。若不开启 HTTP 端口，也可以通过纯监听群内短时间响应指令数量判断是否有集骰嫌疑。\n- 更多自定义配置请查看配置项（即插件设置部分）。\n- 提醒：该插件向通知列表发送消息时可能产生红色报错，目前无法解决。若能正常通知消息，则无需理会。\n- 若使用过程中遇到问题或BUG，请联系开发者。如果您有更好的想法，欢迎前往主页提交 Pull Request 或 Issue，共同完善该插件
// @version      1.0.2
// @license      MIT
// @author       白鱼&错误
// @timestamp    1728214065
// @homepageURL  https://github.com/baiyu-yu/plug-in
// @updateUrl    https://ghp.ci/https://raw.githubusercontent.com/baiyu-yu/plug-in/refs/heads/main/%E5%85%A8%E8%87%AA%E5%8A%A8%E9%9B%86%E9%AA%B0%E6%A3%80%E6%B5%8B%E5%92%8C%E7%9B%91%E5%90%AC.js
// @updateUrl    https://raw.githubusercontent.com/baiyu-yu/plug-in/refs/heads/main/%E5%85%A8%E8%87%AA%E5%8A%A8%E9%9B%86%E9%AA%B0%E6%A3%80%E6%B5%8B%E5%92%8C%E7%9B%91%E5%90%AC.js
// @sealVersion  1.4.6
// ==/UserScript==

if (!seal.ext.find("全自动集骰检测和监听")) {
    const ext = seal.ext.new("全自动集骰检测和监听", "白鱼&错误", "1.0.2");

    // 注册配置项
    seal.ext.register(ext);
    seal.ext.registerBoolConfig(ext, "是否开启HTTP请求功能", false, '该项修改并保存后请重载js');
    seal.ext.registerTemplateConfig(ext, "HTTP端口", ["http://127.0.0.1:8097"], '该项修改并保存后请重载js');
    seal.ext.registerBoolConfig(ext, "是否开启定时清查集骰群", false, '该项修改并保存后请重载js,并且需要先开启http请求开关 ');
    seal.ext.registerOptionConfig(ext, "定时任务方式", "daily", ["daily", "cron"], "该项修改并保存后请重载js");
    seal.ext.registerStringConfig(ext, "定时任务表达式", "06:00", "该项修改并保存后请重载js\n选择cron请自行查找使用方法");
    seal.ext.registerIntConfig(ext, "每次最大检查群数", 10);
    seal.ext.registerIntConfig(ext, "每个群处理间隔（s）", 2);
    seal.ext.registerIntConfig(ext, "每批处理间隔（s）", 60);

    seal.ext.registerIntConfig(ext, "集骰通知阈值", 3, "包括自己");
    seal.ext.registerIntConfig(ext, "自动退群阈值", 7);
    seal.ext.registerStringConfig(ext, "达到退群阈值往群内发送文本", "检测到该群有多个记录存活骰娘，将在五秒后退群", "");
    seal.ext.registerBoolConfig(ext, "是否监听全部指令", false, "");
    seal.ext.registerTemplateConfig(ext, "监听指令名称", ["bot", "r"], "");
    seal.ext.registerBoolConfig(ext, "是否计入全部消息", false, "");
    seal.ext.registerTemplateConfig(ext, "计入消息模版", ["SealDice|Shiki|AstralDice|OlivaDice|SitaNya", "[Dd]\\d"], "使用正则表达式");
    seal.ext.registerTemplateConfig(ext, "排除消息模版", ["\\[CQ:image,[^\\]]*\\]"], "使用正则表达式，匹配的消息部分将被移除后再进行检测");
    seal.ext.registerIntConfig(ext, "指令后n秒内计入", 5, "");
    seal.ext.registerFloatConfig(ext, "暂时白名单时限/分钟", 720, "监听一次指令后会暂时加入白名单。不要低于计入时间，否则会清除掉");
    seal.ext.registerIntConfig(ext, "每n秒处理一次暂时白名单队列", 10, "该项修改并保存后请重载js");

    const backendHost = "http://162.14.109.222:8889"; // 后端服务器地址，写死
    const whiteListGroup = JSON.parse(ext.storageGet("whiteListGroup") || '[]').map(String);
    const whiteListDice = JSON.parse(ext.storageGet("whiteListDice") || '[]').map(String);
    const whiteListMonitor = JSON.parse(ext.storageGet("whiteListMonitor") || '{}');
    const whiteListLeave = JSON.parse(ext.storageGet("whiteListLeave") || '{}');

    /**
     * 根据 ID 获取 ctx
     * @param {string} epId - 端点 ID
     * @param {string} groupId - 群 ID
     * @param {string} guildId - 频道 ID
     * @param {string} senderId - 发送者 ID
     * @returns {Object} ctx 对象
     */
    function getCtxById(epId, groupId, guildId, senderId) {
        let eps = seal.getEndPoints()
        for (let i = 0; i < eps.length; i++) {
            if (eps[i].userId === epId) {
                let msg = seal.newMessage();
                msg.messageType = "group";
                msg.groupId = groupId;
                msg.guildId = guildId;
                msg.sender.userId = senderId;
                return seal.createTempCtx(eps[i], msg);
            }
        }
        console.log('未获取到正确的epId')
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
     * 发送集骰警告
     * @param {Array<string>} dices - 骰子QQ号列表
     * @param {string} raw_groupId 
     * @param {string} raw_epId 
     */
    function warn(dices, raw_groupId = '', raw_epId = '') {
        const epId = `QQ:${raw_epId}`;
        const groupId = `QQ-Group:${raw_groupId}`;
        const mctx = getCtxById(epId, groupId, "", "QQ:114514");


        const groupName = mctx.group.groupName
        const inviteUserId = mctx.group.inviteUserId
        const inviteText = inviteUserId ? `邀请人: (${inviteUserId})。` : '';
        const message = `检测集骰警告：检测到群：<${groupName}>(${raw_groupId})集骰数量达到阈值。${inviteText}\n匹配到的骰号:\n${dices.join('\n')}`;

        noticeById(epId, groupId, "", "QQ:114514", message);
    }

    /**
     * 发送集骰警告并退群
     * @param {Array<string>} dices  - 骰子QQ号列表
     * @param {string} raw_groupId 
     * @param {string} raw_epId 
     * @param {string} httpHost - 群API地址
     * @param {number} now 
     * @returns {Promise<boolean>} 是否成功退群
     */
    async function warnAndLeave(dices, raw_groupId = '', raw_epId = '', httpHost, now) {
        const inGroupWarning = seal.ext.getStringConfig(ext, "达到退群阈值往群内发送文本");
        const epId = `QQ:${raw_epId}`;
        const groupId = `QQ-Group:${raw_groupId}`;
        const mctx = getCtxById(epId, groupId, "", "QQ:114514");

        const groupName = mctx.group.groupName
        const inviteUserId = mctx.group.inviteUserId
        const inviteText = inviteUserId ? `邀请人: (${inviteUserId})。` : '';
        const message = `严重集骰警告：检测到群：<${groupName}>(${raw_groupId})集骰数量达到退群阈值，将在5秒后自动退群。${inviteText}\n匹配到的骰号:\n${dices.join('\n')}`;

        noticeById(epId, groupId, "", "QQ:114514", message);
        replyById(epId, groupId, "", "QQ:114514", inGroupWarning);

        console.log(`暂停5秒后尝试退群`);
        await new Promise(resolve => setTimeout(resolve, 5000));

        // 自动退群
        if (!await setGroupLeave(httpHost, raw_groupId)) return false;
        whiteListLeave[raw_groupId] = now;
        ext.storageSet("whiteListLeave", JSON.stringify(whiteListLeave));
        console.log('加入退群白名单:', now);
        return true;
    }

    /**
     * 发送疑似集骰警告
     * @param {Array<string>} dices - 骰子QQ号列表
     * @param {string} raw_groupId
     * @param {string} raw_epId
     */
    async function warningSuspector(dices, raw_groupId = '', raw_epId = '') {
        const epId = `QQ:${raw_epId}`;
        const groupId = `QQ-Group:${raw_groupId}`;
        const mctx = getCtxById(epId, groupId, "", "QQ:114514");

        const groupName = mctx.group.groupName
        const inviteUserId = mctx.group.inviteUserId
        const inviteText = inviteUserId ? `邀请人: (${inviteUserId})。` : '';
        const message = `疑似集骰警告：监听到群：<${groupName}>(${raw_groupId})集骰数量达到阈值。${inviteText}\n匹配到的骰号:\n${dices.join('\n')}`;

        noticeById(epId, groupId, "", "QQ:114514", message);
        ext.storageSet("whiteListMonitor", JSON.stringify(whiteListMonitor));
    }

    /**
     * 获取登录信息
     * @param {string} httpHost - 群API主机地址
     * @returns {Promise<string>} 用户ID
     */
    async function getLoginInfo(httpHost) {
        try {
            const loginInfoResponse = await fetch(`${httpHost}/get_login_info`);
            const loginInfo = await loginInfoResponse.json();
            console.log(`获取登录信息成功，user_id: ${loginInfo.data.user_id}`);
            return loginInfo.data.user_id
        } catch (error) {
            console.error(`获取登录信息失败: ${error.message}`);
            return null;
        }
    }

    /**
     * 获取群列表
     * @param {string} httpHost - 群API主机地址
     * @returns {Promise<Array>} 群列表
     */
    async function getGroupList(httpHost) {
        try {
            const groupListResponse = await fetch(`${httpHost}/get_group_list`);
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
     * @param {string} httpHost - 群API主机地址
     * @param {string} raw_groupId - 群ID
     * @returns {Promise<Array>} 群成员列表
     */
    async function getGroupMemberList(httpHost, raw_groupId) {
        try {
            const memberListResponse = await fetch(`${httpHost}/get_group_member_list?group_id=${raw_groupId}`);
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
     * @param {string} httpHost - 群API主机地址
     * @param {string} raw_groupId - 群ID
     * @returns {Promise<boolean>} 成功返回 true，失败返回 false
     */
    async function setGroupLeave(httpHost, raw_groupId) {
        try {
            await fetch(`${httpHost}/set_group_leave`, {
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
            console.log(`方法1上报自身账号存活状态成功，账号: ${raw_epId}`);
            return true;
        } catch (error) {
            console.error(`方法1上报自身账号存活状态失败: ${error.message}`);
            return false;
        }
    }

    /**
     * 通过方法2上报自身账号的存活状态
     * @param {string} backendHost - 后端服务器地址
     * @param {string} raw_epId - 自身账号
     * @param {boolean} status - 存活为 true，不存活为 false
     * @returns {Promise<boolean>} 上报成功返回 true，失败返回 false
     */
    async function reportSelfAliveStatusanother(backendHost, raw_epId, status) {
        try {
            await fetch(`${backendHost}/api/report_alive_method2`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ dice_id: raw_epId, alive: status })
            });
            console.log(`方法2上报自身账号存活状态成功`);
            return true;
        } catch (error) {
            console.error(`方法2上报自身账号存活状态失败: ${error.message}`);
            return false;
        }
    }

    /**
     * 获取存活骰号列表
     * @param {string} backendHost - 后端服务器地址
     * @returns {Promise<Set>} 存活骰号集合
     */
    async function getAliveDiceSet(backendHost) {
        try {
            const diceResponse = await fetch(`${backendHost}/api/get_alive_dice`);
            const aliveDice = await diceResponse.json();
            console.log(`获取存活骰号成功，数量: ${aliveDice.length}`);
            return new Set(aliveDice.map(String));
        } catch (error) {
            console.error(`获取存活骰号失败: ${error.message}`);
            return new Set();
        }
    }

    /**
     * 执行群列表和群成员列表检查
     * @param {*} now
     * @returns {Promise<boolean>} 执行成功返回 true，失败返回 false
     */
    async function runTaskLogic(now) {
        try {
            console.log("开始定期检查任务");

            //获取配置项
            const maxGroups = seal.ext.getIntConfig(ext, "每次最大检查群数");
            const pauseGroup = seal.ext.getIntConfig(ext, "每个群处理间隔（s）");
            const pauseBatch = seal.ext.getIntConfig(ext, "每批处理间隔（s）");
            const threshold = seal.ext.getIntConfig(ext, "集骰通知阈值");
            const leaveThreshold = seal.ext.getIntConfig(ext, "自动退群阈值");

            const raw_epIdList = Object.keys(httpData);
            for (let i = 0; i < raw_epIdList.length; i++) {
                const raw_epId = raw_epIdList[i];
                const httpHost = httpData[raw_epId];

                console.log(`正在处理: ${raw_epId}(${httpHost})`);

                const groupList = await getGroupList(httpHost);
                if (!groupList) continue;

                const aliveDiceSet = await getAliveDiceSet(backendHost);
                if (!aliveDiceSet || (!aliveDiceSet.has(raw_epId) && !await reportSelfAliveStatus(backendHost, raw_epId))) continue;

                // 按批次处理群成员检查
                for (let j = 0; j < groupList.length; j += maxGroups) {
                    let groupBatch = groupList.slice(j, j + maxGroups);
                    console.log(`处理第 ${j + 1} 批群成员检查，批量大小: ${groupBatch.length}`);

                    for (const group of groupBatch) {
                        const raw_groupId = String(group.group_id);

                        if (whiteListGroup.includes(raw_groupId)) {
                            console.log(`群 ${raw_groupId} 在白名单中，跳过处理`);
                            continue;
                        }

                        // 获取群成员列表
                        const memberList = await getGroupMemberList(httpHost, raw_groupId);
                        if (!memberList) continue;

                        // 过滤白名单中的骰号
                        let matchedDice = memberList.filter(member => {
                            const memberId = String(member.user_id);
                            return aliveDiceSet.has(memberId) && !whiteListDice.includes(memberId);
                        });

                        console.log(`群 ${raw_groupId} 匹配到的存活骰号数量（排除白名单骰号）: ${matchedDice.length}`);

                        if (!whiteListLeave[raw_groupId] || whiteListLeave[raw_groupId] + 604800 < now) {
                            const dices = matchedDice.map(dice => dice.user_id);
                            if (dices.length >= leaveThreshold) {
                                if (!await warnAndLeave(dices, raw_groupId, raw_epId, httpHost, now)) continue;
                            } else if (dices.length >= threshold) {
                                warn(dices, raw_groupId, raw_epId);
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
            return true;
        } catch (error) {
            console.error("定期检查任务执行失败:", error);
            return false;
        }
    }

    /**
     * 上报自身账号存活状态
     * @returns {Promise<void>}
     */
    async function reportTask() {
        const eps = seal.getEndPoints()
        const epIds = eps.map(ep => ep.userId)
        const epIdSet = new Set(epIds)

        epIdSet.forEach(async epId => {
            const raw_epId = epId.match(/QQ:(\d+)/)?.[1]
            if (!raw_epId) return;
            await reportSelfAliveStatus(backendHost, raw_epId);
        })

        console.log(`上报任务执行完成`)
    }

    async function monitorDealTask(now) {
        const leaveThreshold = seal.ext.getIntConfig(ext, "自动退群阈值");
        const threshold = seal.ext.getIntConfig(ext, "集骰通知阈值");
        const whiteListTime = seal.ext.getFloatConfig(ext, "暂时白名单时限/分钟") * 60;
        const time = seal.ext.getIntConfig(ext, "指令后n秒内计入");
        const aliveDiceSet = await getAliveDiceSet(backendHost);
        for (let raw_groupId in whiteListMonitor) {
            if (now - whiteListMonitor[raw_groupId].time > whiteListTime && whiteListMonitor[raw_groupId].noticed) {
                console.log(`群 ${raw_groupId} 监听白名单已过期，删除`)
                delete whiteListMonitor[raw_groupId];
                continue;
            }
            if (now - whiteListMonitor[raw_groupId].time < time) {
                continue;
            }
            if (whiteListGroup.includes(raw_groupId)) {
                whiteListMonitor[raw_groupId].noticed = true;
                console.log(`群 ${raw_groupId} 在白名单中，跳过检测`);
                continue;
            }
            if (!whiteListMonitor[raw_groupId].noticed) {
                whiteListMonitor[raw_groupId].noticed = true;
                if (whiteListMonitor[raw_groupId].dices.length + 1 >= threshold) {
                    const epId = whiteListMonitor[raw_groupId].epId;
                    const raw_epId = epId.replace(/\D+/g, "");
                    if (!aliveDiceSet || (!aliveDiceSet.has(raw_epId) && !await reportSelfAliveStatus(backendHost, raw_epId))) return;

                    // 疑似骰号进行比对
                    const aliveDices = whiteListMonitor[raw_groupId].dices.filter(dice => aliveDiceSet.has(dice));
                    const aliveDicesNum = aliveDices.length;
                    const dices = whiteListMonitor[raw_groupId].dices.map(dice => aliveDiceSet.has(dice) ? dice : `${dice} (未登记)`);

                    //活骰达到数量，执行警告
                    if (!whiteListLeave[raw_groupId] || whiteListLeave[raw_groupId] + 604800 < now) {
                        if (aliveDicesNum >= leaveThreshold && useHttp && httpData[raw_epId]) {
                            const httpHost = httpData[raw_epId]
                            await warnAndLeave(dices, raw_groupId, raw_epId, httpHost, now);
                        } else if (aliveDicesNum >= threshold) {
                            warn(dices, raw_groupId, raw_epId);
                        } else {
                            await warningSuspector(dices, raw_groupId, raw_epId)
                        }
                    } else {
                        await warningSuspector(dices, raw_groupId, raw_epId)
                    }
                }
            }
        }
    }

    const httpData = {};
    const useHttp = seal.ext.getBoolConfig(ext, "是否开启HTTP请求功能");
    const usetimedtask = seal.ext.getBoolConfig(ext, "是否开启定时清查集骰群");
    let isTaskRunning = false;  // 全局标志，跟踪任务是否正在运行
    async function initialize() {
        // 检查是否有历史上报时间记录，或者是否需要进行一次上报
        let reportTime = parseInt(ext.storageGet("reportTime"))
        if (!reportTime) {
            console.log("无历史上报时间记录，开始第一次上报")
            await reportTask();
            let randomTime = Math.floor(Math.random() * 24 * 60 * 60)
            reportTime = Math.floor(Date.now() / 1000) - randomTime
            ext.storageSet("reportTime", reportTime.toString())
        } else if (Date.now() - reportTime * 1000 > 24 * 60 * 60 * 1000 - 60 * 1000) {
            console.log("距离上次上报时间超过23小时59分钟，开始上报")
            await reportTask();
            reportTime = Math.floor(Date.now() / 1000)
            ext.storageSet("reportTime", reportTime.toString())
        }

        //注册上报任务
        function getTime(reportTime) {
            const date = new Date(reportTime * 1000);
            const hour = date.getHours().toString().padStart(2, '0');
            const minute = date.getMinutes().toString().padStart(2, '0');
            return `${hour}:${minute}`;
        }
        const HHMMtime = getTime(reportTime);
        console.log(`上报任务将在每天的${HHMMtime}执行`)
        seal.ext.registerTask(ext, "daily", HHMMtime, async (taskCtx) => {
            const reportTime = parseInt(ext.storageGet("reportTime") || taskCtx.now)
            //当前时间与上次上报时间小于23小时59分钟时，不进行上报
            if (taskCtx.now - reportTime * 1000 < 24 * 60 * 60 * 1000 - 60 * 1000) {
                console.log(`跳过本次上报`);
                return;
            } else {
                await reportTask();
                ext.storageSet("reportTime", taskCtx.now.toString())
            }
        });

        //启动监听定时任务
        const interval = seal.ext.getIntConfig(ext, "每n秒处理一次暂时白名单队列");
        async function monitorTaskRun() {
            if (Object.keys(whiteListMonitor).length > 0 && Object.values(whiteListMonitor).some(item => item.noticed === false)) {
                console.log("开始执行监听上报定时任务")
                await monitorDealTask(Math.floor(Date.now() / 1000));
            }
            setTimeout(monitorTaskRun, interval * 1000);
        }
        monitorTaskRun();

        if (useHttp) {
            //获取HTTP对应的骰号
            const httpHosts = seal.ext.getTemplateConfig(ext, "HTTP端口");
            for (let i = 0; i < httpHosts.length; i++) {
                const httpHost = httpHosts[i];
                console.log(`正在获取: ${httpHost}`);

                const raw_epId = await getLoginInfo(httpHost);
                if (!raw_epId) {
                    console.error(`获取登录信息失败，跳过: ${httpHost}`);
                    continue;
                }
                else {
                    let eps = seal.getEndPoints()
                    let found = false;
                    for (let i = 0; i < eps.length; i++) {
                        if (eps[i].userId === `QQ:${raw_epId}`) {
                            httpData[raw_epId] = httpHost;
                            found = true;
                            break;
                        }
                    }
                    if (!found) console.error(`未找到账号信息: ${raw_epId}`);
                }
            }
            console.log(`获取完成，HTTP对应骰号: ${JSON.stringify(httpData)}`);


            if (httpData && usetimedtask) {
                const taskKey = seal.ext.getOptionConfig(ext, "定时任务方式");
                const taskValue = seal.ext.getStringConfig(ext, "定时任务表达式");

                seal.ext.registerTask(ext, taskKey, taskValue, async (taskCtx) => {
                    if (isTaskRunning) {
                        console.log("定时任务已在运行中，跳过这次执行。");
                        return;
                    }
                    isTaskRunning = true;
                    const result = await runTaskLogic(taskCtx.now);
                    if (result) {
                        console.log("已成功执行一次集骰清查任务。");
                    } else {
                        console.log("任务执行失败，请查看日志。");
                    }
                    isTaskRunning = false;
                });
            }
        }
    }

    // 初始化时获取登录信息
    initialize().catch(err => {
        console.error("初始化过程中发生错误:", err);
    });

    // 集骰指令相关
    let cmdJT = seal.ext.newCmdItemInfo();
    cmdJT.name = "jt";
    cmdJT.help = "集骰管理指令\n用法：\n.jt help // 显示帮助信息\n.jt rpt/report <骰号> <存活状态> // 上报该骰号及其存活状态（0: 不存活, 1: 存活）\n.jt rm/remove <骰号> // 移除该骰号\n.jt ck/check // 执行一次集骰清查任务\n.jt wl/whitelist add/rm/show group/dice <ID> // 管理群号和骰号白名单";
    cmdJT.solve = async (ctx, msg, cmdArgs) => {
        if (ctx.privilegeLevel < 100) {
            seal.replyToSender(ctx, msg, seal.formatTmpl(ctx, "核心:提示_无权限"));
            return seal.ext.newCmdExecuteResult(true);
        }

        const subCommand = cmdArgs.getArgN(1);
        const arg1 = cmdArgs.getArgN(2);
        const arg2 = cmdArgs.getArgN(3);
        const arg3 = cmdArgs.getArgN(4);

        if (!subCommand || subCommand === 'help') {
            const commandhelp = "集骰管理指令\n用法：\n.jt help // 显示帮助信息\n.jt rpt/report <骰号> <存活状态> // 上报该骰号及其存活状态（0: 不存活, 1: 存活）\n.jt rm/remove <骰号> // 移除该骰号\n.jt ck/check // 执行一次集骰清查任务\n.jt wl/whitelist add/rm/show group/dice <ID> // 管理群号和骰号白名单\n注：缩写与完整拼写部分功能相同；ID部分直接输入数字；不需要输入<>；"
            seal.replyToSender(ctx, msg, commandhelp);
            return;
        }

        switch (subCommand) {
            case "rpt":
            case "report":
                if (arg1 === 'help') {
                    const helpMessage = `用法：.jt rpt/report <骰号> <存活状态> // 上报该骰号及其存活状态（0: 不存活, 1: 存活）`;
                    seal.replyToSender(ctx, msg, helpMessage);
                    return seal.ext.newCmdExecuteResult(true);
                }
                if (!arg1 || (arg2 !== '0' && arg2 !== '1')) {
                    seal.replyToSender(ctx, msg, "请提供骰号和存活状态（0: 不存活, 1: 存活）。");
                    return;
                }
                let status = arg2 === '1';
                if (await reportSelfAliveStatusanother(backendHost, arg1, status)) {
                    seal.replyToSender(ctx, msg, "上报成功");
                } else {
                    seal.replyToSender(ctx, msg, "上报失败，请查看日志。");
                }
                break;

            case "rm":
            case "remove":
                if (arg1 === 'help') {
                    const helpMessage = `用法：.jt rm/remove <骰号> // 移除该骰号`;
                    seal.replyToSender(ctx, msg, helpMessage);
                    return seal.ext.newCmdExecuteResult(true);
                }
                if (!arg1) {
                    seal.replyToSender(ctx, msg, "请提供骰号。");
                    return;
                }
                try {
                    const removeResponse = await fetch(`${backendHost}/api/remove_dice`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ dice_id: arg1 })
                    });
                    const data = await removeResponse.json();
                    seal.replyToSender(ctx, msg, data.message || "移除成功");
                } catch (error) {
                    console.error("移除失败:", error);
                    seal.replyToSender(ctx, msg, "移除失败，请稍后再试。");
                }
                break;

            case "ck":
            case "check":
                if (!useHttp) {
                    seal.replyToSender(ctx, msg, "HTTP 请求功能未开启，无法执行任务。");
                    return;
                }
                if (isTaskRunning) {
                    seal.replyToSender(ctx, msg, "任务正在进行中，请稍后再试。");
                    return;
                }
                isTaskRunning = true;
                seal.replyToSender(ctx, msg, "即将启动一次集骰清查任务，请等待。");
                const result = await runTaskLogic(msg.time);
                if (result) {
                    seal.replyToSender(ctx, msg, "已成功执行一次集骰清查任务。");
                } else {
                    seal.replyToSender(ctx, msg, "任务执行失败，请查看日志。");
                }
                isTaskRunning = false;
                break;

            case "wl":
            case "whitelist":
                const action = arg1;
                const type = arg2;
                const id = arg3;

                switch (action) {
                    case "add":
                        if (!type) {
                            seal.replyToSender(ctx, msg, "用法：.jt wl/whitelist add group/dice <ID>");
                            return;
                        }
                        if (type === "group") {
                            if (!id) {
                                seal.replyToSender(ctx, msg, "请提供 ID（群号）。");
                                return;
                            }
                            if (!whiteListGroup.includes(id)) {
                                whiteListGroup.push(id);
                                ext.storageSet("whiteListGroup", JSON.stringify(whiteListGroup));
                                seal.replyToSender(ctx, msg, `群 ${id} 已加入白名单。`);
                            } else {
                                seal.replyToSender(ctx, msg, `群 ${id} 已在白名单中。`);
                            }
                        } else if (type === "dice") {
                            if (!id) {
                                seal.replyToSender(ctx, msg, "请提供 ID（骰号）。");
                                return;
                            }
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
                        if (!type) {
                            seal.replyToSender(ctx, msg, "用法：.jt wl/whitelist rm group/dice <ID>");
                            return;
                        }
                        if (type === "group") {
                            if (!id) {
                                seal.replyToSender(ctx, msg, "请提供 ID（群号）。");
                                return;
                            }
                            let removed = false;
                            let index = whiteListGroup.indexOf(id);
                            if (index !== -1) {
                                whiteListGroup.splice(index, 1);
                                ext.storageSet("whiteListGroup", JSON.stringify(whiteListGroup));
                                removed = true;
                                seal.replyToSender(ctx, msg, `群 ${id} 已从本地白名单移除。`);
                            }
                            if (whiteListLeave[id]) {
                                delete whiteListLeave[id];
                                ext.storageSet("whiteListLeave", JSON.stringify(whiteListLeave));
                                removed = true;
                                seal.replyToSender(ctx, msg, `群 ${id} 已从退群白名单移除。`);
                            }
                            if (whiteListMonitor[id]) {
                                delete whiteListMonitor[id];
                                ext.storageSet("whiteListMonitor", JSON.stringify(whiteListMonitor));
                                removed = true;
                                seal.replyToSender(ctx, msg, `群 ${id} 已从监听白名单移除。`);
                            }
                            if (!removed) {
                                seal.replyToSender(ctx, msg, `群 ${id} 不在任何白名单中。`);
                            }
                        } else if (type === "dice") {
                            if (!id) {
                                seal.replyToSender(ctx, msg, "请提供 ID（骰号）。");
                                return;
                            }
                            let index = whiteListDice.indexOf(id);
                            if (index !== -1) {
                                whiteListDice.splice(index, 1);
                                ext.storageSet("whiteListDice", JSON.stringify(whiteListDice));
                                seal.replyToSender(ctx, msg, `骰号 ${id} 已从白名单移除。`);
                            } else {
                                seal.replyToSender(ctx, msg, `骰号 ${id} 不在白名单中。`);
                            }
                        }
                        break;

                    case "show":
                        if (type === "group") {
                            seal.replyToSender(ctx, msg, `白名单群号列表: \n${whiteListGroup.join('\n')}`);
                        } else if (type === "dice") {
                            seal.replyToSender(ctx, msg, `白名单骰号列表: \n${whiteListDice.join('\n')}`);
                        } else {
                            seal.replyToSender(ctx, msg, `白名单群号列表: \n${whiteListGroup.join('\n')}\n白名单骰号列表: \n${whiteListDice.join('\n')}`);
                        }
                        break;

                    default:
                        seal.replyToSender(ctx, msg, "未知命令。请使用 add/rm/show group/dice");
                }
                break;

            default:
                seal.replyToSender(ctx, msg, "未知子命令。请使用 rpt/report, rm/remove, ck/check, wl/whitelist");
        }
    };
    ext.cmdMap["jt"] = cmdJT;

    //监听指令
    ext.onCommandReceived = (ctx, msg, cmdArgs) => {
        if (ctx.isPrivate) return;

        const isAll = seal.ext.getBoolConfig(ext, "是否监听全部指令");
        const commands = seal.ext.getTemplateConfig(ext, "监听指令名称");
        const whiteListTime = seal.ext.getFloatConfig(ext, "暂时白名单时限/分钟") * 60;
        const raw_groupId = ctx.group.groupId.replace(/\D+/g, "")


        if ((isAll || commands.includes(cmdArgs.command)) && (!whiteListMonitor[raw_groupId] || msg.time - whiteListMonitor[raw_groupId].time > whiteListTime)) {
            console.log(`监听指令:群号${raw_groupId}`)
            whiteListMonitor[raw_groupId] = {
                time: msg.time,
                dices: [],
                noticed: false,
                epId: ctx.endPoint.userId,
            };
            ext.storageSet("whiteListMonitor", JSON.stringify(whiteListMonitor));
        }
    }

    //监听到指令计入消息，超过阈值时通知
    ext.onNotCommandReceived = async (ctx, msg) => {
        if (ctx.isPrivate) return;

        const isAllMsg = seal.ext.getBoolConfig(ext, "是否计入全部消息");
        const msgTemplate = seal.ext.getTemplateConfig(ext, "计入消息模版");
        const excludeTemplate = seal.ext.getTemplateConfig(ext, "排除消息模版");
        const time = seal.ext.getIntConfig(ext, "指令后n秒内计入");
        const raw_groupId = ctx.group.groupId.replace(/\D+/g, "")

        let filteredMessage = msg.message;
        if (excludeTemplate.length > 0) {
            excludeTemplate.forEach(template => {
                filteredMessage = filteredMessage.replace(new RegExp(template, 'g'), '');
            });
        }

        if (!filteredMessage.trim()) {
            return;
        }

        if ((isAllMsg || msgTemplate.some(template => filteredMessage.match(template))) && whiteListMonitor[raw_groupId] && msg.time - whiteListMonitor[raw_groupId].time < time) {
            const userId = ctx.player.userId
            const raw_userId = userId.replace(/\D+/g, "");
            if (whiteListDice.includes(raw_userId)) {
                console.log(`骰号 ${raw_userId} 在白名单中，跳过检测`)
                return;
            }
            if (!whiteListMonitor[raw_groupId].dices.includes(userId)) whiteListMonitor[raw_groupId].dices.push(raw_userId);
        }
    }
}

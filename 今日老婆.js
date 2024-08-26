// ==UserScript==
// @name         今日老婆
// @author       白鱼
// @version      1.0.0
// @description  今日老婆插件，允许自定义的看配置项，使用.今日老婆 help 查看使用教程
// @timestamp    1724394115
// @license      MIT
// @homepageURL  https://github.com/baiyu-yu/plug-in/
// @updateUrl    https://mirror.ghproxy.com/https://raw.githubusercontent.com/baiyu-yu/plug-in/main/%E4%BB%8A%E6%97%A5%E8%80%81%E5%A9%86.js
// @updateUrl    https://raw.githubusercontent.com/baiyu-yu/plug-in/main/%E4%BB%8A%E6%97%A5%E8%80%81%E5%A9%86.js
// @sealVersion  1.4.6
// ==/UserScript==

if (!seal.ext.find('wifeOfTheDay')) {
    const ext = seal.ext.new('wifeOfTheDay', 'baiyu', '1.0.0');
    seal.ext.register(ext);

    // 正确地注册配置项
    seal.ext.registerStringConfig(ext, '输出前缀', '今日老婆: ');
    seal.ext.registerStringConfig(ext, '无可选用户回复', '今天的老婆们已经全部选完了！');
    seal.ext.registerStringConfig(ext, '重复抽取回复前缀', '你已经抽过了，你的老婆是：');

    // 定义存储用户记录、每日选择记录和黑名单的变量
    // 错误：还有选项每个群分开存吧
    let userRecords = {};
    let dailySelectionMap = {};
    let blacklists = {};
    let options = {};
    const storedData = ext.storageGet("data");
    if (storedData) {
        try {
            const data = JSON.parse(storedData || '{}');
            userRecords = data.userRecords || {};
            dailySelectionMap = data.dailySelectionMap || {};
            blacklists = data.blacklists || {};
            options = data.options || {};
        } catch (e) {
            console.error("Failed to parse stored data:", e);
        }
    }

    // 提取纯数字用户ID的工具函数
    const extractPureId = (userId) => {
        const match = userId.match(/(\d+)/);
        return match ? match[1] : userId;
    };

    // 当非指令消息接收时记录用户信息
    ext.onNotCommandReceived = async (ctx, msg) => {
        if (msg.messageType === 'group') {
            const groupId = msg.groupId;
            if (!userRecords[groupId]) userRecords[groupId] = [];
            if (!options[groupId]) options[groupId] = {shouldAt: false, allowMultipleWifePerDay: false, allowRepeatSelectionByOthers: false};
            const pureUserId = extractPureId(msg.sender.userId);
            const userInfo = { qqNumber: pureUserId, nickname: msg.sender.nickname };
            // 确保在同一个群中不重复记录同一个用户
            const existingUser = userRecords[groupId].find(user => user.qqNumber === userInfo.qqNumber);
            if (existingUser) {
                existingUser.nickname = userInfo.nickname; // Update nickname if user already exists
            } else {
                userRecords[groupId].push(userInfo);
            }
            saveData();
        }
    };

    // 存储数据的辅助函数
    const saveData = () => {
        ext.storageSet("data", JSON.stringify({ userRecords, dailySelectionMap, blacklists, options}));
    };

    const cmdWifeOfTheDay = seal.ext.newCmdItemInfo();
    cmdWifeOfTheDay.name = '今日老婆';
    cmdWifeOfTheDay.help = '从群成员中随机选择一位显示其信息并控制@功能，支持设置一些开关选项。使用 .今日老婆 help 查看详细帮助';
    cmdWifeOfTheDay.solve = async (ctx, msg, cmdArgs) => {
        const groupId = msg.groupId;
        const pureUserId = extractPureId(msg.sender.userId);
        const today = new Date().toISOString().split('T')[0]; // 获取当前日期

        // 检查并处理子命令
        const subCommand = cmdArgs.getArgN(1);

        // 提供帮助信息
        if (subCommand === 'help') {
            const helpMessage = `
            今日老婆 使用方法:
1. .今日老婆 - 随机选择一名出现过的群成员为今日老婆。（无法分辨是否还在群内，因此抽到退群的请自行使用黑名单功能）
2. .今日老婆 黑名单 添加/移除 用户ID - 管理本群黑名单（需要管理员以上）。
            `;
            seal.replyToSender(ctx, msg, helpMessage);
            return seal.ext.newCmdExecuteResult(true);
        }

        let shouldAt = options[groupId].shouldAt
        let allowMultipleWifePerDay = options[groupId].allowMultipleWifePerDay
        let allowRepeatSelectionByOthers = options[groupId].allowRepeatSelectionByOthers

        // 处理设置命令，但是没反应，哈哈，本来有反应但是没起作用，改了一通直接没反应了，摆烂，看代码的大佬拜托您了
        if (subCommand === '设置') {
            if (ctx.privilegeLevel > 50) {
                const optionIndex = parseInt(cmdArgs.getArgN(2), 10);
                const value = cmdArgs.getArgN(3);
                if (isNaN(optionIndex) || (optionIndex < 1 || optionIndex > 3)) {
                    seal.replyToSender(ctx, msg, "无效的选项序号。请使用 1 到 3。");
                    return seal.ext.newCmdExecuteResult(true);
                }
                let settingKey, settingValue;
                switch (optionIndex) {
                    case 1:
                        settingKey = '是否添加@功能';
                        if (value !== 'true' && value !== 'false') {
                            seal.replyToSender(ctx, msg, "无效的值，请使用 true 或 false。");
                            return seal.ext.newCmdExecuteResult(true);
                        }
                        settingValue = value === 'true';
                        shouldAt = settingValue; // 更新 shouldAt 变量
                        options[groupId].shouldAt =shouldAt
                        break;
                    case 2:
                        settingKey = '是否允许一天多个老婆';
                        if (value !== 'true' && value !== 'false') {
                            seal.replyToSender(ctx, msg, "无效的值，请使用 true 或 false。");
                            return seal.ext.newCmdExecuteResult(true);
                        }
                        settingValue = value === 'true';
                        allowMultipleWifePerDay = settingValue; // 更新 allowMultipleWifePerDay 变量
                        options[groupId].allowMultipleWifePerDay = allowMultipleWifePerDay
                        break;
                    case 3:
                        settingKey = '是否允许重复被选为老婆';
                        if (value !== 'true' && value !== 'false')  {
                            seal.replyToSender(ctx, msg, "无效的值，请使用 true 或 false。");
                            return seal.ext.newCmdExecuteResult(true);
                        }
                        settingValue = value === 'true';
                        allowRepeatSelectionByOthers = settingValue; // 更新 allowRepeatSelectionByOthers 变量
                        options[groupId].allowRepeatSelectionByOthers = allowRepeatSelectionByOthers
                        break;
                }
                saveData()
                seal.replyToSender(ctx, msg, `已设置 ${settingKey} 为 ${settingValue ? '允许' : '不允许'}`);
            } else {
                seal.replyToSender(ctx, msg, seal.formatTmpl(ctx, "核心:提示_无权限"));
            }
            return seal.ext.newCmdExecuteResult(true);
        }

        if (subCommand === '黑名单') {
            if (ctx.privilegeLevel > 50) {
                const action = cmdArgs.getArgN(2);
                const targetUserId = extractPureId(cmdArgs.getArgN(3));
        
                if (!targetUserId) {
                    seal.replyToSender(ctx, msg, "请提供要操作的用户ID。");
                    return seal.ext.newCmdExecuteResult(true);
                }
        
                if (!blacklists[groupId]) blacklists[groupId] = [];
        
                if (action === '添加') {
                    if (!blacklists[groupId].includes(targetUserId)) {
                        blacklists[groupId].push(targetUserId);
                        saveData();
                        seal.replyToSender(ctx, msg, `已将用户 ${targetUserId} 添加到今日老婆黑名单。`);
                    } else {
                        seal.replyToSender(ctx, msg, `用户 ${targetUserId} 已经在黑名单中。`);
                    }
                } else if (action === '移除') {
                    const index = blacklists[groupId].indexOf(targetUserId);
                    if (index !== -1) {
                        blacklists[groupId].splice(index, 1);
                        saveData();
                        seal.replyToSender(ctx, msg, `已将用户 ${targetUserId} 从今日老婆黑名单中移除。`);
                    } else {
                        seal.replyToSender(ctx, msg, `用户 ${targetUserId} 不在黑名单中。`);
                    }
                } else {
                    seal.replyToSender(ctx, msg, "请使用 .今日老婆 黑名单 添加/移除 用户ID");
                }
            } else {
                seal.replyToSender(ctx, msg, seal.formatTmpl(ctx, "核心:提示_无权限"));
            }
            return seal.ext.newCmdExecuteResult(true);
        }

        let yourname = ctx.player.name;
        // 随机选择一名用户为今日老婆
        if (!userRecords[groupId] || userRecords[groupId].length === 0) {
            seal.replyToSender(ctx, msg, seal.ext.getConfig(ext, '无可选用户回复').value); // Use the custom message
            return seal.ext.newCmdExecuteResult(true);
        }
        if (!dailySelectionMap[groupId]) dailySelectionMap[groupId] = {};
        if (!dailySelectionMap[groupId][today]) dailySelectionMap[groupId][today] = {};

        // 检查用户是否已抽过老婆
        if (!allowMultipleWifePerDay && dailySelectionMap[groupId][today][pureUserId]) {
            const prefix = seal.ext.getConfig(ext, '重复抽取回复前缀').value; // Get the prefix for repeated selection
            const previousUserInfo = userRecords[groupId].find(user => user.qqNumber === dailySelectionMap[groupId][today][pureUserId]);
            seal.replyToSender(ctx, msg, `${prefix}${previousUserInfo.nickname} (ID: ${previousUserInfo.qqNumber})`);
            return seal.ext.newCmdExecuteResult(true);
        }

        // 创建候选池，排除已选中的和黑名单中的用户
        // 还有排除自己！
        let candidatePool = userRecords[groupId].filter(user => !blacklists[groupId]?.includes(user.qqNumber));
        candidatePool = candidatePool.filter(user => user.qqNumber !== pureUserId);
        if (!allowRepeatSelectionByOthers) {
            const selectedUsersToday = Object.values(dailySelectionMap[groupId][today]);
            candidatePool = candidatePool.filter(user => !selectedUsersToday.includes(user.qqNumber));
        }

        // 检查是否有可选用户
        if (candidatePool.length === 0) {
            const noUserReply = seal.ext.getConfig(ext, '无可选用户回复').value; // Use the custom message
            seal.replyToSender(ctx, msg, noUserReply);
            return seal.ext.newCmdExecuteResult(true);
        }

        // 从候选池中随机选取一名用户
        const selectedUser = candidatePool[Math.floor(Math.random() * candidatePool.length)];
        const outputPrefix = seal.ext.getConfig(ext, '输出前缀').value; // Get the output prefix
        const resultMessage = `${outputPrefix}${selectedUser.nickname} (ID: ${selectedUser.qqNumber})`;
        const atMessage = shouldAt ? `[CQ:at,qq=${selectedUser.qqNumber}] ` : '';
        const finalMessage = `${atMessage}\n[CQ:image,file=https://q2.qlogo.cn/headimg_dl?dst_uin=${selectedUser.qqNumber}&spec=5,cache=0]\n${resultMessage} `;

        // 记录用户的选择
        dailySelectionMap[groupId][today][pureUserId] = selectedUser.qqNumber; // Record the selected user
        saveData();
        seal.replyToSender(ctx, msg, finalMessage);
        return seal.ext.newCmdExecuteResult(true);
    };

    ext.cmdMap['今日老婆'] = cmdWifeOfTheDay;
}

// ==UserScript==
// @name         跑团公告插件
// @author       白鱼
// @version      1.0.1
// @description  跑团公告插件，.挂团 [内容] - 挂出一个跑团公告（注意需要包含模组名这三个字和冒号），.公告列表 - 列出所有跑团公告，.示团 [序号/团名] - 显示指定跑团公告详细信息，.取消挂团 - 列出自己所有挂过的团，并提供移除功能，.公告管理 - 管理所有跑团公告（仅master可用）
// @timestamp    1719299266
// @license      MIT
// @homepageURL  https://github.com/baiyu-yu/plug-in
// @updateUrl    https://raw.gitmirror.com/baiyu-yu/plug-in/main/%E8%B7%91%E5%9B%A2%E5%85%AC%E5%91%8A%E6%8F%92%E4%BB%B6.js
// @updateUrl    https://raw.githubusercontent.com/baiyu-yu/plug-in/main/%E8%B7%91%E5%9B%A2%E5%85%AC%E5%91%8A%E6%8F%92%E4%BB%B6.js

if (!seal.ext.find('跑团公告插件')) {
    const ext = seal.ext.new('跑团公告插件', '白鱼', '1.0.1');
    seal.ext.register(ext);

    function getStandardFormat() {
        return `标准格式如下：
模组名：
模组类型：
联系方式：
跑团方式：
年代地点：
车卡要求：
推荐技能：
期望人数：
难度系数：
开团时间：
预期时间：
背景故事：`;
    }

    function validateFormat(text) {
        return text.match(/模组名[:：]/);
    }

    const cmdAddGroup = seal.ext.newCmdItemInfo();
    const groupList = JSON.parse(ext.storageGet("groupList") || '[]');
    
    cmdAddGroup.name = '挂团';
    cmdAddGroup.help = '.挂团 [内容] - 挂出一个跑团公告\n' + getStandardFormat();
    cmdAddGroup.solve = (ctx, msg, cmdArgs) => {
        let val = cmdArgs.getArgN(1); // 获取第一个参数
        switch (val) {
            case 'help': {
                const helpResponse = "挂团命令帮助:\n" + getStandardFormat();
                seal.replyToSender(ctx, msg, helpResponse);
                return seal.ext.newCmdExecuteResult(true);
            }
            default: {
                const content = msg.message.substring(3); 
                if (!validateFormat(content)) {
                    seal.replyToSender(ctx, msg, getStandardFormat());
                    return seal.ext.newCmdExecuteResult(true);
                }
    
                const groupNameMatch = content.match(/模组名[:：]\s*([\s\S]*?)(?=\n|\s|$)/);
                if (!groupNameMatch) {
                    seal.replyToSender(ctx, msg, "请确保内容中包含正确的模组名格式。");
                    return seal.ext.newCmdExecuteResult(true);
                }
                const groupName = groupNameMatch[1].trim();
    
                const groupInfo = {
                    content: content, // 用户输入的原始内容（已从第4个字符开始截取）
                    userId: ctx.player.userId,
                    timestamp: new Date().getTime(),
                    groupName: groupName
                };
    
                groupList.push(groupInfo);
                ext.storageSet("groupList", JSON.stringify(groupList));
                seal.replyToSender(ctx, msg, "成功挂团！");
                return seal.ext.newCmdExecuteResult(true);
            }
        }
    };
    
    ext.cmdMap['挂团'] = cmdAddGroup;

    const cmdListGroups = seal.ext.newCmdItemInfo();
    cmdListGroups.name = '公告列表';
    cmdListGroups.help = '.公告列表 - 列出所有跑团公告';
    cmdListGroups.solve = (ctx, msg, cmdArgs) => {
        let response = "跑团公告列表：\n";
        groupList.forEach((group, index) => {
            response += `${index + 1}. ${group.groupName}\n`;
        });
        response += "想看团的详细信息请使用 .示团 [序号] 或 .示团 [团名] 指令。";
        seal.replyToSender(ctx, msg, response);
        return seal.ext.newCmdExecuteResult(true);
    };
    ext.cmdMap['公告列表'] = cmdListGroups;

    const cmdShowGroup = seal.ext.newCmdItemInfo();
    cmdShowGroup.name = '示团';
    cmdShowGroup.help = '.示团 [序号/团名] - 显示指定跑团公告详细信息';
    cmdShowGroup.solve = (ctx, msg, cmdArgs) => {
        const query = cmdArgs.getArgN(1);
        let group = null;

        if (isNaN(query)) {
            const matchedGroups = groupList.filter(g => g.groupName === query);
            if (matchedGroups.length > 1) {
                seal.replyToSender(ctx, msg, "找到多个相同团名，请使用序号索引。");
                return seal.ext.newCmdExecuteResult(true);
            } else if (matchedGroups.length === 1) {
                group = matchedGroups[0];
            }
        } else {
            const index = parseInt(query) - 1;
            if (index >= 0 && index < groupList.length) {
                group = groupList[index];
            }
        }

        if (group) {
            const content = group.content.replace(/<br>/g, "\n"); // 将 <br> 替换回换行符
            seal.replyToSender(ctx, msg, content);
        } else {
            seal.replyToSender(ctx, msg, "未找到对应的跑团公告。");
        }
        return seal.ext.newCmdExecuteResult(true);
    };
    ext.cmdMap['示团'] = cmdShowGroup;

    const cmdRemoveGroup = seal.ext.newCmdItemInfo();
    cmdRemoveGroup.name = '取消挂团';
    cmdRemoveGroup.help = '.取消挂团 - 列出自己所有挂过的团，并提供移除功能';
    cmdRemoveGroup.solve = (ctx, msg, cmdArgs) => {
        const userId = ctx.player.userId;
        const userGroups = groupList.filter(group => group.userId === userId);

        const subCommand = cmdArgs.getArgN(1);

        if (!subCommand) {
            if (userGroups.length === 0) {
                seal.replyToSender(ctx, msg, "您没有挂过任何团。");
                return seal.ext.newCmdExecuteResult(true);
            }

            let response = "您挂过的跑团公告列表：\n";
            userGroups.forEach((group, index) => {
                response += `${index + 1}. ${group.groupName}\n`;
            });
            response += "想移除公告请使用 .取消挂团 [序号] 或 .取消挂团 [团名] 指令，或使用 .取消挂团 all 取消所有公告。";
            seal.replyToSender(ctx, msg, response);
            return seal.ext.newCmdExecuteResult(true);
        }

        let removed = false;

        if (subCommand === 'all') {
            for (let i = groupList.length - 1; i >= 0; i--) {
                if (groupList[i].userId === userId) {
                    groupList.splice(i, 1);
                    removed = true;
                }
            }
        } else if (isNaN(subCommand)) {
            const matchedGroups = groupList.filter(g => g.userId === userId && g.groupName === subCommand);
            if (matchedGroups.length > 1) {
                seal.replyToSender(ctx, msg, "找到多个相同团名，请使用序号索引。");
                return seal.ext.newCmdExecuteResult(true);
            } else if (matchedGroups.length === 1) {
                const index = groupList.indexOf(matchedGroups[0]);
                if (index !== -1) {
                    groupList.splice(index, 1);
                    removed = true;
                }
            }
        } else {
            const index = parseInt(subCommand) - 1;
            const userGroup = userGroups[index];
            if (userGroup) {
                const globalIndex = groupList.indexOf(userGroup);
                if (globalIndex !== -1) {
                    groupList.splice(globalIndex, 1);
                    removed = true;
                }
            }
        }

        if (removed) {
            ext.storageSet("groupList", JSON.stringify(groupList));
            seal.replyToSender(ctx, msg, "取消成功！");
        } else {
            seal.replyToSender(ctx, msg, "未找到符合条件的跑团公告。");
        }

        return seal.ext.newCmdExecuteResult(true);
    };
    ext.cmdMap['取消挂团'] = cmdRemoveGroup;

    const cmdManageGroups = seal.ext.newCmdItemInfo();
    cmdManageGroups.name = '公告管理';
    cmdManageGroups.help = '.公告管理 - 管理所有跑团公告';
    cmdManageGroups.solve = (ctx, msg, cmdArgs) => {
        if (ctx.privilegeLevel < 100) {
            seal.replyToSender(ctx, msg, seal.formatTmpl(ctx, "核心:提示_无权限"));
            return seal.ext.newCmdExecuteResult(true);
        }

        const subCommand = cmdArgs.getArgN(1);
        const query = cmdArgs.getArgN(2);

        if (subCommand === '移除') {
            let removed = false;
            if (isNaN(query)) {
                const matchedGroups = groupList.filter(g => g.groupName === query);
                if (matchedGroups.length > 1) {
                    seal.replyToSender(ctx, msg, "找到多个相同团名，请使用序号索引。");
                    return seal.ext.newCmdExecuteResult(true);
                } else if (matchedGroups.length === 1) {
                    const index = groupList.indexOf(matchedGroups[0]);
                    if (index !== -1) {
                        groupList.splice(index, 1);
                        removed = true;
                    }
                }
            } else {
                const index = parseInt(query) - 1;
                if (index >= 0 && index < groupList.length) {
                    groupList.splice(index, 1);
                    removed = true;
                }
            }

            if (removed) {
                ext.storageSet("groupList", JSON.stringify(groupList));
                seal.replyToSender(ctx, msg, "移除成功！");
            } else {
                seal.replyToSender(ctx, msg, "未找到符合条件的跑团公告。");
            }
        } else {
            let response = "所有跑团公告列表：\n";
            groupList.forEach((group, index) => {
                response += `${index + 1}. ${group.groupName}\n`;
            });
            seal.replyToSender(ctx, msg, response);
        }

        return seal.ext.newCmdExecuteResult(true);
    };
    ext.cmdMap['公告管理'] = cmdManageGroups;

    const cmdlandequming = seal.ext.newCmdItemInfo();
    cmdlandequming.name = "跑团公告";
    cmdlandequming.help =
      "跑团公告插件\n.挂团 [内容] - 挂出一个跑团公告（注意需要包含模组名这三个字和冒号）\n.公告列表 - 列出所有跑团公告\n.示团 [序号/团名] - 显示指定跑团公告详细信息\n.取消挂团 - 列出自己所有挂过的团，并提供移除功能\n.公告管理 - 管理所有跑团公告（仅master可用）";
    cmdlandequming.solve = (ctx, msg, cmdArgs) => {
      let val = cmdArgs.getArgN(1);
    
      if (!val || val === "help") {
        const ret = seal.ext.newCmdExecuteResult(true);
        ret.showHelp = true;
        return ret;
      }
    
      return seal.ext.newCmdExecuteResult(true);
    };
    ext.cmdMap['跑团公告'] = cmdlandequming;
}

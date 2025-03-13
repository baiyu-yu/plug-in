// ==UserScript==
// @name         查找ID并管理共群
// @author       白鱼
// @version      1.0.0
// @description  查找ID是否在好友列表，查找共群并显示信息，支持根据权限退出群聊和删除好友。基于错误佬的HTTP依赖[https://github.com/error2913/sealdice-js/blob/main/HTTP%E4%BE%9D%E8%B5%96.js]运行,改良自aiplugin4的查找共群tools.
// @timestamp    1741888973
// @license      MIT
// @homepageURL  https://github.com/sealdice/javascript
// @depends 错误:HTTP依赖:>=1.0.0
// ==/UserScript==

if (!seal.ext.find("find_and_manage_group")) {
  const ext = seal.ext.new("find_and_manage_group", "白鱼", "1.0.0");
  seal.ext.register(ext);

  /**
   * 权限角色转等级
   */
  function getPrivilegeLevelFromRole(role) {
    switch (role) {
      case "owner":
        return 60; 
      case "admin":
        return 50;
      default:
        return 0;
    }
  }

  /**
   * 获取权限描述
   */
  function getPrivilegeLevelDescription(privilegeLevel) {
    switch (privilegeLevel) {
      case 0:
        return "普通用户";
      case 50:
        return "群管理员";
      case 60:
        return "群主";
      default:
        return "未知权限";
    }
  }

  /**
   * 发送消息到群聊
   */
  async function sendGroupMessage(epId, groupId, message) {
    try {
      await globalThis.http.getData(
        epId,
        `send_group_msg?group_id=${groupId}&message=${message}`
      );
      return true;
    } catch (error) {
      console.error("发送群消息失败:", error);
      return false;
    }
  }

  /**
   * 退出群聊
   */
  async function setGroupLeave(epId, groupId, farewellMessage = "") {
    try {
      if (farewellMessage) {
        const encodedMessage = farewellMessage.replace(/\n/g, "%0A");
        await sendGroupMessage(epId, groupId, encodedMessage);
      }
      await globalThis.http.getData(
        epId,
        `set_group_leave?group_id=${groupId}&is_dismiss=false`
      );
      return true;
    } catch (error) {
      console.error("退群失败:", error);
      return false;
    }
  }

  /**
   * 删除好友
   */
  async function deleteFriend(epId, userId) {
    try {
      await globalThis.http.getData(epId, `delete_friend?user_id=${userId}`);
      return true;
    } catch (error) {
      console.error("删除好友失败:", error);
      return false;
    }
  }

  /**
   * 添加群组到白名单
   */
  function addGroupToWhitelist(groupId) {
    const whitelist = JSON.parse(ext.storageGet("whitelist") || "[]");
    const groupIdStr = groupId.toString(); 
    if (!whitelist.includes(groupIdStr)) {
      whitelist.push(groupIdStr);
      ext.storageSet("whitelist", JSON.stringify(whitelist));
      return true;
    }
    return false;
  }

  /**
   * 从白名单中移除群组
   */
  function removeGroupFromWhitelist(groupId) {
    const groupIdStr = groupId.toString();
    const whitelist = JSON.parse(ext.storageGet("whitelist") || "[]");
    const index = whitelist.indexOf(groupIdStr);
    if (index !== -1) {
      whitelist.splice(index, 1);
      ext.storageSet("whitelist", JSON.stringify(whitelist));
      return true;
    }
    return false;
  }

  /**
   * 检查群组是否在白名单中
   */
  function isGroupInWhitelist(groupId) {
    const groupIdStr = groupId.toString(); 
    const whitelist = JSON.parse(ext.storageGet("whitelist") || "[]");
    return whitelist.includes(groupIdStr);
  }

  /**
   * 列出白名单中的群组
   */
  function listWhitelist() {
    const whitelist = JSON.parse(ext.storageGet("whitelist") || "[]");
    return whitelist;
  }

  const cmdFindAndManage = seal.ext.newCmdItemInfo();
  cmdFindAndManage.name = "查找共群";
  cmdFindAndManage.help =
    "使用指令查找ID是否在好友列表，查找共群并显示信息，支持根据权限退出群聊和删除好友\n用法：\n.查找共群 <ID1>&<ID2>&<ID3> [exit/exit_admin/delete] [告别语]\n操作选项：\n- exit：如果该ID在群则退出\n- exit_admin：如果该ID是群管理或以上才退出\n- delete：删除好友\n注意：群数过多时查找时间较长，内存占用上升，请勿在此期间重载插件。无论是否有参数，都会进行一次查找。一次可以搜多个id，参数可以同时使用，之间都用&连接。\n\n白名单管理：\n.查找共群 白名单 add <groupid> - 添加群组到白名单\n.查找共群 白名单 rm <groupid> - 从白名单中移除群组\n.查找共群 白名单 list - 列出所有白名单群组";

  cmdFindAndManage.solve = async (ctx, msg, cmdArgs) => {
    const ext = seal.ext.find("HTTP依赖");
    if (!ext) {
      console.error(`未找到HTTP依赖，无法运行`);
      return;
    }

    const rawIds = cmdArgs.getArgN(1);
    const operationArgs = cmdArgs.getArgN(2) || "";
    const farewellMessage = cmdArgs.getArgN(3) || ""; 

    if (rawIds === "白名单") {
      const subCommand = operationArgs;
      const groupId = farewellMessage;

      if (subCommand === "add") {
        if (!groupId) {
          seal.replyToSender(ctx, msg, "请输入要添加的群组ID。");
          return seal.ext.newCmdExecuteResult(true);
        }
        const success = addGroupToWhitelist(groupId);
        if (success) {
          seal.replyToSender(ctx, msg, `已添加群组 ${groupId} 到白名单。`);
        } else {
          seal.replyToSender(ctx, msg, `群组 ${groupId} 已在白名单中。`);
        }
      } else if (subCommand === "rm") {
        if (!groupId) {
          seal.replyToSender(ctx, msg, "请输入要移除的群组ID。");
          return seal.ext.newCmdExecuteResult(true);
        }
        const success = removeGroupFromWhitelist(groupId);
        if (success) {
          seal.replyToSender(ctx, msg, `已从白名单中移除群组 ${groupId}。`);
        } else {
          seal.replyToSender(ctx, msg, `群组 ${groupId} 不在白名单中。`);
        }
      } else if (subCommand === "list") {
        const whitelist = listWhitelist();
        if (whitelist.length === 0) {
          seal.replyToSender(ctx, msg, "白名单为空。");
        } else {
          seal.replyToSender(ctx, msg, `白名单群组：\n${whitelist.join("\n")}`);
        }
      } else {
        seal.replyToSender(
          ctx,
          msg,
          "未知的白名单操作，请使用 .查找共群 白名单 help 查看帮助。"
        );
      }
      return seal.ext.newCmdExecuteResult(true);
    }

    const operations = operationArgs.split("&").map((op) => op.trim());
    const operationExit = operations.includes("exit");
    const operationExitAdmin = operations.includes("exit_admin");
    const operationDelete = operations.includes("delete");
    console.log(
      `查找ID: ${rawIds}，操作选项：${operationArgs}，告别语：${farewellMessage}`
    );
    console.log(
      `操作选项：退出群聊: ${operationExit}，退出群聊(管理员): ${operationExitAdmin}，删除好友: ${operationDelete}`
    );

    if (!rawIds) {
      seal.replyToSender(ctx, msg, "请输入要查找的ID。");
      return seal.ext.newCmdExecuteResult(true);
    }

    const ids = rawIds.split("&");

    seal.replyToSender(
      ctx,
      msg,
      `正在查找ID: ${ids.join(
        ", "
      )}，请稍候...\n注意：群数过多时查找时间较长，内存占用上升，请勿在此期间重载插件。`
    );

    try {
      const epId = ctx.endPoint.userId;
      const friendList = await globalThis.http.getData(epId, `get_friend_list`);
      const groupList = await globalThis.http.getData(epId, `get_group_list`);

      let resultMessage = "";

      for (const id of ids) {
        const isFriend = friendList.some(
          (friend) => friend.user_id.toString() === id
        );

        const commonGroups = [];
        for (const group of groupList) {
          const memberList = await globalThis.http.getData(
            epId,
            `get_group_member_list?group_id=${group.group_id}`
          );
          const member = memberList.find(
            (member) => member.user_id.toString() === id
          );

          if (member) {
            const privilegeLevel = getPrivilegeLevelFromRole(member.role);
            commonGroups.push({
              groupName: group.group_name,
              groupId: group.group_id,
              memberName: member.nickname,
              privilegeLevel: privilegeLevel,
            });
          }
        }

        resultMessage += `ID: ${id}\n`;
        resultMessage += `是否在好友列表: ${isFriend ? "是" : "否"}\n`;
        resultMessage += `共群数量: ${commonGroups.length}\n`;

        if (commonGroups.length > 0) {
          resultMessage += "共群信息:\n";
          commonGroups.forEach((group, index) => {
            resultMessage += `${index + 1}. 群名: ${group.groupName}(${
              group.groupId
            })\n`;
            resultMessage += `   权限: ${
              group.privilegeLevel
            } (${getPrivilegeLevelDescription(group.privilegeLevel)})\n`;
          });

          if (operationExit || operationExitAdmin) {
            for (const group of commonGroups) {
              if (isGroupInWhitelist(group.groupId.toString())) {
                resultMessage += `群组 ${group.groupName}(${group.groupId}) 在白名单中，跳过退群操作。\n`;
                continue;
              }

              if (
                operationExit ||
                (operationExitAdmin && group.privilegeLevel >= 50)
              ) {
                const success = await setGroupLeave(
                  epId,
                  group.groupId,
                  farewellMessage
                );
                if (success) {
                  resultMessage += `已退出群: ${group.groupName}(${group.groupId})\n`;
                } else {
                  resultMessage += `退出群: ${group.groupName}(${group.groupId}) 失败\n`;
                }
              }
            }
          }
        }

        if (operationDelete && isFriend) {
          const success = await deleteFriend(epId, id);
          if (success) {
            resultMessage += `已删除好友: ${id}\n`;
          } else {
            resultMessage += `删除好友: ${id} 失败\n`;
          }
        }
      }

      seal.replyToSender(ctx, msg, resultMessage);
    } catch (error) {
      console.error("查找共群失败:", error);
      seal.replyToSender(ctx, msg, "查找共群失败，请查看日志。");
    }
  };

  ext.cmdMap["查找共群"] = cmdFindAndManage;
}

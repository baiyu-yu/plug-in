// ==UserScript==
// @name         群管理和名片点赞http版
// @author       白鱼（and 星辰）
// @version      1.1.0
// @description  群管理和名片点赞这些onebot部分功能实现，需要配置http客户端，在插件设置修改http地址。适用Lagrange，nc和llonebot，内置客户端不可用，是在星尘佬群公告插件的基础上改的，将星辰佬原有的群公告发布部分也合并加入了。使用.群管帮助查看所有命令。
// @timestamp    1717406830
// @license      MIT
// @homepageURL  https://github.com/baiyu-yu/plug-in
// @updateUrl    https://raw.gitmirror.com/baiyu-yu/plug-in/main/%E7%BE%A4%E7%AE%A1%E7%9B%B8%E5%85%B3.js
// @updateUrl    https://raw.githubusercontent.com/baiyu-yu/plug-in/main/%E7%BE%A4%E7%AE%A1%E7%9B%B8%E5%85%B3.js
// ==/UserScript==

if (!seal.ext.find("GroupManagement")) {
  const ext = seal.ext.new("GroupManagement", "白鱼", "1.0.0");
  // 注册扩展
  seal.ext.register(ext);
  seal.ext.registerStringConfig(ext, "http地址", "http://127.0.0.1:8096");

  const cmdHelp = seal.ext.newCmdItemInfo();
  cmdHelp.name = "群管帮助";
  cmdHelp.help = "显示所有群管理相关命令的帮助信息";
  cmdHelp.solve = (ctx, msg, cmdArgs) => {
    const helpText = `群管理命令列表：
.禁言 <时长> @某人 - 禁言指定成员（时长格式：3h3m3s，或3d6分钟，0为解除）
.设置群名 <名称> - 修改群名称
.设置管理员 <1/0> @某人 - 设置/取消管理员
.全员禁言 <1/0> - 开启/关闭全员禁言
.踢出 @某人 - 踢出群成员
.点赞 @某人 - 给对方名片点赞
.群头衔 <内容> [@某人] - 设置群头衔
.群公告发布 <内容> - 发布群公告

注：大部分命令需要管理员权限`;
    seal.replyToSender(ctx, msg, helpText);
    return seal.ext.newCmdExecuteResult(true);
  };

  const cmdgroupban = seal.ext.newCmdItemInfo();
  cmdgroupban.name = "禁言";
  cmdgroupban.help =
    "禁言，.禁言 时长 @某人，时长为3h3m3s这样的格式，或者3d6这样随机，0为解除";
  cmdgroupban.allowDelegate = true;

  cmdgroupban.solve = (ctx, msg, cmdArgs) => {
    const timeStr = cmdArgs.getArgN(1);

    switch (timeStr) {
      case "help": {
        const ret = seal.ext.newCmdExecuteResult(true);
        ret.showHelp = true;
        return ret;
      }
      default: {
        if (!timeStr) {
          seal.replyToSender(ctx, msg, `请输入禁言时间`);
          return seal.ext.newCmdExecuteResult(true);
        }
        // 现在的设置是群管理群主和白名单和master可以用，你要是想改可以改下面这个数值，数值参考https://docs.sealdice.com/advanced/js_example.html#%E6%9D%83%E9%99%90%E8%AF%86%E5%88%AB，后面的群管指令都这样，自己翻翻，加油
        if (ctx.privilegeLevel < 50) {
          seal.replyToSender(
            ctx,
            msg,
            seal.formatTmpl(ctx, "核心:提示_无权限")
          );
          return seal.ext.newCmdExecuteResult(true);
        }

        const groupQQ = ctx.group.groupId;
        const mctx = seal.getCtxProxyFirst(ctx, cmdArgs);
        ctx.delegateText = "";
        const userId = mctx.player.userId.split(":")[1];
        const username = mctx.player.name;

        // 处理时长，默认为30分钟，支持直接输入秒数或友好格式（如"1h"、"30m"）
        let duration = 30 * 60; 
        if (timeStr) {
          const match = timeStr.match(/^(\d+)([smh])$/i);
          if (match) {
            let num = parseInt(match[1], 10);
            switch (match[2].toLowerCase()) {
              case "s":
                duration = num;
                break;
              case "m":
                duration = num * 60;
                break;
              case "h":
                duration = num * 60 * 60;
                break;
            }
          } else {
            const diceMatch = timeStr.match(/^(\d+)d(\d+)$/i);
            if (diceMatch) {
              const numDice = parseInt(diceMatch[1], 10);
              const diceSides = parseInt(diceMatch[2], 10);
              duration = 0;
              for (let i = 0; i < numDice; i++) {
                duration += Math.floor(Math.random() * diceSides) + 1; 
              }
              duration *= 60; 
            } else {
              duration = parseInt(timeStr, 10);
              if (isNaN(duration)) {
                seal.replyToSender(
                  ctx,
                  msg,
                  `禁言时长格式错误，请输入数字或友好格式（如"30m"或"3d6"）`
                );
                return seal.ext.newCmdExecuteResult(true);
              }
            }
          }
        }

        const postData = {
          group_id: groupQQ.match(/:(\d+)/)[1],
          user_id: userId,
          duration: duration,
        };

        const groupbanApi =
          seal.ext.getStringConfig(ext, "http地址") + "/set_group_ban";
        fetch(groupbanApi, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(postData),
        })
          .then((response) => {
            if (!response.ok) {
              throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
          })
          .then((data) => {
            seal.replyToSender(
              ctx,
              msg,
              `已禁言用户${username}，时长${duration}秒`
            );
          })
          .catch((error) => {
            if (error instanceof TypeError) {
              console.error("网络连接问题，请检查网络设置。", error);
              seal.replyToSender(ctx, msg, `网络连接问题，请检查网络设置。`);
            } else {
              console.error("禁言操作失败，请查看日志详情。", error);
              seal.replyToSender(ctx, msg, `禁言操作失败，请稍后再试。`);
            }
          });

        return seal.ext.newCmdExecuteResult(true);
      }
    }
  };

  const cmdgroupname = seal.ext.newCmdItemInfo();
  cmdgroupname.name = "设置群名";
  cmdgroupname.help = "设置群名，.设置群名 【群名】";

  cmdgroupname.solve = (ctx, msg, cmdArgs) => {
    const agroupname = cmdArgs.getArgN(1);

    switch (agroupname) {
      case "help": {
        const ret = seal.ext.newCmdExecuteResult(true);
        ret.showHelp = true;
        return ret;
      }
      default: {
        if (!agroupname) {
          seal.replyToSender(ctx, msg, `请输入需要设置的群名`);
          return seal.ext.newCmdExecuteResult(true);
        }
        if (ctx.privilegeLevel < 50) {
          seal.replyToSender(
            ctx,
            msg,
            seal.formatTmpl(ctx, "核心:提示_无权限")
          );
          return seal.ext.newCmdExecuteResult(true);
        }
        const groupQQ = ctx.group.groupId;
        const postData = {
          group_id: groupQQ.match(/:(\d+)/)[1],
          group_name: agroupname,
        };
        const groupnameApi =
          seal.ext.getStringConfig(ext, "http地址") + "/set_group_name";
        fetch(groupnameApi, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(postData),
        })
          .then((response) => {
            if (!response.ok) {
              throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
          })
          .then((data) => {
            console.log("修改群名为" + agroupname, data);
            seal.replyToSender(ctx, msg, `已修改群名`);
          })
          .catch((error) => {
            if (error instanceof TypeError) {
              console.error("网络连接问题，请检查网络设置。", error);
              seal.replyToSender(ctx, msg, `网络连接问题，请检查网络设置。`);
            } else {
              console.error("修改操作失败，请查看日志详情。", error);
              seal.replyToSender(ctx, msg, `修改操作失败，请查看日志？`);
            }
          });

        return seal.ext.newCmdExecuteResult(true);
      }
    }
  };

  const cmdgroupadmin = seal.ext.newCmdItemInfo();
  cmdgroupadmin.name = "设置管理员";
  cmdgroupadmin.help =
    "设置管理员，.设置管理员 1/0 (1为设置，0为取消) @某人，需要骰娘为群主";
  cmdgroupadmin.allowDelegate = true;

  cmdgroupadmin.solve = (ctx, msg, cmdArgs) => {
    const setAdmin = cmdArgs.getArgN(1);

    if (!setAdmin) {
      seal.replyToSender(ctx, msg, `请输入操作（1为设置，0为取消）`);
      return seal.ext.newCmdExecuteResult(true);
    }
    if (ctx.privilegeLevel < 50) {
      seal.replyToSender(ctx, msg, seal.formatTmpl(ctx, "核心:提示_无权限"));
      return seal.ext.newCmdExecuteResult(true);
    }

    const groupQQ = ctx.group.groupId;
    const mctx = seal.getCtxProxyFirst(ctx, cmdArgs);
    ctx.delegateText = "";
    const userId = mctx.player.userId.split(":")[1];

    const enable = parseInt(setAdmin, 10) === 1;

    const postData = {
      group_id: groupQQ.match(/:(\d+)/)[1],
      user_id: userId,
      enable: enable,
    };
    const groupadminApi =
      seal.ext.getStringConfig(ext, "http地址") + "/set_group_admin";
    fetch(groupadminApi, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(postData),
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
      })
      .then((data) => {
        seal.replyToSender(ctx, msg, `已${enable ? "设置" : "取消"}管理员权限`);
      })
      .catch((error) => {
        if (error instanceof TypeError) {
          seal.replyToSender(ctx, msg, `网络连接问题，请检查网络设置。`);
        } else {
          seal.replyToSender(ctx, msg, `设置管理员操作失败，请查看日志。`);
        }
      });

    return seal.ext.newCmdExecuteResult(true);
  };

  const cmdgroupallban = seal.ext.newCmdItemInfo();
  cmdgroupallban.name = "全员禁言";
  cmdgroupallban.help = "全员禁言，.全员禁言 1/0 (1为禁言，0为取消)";
  cmdgroupallban.solve = (ctx, msg, cmdArgs) => {
    const setAllBan = cmdArgs.getArgN(1);

    if (!setAllBan) {
      seal.replyToSender(ctx, msg, `请输入操作（1为禁言，0为取消）`);
      return seal.ext.newCmdExecuteResult(true);
    }
    if (ctx.privilegeLevel < 50) {
      seal.replyToSender(ctx, msg, seal.formatTmpl(ctx, "核心:提示_无权限"));
      return seal.ext.newCmdExecuteResult(true);
    }
    const groupQQ = ctx.group.groupId;
    const enable = parseInt(setAllBan, 10) === 1;

    const postData = {
      group_id: groupQQ.match(/:(\d+)/)[1],
      enable: enable,
    };
    const groupallbanApi =
      seal.ext.getStringConfig(ext, "http地址") + "/set_group_whole_ban";
    fetch(groupallbanApi, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(postData),
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
      })
      .then((data) => {
        seal.replyToSender(ctx, msg, `已${enable ? "开启" : "取消"}全员禁言`);
      })
      .catch((error) => {
        if (error instanceof TypeError) {
          seal.replyToSender(ctx, msg, `网络连接问题，请检查网络设置。`);
        } else {
          seal.replyToSender(ctx, msg, `全员禁言操作失败，请查看日志。`);
        }
      });

    return seal.ext.newCmdExecuteResult(true);
  };

  const cmdgroupkick = seal.ext.newCmdItemInfo();
  cmdgroupkick.name = "踢出";
  cmdgroupkick.help = "踢人，.踢出 @某人";
  cmdgroupkick.allowDelegate = true;

  cmdgroupkick.solve = (ctx, msg, cmdArgs) => {
    if (ctx.privilegeLevel < 50) {
      seal.replyToSender(ctx, msg, seal.formatTmpl(ctx, "核心:提示_无权限"));
      return seal.ext.newCmdExecuteResult(true);
    }
    const mctx = seal.getCtxProxyFirst(ctx, cmdArgs);
    ctx.delegateText = "";
    const userId = mctx.player.userId.split(":")[1];
    const groupQQ = ctx.group.groupId;

    const postData = {
      group_id: groupQQ.match(/:(\d+)/)[1],
      user_id: userId,
      reject_add_request: false,
    };
    const groupkickApi =
      seal.ext.getStringConfig(ext, "http地址") + "/set_group_kick";
    fetch(groupkickApi, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(postData),
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
      })
      .then((data) => {
        seal.replyToSender(ctx, msg, `已踢出用户${userId}`);
      })
      .catch((error) => {
        if (error instanceof TypeError) {
          seal.replyToSender(ctx, msg, `网络连接问题，请检查网络设置。`);
        } else {
          seal.replyToSender(ctx, msg, `踢人操作失败，请查看日志。`);
        }
      });

    return seal.ext.newCmdExecuteResult(true);
  };

  const cmdlike = seal.ext.newCmdItemInfo();
  cmdlike.name = "点赞";
  cmdlike.help = "赞名片，.点赞 @某人";
  cmdlike.allowDelegate = true;

  cmdlike.solve = (ctx, msg, cmdArgs) => {
    const mctx = seal.getCtxProxyFirst(ctx, cmdArgs);
    ctx.delegateText = "";
    const userId = mctx.player.userId.split(":")[1];
    const username = mctx.player.name;

    const postData = {
      user_id: userId,
      times: 10,
    };
    const likeApi = seal.ext.getStringConfig(ext, "http地址") + "/send_like";
    fetch(likeApi, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(postData),
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
      })
      .then((data) => {
        seal.replyToSender(ctx, msg, `已为${username}点赞`);
      })
      .catch((error) => {
        if (error instanceof TypeError) {
          seal.replyToSender(ctx, msg, `网络连接问题，请检查网络设置。`);
        } else {
          seal.replyToSender(ctx, msg, `赞操作失败，请查看日志。`);
        }
      });

    return seal.ext.newCmdExecuteResult(true);
  };

  const cmdSpecialTitle = seal.ext.newCmdItemInfo();
  cmdSpecialTitle.name = "群头衔更改";
  cmdSpecialTitle.help =
    "群头衔功能，可用“.群头衔 内容” 指令来更改。 “.群头衔 权限切换”来切换可发布者的身份，默认为管理员与群主才能更改头衔（master和白名单例外），切换后为所有人都可以更改。无论哪种权限，管理员和群主可以通过@某人代改。";
  cmdSpecialTitle.allowDelegate = true;

  cmdSpecialTitle.solve = (ctx, msg, cmdArgs) => {
    let val = cmdArgs.getArgN(1);
    // 获取用户ID
    let userQQ;
    if (ctx.privilegeLevel < 45) {
      userQQ = ctx.player.userId.split(":")[1]; 
    } else {
      let mctx = seal.getCtxProxyFirst(ctx, cmdArgs);
      ctx.delegateText = "";
      userQQ = mctx.player.userId.split(":")[1];
    }

    switch (val) {
      case "help": {
        const ret = seal.ext.newCmdExecuteResult(true);
        ret.showHelp = true;
        return ret;
      }
      default: {
        if (!val) {
          seal.replyToSender(ctx, msg, `请输入头衔内容`);
          return seal.ext.newCmdExecuteResult(true);
        }
        // 权限切换
        if (val === "权限切换" && ctx.privilegeLevel > 45) {
          whiteList = whiteList === 1 ? 0 : 1;
          seal.replyToSender(
            ctx,
            msg,
            whiteList === 1
              ? `权限已切换为管理员与群主可更改`
              : `权限已切换为所有人可更改`
          );
          return seal.ext.newCmdExecuteResult(true);
        }

        if (ctx.privilegeLevel < 45 && whiteList === 1) {
          seal.replyToSender(
            ctx,
            msg,
            `权限不足，无法修改群头衔,当前只有管理员与群主可无法修改群头衔`
          );
          return seal.ext.newCmdExecuteResult(true);
        }

        const groupContent = val;
        const contentLength = Array.from(groupContent).reduce(
          (length, char) => {
            if (/[\u0020-\u007E]/.test(char)) {
              length += 0.5;
            } else if (/[\u4e00-\u9fa5]/.test(char)) {
              length += 1;
            }
            return length;
          },
          0
        );

        if (contentLength > 6) {
          seal.replyToSender(ctx, msg, "头衔长度不能超过六个字符。");
          return seal.ext.newCmdExecuteResult(true);
        }

        let groupQQ = ctx.group.groupId.match(/:(\d+)/)[1];
        let postData = {
          group_id: parseInt(groupQQ, 10),
          user_id: parseInt(userQQ, 10),
          special_title: groupContent.toString(),
        };

        const groupSpecialTitleApi =
          seal.ext.getStringConfig(ext, "http地址") +
          "/set_group_special_title";
        fetch(groupSpecialTitleApi, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(postData),
        })
          .then((response) => response.json())
          .then((data) => {
            console.log("群头衔更改成功", data);
            seal.replyToSender(ctx, msg, `群头衔更改成功`);
          })
          .catch((error) => {
            console.log("群头衔更改失败，请查看日志", error);
            seal.replyToSender(ctx, msg, `群头衔更改失败，请查看日志`);
          });

        return seal.ext.newCmdExecuteResult(true);
      }
    }
  };

  const cmdGroupNotice = seal.ext.newCmdItemInfo();
  cmdGroupNotice.name = "群公告发布";
  cmdGroupNotice.help =
    "群公告发布功能，可用“.群公告发布 内容（可包含图片，图片与文字需要在一条消息里）” 指令来发布群公告。 “.群公告发布 权限切换”来切换可发布者的身份，默认为管理员与群主才能发送，切换后为所有人都可以发送。";
  cmdGroupNotice.solve = (ctx, msg, cmdArgs) => {
    let val = cmdArgs.getArgN(1);
    switch (val) {
      case "help": {
        const ret = seal.ext.newCmdExecuteResult(true);
        ret.showHelp = true;
        return ret;
      }
      default: {
        if (!val) {
          seal.replyToSender(ctx, msg, `没有输入任何信息`);
          return;
        }
        if (val == "权限切换" && ctx.privilegeLevel > 45) {
          whiteList = -whiteList;
          if (whiteList == 1) {
            seal.replyToSender(ctx, msg, `权限已切换为管理员与群主可发布`);
          } else {
            seal.replyToSender(ctx, msg, `权限已切换为所有人可发布`);
          }
          return;
        }

        if (ctx.privilegeLevel < 45 && whiteList == 1) {
          seal.replyToSender(
            ctx,
            msg,
            `权限不足，无法发布群公告,当前只有管理员与群主可发布群公告`
          );
          return;
        }

        let groupContent = msg.message.substring(8);
        let groupQQ = ctx.group.groupId;
        let regex = /\[CQ:image,file=(.*?),url=(.*?)\]/;
        let imgMatch = groupContent.match(regex);
        groupContentClean = groupContent.replace(/\[CQ:[^\]]*\]/g, "");
        let postData = {
          group_id: groupQQ.match(/:(\d+)/)[1],
          content: groupContentClean,
        };
        if (imgMatch !== null) {
          let imgUrl = imgMatch[2];
          postData.image = imgUrl;
        }
        const groupNoticeApi =
          seal.ext.getStringConfig(ext, "http地址") + "/_send_group_notice";
        fetch(groupNoticeApi, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(postData),
        })
          .then((response) => console.log(response.json()))
          .then((postData) => {
            console.log("群公告发送成功", postData);
          })
          .catch((error) => {
            console.log("群公告发送失败，请查看日志", error);
          });
        return seal.ext.newCmdExecuteResult(true);
      }
    }
  };

  ext.cmdMap["禁言"] = cmdgroupban;
  ext.cmdMap["设置群名"] = cmdgroupname;
  ext.cmdMap[cmdgroupadmin.name] = cmdgroupadmin;
  ext.cmdMap[cmdgroupallban.name] = cmdgroupallban;
  ext.cmdMap[cmdgroupkick.name] = cmdgroupkick;
  ext.cmdMap[cmdlike.name] = cmdlike;
  ext.cmdMap["群头衔"] = cmdSpecialTitle;
  ext.cmdMap["群公告发布"] = cmdGroupNotice;
  ext.cmdMap["群管帮助"] = cmdHelp;
}

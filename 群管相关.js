// ==UserScript==
// @name         群管理和名片点赞http版
// @author       白鱼
// @version      1.0.0
// @description  群管理和名片点赞这些onebot部分功能实现，需要配置http通信，适用Lagrange，内置也是这个，nc和llonebot应该是也有这些api，具体怎么开它们的http自适应一下#目移，是在星尘佬群公告插件的基础上改的
// @timestamp    1717406830
// @license      Apache-2
// @homepageURL  https://github.com/baiyu-yu/plug-in
// @updateUrl    https://raw.gitmirror.com/baiyu-yu/plug-in/main/%E7%BE%A4%E7%AE%A1%E7%9B%B8%E5%85%B3.js
// @updateUrl    https://raw.githubusercontent.com/baiyu-yu/plug-in/main/%E7%BE%A4%E7%AE%A1%E7%9B%B8%E5%85%B3.js
// ==/UserScript==

if (!seal.ext.find("GroupManagement")) {
  const ext = seal.ext.new("GroupManagement", "白鱼", "1.0.0");
  // 注册扩展
  seal.ext.register(ext);
  //这个port你看着改，要保证和appsettings里http的一样
  seal.ext.registerStringConfig(ext, 'http端口', '8096')
  let port = seal.ext.getStringConfig(ext, "http端口");
  let groupbanApi = "http://127.0.0.1:" + port + "/set_group_ban";
  let groupnameApi = "http://127.0.0.1:" + port + "/set_group_name";
  let groupadminApi = "http://127.0.0.1:" + port + "/set_group_admin";
  let groupallbanApi = "http://127.0.0.1:" + port + "/set_group_whole_ban";
  let groupkickApi = "http://127.0.0.1:" + port + "/set_group_kick";
  let likeApi = "http://127.0.0.1:" + port + "/send_like";


  const cmdgroupban = seal.ext.newCmdItemInfo();
  cmdgroupban.name = "groupban";
  cmdgroupban.help =
    "禁言，.groupban qq号 时长，时长为3h3m3s这样的格式，0为接触，应该";

  cmdgroupban.solve = (ctx, msg, cmdArgs) => {
    let val = cmdArgs.getArgN(1); // 用户ID
    let timeStr = cmdArgs.getArgN(2); // 禁言时长字符串

    switch (val) {
      case "help": {
        const ret = seal.ext.newCmdExecuteResult(true);
        ret.showHelp = true;
        return ret;
      }
      default: {
        if (!val) {
          seal.replyToSender(ctx, msg, `请输入用户ID`);
          return seal.ext.newCmdExecuteResult(true);
        }
        if (!timeStr) {
          seal.replyToSender(ctx, msg, `请输入禁言时间`);
          return seal.ext.newCmdExecuteResult(true);
        }
        //现在的设置是群管理群主和白名单和master可以用，你要是想改可以改下面这个数值，数值参考https://docs.sealdice.com/advanced/js_example.html#%E6%9D%83%E9%99%90%E8%AF%86%E5%88%AB，后面的群管指令都这样，自己翻翻，加油
        if (ctx.privilegeLevel < 50) {
          seal.replyToSender(ctx, msg, seal.formatTmpl(ctx, "核心:提示_无权限"));
          return seal.ext.newCmdExecuteResult(true);
        }

        let groupQQ = ctx.group.groupId;
        let userId = parseInt(val.replace(/:/g, ""), 10);

        // 处理时长，默认为30分钟，支持直接输入秒数或友好格式（如"1h"、"30m"）
        let duration = 30 * 60; // 默认30分钟
        if (timeStr) {
          const match = timeStr.match(/^(\d+)([smh])$/i); // 匹配数字后跟单位(s秒/m分/h小时)
          if (match) {
            let num = parseInt(match[1], 10);
            switch (match[2].toLowerCase()) {
              case 's': duration = num; break;
              case 'm': duration = num * 60; break;
              case 'h': duration = num * 60 * 60; break;
            }
          } else {
            duration = parseInt(timeStr, 10);
            if (isNaN(duration)) {
              seal.replyToSender(ctx, msg, `禁言时长格式错误，请输入数字或友好格式（如"30m"）`);
              return seal.ext.newCmdExecuteResult(true);
            }
          }
        }

        let postData = {
          group_id: groupQQ.match(/:(\d+)/)[1],
          user_id: userId,
          duration: duration,
        };

        fetch(groupbanApi, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(postData),
        })
          .then((response) => {
            // 检查HTTP状态码
            if (!response.ok) {
              throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
          })
          .then((data) => {
            console.log("晚安:", data);
            seal.replyToSender(ctx, msg, `晚安`);
          })
          .catch((error) => {
            // 明确区分网络错误和其他错误
            if (error instanceof TypeError) {
              console.error("网络连接问题，请检查网络设置。", error);
              seal.replyToSender(ctx, msg, `网络连接问题，请检查网络设置。`);
            } else {
              console.error("禁言操作失败，请查看日志详情。", error);
              seal.replyToSender(ctx, msg, `禁言操作失败，请稍后再试。`);
            }
          });

        return seal.ext.newCmdExecuteResult(true);
      };
    }
  };



  const cmdgroupname = seal.ext.newCmdItemInfo();
  cmdgroupname.name = "groupname";
  cmdgroupname.help =
    "设置群名，.groupname 【群名】";

  cmdgroupname.solve = (ctx, msg, cmdArgs) => {
    let agroupname = cmdArgs.getArgN(1); // 群名

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
          seal.replyToSender(ctx, msg, seal.formatTmpl(ctx, "核心:提示_无权限"));
          return seal.ext.newCmdExecuteResult(true);
        }
        let groupQQ = ctx.group.groupId;
        let postData = {
          group_id: groupQQ.match(/:(\d+)/)[1],
          group_name: agroupname,
        };
        fetch(groupnameApi, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(postData),
        })
          .then((response) => {
            // 检查HTTP状态码
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
            // 明确区分网络错误和其他错误
            if (error instanceof TypeError) {
              console.error("网络连接问题，请检查网络设置。", error);
              seal.replyToSender(ctx, msg, `网络连接问题，请检查网络设置。`);
            } else {
              console.error("修改操作失败，请查看日志详情。", error);
              seal.replyToSender(ctx, msg, `修改操作失败，请查看日志？`);
            }
          });

        return seal.ext.newCmdExecuteResult(true);
      };
    }
  };
  const cmdgroupadmin = seal.ext.newCmdItemInfo();
  cmdgroupadmin.name = "groupadmin";
  cmdgroupadmin.help = "设置管理员，.groupadmin qq号 1/0 (1为设置，0为取消)，需要群主";
  cmdgroupadmin.solve = (ctx, msg, cmdArgs) => {
    let val = cmdArgs.getArgN(1); // 用户ID
    let setAdmin = cmdArgs.getArgN(2); // 设置或取消管理员

    if (!val || !setAdmin) {
      seal.replyToSender(ctx, msg, `请输入用户ID和操作（1为设置，0为取消）`);
      return seal.ext.newCmdExecuteResult(true);
    }
    if (ctx.privilegeLevel < 50) {
      seal.replyToSender(ctx, msg, seal.formatTmpl(ctx, "核心:提示_无权限"));
      return seal.ext.newCmdExecuteResult(true);
    }
    let groupQQ = ctx.group.groupId;
    let userId = parseInt(val.replace(/:/g, ""), 10);
    let enable = parseInt(setAdmin, 10) === 1;

    let postData = {
      group_id: groupQQ.match(/:(\d+)/)[1],
      user_id: userId,
      enable: enable,
    };
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
  cmdgroupallban.name = "groupallban";
  cmdgroupallban.help = "全员禁言，.groupallban 1/0 (1为禁言，0为取消)";
  cmdgroupallban.solve = (ctx, msg, cmdArgs) => {
    let setAllBan = cmdArgs.getArgN(1); // 设置或取消全员禁言

    if (!setAllBan) {
      seal.replyToSender(ctx, msg, `请输入操作（1为禁言，0为取消）`);
      return seal.ext.newCmdExecuteResult(true);
    }
    if (ctx.privilegeLevel < 50) {
      seal.replyToSender(ctx, msg, seal.formatTmpl(ctx, "核心:提示_无权限"));
      return seal.ext.newCmdExecuteResult(true);
    }
    let groupQQ = ctx.group.groupId;
    let enable = parseInt(setAllBan, 10) === 1;

    let postData = {
      group_id: groupQQ.match(/:(\d+)/)[1],
      enable: enable,
    };
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
  cmdgroupkick.name = "groupkick";
  cmdgroupkick.help = "踢人，.groupkick qq号";
  cmdgroupkick.solve = (ctx, msg, cmdArgs) => {
    let val = cmdArgs.getArgN(1); // 用户ID

    if (!val) {
      seal.replyToSender(ctx, msg, `请输入用户ID`);
      return seal.ext.newCmdExecuteResult(true);
    }
    if (ctx.privilegeLevel < 50) {
      seal.replyToSender(ctx, msg, seal.formatTmpl(ctx, "核心:提示_无权限"));
      return seal.ext.newCmdExecuteResult(true);
    }
    let groupQQ = ctx.group.groupId;
    let userId = parseInt(val.replace(/:/g, ""), 10);

    let postData = {
      group_id: groupQQ.match(/:(\d+)/)[1],
      user_id: userId,
      reject_add_request: false,
    };
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
  cmdlike.name = "like";
  cmdlike.help = "赞名片，.like qq号";
  cmdlike.solve = (ctx, msg, cmdArgs) => {
    let val = cmdArgs.getArgN(1); // 用户ID

    if (!val) {
      seal.replyToSender(ctx, msg, `请输入用户ID`);
      return seal.ext.newCmdExecuteResult(true);
    }
    let userId = parseInt(val.replace(/:/g, ""), 10);

    let postData = {
      user_id: userId,
      times: 10,
    };
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
        seal.replyToSender(ctx, msg, `已为${userId}点赞`);
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

  // 注册命令
  ext.cmdMap["groupban"] = cmdgroupban;
  ext.cmdMap["groupname"] = cmdgroupname;
  ext.cmdMap[cmdgroupadmin.name] = cmdgroupadmin;
  ext.cmdMap[cmdgroupallban.name] = cmdgroupallban;
  ext.cmdMap[cmdgroupkick.name] = cmdgroupkick;
  ext.cmdMap[cmdlike.name] = cmdlike;
}

// ==UserScript==
// @name         群头衔更改
// @author       白鱼
// @version      1.1.0
// @description  群头衔功能，需要骰娘作为群主，需要开http。gocq框架：请参考 https://docs.go-cqhttp.org/guide/config.html#%E9%85%8D%E7%BD%AE%E4%BF%A1%E6%81%AF 为你的海豹gocqhttp配置文件(config.yml)添加http配置，参考网址中servers 部分参考配置的第一节 （ - http: # HTTP 通信设置）；内置或lagrange：参考https://lagrangedev.github.io/Lagrange.Doc/Lagrange.OneBot/Config/#%E6%AD%A3%E5%90%91-http-%E9%85%8D%E7%BD%AE为你的拉格兰添加http设置。是在星尘佬的群公告发布的基础上小修改了一下达到这个结果。请注意修改你的对应端口。
// @timestamp    1717406830
// @license      Apache-2
// @homepageURL  https://github.com/baiyu-yu/plug-in
// @updateUrl    https://mirror.ghproxy.com/https://raw.githubusercontent.com/baiyu-yu/plug-in/main/
// @updateUrl    https://raw.githubusercontent.com/baiyu-yu/plug-in/main/
// ==/UserScript==

if (!seal.ext.find("GroupSpecialTitle")) {
    const ext = seal.ext.new("GroupSpecialTitle", "白鱼", "1.1.0");
    let whiteList = 1; // 1 表示只有管理员和群主可以设置，0 表示所有人可以设置
    let port = "8083";
    let groupSpecialTitleApi = "http://127.0.0.1:" + port + "/set_group_special_title";
  
    const cmdSpecialTitle = seal.ext.newCmdItemInfo();
    cmdSpecialTitle.name = "群头衔更改";
    cmdSpecialTitle.help =
      "群头衔功能，可用“.群头衔 内容” 指令来更改。 “.群头衔 权限切换”来切换可发布者的身份，默认为管理员与群主才能更改头衔（master和白名单例外），切换后为所有人都可以更改。无论哪种权限，管理员和群主可以通过@某人代改。";
    cmdSpecialTitle.allowDelegate = true;
  
    cmdSpecialTitle.solve = (ctx, msg, cmdArgs) => {
      let val = cmdArgs.getArgN(1);
          // 获取用户ID
          let userQQ
          if (ctx.privilegeLevel < 45) {
            userQQ = ctx.player.userId.split(":")[1]; // 不符合条件，获取userQQ
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
            seal.replyToSender(ctx, msg, whiteList === 1 ? `权限已切换为管理员与群主可更改` : `权限已切换为所有人可更改`);
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
  
          // 获取消息内容相关
          const groupContent = val;
          const contentLength = Array.from(groupContent).reduce((length, char) => {
            if (/[\u0020-\u007E]/.test(char)) {
              length += 0.5;
            } else if (/[\u4e00-\u9fa5]/.test(char)) {
              length += 1;
            }
            return length;
          }, 0);
  
          if (contentLength > 6) {
            seal.replyToSender(ctx, msg, "头衔长度不能超过六个字符。");
            return seal.ext.newCmdExecuteResult(true);
          }
  
          let groupQQ = ctx.group.groupId;
          let postData = {
            group_id: groupQQ.match(/:(\d+)/)[1],
            user_id: userQQ,
            special_title: groupContent
          };
  
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
  
    ext.cmdMap["群头衔"] = cmdSpecialTitle;
    seal.ext.register(ext);
}

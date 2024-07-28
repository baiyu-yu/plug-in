// ==UserScript==
// @name         删除好友
// @author       白鱼
// @version      1.0.0
// @description  删除好友，仅master可用，似乎是需要开http，需要使用gocq框架，请参考 https://docs.go-cqhttp.org/guide/config.html#%E9%85%8D%E7%BD%AE%E4%BF%A1%E6%81%AF 为你的海豹gocqhttp配置文件(config.yml)添加http配置，参考网址中servers 部分参考配置的第一节 （ - http: # HTTP 通信设置）；是在星尘佬的群公告发布的基础上小修改了一下达到这个结果。
// @timestamp    1717406830
// @license      Apache-2
// @homepageURL  https://github.com/sealdice/javascript
// ==/UserScript==

if (!seal.ext.find("frienddelete")) {
  const ext = seal.ext.new("frienddelete", "白鱼", "1.0.0");
  // 这里填写你的端口号
  let port = "1808";
  let frienddeleteApi = "http://127.0.0.1:" + port + "/delete_friend";

  const cmdfrienddelete = seal.ext.newCmdItemInfo();
  cmdfrienddelete.name = "删除好友";
  cmdfrienddelete.help =
    "使用“.删除好友 QQ号” 指令删除";

  cmdfrienddelete.solve = (ctx, msg, cmdArgs) => {
    let val = cmdArgs.getArgN(1);
    if (ctx.privilegeLevel < 100) {
      seal.replyToSender(ctx, msg, seal.formatTmpl(ctx, "核心:提示_无权限"));
      return seal.ext.newCmdExecuteResult(true);
    }

    switch (val) {
      case "help": {
        const ret = seal.ext.newCmdExecuteResult(true);
        ret.showHelp = true;
        return ret;
      }
      default: {
        if (!val) {
          seal.replyToSender(ctx, msg, `请输入qq号`);
          return seal.ext.newCmdExecuteResult(true);
        }

        // 删除好友
        let postData = {
          user_id: val,
        };

        fetch(frienddeleteApi, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(postData),
        })
          .then((response) => response.json())
          .then((data) => {
            console.log("好友删除成功", data);
            seal.replyToSender(ctx, msg, `好友删除成功`);
          })
          .catch((error) => {
            console.log("好友删除失败，请查看日志", error);
            seal.replyToSender(ctx, msg, `好友删除失败，请查看日志`);
          });

        return seal.ext.newCmdExecuteResult(true);
      }
    }
  };

  // 注册命令
  ext.cmdMap["删除好友"] = cmdfrienddelete;
  // 注册扩展
  seal.ext.register(ext);
}
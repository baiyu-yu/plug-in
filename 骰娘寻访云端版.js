// ==UserScript==
// @name     骰娘寻访
// @author   白鱼 1004205930
// @version  1.0.5
// @description  真的能用吗 逻辑理论上是装了插件的骰可以用于上报qq然后让指定人审查骰确实是骰，再进行确认后放到骰娘寻访池子里。后端要是坏了请来保修，大坏了我就不维护了#蠕动。到时候有兴趣的请务必来接手。
// @timestamp 1716807011
// @license  MIT
// @homepageURL https://github.com/baiyu-yu/plug-in
// @updateUrl    https://raw.gitmirror.com/baiyu-yu/plug-in/main/%E9%AA%B0%E5%A8%98%E5%AF%BB%E8%AE%BF%E4%BA%91%E7%AB%AF%E7%89%88.js
// @updateUrl    https://raw.githubusercontent.com/baiyu-yu/plug-in/main/%E9%AA%B0%E5%A8%98%E5%AF%BB%E8%AE%BF%E4%BA%91%E7%AB%AF%E7%89%88.js
// ==/UserScript==

const appID = "";
const serverURL = "http://110.41.69.149:3518";
const cooldownTime = 10 * 60 * 1000;

class RequestTracker {
    static lastRequestTime = null;

    static getLastRequestTime() {
        return this.lastRequestTime;
    }

    static setLastRequestTime(time) {
        this.lastRequestTime = time;
    }
}

let ext = seal.ext.find("dicefind");
if (!ext) {
    ext = seal.ext.new("dicefind", "白鱼", "1.0.0");
    seal.ext.register(ext);
}

let cmddicefind = seal.ext.newCmdItemInfo();
cmddicefind.name = "骰娘寻访";
cmddicefind.help = "用法：\n.骰娘寻访 上报 <qqnumber> // 上报骰娘 QQ 号码\n.骰娘寻访 审核列表 // 列出所有未审核 QQ 号码和确认码\n.骰娘寻访 审核 <confirmCode> // 审核 QQ 号码\n.骰娘寻访 随机 // 随机寻访上报并被审核过的骰娘\n.骰娘寻访 三连 // 随机寻访三次上报并被审核过的骰娘\n.骰娘寻访 十连 // 随机寻访十次上报并被审核过的骰娘（注意冷却时间，否则服务器会炸）\n.骰娘寻访 移除 <qqnumber> // 移除 QQ 号码\n.骰娘寻访 查询 <qqnumber> // 查询骰娘状态";

async function fetchQQName(qqNumber) {
    try {
        let qqInfoUrl = `https://api.usuuu.com/qq/${qqNumber}`;
        let qqInfoResponse = await fetch(qqInfoUrl);
        let qqInfoData = await qqInfoResponse.json();

        if (qqInfoData.code === 200 && qqInfoData.result) {
            return qqInfoData.result.nickname;
        } else {
            qqInfoUrl = `https://api.oioweb.cn/api/qq/info?qq=${qqNumber}`;
            qqInfoResponse = await fetch(qqInfoUrl);
            qqInfoData = await qqInfoResponse.json();

            if (qqInfoData.code === 200 && qqInfoData.data) {
                return qqInfoData.data.name;
            } else {
                console.error('API返回的数据结构不符合预期', qqInfoData);
                return "未知";
            }
        }
    } catch (error) {
        console.error("Error:", error);
        return "未知";
    }
}

cmddicefind.solve = async (ctx, msg, cmdArgs) => {
    const command = cmdArgs.getArgN(1);

    if (command === "审核列表") {
        if (ctx.privilegeLevel < 100) {
            seal.replyToSender(ctx, msg, seal.formatTmpl(ctx, "核心:提示_无权限"));
            return seal.ext.cmddicefind(true);
        }

        try {
            const response = await fetch(`${serverURL}/unverified-list`, {
                method: "GET",
                headers: {
                    "Content-Type": "application/json",
                    "app_id": appID
                }
            });
            const data = await response.json();

            if (response.ok) {
                if (data.length > 0) {
                    const replies = await Promise.all(data.map(async (item) => {
                        try {
                            const qqname = await fetchQQName(item.qqNumber);
                            return `QQ: ${item.qqNumber}, 昵称: ${qqname}，确认码: ${item.confirmCode}`;
                        } catch (error) {
                            console.error("Error:", error);
                            return `QQ: ${item.qqNumber}, 获取昵称失败，确认码: ${item.confirmCode}`;
                        }
                    }));
                    seal.replyToSender(ctx, msg, replies.join("\n"));
                } else {
                    seal.replyToSender(ctx, msg, "没有待审核的QQ号码。");
                }
            } else {
                seal.replyToSender(ctx, msg, `获取待审核QQ号码失败: ${data.message || response.statusText}`);
            }
        } catch (error) {
            console.error("Error:", error);
            seal.replyToSender(ctx, msg, "请求失败，请稍后再试。");
        }
    } else if (command === "随机") {
        try {
            const response = await fetch(`${serverURL}/random-confirmed`);
            const data = await response.json();
            const qqname = await fetchQQName(data.qqNumber);

            const reply = `昵称: ${qqname}\nQQ: ${data.qqNumber}\n头像: [CQ:image,file=https://q2.qlogo.cn/headimg_dl?dst_uin=${data.qqNumber}&spec=5,cache=0]`;
            seal.replyToSender(ctx, msg, reply);
        } catch (error) {
            console.error("Error:", error);
            seal.replyToSender(ctx, msg, "请求失败");
        }
    } else if (command === "三连") {
        let replies = [];

        async function fetchRandomWithDelay(index) {
            return new Promise((resolve) => setTimeout(async () => {
                try {
                    const response = await fetch(`${serverURL}/random-confirmed`);
                    const data = await response.json();
                    const qqname = await fetchQQName(data.qqNumber);

                    const reply = `昵称: ${qqname}\nQQ: ${data.qqNumber}\n头像: [CQ:image,file=https://q2.qlogo.cn/headimg_dl?dst_uin=${data.qqNumber}&spec=5,cache=0]`;
                    replies.push(reply);
                    resolve();
                } catch (error) {
                    console.error("Error:", error);
                    const reply = `昵称: 未知\nQQ: ${data.qqNumber}\n头像: [CQ:image,file=https://q2.qlogo.cn/headimg_dl?dst_uin=${data.qqNumber}&spec=5,cache=0]`;
                    replies.push(reply);
                    resolve();
                }
            }, index * 10));
        }

        try {
            for (let i = 0; i < 3; i++) {
                await fetchRandomWithDelay(i);
            }
            seal.replyToSender(ctx, msg, replies.join("\n"));
        } catch (error) {
            console.error("Error:", error);
            seal.replyToSender(ctx, msg, "请求失败");
        }
    } else if (command === "十连") {
        let replies = [];

        async function fetchRandomWithDelay(index) {
            return new Promise((resolve) => setTimeout(async () => {
                try {
                    const response = await fetch(`${serverURL}/random-confirmed`);
                    const data = await response.json();
                    const qqname = await fetchQQName(data.qqNumber);

                    const reply = `昵称: ${qqname}\nQQ: ${data.qqNumber}`;
                    replies.push(reply);
                    resolve();
                } catch (error) {
                    console.error("Error:", error);
                    const reply = `昵称: 未知\nQQ: ${data.qqNumber}`;
                    replies.push(reply);
                    resolve();
                }
            }, index * 10));
        }

        try {
            const currentTime = new Date();
            if (RequestTracker.getLastRequestTime() && (currentTime - RequestTracker.getLastRequestTime()) < cooldownTime) {
                const timeLeft = Math.ceil((cooldownTime - (currentTime - RequestTracker.getLastRequestTime())) / 1000);
                seal.replyToSender(ctx, msg, `冷却中，请等待${timeLeft}秒后再试。`);
                return;
            }

            for (let i = 0; i < 10; i++) {
                await fetchRandomWithDelay(i);
            }

            RequestTracker.setLastRequestTime(currentTime);
            seal.replyToSender(ctx, msg, replies.join("\n"));
        } catch (error) {
            console.error("Error:", error);
            seal.replyToSender(ctx, msg, "请求失败");
        }
    } else if (command === "上报") {
        const qqNumber = cmdArgs.getArgN(2);
        if (!qqNumber) {
            seal.replyToSender(ctx, msg, "请提供 QQ 号码。");
            return;
        }

        try {
            // 检查QQ号码是否已存在
            const checkResponse = await fetch(`${serverURL}/query`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "app_id": appID
                },
                body: JSON.stringify({ qqNumber })
            });

            if (checkResponse.ok) {
                const checkResult = await checkResponse.json();
                if (checkResult.message.includes('已审核') || checkResult.message.includes('未审核')) {
                    console.log("QQ号码已上报:", qqNumber);
                    seal.replyToSender(ctx, msg, "QQ号码已上报,无需再次上报");
                    return;
                }
            }

            // 上报QQ号码
            const reportResponse = await fetch(`${serverURL}/report`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "app_id": appID
                },
                body: JSON.stringify({ qqNumber })
            });
            const data = await reportResponse.json();

            if (reportResponse.ok) {
                seal.replyToSender(ctx, msg, `${data.message || ""}`);
            } else {
                seal.replyToSender(ctx, msg, `上报失败: ${data.message || reportResponse.statusText}`);
            }
        } catch (error) {
            console.error("Error:", error);
            seal.replyToSender(ctx, msg, "上报请求失败，请稍后再试。");
        }
    } else if (command === "审核") {
        const confirmCode = cmdArgs.getArgN(2);
        if (!confirmCode) {
            seal.replyToSender(ctx, msg, "请提供确认码。");
            return;
        }

        try {
            const response = await fetch(`${serverURL}/confirm`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "app_id": appID
                },
                body: JSON.stringify({ confirmCode })
            });
            const data = await response.json();
            if (response.ok) {
                seal.replyToSender(ctx, msg, `确认成功: ${data.message}`);
            } else {
                seal.replyToSender(ctx, msg, `确认失败: ${data.message || response.statusText}`);
            }
        } catch (error) {
            console.error("Error:", error);
            seal.replyToSender(ctx, msg, "确认请求失败，请稍后再试。");
        }
    } else if (command === "移除") {
        const qqNumber = cmdArgs.getArgN(2);
        if (!qqNumber) {
            seal.replyToSender(ctx, msg, "请提供 QQ 号码。");
            return;
        }
        if (ctx.privilegeLevel < 100) {
            seal.replyToSender(ctx, msg, seal.formatTmpl(ctx, "核心:提示_无权限"));
            return seal.ext.cmddicefind(true);
        }
        try {
            const response = await fetch(`${serverURL}/remove`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "app_id": appID
                },
                body: JSON.stringify({ qqNumber })
            });
            const data = await response.json();
            if (response.ok) {
                seal.replyToSender(ctx, msg, `移除成功: ${data.message}`);
            } else {
                seal.replyToSender(ctx, msg, `移除失败: ${data.message || response.statusText}`);
            }
        } catch (error) {
            console.error("Error:", error);
            seal.replyToSender(ctx, msg, "移除请求失败，请稍后再试。");
        }
    } else if (command === "查询") {
        const qqNumber = cmdArgs.getArgN(2);
        if (!qqNumber) {
            seal.replyToSender(ctx, msg, "请提供 QQ 号码。");
            return;
        }
        try {
            const response = await fetch(`${serverURL}/query`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ qqNumber })
            });
            const data = await response.json();
            if (response.ok) {
                seal.replyToSender(ctx, msg, `${data.message || ""}`);
            } else {
                seal.replyToSender(ctx, msg, `查询失败: ${data.message || response.statusText}`);
            }
        } catch (error) {
            console.error("Error:", error);
            seal.replyToSender(ctx, msg, "查询请求失败，请稍后再试。");
        }
    }else if (command === "help") {
        seal.replyToSender(ctx, msg, "用法：\n.骰娘寻访 上报 <qqnumber> // 上报骰娘 QQ 号码\n.骰娘寻访 审核列表 // 列出所有未审核 QQ 号码和确认码\n.骰娘寻访 审核 <confirmCode> // 审核 QQ 号码\n.骰娘寻访 随机 // 随机寻访上报并被审核过的骰娘\n.骰娘寻访 三连 // 随机寻访三次上报并被审核过的骰娘\n.骰娘寻访 十连 // 随机寻访十次上报并被审核过的骰娘（注意冷却时间，否则服务器会炸）\n.骰娘寻访 移除 <qqnumber> // 移除 QQ 号码\n.骰娘寻访 查询 <qqnumber> // 查询骰娘状态");
      }else {seal.replyToSender(ctx, msg, "用法：\n.骰娘寻访 上报 <qqnumber> // 上报骰娘 QQ 号码\n.骰娘寻访 审核列表 // 列出所有未审核 QQ 号码和确认码\n.骰娘寻访 审核 <confirmCode> // 审核 QQ 号码\n.骰娘寻访 随机 // 随机寻访上报并被审核过的骰娘\n.骰娘寻访 三连 // 随机寻访三次上报并被审核过的骰娘\n.骰娘寻访 十连 // 随机寻访十次上报并被审核过的骰娘（注意冷却时间，否则服务器会炸）\n.骰娘寻访 移除 <qqnumber> // 移除 QQ 号码\n.骰娘寻访 查询 <qqnumber> // 查询骰娘状态");}
    };

ext.cmdMap['骰娘寻访'] = cmddicefind;

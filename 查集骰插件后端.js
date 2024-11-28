const express = require('express');
const mongoose = require('mongoose');
const axios = require('axios'); // 引入 axios 用于发送 HTTP 请求
const app = express();
const port = 8889;

// 自定义日志中间件
app.use((req, res, next) => {
    console.log(`${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })} ${req.method} ${req.url}`);
    next();
});

// 中间件：解析 JSON 数据
app.use(express.json());

// 连接 MongoDB 数据库
mongoose.connect('mongodb://localhost:27017/diceDatabase', { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('成功连接 MongoDB 数据库'))
    .catch(err => console.error('MongoDB 连接失败', err));

// 定义骰号 Schema 和模型
const diceSchema = new mongoose.Schema({
    dice_id: Number,
    alive: Boolean,
    lastReport: Date,
    reportMethod: String // 用于区分方法1和方法2
});

const Dice = mongoose.model('Dice', diceSchema);

// 存储通过外部请求获取的 uid 列表
let externalUids = [];

// 定时任务：每隔 1 分钟从外部 API 获取在线的 QQ 骰号 uid
setInterval(async () => {
    try {
        const response = await axios.get('https://dice.weizaima.com/dice/api/public-dice/list');
        const data = response.data;

        // 提取符合条件的 uid
        externalUids = data.items.flatMap(item => 
            item.endpoints
                .filter(endpoint => endpoint.platform === 'QQ' && endpoint.isOnline)
                .map(endpoint => parseInt(endpoint.uid.split(':')[1]))
        );

        console.log('更新外部在线骰号列表:', externalUids);
    } catch (err) {
        console.error('获取外部在线骰号列表失败', err);
    }
}, 60 * 1000); // 每 1 分钟执行一次

// 获取存活骰号列表
app.get('/api/get_alive_dice', async (req, res) => {
    try {
        const aliveDice = await Dice.find({ alive: true }).select('dice_id -_id');
        const aliveDiceIds = aliveDice.map(dice => dice.dice_id);

        // 将外部获取的 uid 拼接到结果中
        const allAliveDiceIds = [...aliveDiceIds, ...externalUids];

        res.json(allAliveDiceIds);
    } catch (err) {
        console.error("获取存活骰号列表失败", err);
        res.status(500).json({ message: '服务器错误' });
    }
});

// 方法1：上报骰号和存活状态（定期检查）
app.post('/api/report_alive_method1', async (req, res) => {
    const { dice_id } = req.body;
    try {
        let dice = await Dice.findOne({ dice_id });
        if (dice) {
            // 方法1上报，优先级高，直接覆盖所有方法2的记录
            dice.alive = true;
            dice.lastReport = new Date();
            dice.reportMethod = "method1"; // 标记为方法1上报
            await dice.save();
            res.json({ message: `骰号 ${dice_id} 上报成功 (方法1)` });
        } else {
            // 如果数据库中没有该记录，添加新的记录
            dice = new Dice({ dice_id, alive: true, lastReport: new Date(), reportMethod: "method1" });
            await dice.save();
            res.json({ message: `骰号 ${dice_id} 已添加并标记为存活 (方法1)` });
        }
        console.log(`骰号 ${dice_id} 上报成功 (方法1)`); 
    } catch (err) {
        console.error("方法1上报骰号失败", err);
        res.status(500).json({ message: '服务器错误' });
    }
});

// 方法2：上报骰号和存活状态（手动命令）
app.post('/api/report_alive_method2', async (req, res) => {
    const { dice_id, alive } = req.body;
    try {
        let dice = await Dice.findOne({ dice_id });
        if (dice) {
            console.log(`方法2上报：找到dice_id ${dice_id}，当前状态：alive=${dice.alive}, reportMethod=${dice.reportMethod}`);
            
            if (dice.reportMethod === "method1" && dice.alive && !alive) {
                console.log(`方法2上报：将 dice_id ${dice_id} 从存活标记为不存活`);
                dice.alive = false; // 覆盖方法1为不存活
                dice.lastReport = new Date();
                dice.reportMethod = "method2"; // 标记为方法2上报
                await dice.save();
                res.json({ message: `骰号 ${dice_id} 被方法2标记为不存活` });
            } else if (dice.reportMethod === "method1" && dice.alive && alive) {
                // 如果方法1标记为存活，方法2也标记为存活，则不做任何修改
                console.log(`方法2上报：方法1已经存活，方法2存活上报无效，跳过修改`);
                res.json({ message: `骰号 ${dice_id} 状态未更改 (方法2)，方法1优先` });
            } else {
                console.log(`方法2上报：更新 dice_id ${dice_id} 的存活状态为 ${alive}`);
                dice.alive = alive;
                dice.lastReport = new Date();
                dice.reportMethod = "method2";
                await dice.save();
                res.json({ message: `骰号 ${dice_id} 存活状态更新为 ${alive ? '存活' : '不存活'} (方法2)` });
            }
        } else {
            console.log(`方法2上报：新添加 dice_id ${dice_id}`);
            dice = new Dice({ dice_id, alive, lastReport: new Date(), reportMethod: "method2" });
            await dice.save();
            res.json({ message: `骰号 ${dice_id} 已添加并存活状态为 ${alive ? '存活' : '不存活'} (方法2)` });
        }
    } catch (err) {
        console.error("方法2上报骰号失败", err);
        res.status(500).json({ message: '服务器错误' });
    }
});

// 移除骰号
app.post('/api/remove_dice', async (req, res) => {
    const { dice_id } = req.body;
    try {
        await Dice.deleteOne({ dice_id });
        res.json({ message: `骰号 ${dice_id} 已移除` });
        console.log(`骰号 ${dice_id} 已移除`); 
    } catch (err) {
        console.error("移除骰号失败", err);
        res.status(500).json({ message: '服务器错误' });
    }
});

// 定时任务：每隔 25 小时检查未上报的骰号（仅对方法1上报的进行处理）
setInterval(async () => {
    const inactiveThreshold = 25 * 60 * 60 * 1000; // 25小时
    const now = new Date();

    try {
        const diceToDeactivate = await Dice.find({ alive: true, reportMethod: 'method1', lastReport: { $lt: new Date(now - inactiveThreshold) } });

        diceToDeactivate.forEach(async (dice) => {
            dice.alive = false;
            await dice.save();
            console.log(`骰号 ${dice.dice_id} 超过25小时未上报，已标记为不存活（方法1）`);
        });

    } catch (err) {
        console.error("检查并标记不活跃骰号失败", err);
    }
}, 25 * 60 * 60 * 1000); // 每 25 小时执行一次

// 启动服务器
app.listen(port, () => {
    console.log(`服务器运行在端口 ${port}`);
});
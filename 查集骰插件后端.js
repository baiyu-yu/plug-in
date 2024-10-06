const express = require('express');
const mongoose = require('mongoose');
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

// 获取存活骰号列表
app.get('/api/get_alive_dice', async (req, res) => {
    try {
        const aliveDice = await Dice.find({ alive: true }).select('dice_id -_id');
        res.json(aliveDice.map(dice => dice.dice_id));
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
            dice.alive = true;
            dice.lastReport = new Date();
            dice.reportMethod = "method1"; // 标记为方法1上报
            await dice.save();
            res.json({ message: `骰号 ${dice_id} 上报成功 (方法1)` });
        } else {
            dice = new Dice({ dice_id, alive: true, lastReport: new Date(), reportMethod: "method1" });
            await dice.save();
            res.json({ message: `骰号 ${dice_id} 已添加并标记为存活 (方法1)` });
        }
        console.log(`骰号 ${dice_id} 上报成功 (方法1)`); // 可以考虑移到统一的地方记录
    } catch (err) {
        console.error("方法1上报骰号失败", err);
        res.status(500).json({ message: '服务器错误' });
    }
});

// 方法2：上报骰号和存活状态（手动命令）
app.post('/api/report_dice_method2', async (req, res) => {
    const { dice_id, alive } = req.body;
    try {
        let dice = await Dice.findOne({ dice_id });
        if (dice) {
            dice.alive = alive;
            dice.lastReport = new Date();
            dice.reportMethod = "method2"; // 标记为方法2上报
            await dice.save();
            res.json({ message: `骰号 ${dice_id} 存活状态更新为 ${alive ? '存活' : '不存活'} (方法2)` });
        } else {
            dice = new Dice({ dice_id, alive, lastReport: new Date(), reportMethod: "method2" });
            await dice.save();
            res.json({ message: `骰号 ${dice_id} 已添加并存活状态为 ${alive ? '存活' : '不存活'} (方法2)` });
        }
        console.log(`骰号 ${dice_id} 上报成功 (方法2)`); // 同上
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
        console.log(`骰号 ${dice_id} 已移除`); // 同上
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

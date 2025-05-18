const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const app = express();
const port = 3518;
const mongoUri = 'mongodb://localhost:27017/qq_numbers';

// 假设的有效appid
const validAppID = '';

// Appid验证函数
function isValidAppId(requestAppId) {
    console.log(`正在验证 appId: ${requestAppId}`); // 添加日志记录验证appid的过程
    return requestAppId === validAppID;
}

// 连接MongoDB数据库
mongoose.connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('成功连接到 MongoDB'))
    .catch(err => console.error('无法连接到 MongoDB', err));

// 定义QQ号码的Schema
const qqSchema = new mongoose.Schema({
    qqNumber: { type: String, unique: true, index: true }, // QQ号码，唯一且建立索引
    avatarUrl: String, // 头像URL
    confirmCode: String, // 确认码
    confirmed: { type: Boolean, default: false, index: true }, // 是否已确认，默认为false，并建立索引
});

const QQNumber = mongoose.model('QQNumber', qqSchema);

app.use(bodyParser.json());

let externalUids = []; // 存储外部在线骰号的数组

// 定时任务：每分钟从外部API获取在线骰号并更新到数据库
setInterval(async () => {
    try {
        const response = await axios.get('https://dice.weizaima.com/dice/api/public-dice/list');
        const data = response.data;

        // 提取符合条件的 uid (QQ平台且在线)
        externalUids = data.items.flatMap(item =>
            item.endpoints
                .filter(endpoint => endpoint.platform === 'QQ' && endpoint.isOnline)
                .map(endpoint => parseInt(endpoint.uid.split(':')[1])) // 提取QQ号部分
        );

        console.log('更新的外部在线骰号列表:', externalUids);

        // 将外部在线骰号加入到总表中
        for (const qqNumber of externalUids) {
            if (String(qqNumber).length > 15) {
                console.log(`外部骰号 ${qqNumber} 因长度超过15位而被忽略`);
                continue;
            }
            const existingRecord = await QQNumber.findOne({ qqNumber: String(qqNumber) });
            if (!existingRecord) {
                const newQQ = new QQNumber({
                    qqNumber: String(qqNumber),
                    confirmed: true 
                });
                await newQQ.save();
                console.log(`新增外部在线骰号: ${qqNumber}`);
            }
        }
    } catch (err) {
        console.error('获取外部在线骰号列表失败', err);
    }
}, 60 * 1000); // 每60秒执行一次

const logRequest = (method, path, message) => {
    console.log(`[${method}] ${path}: ${message}`);
};

// 上报QQ号码接口
app.post('/report', async (req, res) => {
    const { qqNumber, app_id } = req.body;

    if (!qqNumber) {
        return res.status(400).json({ message: 'QQ号码不能为空' });
    }
    if (String(qqNumber).length > 15) {
        return res.status(400).json({ message: 'QQ号码长度不能超过15位' });
    }

    logRequest('POST', '/report', `收到上报请求，QQ号: ${qqNumber}, app_id: ${app_id}`);
    try {
        const confirmCode = uuidv4();
        
        const confirmed = isValidAppId(app_id);
        
        const newQQ = new QQNumber({ qqNumber: String(qqNumber), confirmCode, confirmed });
        await newQQ.save();
        
        res.json({ message: confirmed ? '已成功加入寻访池' : '已上报，等待核验', confirmCode });
    } catch (err) {
        if (err.code === 11000) { 
            logRequest('ERROR', '/report', `QQ号码 ${qqNumber} 已存在`);
            return res.status(409).json({ message: `QQ号码 ${qqNumber} 已存在，请勿重复上报` });
        }
        console.error('上报接口错误:', err);
        res.status(500).json({ message: '服务器内部错误，上报失败' });
    }
});

// 确认QQ号码接口
app.post('/confirm', async (req, res) => {
    const { confirmCode } = req.body;
    const appId = req.headers.app_id; 

    logRequest('POST', '/confirm', `收到确认请求，确认码: ${confirmCode}`);

    if (!isValidAppId(appId)) {
        logRequest('ERROR', '/confirm', `无效的 app_id: ${appId}`);
        return res.status(401).json({ message: '无效的 app_id，无权限操作' });
    }

    if (!confirmCode) {
        return res.status(400).json({ message: '确认码不能为空' });
    }

    try {
        const qqRecord = await QQNumber.findOne({ confirmCode });

        if (qqRecord) {
            if (qqRecord.confirmed) {
                logRequest('INFO', '/confirm', `骰娘 ${qqRecord.qqNumber} 已被确认上报`);
                res.json({ message: '该骰娘已被确认上报，无需重复操作' });
            } else {
                qqRecord.confirmed = true;
                await qqRecord.save();
                logRequest('SUCCESS', '/confirm', `确认码 ${confirmCode} 对应的骰娘 ${qqRecord.qqNumber} 确认成功`);
                res.json({ message: '确认成功' });
            }
        } else {
            logRequest('WARN', '/confirm', `无效的确认码: ${confirmCode}`);
            res.status(400).json({ message: '确认码无效或已过期' });
        }
    } catch (err) {
        logRequest('ERROR', '/confirm', `确认操作时发生错误: ${err.message}`);
        res.status(500).json({ message: '服务器内部错误，确认失败' });
    }
});

// 批量查询未审核QQ号码接口
app.get('/unverified-list', async (req, res) => {
    const appId = req.headers.app_id;
    logRequest('GET', '/unverified-list', `收到查询未审核列表请求, app_id: ${appId}`);

    if (!isValidAppId(appId)) {
        logRequest('ERROR', '/unverified-list', `无效的 app_id: ${appId}`);
        return res.status(401).json({ message: '无效的 app_id，无权限操作' });
    }
    try {
        const unverifiedQQNumbers = await QQNumber.find({ confirmed: false }, 'qqNumber confirmCode').lean();
        if (unverifiedQQNumbers.length > 0) {
            const responseList = unverifiedQQNumbers.map(item => ({
                qqNumber: item.qqNumber,
                confirmCode: item.confirmCode
            }));
            res.status(200).json(responseList);
        } else {
            res.status(200).json({ message: "当前没有待审核的QQ号码。" });
        }
    } catch (err) {
        logRequest('ERROR', '/unverified-list', `获取未审核QQ列表时发生错误: ${err.message}`);
        res.status(500).json({ message: '服务器内部错误，获取列表失败' });
    }
});

// 移除QQ号码接口
app.post('/remove', async (req, res) => {
    const { qqNumber } = req.body;
    const appId = req.headers.app_id;
    
    logRequest('POST', '/remove', `收到移除请求，QQ号: ${qqNumber}, app_id: ${appId}`);

    if (!isValidAppId(appId)) {
        logRequest('ERROR', '/remove', `无效的 app_id: ${appId}`);
        return res.status(401).json({ message: '无效的 app_id，无权限操作' });
    }

    if (!qqNumber) {
        return res.status(400).json({ message: 'QQ号码不能为空' });
    }
    
    try {
        const qqRecord = await QQNumber.findOneAndDelete({ qqNumber: String(qqNumber) });
        
        if (qqRecord) {
            logRequest('SUCCESS', '/remove', `成功移除QQ号码: ${qqNumber}`);
            res.json({ message: '移除成功' });
        } else {
            logRequest('WARN', '/remove', `尝试移除但未找到QQ号码: ${qqNumber}`);
            res.status(404).json({ message: 'QQ号码不存在于寻访池中' });
        }
    } catch (err) {
        logRequest('ERROR', '/remove', `移除操作时发生错误: ${err.message}`);
        res.status(500).json({ message: '服务器内部错误，移除失败' });
    }
});

// 随机获取已确认的QQ号码接口
app.get('/random-confirmed', async (req, res) => {
    logRequest('GET', '/random-confirmed', '收到随机获取已确认QQ请求');
    try {
        let attempts = 0;
        const maxAttempts = 10; 

        while (attempts < maxAttempts) {
            const randomQQs = await QQNumber.aggregate([
                { $match: { confirmed: true } },
                { $sample: { size: 1 } } 
            ]);

            if (randomQQs.length === 0) {
                logRequest('INFO', '/random-confirmed', '寻访池中暂时没有已确认的骰娘');
                return res.status(404).json({ message: '寻访池里暂时没有骰娘哦' });
            }
            
            const randomQQ = randomQQs[0]; 

            // 检查QQ号码长度是否超过15位
            if (randomQQ && randomQQ.qqNumber && randomQQ.qqNumber.length <= 15) {
                const avatarUrl = `[CQ:image,file=http://q2.qlogo.cn/headimg_dl?bs=qq&dst_uin=${randomQQ.qqNumber}&spec=100,cache=0]`;
                logRequest('SUCCESS', '/random-confirmed', `成功获取随机QQ: ${randomQQ.qqNumber}`);
                return res.json({
                    qqNumber: randomQQ.qqNumber,
                    avatarUrl: avatarUrl
                });
            } else if (randomQQ && randomQQ.qqNumber) {
                logRequest('INFO', '/random-confirmed', `随机获取到的QQ号 ${randomQQ.qqNumber} 长度超过15位，尝试重新获取`);
            }
            
            attempts++;
        }

        logRequest('WARN', '/random-confirmed', `尝试 ${maxAttempts} 次后未能选取到符合长度要求的随机QQ号`);
        res.status(500).json({ message: `尝试 ${maxAttempts} 次后，未能选取到符合长度要求的随机QQ号` });

    } catch (err) {
        logRequest('ERROR', '/random-confirmed', `获取随机已确认QQ号时发生错误: ${err.message}`);
        res.status(500).json({ message: '服务器内部错误，获取随机QQ号失败' });
    }
});

// 查询指定QQ号码状态接口
app.post('/query', async (req, res) => {
    const { qqNumber } = req.body;
    logRequest('POST', '/query', `收到查询请求，QQ号: ${qqNumber}`);

    if (!qqNumber) {
        return res.status(400).json({ message: 'QQ号码不能为空' });
    }

    try {
        const qqRecord = await QQNumber.findOne({ qqNumber: String(qqNumber) }).lean();
        if (qqRecord) {
            res.json({
                message: `QQ号码 ${qqNumber} 的状态为：${qqRecord.confirmed ? '已审核' : '未审核'}`
            });
        } else {
            res.status(404).json({ message: '未找到该QQ号码的记录' });
        }
    } catch (err) {
        logRequest('ERROR', '/query', `查询QQ号 ${qqNumber} 时发生错误: ${err.message}`);
        res.status(500).json({ message: '服务器内部错误，查询失败' });
    }
});

app.listen(port, () => {
    console.log(`服务器正在端口 ${port} 上运行`);
});

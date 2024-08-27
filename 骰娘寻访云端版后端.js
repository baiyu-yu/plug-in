const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');
const app = express();
const port = 3518;
const mongoUri = 'mongodb://localhost:27017/qq_numbers';

// 假设定有效的appid
const validAppID = '';

// Appid验证函数
function isValidAppId(requestAppId) {
    console.log(`Validating appId: ${requestAppId}`); // 添加日志记录验证appid的过程
    return requestAppId === validAppID;
}

// 连接MongoDB数据库
mongoose.connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('Could not connect to MongoDB', err));

const qqSchema = new mongoose.Schema({
    qqNumber: { type: String, unique: true }, // 添加唯一索引避免重复
    avatarUrl: String,
    confirmCode: String,
    confirmed: { type: Boolean, default: false },
});

const QQNumber = mongoose.model('QQNumber', qqSchema);

app.use(bodyParser.json());

// 日志功能
const logRequest = (method, path, message) => {
    console.log(`[${method}] ${path}: ${message}`);
};

// 报告逻辑
app.post('/report', async (req, res) => {
    const { qqNumber, app_id } = req.body;
    try {
        // 生成唯一确认码
        const confirmCode = uuidv4();
        
        // 根据appID有效性决定confirmed的值
        const confirmed = isValidAppId(app_id);
        
        // 将确认码和QQ号码一起保存
        const newQQ = new QQNumber({ qqNumber, confirmCode, confirmed });
        await newQQ.save();
        
        // 返回确认码和状态信息
        res.json({ message: confirmed ? '已加入寻访池' : '已上报等待核验', confirmCode });
    } catch (err) {
        console.error('Error:', err);
        res.status(500).json({ message: '服务器内部错误' });
    }
});

// 确认逻辑
app.post('/confirm', async (req, res) => {
    console.log("Received a request at /confirm");
    const { confirmCode } = req.body;
    const appId = req.headers.app_id;

  logRequest('POST', '/confirm', `Received confirmation request with code: ${confirmCode}`);

  if (!isValidAppId(appId)) {
      logRequest('ERROR', '/confirm', `Invalid appId received: ${appId}`);
      return res.status(401).json({ message: '无效的appid' });
  }

  try {
      const qqRecord = await QQNumber.findOne({ confirmCode });

      if (qqRecord) {
          if (qqRecord.confirmed) {
              logRequest('ACTION', '/confirm', 'Dice girl already confirmed');
              res.json({ message: '骰娘已被确认上报' });
          } else {
              qqRecord.confirmed = true;
              await qqRecord.save();
              logRequest('ACTION', '/confirm', `Confirmation successful for code: ${confirmCode}`);
              res.json({ message: '确认成功' });
          }
      } else {
          logRequest('ACTION', '/confirm', 'Invalid confirmation code');
          res.status(400).json({ message: '确认码无效' });
      }
  } catch (err) {
      logRequest('ERROR', '/confirm', `Error confirming: ${err.message}`);
      res.status(500).json({ message: '服务器内部错误' });
  }
});

// 批量查询未审核QQ号码接口
app.get('/unverified-list', async (req, res) => {
    const appId = req.headers.app_id; // 获取请求中的appID进行鉴权
    if (!isValidAppId(appId)) {
        logRequest('ERROR', '/unverified-list', `Invalid appId received: ${appId}`);
        return res.status(401).json({ message: '无效的appid' });
    }
    try {
        // 直接使用QQNumber模型查询所有confirmed为false的QQ号码
        const unverifiedQQNumbers = await QQNumber.find({ confirmed: false }, 'qqNumber confirmCode');
        if (unverifiedQQNumbers.length > 0) {
            // 构造响应数据
            const responseList = unverifiedQQNumbers.map(item => ({
                qqNumber: item.qqNumber,
                confirmCode: item.confirmCode
            }));
            res.status(200).json(responseList);
        } else {
            res.status(200).json({ message: "没有待审核的QQ号码。" });
        }
    } catch (err) {
        logRequest('ERROR', '/unverified-list', `Error fetching unverified QQ numbers: ${err.message}`);
        res.status(500).json({ message: '服务器内部错误' });
    }
});

// 移除逻辑
app.post('/remove', async (req, res) => {
    console.log("Received a request at /remove");
    const { qqNumber } = req.body;
    const appId = req.headers.app_id;
    
    // 验证appId有效性
    if (!isValidAppId(appId)) {
        logRequest('ERROR', '/remove', `Invalid appId received: ${appId}`);
        return res.status(401).json({ message: '无效的appid' });
    }
    
    logRequest('POST', '/remove', `Remove request received for QQ Number: ${qqNumber}`);
    try {
        const qqRecord = await QQNumber.findOneAndDelete({ qqNumber });
        
        if (qqRecord) {
            logRequest('ACTION', '/remove', `Successfully removed QQ Number: ${qqNumber}`);
            res.json({ message: '移除成功' });
            // 实现通知逻辑时，这里也可以添加日志
        } else {
            logRequest('ACTION', '/remove', `QQ Number not found: ${qqNumber}`);
            res.status(400).json({ message: 'QQ号码不存在' });
        }
    } catch (err) {
        logRequest('ERROR', '/remove', `Error removing: ${err.message}`);
        res.status(500).json({ message: '服务器内部错误' });
    }
});

// 随机获取
app.get('/random-confirmed', async (req, res) => {
    try {
        const count = await QQNumber.countDocuments({ confirmed: true });
        if (count === 0) {
            return res.status(404).json({ message: '寻访池里暂时没有骰娘哦' });
        }
        const randomIndex = Math.floor(Math.random() * count);
        const randomQQ = await QQNumber.findOne({ confirmed: true }).skip(randomIndex);
        if (randomQQ) {
            const avatarUrl = `[CQ:image,file=http://q2.qlogo.cn/headimg_dl?bs=qq&dst_uin=${randomQQ.qqNumber}&spec=100,cache=0]`;
            res.json({
                qqNumber: randomQQ.qqNumber,
                avatarUrl: avatarUrl
            });
        } else {
            res.status(500).json({ message: '选取随机QQ号失败' });
        }
    } catch (err) {
        console.error('Error fetching random confirmed QQ Number:', err);
        res.status(500).json({ message: '服务器内部错误' });
    }
});

// 新增查询逻辑
app.post('/query', async (req, res) => {
    try {
        const { qqNumber } = req.body;
        const qqRecord = await QQNumber.findOne({ qqNumber });
        if (qqRecord) {
            res.json({
                message: `QQ号码 ${qqNumber} 的状态为：${qqRecord.confirmed ? '已审核' : '未审核'}`
            });
        } else {
            res.status(404).json({ message: '未找到该QQ号码的记录' });
        }
    } catch (err) {
        console.error('Error in /query:', err);
        res.status(500).json({ message: '服务器内部错误' });
    }
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});

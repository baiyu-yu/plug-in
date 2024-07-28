const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const mongoose = require('mongoose');
const app = express();
app.use(bodyParser.json());
app.use(cors());

// MongoDB连接字符串
const dbUri = 'mongodb://localhost:27017/trpg_announcements';

// 连接MongoDB
mongoose.connect(dbUri, { useNewUrlParser: true, useUnifiedTopology: true })
.then(() => console.log('MongoDB connected'))
.catch(err => console.error('MongoDB connection error:', err));

// 定义模型
const GroupSchema = new mongoose.Schema({
    content: String,
    userId: String,
    timestamp: Number,
    groupName: String
});
const Group = mongoose.model('Group', GroupSchema);

// 添加新公告
app.post('/addGroup', async (req, res) => {
    console.log('Received POST request to addGroup');
    console.log('Request body:', req.body);
    try {
        const group = new Group(req.body);
        await group.save();
        console.log('Group added successfully');
        res.json({ success: true });
    } catch (error) {
        console.error('Error adding group:', error);
        res.status(500).json({ error: 'An error occurred while adding the group.' });
    }
});

// 列出所有公告
app.get('/listGroups', async (req, res) => {
    console.log('Received GET request to listGroups');
    try {
        const groups = await Group.find();
        console.log('Groups listed:', groups);
        res.json(groups);
    } catch (error) {
        console.error('Error listing groups:', error);
        res.status(500).json({ error: 'An error occurred while listing groups.' });
    }
});

// 显示指定公告
app.get('/showGroup/:query', async (req, res) => {
    console.log('Received GET request to showGroup');
    console.log('Query parameter:', req.params.query);
    try {
        const query = req.params.query;
        let group = null;
        if (isNaN(query)) {
            group = await Group.findOne({ groupName: query });
        } else {
            const index = parseInt(query) - 1;
            const groups = await Group.find();
            group = groups[index] || null;
        }
        console.log('Group found:', group);
        res.json(group);
    } catch (error) {
        console.error('Error showing group:', error);
        res.status(500).json({ error: 'An error occurred while fetching the group.' });
    }
});

// 列出指定用户的所有公告
app.get('/listUserGroups/:userId', async (req, res) => {
    console.log('Received GET request to listUserGroups');
    console.log('User ID:', req.params.userId);
    try {
        const userId = req.params.userId;
        const userGroups = await Group.find({ userId: userId });
        console.log('User groups listed:', userGroups);
        res.json(userGroups);
    } catch (error) {
        console.error('Error listing user groups:', error);
        res.status(500).json({ error: 'An error occurred while listing user groups.' });
    }
});

// 删除指定用户的特定公告
app.delete('/removeGroup/:userId/:query', async (req, res) => {
    console.log('Received DELETE request to removeGroup');
    console.log('User ID and query:', req.params);
    try {
        const { userId, query } = req.params;
        let removed = false;
        let userGroups = await Group.find({ userId });

        if (isNaN(query)) {
            const result = await Group.findOneAndDelete({ userId, groupName: query });
            removed = !!result;
        } else {
            const index = parseInt(query) - 1;
            if (index >= 0 && index < userGroups.length) {
                const userGroup = userGroups[index];
                if (userGroup) {
                    const result = await Group.deleteOne({ _id: userGroup._id });
                    removed = !!result.deletedCount;
                }
            }
        }
        console.log('Group removal result:', removed);
        res.json({ success: removed });
    } catch (error) {
        console.error('Error removing group:', error);
        res.status(500).json({ error: 'An error occurred while removing the group.' });
    }
});

// 删除指定用户的所有公告
app.delete('/removeAllGroups/:userId', async (req, res) => {
    console.log('Received DELETE request to removeAllGroups');
    console.log('User ID:', req.params.userId);
    try {
        const userId = req.params.userId;
        const result = await Group.deleteMany({ userId });
        console.log('All user groups removed');
        res.json({ success: true });
    } catch (error) {
        console.error('Error removing all groups:', error);
        res.status(500).json({ error: 'An error occurred while removing all groups.' });
    }
});

// 管理员删除公告
app.delete('/adminRemoveGroup/:query', async (req, res) => {
    console.log('Received DELETE request to adminRemoveGroup');
    console.log('Query parameter:', req.params.query);
    try {
        const query = req.params.query;
        let removed = false;
        let groups = await Group.find();

        if (isNaN(query)) {
            const result = await Group.findOneAndDelete({ groupName: query });
            removed = !!result;
        } else {
            const index = parseInt(query) - 1;
            if (index >= 0 && index < groups.length) {
                const group = groups[index];
                if (group) {
                    const result = await Group.deleteOne({ _id: group._id });
                    removed = !!result.deletedCount;
                }
            }
        }
        console.log('Admin group removal result:', removed);
        res.json({ success: removed });
    } catch (error) {
        console.error('Error removing group as admin:', error);
        res.status(500).json({ error: 'An error occurred while removing the group as admin.' });
    }
});

// 启动服务器
const port = 3520;
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
// ==UserScript==
// @name         Random Chat Logger
// @author       白鱼 
// @version      1.5.0
// @description  随机记录群友发言。使用.chatlog help 查看帮助。\n！！！如果输出角色卡相关指令请先确保在该群【.ext randomChatLogger on】！！！\n不推荐进行版本回退\n性能优化由claude完成\nv1.5.0: 性能优化 - 实现分块存储和按需加载，启动时不再全量读取数据到内存，尝试降低内存占用和启动时间\nv1.4.0: 性能优化 - 添加批量写入、队列大小限制，重构时间戳和状态存储，尝试解决OOM和高频磁盘写入问题\nv1.3.0: 添加抓取图片持久化功能，添加群随机记录共享房间功能，添加当前群设置状态查看命令chatlog status \nv1.2.2: 修改为抓取时过滤正则，防止产生空消息 \n v1.2.1: 允许群内关闭前缀 \n v1.2.0:添加更多群内设置，允许群内清除记录，logon自动暂停发送，调整数据库结构
// @timestamp    1763728841
// @license      MIT
// @homepageURL  https://github.com/sealdice/javascript
// @updateUrl    https://raw.githubusercontent.com/baiyu-yu/plug-in/main/randomchatlog.js
// @sealVersion  1.4.5
// ==/UserScript==

if (!seal.ext.find('randomChatLogger')) {
    const ext = seal.ext.new('randomChatLogger', 'baiyu', '1.5.0');
    seal.ext.register(ext);

    const CONFIG = {
        MSG_ON: "开启记录回复语",
        MSG_OFF: "关闭记录回复语",
        REC_FREQ: "记录频率（秒）",
        SEND_FREQ: "发送频率（秒）",
        PREFIX: "消息前缀",
        REGEX: "消息内容正则过滤",
        CATCH_IMAGES: "是否允许抓取图片",
        BASE64BACKEND: "图片Base64转换后端",
        SHARED_ROOM: "是否开启共享群记录库功能",
        MAX_QUEUE_SIZE: "单群最大记录数",
        BATCH_WRITE_INTERVAL: "批量写入间隔（秒）"
    };

    seal.ext.registerStringConfig(ext, CONFIG.MSG_ON, "记录已开启");
    seal.ext.registerStringConfig(ext, CONFIG.MSG_OFF, "记录已关闭");
    seal.ext.registerStringConfig(ext, CONFIG.REC_FREQ, "60");
    seal.ext.registerStringConfig(ext, CONFIG.SEND_FREQ, "300");
    seal.ext.registerStringConfig(ext, CONFIG.PREFIX, "随机记录: ");
    seal.ext.registerTemplateConfig(ext, CONFIG.REGEX, [
        "\\[CQ:at,qq=[^\\]]*\\]",
        "\\[CQ:reply,id=[^\\]]*\\]",
        "\\[CQ:image,[^\\]]*\\]"
    ], "替换匹配到的文本为空字符串");
    seal.ext.registerBoolConfig(ext, CONFIG.CATCH_IMAGES, false, "开启后会允许将抓取的图片存入本地持久化储存，每个群需要需要单独开关，移动端和远程分离部署暂时无法使用");
    seal.ext.registerStringConfig(ext, CONFIG.BASE64BACKEND, "https://urltobase64.fishwhite.top", "开启抓取图片后必须配置该地址，中央服务不保证长久，坏了可自部署");
    seal.ext.registerBoolConfig(ext, CONFIG.SHARED_ROOM, false, "开启后允许加入同一房间的群组/私聊共享群记录库，随机抽取时可以抽取所有加入该房间的群记录");
    seal.ext.registerStringConfig(ext, CONFIG.MAX_QUEUE_SIZE, "100", "单个群最大记录数，超过后会删除最旧的记录，防止数据膨胀");
    seal.ext.registerStringConfig(ext, CONFIG.BATCH_WRITE_INTERVAL, "300", "批量写入间隔秒数，减少磁盘写入频率");

    // 生成 UUID
    function generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            const r = (Math.random() * 16) | 0;
            const v = c === 'x' ? r : (r & 0x3) | 0x8;
            return v.toString(16);
        });
    }

    // 共享群记录库的房间管理
    class RoomManager {
        static getRooms() {
            try {
                const data = ext.storageGet('chatlogRooms');
                return data ? JSON.parse(data) : {};
            } catch (e) { return {}; }
        }

        static saveRooms(rooms) {
            ext.storageSet('chatlogRooms', JSON.stringify(rooms));
        }

        static create(name, creatorId) {
            const rooms = this.getRooms();
            const code = generateUUID();
            rooms[code] = {
                name: name,
                code: code,
                creatorId: creatorId,
                members: [creatorId]
            };
            this.saveRooms(rooms);
            return code;
        }

        static join(code, memberId) {
            const rooms = this.getRooms();
            const room = rooms[code];
            if (!room) return { success: false, msg: "房间不存在" };
            if (room.members.includes(memberId)) return { success: false, msg: "已在房间中" };
            
            room.members.push(memberId);
            this.saveRooms(rooms);
            return { success: true, roomName: room.name };
        }

        static quit(memberId, roomName) {
            const rooms = this.getRooms();
            const quitRooms = [];
            for (const code in rooms) {
                const room = rooms[code];
                if (room.members.includes(memberId) && (!roomName || room.name === roomName)) {
                    if (room.creatorId === memberId) {
                        delete rooms[code];
                        quitRooms.push({ name: room.name, action: "解散" });
                    } else {
                        room.members = room.members.filter(m => m !== memberId);
                        quitRooms.push({ name: room.name, action: "退出" });
                    }
                }
            }
            this.saveRooms(rooms);
            return quitRooms;
        }

        static getMemberRooms(memberId) {
            const rooms = this.getRooms();
            const result = [];
            for (const code in rooms) {
                if (rooms[code].members.includes(memberId)) {
                    result.push(rooms[code]);
                }
            }
            return result;
        }

        static list(memberId) {
            const rooms = this.getMemberRooms(memberId);
            return rooms.map(r => `【${r.name}】${r.creatorId === memberId ? "(房主)" : ""} 代码: ${r.code}`);
        }
    }

    class DataManager {
        static CHUNK_SIZE = 50; // 每个块存储50条记录
        static indexCache = {}; // 缓存索引信息
        static chunkCache = {}; // 缓存最近访问的块
        static pendingWrites = new Map(); // 待写入的块
        static batchWriteTimer = null;

        // 获取队列索引（轻量级元数据）
        static getIndex(id) {
            if (this.indexCache[id]) {
                return this.indexCache[id];
            }
            try {
                const data = ext.storageGet(`logIndex_${id}`);
                const index = data ? JSON.parse(data) : { total: 0, chunks: 0 };
                this.indexCache[id] = index;
                return index;
            } catch (e) {
                return { total: 0, chunks: 0 };
            }
        }

        // 保存索引
        static saveIndex(id, index) {
            this.indexCache[id] = index;
            ext.storageSet(`logIndex_${id}`, JSON.stringify(index));
        }

        // 获取指定块
        static getChunk(id, chunkIndex) {
            const cacheKey = `${id}_${chunkIndex}`;
            if (this.chunkCache[cacheKey]) {
                return this.chunkCache[cacheKey];
            }
            try {
                const data = ext.storageGet(`logChunk_${id}_${chunkIndex}`);
                const chunk = data ? JSON.parse(data) : [];
                this.chunkCache[cacheKey] = chunk;
                return chunk;
            } catch (e) {
                return [];
            }
        }

        // 保存块（延迟写入）
        static saveChunk(id, chunkIndex, chunk) {
            const cacheKey = `${id}_${chunkIndex}`;
            this.chunkCache[cacheKey] = chunk;
            this.pendingWrites.set(cacheKey, { id, chunkIndex, chunk });
            this.scheduleBatchWrite();
        }

        // 添加记录（按需加载最后一个块）
        static addRecord(id, record, maxSize) {
            const index = this.getIndex(id);
            
            // 检查是否需要删除旧记录
            if (index.total >= maxSize) {
                this.removeOldestRecord(id, index);
            }

            // 计算应该写入哪个块
            const targetChunk = Math.floor(index.total / this.CHUNK_SIZE);
            const chunk = this.getChunk(id, targetChunk);
            
            chunk.push(record);
            this.saveChunk(id, targetChunk, chunk);
            
            index.total++;
            index.chunks = Math.ceil(index.total / this.CHUNK_SIZE);
            this.saveIndex(id, index);
        }

        // 删除最旧的记录
        static removeOldestRecord(id, index) {
            if (index.total === 0) return;
            
            const firstChunk = this.getChunk(id, 0);
            if (firstChunk.length > 0) {
                firstChunk.shift();
                this.saveChunk(id, 0, firstChunk);
                index.total--;
                
                // 如果第一个块空了，需要重新整理
                if (firstChunk.length === 0 && index.chunks > 1) {
                    this.compactChunks(id, index);
                }
            }
        }

        // 整理块（删除空块，重新编号）
        static compactChunks(id, index) {
            const allRecords = [];
            for (let i = 0; i < index.chunks; i++) {
                const chunk = this.getChunk(id, i);
                allRecords.push(...chunk);
                // 清理旧块
                ext.storageSet(`logChunk_${id}_${i}`, "");
                delete this.chunkCache[`${id}_${i}`];
            }
            
            // 重新分块存储
            const newChunks = Math.ceil(allRecords.length / this.CHUNK_SIZE);
            for (let i = 0; i < newChunks; i++) {
                const start = i * this.CHUNK_SIZE;
                const chunk = allRecords.slice(start, start + this.CHUNK_SIZE);
                this.saveChunk(id, i, chunk);
            }
            
            index.total = allRecords.length;
            index.chunks = newChunks;
            this.saveIndex(id, index);
        }

        // 随机获取一条记录（只读取一个块）
        static getRandomRecord(id) {
            const index = this.getIndex(id);
            if (index.total === 0) return null;
            
            const randomPos = Math.floor(Math.random() * index.total);
            const chunkIndex = Math.floor(randomPos / this.CHUNK_SIZE);
            const posInChunk = randomPos % this.CHUNK_SIZE;
            
            const chunk = this.getChunk(id, chunkIndex);
            return chunk[posInChunk] || null;
        }

        // 删除随机记录
        static removeRandomRecord(id) {
            const index = this.getIndex(id);
            if (index.total === 0) return null;
            
            const randomPos = Math.floor(Math.random() * index.total);
            const chunkIndex = Math.floor(randomPos / this.CHUNK_SIZE);
            const posInChunk = randomPos % this.CHUNK_SIZE;
            
            const chunk = this.getChunk(id, chunkIndex);
            if (!chunk[posInChunk]) return null;
            
            const record = chunk[posInChunk];
            chunk.splice(posInChunk, 1);
            this.saveChunk(id, chunkIndex, chunk);
            
            index.total--;
            this.saveIndex(id, index);
            
            return record;
        }

        // 获取队列大小（无需加载数据）
        static getQueueSize(id) {
            return this.getIndex(id).total;
        }

        // 清空队列
        static clearQueue(id) {
            const index = this.getIndex(id);
            for (let i = 0; i < index.chunks; i++) {
                ext.storageSet(`logChunk_${id}_${i}`, "");
                delete this.chunkCache[`${id}_${i}`];
            }
            this.saveIndex(id, { total: 0, chunks: 0 });
            delete this.indexCache[id];
        }

        // 兼容旧版本：获取完整队列（仅用于迁移）
        static getQueue(id) {
            try {
                const data = ext.storageGet(`logQueue_${id}`);
                return data ? JSON.parse(data) : [];
            } catch (e) {
                return [];
            }
        }

        static scheduleBatchWrite() {
            if (this.batchWriteTimer) return;

            const interval = parseInt(seal.ext.getStringConfig(ext, CONFIG.BATCH_WRITE_INTERVAL) || "300") * 1000;

            this.batchWriteTimer = setTimeout(() => {
                this.flushPendingWrites();
                this.batchWriteTimer = null;
            }, interval);
        }

        static flushPendingWrites() {
            for (const [cacheKey, data] of this.pendingWrites) {
                try {
                    ext.storageSet(`logChunk_${data.id}_${data.chunkIndex}`, JSON.stringify(data.chunk));
                } catch (e) {
                    console.error(`[randomChatLogger] 写入块失败 ${cacheKey}:`, e);
                }
                delete this.chunkCache[cacheKey];
            }
            this.pendingWrites.clear();
        }

        static getGroupConfig(id) {
            try {
                const data = ext.storageGet(`groupConfig_${id}`);
                return data ? JSON.parse(data) : {};
            } catch (e) { return {}; }
        }

        static setGroupConfig(id, config) {
            const current = this.getGroupConfig(id);
            const newConfig = { ...current, ...config };
            ext.storageSet(`groupConfig_${id}`, JSON.stringify(newConfig));
        }

        static clearGroupConfig(id) {
            ext.storageSet(`groupConfig_${id}`, "");
        }

        static trimQueue(id, maxSize) {
            const index = this.getIndex(id);
            if (index.total > maxSize) {
                const removed = index.total - maxSize;
                // 逐个删除最旧的记录
                for (let i = 0; i < removed; i++) {
                    this.removeOldestRecord(id, index);
                }
                this.flushPendingWrites();
                return removed;
            }
            return 0;
        }

        static migrateFromOldFormat() {
            try {
                // 迁移旧的状态存储格式
                const oldData = ext.storageGet("logStateMap");
                if (!oldData || oldData === "" || oldData === "{}") return;

                let parsed;
                try { parsed = JSON.parse(oldData); } catch (e) { return; }
                if (!parsed || typeof parsed !== "object") return;

                let count = 0;
                for (const id in parsed) {
                    const existing = ext.storageGet(`state_${id}`);
                    if (!existing) {
                        ext.storageSet(`state_${id}`, parsed[id] ? "1" : "0");
                        count++;
                    }
                }
                ext.storageSet("logStateMap", "");
                if (count > 0) {
                    console.log(`[randomChatLogger] 状态数据迁移：${count} 个群状态已分割为独立 key`);
                }
            } catch (e) {
                console.error("[randomChatLogger] 状态迁移失败:", e);
            }
        }

        // 迁移旧的队列存储格式到分块格式
        static migrateQueueToChunks(id) {
            try {
                const oldQueue = this.getQueue(id);
                if (!oldQueue || oldQueue.length === 0) return;

                // 检查是否已经迁移过
                const index = this.getIndex(id);
                if (index.total > 0) return; // 已有新格式数据，跳过

                console.log(`[randomChatLogger] 开始迁移群 ${id} 的队列数据，共 ${oldQueue.length} 条`);

                // 分块存储
                const chunks = Math.ceil(oldQueue.length / this.CHUNK_SIZE);
                for (let i = 0; i < chunks; i++) {
                    const start = i * this.CHUNK_SIZE;
                    const chunk = oldQueue.slice(start, start + this.CHUNK_SIZE);
                    ext.storageSet(`logChunk_${id}_${i}`, JSON.stringify(chunk));
                }

                // 保存索引
                this.saveIndex(id, { total: oldQueue.length, chunks });

                // 清理旧数据
                ext.storageSet(`logQueue_${id}`, "");
                
                console.log(`[randomChatLogger] 群 ${id} 迁移完成，已分为 ${chunks} 个块`);
            } catch (e) {
                console.error(`[randomChatLogger] 队列迁移失败 ${id}:`, e);
            }
        }
    }

    class ImageHelper {
        static async urlToBase64(url) {
            const backendUrl = seal.ext.getStringConfig(ext, CONFIG.BASE64BACKEND);
            if (!backendUrl) return null;

            try {
                // 去除末尾斜杠
                const cleanUrl = backendUrl.replace(/\/$/, '');
                const response = await fetch(`${cleanUrl}/image-to-base64`, {
                    method: 'POST',
                    headers: {
                        "Content-Type": "application/json",
                        "Accept": "application/json"
                    },
                    body: JSON.stringify({ url: url })
                });

                if (!response.ok) {
                    const text = await response.text();
                    console.error(`[randomChatLogger] fetch图片失败: ${response.status} ${text}`);
                    return null;
                }

                const data = await response.json();
                if (data.error) {
                    console.error(`[randomChatLogger] base64转换后端api响应错误: ${data.error.message}`);
                    return null;
                }

                return data.base64;
            } catch (error) {
                console.error("[randomChatLogger] urlToBase64网络错误:", error);
                return null;
            }
        }

        static extractImageUrls(msg) {
            const urls = [];
            const regex = /\[CQ:image,[^\]]*file=([^,\]]+)[^\]]*\]/g;
            let match;
            while ((match = regex.exec(msg)) !== null) {
                urls.push(match[1]);
            }
            return urls;
        }
    }

    class PassiveTimer {
        static stateMap = {};       
        static lastRecordMap = {};  
        static lastSendMap = {};    

        static init() {
            DataManager.migrateFromOldFormat();

            try {
                this.lastRecordMap = JSON.parse(ext.storageGet("lastRecordTimeMap") || "{}");
            } catch (e) { this.lastRecordMap = {}; }
            try {
                this.lastSendMap = JSON.parse(ext.storageGet("lastSendTimeMap") || "{}");
            } catch (e) { this.lastSendMap = {}; }
        }

        // 懒加载迁移：仅在访问时迁移该群数据
        static ensureMigrated(id) {
            if (!this._migrationChecked) this._migrationChecked = {};
            if (this._migrationChecked[id]) return;
            
            DataManager.migrateQueueToChunks(id);
            this._migrationChecked[id] = true;
        }

        static isEnabled(id) {
            if (this.stateMap[id] !== undefined) return this.stateMap[id];
            try {
                const val = ext.storageGet(`state_${id}`);
                const enabled = val === "1";
                this.stateMap[id] = enabled;
                return enabled;
            } catch (e) {
                this.stateMap[id] = false;
                return false;
            }
        }

        static setEnable(id, bool) {
            this.stateMap[id] = bool;
            ext.storageSet(`state_${id}`, bool ? "1" : "0");
        }

        static saveRecordTime(id) {
            this.lastRecordMap[id] = Date.now();
        }

        static saveSendTime(id) {
            this.lastSendMap[id] = Date.now();
        }

        static async tick(ctx, msg, id) {
            if (!this.isEnabled(id)) return;

            // 懒加载迁移
            this.ensureMigrated(id);

            const now = Date.now();

            const groupCfg = DataManager.getGroupConfig(id);
            const defaultRecFreq = parseInt(seal.ext.getStringConfig(ext, CONFIG.REC_FREQ)) * 1000;
            const recFreq = groupCfg.recFreq !== undefined ? parseInt(groupCfg.recFreq) * 1000 : defaultRecFreq;

            if (!this.lastRecordMap[id] || now - this.lastRecordMap[id] >= recFreq) {
                let messageContent = msg.message || "";
                let savedImages = [];

                const globalCatch = seal.ext.getBoolConfig(ext, CONFIG.CATCH_IMAGES);
                const groupCatch = groupCfg.catchImages === true;

                if (globalCatch && groupCatch) {
                    const imageUrls = ImageHelper.extractImageUrls(messageContent);
                    for (const url of imageUrls) {
                        const base64 = await ImageHelper.urlToBase64(url);
                        if (base64) savedImages.push(base64);
                    }
                }

                const regexConfigs = seal.ext.getTemplateConfig(ext, CONFIG.REGEX);
                if (Array.isArray(regexConfigs)) {
                    regexConfigs.forEach(cfg => {
                        try { messageContent = messageContent.replace(new RegExp(cfg, "g"), ""); } catch (e) {}
                    });
                }

                if ((messageContent && messageContent.trim()) || savedImages.length > 0) {
                    const maxSize = parseInt(seal.ext.getStringConfig(ext, CONFIG.MAX_QUEUE_SIZE) || "100");
                    
                    const record = {
                        nickname: msg.sender.nickname,
                        message: messageContent,
                        images: savedImages
                    };
                    
                    DataManager.addRecord(id, record, maxSize);
                    this.saveRecordTime(id);
                }
            }

            if (ctx.group.logOn) {
                return;
            }

            const defaultSendFreq = parseInt(seal.ext.getStringConfig(ext, CONFIG.SEND_FREQ)) * 1000;
            const sendFreq = groupCfg.sendFreq !== undefined ? parseInt(groupCfg.sendFreq) * 1000 : defaultSendFreq;
            if (!this.lastSendMap[id] || now - this.lastSendMap[id] >= sendFreq) {
                let candidateIds = [id];
                const isSharedRoomOn = seal.ext.getBoolConfig(ext, CONFIG.SHARED_ROOM);

                if (isSharedRoomOn) {
                    const rooms = RoomManager.getMemberRooms(id);
                    if (rooms.length > 0) {
                        for (const room of rooms) {
                            candidateIds.push(...room.members);
                        }
                        candidateIds = [...new Set(candidateIds)];
                    }
                }

                // 确保所有候选群都已迁移
                candidateIds.forEach(cid => this.ensureMigrated(cid));

                let logItem = null;
                let selectedId = null;

                const shuffled = candidateIds.slice().sort(() => Math.random() - 0.5);
                for (const pickId of shuffled) {
                    const size = DataManager.getQueueSize(pickId);
                    if (size > 0) {
                        logItem = DataManager.removeRandomRecord(pickId);
                        if (logItem) {
                            selectedId = pickId;
                            break;
                        }
                    }
                }

                if (logItem) {
                    this.sendResponse(ctx, msg, id, logItem);
                    this.saveSendTime(id);
                }
            }
        }

        static sendResponse(ctx, msg, id, logItem) {
            let filteredMsg = logItem.message;
            const regexConfigs = seal.ext.getTemplateConfig(ext, CONFIG.REGEX);
            if (Array.isArray(regexConfigs)) {
                regexConfigs.forEach(cfg => {
                    try { filteredMsg = filteredMsg.replace(new RegExp(cfg, "g"), ""); } catch (e) {}
                });
            }

            const hasImages = logItem.images && logItem.images.length > 0;
            if (!filteredMsg.trim() && !hasImages) return;

            const globalPrefix = seal.ext.getStringConfig(ext, CONFIG.PREFIX);
            const groupCfg = DataManager.getGroupConfig(id);

            const prefix = groupCfg.prefix !== undefined ? groupCfg.prefix : globalPrefix;
            const showName = groupCfg.showName !== undefined ? groupCfg.showName : true;

            let finalMsg = showName
                ? `${prefix}${logItem.nickname}: ${filteredMsg}`
                : `${prefix}${filteredMsg}`;

            if (hasImages) {
                for (const base64 of logItem.images) {
                    try {
                        const imagePath = seal.base64ToImage(base64);
                        finalMsg += `[CQ:image,file=${imagePath}]`;
                    } catch (e) {
                        console.error("[randomChatLogger] base64转换为本地图片失败", e);
                    }
                }
            }

            seal.replyToSender(ctx, msg, finalMsg);
        }
    }

    PassiveTimer.init();

    const cmd = seal.ext.newCmdItemInfo();
    cmd.name = 'chatlog';
    cmd.help = `随机复读机控制：
.chatlog on/off  - 开启/关闭
.chatlog clear   - 清空当前群记录
.chatlog trim    - 手动清理超出上限的记录
.chatlog flush   - 立即写入所有待保存数据
.chatlog set prefix <内容> - 设置本群前缀（使用 on/off 开启/关闭前缀）
.chatlog set name <on/off> - 是否显示昵称
.chatlog set recfreq <秒> - 设置本群记录频率
.chatlog set sendfreq <秒> - 设置本群发送频率
.chatlog set catchimg <on/off> - 设置是否抓取图片（需要插件配置项允许的前提下才能开启）
.chatlog set default - 重置本群设置
.chatlog status - 查看当前群设置
.chatlog room create <name> - 创建群记录共享房间
.chatlog room join <code> - 加入群记录共享房间
.chatlog room quit [name] - 退出群记录共享房间
.chatlog room list - 查看已加入的群记录共享房间`;

    cmd.solve = async (ctx, msg, cmdArgs) => {
        const val = cmdArgs.getArgN(1);
        const subVal = cmdArgs.getArgN(2);
        const content = cmdArgs.getArgN(3);
        const id = msg.messageType === 'group' ? msg.groupId : ctx.player.userId;

        if (ctx.privilegeLevel < 50) {
            seal.replyToSender(ctx, msg, seal.formatTmpl(ctx, "核心:提示_无权限"));
            return seal.ext.newCmdExecuteResult(true);
        }

        switch (val) {
            case 'help':
                seal.replyToSender(ctx, msg, cmd.help);
                break;
            case 'on':
                PassiveTimer.setEnable(id, true);
                seal.replyToSender(ctx, msg, seal.ext.getStringConfig(ext, CONFIG.MSG_ON));
                break;
            case 'off':
                PassiveTimer.setEnable(id, false);
                seal.replyToSender(ctx, msg, seal.ext.getStringConfig(ext, CONFIG.MSG_OFF));
                break;
            case 'clear':
                DataManager.clearQueue(id);
                seal.replyToSender(ctx, msg, "已清空当前群的群记录库。");
                break;
            case 'trim': {
                const maxSize = parseInt(seal.ext.getStringConfig(ext, CONFIG.MAX_QUEUE_SIZE) || "100");
                const removed = DataManager.trimQueue(id, maxSize);
                DataManager.flushPendingWrites();
                seal.replyToSender(ctx, msg, removed > 0 ? `已清理 ${removed} 条超出上限的记录` : "无需清理");
                break;
            }
            case 'flush':
                DataManager.flushPendingWrites();
                seal.replyToSender(ctx, msg, "已立即写入所有待保存数据");
                break;
            case 'status': {
                PassiveTimer.ensureMigrated(id);
                
                const groupCfg = DataManager.getGroupConfig(id);
                const globalPrefix = seal.ext.getStringConfig(ext, CONFIG.PREFIX);
                const defaultRecFreq = seal.ext.getStringConfig(ext, CONFIG.REC_FREQ);
                const defaultSendFreq = seal.ext.getStringConfig(ext, CONFIG.SEND_FREQ);
                const globalCatch = seal.ext.getBoolConfig(ext, CONFIG.CATCH_IMAGES);

                const currentPrefix = groupCfg.prefix !== undefined ? groupCfg.prefix : globalPrefix;
                const currentShowName = groupCfg.showName !== undefined ? groupCfg.showName : true;
                const currentRecFreq = groupCfg.recFreq !== undefined ? groupCfg.recFreq : defaultRecFreq;
                const currentSendFreq = groupCfg.sendFreq !== undefined ? groupCfg.sendFreq : defaultSendFreq;

                const isGroupCatchOn = groupCfg.catchImages === true;
                const currentCatchImg = globalCatch && isGroupCatchOn;
                const isSharedRoomOn = seal.ext.getBoolConfig(ext, CONFIG.SHARED_ROOM);

                const queueSize = DataManager.getQueueSize(id);
                const isEnabled = PassiveTimer.isEnabled(id);
                const maxQueueSize = seal.ext.getStringConfig(ext, CONFIG.MAX_QUEUE_SIZE) || "100";
                const batchInterval = seal.ext.getStringConfig(ext, CONFIG.BATCH_WRITE_INTERVAL) || "300";

                let statusMsg = `当前群设置状态：
功能开关: ${isEnabled ? "开启" : "关闭"}
群记录库大小: ${queueSize} / ${maxQueueSize} 条
消息前缀: ${currentPrefix || "(无)"}
显示昵称: ${currentShowName ? "开启" : "关闭"}
记录频率: ${currentRecFreq}秒
发送频率: ${currentSendFreq}秒
抓取图片: ${currentCatchImg ? "开启" : "关闭"}
共享群记录: ${isSharedRoomOn ? "开启" : "关闭"}
批量写入间隔: ${batchInterval}秒`;

                if (isGroupCatchOn && !globalCatch) {
                    statusMsg += "\n(失效:全局配置未开启)";
                }

                seal.replyToSender(ctx, msg, statusMsg);
                break;
            }
            case 'set':
                if (subVal === 'prefix') {
                    const groupCfg = DataManager.getGroupConfig(id) || {};

                    if (content === 'off' || content === '关闭') {
                        const newCfg = { ...groupCfg };
                        if (newCfg.prefix !== undefined && newCfg.prefix !== "") {
                            newCfg.prevPrefix = newCfg.prefix;
                        }
                        newCfg.prefix = "";
                        ext.storageSet(`groupConfig_${id}`, JSON.stringify(newCfg));
                        seal.replyToSender(ctx, msg, `本群前缀已关闭`);
                    } else if (content === 'on') {
                        const newCfg = { ...groupCfg };
                        if (newCfg.prevPrefix !== undefined) {
                            newCfg.prefix = newCfg.prevPrefix;
                            delete newCfg.prevPrefix;
                        } else {
                            if (newCfg.hasOwnProperty('prefix')) delete newCfg.prefix;
                        }
                        ext.storageSet(`groupConfig_${id}`, JSON.stringify(newCfg));
                        seal.replyToSender(ctx, msg, `本群前缀已${newCfg.prefix !== undefined ? '恢复为本群设置' : '回退到全局设置'}`);
                    } else {
                        if (!content) return seal.replyToSender(ctx, msg, "请指定前缀或使用on/off 开启/关闭，如: .chatlog set prefix 语录:");
                        DataManager.setGroupConfig(id, { prefix: content });
                        seal.replyToSender(ctx, msg, `本群前缀已设为: ${content}`);
                    }
                } else if (subVal === 'name' || subVal === 'showname') {
                    const isOn = content === 'on';
                    if (content !== 'on' && content !== 'off') return seal.replyToSender(ctx, msg, "请指定 on 或 off");
                    DataManager.setGroupConfig(id, { showName: isOn });
                    seal.replyToSender(ctx, msg, `本群昵称显示已${isOn ? '开启' : '关闭'}`);
                } else if (subVal === 'recfreq') {
                    if (!content || isNaN(parseInt(content))) return seal.replyToSender(ctx, msg, "请指定数字秒数，如: .chatlog set recfreq 30");
                    DataManager.setGroupConfig(id, { recFreq: parseInt(content) });
                    seal.replyToSender(ctx, msg, `本群记录频率已设为: ${content}秒`);
                } else if (subVal === 'sendfreq') {
                    if (!content || isNaN(parseInt(content))) return seal.replyToSender(ctx, msg, "请指定数字秒数，如: .chatlog set sendfreq 60");
                    DataManager.setGroupConfig(id, { sendFreq: parseInt(content) });
                    seal.replyToSender(ctx, msg, `本群发送频率已设为: ${content}秒`);
                } else if (subVal === 'catchimg') {
                    const globalAllowed = seal.ext.getBoolConfig(ext, CONFIG.CATCH_IMAGES);
                    if (!globalAllowed) {
                        seal.replyToSender(ctx, msg, "插件配置中未开启[允许抓取图片]选项，无法启用该功能。请联系骰主在后台开启。");
                        return seal.ext.newCmdExecuteResult(true);
                    }
                    if (content !== 'on' && content !== 'off') return seal.replyToSender(ctx, msg, "请指定 on 或 off");

                    const isOn = content === 'on';
                    DataManager.setGroupConfig(id, { catchImages: isOn });
                    seal.replyToSender(ctx, msg, `本群抓取图片功能已${isOn ? '开启' : '关闭'}`);
                } else if (subVal === 'default') {
                    DataManager.clearGroupConfig(id);
                    seal.replyToSender(ctx, msg, "本群配置已重置为默认。");
                } else {
                    seal.replyToSender(ctx, msg, "未知选项，请使用 .chatlog help");
                }
                break;
            case 'room': {
                const isSharedOn = seal.ext.getBoolConfig(ext, CONFIG.SHARED_ROOM);
                if (!isSharedOn) {
                    seal.replyToSender(ctx, msg, "共享群记录库功能未在全局配置中开启，请联系骰主。");
                    return seal.ext.newCmdExecuteResult(true);
                }

                const roomAction = subVal;
                const roomArg = content;

                if (roomAction === 'create') {
                    if (!roomArg) {
                        seal.replyToSender(ctx, msg, "请指定房间名称");
                        return seal.ext.newCmdExecuteResult(true);
                    }
                    const code = RoomManager.create(roomArg, id);
                    seal.replyToSender(ctx, msg, `房间【${roomArg}】创建成功，邀请码: ${code}`);
                } else if (roomAction === 'join') {
                    if (!roomArg) {
                        seal.replyToSender(ctx, msg, "请指定邀请码");
                        return seal.ext.newCmdExecuteResult(true);
                    }
                    const res = RoomManager.join(roomArg, id);
                    if (res.success) seal.replyToSender(ctx, msg, `成功加入房间【${res.roomName}】`);
                    else seal.replyToSender(ctx, msg, `加入失败: ${res.msg}`);
                } else if (roomAction === 'quit') {
                    const res = RoomManager.quit(id, roomArg);
                    if (res.length > 0) {
                        const names = res.map(r => `${r.name}(${r.action})`).join(", ");
                        seal.replyToSender(ctx, msg, `已处理: ${names}`);
                    } else {
                        seal.replyToSender(ctx, msg, "未找到指定/任何房间");
                    }
                } else if (roomAction === 'list') {
                    const list = RoomManager.list(id);
                    if (list.length > 0) seal.replyToSender(ctx, msg, "当前加入的房间:\n" + list.join("\n"));
                    else seal.replyToSender(ctx, msg, "未加入任何房间");
                } else {
                    seal.replyToSender(ctx, msg, "未知房间指令，请使用 create/join/quit/list");
                }
                break;
            }
            default:
                seal.replyToSender(ctx, msg, "未知指令，请使用 .chatlog help");
        }
        return seal.ext.newCmdExecuteResult(true);
    };
    ext.cmdMap['chatlog'] = cmd;

    ext.onNotCommandReceived = async (ctx, msg) => {
        if (msg.messageType !== 'group' && msg.messageType !== 'private') return;
        if (msg.sender.userId === ctx.endPoint.userId) return;

        const id = msg.messageType === 'group' ? msg.groupId : ctx.player.userId;

        PassiveTimer.tick(ctx, msg, id);
    };
}
// ==UserScript==
// @name         争锋频道：COC（克系怪物斗蛐蛐）
// @author       AI,白鱼
// @version      1.0.0
// @description  基于明日方舟斗蛐蛐小游戏的克苏鲁生物竞技小游戏，支持源石锭投注、排行榜与挖矿。使用 .斗蛐蛐 获取帮助。怪物数值全部由AI生成，不确定是否符合真实能力，仅供娱乐参考。非真实货币，尽可能规避了敏感词输出，请勿用于非法用途，作者不为可能带来的后果负责。各种配置见插件设置，非常建议使用合并转发功能，因为很长，http依赖是错误的那个，ob11依赖还没生。
// @timestamp    1760012638
// @license      MIT
// ==/UserScript==

let ext = seal.ext.find('ALL！！！');
if (!ext) {
    ext = seal.ext.new('ALL！！！', 'AI,白鱼', '1.0.0');
    seal.ext.register(ext);

    // ---------- 配置项 ----------
    seal.ext.registerIntConfig(ext, '初始源石锭', 1000, '玩家初始源石锭数量');
    seal.ext.registerIntConfig(ext, '最小投注', 10, '最小投注源石锭数量');
    seal.ext.registerBoolConfig(ext, '合并转发战斗日志', true, '是否使用合并转发消息发送战斗日志（需要ob11网络连接依赖/http依赖）');
    seal.ext.registerStringConfig(ext, '转发消息发送者昵称', '竞技解说', '合并转发消息中显示的发送者昵称，最好写骰子名字');
    seal.ext.registerIntConfig(ext, '每日挖矿上限', 3, '每日挖矿次数上限，默认 3 次');

    // AI评论相关
    seal.ext.registerBoolConfig(ext, '启用AI评论', false, '是否在战斗结束后使用OpenAI API生成评论点评');
    seal.ext.registerStringConfig(ext, 'OpenAI API地址', 'https://api.openai.com/v1/chat/completions', 'OpenAI兼容API的请求地址');
    seal.ext.registerStringConfig(ext, 'OpenAI API Key', '', 'OpenAI API密钥');
    seal.ext.registerStringConfig(ext, 'OpenAI模型', 'gpt-3.5-turbo', '使用的模型名称');
    seal.ext.registerStringConfig(ext, '给AI的提示语', '你是一个幽默风趣的克苏鲁竞技解说员。请基于以下战斗日志，生成一段风趣的点评，突出战斗的荒诞、恐怖和意外元素。保持克苏鲁神话的诡异氛围，但用轻松幽默的语气。点评长度控制在200字以内', '想生成战斗点评的风格');
    seal.ext.registerIntConfig(ext, 'OpenAI最大Token', 500, '生成的评论最大Token数');


    // 怪物数据库（基于COC7规则书）
    const monsters = {
        '深潜者': { str: 65, con: 65, siz: 65, dex: 60, db: '1d4', armor: 1, hp: 13, attacks: [
            { name: '爪抓', skill: 30, damage: '1d6+db' },
            { name: '撕咬', skill: 25, damage: '1d6+db' }
        ], power: 50 },
        '食尸鬼': { str: 65, con: 60, siz: 55, dex: 70, db: '1d4', armor: 0, hp: 12, attacks: [
            { name: '啃咬', skill: 30, damage: '1d6+db' },
            { name: '利爪', skill: 30, damage: '1d4+db' },
            { name: '狂暴撕扯', skill: 20, damage: '1d8+db' }
        ], power: 45 },
        '拜亚基': { str: 95, con: 80, siz: 110, dex: 50, db: '2d6', armor: 2, hp: 19, attacks: [
            { name: '撕咬', skill: 40, damage: '1d8+db' },
            { name: '利爪', skill: 35, damage: '1d6+db' },
            { name: '冲撞', skill: 30, damage: '2d6+db' }
        ], power: 90 },
        '星之精': { str: 85, con: 70, siz: 75, dex: 65, db: '1d6', armor: 0, hp: 15, attacks: [
            { name: '能量触碰', skill: 35, damage: '1d10' },
            { name: '星光爆发', skill: 25, damage: '2d6' },
            { name: '吸取', skill: 30, damage: '1d8' }
        ], power: 75 },
        '修格斯': { str: 120, con: 100, siz: 140, dex: 40, db: '3d6', armor: 0, hp: 24, attacks: [
            { name: '吞噬', skill: 50, damage: '2d6+db' },
            { name: '挤压', skill: 45, damage: '3d6' },
            { name: '触手鞭打', skill: 40, damage: '1d10+db' }
        ], power: 110 },
        '月兽': { str: 75, con: 70, siz: 80, dex: 55, db: '1d6', armor: 1, hp: 15, attacks: [
            { name: '触手', skill: 35, damage: '1d6+db' },
            { name: '抓握', skill: 30, damage: '1d4+db' },
            { name: '猛击', skill: 25, damage: '1d8+db' }
        ], power: 70 },
        '廷达洛斯猎犬': { str: 80, con: 75, siz: 90, dex: 70, db: '1d6', armor: 1, hp: 17, attacks: [
            { name: '撕咬', skill: 40, damage: '1d8+db' },
            { name: '时空之舌', skill: 35, damage: '2d6' },
            { name: '利爪', skill: 38, damage: '1d6+db' }
        ], power: 80 },
        '无形之子': { str: 90, con: 85, siz: 95, dex: 60, db: '2d6', armor: 3, hp: 18, attacks: [
            { name: '挤压', skill: 45, damage: '1d6+db' },
            { name: '窒息', skill: 40, damage: '2d6' },
            { name: '冲击', skill: 35, damage: '1d10+db' }
        ], power: 85 },
        '伊斯之伟大种族': { str: 100, con: 90, siz: 105, dex: 45, db: '2d6', armor: 2, hp: 20, attacks: [
            { name: '钳击', skill: 40, damage: '2d6+db' },
            { name: '闪电枪', skill: 45, damage: '3d6' },
            { name: '重击', skill: 35, damage: '1d10+db' }
        ], power: 95 },
        '夜魇': { str: 70, con: 65, siz: 60, dex: 75, db: '1d4', armor: 0, hp: 13, attacks: [
            { name: '爪击', skill: 40, damage: '1d6+db' },
            { name: '恐惧凝视', skill: 35, damage: '1d8' },
            { name: '飞扑', skill: 30, damage: '1d8+db' }
        ], power: 60 },
        '空鬼': { str: 55, con: 50, siz: 45, dex: 80, db: '0', armor: 0, hp: 10, attacks: [
            { name: '冰冻触碰', skill: 35, damage: '1d6' },
            { name: '寒冰射线', skill: 40, damage: '1d8' },
            { name: '冰锥', skill: 30, damage: '2d4' }
        ], power: 40 },
        '黑山羊幼仔': { str: 110, con: 95, siz: 120, dex: 35, db: '2d6', armor: 2, hp: 22, attacks: [
            { name: '践踏', skill: 45, damage: '2d6+db' },
            { name: '触手猛击', skill: 40, damage: '1d10+db' },
            { name: '冲撞', skill: 38, damage: '3d6' }
        ], power: 100 },
        '米·戈': { str: 60, con: 55, siz: 50, dex: 75, db: '0', armor: 1, hp: 11, attacks: [
            { name: '钳击', skill: 30, damage: '1d6' },
            { name: '电击', skill: 35, damage: '1d8' },
            { name: '手术刀', skill: 32, damage: '1d4+2' }
        ], power: 48 },
        '夏塔克鸟': { str: 85, con: 75, siz: 100, dex: 55, db: '1d6', armor: 1, hp: 18, attacks: [
            { name: '啄击', skill: 35, damage: '1d8+db' },
            { name: '利爪', skill: 30, damage: '1d6+db' },
            { name: '俯冲', skill: 28, damage: '2d6+db' }
        ], power: 78 },
        '蛇人': { str: 70, con: 70, siz: 75, dex: 65, db: '1d4', armor: 1, hp: 15, attacks: [
            { name: '弯刀', skill: 40, damage: '1d8+db' },
            { name: '长矛', skill: 35, damage: '1d8+1+db' },
            { name: '毒咬', skill: 30, damage: '1d6' }
        ], power: 65 },
        '暗夜猎手': { str: 75, con: 70, siz: 70, dex: 70, db: '1d4', armor: 0, hp: 14, attacks: [
            { name: '撕扯', skill: 35, damage: '1d6+db' },
            { name: '缠绕', skill: 30, damage: '1d8' },
            { name: '猛扑', skill: 33, damage: '1d8+db' }
        ], power: 68 },
        '飞水螅': { str: 50, con: 45, siz: 40, dex: 85, db: '0', armor: 0, hp: 9, attacks: [
            { name: '电击', skill: 40, damage: '1d8' },
            { name: '触手', skill: 35, damage: '1d4' },
            { name: '雷暴', skill: 30, damage: '2d6' }
        ], power: 38 },
        '沙地栖息者': { str: 95, con: 85, siz: 110, dex: 40, db: '2d6', armor: 2, hp: 20, attacks: [
            { name: '吞噬', skill: 45, damage: '2d6+db' },
            { name: '沙暴', skill: 35, damage: '1d10' },
            { name: '碾压', skill: 40, damage: '3d6' }
        ], power: 92 },
        '潜伏者': { str: 65, con: 60, siz: 60, dex: 65, db: '1d4', armor: 1, hp: 12, attacks: [
            { name: '爪击', skill: 35, damage: '1d6+db' },
            { name: '撕咬', skill: 30, damage: '1d6+db' },
            { name: '突袭', skill: 25, damage: '1d8+db' }
        ], power: 55 },
        '星之眷族': { str: 80, con: 75, siz: 85, dex: 50, db: '1d6', armor: 1, hp: 16, attacks: [
            { name: '触手鞭打', skill: 40, damage: '1d8+db' },
            { name: '星辰之力', skill: 35, damage: '2d6' },
            { name: '缠绕', skill: 33, damage: '1d10' }
        ], power: 73 },
        '深海异形': { str: 90, con: 85, siz: 95, dex: 45, db: '1d6', armor: 2, hp: 18, attacks: [
            { name: '撕咬', skill: 40, damage: '2d6+db' },
            { name: '利爪', skill: 38, damage: '1d8+db' },
            { name: '尾击', skill: 30, damage: '1d10+db' }
        ], power: 83 },
        '黄衣教徒': { str: 55, con: 55, siz: 60, dex: 60, db: '0', armor: 0, hp: 12, attacks: [
            { name: '匕首', skill: 35, damage: '1d4+db' },
            { name: '疯狂之语', skill: 30, damage: '1d6' },
            { name: '挥击', skill: 28, damage: '1d6' }
        ], power: 42 },
        '梦境行者': { str: 60, con: 55, siz: 55, dex: 70, db: '0', armor: 0, hp: 11, attacks: [
            { name: '精神冲击', skill: 40, damage: '1d6' },
            { name: '梦魇侵蚀', skill: 35, damage: '1d8' },
            { name: '幻象打击', skill: 30, damage: '2d4' }
        ], power: 47 },
        '古革巨人': { str: 140, con: 120, siz: 160, dex: 30, db: '3d6', armor: 3, hp: 28, attacks: [
            { name: '巨臂', skill: 50, damage: '3d6+db' },
            { name: '践踏', skill: 45, damage: '2d10+db' },
            { name: '岩石投掷', skill: 40, damage: '4d6' }
        ], power: 125 },
        '幻梦境蜘蛛': { str: 45, con: 40, siz: 35, dex: 90, db: '0', armor: 0, hp: 8, attacks: [
            { name: '毒液', skill: 45, damage: '1d3' },
            { name: '蛛网', skill: 40, damage: '1d4' },
            { name: '啃咬', skill: 38, damage: '1d6' }
        ], power: 35 },
        '格拉基仆从': { str: 58, con: 52, siz: 58, dex: 62, db: '0', armor: 0, hp: 11, attacks: [
            { name: '抓握', skill: 32, damage: '1d6' },
            { name: '窒息', skill: 28, damage: '1d8' }
        ], power: 43 },
        '火之吸血鬼': { str: 72, con: 68, siz: 68, dex: 68, db: '1d4', armor: 0, hp: 14, attacks: [
            { name: '燃烧触碰', skill: 38, damage: '1d10' },
            { name: '火焰喷射', skill: 35, damage: '2d6' },
            { name: '灼烧', skill: 30, damage: '1d8' }
        ], power: 62 },
        '长须鲸': { str: 125, con: 110, siz: 145, dex: 25, db: '3d6', armor: 4, hp: 26, attacks: [
            { name: '冲撞', skill: 48, damage: '3d6+db' },
            { name: '尾击', skill: 42, damage: '2d10+db' }
        ], power: 115 },
        '猫人': { str: 52, con: 48, siz: 50, dex: 82, db: '0', armor: 0, hp: 10, attacks: [
            { name: '爪击', skill: 42, damage: '1d6' },
            { name: '飞扑', skill: 38, damage: '1d8' },
            { name: '撕咬', skill: 35, damage: '1d4' }
        ], power: 41 },
        '格格仆从': { str: 78, con: 72, siz: 75, dex: 58, db: '1d4', armor: 1, hp: 15, attacks: [
            { name: '利爪', skill: 36, damage: '1d6+db' },
            { name: '啃咬', skill: 32, damage: '1d8+db' },
            { name: '猛击', skill: 28, damage: '1d10' }
        ], power: 67 },
        '冷蛛': { str: 62, con: 58, siz: 55, dex: 75, db: '1d4', armor: 1, hp: 12, attacks: [
            { name: '冰冻之咬', skill: 40, damage: '1d6+db' },
            { name: '霜冻吐息', skill: 35, damage: '2d4' },
            { name: '利爪', skill: 30, damage: '1d4+db' }
        ], power: 58 },
        '夜鸟': { str: 68, con: 63, siz: 63, dex: 72, db: '1d4', armor: 0, hp: 13, attacks: [
            { name: '利爪', skill: 37, damage: '1d6+db' },
            { name: '俯冲', skill: 35, damage: '1d8+db' },
            { name: '尖啸', skill: 30, damage: '1d6' }
        ], power: 59 },
        '布鲁斯人': { str: 88, con: 82, siz: 92, dex: 48, db: '1d6', armor: 2, hp: 18, attacks: [
            { name: '利爪', skill: 42, damage: '1d8+db' },
            { name: '撕咬', skill: 40, damage: '2d6+db' },
            { name: '冲撞', skill: 35, damage: '1d10+db' }
        ], power: 81 },
        '远古遗民': { str: 105, con: 98, siz: 115, dex: 38, db: '2d6', armor: 3, hp: 22, attacks: [
            { name: '古代武器', skill: 46, damage: '2d8+db' },
            { name: '魔法爆发', skill: 40, damage: '3d6' },
            { name: '重击', skill: 38, damage: '2d6+db' }
        ], power: 97 },
        '活死人': { str: 63, con: 70, siz: 68, dex: 42, db: '1d4', armor: 1, hp: 14, attacks: [
            { name: '抓握', skill: 30, damage: '1d6+db' },
            { name: '啃咬', skill: 35, damage: '1d8+db' },
            { name: '缠绕', skill: 25, damage: '1d6' }
        ], power: 54 },
        '虚空游荡者': { str: 82, con: 78, siz: 88, dex: 62, db: '1d6', armor: 2, hp: 17, attacks: [
            { name: '虚空之触', skill: 40, damage: '2d6' },
            { name: '能量爆破', skill: 35, damage: '1d10+db' },
            { name: '吸取', skill: 30, damage: '1d8' }
        ], power: 76 },
        '阿撒托斯之仆': { str: 135, con: 115, siz: 150, dex: 35, db: '3d6', armor: 3, hp: 27, attacks: [
            { name: '混沌之击', skill: 48, damage: '3d6+db' },
            { name: '疯狂爆发', skill: 45, damage: '4d6' },
            { name: '虚空撕裂', skill: 40, damage: '2d10+db' }
        ], power: 120 },
        '深渊爬行者': { str: 92, con: 88, siz: 98, dex: 52, db: '2d6', armor: 2, hp: 19, attacks: [
            { name: '触手', skill: 43, damage: '1d10+db' },
            { name: '吞噬', skill: 40, damage: '2d6+db' },
            { name: '毒液喷射', skill: 35, damage: '2d8' }
        ], power: 87 },
        '星空恐惧': { str: 77, con: 73, siz: 80, dex: 65, db: '1d6', armor: 1, hp: 16, attacks: [
            { name: '精神震荡', skill: 42, damage: '2d6' },
            { name: '恐惧凝视', skill: 38, damage: '1d10' },
            { name: '能量波', skill: 35, damage: '1d8+db' }
        ], power: 71 },
        '蠕行混沌': { str: 98, con: 92, siz: 105, dex: 45, db: '2d6', armor: 2, hp: 20, attacks: [
            { name: '酸液喷射', skill: 44, damage: '2d8' },
            { name: '吞噬', skill: 42, damage: '2d6+db' },
            { name: '挤压', skill: 38, damage: '3d6' }
        ], power: 89 },
        '梦魇之影': { str: 58, con: 55, siz: 52, dex: 78, db: '0', armor: 0, hp: 11, attacks: [
            { name: '梦境侵蚀', skill: 40, damage: '1d8' },
            { name: '幻象打击', skill: 38, damage: '2d4' },
            { name: '恐惧之触', skill: 35, damage: '1d6' }
        ], power: 46 },
        '暗影潜行者': { str: 70, con: 65, siz: 68, dex: 80, db: '1d4', armor: 0, hp: 14, attacks: [
            { name: '暗影刺击', skill: 45, damage: '1d8+db' },
            { name: '窒息', skill: 40, damage: '2d6' },
            { name: '利爪', skill: 35, damage: '1d6+db' }
        ], power: 63 },
        '腐化巨虫': { str: 102, con: 95, siz: 118, dex: 40, db: '2d6', armor: 3, hp: 22, attacks: [
            { name: '吞噬', skill: 46, damage: '3d6+db' },
            { name: '毒液喷射', skill: 40, damage: '2d8' },
            { name: '碾压', skill: 38, damage: '2d10+db' }
        ], power: 98 },
        // 新增怪物（基于COC7规则书）
        '长老物': { str: 80, con: 70, siz: 90, dex: 60, db: '1d6', armor: 1, hp: 16, attacks: [
            { name: '爪击', skill: 40, damage: '1d6+db' },
            { name: '喷射', skill: 30, damage: '1d10' },
            { name: '翼击', skill: 35, damage: '1d8+db' }
        ], power: 80 },
        '飞行息肉': { str: 50, con: 70, siz: 80, dex: 70, db: '1d4', armor: 3, hp: 15, attacks: [
            { name: '风爆', skill: 50, damage: '1d6' },
            { name: '抓取', skill: 40, damage: '1d8' },
            { name: '隐形攻击', skill: 45, damage: '1d10' }
        ], power: 60 },
        '山塔克': { str: 100, con: 90, siz: 120, dex: 40, db: '2d6', armor: 2, hp: 21, attacks: [
            { name: '啄击', skill: 45, damage: '1d10+db' },
            { name: '爪击', skill: 40, damage: '1d8+db' },
            { name: '尾扫', skill: 35, damage: '2d6+db' }
        ], power: 95 },
        '夜魇': { str: 60, con: 60, siz: 50, dex: 80, db: '0', armor: 0, hp: 11, attacks: [
            { name: '抓握', skill: 50, damage: '1d4' },
            { name: '挠痒', skill: 30, damage: '1d3' },
            { name: '携带', skill: 40, damage: '0' }
        ], power: 50 },
        '次元徘徊者': { str: 90, con: 80, siz: 100, dex: 50, db: '1d6', armor: 2, hp: 18, attacks: [
            { name: '爪击', skill: 60, damage: '1d8+db' },
            { name: '抓取', skill: 50, damage: '1d6+db' },
            { name: '传送咬', skill: 45, damage: '2d6' }
        ], power: 85 }
    };

    // ---------- 存储操作 ----------
    function loadData(key) {
        try {
            const data = ext.storageGet(key);
            return data ? JSON.parse(data) : {};
        } catch (err) {
            console.error(`加载${key}数据失败: ${err}`);
            return {};
        }
    }
    function saveData(key, data) {
        try {
            ext.storageSet(key, JSON.stringify(data));
        } catch (err) {
            console.error(`保存${key}数据失败: ${err}`);
        }
    }

    // ---------- 工具函数 ----------
    function rollDice(dice) {
        if (!dice || typeof dice !== 'string') {
            const n = parseInt(dice);
            return isNaN(n) ? 0 : n;
        }
        const m = dice.match(/(\d+)d(\d+)(?:\+(\d+))?/);
        if (!m) {
            const num = parseInt(dice);
            return isNaN(num) ? 0 : num;
        }
        const [, num, sides, bonus] = m;
        let total = 0;
        for (let i = 0; i < parseInt(num); i++) {
            total += Math.floor(Math.random() * parseInt(sides)) + 1;
        }
        return total + (parseInt(bonus) || 0);
    }

    // 解析伤害表达式并计算平均伤害
    function avgDamageFromExpr(expr) {
        if (!expr || typeof expr !== 'string') return 0;
        const parts = expr.match(/(\d+)d(\d+)(?:\+(\d+))?/g);
        let avg = 0;
        if (parts) {
            parts.forEach(p => {
                const mm = p.match(/(\d+)d(\d+)(?:\+(\d+))?/);
                if (mm) {
                    const [, n, s, b] = mm;
                    avg += parseInt(n) * (parseInt(s) + 1) / 2;
                    if (b) avg += parseInt(b);
                }
            });
        } else {
            const num = parseInt(expr);
            avg = isNaN(num) ? 0 : num;
        }
        return avg;
    }

    // 计算攻击的期望伤害
    function calculateExpectedDamage(attack, db) {
        if (!attack) return 0;
        const expr = attack.damage.replace(/db/g, db || '0');
        const avg = avgDamageFromExpr(expr);
        const hitProb = Math.max(0, Math.min(1, (attack.skill || 0) / 100));
        return avg * hitProb;
    }

    // 选择攻击方式
    function selectAttack(attacker) {
        const attacks = attacker.data.attacks || [];
        if (!attacks.length) return null;
        const exps = attacks.map(a => calculateExpectedDamage(a, attacker.data.db));
        const maxExp = Math.max(...exps, 0);
        const eps = 0.1;
        const weights = exps.map(e => (maxExp - e) + eps);
        const totalWeight = weights.reduce((s, w) => s + w, 0);
        if (totalWeight <= 0) return attacks[Math.floor(Math.random() * attacks.length)];
        let r = Math.random() * totalWeight;
        for (let i = 0; i < attacks.length; i++) {
            r -= weights[i];
            if (r <= 0) return attacks[i];
        }
        return attacks[attacks.length - 1];
    }

    // 智能目标选择
    function chooseSmartTarget(attacker, targets) {
        if (!targets || targets.length === 0) return null;
        const threats = targets.map(t => {
            const atkExps = (t.data.attacks || []).reduce((s, a) => s + calculateExpectedDamage(a, t.data.db), 0);
            return atkExps;
        });
        const maxThreat = Math.max(...threats, 1);
        const scores = targets.map((t, idx) => {
            const hpRatio = Math.max(0, Math.min(1, t.hp / (t.maxHp || 1)));
            const threatNorm = threats[idx] / maxThreat;
            const baseScore = (1 - hpRatio) * 0.65 + threatNorm * 0.35;
            const bonus = (hpRatio < 0.3) ? 0.2 : 0;
            return Math.max(0, baseScore + bonus);
        });
        const total = scores.reduce((s, v) => s + v, 0);
        let r = Math.random() * (total || 1);
        for (let i = 0; i < targets.length; i++) {
            r -= scores[i];
            if (r <= 0) return targets[i];
        }
        return targets[targets.length - 1];
    }

    // 多动判定：DEX 差距 20/40/60 => 25%/60%/100%
    function multiMoveChance(attackerDex, defenderDex) {
        const diff = attackerDex - defenderDex;
        if (diff >= 60) return 1.0;
        if (diff >= 40) return 0.6;
        if (diff >= 20) return 0.25;
        return 0.0;
    }
    function canDoubleMove(attacker, targets) {
        if (!targets || targets.length === 0) return false;
        const minDex = Math.min(...targets.map(t => t.data.dex || 0));
        const chance = multiMoveChance(attacker.data.dex || 0, minDex);
        return Math.random() < chance;
    }

    // 执行单次攻击
    function performAttack(attacker, target, attack, logs) {
        if (!attack || !attacker || !target) return false;
        const hitRoll = Math.floor(Math.random() * 100) + 1;
        const critSuccessThreshold = Math.floor((attack.skill || 0) / 5);
        const isCritSuccess = hitRoll <= critSuccessThreshold;
        const isCritFail = hitRoll >= 96;
        const isSuccess = hitRoll <= (attack.skill || 0);

        if (isCritSuccess && isSuccess) {
            // 大成功：最大伤害 + 正常伤害
            const df = attack.damage.replace(/db/g, attacker.data.db || '0');
            const parts = df.match(/(\d+)d(\d+)(?:\+(\d+))?/g);
            let maxD = 0, normalD = 0;
            if (parts) {
                parts.forEach(p => {
                    const mm = p.match(/(\d+)d(\d+)(?:\+(\d+))?/);
                    if (mm) {
                        const [, n, s, b] = mm;
                        maxD += parseInt(n) * parseInt(s);
                        normalD += rollDice(p);
                        if (b) maxD += parseInt(b);
                    }
                });
            } else {
                maxD = parseInt(df) || 0;
                normalD = maxD;
            }
            let totalDamage = maxD + normalD;
            totalDamage = Math.max(0, totalDamage - (target.data.armor || 0));
            target.hp -= totalDamage;
            logs.push(`💥 ${attacker.name} 对 ${target.name} 使用 ${attack.name} (${hitRoll}/${attack.skill}) —— 大成功！造成 ${totalDamage} 点伤害 [${Math.max(0, target.hp)}/${target.maxHp}]`);
            if (target.hp <= 0) logs.push(`🔥 ${target.name} 被击倒！`);
            return true;
        } else if (isSuccess && !isCritFail) {
            const df = attack.damage.replace(/db/g, attacker.data.db || '0');
            const dmg = rollDice(df);
            const final = Math.max(0, dmg - (target.data.armor || 0));
            target.hp -= final;
            logs.push(`${attacker.name} 对 ${target.name} 使用 ${attack.name} (${hitRoll}/${attack.skill})，命中，造成 ${final} 点伤害 [${Math.max(0, target.hp)}/${target.maxHp}]`);
            if (target.hp <= 0) logs.push(`🔥 ${target.name} 倒下了！`);
            return true;
        } else if (isCritFail) {
            if (Math.random() < 0.5) {
                const selfD = rollDice('1d4');
                attacker.hp -= selfD;
                logs.push(`💢 ${attacker.name} 使用 ${attack.name} (${hitRoll}/${attack.skill}) —— 大失败！武器卡住，反噬自伤 ${selfD} 点 [${Math.max(0, attacker.hp)}/${attacker.maxHp}]`);
            } else {
                logs.push(`💢 ${attacker.name} 使用 ${attack.name} (${hitRoll}/${attack.skill}) —— 大失败！武器掉落，未命中`);
            }
            return false;
        } else {
            logs.push(`${attacker.name} 使用 ${attack.name} (${hitRoll}/${attack.skill}) 未命中。`);
            return false;
        }
    }

    // 生成对战
    function generateBattle(side1Monsters = null, side2Monsters = null) {
        const monsterList = Object.keys(monsters);
        let side1Final = side1Monsters || [];
        let side2Final = side2Monsters || [];
        if (!side1Final.length) {
            const side1Count = Math.random() > 0.6 ? Math.floor(Math.random() * 3) + 2 : 1;
            for (let i = 0; i < side1Count; i++) {
                side1Final.push(monsterList[Math.floor(Math.random() * monsterList.length)]);
            }
        }
        if (!side2Final.length) {
            const side2Count = Math.floor(Math.random() * 4) + 1;
            for (let i = 0; i < side2Count; i++) {
                side2Final.push(monsterList[Math.floor(Math.random() * monsterList.length)]);
            }
        }

        const side1Power = side1Final.reduce((s, m) => s + (monsters[m]?.power || 0), 0);
        const side2Power = side2Final.reduce((s, m) => s + (monsters[m]?.power || 0), 0);

        // 对双方属性做微调：根据 power 差距按比例在 hp/skill 上做 +/-10% 随机化，平衡到更接近
        function balanceUnits(names, targetPower) {
            const units = names.map((name, idx) => {
                if (!monsters[name]) return null;
                const base = JSON.parse(JSON.stringify(monsters[name])); // 深拷贝
                // 随机轻微波动
                const fluct = 0.85 + Math.random() * 0.3; // 0.85 - 1.15
                base.hp = Math.max(1, Math.floor(base.hp * fluct));
                base.attacks = (base.attacks || []).map(a => {
                    const a2 = Object.assign({}, a);
                    const skillFluct = Math.max(1, Math.floor((a2.skill || 10) * (0.85 + Math.random() * 0.3)));
                    a2.skill = skillFluct;
                    return a2;
                });
                return {
                    name,
                    hp: base.hp,
                    maxHp: base.hp,
                    data: base
                };
            }).filter(u => u !== null);

            // 调整整体战力以尽量接近 targetPower
            const unitPower = names.reduce((s, n) => s + (monsters[n]?.power || 0), 0) || 1;
            const scale = targetPower / unitPower;
            // 限制缩放在 0.8 ~ 1.25 范围内防止极端变动
            const clampScale = Math.max(0.8, Math.min(1.25, scale));
            units.forEach(u => {
                u.maxHp = Math.max(1, Math.floor(u.maxHp * clampScale));
                u.hp = u.maxHp;
            });
            return units;
        }

        // 以平均power为目标平衡双方
        const avgPower = (side1Power + side2Power) / 2;
        const side1Units = balanceUnits(side1Final, avgPower);
        const side2Units = balanceUnits(side2Final, avgPower);

        // 生成名称
        function generateTeamName(arr) {
            const counts = {};
            arr.forEach(m => counts[m] = (counts[m] || 0) + 1);
            const parts = [];
            for (const k in counts) {
                if (counts[k] > 1) parts.push(`${counts[k]}只${k}`);
                else parts.push(k);
            }
            return parts.join('、');
        }

        return {
            side1: { monsters: side1Final, name: generateTeamName(side1Final) },
            side2: { monsters: side2Final, name: generateTeamName(side2Final) },
            side1Units,
            side2Units,
            supporters: {},
            status: 'waiting',
            battleLog: []
        };
    }

    // sleep 用于发送延时
    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // 生成AI评论
    async function generateAIComment(logs, battle) {
        const enableAI = seal.ext.getBoolConfig(ext, '启用AI评论');
        if (!enableAI) return '';

        const apiUrl = seal.ext.getStringConfig(ext, 'OpenAI API地址');
        const apiKey = seal.ext.getStringConfig(ext, 'OpenAI API Key');
        const model = seal.ext.getStringConfig(ext, 'OpenAI模型');
        const maxTokens = seal.ext.getIntConfig(ext, 'OpenAI最大Token');
        const promptfront = seal.ext.getStringConfig(ext, '给AI的提示语');

        if (!apiKey) {
            console.error('OpenAI API Key 未配置');
            return '';
        }

        const prompt = promptfront + `

战斗双方：
甲方：${battle.side1.name}
乙方：${battle.side2.name}

战斗日志：
${logs.join('\n')}

点评：`;

        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: model,
                    messages: [
                        { role: 'system', content: '你是一个幽默的克苏鲁竞技解说员。' },
                        { role: 'user', content: prompt }
                    ],
                    max_tokens: maxTokens,
                    temperature: 0.8
                })
            });

            if (!response.ok) {
                throw new Error(`API请求失败: ${response.status}`);
            }

            const data = await response.json();
            const comment = data.choices[0]?.message?.content || '';
            return `\n\n🤖 AI解说点评：\n${comment}`;
        } catch (error) {
            console.error('生成AI评论失败:', error);
            return '';
        }
    }

    // 模拟战斗
    function simulateBattle(battle) {
        const logs = [];

        let side1Units = battle.side1Units.map((u, idx) => ({
            name: `${u.name}#${idx + 1}`,
            displayName: u.name,
            hp: u.hp,
            maxHp: u.maxHp,
            data: u.data
        }));
        let side2Units = battle.side2Units.map((u, idx) => ({
            name: `${u.name}#${idx + 1}`,
            displayName: u.name,
            hp: u.hp,
            maxHp: u.maxHp,
            data: u.data
        }));

        logs.push(`=== 竞技开始 ===`);
        logs.push(`【甲方】 ${battle.side1.name}`);
        logs.push(`【乙方】 ${battle.side2.name}\n`);

        let round = 1;
        while (side1Units.some(u => u.hp > 0) && side2Units.some(u => u.hp > 0)) {
            logs.push(`--- 第 ${round} 回合 ---`);

            // 甲方行动
            for (const attacker of side1Units.filter(u => u.hp > 0)) {
                const targets = side2Units.filter(t => t.hp > 0);
                if (targets.length === 0) break;
                // 智能选目标
                const target = chooseSmartTarget(attacker, targets) || targets[Math.floor(Math.random() * targets.length)];
                const attack = selectAttack(attacker) || (attacker.data.attacks && attacker.data.attacks[0]);
                performAttack(attacker, target, attack, logs);

                // 多动判定（相对于当前活着目标的最低 DEX）
                if (attacker.hp > 0 && canDoubleMove(attacker, targets)) {
                    logs.push(`⚡ ${attacker.name} 因速度优势获得了额外行动！`);
                    const newTargets = side2Units.filter(t => t.hp > 0);
                    if (newTargets.length > 0) {
                        const extraTarget = chooseSmartTarget(attacker, newTargets) || newTargets[Math.floor(Math.random() * newTargets.length)];
                        const extraAttack = selectAttack(attacker) || attacker.data.attacks[0];
                        performAttack(attacker, extraTarget, extraAttack, logs);
                    }
                }
            }

            if (!side2Units.some(u => u.hp > 0)) break;

            // 乙方行动
            for (const attacker of side2Units.filter(u => u.hp > 0)) {
                const targets = side1Units.filter(t => t.hp > 0);
                if (targets.length === 0) break;
                const target = chooseSmartTarget(attacker, targets) || targets[Math.floor(Math.random() * targets.length)];
                const attack = selectAttack(attacker) || (attacker.data.attacks && attacker.data.attacks[0]);
                performAttack(attacker, target, attack, logs);

                if (attacker.hp > 0 && canDoubleMove(attacker, targets)) {
                    logs.push(`⚡ ${attacker.name} 因速度优势获得了额外行动！`);
                    const newTargets = side1Units.filter(t => t.hp > 0);
                    if (newTargets.length > 0) {
                        const extraTarget = chooseSmartTarget(attacker, newTargets) || newTargets[Math.floor(Math.random() * newTargets.length)];
                        const extraAttack = selectAttack(attacker) || attacker.data.attacks[0];
                        performAttack(attacker, extraTarget, extraAttack, logs);
                    }
                }
            }

            logs.push('');
            round++;
            if (round > 80) {
                logs.push('竞技超时，判定为平局！');
                return { winner: 'draw', logs };
            }
        }

        const winner = side1Units.some(u => u.hp > 0) ? 'side1' : 'side2';
        logs.push(`=== 竞技结束 ===`);
        logs.push(`获胜方：【${winner === 'side1' ? battle.side1.name : battle.side2.name}】`);
        return { winner, logs };
    }

    // 计算赔率
    function calculateOdds(supporters) {
        const side1Total = Object.values(supporters).filter(s => s.side === 'side1').reduce((sum, s) => sum + s.amount, 0);
        const side2Total = Object.values(supporters).filter(s => s.side === 'side2').reduce((sum, s) => sum + s.amount, 0);
        const total = side1Total + side2Total;
        if (total === 0) return { side1: 2.5, side2: 2.5 };
        const side1Odds = side1Total > 0 ? Math.max(1.1, total / side1Total) : 2.5;
        const side2Odds = side2Total > 0 ? Math.max(1.1, total / side2Total) : 2.5;
        return { side1: Math.round(side1Odds * 100) / 100, side2: Math.round(side2Odds * 100) / 100 };
    }

    // ---------- 指令注册 ----------
    const cmd = seal.ext.newCmdItemInfo();
    cmd.name = '斗蛐蛐';
    cmd.help = `克苏鲁生物竞技系统
【.斗蛐蛐 开始】开启新一轮竞技
【.斗蛐蛐 支持 <甲/乙> <数量|all>】为指定方投入源石锭
【.斗蛐蛐 开战】开始竞技（投注结束后）
【.斗蛐蛐 测试 <怪物1|怪物2|...vs怪物3|怪物4|...>】测试模式：固定双方怪物进行竞技（怪物名需精确匹配，支持多只多种，用|分隔同方怪物，用vs分隔双方）（仅骰主可用）
【.斗蛐蛐 查看】查看自己的源石锭
【.斗蛐蛐 排行】查看源石锭排行榜（扣除挖矿获得用于排名）
【.斗蛐蛐 挖矿】每日挖矿（可获得源石锭，默认每日上限由配置决定）
【.斗蛐蛐 说明】查看规则说明`;

    cmd.solve = async (ctx, msg, cmdArgs) => {
        const sub = cmdArgs.getArgN(1);
        const playerId = ctx.player.userId;
        let battles = loadData('battles');
        let players = loadData('players');

        if (!players[playerId]) {
            players[playerId] = {
                gems: seal.ext.getIntConfig(ext, '初始源石锭'),
                totalSupport: 0,
                totalEarned: 0,
                wins: 0,
                loses: 0,
                mineOreTotal: 0,   // 通过挖矿累计获得的源石锭
                minedToday: 0,     // 今日已挖次数
                lastMineDate: ''   // 上次挖矿日期 YYYY-MM-DD
            };
        }

        // 辅助：重置每日挖矿次数（若跨日）
        function resetMineIfNeeded(player) {
            const today = new Date().toISOString().slice(0,10);
            if (player.lastMineDate !== today) {
                player.minedToday = 0;
                player.lastMineDate = today;
            }
        }
        resetMineIfNeeded(players[playerId]);

        switch (sub) {
            case '开始': {
                // 如果该群已有未开始的 battle，且已有玩家投入了源石锭，则阻止新建，避免吞源石锭
                const existing = battles[ctx.group.groupId];
                if (existing && existing.status === 'waiting') {
                    const supporterCount = Object.keys(existing.supporters || {}).length;
                    const anySupportAmount = Object.values(existing.supporters || {}).reduce((s, v) => s + (v.amount || 0), 0);
                    if (supporterCount > 0 && anySupportAmount > 0) {
                        const warnMsg = '⚠️ 当前群已有一场待开始的竞技，且已有玩家投入了源石锭。为了防止资金被覆盖或丢失，不能再次使用【.斗蛐蛐 开始】。\n' +
                            '你可以：\n' +
                            '1. 等待当前竞技由管理员或发起者使用【.斗蛐蛐 开战】开始；\n' +
                            '2. 若需要取消当前等待的竞技，请让发起者或群管理员手动删除该局（例如通过管理工具或清除存档）；';
                        seal.replyToSender(ctx, msg, warnMsg);
                        return seal.ext.newCmdExecuteResult(true);
                    }
                }

                const battle = generateBattle();
                battles[ctx.group.groupId] = battle;
                saveData('battles', battles);

                const msg1 = `🎪 上课！起立！新的竞技即将开始！\n\n` +
                    `【甲方】${battle.side1.name}﹝我寻思这边能行﹞\n` +
                    `【乙方】${battle.side2.name}﹝显然是这边更厉害﹞\n\n` +
                    `请使用【.斗蛐蛐 支持 甲/乙 数量】投入源石锭\n` +
                    `使用【.斗蛐蛐 开战】开始竞技`;
                seal.replyToSender(ctx, msg, msg1);
                return seal.ext.newCmdExecuteResult(true);
            }

            case '测试': {
                if (ctx.privilegeLevel < 100) {
                    seal.replyToSender(ctx, msg, '⚠️ 测试命令仅骰主可用！');
                    return seal.ext.newCmdExecuteResult(true);
                }
                const testPart = cmdArgs.getArgN(2);
                if (!testPart) {
                    seal.replyToSender(ctx, msg, '测试命令格式错误！请提供怪物参数，例如：.斗蛐蛐 测试 深潜者|食尸鬼vs拜亚基|星之精');
                    return seal.ext.newCmdExecuteResult(true);
                }
                if (!testPart.includes('vs')) {
                    seal.replyToSender(ctx, msg, `格式错误！测试命令需使用 'vs' 分隔双方怪物，例如：.斗蛐蛐 测试 深潜者|食尸鬼vs拜亚基|星之精（同方怪物用|分隔）`);
                    return seal.ext.newCmdExecuteResult(true);
                }
                const sides = testPart.split('vs').map(s => s.trim().split('|').filter(m => m.length > 0));
                const side1Monsters = sides[0] || [];
                const side2Monsters = sides[1] || [];
                if (side1Monsters.length === 0 || side2Monsters.length === 0) {
                    seal.replyToSender(ctx, msg, `至少需要指定一方怪物！可用怪物：${Object.keys(monsters).join(', ')}`);
                    return seal.ext.newCmdExecuteResult(true);
                }
                const invalidMonsters = [...side1Monsters, ...side2Monsters].filter(m => !monsters[m]);
                if (invalidMonsters.length > 0) {
                    seal.replyToSender(ctx, msg, `怪物名不正确！无效怪物：${invalidMonsters.join(', ')}\n可用怪物：${Object.keys(monsters).join(', ')}`);
                    return seal.ext.newCmdExecuteResult(true);
                }
                const battle = generateBattle(side1Monsters, side2Monsters);
                battles[ctx.group.groupId] = battle;
                saveData('battles', battles);

                const msg1 = `🧪 测试模式竞技开始！\n\n` +
                    `【甲方】${battle.side1.name}\n` +
                    `【乙方】${battle.side2.name}\n\n` +
                    `请使用【.斗蛐蛐 开战】开始测试竞技`;
                seal.replyToSender(ctx, msg, msg1);
                return seal.ext.newCmdExecuteResult(true);
            }

            case '支持': {
                const side = cmdArgs.getArgN(2);
                let amountStr = cmdArgs.getArgN(3);
                const battle = battles[ctx.group.groupId];

                if (!battle) {
                    seal.replyToSender(ctx, msg, '当前没有进行中的竞技，请先使用【.斗蛐蛐 开始】或【.斗蛐蛐 测试】');
                    return seal.ext.newCmdExecuteResult(true);
                }
                if (battle.status !== 'waiting') {
                    seal.replyToSender(ctx, msg, '当前竞技已经开始，无法投入支持');
                    return seal.ext.newCmdExecuteResult(true);
                }
                if (side !== '甲' && side !== '乙') {
                    seal.replyToSender(ctx, msg, '请指定正确的支持方：甲 或 乙');
                    return seal.ext.newCmdExecuteResult(true);
                }
                let amount;
                if (amountStr === 'all' || amountStr === 'ALL') amount = players[playerId].gems;
                else amount = parseInt(amountStr);
                const minSupport = seal.ext.getIntConfig(ext, '最小投注');
                if (isNaN(amount) || amount < minSupport) {
                    seal.replyToSender(ctx, msg, `投入数量不能少于${minSupport}源石锭`);
                    return seal.ext.newCmdExecuteResult(true);
                }
                if (players[playerId].gems < amount) {
                    seal.replyToSender(ctx, msg, `源石锭不足！当前持有：${players[playerId].gems}源石锭`);
                    return seal.ext.newCmdExecuteResult(true);
                }
                const sideKey = side === '甲' ? 'side1' : 'side2';
                battle.supporters[playerId] = { side: sideKey, amount };
                players[playerId].gems -= amount;
                players[playerId].totalSupport += amount;
                saveData('battles', battles);
                saveData('players', players);

                const odds = calculateOdds(battle.supporters);
                const currentOdds = side === '甲' ? odds.side1 : odds.side2;
                seal.replyToSender(ctx, msg,
                    `✅ 投入成功！为【${side === '甲' ? battle.side1.name : battle.side2.name}】投入${amount}源石锭\n` +
                    `当前预期回报率：${currentOdds}倍\n` +
                    `剩余源石锭：${players[playerId].gems}`);
                return seal.ext.newCmdExecuteResult(true);
            }

            case '开战': {
                const battle = battles[ctx.group.groupId];
                if (!battle) {
                    seal.replyToSender(ctx, msg, '当前没有进行中的竞技');
                    return seal.ext.newCmdExecuteResult(true);
                }
                if (battle.status !== 'waiting') {
                    seal.replyToSender(ctx, msg, '竞技已经结束');
                    return seal.ext.newCmdExecuteResult(true);
                }
                battle.status = 'fighting';
                saveData('battles', battles);

                seal.replyToSender(ctx, msg, '⚔️ 竞技即将开始，请稍候...');
                await sleep(1500);

                const result = simulateBattle(battle);

                const odds = calculateOdds(battle.supporters);
                let settlementMsg = '\n\n💎 结算结果：\n';
                const finalRankings = [];

                for (const pid in battle.supporters) {
                    const support = battle.supporters[pid];
                    if (result.winner === 'draw') {
                        players[pid].gems += support.amount;
                        settlementMsg += `${pid} 平局，返还 ${support.amount} 源石锭\n`;
                        finalRankings.push({ pid, gems: players[pid].gems });
                    } else if ((support.side === result.winner)) {
                        const winOdds = support.side === 'side1' ? odds.side1 : odds.side2;
                        const returnAmount = Math.floor(support.amount * winOdds);
                        players[pid].gems += returnAmount;
                        players[pid].totalEarned += (returnAmount - support.amount);
                        players[pid].wins = (players[pid].wins || 0) + 1;
                        settlementMsg += `${pid} 获胜！回报 ${returnAmount} 源石锭（${winOdds}倍）\n`;
                        finalRankings.push({ pid, gems: players[pid].gems });
                    } else {
                        players[pid].loses = (players[pid].loses || 0) + 1;
                        settlementMsg += `${pid} 失败，损失 ${support.amount} 源石锭\n`;
                        finalRankings.push({ pid, gems: players[pid].gems });
                    }
                }

                finalRankings.sort((a, b) => b.gems - a.gems);
                settlementMsg += '\n📊 本轮参与者排名：\n';
                finalRankings.forEach((item, idx) => {
                    settlementMsg += `${idx + 1}. ${item.pid} - ${item.gems} 源石锭\n`;
                });

                battle.status = 'finished';
                saveData('battles', battles);
                saveData('players', players);

                const aiComment = await generateAIComment(result.logs, battle);
                settlementMsg += aiComment;

                const logLines = result.logs.map(logLine => String(logLine || '').trim()).filter(content => content);
                const settlementLines = settlementMsg.trim().split('\n').filter(content => content);
                const allLines = [...logLines, ...settlementLines];
                const totalLines = allLines.length;

                // 合并转发逻辑：处理99条上限，发送多个独立的合并转发消息
                const useForward = seal.ext.getBoolConfig(ext, '合并转发战斗日志');
                if (useForward && !ctx.isPrivate) {
                    const apiClient = globalThis.net || globalThis.http;
                    if (apiClient && typeof apiClient.callApi === 'function') {
                        try {
                            const epId = ctx.endPoint.userId;
                            const groupIdStr = String(ctx.group.groupId || '').replace('QQ-Group:', '');
                            const groupIdNum = parseInt(groupIdStr) || (ctx.group.groupId && parseInt(ctx.group.groupId));
                            const senderName = seal.ext.getStringConfig(ext, '转发消息发送者昵称');
                            const uin = String(epId || '').replace('QQ:', '');

                            if (totalLines === 0) {
                                seal.replyToSender(ctx, msg, '⚠️ 战斗日志为空');
                                return seal.ext.newCmdExecuteResult(true);
                            }

                            const chunks = [];
                            for (let i = 0; i < totalLines; i += 99) {
                                chunks.push(allLines.slice(i, i + 99));
                            }
                            for (const chunk of chunks) {
                                if (chunk.length === 0) continue;
                                const messages = chunk.map(content => ({
                                    type: 'node',
                                    data: { name: senderName, uin, content }
                                }));
                                await apiClient.callApi(epId, 'send_group_forward_msg', {
                                    group_id: groupIdNum,
                                    messages
                                });
                                if (chunks.indexOf(chunk) < chunks.length - 1) {
                                    await sleep(500);
                                }
                            }
                            await sleep(500);
                            seal.replyToSender(ctx, msg, '✅ 竞技结束，战斗日志已发送！');
                        } catch (error) {
                            console.error(`发送合并转发消息失败: ${error}`);
                            const battleLog = allLines.join('\n');
                            seal.replyToSender(ctx, msg, `⚠️ 发送合并转发消息失败，以下是战斗结果：\n\n${battleLog.substring(0, 1000)}...\n`);
                        }
                    } else {
                            // 如果两种API都不可用，回退到普通消息发送
                            const battleLog = allLines.join('\n');
                            if (battleLog.length > 1000) {
                                seal.replyToSender(ctx, msg, `⚠️ 战斗日志过长，已省略过程，直接显示结果：\n\n${settlementMsg}`);
                            } else {
                                seal.replyToSender(ctx, msg, battleLog);
                            }
                        }
                } else {
                    // 直接发送（如果过长，直接省略战斗过程，只发送结果）
                    const battleLog = allLines.join('\n');
                    if (battleLog.length > 1000) {
                        seal.replyToSender(ctx, msg, `⚠️ 战斗日志过长，已省略过程，直接显示结果：\n\n${settlementMsg}`);
                    } else {
                        seal.replyToSender(ctx, msg, battleLog);
                    }
                }
                return seal.ext.newCmdExecuteResult(true);
            }

            case '查看': {
                const p = players[playerId];
                const msg1 = `💎 你的源石锭状况：\n` +
                    `当前持有：${p.gems}源石锭\n` +
                    `累计投入：${p.totalSupport}\n` +
                    `累计收益：${p.totalEarned}\n` +
                    `胜场/败场：${p.wins || 0}/${p.loses || 0}\n` +
                    `挖矿累计：${p.mineOreTotal}（今日已挖 ${p.minedToday} 次）`;
                seal.replyToSender(ctx, msg, msg1);
                return seal.ext.newCmdExecuteResult(true);
            }

            case '排行': {
                const playerEntries = Object.entries(players);
                const ranking = playerEntries.map(([pid, data]) => {
                    return {
                        pid,
                        total: data.gems || 0,
                        mined: data.mineOreTotal || 0,
                        score: (data.gems || 0) - (data.mineOreTotal || 0)
                    };
                });
                ranking.sort((a, b) => b.score - a.score);
                let out = '🏆 源石锭排行榜（按 总 - 挖矿 排序）\n\n';
                ranking.slice(0, 20).forEach((r, idx) => {
                    out += `${idx + 1}. ${r.pid}：总计 ${r.total}（其中挖矿 ${r.mined}）\n`;
                });
                seal.replyToSender(ctx, msg, out || '暂无数据');
                return seal.ext.newCmdExecuteResult(true);
            }

            case '挖矿': {
                const limit = seal.ext.getIntConfig(ext, '每日挖矿上限') || 3;
                const player = players[playerId];
                resetMineIfNeeded(player);
                if (player.minedToday >= limit) {
                    seal.replyToSender(ctx, msg, `今天挖矿次数已用尽（上限 ${limit} 次）。明天再来吧！`);
                    saveData('players', players);
                    return seal.ext.newCmdExecuteResult(true);
                }
                const gained = Math.floor(Math.random() * 1000) + 1;
                player.gems += gained;
                player.mineOreTotal = (player.mineOreTotal || 0) + gained;
                player.minedToday = (player.minedToday || 0) + 1;
                player.lastMineDate = new Date().toISOString().slice(0,10);
                saveData('players', players);
                seal.replyToSender(ctx, msg, `⛏️ 挖矿成功！你获得了 ${gained} 个源石锭（今日已挖 ${player.minedToday}/${limit} 次）`);
                return seal.ext.newCmdExecuteResult(true);
            }

            case '说明': {
                const ruleMsg = `📖 克苏鲁生物竞技规则：\n\n` +
                    `1. 每场竞技由系统随机匹配生物\n` +
                    `2. 同种生物可能出现多只进行团队作战\n` +
                    `3. 玩家可为任意一方投入源石锭表示支持\n` +
                    `4. 回报率根据双方获得的支持动态计算\n` +
                    `5. 支持获胜方可获得源石锭回报\n` +
                    `6. 支持失败方损失所有投入\n` +
                    `7. 平局返还投入\n` +
                    `8. 可使用\"all\"投入全部源石锭\n` +
                    `9. 挖矿：使用【.斗蛐蛐 挖矿】，每天可挖（默认 ${seal.ext.getIntConfig(ext, '每日挖矿上限')} 次，配置可改），随机获得少量源石锭\n` +
                    `10. 排行榜按（总源石锭 - 挖矿获得）排序，列表中会显示总数与挖矿获得数\n` +
                    `11. 骰主测试：使用【.斗蛐蛐 测试 怪物1|怪物2|...vs怪物3|怪物4|...】固定双方进行测试，支持多只多种怪物，用|分隔同方怪物，用vs分隔双方（仅骰主可用）\n` +
                    `12. 大失败惩罚：根据COC7规则，50%几率自伤1d4（武器卡住反噬），否则武器掉落未命中\n\n` +
                    `⚠️ 投入有风险，支持需谨慎！
                    [CQ:image,file=https://i0.hdslb.com/bfs/archive/36ac5fb44ebcef439a84ee0f58ce49272f82b211.png]`;
                seal.replyToSender(ctx, msg, ruleMsg);
                return seal.ext.newCmdExecuteResult(true);
            }

            default: {
                const helpMsg = `克苏鲁生物竞技系统\n【.斗蛐蛐 开始】开启新一轮竞技\n【.斗蛐蛐 支持 <甲/乙> <数量|all>】为指定方投入源石锭\n【.斗蛐蛐 开战】开始竞技（投注结束后）\n【.斗蛐蛐 测试 <怪物1|怪物2|...vs怪物3|怪物4|...>】测试固定双方（支持多只，用|分隔同方，用vs分隔）（仅骰主可用）\n【.斗蛐蛐 查看】查看自己的源石锭\n【.斗蛐蛐 排行】查看源石锭排行榜\n【.斗蛐蛐 挖矿】每日挖矿\n【.斗蛐蛐 说明】查看规则说明\n[CQ:image,file=https://i0.hdslb.com/bfs/archive/36ac5fb44ebcef439a84ee0f58ce49272f82b211.png]`;
                seal.replyToSender(ctx, msg, helpMsg);
                return seal.ext.newCmdExecuteResult(true);
            }
        }
    };

    ext.cmdMap['斗蛐蛐'] = cmd;
}
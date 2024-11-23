// ==UserScript==
// @name         狂扁小企鹅
// @author       白鱼
// @version      1.0.0
// @description  打企鹅插件，使用.penguin help 查看使用教程
// @timestamp    1732353408
// @license      MIT
// @homepageURL  https://github.com/baiyu-yu/plug-in/
// @updateUrl    https://mirror.ghproxy.com/
// @updateUrl    
// ==/UserScript==

if (!seal.ext.find('penguinBattle')) {
    const ext = seal.ext.new('penguinBattle', 'penguinMaster', '1.1.0');
    seal.ext.register(ext);
    const dbKeyPlayerData = "penguinBattle_playerData";
    const dbKeyEncounters = "penguinBattle_encounters";
    const dbKeyShop = "penguinBattle_shop";
    const dbKeyBoss = "penguinBattle_boss";
    const dbKeyBossCooldown = "penguinBattle_bossCooldown";
    const dbKeyPenguin = "penguinBattle_penguin"; // 新增小企鹅数据库键
    const dbKeyBossParticipants = "penguinBattle_bossParticipants"; // 新增BOSS战参与者数据库键

    // 解析叠加效果
    const parseEffect = (effectString) => {
        const effects = effectString.split('and').map(e => e.trim());
        return (player) => {
            effects.forEach(effect => {
                const [attribute, value] = effect.split('+').map(e => e.trim());
                if (attribute && value && !isNaN(value)) {
                    player[attribute] = Math.max(0, (player[attribute] || 0) + parseInt(value, 10));
                }
            });
        };
    };

    // 默认奇遇和商店物品
    const defaultEncounters = [
        { description: "你在冰洞中发现了一个神秘宝箱，获得攻击力+5", effect: parseEffect("attack+5") },
        { description: "遇到了一群善良的企鹅修女，为你祈祷，生命值+30", effect: parseEffect("maxHealth+30") },
        { description: "你在雪地中练习，获得经验值+100", effect: parseEffect("exp+100") },
        { description: "捡到了一块企鹅黄金，金币+50", effect: parseEffect("gold+50") },
        { description: "被坏企鹅群围攻，生命值-10，防御力+2", effect: (player) => {
            player.health = Math.max(1, player.health - 10);
            player.defense += 2;
        }},
        { description: "你发现了一本古老的战斗秘籍，攻击力+10", effect: parseEffect("attack+10") },
        { description: "你遇到了一位神秘的商人，金币+100", effect: parseEffect("gold+100") },
        { description: "你被一只巨大的企鹅追赶，生命值-20，但获得了速度提升", effect: (player) => {
            player.health = Math.max(1, player.health - 20);
            player.speed += 5;
        }},
        { description: "你发现了一本技能书，学会了新技能", effect: (player) => {
            const newSkill = skills[Math.floor(Math.random() * skills.length)];
            player.skills.push(newSkill);
        }},
        { description: "你遇到了一位神秘的老人，学会了新技能", effect: (player) => {
            const newSkill = skills[Math.floor(Math.random() * skills.length)];
            player.skills.push(newSkill);
        }},
        { description: "你捡到了一块神秘的宝石，攻击力+20", effect: parseEffect("attack+20") },
        { description: "你遇到了一只受伤的小企鹅，生命值+50", effect: parseEffect("health+50") },
        { description: "发现隐藏的洞穴，攻击力+5 and 魔力+10", effect: parseEffect("attack+5 and mana+10") },
        { description: "遇到流浪商人，金币+50", effect: parseEffect("gold+50") }
    ];

    const defaultShop = [
        { name: "铁剑", description: "攻击力+5", cost: 20, effect: parseEffect("attack+5") },
        { name: "盾牌", description: "防御力+3", cost: 15, effect: parseEffect("defense+3") },
        { name: "回复药水", description: "恢复20生命值", cost: 10, effect: (player) => player.health = Math.min(player.maxHealth, player.health + 20) },
        { name: "神秘羽毛披风", description: "防御力+10", cost: 50, effect: parseEffect("defense+10") },
        { name: "勇者长剑", description: "攻击力+20", cost: 100, effect: parseEffect("attack+20") },
        { name: "企鹅捕捉器", description: "对BOSS造成+30额外伤害", cost: 150, effect: () => {} },
        { name: "力量护腕", description: "攻击力+15", cost: 80, effect: parseEffect("attack+15") },
        { name: "生命之戒", description: "生命值+50", cost: 120, effect: parseEffect("maxHealth+50") },
        { name: "技能书", description: "学习新技能", cost: 200, effect: (player) => {
            const newSkill = skills[Math.floor(Math.random() * skills.length)];
            player.skills.push(newSkill);
        }},
        { name: "神秘宝石", description: "攻击力+20", cost: 300, effect: parseEffect("attack+20") },
        { name: "生命药水", description: "恢复50生命值", cost: 50, effect: (player) => player.health = Math.min(player.maxHealth, player.health + 50) },
        { name: "魔法戒指", description: "提升魔力+20", cost: 50, effect: parseEffect("maxMana+20") }
    ];

    // 技能列表
    const skills = [
        { name: "普通攻击", description: "对敌人造成基础攻击力伤害", manaCost: 0, isAOE: false, effect: (player, target) => {
            const damage = Math.max(player.attack - target.defense, 1);
            target.health -= damage;
            return damage;
        }},
        { name: "强力一击", description: "对敌人造成2倍基础攻击力伤害，消耗 10 魔力", manaCost: 10, isAOE: false, effect: (player, target) => {
            const damage = Math.max(player.attack * 2 - target.defense, 1);
            target.health -= damage;
            return damage;
        }},
        { name: "防御姿态", description: "减少50%的伤害，持续1回合，消耗 8 魔力", manaCost: 8, isAOE: false, effect: (player, target) => {
            player.defense += player.defense * 0.5;
            player.buffs = player.buffs || [];
            player.buffs.push({ type: 'defense', value: player.defense * 0.5, duration: 1 });
            return 0;
        }},
        { name: "虚弱诅咒", description: "使敌人下回合攻击力减半，持续1回合，消耗 12 魔力", manaCost: 12, isAOE: false, effect: (player, target) => {
            target.attack = Math.floor(target.attack / 2);
            target.debuffs = target.debuffs || [];
            target.debuffs.push({ type: 'attack', value: target.attack / 2, duration: 1 });
            return 0;
        }},
        { name: "生命吸取", description: "对敌人造成伤害并恢复等量生命值，消耗 15 魔力", manaCost: 15, isAOE: false, effect: (player, target) => {
            const damage = Math.max(player.attack - target.defense, 1);
            target.health -= damage;
            player.health = Math.min(player.maxHealth, player.health + damage);
            return damage;
        }},
        { name: "火焰风暴", description: "对所有敌人造成基础攻击力伤害，消耗 20 魔力", manaCost: 20, isAOE: true, effect: (player, targets) => { 
            const totalDamage = targets.reduce((damageSum, target) => {
                const damage = Math.max(player.attack - target.defense, 1);
                target.health -= damage;
                return damageSum + damage;
            }, 0);
            return totalDamage;
        }},
        { name: "冰冻陷阱", description: "使敌人下回合无法行动，持续1回合，消耗 18 魔力", manaCost: 18, isAOE: false, effect: (player, target) => {
            target.frozen = true;
            target.debuffs = target.debuffs || [];
            target.debuffs.push({ type: 'frozen', duration: 1 });
            return 0;
        }},
        { name: "雷霆一击", description: "造成3倍伤害，消耗 25 魔力", manaCost: 25, isAOE: false, effect: (player, target) => {
            const damage = player.attack * 3;
            target.health -= damage;
            return damage;
        }}
    ];

    // 计算下一等级所需经验
    const calculateNextLevelExp = (level) => level * 100;

    // 生成小企鹅和BOSS
    const generateBoss = (players) => {
        const totalLevels = players.reduce((sum, p) => sum + p.level, 0);
        const averageLevel = Math.ceil(totalLevels / players.length);
    
        return {
            health: averageLevel * 100,
            attack: averageLevel * 10,
            defense: averageLevel * 5,
            specialAttack: averageLevel * 15,
            skills: [
                { name: "群体攻击", effect: (boss, targets) => targets.forEach(p => p.health = Math.max(1, p.health - boss.specialAttack)) },
                { name: "护盾", effect: (boss) => boss.defense += 10 }
            ],
            description: generateBossDescription(),
            rewardGold: averageLevel * 50,
            rewardExp: averageLevel * 100,
            itemChance: 0.2, // 20%概率获得道具
        };
    };

    const generatePenguin = (playerLevel) => ({
        health: Math.floor(10 + playerLevel * 3),
        attack: Math.floor(2 + playerLevel * 1),
        gold: Math.floor(5 + playerLevel * 2),
        exp: Math.floor(10 + playerLevel * 3),
        defense: 1,
        skills: [skills[0]],
        description: generatePenguinDescription(),
    });

    // 生成小企鹅和BOSS的外貌描述
    const generatePenguinDescription = () => {
        const descriptions = [
            "一只胖乎乎的小企鹅，看起来很可爱。",
            "一只戴着红色围巾的小企鹅，看起来很时尚。",
            "一只戴着蓝色帽子的小企鹅，看起来很酷。",
            "一只戴着黄色手套的小企鹅，看起来很温暖。",
        ];
        return descriptions[Math.floor(Math.random() * descriptions.length)];
    };

    const generateBossDescription = () => {
        const descriptions = [
            "一只巨大的企鹅，身上覆盖着厚厚的冰甲。",
            "一只身披金色羽毛的企鹅，看起来非常威严。",
            "一只全身燃烧着火焰的企鹅，看起来非常危险。",
            "一只身披闪电的企鹅，看起来非常迅捷。",
        ];
        return descriptions[Math.floor(Math.random() * descriptions.length)];
    };

    // 数据加载
    const loadDatabase = (key, defaultValue) => {
        const data = ext.storageGet(key);
        return data ? JSON.parse(data) : defaultValue;
    };

    const players = loadDatabase(dbKeyPlayerData, {});
    const encounters = loadDatabase(dbKeyEncounters, defaultEncounters);
    const shop = loadDatabase(dbKeyShop, defaultShop);
    let boss = loadDatabase(dbKeyBoss, null);
    let bossCooldown = loadDatabase(dbKeyBossCooldown, { count: 0, lastReset: Date.now() });
    let bossParticipants = loadDatabase(dbKeyBossParticipants, {});

    // 保存数据到数据库
    const saveDatabase = (key, value) => ext.storageSet(key, JSON.stringify(value));

    // 自动升级逻辑
    const checkAndLevelUp = (player) => {
        const nextLevelExp = calculateNextLevelExp(player.level);
        if (player.exp >= nextLevelExp) {
            player.level++;
            player.exp -= nextLevelExp;
            player.maxHealth += 10;
            player.maxMana += 5;
            player.health = player.maxHealth;
            player.mana = player.maxMana;
            return true;
        }
        return false;
    };

    // 重置每日BOSS次数
    const resetBossCooldown = () => {
        const now = Date.now();
        if (now - bossCooldown.lastReset >= 24 * 60 * 60 * 1000) {
            bossCooldown = { count: 0, lastReset: now };
            saveDatabase(dbKeyBossCooldown, bossCooldown);
        }
    };

    // 企鹅潮逻辑
    const encounterPenguinSwarm = (player) => {
        const swarmSize = Math.floor(Math.random() * 5) + 3; // 生成3到7只小企鹅
        const penguins = Array.from({ length: swarmSize }, () => generatePenguin(player.level));
    
        let totalDamage = 0;
        let totalGold = 0;
        let totalExp = 0;
        let playerEscaped = false;
    
        // 战斗逻辑
        while (penguins.some(penguin => penguin.health > 0) && player.health > 0) {
            // 玩家使用技能攻击
            const skill = player.skills[Math.floor(Math.random() * player.skills.length)];
            if (player.mana >= skill.manaCost) {
                player.mana -= skill.manaCost;
                let damage = 0;
                if (skill.isAOE) {
                    // 群攻技能
                    damage = skill.effect(player, penguins);
                } else {
                    // 单体技能
                    const target = penguins.find(penguin => penguin.health > 0);
                    if (target) {
                        damage = skill.effect(player, target);
                    }
                }
                totalDamage += damage;
                penguins.forEach(penguin => {
                    if (penguin.health <= 0) {
                        totalGold += penguin.gold;
                        totalExp += penguin.exp;
                    }
                });
            } else {
                // 普通攻击
                const target = penguins.find(penguin => penguin.health > 0);
                if (target) {
                    const damage = Math.max(player.attack - target.defense, 1);
                    target.health -= damage;
                    totalDamage += damage;
                    if (target.health <= 0) {
                        totalGold += target.gold;
                        totalExp += target.exp;
                    }
                }
            }
    
            // 小企鹅反击
            penguins.forEach(penguin => {
                if (penguin.health > 0) {
                    const penguinDamage = Math.max(penguin.attack - player.defense, 1);
                    player.health -= penguinDamage;
                }
            });
    
            // 检查玩家是否可以脱身
            if (player.health <= 1 && player.speed >= 1) {
                playerEscaped = true;
                seal.replyToSender(ctx, msg, `你利用速度优势成功脱身，避免了企鹅潮的致命攻击！`);
                break;
            }
        }
    
        if (!playerEscaped) {
            if (player.health <= 0) {
                seal.replyToSender(ctx, msg, `你在企鹅潮中被击败了！`);
            } else {
                player.gold += totalGold;
                player.exp += totalExp;
                seal.replyToSender(ctx, msg, `你在企鹅潮中战斗，共造成 ${totalDamage} 点伤害，获得 ${totalGold} 金币和 ${totalExp} 经验值！`);
            }
        }
    };    

    // 小企鹅数据管理函数
    const managePenguinData = (userId) => {
        const dbKey = `${dbKeyPenguin}_${userId}`;

        // 加载小企鹅数据
        const loadPenguin = () => {
            const data = ext.storageGet(dbKey);
            return data ? JSON.parse(data) : null;
        };

        // 保存小企鹅数据
        const savePenguin = (penguin) => {
            ext.storageSet(dbKey, JSON.stringify(penguin));
        };

        // 删除小企鹅数据
        const deletePenguin = () => {
            ext.storageSet(dbKey, null);
        };

        return {
            loadPenguin,
            savePenguin,
            deletePenguin,
        };
    };

    // 定义命令
    const cmdPenguinBattle = seal.ext.newCmdItemInfo();
    cmdPenguinBattle.name = 'penguin';
    cmdPenguinBattle.help = `
指令：
.penguin 新建角色 - 创建角色
.penguin 开始 - 开始筹备BOSS战
.penguin 加入 - 加入BOSS战
.penguin 开始BOSS战 - 开始BOSS战斗
.penguin 攻击 - 攻击BOSS或企鹅
.penguin 状态 - 查看状态
.penguin 技能 编号/技能名 - 使用技能
.penguin 休息 - 开始休息
.penguin 结束休息 - 结束休息
.penguin 作弊 - 管理员作弊指令
.penguin 商店 - 查看商店
.penguin 购买 序号/物品名 - 购买物品
.penguin 排行榜 - 查看排行榜
.penguin help - 查看帮助
.penguin 冒险 - 出去冒险
.penguin 休息 - 开始休息
.penguin 结束休息 - 结束休息
管理员指令：
.penguin 管理 奇遇 - 查看奇遇列表
.penguin 管理 添加奇遇 描述|代码 - 添加奇遇
.penguin 管理 移除奇遇 序号 - 移除奇遇
.penguin 管理 商店 - 查看商店列表
.penguin 管理 添加商店 名称|描述|价格|效果 - 添加商店物品
.penguin 管理 移除商店 序号 - 移除商店物品`;

    cmdPenguinBattle.solve = async (ctx, msg, cmdArgs) => {
        const userId = ctx.player.userId;
        const playerName = ctx.player.name;
        const groupId = ctx.group.groupId;

        // 初始化角色检查
        if (!players[userId] && cmdArgs.getArgN(1) !== '新建角色' && cmdArgs.getArgN(1) !== 'help') {
            seal.replyToSender(ctx, msg, '请先创建角色！使用 ".penguin 新建角色" 或查看帮助 ".penguin help"');
            return;
        }

        const player = players[userId];
        const command = cmdArgs.getArgN(1);

        switch (command) {
            case '新建角色': {
                console.log('新建角色指令被触发');
            
                players[userId] = {
                    level: 1, exp: 0, gold: 0, attack: 5, defense: 3, 
                    health: 50, maxHealth: 50, mana: 20, maxMana: 20, 
                    speed: 0, skills: [skills[0]], groupId
                };
                saveDatabase(dbKeyPlayerData, players);
            
                const player = players[userId];
                const playerName = ctx.player.name;
                const nextLevelExp = calculateNextLevelExp(player.level);
                const expToNextLevel = nextLevelExp - player.exp;
            
                // 发送消息
                seal.replyToSender(ctx, msg, `角色创建成功！
玩家名: ${playerName}
等级: ${player.level}
经验值: ${player.exp} / ${nextLevelExp} (升级还需 ${expToNextLevel})
金币: ${player.gold}
攻击力: ${player.attack}
防御力: ${player.defense}
生命值: ${player.health}/${player.maxHealth}
魔力值: ${player.mana}/${player.maxMana}
速度: ${player.speed}
技能: ${player.skills.map((skill, index) => `${index + 1}. ${skill.name}`).join(', ')}`);
                break;
            }

            case '状态': {
                const nextLevelExp = calculateNextLevelExp(player.level);
                const expToNextLevel = nextLevelExp - player.exp;
                seal.replyToSender(ctx, msg, `
玩家名: ${playerName}
等级: ${player.level}
经验值: ${player.exp} / ${nextLevelExp} (升级还需 ${expToNextLevel})
金币: ${player.gold}
攻击力: ${player.attack}
防御力: ${player.defense}
生命值: ${player.health}/${player.maxHealth}
魔力值: ${player.mana}/${player.maxMana}
速度: ${player.speed}
技能: ${player.skills.map((skill, index) => `${index + 1}. ${skill.name}`).join(', ')}`);
                break;
            }

            case '开始': {
                if (players[userId]?.resting) {
                    seal.replyToSender(ctx, msg, '你正在休息中，无法进行其他活动！请使用 ".penguin 结束休息" 结束后再操作。');
                    return;
                }
                resetBossCooldown();                
                if (bossCooldown.count >= 3) {
                    seal.replyToSender(ctx, msg, '今天的BOSS战次数已用完，请明天再来！');
                    return;
                }
                if (boss) {
                    seal.replyToSender(ctx, msg, '当前已经有BOSS存在，请直接加入战斗！');
                    return;
                }
                bossParticipants = {};
                saveDatabase(dbKeyBossParticipants, bossParticipants);
                seal.replyToSender(ctx, msg, `开始筹备BOSS战！请其他玩家使用 ".penguin 加入" 加入BOSS战。`);
                break;
            }

            case '加入': {
                if (players[userId]?.resting) {
                    seal.replyToSender(ctx, msg, '你正在休息中，无法进行其他活动！请使用 ".penguin 结束休息" 结束后再操作。');
                    return;
                }
                if (!bossParticipants) {
                    seal.replyToSender(ctx, msg, '当前没有BOSS战筹备！');
                    return;
                }
                if (bossParticipants[userId]) {
                    seal.replyToSender(ctx, msg, '你已经加入了BOSS战！');
                    return;
                }
                bossParticipants[userId] = true;
                saveDatabase(dbKeyBossParticipants, bossParticipants);
                seal.replyToSender(ctx, msg, `你加入了BOSS战！`);
                break;
            }

            case '开始BOSS战': {
                if (players[userId]?.resting) {
                    seal.replyToSender(ctx, msg, '你正在休息中，无法进行其他活动！请使用 ".penguin 结束休息" 结束后再操作。');
                    return;
                }
                const groupPlayers = Object.values(players).filter(player => bossParticipants[player.userId]);
                if (groupPlayers.length === 0) {
                    seal.replyToSender(ctx, msg, '没有玩家加入BOSS战！');
                    return;
                }
                boss = generateBoss(groupPlayers);
                saveDatabase(dbKeyBoss, boss);
                bossParticipants = {};
                saveDatabase(dbKeyBossParticipants, bossParticipants);
                seal.replyToSender(ctx, msg, `BOSS战开始！\n血量: ${boss.health}\n攻击: ${boss.attack}\n特殊攻击: ${boss.specialAttack}\n描述: ${boss.description}`);
                break;
            }

            case '攻击':
                case '技能': {
                    const player = players[userId];
                    const penguinManager = managePenguinData(userId);
                    let target;
                    if (players[userId]?.resting) {
                        seal.replyToSender(ctx, msg, '你正在休息中，无法进行其他活动！请使用 ".penguin 结束休息" 结束后再操作。');
                        return;
                    }
                    if (boss && bossParticipants[userId]) {
                        target = boss;
                    } else {
                        target = penguinManager.loadPenguin();
                        if (!target) {
                            seal.replyToSender(ctx, msg, '当前没有目标可供攻击！');
                            return;
                        }
                    }
                
                    let damage = 0;
                    if (command === '技能') {
                        const skillArg = cmdArgs.getArgN(2);
                        let skillIndex = parseInt(skillArg, 10) - 1;
                        if (isNaN(skillIndex)) {
                            skillIndex = player.skills.findIndex(skill => skill.name === skillArg);
                            if (skillIndex === -1) {
                                seal.replyToSender(ctx, msg, '无效技能编号或技能名！');
                                return;
                            }
                        }
                        const skill = player.skills[skillIndex];
                        if (player.mana < skill.manaCost) {
                            seal.replyToSender(ctx, msg, `魔力不足，无法使用技能 "${skill.name}"！`);
                            return;
                        }
                        player.mana -= skill.manaCost;
                        damage = skill.effect(player, target);
                        penguinManager.savePenguin(target);
                
                        // 构建返回消息
                        let targetDebuffs = target.debuffs ? target.debuffs.map(debuff => `${debuff.type} - ${debuff.value} (剩余 ${debuff.duration} 回合)`).join(', ') : '无';
                        let playerBuffs = player.buffs ? player.buffs.map(buff => `${buff.type} - ${buff.value} (剩余 ${buff.duration} 回合)`).join(', ') : '无';
                        seal.replyToSender(ctx, msg, `使用技能 "${skill.name}" 成功！对目标造成了 ${damage} 点伤害！消耗魔力: ${skill.manaCost}\n目标剩余血量: ${target.health}\n目标debuff: ${targetDebuffs}\n玩家buff: ${playerBuffs}`);
                    } else {
                        damage = Math.max(player.attack - target.defense, 1);
                        target.health -= damage;
                        penguinManager.savePenguin(target);
                
                        // 构建返回消息
                        let targetDebuffs = target.debuffs ? target.debuffs.map(debuff => `${debuff.type} - ${debuff.value} (剩余 ${debuff.duration} 回合)`).join(', ') : '无';
                        let playerBuffs = player.buffs ? player.buffs.map(buff => `${buff.type} - ${buff.value} (剩余 ${buff.duration} 回合)`).join(', ') : '无';
                        seal.replyToSender(ctx, msg, `你对${target === boss ? 'BOSS' : '小企鹅'}造成了 ${damage} 点伤害！\n${target === boss ? 'BOSS' : '小企鹅'}剩余血量: ${target.health}\n目标debuff: ${targetDebuffs}\n玩家buff: ${playerBuffs}`);
                    }
                
                    if (target.health <= 0) {
                        if (target === boss) {
                            // 群BOSS被击败，发放奖励
                            const rewardGold = target.rewardGold;
                            const rewardExp = target.rewardExp;
                            player.gold += rewardGold;
                            player.exp += rewardExp;
                
                            // 随机触发道具奖励
                            if (Math.random() < target.itemChance) {
                                const specialItem = shop[Math.floor(Math.random() * shop.length)];
                                if (specialItem) {
                                    specialItem.effect(player);
                                    seal.replyToSender(ctx, msg, `恭喜！你获得了稀有道具 "${specialItem.name}"：${specialItem.description}`);
                                }
                            }
                
                            seal.replyToSender(ctx, msg, `BOSS被击败！\n你获得 ${rewardGold} 金币和 ${rewardExp} 经验值！`);
                            boss = null; // BOSS被击败后清空
                            saveDatabase(dbKeyBoss, boss);
                        } else {
                            // 小企鹅被击败，发放奖励
                            const rewardGold = target.gold;
                            const rewardExp = target.exp;
                            player.gold += rewardGold;
                            player.exp += rewardExp;
                
                            seal.replyToSender(ctx, msg, `小企鹅被你击败！\n你获得 ${rewardGold} 金币和 ${rewardExp} 经验值！`);
                
                            // 随机触发奇遇
                            if (Math.random() < 0.3) { // 30%触发奇遇
                                const encounter = encounters[Math.floor(Math.random() * encounters.length)];
                                encounter.effect(player); // 执行奇遇效果
                                seal.replyToSender(ctx, msg, `奇遇事件触发！\n${encounter.description}`);
                            }
                
                            // 删除小企鹅数据
                            penguinManager.deletePenguin();
                        }
                    } else {
                        // 反击逻辑
                        if (target === boss) {
                            const retaliationDamage = Math.max(target.attack - player.defense, 1);
                            player.health = Math.max(1, player.health - retaliationDamage);
                            seal.replyToSender(ctx, msg, `BOSS进行了反击，你受到了 ${retaliationDamage} 点伤害！\n当前生命值: ${player.health}`);
                        } else {
                            const retaliationDamage = Math.max(target.attack - player.defense, 1);
                            player.health = Math.max(1, player.health - retaliationDamage);
                            seal.replyToSender(ctx, msg, `小企鹅反击，你受到了 ${retaliationDamage} 点伤害！\n当前生命值: ${player.health}`);
                        }
                    }
                
                    // 保存玩家数据
                    saveDatabase(dbKeyPlayerData, players);
                    return;
                }

            case '排行榜': {
                // 查看排行榜
                if (players[userId]?.resting) {
                    seal.replyToSender(ctx, msg, '你正在休息中，无法进行其他活动！请使用 ".penguin 结束休息" 结束后再操作。');
                    return;
                }                
                const leaderboard = Object.entries(players)
                    .map(([id, player]) => ({
                        id,
                        level: player.level,
                        gold: player.gold,
                        power: player.attack + player.defense,
                    }))
                    .sort((a, b) => b.level - a.level || b.gold - a.gold || b.power - a.power);
        
                const rankList = leaderboard.map((player, index) =>
                    `${index + 1}. 用户ID: ${player.id} - 等级: ${player.level}, 金币: ${player.gold}, 战斗力: ${player.power}`
                ).join('\n');
        
                seal.replyToSender(ctx, msg, `排行榜:\n${rankList}`);
                return;
            }
            
            case '冒险': {
                const player = players[userId];
                const penguinManager = managePenguinData(userId);
                const penguin = generatePenguin(player.level);
                const encounterChance = 0.3; // 30%触发奇遇
                const bossChance = 0.1; // 10%生成BOSS
                const penguinSwarmChance = 0.03; // 3%触发企鹅潮
            
                if (players[userId]?.resting) {
                    seal.replyToSender(ctx, msg, '你正在休息中，无法进行其他活动！请使用 ".penguin 结束休息" 结束后再操作。');
                    return;
                }
            
                if (Math.random() < bossChance && !boss) {
                    bossParticipants = {};
                    saveDatabase(dbKeyBossParticipants, bossParticipants);
                    seal.replyToSender(ctx, msg, `你在冒险中发现了一只强大的BOSS！\n血量: ${boss.health}\n攻击: ${boss.attack}\n特殊攻击: ${boss.specialAttack}\n描述: ${boss.description}`);
                } else if (Math.random() < penguinSwarmChance) {
                    encounterPenguinSwarm(player);
                } else {
                    penguinManager.savePenguin(penguin);
                    seal.replyToSender(ctx, msg, `你在冒险中发现了一只小企鹅！\n血量: ${penguin.health}\n攻击: ${penguin.attack}\n描述: ${penguin.description}`);
                }
            
                if (Math.random() < encounterChance) {
                    const encounter = encounters[Math.floor(Math.random() * encounters.length)];
                    encounter.effect(player);
                    seal.replyToSender(ctx, msg, `奇遇事件触发！\n${encounter.description}`);
                }
            
                saveDatabase(dbKeyPlayerData, players);
                return;
            }

            case '加入': {
                if (players[userId]?.resting) {
                    seal.replyToSender(ctx, msg, '你正在休息中，无法进行其他活动！请使用 ".penguin 结束休息" 结束后再操作。');
                    return;
                }
                
                if (!bossParticipants) {
                    seal.replyToSender(ctx, msg, '当前没有BOSS战筹备！');
                    return;
                }               
                const player = players[userId];
                if (!bossParticipants[userId]) {
                    bossParticipants[userId] = true;
                    seal.replyToSender(ctx, msg, `你加入了BOSS战！`);
                } else {
                    seal.replyToSender(ctx, msg, `你已经在BOSS战中了！`);
                }

                saveDatabase(dbKeyPlayerData, players);
                return;
            }

            case '商店': {
                // 查看商店物品
                if (players[userId]?.resting) {
                    seal.replyToSender(ctx, msg, '你正在休息中，无法进行其他活动！请使用 ".penguin 结束休息" 结束后再操作。');
                    return;
                }                
                const shopItems = shop.map((item, index) => `${index + 1}. ${item.name} - ${item.description} (${item.cost} 金币)`).join('\n');
                seal.replyToSender(ctx, msg, `商店物品:\n${shopItems}`);
                return;
            }
        
            case '购买': {
                // 购买物品逻辑
                if (players[userId]?.resting) {
                    seal.replyToSender(ctx, msg, '你正在休息中，无法进行其他活动！请使用 ".penguin 结束休息" 结束后再操作。');
                    return;
                }                
                const itemArg = cmdArgs.getArgN(2);
                let itemIndex = parseInt(itemArg, 10) - 1;
                if (isNaN(itemIndex)) {
                    itemIndex = shop.findIndex(item => item.name === itemArg);
                    if (itemIndex === -1) {
                        seal.replyToSender(ctx, msg, '无效物品序号或物品名！');
                        return;
                    }
                }
                const player = players[userId];
        
                if (isNaN(itemIndex) || itemIndex < 0 || itemIndex >= shop.length) {
                    seal.replyToSender(ctx, msg, '请输入有效的物品序号！');
                    return;
                }
        
                const item = shop[itemIndex];
                if (player.gold < item.cost) {
                    seal.replyToSender(ctx, msg, `金币不足，无法购买 "${item.name}"！`);
                    return;
                }
        
                player.gold -= item.cost;
                item.effect(player);
                saveDatabase(dbKeyPlayerData, players);
        
                seal.replyToSender(ctx, msg, `你成功购买了 "${item.name}"！\n当前金币: ${player.gold}`);
                return;
            }

            case '作弊': {
                if (!isAdmin) {
                    seal.replyToSender(ctx, msg, '你没有管理员权限！');
                    return;
                }
                if (players[userId]?.resting) {
                    seal.replyToSender(ctx, msg, '你正在休息中，无法进行其他活动！请使用 ".penguin 结束休息" 结束后再操作。');
                    return;
                }                
            
                const subCommand = cmdArgs.getArgN(2);
                const value = parseInt(cmdArgs.getArgN(3), 10);
                if (isNaN(value) || value <= 0) {
                    seal.replyToSender(ctx, msg, '请输入有效的数值！');
                    return;
                }
            
                switch (subCommand) {
                    case '伤害': {
                        let target = boss || managePenguinData(userId).loadPenguin();
                        if (!target) {
                            seal.replyToSender(ctx, msg, '当前没有目标可供作弊！');
                            return;
                        }
            
                        target.health -= value;
                        if (target === boss) {
                            saveDatabase(dbKeyBoss, target);
                        } else {
                            managePenguinData(userId).savePenguin(target);
                        }
                        seal.replyToSender(ctx, msg, `作弊成功！对${boss ? 'BOSS' : '小企鹅'}造成了 ${value} 点伤害。\n剩余血量: ${target.health}`);
                        return;
                    }
            
                    case '金币': {
                        players[userId].gold += value;
                        saveDatabase(dbKeyPlayerData, players);
                        seal.replyToSender(ctx, msg, `作弊成功！获得 ${value} 金币。\n当前金币: ${players[userId].gold}`);
                        return;
                    }
            
                    case '经验': {
                        players[userId].exp += value;
                        saveDatabase(dbKeyPlayerData, players);
                        seal.replyToSender(ctx, msg, `作弊成功！获得 ${value} 经验值。\n当前经验值: ${players[userId].exp}`);
                        return;
                    }
            
                    case '等级': {
                        players[userId].level = value;
                        saveDatabase(dbKeyPlayerData, players);
                        seal.replyToSender(ctx, msg, `作弊成功！等级提升至 ${value}！`);
                        return;
                    }
            
                    default: {
                        seal.replyToSender(ctx, msg, '未知作弊指令！请使用 ".penguin 作弊 帮助" 查看帮助。');
                        return;
                    }
                }
            }

            case 'help': {
                // 查看帮助
                seal.replyToSender(ctx, msg, cmdPenguinBattle.help);
                return;
            }

            case '休息': {
                const player = players[userId];
                if (player.resting) {
                    seal.replyToSender(ctx, msg, '你已经在休息中，请使用 ".penguin 结束休息" 结束后再操作！');
                    return;
                }
            
                player.resting = true; // 标记为休息状态
                player.restStartTime = Date.now(); // 记录休息开始时间
                saveDatabase(dbKeyPlayerData, players);
            
                seal.replyToSender(ctx, msg, '你开始休息了！魔力和生命值将随着时间恢复。');
                return;
            }
            
            case '结束休息': {
                const player = players[userId];
                if (!player.resting) {
                    seal.replyToSender(ctx, msg, '你当前并未处于休息状态！');
                    return;
                }
            
                const restDuration = Date.now() - player.restStartTime;
                const healthRecovery = Math.floor(restDuration / (5 * 60 * 1000)) * 10; // 每5分钟恢复10生命值
                const manaRecovery = Math.floor(restDuration / (5 * 60 * 1000)) * 5; // 每5分钟恢复5魔力
            
                player.health = Math.min(player.maxHealth, player.health + healthRecovery);
                player.mana = Math.min(player.maxMana, player.mana + manaRecovery);
                player.resting = false;
                player.restStartTime = null; // 清空休息时间记录
                saveDatabase(dbKeyPlayerData, players);
            
                seal.replyToSender(ctx, msg, `休息结束！你恢复了 ${healthRecovery} 点生命值和 ${manaRecovery} 点魔力。\n当前生命值: ${player.health}/${player.maxHealth}\n当前魔力: ${player.mana}/${player.maxMana}`);
                return;
            } 

            case '管理': {
                if (ctx.privilegeLevel < 50) {
                    seal.replyToSender(ctx, msg, '无权限执行此操作！');
                    return;
                }

                const subCommand = cmdArgs.getArgN(2);
                switch (subCommand) {
                    case '奇遇': {
                        const encounterList = defaultEncounters.map((encounter, index) =>
                            `${index + 1}. ${encounter.description}`
                        ).join('\n');
                        seal.replyToSender(ctx, msg, `奇遇事件列表:\n${encounterList}`);
                        break;
                    }

                    case '添加奇遇': {
                        const [description, code] = cmdArgs.getArgN(3).split('|');
                        if (!description || !code) {
                            seal.replyToSender(ctx, msg, '请输入正确的格式: 描述|代码');
                            return;
                        }

                        const newEncounter = {
                            description: description.trim(),
                            effect: parseEffect(code.trim()),
                        };

                        defaultEncounters.push(newEncounter);
                        saveDatabase(dbKeyEncounters, defaultEncounters);
                        seal.replyToSender(ctx, msg, `成功添加奇遇事件: ${description}`);
                        break;
                    }

                    case '移除奇遇': {
                        const index = parseInt(cmdArgs.getArgN(3), 10) - 1;
                        if (isNaN(index) || index < 0 || index >= defaultEncounters.length) {
                            seal.replyToSender(ctx, msg, '请输入有效的奇遇事件序号！');
                            return;
                        }

                        const removed = defaultEncounters.splice(index, 1);
                        saveDatabase(dbKeyEncounters, defaultEncounters);
                        seal.replyToSender(ctx, msg, `成功移除奇遇事件: ${removed[0].description}`);
                        break;
                    }

                    case '商店': {
                        const shopList = defaultShop.map((item, index) =>
                            `${index + 1}. ${item.name} - ${item.description} (${item.cost} 金币)`
                        ).join('\n');
                        seal.replyToSender(ctx, msg, `商店物品列表:\n${shopList}`);
                        break;
                    }

                    case '添加商店': {
                        const [name, description, cost, effectString] = cmdArgs.getArgN(3).split('|');
                        if (!name || !description || !cost || !effectString) {
                            seal.replyToSender(ctx, msg, '请输入正确的格式: 名称|描述|价格|效果');
                            return;
                        }

                        const newItem = {
                            name: name.trim(),
                            description: description.trim(),
                            cost: parseInt(cost.trim(), 10),
                            effect: parseEffect(effectString.trim())
                        };

                        defaultShop.push(newItem);
                        saveDatabase(dbKeyShop, defaultShop);
                        seal.replyToSender(ctx, msg, `成功添加商店物品: ${name}`);
                        break;
                    }

                    case '移除商店': {
                        const index = parseInt(cmdArgs.getArgN(3), 10) - 1;
                        if (isNaN(index) || index < 0 || index >= defaultShop.length) {
                            seal.replyToSender(ctx, msg, '请输入有效的商店物品序号！');
                            return;
                        }

                        const removed = defaultShop.splice(index, 1);
                        saveDatabase(dbKeyShop, defaultShop);
                        seal.replyToSender(ctx, msg, `成功移除商店物品: ${removed[0].name}`);
                        break;
                    }

                    default: {
                        seal.replyToSender(ctx, msg, '未知管理员指令，请使用 .penguin 管理 帮助 查看帮助！');
                        break;
                    }
                }
                break;
            }
        }

        // 检查是否升级
        if (checkAndLevelUp(player)) {
            saveDatabase(dbKeyPlayerData, players);
            seal.replyToSender(ctx, msg, `恭喜你升级了！当前等级: ${player.level}`);
        }
    };

    ext.cmdMap['penguin'] = cmdPenguinBattle;
}
// ==UserScript==
// @name         狂扁小企鹅
// @author       白鱼
// @version      1.0.0
// @description  打企鹅插件，使用.penguin help 查看使用教程
// @timestamp    1732353408
// @license      MIT
// @homepageURL  https://github.com/baiyu-yu/plug-in/
// @updateUrl    https://mirror.ghproxy.com/https://raw.githubusercontent.com/baiyu-yu/plug-in/refs/heads/main/%E6%89%93%E4%BC%81%E9%B9%85.js
// @updateUrl    https://raw.githubusercontent.com/baiyu-yu/plug-in/refs/heads/main/%E6%89%93%E4%BC%81%E9%B9%85.js
// ==/UserScript==

if (!seal.ext.find('penguinBattle')) {
    const ext = seal.ext.new('penguinBattle', 'penguinMaster', '1.0.0');
    seal.ext.register(ext);
    const dbKeyPlayerData = "penguinBattle_playerData";
    const dbKeyEncounters = "penguinBattle_encounters";
    const dbKeyShop = "penguinBattle_shop";
    const dbKeyGroupBoss = `penguinBattle_boss`;
    const dbKeyBossCooldown = "penguinBattle_bossCooldown";
    const dbKeyPenguin = "penguinBattle_penguin"; // 小企鹅数据库键
    const dbKeyPenguinEgg = "penguinBattle_penguinEgg"; // 企鹅蛋数据库键
    const dbKeyPvP = "penguinBattle_pvp"; // PvP数据库键
    const dbKeyHouses = "penguinBattle_houses"; // 房产数据库键
    const dbKeyTitles = "penguinBattle_titles"; // 称号数据库键
    const dbKeySignIn = "penguinBattle_signIn"; // 签到数据库键

    // 内置函数映射
    const builtInEffectMap = {
        "1": (player, target) => {
            const damage = Math.max(player.attack - target.defense, 1);
            target.health -= damage;
            return damage;
        },
        "2": (player, target) => {
            const damage = player.attack * 2;
            target.health -= damage;
            return damage;
        },
        "3": (player, target) => {
            player.defense += player.defense * 0.5;
            player.buffs = player.buffs || [];
            player.buffs.push({ type: 'defense', value: player.defense * 0.5, duration: 3 });
            return 0;
        },
        "4": (player, target) => {
            target.attack = Math.floor(target.attack / 2);
            target.debuffs = target.debuffs || [];
            target.debuffs.push({ type: 'attack', value: target.attack / 2, duration: 1 });
            return 0;
        },
        "5": (player, target) => {
            const damage = Math.max(player.attack - target.defense, 1);
            target.health -= damage;
            player.health = Math.min(player.maxHealth, player.health + damage);
            return damage;
        },
        "6": (player, target) => {
            const damage = player.attack * 2.5;
            target.health -= damage;
            return damage;
        },
        "7": (player, target) => {
            target.frozen = true;
            target.debuffs = target.debuffs || [];
            target.debuffs.push({ type: 'frozen', duration: 1 });
            return 0;
        },
        "8": (player, target) => {
            const damage = player.attack * 3;
            target.health -= damage;
            return damage;
        },
        "9": (player) => {
            player.health = Math.min(player.maxHealth, player.maxHealth * 0.5);
            player.dead = false;
            return 0;
        },
        "10": (player) => {
            player.health = Math.min(player.maxHealth, player.health + 20);
        },
        "11": (player) => {
            player.health = Math.min(player.maxHealth, player.health * 0.5);
            player.dead = false;
        },
        "12": (player) => {
            player.health = Math.max(1, player.health - 10);
            player.defense += 2;
        },
        "13": (player) => {
            player.health = Math.max(1, player.health - 20);
            player.speed += 5;
        }
    };

    // 序列化函数，好像暂时没用
    const serializeEffect = (effect) => {
        return effect.toString();
    };

    // 反序列化函数，暂时没用
    const deserializeEffect = (serializedEffect) => {
        return new Function('player', 'target', serializedEffect);
    };

    // 解析叠加效果
    const parseEffect = (effectString) => {
        const effects = effectString.split('&').map(e => e.trim());
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
        { description: "你在冰洞中发现了一个神秘宝箱，获得攻击力+5", effectId: "attack+5" },
        { description: "遇到了一群善良的企鹅修女，为你祈祷，生命值+30", effectId: "maxHealth+30" },
        { description: "你在雪地中练习，获得经验值+100", effectId: "exp+100" },
        { description: "捡到了一块企鹅黄金，金币+50", effectId: "gold+50" },
        { description: "被坏企鹅群围攻，生命值-10，防御力+2", effectId: "12" },
        { description: "你发现了一本古老的战斗秘籍，攻击力+10", effectId: "attack+10" },
        { description: "你遇到了一位神秘的商人，金币+100", effectId: "gold+100" },
        { description: "你被一只巨大的企鹅追赶，生命值-20，但获得了速度提升", effectId: "13" },
        { description: "你发现了一本技能书，学会了新技能", effectId: "skill" },
        { description: "你遇到了一位神秘的老人，学会了新技能", effectId: "skill" },
        { description: "你捡到了一块神秘的宝石，攻击力+20", effectId: "attack+20" },
        { description: "你遇到了一只受伤的小企鹅，生命值+50", effectId: "health+50" },
        { description: "发现隐藏的洞穴，攻击力+5 and 魔力+10", effectId: "attack+5&mana+10" },
        { description: "遇到流浪商人，金币+50", effectId: "gold+50" }
    ];

    const defaultShop = [
        { name: "铁剑", description: "攻击力+5", cost: 20, effectId: "attack+5" },
        { name: "盾牌", description: "防御力+3", cost: 15, effectId: "defense+3" },
        { name: "回复药水", description: "恢复20生命值", cost: 10, effectId: "10" },
        { name: "神秘羽毛披风", description: "防御力+10", cost: 50, effectId: "defense+10" },
        { name: "勇者长剑", description: "攻击力+20", cost: 100, effectId: "attack+20" },
        { name: "力量护腕", description: "攻击力+15", cost: 80, effectId: "attack+15" },
        { name: "生命之戒", description: "生命值+50", cost: 120, effectId: "health+50&maxHealth+50" },
        { name: "技能书", description: "学习新技能", cost: 200, effectId: "skill" },
        { name: "神秘宝石", description: "攻击力+20", cost: 300, effectId: "attack+20" },
        { name: "生命药水", description: "恢复50生命值", cost: 50, effectId: "10" },
        { name: "魔法戒指", description: "提升魔力+20", cost: 50, effectId: "mana+20&maxMana+20" },
        { name: "复活药水", description: "复活并恢复50%生命值", cost: 500, effectId: "11" },
        { name: "房产", description: "购买房产，每日提供固定收益", cost: 1000, effectId: "house" }
    ];

    // 技能列表
    const skills = [
        { name: "普通攻击", description: "对敌人造成基础攻击力伤害", manaCost: 0, isAOE: false, effectId: "1" },
        { name: "强力一击", description: "对敌人造成2倍基础攻击力伤害，消耗 10 魔力", manaCost: 10, isAOE: false, effectId: "2" },
        { name: "防御姿态", description: "减少50%的伤害，持续3回合，消耗 8 魔力", manaCost: 8, isAOE: false, effectId: "3" },
        { name: "虚弱诅咒", description: "使敌人下回合攻击力减半，持续1回合，消耗 12 魔力", manaCost: 12, isAOE: false, effectId: "4" },
        { name: "生命吸取", description: "对敌人造成伤害并恢复等量生命值，消耗 15 魔力", manaCost: 15, isAOE: false, effectId: "5" },
        { name: "火焰风暴", description: "对敌人造成基础攻击力2.5倍伤害，消耗 20 魔力", manaCost: 20, isAOE: false, effectId: "6" },
        { name: "冰冻陷阱", description: "使敌人下回合无法行动，持续1回合，消耗 18 魔力", manaCost: 18, isAOE: false, effectId: "7" },
        { name: "雷霆一击", description: "造成3倍伤害，消耗 25 魔力", manaCost: 25, isAOE: false, effectId: "8" },
        { name: "复活术", description: "复活并恢复50%生命值，消耗 50 魔力", manaCost: 50, isAOE: false, effectId: "9" }
    ];

    // 计算下一等级所需经验
    const calculateNextLevelExp = (level) => level * 100;

    // 生成小企鹅和BOSS
    const generateBoss = (players) => {
        const totalLevels = players.reduce((sum, p) => sum + p.level, 0);
        const averageLevel = Math.ceil(totalLevels / players.length);
    
        return {
            health: averageLevel * 150 + Math.floor(Math.random() * 50), // 随机增加50点生命值
            attack: averageLevel * 12 + Math.floor(Math.random() * 10), // 随机增加10点攻击力
            defense: averageLevel * 8 + Math.floor(Math.random() * 5), // 随机增加5点防御力
            speed: averageLevel * 5 + Math.floor(Math.random() * 5), // 随机增加5点速度
            description: generateBossDescription(),
            rewardGold: averageLevel * 100 + Math.floor(Math.random() * 50), // 随机增加50金币奖励
            rewardExp: averageLevel * 200 + Math.floor(Math.random() * 100), // 随机增加100经验奖励
            itemChance: 0.2, // 20% 概率掉落道具
            eggChance: 0.1 // 10% 概率掉落企鹅蛋
        };
    };

    const generatePenguin = (playerLevel) => ({
        health: Math.floor(10 + playerLevel * 3) + Math.floor(Math.random() * 5), // 随机增加5点生命值
        attack: Math.floor(2 + playerLevel * 1) + Math.floor(Math.random() * 3), // 随机增加3点攻击力
        gold: Math.floor(5 + playerLevel * 2) + Math.floor(Math.random() * 10), // 随机增加10金币
        exp: Math.floor(10 + playerLevel * 3) + Math.floor(Math.random() * 10), // 随机增加10经验
        defense: 1 + Math.floor(Math.random() * 2), // 随机增加2点防御力
        speed: 1 + Math.floor(Math.random() * 2), // 随机增加2点速度
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

    const onBossDeath = (groupId, boss) => {
        const groupBossData = loadGroupBossData(groupId);
        const participants = Object.keys(groupBossData.bossParticipants);
        
        // BOSS 死亡后奖励
        participants.forEach(playerId => {
            const player = players[playerId];
            if (!player) return;
    
            // 奖励经验和金币
            const rewardGold = boss.rewardGold;
            const rewardExp = boss.rewardExp;
            player.gold += rewardGold;
            player.exp += rewardExp;
    
            // 输出奖励信息
            seal.replyToSender(ctx, msg, `${player.name} 获得了 ${rewardGold} 金币和 ${rewardExp} 经验！`);
    
            // 10、20、30等等级奖励
            if (player.level % 10 === 0) {
                const randomStatIncrease = Math.random();
                if (randomStatIncrease < 0.5) {
                    // 随机增加能力值
                    const statToIncrease = Math.random() < 0.5 ? 'attack' : 'health';
                    player[statToIncrease] += Math.floor(Math.random() * 5) + 5; // 增加 5 到 10 的随机值
                    seal.replyToSender(ctx, msg, `${player.name} 的 ${statToIncrease} 增加了！`);
                } else {
                    // 随机获得技能（从技能表中选择）
                    const availableSkills = skills.filter(skill => !player.skills.some(playerSkill => playerSkill.name === skill.name));
                    if (availableSkills.length > 0) {
                        const newSkill = availableSkills[Math.floor(Math.random() * availableSkills.length)];
                        player.skills.push(newSkill);
                        seal.replyToSender(ctx, msg, `${player.name} 获得了新技能: ${newSkill.name}!`);
                    } else {
                        // 没有新技能时增加属性
                        player.attack += 5;
                        player.health += 10;
                        seal.replyToSender(ctx, msg, `${player.name} 增加了攻击力和生命值！`);
                    }
                }
            }
    
            // 执行升级逻辑
            if (checkAndLevelUp(player)) {
                seal.replyToSender(ctx, msg, `${player.name} 升级了！当前等级: ${player.level}`);
            }
    
            // 保存玩家数据
            saveDatabase(dbKeyPlayerData, players);
        });

        // 掉落企鹅蛋
        if (Math.random() < boss.eggChance) {
            const egg = generatePenguinEgg();
            const eggManager = managePenguinEggData(participants[Math.floor(Math.random() * participants.length)]);
            eggManager.savePenguinEgg(egg);
            seal.replyToSender(ctx, msg, `BOSS 掉落了一个企鹅蛋！`);
        }
    };
    
    // 数据加载
    const loadDatabase = (key, defaultValue) => {
        const data = ext.storageGet(key);
        return data ? JSON.parse(data) : defaultValue;
    };

    const players = loadDatabase(dbKeyPlayerData, {});
    const encounters = loadDatabase(dbKeyEncounters, defaultEncounters);
    const shop = loadDatabase(dbKeyShop, defaultShop);
    let bossCooldown = loadDatabase(dbKeyBossCooldown, { count: 0, lastReset: Date.now() });
    const loadGroupBossData = (groupId) => {
        const data = ext.storageGet(`${dbKeyGroupBoss}_${groupId}`);
        return data ? JSON.parse(data) : { bossState: null, boss: null, bossParticipants: {} };
    };

    // 保存数据到数据库
    const saveDatabase = (key, value) => ext.storageSet(key, JSON.stringify(value));
    const saveGroupBossData = (groupId, groupBossData) => {
        ext.storageSet(`${dbKeyGroupBoss}_${groupId}`, JSON.stringify(groupBossData));
    };

    // 自动升级逻辑
    const checkAndLevelUp = (player) => {
        const nextLevelExp = calculateNextLevelExp(player.level);
        
        if (player.exp >= nextLevelExp) {
            player.level++;
            player.exp -= nextLevelExp;
    
            // 增加能力值
            player.maxHealth += 10;  // 每升一级增加固定生命值
            player.maxMana += 5;     // 每升一级增加固定魔力值
            player.health = player.maxHealth;
            player.mana = player.maxMana;
    
            // 10、20、30等等级奖励
            if (player.level % 10 === 0) {
                const randomStatIncrease = Math.random();
                if (randomStatIncrease < 0.5) {
                    // 随机增加能力值
                    const statToIncrease = Math.random() < 0.5 ? 'attack' : 'defense';
                    player[statToIncrease] += Math.floor(Math.random() * 5) + 5; // 增加 5 到 10 的随机值
                    seal.replyToSender(ctx, msg, `${player.name} 的 ${statToIncrease} 增加了！`);
                } else {
                    // 随机获得技能（从技能表中选择）
                    const availableSkills = skills.filter(skill => !player.skills.some(playerSkill => playerSkill.name === skill.name));
                    if (availableSkills.length > 0) {
                        const newSkill = availableSkills[Math.floor(Math.random() * availableSkills.length)];
                        player.skills.push(newSkill);
                        seal.replyToSender(ctx, msg, `${player.name} 获得了新技能: ${newSkill.name}!`);
                    } else {
                        // 没有新技能时增加属性
                        player.attack += 5;
                        player.health += 10;
                        seal.replyToSender(ctx, msg, `${player.name} 增加了攻击力和生命值！`);
                    }
                }
            }
    
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

    // 企鹅蛋数据管理函数
    const managePenguinEggData = (userId) => {
        const dbKey = `${dbKeyPenguinEgg}_${userId}`;

        // 加载企鹅蛋数据
        const loadPenguinEgg = () => {
            const data = ext.storageGet(dbKey);
            return data ? JSON.parse(data) : null;
        };

        // 保存企鹅蛋数据
        const savePenguinEgg = (egg) => {
            ext.storageSet(dbKey, JSON.stringify(egg));
        };

        // 删除企鹅蛋数据
        const deletePenguinEgg = () => {
            ext.storageSet(dbKey, null);
        };

        return {
            loadPenguinEgg,
            savePenguinEgg,
            deletePenguinEgg,
        };
    };

    // 生成企鹅蛋
    const generatePenguinEgg = () => ({
        hatchTime: Date.now() + Math.floor(Math.random() * 24 * 60 * 60 * 1000) + 24 * 60 * 60 * 1000, // 24到48小时随机孵化时间
        description: "一颗神秘的企鹅蛋，正在孵化中。",
    });

    // 生成孵化后的企鹅
    const generateHatchedPenguin = (playerLevel) => {
        const penguinTags = [
            { name: "战士", attributeBonus: { attack: 5, defense: 3 } },
            { name: "法师", attributeBonus: { attack: 3, mana: 10 } },
            { name: "刺客", attributeBonus: { attack: 7, speed: 5 } },
            { name: "牧师", attributeBonus: { health: 20, mana: 5 } },
            { name: "猎人", attributeBonus: { attack: 4, speed: 3 } }
        ];

        const tag = penguinTags[Math.floor(Math.random() * penguinTags.length)];
        return {
            health: Math.floor(10 + playerLevel * 3) + Math.floor(Math.random() * 5), // 随机增加5点生命值
            attack: Math.floor(2 + playerLevel * 1) + Math.floor(Math.random() * 3), // 随机增加3点攻击力
            gold: Math.floor(5 + playerLevel * 2) + Math.floor(Math.random() * 10), // 随机增加10金币
            exp: Math.floor(10 + playerLevel * 3) + Math.floor(Math.random() * 10), // 随机增加10经验
            defense: 1 + Math.floor(Math.random() * 2), // 随机增加2点防御力
            speed: 1 + Math.floor(Math.random() * 2), // 随机增加2点速度
            skills: [skills[0]],
            description: generatePenguinDescription(),
            tag: tag.name,
            attributeBonus: tag.attributeBonus,
            affection: 25, // 初始亲密度
            level: 1 // 初始等级
        };
    };

    // 更新 debuff 和 buff 的剩余轮数
    const applyDebuffsAndBuffs = (entity) => {
        if (entity.debuffs) {
            entity.debuffs = entity.debuffs.filter(debuff => {
                debuff.duration--;
                return debuff.duration > 0;
            });
        }
        if (entity.buffs) {
            entity.buffs = entity.buffs.filter(buff => {
                buff.duration--;
                return buff.duration > 0;
            });
        }
    };

    // 房产侵入逻辑函数
const attemptInfiltrateHouse = (player, players) => {
    // 随机选取目标房主
    const allPlayers = Object.entries(players).filter(([id, p]) => id !== player.userId); // 排除自己
    if (allPlayers.length === 0) {
        return { success: false, message: "冒险中没有找到可侵入的房产。" };
    }

    const targetPlayerEntry = allPlayers[Math.floor(Math.random() * allPlayers.length)];
    const targetUserId = targetPlayerEntry[0];
    const targetPlayer = targetPlayerEntry[1];
    const targetHouseData = manageHouseData(targetUserId).loadHouse();

    // 如果目标玩家没有房产
    if (!targetHouseData || targetHouseData.level <= 0) {
        return { success: false, message: `你误入了 ${targetPlayer.name} 的一片空地，没有任何收获。` };
    }

    // 玩家速度与房产安保等级对抗
    if (player.speed > targetHouseData.security) {
        // 玩家成功侵入
        const stolenGold = Math.min(targetHouseData.storage, 10); // 至多偷取10金币
        const stolenItemIndex = targetHouseData.storageItems?.length > 0
            ? Math.floor(Math.random() * targetHouseData.storageItems.length)
            : null;
        const stolenItem = stolenItemIndex !== null ? targetHouseData.storageItems.splice(stolenItemIndex, 1)[0] : null;

        // 更新玩家与目标房产状态
        player.gold += stolenGold;
        if (stolenItem) player.backpack.push(stolenItem);
        targetHouseData.storage -= stolenGold;
        manageHouseData(targetUserId).saveHouse(targetHouseData);

        return {
            success: true,
            message: `你成功潜入了 ${targetPlayer.name} 的房产，偷走了 ${stolenGold} 金币${stolenItem ? ` 和一个物品：${stolenItem.name}` : ''}！`
        };
    } else {
        // 房产防御成功
        const fineGold = Math.min(player.gold, 10); // 至多罚款10金币
        const droppedItemIndex = player.backpack.length > 0
            ? Math.floor(Math.random() * player.backpack.length)
            : null;
        const droppedItem = droppedItemIndex !== null ? player.backpack.splice(droppedItemIndex, 1)[0] : null;

        // 更新玩家与目标房产状态
        player.gold -= fineGold;
        targetHouseData.storage += fineGold;
        if (droppedItem) targetHouseData.storageItems = [...(targetHouseData.storageItems || []), droppedItem];
        manageHouseData(targetUserId).saveHouse(targetHouseData);

        return {
            success: true,
            message: `你被 ${targetPlayer.name} 的房产安保系统拦截，损失了 ${fineGold} 金币${droppedItem ? ` 和一个物品：${droppedItem.name}` : ''}！`
        };
    }
};

    // PvP 数据管理函数
    const managePvPData = (userId) => {
        const dbKey = `${dbKeyPvP}_${userId}`;

        // 加载PvP数据
        const loadPvP = () => {
            const data = ext.storageGet(dbKey);
            return data ? JSON.parse(data) : { wins: 0, losses: 0 };
        };

        // 保存PvP数据
        const savePvP = (pvp) => {
            ext.storageSet(dbKey, JSON.stringify(pvp));
        };

        return {
            loadPvP,
            savePvP,
        };
    };

    // 房产数据管理函数
    const manageHouseData = (userId) => {
        const dbKey = `${dbKeyHouses}_${userId}`;

        // 加载房产数据
        const loadHouse = () => {
            const data = ext.storageGet(dbKey);
            return data ? JSON.parse(data) : { level: 1, income: 10, security: 1, storage: 0, lastCollectTime: 0 };
        };

        // 保存房产数据
        const saveHouse = (house) => {
            ext.storageSet(dbKey, JSON.stringify(house));
        };

        return {
            loadHouse,
            saveHouse,
        };
    };

    // 称号数据管理函数
    const manageTitleData = (userId) => {
        const dbKey = `${dbKeyTitles}_${userId}`;

        // 加载称号数据
        const loadTitles = () => {
            const data = ext.storageGet(dbKey);
            return data ? JSON.parse(data) : [];
        };

        // 保存称号数据
        const saveTitles = (titles) => {
            ext.storageSet(dbKey, JSON.stringify(titles));
        };

        return {
            loadTitles,
            saveTitles,
        };
    };

    // 签到数据管理函数
    const manageSignInData = (userId) => {
        const dbKey = `${dbKeySignIn}_${userId}`;

        // 加载签到数据
        const loadSignIn = () => {
            const data = ext.storageGet(dbKey);
            return data ? JSON.parse(data) : { lastSignIn: 0, streak: 0 };
        };

        // 保存签到数据
        const saveSignIn = (signIn) => {
            ext.storageSet(dbKey, JSON.stringify(signIn));
        };

        return {
            loadSignIn,
            saveSignIn,
        };
    };

    // 定义命令
    const cmdPenguinBattle = seal.ext.newCmdItemInfo();
    cmdPenguinBattle.name = 'penguin';
    cmdPenguinBattle.help = `
指令：
.penguin help - 查看帮助
.penguin 新建角色 - 创建角色
.penguin 签到 - 每日签到
.penguin 状态 - 查看状态
.penguin 冒险 - 出去冒险，锻炼能力
.penguin 备战 - 开始筹备BOSS战
.penguin 加入 - 加入BOSS战
.penguin 开始 - 开始BOSS战斗
.penguin 攻击 编号/技能名 - 攻击BOSS或企鹅，添加技能编号或技能名使用技能
.penguin 脱离 - 从战斗中脱离
.penguin 休息 - 开始休息，回复hp/mp
.penguin 结束休息 - 结束休息
.penguin 商店 - 查看商店
.penguin 购买 序号/物品名 - 购买物品
.penguin 排行榜 - 查看排行榜
.penguin 背包 - 查看背包
.penguin 使用 物品名 - 使用背包中的物品
.penguin 转赠 物品名 @玩家 - 将物品转赠给其他玩家
.penguin 宠物 - 查看宠物企鹅信息
.penguin 孵化 - 查看企鹅蛋孵化情况
.penguin 互动 互动类型 - 与宠物企鹅互动
.penguin 对战 @玩家 - 发起PvP对战
.penguin 接受对战 - 接受PvP对战
.penguin 拒绝对战 - 拒绝PvP对战
.penguin 房产 - 查看房产信息
.penguin 升级房产 - 升级房产
.penguin 收取收益 - 收取房产收益
管理员指令：
.penguin 管理 奇遇 - 查看奇遇列表
.penguin 管理 添加奇遇 描述|代码 - 添加奇遇
.penguin 管理 移除奇遇 序号 - 移除奇遇
.penguin 管理 商店 - 查看商店列表
.penguin 管理 添加商店 名称|描述|价格|效果 - 添加商店物品
.penguin 管理 移除商店 序号 - 移除商店物品
.penguin 管理 作弊 帮助 - 查看作弊指令帮助
`;
    cmdPenguinBattle.allowDelegate = true;

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
        const groupBossData = loadGroupBossData(groupId);
        const command = cmdArgs.getArgN(1);

        switch (command) {
            case '新建角色': {
                console.log('新建角色指令被触发');

                players[userId] = {
                    name: playerName, // 将玩家名字存储到数据库
                    level: 1, exp: 0, gold: 0, attack: 5, defense: 3, 
                    health: 50, maxHealth: 50, mana: 20, maxMana: 20, 
                    speed: 0, skills: [skills[0]], groupId,
                    backpack: [defaultShop[11], defaultShop[11], defaultShop[11]], // 初始化背包并添加三个复活药水
                    dead: false // 初始化死亡状态
                };
                saveDatabase(dbKeyPlayerData, players);

                const player = players[userId];
                const nextLevelExp = calculateNextLevelExp(player.level);
                const expToNextLevel = nextLevelExp - player.exp;

                // 发送消息
                seal.replyToSender(ctx, msg, `角色创建成功！
玩家名: ${player.name}
等级: ${player.level}
经验值: ${player.exp} / ${nextLevelExp} (升级还需 ${expToNextLevel})
金币: ${player.gold}
攻击力: ${player.attack}
防御力: ${player.defense}
生命值: ${player.health}/${player.maxHealth}
魔力值: ${player.mana}/${player.maxMana}
速度: ${player.speed}
技能: ${player.skills.map((skill, index) => `${index + 1}. ${skill.name}`).join('/n ')}`);
                break;
            }
            case '状态': {
                const nextLevelExp = calculateNextLevelExp(player.level);
                const expToNextLevel = nextLevelExp - player.exp;
                const skillDescriptions = player.skills.map((skill, index) => `${index + 1}. ${skill.name} - ${skill.description}`).join('\n');
                const pvpData = managePvPData(userId).loadPvP();
                const houseData = manageHouseData(userId).loadHouse();
                const titles = manageTitleData(userId).loadTitles();
                const titleList = titles.length > 0 ? `称号: ${titles.join(', ')}` : '暂无称号';
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
技能: ${skillDescriptions}
PvP战绩: 胜 ${pvpData.wins} 负 ${pvpData.losses}
房产等级: ${houseData.level}
房产收益: ${houseData.income} 金币/天
${titleList}`);
                break;
            }

            case '备战': {
                const player = players[userId];
                // 检查玩家是否死亡
                if (player.dead) {
                    seal.replyToSender(ctx, msg, '你已经死亡，无法执行此操作！请使用复活药水或复活术复活。');
                    return;
                }
                if (players[userId]?.resting) {
                    seal.replyToSender(ctx, msg, '你正在休息中，无法进行其他活动！请使用 ".penguin 结束休息" 结束后再操作。');
                    return;
                }
                resetBossCooldown();                
                if (bossCooldown.count >= 3) {
                    seal.replyToSender(ctx, msg, '今天的BOSS战次数已用完，请明天再来！');
                    return;
                }
                if (groupBossData.bossState === 'preparing' || groupBossData.bossState === 'fighting') {
                    seal.replyToSender(ctx, msg, '当前群已经在筹备或进行 BOSS 战，无法重复开始！');
                    return;
                }
                groupBossData.bossState = 'preparing';
                groupBossData.bossParticipants = {};
                saveGroupBossData(groupId, groupBossData);
                seal.replyToSender(ctx, msg, '开始筹备 BOSS 战！请使用 ".penguin 加入" 加入战斗。');
            }

            case '加入': {
                // 检查玩家是否死亡
                const player = players[userId];
                if (player.dead) {
                    seal.replyToSender(ctx, msg, '你已经死亡，无法执行此操作！请使用复活药水或复活术复活。');
                    return;
                }
                if (players[userId]?.resting) {
                    seal.replyToSender(ctx, msg, '你正在休息中，无法进行其他活动！请使用 ".penguin 结束休息" 结束后再操作。');
                    return;
                }
                if (groupBossData.bossState !== 'preparing' && groupBossData.bossState !== 'fighting') {
                    seal.replyToSender(ctx, msg, '当前没有正在筹备或进行的 BOSS 战！');
                    return;
                }
                if (groupBossData.bossParticipants[userId]) {
                    seal.replyToSender(ctx, msg, '你已经加入了 BOSS 战！');
                    return;
                }
                groupBossData.bossParticipants[userId] = true;
                saveGroupBossData(groupId, groupBossData);
                seal.replyToSender(ctx, msg, '成功加入 BOSS 战！');
                break;
            }

            case '开始': {
                // 检查玩家是否死亡
                const player = players[userId];
                if (player.dead) {
                    seal.replyToSender(ctx, msg, '你已经死亡，无法执行此操作！请使用复活药水或复活术复活。');
                    return;
                }
                if (players[userId]?.resting) {
                    seal.replyToSender(ctx, msg, '你正在休息中，无法进行其他活动！请使用 ".penguin 结束休息" 结束后再操作。');
                    return;
                }
                const groupBossData = loadGroupBossData(groupId);
    
                // 判断当前是否有正在进行的 BOSS 战
                if (groupBossData.bossState === 'fighting') {
                    seal.replyToSender(ctx, msg, '当前已经有 BOSS 战正在进行，请等待当前战斗结束！');
                    return;
                }
            
                // 判断当前是否处于 BOSS 战筹备状态
                if (groupBossData.bossState !== 'preparing') {
                    seal.replyToSender(ctx, msg, '请先通过 ".penguin 备战" 来筹备 BOSS 战！');
                    return;
                }
            
                const participants = Object.keys(groupBossData.bossParticipants);
                if (participants.length === 0) {
                    seal.replyToSender(ctx, msg, '没有玩家加入 BOSS 战，无法开始！');
                    return;
                }
                const playersData = participants.map(pid => players[pid]);
                const boss = generateBoss(playersData);
                groupBossData.bossState = 'fighting';
                groupBossData.boss = boss;
                saveGroupBossData(groupId, groupBossData);
                seal.replyToSender(ctx, msg, `BOSS 战开始！\nBOSS 信息：\n血量：${boss.health}\n攻击：${boss.attack}\n描述：${boss.description}`);
                break;
            }
            case '攻击': {
                // 检查玩家是否死亡
                const player = players[userId];
                if (player.dead) {
                    seal.replyToSender(ctx, msg, '你已经死亡，无法执行此操作！请使用复活药水或复活术复活。');
                    return;
                }
                const groupBossData = loadGroupBossData(groupId);

                // 判断是否攻击 BOSS
                if (groupBossData.bossState === 'fighting' && groupBossData.bossParticipants[userId]) {
                    const boss = groupBossData.boss;

                    // 玩家攻击或使用技能
                    const skillArg = cmdArgs.getArgN(2);
                    let damage = 0;

                    if (skillArg) {
                        // 技能释放
                        let skillIndex = parseInt(skillArg, 10) - 1;
                        if (isNaN(skillIndex)) {
                            skillIndex = player.skills.findIndex(skill => skill.name === skillArg);
                            if (skillIndex === -1) {
                                seal.replyToSender(ctx, msg, '无效技能编号或技能名！');
                                break;
                            }
                        }

                        const skill = player.skills[skillIndex];
                        if (player.mana < skill.manaCost) {
                            seal.replyToSender(ctx, msg, `魔力不足，无法使用技能 "${skill.name}"！`);
                            break;
                        }

                        player.mana -= skill.manaCost;
                        damage = builtInEffectMap[skill.effectId](player, boss);

                        seal.replyToSender(ctx, msg, `你使用了技能 "${skill.name}" 对 BOSS 造成了 ${damage} 点伤害！消耗魔力: ${skill.manaCost}\nBOSS 剩余血量：${boss.health}`);
                    } else {
                        // 普通攻击
                        damage = Math.max(player.attack - boss.defense, 1);
                        boss.health -= damage;
                        seal.replyToSender(ctx, msg, `你对 BOSS 造成了 ${damage} 点伤害！BOSS 剩余血量：${boss.health}`);
                    }

                    applyDebuffsAndBuffs(player); // 更新玩家的 debuff 和 buff
                    applyDebuffsAndBuffs(boss); // 更新BOSS的 debuff 和 buff

                    if (boss.health <= 0) {
                        // BOSS 被击败
                        groupBossData.bossState = null;
                        groupBossData.boss = null;
                        saveGroupBossData(groupId, groupBossData);
                        onBossDeath(groupId, boss);
                        seal.replyToSender(ctx, msg, '恭喜！BOSS 已被击败！');
                        break;
                    }

                    // BOSS 反击逻辑
                    const participants = Object.keys(groupBossData.bossParticipants);
                    const target = participants[Math.floor(Math.random() * participants.length)];
                    const targetPlayer = players[target];

                    // 计算暴击和打空概率
                    const criticalChance = 0.1; // 10% 暴击概率
                    const missChance = Math.max(0, 0.2 - (boss.speed - targetPlayer.speed) * 0.01); // 根据速度差计算打空概率

                    let bossDamage = Math.max(boss.attack - targetPlayer.defense, 1);
                    if (Math.random() < criticalChance) {
                        bossDamage *= 2; // 暴击伤害翻倍
                        seal.replyToSender(ctx, msg, `BOSS 发动了暴击！`);
                    }
                    if (Math.random() < missChance) {
                        bossDamage = 0; // 打空
                        seal.replyToSender(ctx, msg, `BOSS 的攻击打空了！`);
                    }

                    targetPlayer.health -= bossDamage;
                    seal.replyToSender(ctx, msg, `${targetPlayer.name} 被 BOSS 反击，掉了 ${bossDamage} 点血！`);

                    applyDebuffsAndBuffs(targetPlayer); // 更新 debuff 和 buff

                    // 检查玩家是否死亡
                    if (targetPlayer.health <= 0) {
                        targetPlayer.dead = true;
                        seal.replyToSender(ctx, msg, `${targetPlayer.name} 被击败了！`);
                    }

                    // 检查所有参与者是否死亡
                    const allDead = participants.every(pid => players[pid].dead);
                    if (allDead) {
                        groupBossData.bossState = null;
                        groupBossData.boss = null;
                        saveGroupBossData(groupId, groupBossData);
                        seal.replyToSender(ctx, msg, '所有参与者都已死亡，BOSS 战结束！');
                        break;
                    }

                    saveGroupBossData(groupId, groupBossData);
                    saveDatabase(dbKeyPlayerData, players);
                    break;
                }

                // 对小企鹅攻击逻辑保持不变
                const penguinManager = managePenguinData(userId);
                const penguin = penguinManager.loadPenguin();
                if (!penguin) {
                    seal.replyToSender(ctx, msg, '当前没有目标可供攻击！');
                    break;
                }

                let damage = 0;
                const skillArg = cmdArgs.getArgN(2);
                if (skillArg) {
                    // 技能释放
                    let skillIndex = parseInt(skillArg, 10) - 1;
                    if (isNaN(skillIndex)) {
                        skillIndex = player.skills.findIndex(skill => skill.name === skillArg);
                        if (skillIndex === -1) {
                            seal.replyToSender(ctx, msg, '无效技能编号或技能名！');
                            break;
                        }
                    }

                    const skill = player.skills[skillIndex];
                    if (player.mana < skill.manaCost) {
                        seal.replyToSender(ctx, msg, `魔力不足，无法使用技能 "${skill.name}"！`);
                        break;
                    }

                    player.mana -= skill.manaCost;
                    damage = builtInEffectMap[skill.effectId](player, penguin);

                    seal.replyToSender(ctx, msg, `你使用了技能 "${skill.name}" 对小企鹅造成了 ${damage} 点伤害！消耗魔力: ${skill.manaCost}\n小企鹅剩余血量：${penguin.health}`);
                } else {
                    // 普通攻击
                    damage = Math.max(player.attack - penguin.defense, 1);
                    penguin.health -= damage;
                    seal.replyToSender(ctx, msg, `你对小企鹅造成了 ${damage} 点伤害！小企鹅剩余血量：${penguin.health}`);
                }

                applyDebuffsAndBuffs(player); // 更新玩家的 debuff 和 buff
                applyDebuffsAndBuffs(penguin); // 更新小企鹅的 debuff 和 buff

                if (penguin.health <= 0) {
                    player.gold += penguin.gold;
                    player.exp += penguin.exp;
                    penguinManager.deletePenguin();
                    seal.replyToSender(ctx, msg, `你击败了小企鹅！\n获得金币：${penguin.gold}\n获得经验值：${penguin.exp}`);
                } else {
                    const retaliationDamage = Math.max(penguin.attack - player.defense, 1);
                    player.health = Math.max(1, player.health - retaliationDamage);
                    seal.replyToSender(ctx, msg, `小企鹅进行了反击，你受到了 ${retaliationDamage} 点伤害！当前生命值：${player.health}`);
                    penguinManager.savePenguin(penguin);
                }

                saveDatabase(dbKeyPlayerData, players);
                break;
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
                const encounterChance = 0.3; // 30% 触发奇遇
                const bossChance = 0.1;     // 10% 生成 BOSS
                const infiltrateChance = 0.2; // 20% 触发房产侵入
                const penguinChance = 0.4;   // 40% 生成小企鹅
            
                // 检查玩家是否死亡或处于其他状态
                if (player.dead) {
                    seal.replyToSender(ctx, msg, '你已经死亡，无法执行此操作！请使用复活药水或复活术复活。');
                    return;
                }
            
                if (players[userId]?.resting) {
                    seal.replyToSender(ctx, msg, '你正在休息中，无法进行其他活动！请使用 ".penguin 结束休息" 结束后再操作。');
                    return;
                }
            
                if (groupBossData.bossState === 'fighting') {
                    seal.replyToSender(ctx, msg, '当前正在 BOSS 战中，无法进行冒险！');
                    return;
                }
            
                // 按概率触发单一事件
                const eventRoll = Math.random();
                if (eventRoll < infiltrateChance) {
                    // 房产侵入事件
                    const infiltrateResult = attemptInfiltrateHouse(player, players);
                    seal.replyToSender(ctx, msg, infiltrateResult.message);
                } else if (eventRoll < infiltrateChance + encounterChance) {
                    // 奇遇事件
                    const encounter = encounters[Math.floor(Math.random() * encounters.length)];
                    if (encounter.effectId.includes('+')) {
                        const applyEffect = parseEffect(encounter.effectId);
                        applyEffect(player);
                    } else if (encounter.effectId === 'skill') {
                        const availableSkills = skills.filter(skill => !player.skills.some(playerSkill => playerSkill.name === skill.name));
                        if (availableSkills.length > 0) {
                            const newSkill = availableSkills[Math.floor(Math.random() * availableSkills.length)];
                            player.skills.push(newSkill);
                            seal.replyToSender(ctx, msg, `${player.name} 获得了新技能: ${newSkill.name}!`);
                        } else {
                            player.attack += Math.floor(Math.random() * 10) + 5;
                            player.health += Math.floor(Math.random() * 16) + 8;
                            seal.replyToSender(ctx, msg, `可惜啊年轻人，你已经打遍天下无敌手，技能书无法再为你的技能成长了！那么……\n${player.name} 增加了攻击力和生命值！`);
                        }
                    } else {
                        builtInEffectMap[encounter.effectId](player);
                    }
                    seal.replyToSender(ctx, msg, `奇遇事件触发！\n${encounter.description}`);
                } else if (eventRoll < infiltrateChance + encounterChance + bossChance) {
                    // BOSS 生成事件
                    if (groupBossData.bossState !== 'preparing' && groupBossData.bossState !== 'fighting') {
                        groupBossData.bossState = 'preparing';
                        groupBossData.bossParticipants = {};
                        saveGroupBossData(groupId, groupBossData);
                        seal.replyToSender(ctx, msg, '你在冒险中触发了一个强大的 BOSS！请使用 ".penguin 加入" 加入战斗。');
                    } else {
                        seal.replyToSender(ctx, msg, '当前已有正在筹备或进行中的 BOSS 战！本次冒险没有新发现。');
                    }
                } else {
                    // 小企鹅生成事件
                    const penguin = generatePenguin(player.level);
                    penguinManager.savePenguin(penguin);
                    seal.replyToSender(ctx, msg, `你在冒险中发现了一只小企鹅！\n血量: ${penguin.health}\n攻击: ${penguin.attack}\n描述: ${penguin.description}`);
                }
            
                saveDatabase(dbKeyPlayerData, players);
                return;
            }            

            case '商店': {
                const player = players[userId];
                // 检查玩家是否死亡
                if (player.dead) {
                    seal.replyToSender(ctx, msg, '你已经死亡，无法执行此操作！请使用复活药水或复活术复活。');
                    return;
                }
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
                const player = players[userId];
                if (player.dead) {
                    seal.replyToSender(ctx, msg, '你已经死亡，无法购买物品！请使用复活药水或复活术复活。');
                    return;
                }
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
            
                const item = shop[itemIndex];
                if (player.gold < item.cost) {
                    seal.replyToSender(ctx, msg, `金币不足，无法购买 "${item.name}"！`);
                    return;
                }
            
                if (item.effectId === 'house') {
                    const houseData = manageHouseData(userId).loadHouse();
                    if (houseData.level > 1) {
                        seal.replyToSender(ctx, msg, '你已经拥有房产，无法重复购买！');
                        return;
                    }
            
                    // 初始化房产数据
                    houseData.level = 1;
                    houseData.income = 20;
                    houseData.security = 5; // 初始安保等级
                    houseData.toll = 5;     // 初始过路费能力
                    manageHouseData(userId).saveHouse(houseData);
                    seal.replyToSender(ctx, msg, '恭喜，你成功购买了一座房产！');
                } else {
                    player.backpack.push(item);
                    seal.replyToSender(ctx, msg, `你成功购买了 "${item.name}"！\n当前金币: ${player.gold}`);
                }
            
                player.gold -= item.cost;
                saveDatabase(dbKeyPlayerData, players);
                return;
            }            

            case 'help': {
                // 查看帮助
                seal.replyToSender(ctx, msg, cmdPenguinBattle.help);
                return;
            }

            case '休息': {
                const player = players[userId];
                // 检查玩家是否死亡
                if (player.dead) {
                    seal.replyToSender(ctx, msg, '你已经死亡，无法执行此操作！请使用复活药水或复活术复活。');
                    return;
                }
                if (groupBossData.bossState === 'fighting' || groupBossData.bossState === 'preparing') {
                    seal.replyToSender(ctx, msg, '当前正在战斗中，无法休息！');
                    return;
                }
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
                // 检查玩家是否死亡
                if (player.dead) {
                    seal.replyToSender(ctx, msg, '你已经死亡，无法执行此操作！请使用复活药水或复活术复活。');
                    return;
                }
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

            case '背包': {
                const player = players[userId];
                if (player.backpack.length === 0) {
                    seal.replyToSender(ctx, msg, '你的背包是空的！');
                    return;
                }
                const backpackItems = player.backpack.map((item, index) => `${index + 1}. ${item.name} - ${item.description}`).join('\n');
                seal.replyToSender(ctx, msg, `背包物品:\n${backpackItems}`);
                return;
            }

            case '使用': {
                const player = players[userId];
                if (player.dead && cmdArgs.getArgN(2) !== '复活药水') {
                    seal.replyToSender(ctx, msg, '你已经死亡，无法使用物品！请使用复活药水或复活术复活。');
                    return;
                }
                const itemArg = cmdArgs.getArgN(2);
                let itemIndex = parseInt(itemArg, 10) - 1;
                if (isNaN(itemIndex)) {
                    itemIndex = player.backpack.findIndex(item => item.name === itemArg);
                    if (itemIndex === -1) {
                        seal.replyToSender(ctx, msg, '无效物品序号或物品名！');
                        return;
                    }
                }
                if (isNaN(itemIndex) || itemIndex < 0 || itemIndex >= player.backpack.length) {
                    seal.replyToSender(ctx, msg, '请输入有效的物品序号！');
                    return;
                }
                const item = player.backpack[itemIndex];
                if (item.effectId.includes('+')) {
                    const applyEffect = parseEffect(item.effectId);
                    applyEffect(player);
                } else if(item.effectId === 'skill'){
                    const availableSkills = skills.filter(skill => !player.skills.some(playerSkill => playerSkill.name === skill.name));                  
                    if (availableSkills.length > 0) {
                        const newSkill = availableSkills[Math.floor(Math.random() * availableSkills.length)];
                        player.skills.push(newSkill);
                        seal.replyToSender(ctx, msg, `${player.name} 获得了新技能: ${newSkill.name}!`);
                    } else {
                        player.attack += Math.floor(Math.random() * 10) + 5;
                        player.health += Math.floor(Math.random() * 16) + 8;
                        seal.replyToSender(ctx, msg, `但你已经拥有了技能书上的所有技能，看来只能……\n${player.name} 增加了攻击力和生命值！`);
                    }
                }else{
                    builtInEffectMap[item.effectId](player);
                }
                player.backpack.splice(itemIndex, 1); // 从背包中移除物品
                saveDatabase(dbKeyPlayerData, players);
                seal.replyToSender(ctx, msg, `你使用了 "${item.name}"！`);
                return;
            }

            case '转赠': {
                const player = players[userId];
                const itemArg = cmdArgs.getArgN(2);
                let itemIndex = parseInt(itemArg, 10) - 1;
                if (isNaN(itemIndex)) {
                    itemIndex = player.backpack.findIndex(item => item.name === itemArg);
                    if (itemIndex === -1) {
                        seal.replyToSender(ctx, msg, '无效物品序号或物品名！');
                        return;
                    }
                }
                if (isNaN(itemIndex) || itemIndex < 0 || itemIndex >= player.backpack.length) {
                    seal.replyToSender(ctx, msg, '请输入有效的物品序号！');
                    return;
                }
                const item = player.backpack[itemIndex];

                let mctx = seal.getCtxProxyFirst(ctx, cmdArgs);
                targetUserId = mctx.player.userId;
                if (!targetUserId) {
                    seal.replyToSender(ctx, msg, '请@你要转赠的对象！');
                    return;
                }
                const targetPlayer = players[targetUserId];
                console.log(targetPlayer);
                if (!targetPlayer) {
                    seal.replyToSender(ctx, msg, '目标玩家不存在！');
                    return;
                }

                player.backpack.splice(itemIndex, 1); // 从背包中移除物品
                targetPlayer.backpack.push(item); // 将物品添加到目标玩家的背包
                saveDatabase(dbKeyPlayerData, players);
                seal.replyToSender(ctx, msg, `你成功将 "${item.name}" 转赠给了 ${targetPlayer.name}！`);
                return;
            }

            case '宠物': {
                const penguinManager = managePenguinData(userId);
                const penguin = penguinManager.loadPenguin();
                if (!penguin) {
                    seal.replyToSender(ctx, msg, '你还没有宠物企鹅！');
                    return;
                }
                seal.replyToSender(ctx, msg, `你的宠物企鹅信息：\n描述: ${penguin.description}\n等级: ${penguin.level}\n亲密度: ${penguin.affection}\n属性加成: ${penguin.attributeBonus}`);
                return;
            }

            case '孵化': {
                const eggManager = managePenguinEggData(userId);
                const egg = eggManager.loadPenguinEgg();
                if (!egg) {
                    seal.replyToSender(ctx, msg, '你还没有企鹅蛋！');
                    return;
                }
                const timeLeft = Math.max(0, egg.hatchTime - Date.now());
                if (timeLeft > 0) {
                    const hoursLeft = Math.floor(timeLeft / (60 * 60 * 1000));
                    const minutesLeft = Math.floor((timeLeft % (60 * 60 * 1000)) / (60 * 1000));
                    seal.replyToSender(ctx, msg, `你的企鹅蛋正在孵化中，还有 ${hoursLeft} 小时 ${minutesLeft} 分钟孵化完成。`);
                } else {
                    const penguin = generateHatchedPenguin(player.level);
                    const penguinManager = managePenguinData(userId);
                    penguinManager.savePenguin(penguin);
                    eggManager.deletePenguinEgg();
                    seal.replyToSender(ctx, msg, `你的企鹅蛋孵化成功！你获得了一只宠物企鹅。`);
                }
                return;
            }

            case '互动': {
                const penguinManager = managePenguinData(userId);
                const penguin = penguinManager.loadPenguin();
                if (!penguin) {
                    seal.replyToSender(ctx, msg, '你还没有宠物企鹅！');
                    return;
                }
                const interactionType = cmdArgs.getArgN(2);
                switch (interactionType) {
                    case '喂食': {
                        penguin.affection += 5;
                        seal.replyToSender(ctx, msg, `你喂食了你的宠物企鹅，亲密度增加了5点。当前亲密度: ${penguin.affection}`);
                        break;
                    }
                    case '玩耍': {
                        penguin.affection += 3;
                        seal.replyToSender(ctx, msg, `你和你的宠物企鹅玩耍了一会儿，亲密度增加了3点。当前亲密度: ${penguin.affection}`);
                        break;
                    }
                    case '训练': {
                        penguin.level += 1;
                        penguin.affection -= 3;
                        seal.replyToSender(ctx, msg, `你训练了你的宠物企鹅，等级提升了1级。当前等级: ${penguin.level}`);
                        break;
                    }
                    case '惩罚': {
                        penguin.affection -= 5;
                        seal.replyToSender(ctx, msg, `你惩罚了你的宠物企鹅，亲密度减少了5点。当前亲密度: ${penguin.affection}`);
                        break;
                    }
                    default: {
                        seal.replyToSender(ctx, msg, '无效的互动类型！请使用 "喂食"、"玩耍"、"训练" 或 "惩罚"。');
                        break;
                    }
                }
                if (penguin.affection <= 10) {
                    const participants = Object.keys(players);
                    const newOwnerId = participants[Math.floor(Math.random() * participants.length)];
                    const newOwner = players[newOwnerId];
                    const penguinManager = managePenguinData(newOwnerId);
                    penguinManager.savePenguin(penguin);
                    seal.replyToSender(ctx, msg, `你的宠物企鹅离家出走了，成为了 ${newOwner.name} 的宠物企鹅！`);
                }
                saveDatabase(dbKeyPlayerData, players);
                return;
            }

            case '脱离': {
                const player = players[userId];
                if (groupBossData.bossState === 'fighting' && groupBossData.bossParticipants[userId]) {
                    delete groupBossData.bossParticipants[userId];
                    seal.replyToSender(ctx, msg, '你已从 BOSS 战中脱离！');
                    if (Object.keys(groupBossData.bossParticipants).length === 0) {
                        groupBossData.bossState = null;
                        groupBossData.boss = null;
                        seal.replyToSender(ctx, msg, '所有参与者都已脱离，BOSS 战结束！');
                    }
                    saveGroupBossData(groupId, groupBossData);
                } else {
                    const penguinManager = managePenguinData(userId);
                    const penguin = penguinManager.loadPenguin();
                    if (penguin) {
                        penguinManager.deletePenguin();
                        seal.replyToSender(ctx, msg, '你已从小企鹅战斗中脱离！');
                    } else {
                        seal.replyToSender(ctx, msg, '当前没有战斗目标！');
                    }
                }
                return;
            }

            case '对战': {
                const player = players[userId];
                if (player.dead) {
                    seal.replyToSender(ctx, msg, '你已经死亡，无法执行此操作！请使用复活药水或复活术复活。');
                    return;
                }
                let mctx = seal.getCtxProxyFirst(ctx, cmdArgs);
                targetUserId = mctx.player.userId;
                if (!targetUserId) {
                    seal.replyToSender(ctx, msg, '请@你要对战的玩家！');
                    return;
                }
                const targetPlayer = players[targetUserId];
                if (!targetPlayer) {
                    seal.replyToSender(ctx, msg, '目标玩家不存在！');
                    return;
                }
                const pvpData = managePvPData(userId).loadPvP();
                pvpData.challenged = targetUserId;
                managePvPData(userId).savePvP(pvpData);
                seal.replyToSender(ctx, msg, `你向 ${targetPlayer.name} 发起了对战请求！`);
                return;
            }

            case '接受对战': {
                const player = players[userId];
                if (player.dead) {
                    seal.replyToSender(ctx, msg, '你已经死亡，无法执行此操作！请使用复活药水或复活术复活。');
                    return;
                }
                const pvpData = managePvPData(userId).loadPvP();
                if (!pvpData.challenged) {
                    seal.replyToSender(ctx, msg, '当前没有对战请求！');
                    return;
                }
                const targetPlayer = players[pvpData.challenged];
                if (!targetPlayer) {
                    seal.replyToSender(ctx, msg, '目标玩家不存在！');
                    return;
                }
                pvpData.challenged = null;
                managePvPData(userId).savePvP(pvpData);
                seal.replyToSender(ctx, msg, `你接受了 ${targetPlayer.name} 的对战请求！`);
                startPvP(userId, pvpData.challenged);
                return;
            }

            case '拒绝对战': {
                const player = players[userId];
                if (player.dead) {
                    seal.replyToSender(ctx, msg, '你已经死亡，无法执行此操作！请使用复活药水或复活术复活。');
                    return;
                }
                const pvpData = managePvPData(userId).loadPvP();
                if (!pvpData.challenged) {
                    seal.replyToSender(ctx, msg, '当前没有对战请求！');
                    return;
                }
                const targetPlayer = players[pvpData.challenged];
                if (!targetPlayer) {
                    seal.replyToSender(ctx, msg, '目标玩家不存在！');
                    return;
                }
                pvpData.challenged = null;
                managePvPData(userId).savePvP(pvpData);
                seal.replyToSender(ctx, msg, `你拒绝了 ${targetPlayer.name} 的对战请求！`);
                return;
            }

            case '房产': {
                const houseData = manageHouseData(userId).loadHouse();
                seal.replyToSender(ctx, msg, `你的房产信息：\n等级: ${houseData.level}\n收益: ${houseData.income} 金币/天\n防盗性能: ${houseData.security}\n存储: ${houseData.storage} 金币`);
                return;
            }

            case '升级房产': {
                const player = players[userId];
                const houseData = manageHouseData(userId).loadHouse();
                const upgradeCost = houseData.level * 1000;
            
                if (player.gold < upgradeCost) {
                    seal.replyToSender(ctx, msg, `金币不足，无法升级房产！升级需要 ${upgradeCost} 金币。`);
                    return;
                }
            
                player.gold -= upgradeCost;
                houseData.level += 1;
                houseData.income += 10;   // 提高收益
                houseData.security += 2; // 提高安保等级
                houseData.toll += 2;     // 提高过路费能力
                manageHouseData(userId).saveHouse(houseData);
                saveDatabase(dbKeyPlayerData, players);
            
                seal.replyToSender(ctx, msg, `房产升级成功！当前等级: ${houseData.level}\n收益: ${houseData.income} 金币/天\n安保等级: ${houseData.security}\n收取过路费能力: ${houseData.toll}`);
                return;
            }            

            case '收取收益': {
                const player = players[userId];
                const houseData = manageHouseData(userId).loadHouse();
                const now = Date.now();
                const lastCollectTime = houseData.lastCollectTime || now;
            
                const collectInterval = 24 * 60 * 60 * 1000; // 每24小时
                const timeSinceLastCollect = now - lastCollectTime;
            
                if (timeSinceLastCollect < collectInterval && houseData.storage === 0 && (!houseData.storageItems || houseData.storageItems.length === 0)) {
                    const timeLeft = collectInterval - timeSinceLastCollect;
                    const hoursLeft = Math.floor(timeLeft / (60 * 60 * 1000));
                    const minutesLeft = Math.floor((timeLeft % (60 * 60 * 1000)) / (60 * 1000));
                    seal.replyToSender(ctx, msg, `距离下次收取收益还有 ${hoursLeft} 小时 ${minutesLeft} 分钟。`);
                    return;
                }
            
                // 收益计算
                const fullCycles = Math.floor(timeSinceLastCollect / collectInterval);
                const collectAmount = fullCycles * houseData.income + houseData.storage; // 包括冒险者存储的金币
            
                // 转移道具
                const collectedItems = houseData.storageItems || [];
                player.backpack = player.backpack.concat(collectedItems); // 添加到玩家背包
                houseData.storageItems = []; // 清空房产中的存储道具
            
                // 转移金币
                player.gold += collectAmount;
                houseData.storage = 0; // 清空收益库
                houseData.lastCollectTime = now;
                manageHouseData(userId).saveHouse(houseData);
                saveDatabase(dbKeyPlayerData, players);
            
                const itemInfo = collectedItems.length > 0 
                    ? `你还收获了以下道具:\n${collectedItems.map(item => `- ${item.name}`).join('\n')}` 
                    : '';
            
                seal.replyToSender(ctx, msg, `你收取了 ${collectAmount} 金币的房产收益！${itemInfo}`);
                return;
            }                     

            case '签到': {
                const player = players[userId];
                const signInData = manageSignInData(userId).loadSignIn();
                const now = Date.now();
                const lastSignIn = signInData.lastSignIn || 0;
                const signInInterval = 24 * 60 * 60 * 1000; // 24小时
            
                if (now - lastSignIn < signInInterval) {
                    const timeLeft = signInInterval - (now - lastSignIn);
                    const hoursLeft = Math.floor(timeLeft / (60 * 60 * 1000));
                    const minutesLeft = Math.floor((timeLeft % (60 * 60 * 1000)) / (60 * 1000));
                    seal.replyToSender(ctx, msg, `距离下次签到还有 ${hoursLeft} 小时 ${minutesLeft} 分钟。`);
                    return;
                }
            
                // 设置连续签到奖励的上限
                const streakCap = 10;
                const streakBonus = Math.min(signInData.streak + 1, streakCap); // 连续签到奖励限制到10天
                const signInReward = 100 + streakBonus * 10;
            
                player.gold += signInReward;
                signInData.lastSignIn = now;
                signInData.streak = Math.min(signInData.streak + 1, streakCap); // 连续签到天数也限制到10天
                manageSignInData(userId).saveSignIn(signInData);
                saveDatabase(dbKeyPlayerData, players);
            
                seal.replyToSender(ctx, msg, `签到成功！你获得了 ${signInReward} 金币。当前连续签到天数: ${signInData.streak}`);
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
                            effectId: code.trim(),
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
                            effectId: effectString.trim()
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

                    case '作弊': {
                        const cheatCommand = cmdArgs.getArgN(3);
                        const value = parseInt(cmdArgs.getArgN(4), 10);
                        let mctx = seal.getCtxProxyFirst(ctx, cmdArgs);
                        targetUserId = mctx.player.userId;

                        const targetPlayer = players[targetUserId];
                        console.log(targetPlayer);
                        if (!targetPlayer) {
                            seal.replyToSender(ctx, msg, '目标玩家不存在！');
                            return;
                        }

                        switch (cheatCommand) {
                            case '帮助': {
                                seal.replyToSender(ctx, msg, `作弊指令帮助：
.penguin 管理 作弊 金币 数值 - 给指定玩家增加金币
.penguin 管理 作弊 经验 数值 - 给指定玩家增加经验
.penguin 管理 作弊 等级 数值 - 设置指定玩家等级
.penguin 管理 作弊 攻击 数值 - 设置指定玩家攻击力
.penguin 管理 作弊 防御 数值 - 设置指定玩家防御力
.penguin 管理 作弊 生命 数值 - 设置指定玩家生命值
.penguin 管理 作弊 魔力 数值 - 设置指定玩家魔力值
.penguin 管理 作弊 速度 数值 - 设置指定玩家速度
使用@指定对象，未指定就是自身。`);
                                break;
                            }

                            case '金币': {
                                targetPlayer.gold = value;
                                seal.replyToSender(ctx, msg, `作弊成功！设置 ${targetPlayer.name} 的金币数量为 ${value} 。`);
                                break;
                            }

                            case '经验': {
                                targetPlayer.exp = value;
                                seal.replyToSender(ctx, msg, `作弊成功！给 ${targetPlayer.name} 增加了 ${value} 经验值。\n当前经验值: ${targetPlayer.exp}`);
                                break;
                            }

                            case '等级': {
                                targetPlayer.level = value;
                                seal.replyToSender(ctx, msg, `作弊成功！设置 ${targetPlayer.name} 的等级为 ${value}！`);
                                break;
                            }

                            case '攻击': {
                                targetPlayer.attack = value;
                                seal.replyToSender(ctx, msg, `作弊成功！设置 ${targetPlayer.name} 的攻击力为 ${value}！`);
                                break;
                            }

                            case '防御': {
                                targetPlayer.defense = value;
                                seal.replyToSender(ctx, msg, `作弊成功！设置 ${targetPlayer.name} 的防御力为 ${value}！`);
                                break;
                            }

                            case '生命': {
                                targetPlayer.health = value;
                                targetPlayer.maxHealth = value;
                                seal.replyToSender(ctx, msg, `作弊成功！设置 ${targetPlayer.name} 的生命值为 ${value}！`);
                                break;
                            }

                            case '魔力': {
                                targetPlayer.mana = value;
                                targetPlayer.maxMana = value;
                                seal.replyToSender(ctx, msg, `作弊成功！设置 ${targetPlayer.name} 的魔力值为 ${value}！`);
                                break;
                            }

                            case '速度': {
                                targetPlayer.speed = value;
                                seal.replyToSender(ctx, msg, `作弊成功！设置 ${targetPlayer.name} 的速度为 ${value}！`);
                                break;
                            }

                            default: {
                                seal.replyToSender(ctx, msg, '未知作弊指令！请使用 ".penguin 管理 作弊 帮助" 查看帮助。');
                                break;
                            }
                        }

                        saveDatabase(dbKeyPlayerData, players);
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
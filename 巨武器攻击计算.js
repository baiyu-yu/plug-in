// ==UserScript==
// @name         巨武器攻击插件
// @author       白鱼
// @version      1.0.0
// @description  巨武器攻击插件，.jwq 2d6+3+2d6 - 计算巨武器攻击伤害，1和2会被视为3
// @license      MIT
// ==/UserScript==

if (!seal.ext.find('巨武器攻击插件')) {
    const ext = seal.ext.new('巨武器攻击插件', '白鱼', '1.0.0');
    seal.ext.register(ext);

    function rollDice(diceCount, diceFaces) {
        let results = [];
        for (let i = 0; i < diceCount; i++) {
            let roll = Math.floor(Math.random() * diceFaces) + 1;
            if (roll <= 2) {
                results.push({value: 3, original: roll, converted: true});
            } else {
                results.push({value: roll, original: roll, converted: false});
            }
        }
        return results;
    }

    function parseDiceExpression(expr) {
        expr = expr.replace(/\s+/g, '').replace(/D/g, 'd');
        
        let parts = expr.split(/([+\-])/);
        let results = [];
        let calculation = [];
        
        for (let i = 0; i < parts.length; i++) {
            let part = parts[i];
            if (part === '+' || part === '-') {
                calculation.push(part);
                results.push({display: part, value: part});
                continue;
            }

            if (part.includes('d')) {
                let [count, faces] = part.split('d').map(n => n === '' ? 1 : Number(n));
                let rolls = rollDice(count, faces);
                
                let rollStr = '(';
                let values = rolls.map(r => {
                    if (r.converted) {
                        return r.original + '*';
                    }
                    return r.original;
                }).join('+');
                rollStr += values + ')';

                let sum = rolls.reduce((acc, r) => acc + r.value, 0);
                
                results.push({
                    display: rollStr,
                    value: sum,
                    converted: rolls.map(r => r.converted),
                    originals: rolls.map(r => r.original),
                    finalValues: rolls.map(r => r.value)
                });
                calculation.push(sum);
            } else {
                results.push({display: part, value: parseInt(part)});
                calculation.push(parseInt(part));
            }
        }

        let total = calculation[0];
        for (let i = 1; i < calculation.length; i += 2) {
            if (calculation[i] === '+') {
                total += calculation[i + 1];
            } else {
                total -= calculation[i + 1];
            }
        }

        return {
            parts: results,
            total: total,
            calculation: calculation
        };
    }

    const cmdJWQ = seal.ext.newCmdItemInfo();
    cmdJWQ.name = 'jwq';
    cmdJWQ.help = '.jwq [骰子表达式] - 计算巨武器攻击伤害，例如：.jwq 2d6+3+2d6';
    cmdJWQ.solve = (ctx, msg, cmdArgs) => {
        const expr = cmdArgs.getArgN(1);
        const name = ctx.player.name
        
        if (!expr || expr === 'help') {
            seal.replyToSender(ctx, msg, cmdJWQ.help);
            return seal.ext.newCmdExecuteResult(true);
        }
    
        try {
            let result = parseDiceExpression(expr);
            
            let displayStr = expr + '=';
            displayStr += result.parts.map(p => p.display).join('');
            displayStr += '=';
            let convertedParts = result.parts.map(p => {
                if (p.display === '+' || p.display === '-') {
                    return p.display;
                }
                if (p.converted) {
                    let values = p.finalValues.join('+');
                    return `(${values})`;
                }
                return p.display;
            });
            displayStr += convertedParts.join('');
            displayStr += '=' + result.total;
    
            seal.replyToSender(ctx, msg, "<"+ name + ">" + "的巨武器伤害掷骰结果为" + displayStr);
        } catch (error) {
            seal.replyToSender(ctx, msg, "表达式格式错误，请使用正确的格式，例如：2d6+3+2d6");
        }
    
        return seal.ext.newCmdExecuteResult(true);
    };
    
    ext.cmdMap['jwq'] = cmdJWQ;
}
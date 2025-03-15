// ==UserScript==
// @name         巨武器攻击插件
// @author       白鱼
// @version      1.0.0
// @description  巨武器攻击计算插件，.gwm 2d6+3+2d6 - 计算dnd5r巨武器大师攻击伤害，1和2会被视为3；.gwf 2d6+3+2d6 - 计算dnd5e巨武器战斗伤害，1和2会默认重骰一次;规则来源群友介绍，如有不完善请联系插件作者；
// @license      MIT
// ==/UserScript==

if (!seal.ext.find('巨武器攻击插件')) {
    const ext = seal.ext.new('巨武器攻击插件', '白鱼', '1.0.0');
    seal.ext.register(ext);

    function rollDice(diceCount, diceFaces) {
        let results = [];
        for (let i = 0; i < diceCount; i++) {
            let roll = Math.floor(Math.random() * diceFaces) + 1;
            results.push({value: roll, original: roll, converted: false});
        }
        return results;
    }

    function rerollLowDice(rolls, diceFaces) {
        return rolls.map(r => {
            if (r.value <= 2) {
                let newRoll = Math.floor(Math.random() * diceFaces) + 1;
                return {value: newRoll, original: r.original, converted: true};
            }
            return r;
        });
    }

    function convertLowDice(rolls) {
        return rolls.map(r => {
            if (r.value <= 2) {
                return {value: 3, original: r.original, converted: true};
            }
            return r;
        });
    }

    function parseDiceExpression(expr, rerollOnLow = false, convertLow = false) {
        expr = expr.replace(/\s+/g, '').replace(/D/g, 'd');
        
        let parts = expr.split(/([+\-])/);
        let results = [];
        let calculation = [];
        
        for (let i = 0; i < parts.length; i++) {
            let part = parts[i];
            if (part === '+' || part === '-') {
                calculation.push(part);
                results.push({display: part, finalDisplay: part, value: part});
                continue;
            }

            if (part.includes('d')) {
                let [count, faces] = part.split('d').map(n => n === '' ? 1 : Number(n));
                let rolls = rollDice(count, faces);
                
                if (rerollOnLow) {
                    rolls = rerollLowDice(rolls, faces);
                } else if (convertLow) {
                    rolls = convertLowDice(rolls);
                }

                let initialRollStr = '(';
                let initialValues = rolls.map(r => {
                    if (r.original <= 2) {
                        return r.original + '*';
                    }
                    return r.original;
                }).join('+');
                initialRollStr += initialValues + ')';

                let finalRollStr = '(';
                let finalValues = rolls.map(r => r.value).join('+');
                finalRollStr += finalValues + ')';

                let sum = rolls.reduce((acc, r) => acc + r.value, 0);
                
                results.push({
                    display: initialRollStr,
                    finalDisplay: finalRollStr,
                    value: sum,
                    converted: rolls.map(r => r.converted),
                    originals: rolls.map(r => r.original),
                    finalValues: rolls.map(r => r.value)
                });
                calculation.push(sum);
            } else {
                results.push({display: part, finalDisplay: part, value: parseInt(part)});
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
    cmdJWQ.name = 'gwm';
    cmdJWQ.help = '.gwm [骰子表达式] - 计算dnd5r巨武器大师伤害，1和2会被视为3，例如：.gwm 2d6+3+2d6';
    cmdJWQ.solve = (ctx, msg, cmdArgs) => {
        const expr = cmdArgs.getArgN(1);
        const name = ctx.player.name
        
        if (!expr || expr === 'help') {
            seal.replyToSender(ctx, msg, cmdJWQ.help);
            return seal.ext.newCmdExecuteResult(true);
        }
    
        try {
            let result = parseDiceExpression(expr, false, true); // convertLow = true
            
            let displayStr = expr + '=';
            displayStr += result.parts.map(p => p.display).join('');
            displayStr += '=';
            displayStr += result.parts.map(p => p.finalDisplay).join('');
            displayStr += '=' + result.total;
    
            seal.replyToSender(ctx, msg, "<"+ name + ">" + "的巨武器大师伤害掷骰结果为" + displayStr);
        } catch (error) {
            seal.replyToSender(ctx, msg, "表达式格式错误，请使用正确的格式，例如：2d6+3+2d6");
        }
    
        return seal.ext.newCmdExecuteResult(true);
    };
    
    ext.cmdMap['gwm'] = cmdJWQ;

    const cmdJWC = seal.ext.newCmdItemInfo();
    cmdJWC.name = 'gwf';
    cmdJWC.help = '.gwf [骰子表达式] - 计算dnd5e巨武器战斗伤害，1和2会重骰一次，例如：.gwf 2d6+3+2d6';
    cmdJWC.solve = (ctx, msg, cmdArgs) => {
        const expr = cmdArgs.getArgN(1);
        const name = ctx.player.name
        
        if (!expr || expr === 'help') {
            seal.replyToSender(ctx, msg, cmdJWC.help);
            return seal.ext.newCmdExecuteResult(true);
        }
    
        try {
            let result = parseDiceExpression(expr, true, false); 
            
            let displayStr = expr + '=';
            displayStr += result.parts.map(p => p.display).join('');
            displayStr += '=';
            displayStr += result.parts.map(p => p.finalDisplay).join('');
            displayStr += '=' + result.total;
    
            seal.replyToSender(ctx, msg, "<"+ name + ">" + "的巨武器战斗伤害掷骰结果为" + displayStr);
        } catch (error) {
            seal.replyToSender(ctx, msg, "表达式格式错误，请使用正确的格式，例如：2d6+3+2d6");
        }
    
        return seal.ext.newCmdExecuteResult(true);
    };
    
    ext.cmdMap['gwf'] = cmdJWC;
}
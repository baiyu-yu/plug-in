// ==UserScript==
// @name         BaiduTTS Plugin
// @description  百度语音合成插件，支持通过文本生成语音并以Base64格式发送
// @version      1.0.0
// @author       白鱼
// @timestamp    1724850114
// @license      MIT
// @homepageURL  https://github.com/baiyu-yu
// @updateUrl    https://raw.githubusercontent.com/baiyu-yu/main/BaiduTTS.js
// ==/UserScript==

if (!seal.ext.find('BaiduTTS')) {
    const ext = seal.ext.new('BaiduTTS', '白鱼', '1.0.0');
    seal.ext.register(ext);
  
    // 注册配置项
    seal.ext.registerStringConfig(ext, "API密钥", "your_api_key");
    seal.ext.registerStringConfig(ext, "SECRET密钥", "your_secret_key");
    seal.ext.registerBoolConfig(ext, "是否打印日志", true);
  
    const API_KEY = seal.ext.getStringConfig(ext, "API密钥");
    const SECRET_KEY = seal.ext.getStringConfig(ext, "SECRET密钥");
    const PRINT_LOGS = seal.ext.getBoolConfig(ext, "是否打印日志");
  
    class TTSHandler {
      constructor() {
        this.tokenCache = null;
        this.tokenExpire = 0;
      }
  
      async getAccessToken() {
        if (Date.now() < this.tokenExpire) return this.tokenCache;
  
        const url = "https://aip.baidubce.com/oauth/2.0/token";
        const params = `grant_type=client_credentials&client_id=${API_KEY}&client_secret=${SECRET_KEY}`;
  
        try {
          const response = await fetch(`${url}?${params}`);
          const data = await response.json();
          this.tokenCache = data.access_token;
          this.tokenExpire = Date.now() + (data.expires_in - 60) * 1000;
          return this.tokenCache;
        } catch (error) {
          console.error("获取Token失败:", error);
          return null;
        }
      }
  
      async generateSpeech(text, ctx, msg) {
        try {
          const token = await this.getAccessToken();
          if (!token) throw new Error("无法获取Access Token");
  
          const url = "https://tsn.baidu.com/text2audio";
          const params = `tok=${token}&tex=${encodeURIComponent(text)}&cuid=HqVPtu3nMedH9YLgXq4iwORoYvVs3Aeh&ctp=1&lan=zh&spd=5&pit=5&vol=5&per=5003&aue=3`;
  
          const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: params
          });
  
          if (!response.ok) throw new Error(`HTTP错误: ${response.status}`);
  
          const audioText = await response.text();
          const base64String = btoa(audioText); 
          const cqCode = seal.base64ToImage(base64String);
          const cqCodeStr = `[CQ:record,file=${cqCode}]`;
  
          seal.replyToSender(ctx, msg, cqCodeStr);
  
          if (PRINT_LOGS) {
            console.log("语音生成成功，内容长度:", text.length);
            console.log("Base64长度:", base64String.length);
          }
  
        } catch (error) {
          console.error("语音生成失败:", error);
          seal.replyToSender(ctx, msg, "语音生成失败，请检查日志");
        }
      }
    }
  
    globalThis.ttsHandler = new TTSHandler();
  
    const cmdTTS = seal.ext.newCmdItemInfo();
    cmdTTS.name = "tts";
    cmdTTS.help = "文本转语音\n用法：.tts 要合成的文本";
    cmdTTS.solve = async (ctx, msg, cmdArgs) => {
      const text = cmdArgs.args.join(" ");
      if (!text) {
        seal.replyToSender(ctx, msg, "请输入要合成的文本");
        return seal.ext.newCmdExecuteResult(true);
      }
  
      await globalThis.ttsHandler.generateSpeech(text, ctx, msg);
      return seal.ext.newCmdExecuteResult(true);
    };
  
    ext.cmdMap['tts'] = cmdTTS;
  }
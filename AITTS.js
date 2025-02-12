// ==UserScript==
// @name         AITTS Plugin
// @description  AITTS语音合成插件，支持通过ai语音合成模型文本生成语音发送。适配了百度千帆语音大模型和其它能通过http请求调用的语音大模型。
// @version      1.0.0
// @author       白鱼
// @timestamp    1739380274
// @license      MIT
// @homepageURL  https://github.com/baiyu-yu
// @updateUrl    https://raw.githubusercontent.com/baiyu-yu/main/AITTS.js
// ==/UserScript==

if (!seal.ext.find('AITTS')) {
  const ext = seal.ext.new('AITTS', '白鱼', '1.0.0');
  seal.ext.register(ext);

  // 注册语音合成模型选项
  seal.ext.registerOptionConfig(ext, '语音合成模型', '百度大模型语音合成', ['百度大模型语音合成', '自定义'], '选择语音合成模型');

  // 百度大模型语音合成的配置项
  seal.ext.registerStringConfig(ext, "API密钥", "your_api_key");
  seal.ext.registerStringConfig(ext, "SECRET密钥", "your_secret_key");
  seal.ext.registerTemplateConfig(ext, '百度请求体参数', [
      `"cuid":"HqVPtu3nMedH9YLgXq4iwORoYvVs3Aeh"`,
      `"ctp":1`,
      `"lan":"zh"`,
      `"spd":5`,
      `"pit":5`,
      `"vol":5`,
      `"per":5003`,
      `"aue":3`
  ], '百度API的请求体参数，每条参数为键值对格式');

  // 自定义模型的参数配置项（硅基流动平台作为默认例子）
  seal.ext.registerTemplateConfig(ext, '自定义_API端点', ['https://api.siliconflow.cn/v1/audio/speech'], '自定义API端点，只有第一个有效');
  seal.ext.registerTemplateConfig(ext, '自定义_请求头', [
      `"Authorization":"Bearer <token>"`,
      `"Content-Type":"application/json"`
  ], '自定义请求头，每条参数为键值对格式');
  seal.ext.registerTemplateConfig(ext, '自定义_请求体', [
      `"model":"FunAudioLLM/SenseVoiceSmall"`,
      `"input":"{input}"`, // 使用 {input} 作为占位符
      `"voice":"default"`,
      `"speed":1.0`,
      `"gain":0.0`,
      `"response_format":"mp3"`,
      `"sample_rate":44100`
  ], '自定义请求体，每条参数为键值对格式。使用 {input} 作为待转换文本的占位符。');

  class TTSHandler {
      constructor() {
          this.tokenCache = null;
          this.tokenExpire = 0;
      }

      async getAccessToken() {
          if (Date.now() < this.tokenExpire) return this.tokenCache;

          const API_KEY = seal.ext.getStringConfig(ext, "API密钥");
          const SECRET_KEY = seal.ext.getStringConfig(ext, "SECRET密钥");
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

      // 解析并拼接百度请求体参数
      parseBaiduParams(text) {
          const params = seal.ext.getTemplateConfig(ext, '百度请求体参数');
          let body = { tex: text };

          params.forEach(param => {
              try {
                  const [key, value] = param.split(':');
                  const cleanKey = key.trim().replace(/"/g, ''); // 去除键的引号
                  const cleanValue = value.trim().replace(/"/g, ''); // 去除值的引号
                  body[cleanKey] = isNaN(cleanValue) ? cleanValue : Number(cleanValue); // 自动转换数字
              } catch (error) {
                  console.error(`解析百度请求体参数失败: ${param}`, error);
              }
          });

          return body;
      }

      // 解析并拼接自定义请求头
      parseCustomHeaders() {
          const headers = seal.ext.getTemplateConfig(ext, '自定义_请求头');
          let headerObj = {};

          headers.forEach(header => {
              try {
                  const [key, value] = header.split(':');
                  const cleanKey = key.trim().replace(/"/g, ''); // 去除键的引号
                  const cleanValue = value.trim().replace(/"/g, ''); // 去除值的引号
                  headerObj[cleanKey] = cleanValue;
              } catch (error) {
                  console.error(`解析自定义请求头失败: ${header}`, error);
              }
          });

          return headerObj;
      }

      // 解析并拼接自定义请求体，替换 {input} 占位符
      parseCustomBody(text) {
          const bodyParams = seal.ext.getTemplateConfig(ext, '自定义_请求体');
          let body = {};

          bodyParams.forEach(param => {
              try {
                  const [key, value] = param.split(':');
                  const cleanKey = key.trim().replace(/"/g, ''); // 去除键的引号
                  let cleanValue = value.trim().replace(/"/g, ''); // 去除值的引号

                  // 替换 {input} 占位符为实际文本
                  if (cleanValue === '{input}') {
                      cleanValue = text;
                  }

                  body[cleanKey] = isNaN(cleanValue) ? cleanValue : Number(cleanValue); // 自动转换数字
              } catch (error) {
                  console.error(`解析自定义请求体失败: ${param}`, error);
              }
          });

          return body;
      }

      async generateSpeech(text, ctx, msg) {
          try {
              const model = seal.ext.getOptionConfig(ext, '语音合成模型');
              let response;

              if (model === '百度大模型语音合成') {
                  const token = await this.getAccessToken();
                  if (!token) throw new Error("无法获取Access Token");

                  const url = "https://tsn.baidu.com/text2audio";
                  const body = this.parseBaiduParams(text);
                  body.tok = token;

                  response = await fetch(url, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify(body)
                  });
              } else if (model === '自定义') {
                  const endpoint = seal.ext.getTemplateConfig(ext, '自定义_API端点')[0];
                  const headers = this.parseCustomHeaders();
                  const body = this.parseCustomBody(text);

                  response = await fetch(endpoint, {
                      method: 'POST',
                      headers: headers,
                      body: JSON.stringify(body)
                  });
              } else {
                  throw new Error("未知的语音合成模型");
              }

              if (!response.ok) throw new Error(`HTTP错误: ${response.status}`);

              const audioText = await response.text();
              const base64String = btoa(audioText);
              const cqCode = seal.base64ToImage(base64String);
              const cqCodeStr = `[CQ:record,file=${cqCode}]`;

              seal.replyToSender(ctx, msg, cqCodeStr);

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
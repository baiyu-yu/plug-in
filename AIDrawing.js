// ==UserScript==
// @name         AIDrawing依赖
// @description  适配多种AI绘图平台，支持自定义请求体和二次请求。讯飞太特殊了不想支持。.generateimage 你的描述 [负面描述]。
// @version      1.0.2
// @author       白鱼
// @timestamp    1741422937
// @license      MIT
// @homepageURL  https://github.com/baiyu-yu/plug-in/
// @updateUrl    https://raw.gitmirror.com/baiyu-yu/plug-in/main/AIDrawing.js
// @updateUrl    https://raw.githubusercontent.com/baiyu-yu/plug-in/main/AIDrawing.js
// ==/UserScript==

if (!seal.ext.find("AIDrawing")) {
  const ext = seal.ext.new("AIDrawing", "baiyu", "1.0.2");
  seal.ext.register(ext);

  seal.ext.registerStringConfig(
    ext,
    "API端点",
    "https://api.example.com/v1/images/generations",
    "API端点，用于第一次请求"
  );
  seal.ext.registerStringConfig(
    ext,
    "二次请求API端点",
    "https://api.example.com/v1/tasks/{task_id}",
    "二次请求的API端点，使用 {task_id} 作为占位符"
  );
  seal.ext.registerTemplateConfig(
    ext,
    "自定义_请求体",
    [
      `"model":"wanx2.1-t2i-turbo"`,
      `"input":"{\"prompt\":\"{prompt}\",\"negative_prompt\":\"{negative_prompt}\"}"`,
      `"parameters":"{\"size\":\"1024x1024\",\"n\":1}"`,
    ],
    "自定义请求体，每条参数为键值对格式。使用 {prompt} 和 {negative_prompt} 作为占位符。"
  );
  seal.ext.registerTemplateConfig(
    ext,
    "自定义_请求头",
    [
      `"Authorization":"Bearer YOUR_API_KEY"`,
      `"Content-Type":"application/json"`,
    ],
    "自定义请求头，每条参数为键值对格式。"
  );

  class AIDrawing {
    constructor() {
      this.taskIdCache = {};
    }

    formatRequestBody(params, prompt, negativePrompt = "") {
      try {
        const templateObj = params.reduce((acc, param) => {
          const [key, ...valueParts] = param.split(":");
          const value = valueParts.join(":");
          const trimmedKey = key.trim().replace(/"/g, "");
          let trimmedValue = value.trim().replace(/^"|"$/g, "");

          trimmedValue = trimmedValue
            .replace(/{prompt}/g, prompt)
            .replace(/{negative_prompt}/g, negativePrompt);

          let parsedValue;
          if (trimmedValue.startsWith("{") && trimmedValue.endsWith("}")) {
            try {
              parsedValue = JSON.parse(trimmedValue);
            } catch (e) {
              console.error("JSON 解析失败:", e);
              parsedValue = trimmedValue;
            }
          } else {
            parsedValue = trimmedValue.replace(/"/g, "");
          }
          acc[trimmedKey] = parsedValue;
          return acc;
        }, {});
        return JSON.stringify(templateObj);
      } catch (error) {
        console.error("请求体处理失败:", error);
        throw new Error("请求体格式不正确，请检查配置");
      }
    }
    // 格式化请求头
    formatRequestHeaders(headers) {
      try {
        const headerObj = headers.reduce((acc, header) => {
          const [key, value] = header.split(":");
          acc[key.trim().replace(/"/g, "")] = value.trim().replace(/"/g, "");
          return acc;
        }, {});
        return headerObj;
      } catch (error) {
        console.error("格式化请求头失败:", error);
        throw new Error("请求头格式不正确，请检查配置");
      }
    }
    // 发送请求生成图像
    async generateImage(prompt, ctx, msg, negativePrompt = "") {
      let response;
      try {
        const endpoint = seal.ext.getStringConfig(ext, "API端点");
        const params = seal.ext.getTemplateConfig(ext, "自定义_请求体");
        const headers = seal.ext.getTemplateConfig(ext, "自定义_请求头");
        const body = this.formatRequestBody(params, prompt, negativePrompt);
        const requestHeaders = this.formatRequestHeaders(headers);

        console.log("===== 开始请求 =====");
        console.log("请求地址:", endpoint);
        console.log("请求头:", JSON.stringify(requestHeaders, null, 2));
        console.log("请求体:", body);

        // fetch 可能在这里就抛出错误（网络问题、CORS等）
        try {
          response = await fetch(endpoint, {
            method: "POST",
            headers: requestHeaders,
            body: body,
          });
        } catch (fetchError) {
          // 捕获 fetch 本身的错误
          console.error("===== Fetch 错误 =====");
          console.error("错误类型:", fetchError.constructor.name);
          console.error("错误消息:", fetchError.message);
          console.error("错误堆栈:", fetchError.stack);
          console.error("完整错误对象:", JSON.stringify(fetchError, Object.getOwnPropertyNames(fetchError)));
          throw new Error(`网络请求失败: ${fetchError.message || '未知错误'}`);
        }

        console.log("===== 收到响应 =====");
        console.log("响应状态码:", response.status);
        console.log("响应状态文本:", response.statusText);

        // 先获取响应文本
        let responseText;
        try {
          responseText = await response.text();
          console.log("响应体原文:", responseText);
        } catch (textError) {
          console.error("读取响应体失败:", textError);
          throw new Error(`无法读取响应内容: ${textError.message}`);
        }

        // 尝试解析 JSON
        let data;
        try {
          data = JSON.parse(responseText);
          console.log("解析后的 JSON:", JSON.stringify(data, null, 2));
        } catch (parseError) {
          console.error("===== JSON 解析失败 =====");
          console.error("解析错误:", parseError.message);
          console.error("响应内容前500字符:", responseText.substring(0, 500));
          throw new Error(`服务器返回了无效的 JSON。状态码: ${response.status}\n内容预览: ${responseText.substring(0, 200)}`);
        }

        // 检查响应状态
        if (!response.ok) {
          console.error("===== HTTP 错误响应 =====");
          let errorMsg = `HTTP ${response.status} ${response.statusText}`;
          
          // 尝试多种错误信息格式
          if (data.error) {
            if (typeof data.error === 'string') {
              errorMsg += `\n错误: ${data.error}`;
            } else if (data.error.message) {
              errorMsg += `\n错误: ${data.error.message}`;
            } else {
              errorMsg += `\n错误: ${JSON.stringify(data.error)}`;
            }
          }
          if (data.message) {
            errorMsg += `\n消息: ${data.message}`;
          }
          if (data.msg) {
            errorMsg += `\n消息: ${data.msg}`;
          }
          
          console.error("完整错误响应:", JSON.stringify(data, null, 2));
          throw new Error(errorMsg);
        }

        // 处理成功响应
        console.log("===== 处理成功响应 =====");
        if (data.output && data.output.task_status === "PENDING") {
          const taskId = data.output.task_id;
          console.log("任务ID:", taskId);
          this.taskIdCache[taskId] = { ctx, msg };
          setTimeout(() => this.pollTaskStatus(taskId), 15000);
          seal.replyToSender(ctx, msg, "任务已提交，正在生成图像，请稍候...");
        } else if (data.url) {
          const imageUrl = data.url;
          console.log("图像URL:", imageUrl);
          seal.replyToSender(ctx, msg, `[CQ:image,file=${imageUrl}]`);
        } else if (data.images && data.images[0] && data.images[0].url) {
          const imageUrl = data.images[0].url;
          console.log("图像URL:", imageUrl);
          seal.replyToSender(ctx, msg, `[CQ:image,file=${imageUrl}]`);
        } else {
          console.error("===== 未知响应格式 =====");
          console.error("完整响应:", JSON.stringify(data, null, 2));
          throw new Error(`无法从响应中提取图像URL`);
        }
      } catch (error) {
        console.error("===== 最终捕获的错误 =====");
        console.error("错误类型:", error.constructor.name);
        console.error("错误消息:", error.message);
        console.error("错误堆栈:", error.stack);
        console.error("完整错误:", JSON.stringify(error, Object.getOwnPropertyNames(error)));
        
        // 给用户的友好提示
        let userMessage = "图像生成失败";
        if (error.message) {
          userMessage += `: ${error.message}`;
        }
        seal.replyToSender(ctx, msg, userMessage);
      }
    }

    // 轮询任务状态
    async pollTaskStatus(taskId) {
      let response;
      try {
        const endpoint = seal.ext
          .getStringConfig(ext, "二次请求API端点")
          .replace("{task_id}", taskId);
        const headers = seal.ext.getTemplateConfig(ext, "自定义_请求头");
        const requestHeaders = this.formatRequestHeaders(headers);

        console.log("===== 轮询任务状态 =====");
        console.log("任务ID:", taskId);
        console.log("请求地址:", endpoint);

        try {
          response = await fetch(endpoint, {
            method: "GET",
            headers: requestHeaders,
          });
        } catch (fetchError) {
          console.error("===== 轮询 Fetch 错误 =====");
          console.error("错误消息:", fetchError.message);
          console.error("完整错误:", JSON.stringify(fetchError, Object.getOwnPropertyNames(fetchError)));
          throw new Error(`网络请求失败: ${fetchError.message || '未知错误'}`);
        }

        console.log("轮询响应状态码:", response.status);

        let responseText;
        try {
          responseText = await response.text();
          console.log("轮询响应体:", responseText);
        } catch (textError) {
          throw new Error(`无法读取响应内容: ${textError.message}`);
        }

        let data;
        try {
          data = JSON.parse(responseText);
        } catch (parseError) {
          console.error("轮询 JSON 解析失败:", parseError.message);
          throw new Error(`服务器返回了无效的 JSON: ${responseText.substring(0, 200)}`);
        }

        if (!response.ok) {
          let errorMsg = `HTTP ${response.status}`;
          if (data.error) {
            errorMsg += `: ${typeof data.error === 'string' ? data.error : data.error.message || JSON.stringify(data.error)}`;
          }
          if (data.message) errorMsg += `: ${data.message}`;
          throw new Error(errorMsg);
        }

        // 处理任务状态
        if (data.output && data.output.task_status === "SUCCEEDED") {
          const imageUrl = data.output.results[0].url;
          console.log("任务完成，图像URL:", imageUrl);
          const { ctx, msg } = this.taskIdCache[taskId];
          seal.replyToSender(ctx, msg, `[CQ:image,file=${imageUrl}]`);
          delete this.taskIdCache[taskId];
        } else if (data.output && (data.output.task_status === "RUNNING" || data.output.task_status === "PENDING")) {
          console.log("任务进行中，15秒后重试");
          setTimeout(() => this.pollTaskStatus(taskId), 15000);
        } else {
          const status = data.output ? data.output.task_status : '未知';
          console.error("任务状态异常:", status);
          throw new Error(`任务失败，状态: ${status}`);
        }
      } catch (error) {
        console.error("===== 轮询错误 =====");
        console.error("错误类型:", error.constructor.name);
        console.error("错误消息:", error.message);
        console.error("完整错误:", JSON.stringify(error, Object.getOwnPropertyNames(error)));
        
        if (this.taskIdCache[taskId]) {
          const { ctx, msg } = this.taskIdCache[taskId];
          seal.replyToSender(ctx, msg, `图像生成失败: ${error.message || '未知错误'}`);
          delete this.taskIdCache[taskId];
        }
      }
    }
}

  globalThis.aiDrawing = new AIDrawing();

  const cmdGenerateImage = seal.ext.newCmdItemInfo();
  cmdGenerateImage.name = "generateimage";
  cmdGenerateImage.help =
    "通过文字描述生成图像\n用法：.generateimage 你的描述 [负面描述]";
  cmdGenerateImage.solve = async (ctx, msg, cmdArgs) => {
    let text = cmdArgs.getArgN(1);
    if (text) {
      let negativePrompt = cmdArgs.getArgN(2) || "";
      await globalThis.aiDrawing.generateImage(text, ctx, msg, negativePrompt);
    } else {
      seal.replyToSender(ctx, msg, `请输入描述`);
    }
    return seal.ext.newCmdExecuteResult(true);
  };
  ext.cmdMap["generateimage"] = cmdGenerateImage;
}

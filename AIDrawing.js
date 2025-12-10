// ==UserScript==
// @name         AIDrawing依赖
// @description  适配多种AI绘图平台，支持自定义请求体和二次请求。讯飞太特殊了不想支持。.generateimage 你的描述 [负面描述]。
// @version      1.1.0
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
    // 发送图像请求，内部处理轮询，直接返回 URL 或错误
    async sendImageRequest(prompt, negativePrompt = "") {
      try {
        const endpoint = seal.ext.getStringConfig(ext, "API端点");
        const params = seal.ext.getTemplateConfig(ext, "自定义_请求体");
        const headers = seal.ext.getTemplateConfig(ext, "自定义_请求头");
        const body = this.formatRequestBody(params, prompt, negativePrompt);
        const requestHeaders = this.formatRequestHeaders(headers);

        let response;
        try {
          response = await fetch(endpoint, {
            method: "POST",
            headers: requestHeaders,
            body: body,
          });
        } catch (fetchError) {
          throw new Error(`网络请求失败: ${fetchError.message || '未知错误'}`);
        }

        console.log("sendImageRequest 响应状态码:", response.status, response.statusText);

        let responseText;
        try {
          responseText = await response.text();
        } catch (textError) {
          throw new Error(`无法读取响应内容: ${textError.message}`);
        }

        let data;
        try {
          data = JSON.parse(responseText);
        } catch (parseError) {
          console.error("sendImageRequest JSON 解析失败:", parseError.message);
          throw new Error(`服务器返回了无效的 JSON。状态码: ${response.status}\n内容预览: ${responseText.substring(0,200)}`);
        }

        if (!response.ok) {
          let errorMsg = `HTTP ${response.status} ${response.statusText}`;
          if (data.error) {
            if (typeof data.error === 'string') {
              errorMsg += `\n错误: ${data.error}`;
            } else if (data.error.message) {
              errorMsg += `\n错误: ${data.error.message}`;
            } else {
              errorMsg += `\n错误: ${JSON.stringify(data.error)}`;
            }
          }
          if (data.message) errorMsg += `\n消息: ${data.message}`;
          if (data.msg) errorMsg += `\n消息: ${data.msg}`;
          throw new Error(errorMsg);
        }

        // 处理立即返回 URL 的情况
        if (data.url) {
          return data.url;
        } else if (data.images && data.images[0] && data.images[0].url) {
          return data.images[0].url;
        } else if (data.data && data.data[0] && data.data[0]?.url) {
          return data.data[0].url;
        }

        // 处理立即返回 base64 的情况
        if (data.b64_json) {
            return data.b64_json;
        } else if (data.data && data.data[0] && data.data[0].b64_json) {
            return data.data[0].b64_json;
        } else if (data.images && data.images[0] && data.images[0].b64_json) {
            return data.images[0].b64_json;
        }

        // 处理需要轮询的情况
        if (data.output && data.output.task_status === "PENDING") {
          const taskId = data.output.task_id;
          console.log("sendImageRequest 任务提交，taskId:", taskId);
          return await this.pollUntilComplete(taskId);
        }

        console.error("sendImageRequest 未知响应格式:", JSON.stringify(data, null, 2));
        throw new Error(`无法从响应中提取图像URL`);
      } catch (error) {
        console.error("sendImageRequest 最终捕获的错误:", error);
        throw error;
      }
    }

    // 轮询直到任务完成，返回图像 URL
    async pollUntilComplete(taskId, maxRetries = 20) {
      for (let retry = 0; retry < maxRetries; retry++) {
        try {
          const endpoint = seal.ext
            .getStringConfig(ext, "二次请求API端点")
            .replace("{task_id}", taskId);
          const headers = seal.ext.getTemplateConfig(ext, "自定义_请求头");
          const requestHeaders = this.formatRequestHeaders(headers);

          let response;
          try {
            response = await fetch(endpoint, {
              method: "GET",
              headers: requestHeaders,
            });
          } catch (fetchError) {
            console.error("轮询 Fetch 错误:", fetchError);
            throw new Error(`轮询网络请求失败: ${fetchError.message || '未知错误'}`);
          }

          console.log("轮询响应状态码:", response.status);

          let responseText;
          try {
            responseText = await response.text();
          } catch (textError) {
            throw new Error(`无法读取轮询响应内容: ${textError.message}`);
          }

          let data;
          try {
            data = JSON.parse(responseText);
          } catch (parseError) {
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

          if (data.output && data.output.task_status === "SUCCEEDED") {
            const imageUrl = data.output.results[0].url;
            return imageUrl;
          } else if (data.output && (data.output.task_status === "RUNNING" || data.output.task_status === "PENDING")) {
            await new Promise(resolve => setTimeout(resolve, 15000));
            continue;
          } else {
            const status = data.output ? data.output.task_status : '未知';
            throw new Error(`任务失败，状态: ${status}`);
          }
        } catch (error) {
          if (retry === maxRetries - 1) {
            console.error("轮询最大重试次数已达，放弃轮询");
            throw error;
          }
        }
      }
      throw new Error(`轮询超时：${maxRetries * 15}秒内未完成`);
    }
    // 生成图像：发送请求，处理返回和错误
    async generateImage(prompt, ctx, msg, negativePrompt = "") {
      try {
        const result = await this.sendImageRequest(prompt, negativePrompt);
        if (result.startsWith("http://") || result.startsWith("https://")) {
            seal.replyToSender(ctx, msg, `[CQ:image,file=${result}]`);
        } else {
            try {
                const imagePath = seal.base64ToImage(result);
                seal.replyToSender(ctx, msg, `[CQ:image,file=${imagePath}]`);
            } catch (e) {
                console.error("Base64 转图片失败:", e);
                throw new Error("成功获取 Base64 数据，但保存为本地图片文件失败");
            }
        }
      } catch (error) {
        console.error("generateImage 捕获错误:", error);
        seal.replyToSender(ctx, msg, `图像生成失败: ${error.message || String(error)}`);
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
      seal.replyToSender(ctx, msg, "正在生成图像，请稍候...");
      await globalThis.aiDrawing.generateImage(text, ctx, msg, negativePrompt);
    } else {
      seal.replyToSender(ctx, msg, `请输入描述`);
    }
    return seal.ext.newCmdExecuteResult(true);
  };
  ext.cmdMap["generateimage"] = cmdGenerateImage;
}

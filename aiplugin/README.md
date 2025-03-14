# AI Plugin3 与 AI图片小偷插件

## 部分 AI 开放平台链接

* [DeepSeek](https://platform.deepseek.com/)
* [Moonshot AI](https://platform.moonshot.cn/)
* [阿里云百炼](https://www.aliyun.com/product/bailian)
* [智谱AI](https://bigmodel.cn/)
* [讯飞星火](https://www.xfyun.cn/)
* [豆包大模型](https://www.volcengine.com/product/doubao)

## AI Plugin3

### 简介

AI Plugin3 是一个支持大部分 OpenAI API 兼容格式的模型插件，用于与 AI 进行对话，并根据特定关键词触发回复。安装**AI图片小偷插件**后，可以为该插件提供**图像识别**的能力。

### 功能特点

- 根据关键词触发回复
- 自定义角色设定
- 支持私聊和群聊
- 计数器(counter)、计时器(timer)和插嘴模式(interrupt)

### 安装配置

1. 在 AI 开放平台上配置 API Key 和 URL 地址。
2. 查阅接口文档，按需修改body的参数。参数`messages`、`stop`、`stream`无需填写。
3. 根据需要设置插件的配置项，例如角色设定、关键词、触发条件等。

### 使用方法

- 使用 `.ai help` 查看使用方法。
- 非指令消息也可以触发 AI 回复，具体触发条件可在插件配置中设置。

## AI图片小偷

### 简介

AI图片小偷是一个为 AI Plugin3 提供图片识别能力的插件。它可以从聊天中提取图片 URL，识别图片内容，并根据图片内容给出文字回复。就算没有配置ai，也可以单纯用作偷图片的插件。

### 功能特点

- 识别并存储图片 URL
- 根据关键词触发回复
- 支持本地图片

### 安装配置(如果需要AI功能的话)

1. 在图片大模型开放平台上配置 API Key 和 URL 地址。
2. 查阅接口文档，按需修改body的参数。参数`messages`、`stop`、`stream`无需填写。
3. 设置插件的配置项，例如图片存储上限、发送图片的概率等。

### 使用方法

- 使用 `.img` 命令查看使用方法。
- 非指令消息也可以触发随机回复图片，具体触发条件可在插件配置中设置。

## 注意事项

- 请确保在使用插件时遵守相关法律法规，不侵犯他人隐私和版权。
- 插件使用过程中可能需要定期更新和维护，请留意插件的版本更新。

## 贡献与支持

- 如果您在使用过程中遇到问题，可以在 GitHub 上提交 issue。
- 欢迎对插件进行改进和优化，提交 pull request。

## 许可证

本插件采用 MIT 许可证。

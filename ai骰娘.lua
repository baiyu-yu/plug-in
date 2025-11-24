-- 基于api请求的对于大部分大模型适用的AI插件
-- 作者: 白鱼
-- 版本: 1.0.0
-- 协议: MIT
-- 内含指令: 触发词，清除上下文指令
-- 本文件仅供学习交流之用，不代表作者观念

-- 加载json模块
local json = require("json")

-- 配置
local API_URL = "https://api.deepseek.com/chat/completions" -- 自定义大模型的API URL
local ACCESS_TOKEN = "yours" -- 自定义访问令牌，即你的api
local MAX_REPLY_LENGTH = 300 -- 回复的最大长度,防止很特殊情况下最大令牌数不起效直接截断
local TRIGGER_WORD = '测试姬' -- 单个触发词，前缀匹配，我不会弄成包含呜呜
local CLEAR_CONTEXT_COMMAND = '清除上下文' -- 清除上下文指令
local MODEL_NAME = "deepseek-chat" -- 自定义模型名称
local SYSTEM_PROMPT = "你是一只测试姬" -- 背景设定
local MAX_TOKENS = 200 -- 单次回复最大令牌数
local MAX_CONTEXT_LENGTH = 10 -- 上下文最大长度，达到限定长度会遗忘最早的

-- 初始化全局变量
if not globalThis then
  globalThis = {}
end
if not globalThis.aiPluginContextMap then
  globalThis.aiPluginContextMap = {}
end

-- AI 插件类
local AIPlugin = {}
AIPlugin.__index = AIPlugin

function AIPlugin:new(uid, groupId)
  local self = setmetatable({}, AIPlugin)
  self.uid = uid
  self.groupId = groupId
  self.context = self:loadContext() or {
    { role = "system", content = SYSTEM_PROMPT }
  }
  return self
end

function AIPlugin:loadContext()
  local context
  if self.groupId then
    context = getGroupConf(self.groupId, "ai_context")
  else
    context = getUserConf(self.uid, "ai_context")
  end
  return context
end

function AIPlugin:saveContext()
  if self.groupId then
    setGroupConf(self.groupId, "ai_context", self.context)
  else
    setUserConf(self.uid, "ai_context", self.context)
  end
end

function AIPlugin:clearContext()
  self.context = {
    { role = "system", content = SYSTEM_PROMPT }
  }
  self:saveContext()
end

function AIPlugin:chat(text, ctx, msg)
  local nick = getUserConf(msg.fromQQ, "nick#" .. (msg.fromGroup or ""), getUserConf(msg.fromQQ, "nick", getUserConf(msg.fromQQ, "name", "")))
  local userMessage = { role = "user", content = nick .. ": " .. text }
  table.insert(self.context, userMessage)

  if #self.context > MAX_CONTEXT_LENGTH then
    table.remove(self.context, 1)
  end

  local request_body = {
    messages = self.context,
    model = MODEL_NAME,
    max_tokens = MAX_TOKENS
  }

  -- 输出请求体日志
  log("请求体: " .. json.encode(request_body))

  -- 添加 Content-Type 头信息
  local headers = {
    Authorization = "Bearer " .. ACCESS_TOKEN,
    ["Content-Type"] = "application/json"
  }

  -- 发送HTTP POST请求
  local err, response = http.post(API_URL, json.encode(request_body), headers)

  -- 检查请求是否出错
  if not err then
    log("HTTP请求出错：" .. tostring(response))
    return
  end

  -- 检查HTTP响应是否为空
  if not response then
    log("HTTP响应为空")
    return
  end

  -- 输出完整的响应内容日志
  log("完整响应内容: " .. json.encode(response))
  
  local success, data = pcall(json.decode, response)
  if not success then
    log("解析JSON失败: " .. tostring(data))
    sendMsg("服务器响应解析失败，请稍后再试。", msg.fromGroup, msg.fromQQ)
    return
  end

  if data.choices and #data.choices > 0 then
    local reply = data.choices[1].message.content
    if #reply > MAX_REPLY_LENGTH then
      reply = string.sub(reply, 1, MAX_REPLY_LENGTH) .. "..."
    end
    table.insert(self.context, { role = "assistant", content = reply })
    self:saveContext()
    sendMsg(reply, msg.fromGroup, msg.fromQQ)
    log("回复: " .. reply)
  else
    log("服务器响应中没有choices或choices为空:" .. json.encode(data))
    sendMsg("服务器响应中没有有效回复，请稍后再试。", msg.fromGroup, msg.fromQQ)
  end
end

function handle_message(msg)
    local uid = msg.fromQQ
    local groupId = msg.fromGroup
    local ai

    if groupId then
      ai = globalThis.aiPluginContextMap[groupId]
    else
      ai = globalThis.aiPluginContextMap[uid]
    end

    if not ai then
      ai = AIPlugin:new(uid, groupId)
      if groupId then
        globalThis.aiPluginContextMap[groupId] = ai
      else
        globalThis.aiPluginContextMap[uid] = ai
      end
    end
    ai:chat(msg.fromMsg, msg, msg)
end

function clear_context(msg)
  local uid = msg.fromQQ
  local groupId = msg.fromGroup
  local ai

  if groupId then
    ai = globalThis.aiPluginContextMap[groupId]
  else
    ai = globalThis.aiPluginContextMap[uid]
  end

  if not ai then
    ai = AIPlugin:new(uid, groupId)
    if groupId then
      globalThis.aiPluginContextMap[groupId] = ai
    else
      globalThis.aiPluginContextMap[uid] = ai
    end
  end

  ai:clearContext()
  sendMsg("上下文已清除。", msg.fromGroup, msg.fromQQ)
end

-- 注册消息处理函数
msg_order = {}
msg_order[TRIGGER_WORD] = "handle_message"
msg_order[CLEAR_CONTEXT_COMMAND] = "clear_context"

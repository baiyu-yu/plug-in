// ==UserScript==
// @name         传群相册
// @author       白鱼
// @version      1.0.0
// @description  引用图片消息上传到群相册
// @license      MIT
// ==/UserScript==


let ext = seal.ext.find('传群相册');
if (!ext) {
  ext = seal.ext.new('传群相册', '白鱼', '1.0.0');
  seal.ext.register(ext);
}

/**
 * 从消息内容中提取回复的消息ID
 * @param {string} message 消息内容
 * @returns {string|null} 消息ID
 */
function extractReplyMessageId(message) {
  const match = message.match(/\[CQ:reply,id=(-?\d+)\]/);
  if (match) {
    return match[1];
  }
  return null;
}

/**
 * 从消息中提取相册名称
 * @param {string} message 消息内容
 * @returns {string|null} 相册名称，没有则返回null
 */
function extractAlbumName(message) {
  const cleanMsg = message.replace(/\[CQ:[^\]]+\]/g, '').trim();
  const match = cleanMsg.match(/(?:上传相册|传相册)\s*(.+)/);
  if (match && match[1]) {
    return match[1].trim();
  }
  return null;
}

/**
 * 从消息段中提取图片URL
 * @param {Array|string} messageSegments 消息段
 * @returns {string|null} 图片URL
 */
function extractImageFromMessage(messageSegments) {
  if (typeof messageSegments === 'string') {
    const urlMatch = messageSegments.match(/\[CQ:image,[^\]]*url=([^\],\]]+)/);
    if (urlMatch) {
      return urlMatch[1];
    }
    const fileMatch = messageSegments.match(/\[CQ:image,[^\]]*file=([^\],\]]+)/);
    if (fileMatch) {
      return fileMatch[1];
    }
    return null;
  }


  if (Array.isArray(messageSegments)) {
    for (const seg of messageSegments) {
      if (seg.type === 'image') {
        return seg.data.url || seg.data.file || null;
      }
    }
  }
  return null;
}

ext.onNotCommandReceived = async (ctx, msg) => {
  const message = msg.message;

  if (!message.includes('上传相册') && !message.includes('传相册')) {
    return;
  }

  const replyMsgId = extractReplyMessageId(message);
  if (!replyMsgId) {
    return;
  }

  if (!globalThis.net) {
    return;
  }

  const epId = ctx.endPoint.userId;
  const groupId = msg.groupId.replace(/\D+/g, '');
  const albumNameFromMsg = extractAlbumName(message);

  try {

    const msgData = await globalThis.net.callApi(epId, 'get_msg', {
      message_id: parseInt(replyMsgId, 10)
    });

    if (!msgData || !msgData.message) {
      seal.replyToSender(ctx, msg, "无法获取消息内容");
      return;
    }

    const imageFile = extractImageFromMessage(msgData.message);
    if (!imageFile) {
      seal.replyToSender(ctx, msg, "回复的消息中没有找到图片");
      return;
    }

    const albumList = await globalThis.net.callApi(epId, 'get_qun_album_list', {
      group_id: groupId
    });

    if (!albumList || !Array.isArray(albumList) || albumList.length === 0) {
      seal.replyToSender(ctx, msg, "无法获取群相册列表或相册为空");
      return;
    }

    let targetAlbum = albumList[0];
    if (albumNameFromMsg) {
      const found = albumList.find(a => a.name === albumNameFromMsg);
      if (found) {
        targetAlbum = found;
      } else {
        console.log(ctx, msg, `未找到名为「${albumNameFromMsg}」的相册，使用默认相册: ${targetAlbum.name}`);
      }
    }

    const uploadResult = await globalThis.net.callApi(epId, 'upload_image_to_qun_album', {
      group_id: groupId,
      album_id: targetAlbum.album_id,
      album_name: targetAlbum.name,
      file: imageFile
    });

    console.log("上传结果:", JSON.stringify(uploadResult));

  } catch (err) {
    console.error("上传群相册失败:", err.message);
    seal.replyToSender(ctx, msg, `上传失败: ${err.message}`);
  }
};

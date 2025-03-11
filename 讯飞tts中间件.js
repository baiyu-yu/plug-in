const WebSocket = require('ws');
const crypto = require('crypto');
const base64 = require('base-64');

class XunfeiTTSMiddleware {
    constructor(apiKey, apiSecret, appId) {
        this.apiKey = apiKey;
        this.apiSecret = apiSecret;
        this.appId = appId;
    }

    // 生成鉴权参数
    generateAuthParams() {
        const date = new Date().toUTCString();
        const signatureOrigin = `host: tts-api.xfyun.cn\ndate: ${date}\nGET /v2/tts HTTP/1.1`;
        const signatureSha = crypto.createHmac('sha256', this.apiSecret).update(signatureOrigin).digest('base64');
        const authorizationOrigin = `api_key="${this.apiKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signatureSha}"`;
        const authorization = Buffer.from(authorizationOrigin).toString('base64');
        return {
            host: 'tts-api.xfyun.cn',
            date: date,
            authorization: authorization
        };
    }

    // 生成WebSocket URL
    generateWebSocketUrl() {
        const authParams = this.generateAuthParams();
        const queryParams = new URLSearchParams(authParams).toString();
        return `wss://tts-api.xfyun.cn/v2/tts?${queryParams}`;
    }

    // 发送请求并获取音频数据
    getAudioData(text) {
        const wsUrl = this.generateWebSocketUrl();
        const ws = new WebSocket(wsUrl);

        return new Promise((resolve, reject) => {
            ws.on('open', () => {
                const requestData = {
                    common: {
                        app_id: this.appId
                    },
                    business: {
                        aue: 'lame',
                        auf: 'audio/L16;rate=16000', // 必填参数
                        vcn: 'xiaoyan',// 音色
                        tte: 'UTF8', // 必填参数
                        speed: 50,
                        volume: 50,
                        pitch: 50
                    },
                    data: {
                        status: 2,
                        text: Buffer.from(text).toString('base64')
                    }
                };

                ws.send(JSON.stringify(requestData));
            });

            let audioData = '';
            ws.on('message', (data) => {
                const response = data.toString();
                console.log('Received message from WebSocket:', response);
                try {
                    const jsonResponse = JSON.parse(response);
                    if (jsonResponse.code === 0 && jsonResponse.data && jsonResponse.data.audio) {
                        audioData += jsonResponse.data.audio;
                    } else if (jsonResponse.code !== 0) {
                        console.error('WebSocket error:', jsonResponse.message);
                        reject(new Error(jsonResponse.message));
                    }
                    if (jsonResponse.data && jsonResponse.data.status === 2) {
                        ws.close();

                        resolve(audioData);
                    }
                } catch (error) {
                    console.error('Failed to parse WebSocket message:', error);
                    reject(error);
                }
            });

            ws.on('error', (error) => {
                console.error('WebSocket error:', error);
                reject(error);
            });

            ws.on('close', () => {
                if (!audioData) {
                    console.error('No audio data received');
                    reject(new Error('No audio data received'));
                }
            });
        });
    }
}

const middleware = new XunfeiTTSMiddleware('your_api_key', 'your_api_secret', 'your_app_id');// 填这个

const express = require('express');
const app = express();
app.use(express.json());

app.post('/tts', (req, res) => {
    const text = req.body.text;
    if (!text) {
        res.status(400).send('Text is required');
        return;
    }

    middleware.getAudioData(text)
        .then(audioData => {
            const audioBuffer = Buffer.from(audioData, 'base64');
            res.status(200).send(audioBuffer); 
        })
        .catch(error => {
            res.status(500).send(`Error: ${error.message}`);
        });
});

app.listen(3000, () => {
    console.log('Server is running on port 3000');
});

// 调用是127.0.0.1:3000/tts，请求头Content-Type: application/json，请求体"text":{prompt}
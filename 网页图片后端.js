// 依赖和如果缺的字体自己装，懒惰了

const express = require('express');
const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const port = 45432; // 端口，确保没用过
const screenshotDir = path.join(__dirname, 'screenshots');

app.use(express.json());
app.use('/screenshots', express.static(screenshotDir)); 

fs.mkdir(screenshotDir, { recursive: true }).catch(console.error);

app.post('/api/generate-long-screenshot', async (req, res) => {
    const { url, viewportWidth = 1280, viewportHeight = 800, fullPage = true, delay = 2000, imageFormat = 'png', quality } = req.body;

    if (!url) {
        return res.status(400).json({ status: 'error', message: 'Missing required parameter: url' });
    }

    try {
        const browser = await puppeteer.launch({
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--proxy-server=http://127.0.0.1:7890'] // 配置本地代理，不用的话把--proxy-server这删了
        });
        const page = await browser.newPage();
        await page.setViewport({ width: viewportWidth, height: viewportHeight });
        await page.goto(url, { waitUntil: 'networkidle0' });

        await new Promise(resolve => setTimeout(resolve, delay));

        const timestamp = Date.now();
        const filename = `screenshot_${timestamp}.${imageFormat}`;
        const filepath = path.join(screenshotDir, filename);

        await page.screenshot({
            path: filepath,
            fullPage: fullPage,
            ...(imageFormat === 'jpeg' && quality ? { quality: quality } : {}),
            type: imageFormat === 'jpeg' ? 'jpeg' : 'png'
        });

        await browser.close();

        const imageUrl = `/screenshots/${filename}`;
        res.json({ status: 'success', imageUrl: imageUrl });

    } catch (error) {
        console.error('Error generating screenshot:', error);
        res.status(500).json({ status: 'error', message: 'Failed to generate screenshot', details: error.message });
    }
});

app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
});
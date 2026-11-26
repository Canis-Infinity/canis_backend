const { z } = require('zod');
const inputSchema = z.object({
  html: z.string().min(1).max(1000000),
  css: z.string().min(1).max(700000),
  theme: z.enum(['light', 'dark']),
});
let active = 0;
async function renderReport(input, getImage) {
  const { html, css, theme } = inputSchema.parse(input);
  if (active >= 2)
    throw Object.assign(new Error('報表產生中，請稍後再試'), { status: 429 });
  active++;
  let browser;
  try {
    const { default: puppeteer } = await import('puppeteer-core');
    browser = await puppeteer.launch({
      executablePath: process.env.SELF_CHROMIUM_PATH || '/usr/bin/chromium',
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
      timeout: 15000,
    });
    const page = await browser.newPage();
    page.setDefaultTimeout(20000);
    await page.setJavaScriptEnabled(false);
    await page.setRequestInterception(true);
    page.on('request', async (request) => {
      try {
        const url = new URL(request.url());
        const match =
          url.origin === 'https://self-pdf.invalid' &&
          /^\/api\/self\/images\/([a-f0-9]{24})$/.exec(url.pathname);
        if (!match || request.resourceType() !== 'image')
          return await request.abort();
        const image = await getImage(match[1]);
        if (!image) return await request.respond({ status: 404, body: '' });
        await request.respond({
          status: 200,
          contentType: image.mime,
          body: image.data,
        });
      } catch {
        if (!request.isInterceptResolutionHandled())
          await request.abort().catch(() => {});
      }
    });
    await page.setViewport({ width: 1200, height: 900 });
    await page.emulateMediaType('print');
    // No scripts, external network, cookies, local files, or user-supplied navigation.
    const csp =
      "default-src 'none'; style-src 'unsafe-inline'; img-src https://self-pdf.invalid; font-src 'none'; base-uri 'none'; form-action 'none'";
    await page.setContent(
      `<!doctype html><html lang="zh-Hant" class="${theme}"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><style>${css.replace(/<\/style/gi, '<\\/style')}</style></head><body>${html}</body></html>`,
      { waitUntil: 'networkidle0', timeout: 25000 },
    );
    const failed = await page.evaluate(() =>
      Array.from(document.images).some(
        (image) => !image.complete || !image.naturalWidth,
      ),
    );
    if (failed) throw new Error('圖片讀取失敗，請重試或取消包含圖片後匯出');
    return Buffer.from(
      await page.pdf({
        format: 'A4',
        preferCSSPageSize: true,
        printBackground: false,
        timeout: 25000,
      }),
    );
  } finally {
    try { if (browser) await browser.close(); } finally { active--; }
  }
}
module.exports = { renderReport, inputSchema };

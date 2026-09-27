import { chromium } from 'playwright';

export interface ImageMeta {
  src: string;
  alt: string;
  width: number;
  height: number;
}

export interface ScraperResult {
  screenshotBuffer: Buffer;
  title: string;
  fontFamily: string;
  backgroundColor: string;
  color: string;
  cleanHtml: string;
  images: ImageMeta[];
  cssVars: Record<string, string>;
}

export async function scrapeTarget(url: string): Promise<ScraperResult> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });

    // Capture full-viewport screenshot for Gemini Vision
    const screenshotBuffer = await page.screenshot({ fullPage: false });

    const extractedData = await page.evaluate((): Omit<ScraperResult, 'screenshotBuffer'> => {
      // ── 1. Strip non-layout noise ───────────────────────────────────────
      document
        .querySelectorAll('script, style, svg, noscript, iframe, video, canvas')
        .forEach((el) => el.remove());

      // ── 2. Extract meaningful images (BUG-006 FIX: now included in return) ─
      const images: Array<{ src: string; alt: string; width: number; height: number }> =
        Array.from(document.querySelectorAll('img'))
          .map((img) => ({
            src: img.src,
            alt: img.alt || 'image',
            width: img.naturalWidth || img.width,
            height: img.naturalHeight || img.height,
          }))
          .filter((img) => img.width > 50 && img.height > 50)
          .slice(0, 8); // Top 8 meaningful images only

      // ── 3. Extract CSS custom properties from :root ─────────────────────
      const cssVars: Record<string, string> = {};
      const rootStyle = getComputedStyle(document.documentElement);
      const knownVarNames = [
        '--primary', '--secondary', '--background', '--foreground',
        '--accent', '--muted', '--card', '--border',
        '--color-primary', '--color-secondary', '--color-accent',
        '--font-sans', '--font-heading',
      ];
      knownVarNames.forEach((varName) => {
        const val = rootStyle.getPropertyValue(varName).trim();
        if (val) cssVars[varName] = val;
      });

      // ── 4. Compute body styles ──────────────────────────────────────────
      const bodyStyle = getComputedStyle(document.body);

      return {
        title: document.title,
        fontFamily: bodyStyle.fontFamily,
        backgroundColor: bodyStyle.backgroundColor,
        color: bodyStyle.color,
        // Cap at 12,000 chars — leaves budget for image/cssVar context in prompt
        cleanHtml: document.body.innerHTML.slice(0, 12_000),
        images,
        cssVars,
      };
    });

    return { screenshotBuffer, ...extractedData };
  } finally {
    // Always close browser — even if an error is thrown
    await browser.close();
  }
}
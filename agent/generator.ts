import { GoogleGenAI } from '@google/genai';
import * as fs from 'fs';
import * as path from 'path';
import 'dotenv/config';
import type { ScraperResult } from './scraper.js';

// ── 1. Abstracted LLM call — swap model here to change provider ────────────
async function callVisionModel(prompt: string, imageBase64: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [
      { text: prompt },
      { inlineData: { mimeType: 'image/png', data: imageBase64 } },
    ],
  });

  return response.text ?? '';
}

// ── 2. Robust Markdown extraction regex ───────────────────────────────────
function extractFilesFromMarkdown(
  llmOutput: string
): Array<{ filepath: string; content: string }> {
  const files: Array<{ filepath: string; content: string }> = [];
  // Matches: ### app/page.tsx  followed by ```tsx ... ``` (also css, ts, js)
  const fileBlockRegex = /###\s+(.+?)\s+```(?:tsx|ts|jsx|js|css)?\s+([\s\S]+?)```/g;

  let match;
  while ((match = fileBlockRegex.exec(llmOutput)) !== null) {
    const filepath = match[1]?.trim();
    const content = match[2]?.trim();
    if (filepath && content) {
      files.push({ filepath, content });
    }
  }
  return files;
}

// ── 3. Build the generation prompt with FULL context ──────────────────────
function buildPrompt(
  cleanHtml: string,
  styles: Omit<ScraperResult, 'screenshotBuffer' | 'cleanHtml'>
): string {
  const imageList =
    styles.images.length > 0
      ? styles.images
          .map(
            (img) =>
              `  - "${img.alt}": ${img.width}×${img.height}px  →  src="https://placehold.co/${img.width}x${img.height}/e8e0d8/6b7280?text=Photo"`
          )
          .join('\n')
      : '  - No significant images found. Use src="https://placehold.co/800x500/e8e0d8/6b7280?text=Image"';

  const cssVarList =
    Object.keys(styles.cssVars).length > 0
      ? Object.entries(styles.cssVars)
          .map(([k, v]) => `  ${k}: ${v}`)
          .join('\n')
      : '  (none detected)';

  return `
You are a world-class Next.js 14 + Tailwind CSS engineer specializing in pixel-perfect UI cloning.
Your job is to recreate the website in the screenshot as FAITHFULLY as possible — colors, fonts, layout, spacing, all sections.

════════════════════════════════════════
VISUAL REFERENCE
════════════════════════════════════════
The attached image is a 1440×900 viewport screenshot of the TARGET website.
Study it extremely carefully:
- Exact background colors (note if it's cream, white, dark, etc.)
- Typography: serif vs sans-serif, font weights, italic/script styles
- Spacing between elements
- Navigation layout and style
- Color palette of all elements
- Section structure from top to bottom

════════════════════════════════════════
EXTRACTED HTML STRUCTURE
════════════════════════════════════════
${cleanHtml}

════════════════════════════════════════
EXTRACTED DESIGN TOKENS
════════════════════════════════════════
Font family  : ${styles.fontFamily}
Background   : ${styles.backgroundColor}
Text color   : ${styles.color}

CSS Custom Properties on :root:
${cssVarList}

════════════════════════════════════════
IMAGE PLACEHOLDERS
════════════════════════════════════════
Use these placeholder URLs. The bg color (#e8e0d8) matches a warm neutral tone.
${imageList}

════════════════════════════════════════
CRITICAL COLOR RULES — READ CAREFULLY
════════════════════════════════════════
You MUST use ONLY standard Tailwind CSS color classes. NO invented class names.

✅ CORRECT: bg-stone-50, text-gray-900, bg-teal-700, text-slate-600, border-gray-200
❌ WRONG: bg-light-beige, text-dark-gray, text-accent-teal, bg-cream (these don't exist!)

Match the screenshot colors using the closest Tailwind color:
- Cream/warm white background → bg-stone-50 or bg-amber-50
- Off-white → bg-gray-50 or bg-neutral-50
- Dark text → text-gray-900 or text-slate-800
- Teal/turquoise accent → text-teal-600 or text-cyan-600
- Gray text → text-gray-500 or text-slate-500
- White navbar → bg-white

You may use Tailwind's arbitrary values for EXACT color matches: bg-[#f5f0eb], text-[#2c3e50]

════════════════════════════════════════
CRITICAL FONT RULES — READ CAREFULLY
════════════════════════════════════════
You MUST output app/layout.tsx with Google Fonts that match the original.

If the original uses:
- Serif headings → use 'Cormorant Garamond' or 'Playfair Display'  
- Script/cursive accent → use 'Dancing Script' or 'Great Vibes'
- Clean sans-serif → use 'Inter' or 'Outfit'
- Small caps labels → use font-variant: small-caps or uppercase tracking-widest

In layout.tsx, load fonts via <link> tag in the <head>. Example:
\`\`\`tsx
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = { title: '...', description: '...' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300&family=Dancing+Script:wght@400;600&family=Inter:wght@300;400;500&display=swap" rel="stylesheet" />
      </head>
      <body style={{ fontFamily: "'Inter', sans-serif" }}>
        {children}
      </body>
    </html>
  );
}
\`\`\`

════════════════════════════════════════
ENGINEERING RULES (strictly enforced)
════════════════════════════════════════
1. Recreate ALL visible sections top to bottom: navbar, hero, all content sections, footer
2. Use 'use client' ONLY on components using useState/useEffect/onClick
3. Use lucide-react for ALL icons — never emoji as icons
4. Use Tailwind CSS ONLY — standard classes + arbitrary values like bg-[#f5f0eb]
5. Named TypeScript functional components: export function Navbar() {...}
6. Fully responsive: mobile-first with sm: md: lg: breakpoints
7. Extract: Navbar, Hero, each major section, Footer into separate component files
8. Do NOT invent Tailwind class names that don't exist
9. Do NOT use next/image — use plain <img> tags
10. Match the exact background color of the page — if it's cream/beige, use bg-stone-50 or bg-[#exact-hex]

════════════════════════════════════════
DARK MODE — DISABLE IT
════════════════════════════════════════
The original website does NOT use dark mode. You must prevent automatic dark mode:
- Do NOT add dark: variants
- In globals.css output, remove @media (prefers-color-scheme: dark) entirely
- Set explicit background and text colors on <body> that match the original

════════════════════════════════════════
OUTPUT FORMAT — FOLLOW EXACTLY
════════════════════════════════════════
Output each file as a separate block. No JSON. No explanation outside code blocks.

### app/layout.tsx
\`\`\`tsx
// full layout with Google Fonts <link> tags
\`\`\`

### app/globals.css
\`\`\`css
// Tailwind directives + :root colors + NO dark mode media query
\`\`\`

### app/page.tsx
\`\`\`tsx
// imports all components, assembles the page
\`\`\`

### components/Navbar.tsx
\`\`\`tsx
// full navbar
\`\`\`

### components/Hero.tsx
\`\`\`tsx
// full hero section
\`\`\`

### components/Footer.tsx
\`\`\`tsx
// full footer
\`\`\`

Add more ### components/SectionName.tsx blocks for every visible section.
`;
}

// ── 4. Main export ─────────────────────────────────────────────────────────
export async function generateFrontend(
  screenshot: Buffer,
  cleanHtml: string,
  styles: Omit<ScraperResult, 'screenshotBuffer' | 'cleanHtml'>
): Promise<void> {
  const prompt = buildPrompt(cleanHtml, styles);
  const rawText = await callVisionModel(prompt, screenshot.toString('base64'));
  const parsedFiles = extractFilesFromMarkdown(rawText);

  if (parsedFiles.length === 0) {
    throw new Error(
      'AI returned no parseable file blocks.\n' +
        'Raw output (first 500 chars):\n' +
        rawText.slice(0, 500)
    );
  }

  for (const file of parsedFiles) {
    // Guard: never overwrite layout.tsx from the generator (it has Google Fonts now — allow it)
    // But never overwrite globals.css with a dark-mode version — let the AI output it
    const fullPath = path.join(process.cwd(), 'preview-app', file.filepath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, file.content, 'utf8');
    console.log(`  ✍️  Written: ${file.filepath}`);
  }

  console.log(`\n  📦 ${parsedFiles.length} file(s) generated into preview-app/`);
}
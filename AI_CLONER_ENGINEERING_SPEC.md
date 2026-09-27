# AI Cloner — Complete Engineering Spec & Fix Guide

> **Purpose of this document:**  
> This is the single source of truth for the `ai-cloner` project. It documents the full architecture, every identified bug with its exact root cause, and the complete corrected source code for every file. Any developer or AI assistant working on this codebase must treat this document as the ground truth.

---

## Table of Contents

1. [System Architecture](#1-system-architecture)
2. [Data Flow](#2-data-flow)
3. [Directory Structure (Canonical)](#3-directory-structure-canonical)
4. [Technology Decisions & Rationale](#4-technology-decisions--rationale)
5. [Complete Bug Registry](#5-complete-bug-registry)
6. [Corrected Source Files](#6-corrected-source-files)
   - [package.json](#61-packagejson)
   - [tsconfig.json](#62-tsconfigjson)
   - [setup.ts](#63-setupts--new-file)
   - [agent/scraper.ts](#64-agentscraperts)
   - [agent/generator.ts](#65-agentgeneratorts)
   - [agent/validator.ts](#66-agentvalidatorts)
   - [agent/modifier.ts](#67-agentmodifierts)
   - [index.ts](#68-indexts)
7. [Environment Setup](#7-environment-setup)
8. [Architectural Constraints (Do Not Violate)](#8-architectural-constraints-do-not-violate)
9. [Limitations & Future Work](#9-limitations--future-work)

---

## 1. System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        AI CLONER AGENT                              │
│                       (Node.js / TypeScript)                        │
│                                                                     │
│   ┌──────────────┐                                                  │
│   │  index.ts    │  ← CLI Orchestrator                             │
│   │  (main loop) │    Reads stdin, sequences the pipeline          │
│   └──────┬───────┘                                                  │
│          │                                                           │
│    ┌─────▼──────────────────────────────────────────┐              │
│    │                  PIPELINE                       │              │
│    │                                                 │              │
│    │  1. scraper.ts ──────────────────────────────► │              │
│    │     Playwright (headless Chromium)              │              │
│    │     • Captures 1440×900 screenshot (Buffer)     │              │
│    │     • Prunes DOM (strips script/style/svg)      │              │
│    │     • Extracts: cleanHtml, images,              │              │
│    │       fontFamily, bgColor, textColor, cssVars   │              │
│    │                                                 │              │
│    │  2. generator.ts ────────────────────────────► │              │
│    │     Gemini 2.0 Flash (Vision + Text)            │              │
│    │     • Sends: screenshot + cleanHtml + tokens    │              │
│    │     • Prompts for Markdown-delimited files      │              │
│    │     • Regex extracts ### path + ```tsx blocks   │              │
│    │     • Writes files into preview-app/            │              │
│    │                                                 │              │
│    │  3. validator.ts ────────────────────────────► │              │
│    │     Self-Healing Build Loop (max 3 retries)     │              │
│    │     • Runs: npx tsc --noEmit in preview-app/   │              │
│    │     • On error: extracts failing file path      │              │
│    │     • Sends ONLY that file + error to Gemini    │              │
│    │     • Overwrites file with AI fix               │              │
│    │     • Retries until clean or max retries hit    │              │
│    │                                                 │              │
│    │  4. modifier.ts ─────────────────────────────► │              │
│    │     Natural Language UI Modification            │              │
│    │     • Reads ALL .tsx files from components/     │              │
│    │       and app/ (token-capped at 8000 chars)     │              │
│    │     • Sends full context + user instruction     │              │
│    │     • Parses returned file blocks               │              │
│    │     • Overwrites only changed files             │              │
│    │     • Immediately runs validator.ts             │              │
│    └─────────────────────────────────────────────────┘              │
└─────────────────────────────────────────────────────────────────────┘
         │
         ▼ writes to
┌─────────────────────────────────────────────────────────────────────┐
│                        preview-app/                                  │
│              (Pre-scaffolded Next.js 14 sandbox)                    │
│                                                                     │
│   app/                                                              │
│   ├── page.tsx          ← AI-generated root page                   │
│   ├── layout.tsx        ← Preserved from scaffold                  │
│   └── globals.css       ← Preserved from scaffold                  │
│   components/                                                       │
│   ├── Navbar.tsx        ← AI-generated components                  │
│   ├── Hero.tsx                                                      │
│   ├── Footer.tsx                                                    │
│   └── ...                                                           │
└─────────────────────────────────────────────────────────────────────┘
```

**Key architectural principle:** The agent runtime (`ai-cloner/`) and the generated codebase (`preview-app/`) are strictly isolated. The agent writes files into `preview-app/` but never imports or executes Next.js code itself. This prevents sandbox crashes from contaminating the orchestrator process.

---

## 2. Data Flow

```
User Input (URL)
       │
       ▼
[scraper.ts] ──── Playwright ────► {
                                     screenshotBuffer: Buffer,
                                     cleanHtml: string,       // 12,000 char cap
                                     title: string,
                                     fontFamily: string,
                                     backgroundColor: string,
                                     color: string,
                                     images: ImageMeta[],     // top 8, w/h/alt
                                     cssVars: Record<string,string>
                                   }
       │
       ▼
[generator.ts] ── Gemini Vision ──► Prompt contains:
                                     • screenshot (base64 PNG)
                                     • cleanHtml (DOM context)
                                     • design tokens (font/color/cssVars)
                                     • image dimensions for placeholders
                                    Returns: Markdown with ### path + ```tsx
                                    Regex parses → writes files to preview-app/
       │
       ▼
[validator.ts] ── npx tsc ────────► On error:
                                     • Parse stderr for failing file path
                                     • Send ONLY that file + error to Gemini
                                     • Overwrite with fix
                                     • Retry (max 3)
       │
       ▼
preview-app runs: npm run dev ────► http://localhost:3000
       │
       ▼ (user enters NL instruction)
[modifier.ts] ── Gemini Text ─────► Reads all .tsx from app/ + components/
                                     Sends token-capped context + instruction
                                     Parses returned ### path blocks
                                     Writes only changed files back
       │
       ▼
[validator.ts] ── (runs again) ───► Ensures modification didn't break build
```

---

## 3. Directory Structure (Canonical)

```
ai-cloner/
├── agent/
│   ├── scraper.ts       # Playwright scraping, DOM pruning, screenshot
│   ├── generator.ts     # Gemini Vision call, Markdown regex, file writing
│   ├── validator.ts     # tsc build check, self-healing loop
│   └── modifier.ts      # Multi-file natural language modification
├── preview-app/         # Next.js 14 sandbox — created by setup.ts
│   ├── app/
│   │   ├── layout.tsx   # DO NOT overwrite — preserved from scaffold
│   │   ├── globals.css  # DO NOT overwrite — preserved from scaffold
│   │   └── page.tsx     # AI-generated
│   ├── components/      # AI-generated — cleaned between runs
│   ├── package.json
│   └── tsconfig.json
├── index.ts             # CLI orchestrator / entry point
├── setup.ts             # One-time setup: scaffold preview-app, install Playwright
├── package.json         # Agent dependencies only
├── tsconfig.json        # Agent TypeScript config (Node.js, NOT React)
├── .env                 # GEMINI_API_KEY (never commit)
├── .env.example         # Template for .env
└── .gitignore
```

---

## 4. Technology Decisions & Rationale

| Tool | Version | Why |
|------|---------|-----|
| `tsx` | `^4.16.0` | Replaces `ts-node/esm`. Handles ESM TypeScript in Node.js without deprecated `--loader` flag. Zero-config. |
| `typescript` | `^5.5.0` | Latest **stable** major. TypeScript 7.x does not exist as of this writing. |
| `@types/node` | `^20.14.0` | Stable LTS-aligned version. Avoids bleeding-edge breakage. |
| `playwright` | `^1.45.0` | Headless Chromium with `networkidle` wait. Best DOM accuracy. |
| `@google/genai` | `^2.0.0` | Google's unified GenAI SDK. `gemini-2.0-flash` is free-tier eligible. |
| `dotenv` | `^16.4.5` | `.env` loading. Used via `import 'dotenv/config'` for ESM. |
| `gemini-2.0-flash` | — | Vision + text, fast, cost-efficient. Swappable via `callVisionModel()` abstraction. |

**Why NOT JSON Schema for code generation:**  
Large React/TSX files contain backticks, braces, and newlines that corrupt JSON payloads reliably. The Markdown delimiter approach (`### path/to/file.tsx` + ` ```tsx `) is immune to this because it treats code as opaque text.

**Why NOT send the full codebase to validator:**  
Targeted healing sends only the single failing file back to the LLM. Sending the full codebase wastes tokens, exceeds context windows on large sites, and risks the LLM rewriting working files.

---

## 5. Complete Bug Registry

### BUG-001 · `package.json` — Invalid JSON (CRITICAL — npm install fails)

**Root cause:** The file contains two separate JSON objects concatenated. The first object has `"type": "module"` and `"script": {...}`. Below it, outside the closing brace, sits the real `"scripts"`, `"type": "commonjs"`, and `"dependencies"` block. This is not valid JSON. `npm install` throws `SyntaxError: Unexpected string in JSON`.

**Fix:** Merge into a single valid JSON object. Remove the duplicate `type` field (keep `"module"`). Switch runner from `ts-node/esm` to `tsx`.

---

### BUG-002 · `package.json` — Non-existent TypeScript version (CRITICAL — npm install fails)

**Root cause:** `"typescript": "^7.0.2"` references a version that does not exist on npm. The latest stable TypeScript is in the 5.x series.

**Fix:** Change to `"typescript": "^5.5.0"`.

---

### BUG-003 · `tsconfig.json` — Wrong JSX setting for a Node.js process (HIGH)

**Root cause:** `"jsx": "react-jsx"` is a browser/React app setting. This is a Node.js CLI agent. Setting this causes `tsc` to expect React runtime imports in agent files and will emit confusing errors.

**Fix:** Remove the `"jsx"` field entirely from the agent's `tsconfig.json`. The `preview-app/` has its own `tsconfig.json` with the correct JSX setting.

---

### BUG-004 · `tsconfig.json` — `"types": []` removes all Node.js ambient types (HIGH)

**Root cause:** An empty `types` array tells TypeScript to include no type definitions. This means `fs`, `path`, `child_process`, `process`, `Buffer`, `__dirname`, etc. have no types. The project will not compile cleanly.

**Fix:** Change to `"types": ["node"]` and ensure `@types/node` is in `devDependencies`.

---

### BUG-005 · `generator.ts` — `cleanHtml` parameter received but never used in prompt (HIGH — kills quality)

**Root cause:** The function signature is `generateFrontend(screenshot, cleanHtml, styles)` but the prompt string only uses `styles.fontFamily`, `styles.backgroundColor`, `styles.color`. The `cleanHtml` variable is accepted and immediately discarded. The LLM receives the screenshot with almost no text context, severely limiting its ability to reproduce text content, section structure, and component hierarchy.

**Fix:** Embed `cleanHtml` directly in the prompt under a `EXTRACTED HTML STRUCTURE` heading.

---

### BUG-006 · `scraper.ts` — `images` array extracted inside `evaluate()` but never returned (HIGH)

**Root cause:** Inside `page.evaluate()`, an `images` constant is built and filtered. However, the `return` statement at the end of `evaluate()` omits `images` from the returned object. It is silently dropped. The generator therefore has no image dimension data.

**Fix:** Add `images` to the returned object in `evaluate()`.

---

### BUG-007 · `generator.ts` — Wrong `contents` format for multimodal Gemini call (MEDIUM)

**Root cause:** The `contents` array passes a raw string `prompt` alongside `{ inlineData: {...} }`. The `@google/genai` SDK expects all parts to be objects. Passing a raw string as a content part is undefined behavior and breaks in strict SDK versions.

**Fix:** Change `prompt` to `{ text: prompt }` in the `contents` array.

---

### BUG-008 · `modifier.ts` — Only reads/writes `page.tsx`, ignores all component files (HIGH)

**Root cause:** The generator creates multiple files (`components/Navbar.tsx`, `components/Hero.tsx`, etc.) but the modifier hardcodes `path.join(process.cwd(), 'preview-app/app/page.tsx')`. Instructions like "make navbar sticky" silently fail because the LLM receives only `page.tsx` which imports `<Navbar />` but doesn't contain its implementation.

**Fix:** Rewrite modifier to scan `app/` and `components/` for all `.tsx` files, send all of them (token-capped), and write back only the changed files returned by the LLM.

---

### BUG-009 · `index.ts` — `ts-node/esm` loader deprecated, causes `ERR_UNKNOWN_FILE_EXTENSION` (MEDIUM)

**Root cause:** The start script uses `node --loader ts-node/esm index.ts`. The `--loader` API is deprecated since Node.js v20.6.0 and throws `ExperimentalWarning`. On Node.js v22+, it often fails outright with `ERR_UNKNOWN_FILE_EXTENSION` for `.ts` files.

**Fix:** Replace with `tsx index.ts` via the `tsx` package.

---

### BUG-010 · No `preview-app` bootstrap (HIGH — crashes on fresh clone)

**Root cause:** `generator.ts` writes files into `preview-app/app/` and `preview-app/components/` but there is no code to create the `preview-app/` Next.js scaffold. A fresh `git clone` + `npm start` crashes immediately at step 2 because the directory doesn't exist.

**Fix:** Add `setup.ts` — a one-time script that runs `create-next-app@14` into `preview-app/`, installs `lucide-react`, and installs the Playwright Chromium browser.

---

### BUG-011 · `index.ts` — No top-level error handling, no `rl.close()` (LOW)

**Root cause:** `main()` is called with no `.catch()`. Any unhandled rejection exits Node.js with an ugly stack trace and leaves the readline interface open. The `rl` object also leaks if an error occurs before `process.exit(0)`.

**Fix:** Add `.catch()` to `main()` call. Wrap the body in `try/finally`. Always call `rl.close()` on exit.

---

### BUG-012 · No cleanup between runs — stale component files accumulate (MEDIUM)

**Root cause:** If you clone `site-A` (generates `Hero.tsx`, `Pricing.tsx`) then clone `site-B` (generates `Hero.tsx`, `Team.tsx`), the `Pricing.tsx` from site-A remains in `components/`. The new `page.tsx` may not import it, but it still compiles and pollutes the output.

**Fix:** Add `cleanPreviousRun()` in `index.ts` that deletes `preview-app/components/` before each generation run.

---

## 6. Corrected Source Files

> **Instruction for AI Assistant:** Replace every file below in its entirety. Do not merge or patch — each file shown is the complete corrected version.

---

### 6.1 `package.json`

```json
{
  "name": "ai-cloner",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "setup": "tsx setup.ts",
    "start": "tsx index.ts"
  },
  "dependencies": {
    "@google/genai": "^2.0.0",
    "dotenv": "^16.4.5",
    "playwright": "^1.45.0"
  },
  "devDependencies": {
    "@types/node": "^20.14.0",
    "tsx": "^4.16.0",
    "typescript": "^5.5.0"
  }
}
```

**Changes from original:**
- Fixed malformed JSON (was two separate objects)
- Removed duplicate `"type"` field conflict
- Fixed `typescript` version from non-existent `^7.0.2` → `^5.5.0`
- Fixed `@types/node` to stable `^20.14.0`
- Replaced `ts-node` with `tsx` (no ESM loader issues)
- Added `"setup"` script

---

### 6.2 `tsconfig.json`

```json
{
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "target": "ES2022",
    "lib": ["ES2022"],
    "types": ["node"],
    "strict": true,
    "sourceMap": true,
    "skipLibCheck": true,
    "esModuleInterop": true
  },
  "include": ["**/*.ts"],
  "exclude": ["node_modules", "preview-app"]
}
```

**Changes from original:**
- Removed `"jsx": "react-jsx"` — wrong setting for a Node.js CLI agent
- Changed `"types": []` → `"types": ["node"]` — restores fs/path/Buffer/process types
- Removed overly strict options (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`) that cause unnecessary friction
- Added `"exclude": ["preview-app"]` — prevents agent's tsc from checking the sandbox

---

### 6.3 `setup.ts` — NEW FILE

```typescript
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);

async function run(cmd: string, cwd?: string): Promise<void> {
  console.log(`  → ${cmd}`);
  try {
    const { stdout, stderr } = await execAsync(cmd, {
      cwd,
      timeout: 180_000,
    });
    if (stdout?.trim()) console.log(stdout.trim());
    if (stderr?.trim()) console.warn(stderr.trim());
  } catch (err: unknown) {
    const error = err as { message: string };
    throw new Error(`Command failed: ${cmd}\n${error.message}`);
  }
}

async function setup(): Promise<void> {
  console.log('\n🚀 AI Cloner — One-Time Setup\n');

  const previewPath = path.join(process.cwd(), 'preview-app');
  const previewPkgJson = path.join(previewPath, 'package.json');

  // ── Step 1: Scaffold Next.js 14 sandbox ──────────────────────────────────
  if (!fs.existsSync(previewPkgJson)) {
    console.log('[1/4] Scaffolding preview-app with Next.js 14...');
    await run(
      [
        'npx create-next-app@14 preview-app',
        '--typescript',
        '--tailwind',
        '--app',
        '--no-src-dir',
        '--no-git',
        '--eslint',
        '--import-alias "@/*"',
      ].join(' '),
      process.cwd()
    );
    console.log('  ✅ preview-app scaffolded\n');
  } else {
    console.log('[1/4] preview-app already exists — skipping scaffold.\n');
  }

  // ── Step 2: Install lucide-react in preview-app ───────────────────────────
  const lucidePath = path.join(previewPath, 'node_modules', 'lucide-react');
  if (!fs.existsSync(lucidePath)) {
    console.log('[2/4] Installing lucide-react in preview-app...');
    await run('npm install lucide-react', previewPath);
    console.log('  ✅ lucide-react installed\n');
  } else {
    console.log('[2/4] lucide-react already installed — skipping.\n');
  }

  // ── Step 3: Install Playwright Chromium browser ───────────────────────────
  console.log('[3/4] Installing Playwright Chromium browser...');
  await run('npx playwright install chromium');
  console.log('  ✅ Playwright Chromium ready\n');

  // ── Step 4: Create .env template if missing ───────────────────────────────
  const envPath = path.join(process.cwd(), '.env');
  const envExamplePath = path.join(process.cwd(), '.env.example');

  if (!fs.existsSync(envExamplePath)) {
    fs.writeFileSync(envExamplePath, 'GEMINI_API_KEY=your_gemini_api_key_here\n', 'utf8');
  }

  if (!fs.existsSync(envPath)) {
    fs.copyFileSync(envExamplePath, envPath);
    console.log('[4/4] ⚠️  .env created from template.');
    console.log('      → Open .env and paste your GEMINI_API_KEY before running npm start\n');
  } else {
    console.log('[4/4] .env already exists ✅\n');
  }

  console.log('────────────────────────────────────────');
  console.log('✅ Setup complete!\n');
  console.log('Next steps:');
  console.log('  1. Add your GEMINI_API_KEY to .env');
  console.log('  2. Run: npm start');
  console.log('────────────────────────────────────────\n');
}

setup().catch((err: unknown) => {
  const error = err as { message: string };
  console.error('\n❌ Setup failed:', error.message);
  process.exit(1);
});
```

---

### 6.4 `agent/scraper.ts`

```typescript
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

      // ── 2. Extract meaningful images (returned this time) ───────────────
      const images: ImageMeta[] = Array.from(document.querySelectorAll('img'))
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
```

**Changes from original:**
- Added `ScraperResult` and `ImageMeta` TypeScript interfaces (eliminates implicit `any`)
- `images` is now correctly included in the `return` statement inside `evaluate()`
- Added `cssVars` extraction from `:root` computed styles
- Wrapped in `try/finally` so browser always closes on error
- Reduced HTML cap from 15,000 to 12,000 chars to preserve token budget for new context
- Added `video` and `canvas` to the DOM strip list

---

### 6.5 `agent/generator.ts`

```typescript
import { GoogleGenAI } from '@google/genai';
import * as fs from 'fs';
import * as path from 'path';
import 'dotenv/config';
import type { ScraperResult } from './scraper.js';

// ── 1. Abstracted LLM call — swap model here to change provider ────────────
async function callVisionModel(prompt: string, imageBase64: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: [
      { text: prompt },                                            // FIX: was raw string
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
  // Matches: ### app/page.tsx  followed by ```tsx ... ```
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
function buildPrompt(cleanHtml: string, styles: Omit<ScraperResult, 'screenshotBuffer' | 'cleanHtml'>): string {
  const imageList = styles.images.length > 0
    ? styles.images
        .map((img) => `  - "${img.alt}": ${img.width}×${img.height}px  →  use: https://placehold.co/${img.width}x${img.height}`)
        .join('\n')
    : '  - No significant images detected. Use https://placehold.co/800x400 as generic placeholders.';

  const cssVarList = Object.keys(styles.cssVars).length > 0
    ? Object.entries(styles.cssVars).map(([k, v]) => `  ${k}: ${v}`).join('\n')
    : '  (none detected)';

  return `
You are an expert Next.js 14 and Tailwind CSS engineer. Recreate the UI shown in the attached screenshot.

════════════════════════════════════════
VISUAL REFERENCE
════════════════════════════════════════
The attached image is a 1440×900 viewport screenshot. Match the layout, spacing, colors, and typography as closely as possible.

════════════════════════════════════════
EXTRACTED HTML STRUCTURE
════════════════════════════════════════
Use this to understand the exact text content, section hierarchy, and component structure:

${cleanHtml}

════════════════════════════════════════
DESIGN TOKENS
════════════════════════════════════════
Font family  : ${styles.fontFamily}
Background   : ${styles.backgroundColor}
Text color   : ${styles.color}

CSS Custom Properties found on :root:
${cssVarList}

════════════════════════════════════════
IMAGES
════════════════════════════════════════
Use placehold.co with the exact dimensions below. Do NOT use <Image> from next/image.
${imageList}

════════════════════════════════════════
ENGINEERING RULES (follow strictly)
════════════════════════════════════════
1. Recreate ALL visible sections: navbar, hero, features, pricing, testimonials, footer, etc.
2. Use 'use client' ONLY on components that use browser APIs (useState, useEffect, onClick).
3. Use lucide-react for ALL icons. Do not use emoji as icons.
4. Use Tailwind CSS exclusively — no inline styles, no CSS modules.
5. Every component must be a named TypeScript functional component: export function Navbar() {...}
6. Make the layout fully responsive: mobile-first with sm: md: lg: breakpoints.
7. Use reusable components: extract Navbar, Hero, Features, Footer into separate files.
8. Do NOT import anything that doesn't exist in the Next.js 14 + Tailwind + lucide-react stack.

════════════════════════════════════════
OUTPUT FORMAT — FOLLOW THIS EXACTLY
════════════════════════════════════════
Use the exact format below. One block per file. No JSON. No explanations outside code blocks.

### app/page.tsx
\`\`\`tsx
// full file content
\`\`\`

### components/Navbar.tsx
\`\`\`tsx
// full file content
\`\`\`

### components/Hero.tsx
\`\`\`tsx
// full file content
\`\`\`

### components/Footer.tsx
\`\`\`tsx
// full file content
\`\`\`
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
    const fullPath = path.join(process.cwd(), 'preview-app', file.filepath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, file.content, 'utf8');
    console.log(`  ✍️  Written: ${file.filepath}`);
  }

  console.log(`\n  📦 ${parsedFiles.length} file(s) generated into preview-app/`);
}
```

**Changes from original:**
- `cleanHtml` is now embedded in the prompt under `EXTRACTED HTML STRUCTURE` — fixes the single biggest quality issue
- `cssVars` and `images` are fully used in the prompt
- Fixed `contents` format: `{ text: prompt }` instead of raw string
- Added `buildPrompt()` function for readability
- Added explicit TypeScript return types throughout
- `extractFilesFromMarkdown` now handles `css` blocks too

---

### 6.6 `agent/validator.ts`

```typescript
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import { GoogleGenAI } from '@google/genai';
import 'dotenv/config';

const execAsync = promisify(exec);
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

const PREVIEW_APP_DIR = path.join(process.cwd(), 'preview-app');

export async function validateAndFix(maxRetries = 3): Promise<boolean> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await execAsync('npx tsc --noEmit', {
        cwd: PREVIEW_APP_DIR,
        timeout: 60_000,
      });
      console.log('  ✅ TypeScript build is valid.');
      return true;
    } catch (err: unknown) {
      const error = err as { stdout?: string; stderr?: string };
      const errorLog = (error.stdout ?? '') + (error.stderr ?? '');

      console.warn(`  ⚠️  Build error (attempt ${attempt}/${maxRetries}). Running AI self-heal...`);

      // Extract the failing file from TS error output
      // Pattern: "components/Hero.tsx(10,5): error TS2345: ..."
      const fileMatch = errorLog.match(/([a-zA-Z0-9_./\\-]+\.tsx?)\(\d+,\d+\):/);
      const failingFileRelPath = fileMatch?.[1]?.replace(/\\/g, '/') ?? 'app/page.tsx';
      const targetPath = path.join(PREVIEW_APP_DIR, failingFileRelPath);

      if (!fs.existsSync(targetPath)) {
        console.error(`  ❌ Failing file not found on disk: ${failingFileRelPath}`);
        continue;
      }

      const failingCode = fs.readFileSync(targetPath, 'utf8');

      const fixPrompt = `You are an autonomous TypeScript/React debugging agent. Fix the error below.

FILE: ${failingFileRelPath}

COMPILER ERROR:
${errorLog.slice(0, 2000)}

CURRENT CODE WITH THE ERROR:
\`\`\`tsx
${failingCode}
\`\`\`

Rules:
- Fix ONLY the TypeScript/React error shown above.
- Do not restructure or rewrite working logic.
- Return ONLY the raw corrected code — no markdown fences, no explanations.`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: [{ text: fixPrompt }],               // FIX: was array with raw string
      });

      const fixedCode = (response.text ?? '').replace(/```tsx?|```/g, '').trim();

      if (fixedCode.length < 10) {
        console.error('  ❌ AI returned an empty fix. Skipping this attempt.');
        continue;
      }

      fs.writeFileSync(targetPath, fixedCode, 'utf8');
      console.log(`  🔧 Self-healed: ${failingFileRelPath}`);
    }
  }

  console.error('  ❌ Could not self-heal after maximum retries.');
  return false;
}
```

**Changes from original:**
- Fixed `contents` format to `[{ text: fixPrompt }]`
- Added Windows path normalization (`replace(/\\/g, '/')`)
- Added guard for empty AI response (`fixedCode.length < 10`)
- Extracted `PREVIEW_APP_DIR` as a constant
- Proper TypeScript error typing (`err: unknown`)

---

### 6.7 `agent/modifier.ts`

```typescript
import { GoogleGenAI } from '@google/genai';
import * as fs from 'fs';
import * as path from 'path';
import 'dotenv/config';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

const PREVIEW_APP_DIR = path.join(process.cwd(), 'preview-app');
// Max characters to send as context — keeps modifier calls cost-efficient
const MAX_CONTEXT_CHARS = 8_000;

interface FileEntry {
  relativePath: string;
  content: string;
}

// ── Collect all generated .tsx files from app/ and components/ ────────────
function collectGeneratedFiles(): FileEntry[] {
  const dirsToScan = ['app', 'components'];
  const results: FileEntry[] = [];

  for (const dir of dirsToScan) {
    const dirPath = path.join(PREVIEW_APP_DIR, dir);
    if (!fs.existsSync(dirPath)) continue;

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (!entry.name.endsWith('.tsx') && !entry.name.endsWith('.ts')) continue;
      // Skip Next.js scaffold files that should not be modified
      if (entry.name === 'layout.tsx' || entry.name === 'globals.css') continue;

      const fullPath = path.join(dirPath, entry.name);
      results.push({
        relativePath: `${dir}/${entry.name}`,
        content: fs.readFileSync(fullPath, 'utf8'),
      });
    }
  }

  return results;
}

// ── Parse ### path + ```tsx blocks from LLM output ────────────────────────
function parseFileBlocks(llmOutput: string): Array<{ filepath: string; content: string }> {
  const results: Array<{ filepath: string; content: string }> = [];
  const regex = /###\s+(.+?)\s+```(?:tsx|ts)?\s+([\s\S]+?)```/g;
  let match;
  while ((match = regex.exec(llmOutput)) !== null) {
    const filepath = match[1]?.trim();
    const content = match[2]?.trim();
    if (filepath && content) results.push({ filepath, content });
  }
  return results;
}

export async function modifyCode(userPrompt: string): Promise<void> {
  const generatedFiles = collectGeneratedFiles();

  if (generatedFiles.length === 0) {
    throw new Error('No generated files found in preview-app/. Run the generation step first.');
  }

  // ── Build token-capped context ─────────────────────────────────────────
  let totalChars = 0;
  const contextBlocks: string[] = [];

  for (const file of generatedFiles) {
    const block = `\n### ${file.relativePath}\n\`\`\`tsx\n${file.content}\n\`\`\``;
    if (totalChars + block.length > MAX_CONTEXT_CHARS) {
      console.log(`  ℹ️  Context cap reached. Omitting: ${file.relativePath}`);
      break;
    }
    contextBlocks.push(block);
    totalChars += block.length;
  }

  const modificationPrompt = `You are modifying an existing Next.js 14 / Tailwind CSS codebase.

CURRENT CODEBASE (all generated files):
${contextBlocks.join('\n')}

════════════════════════════════════════
USER INSTRUCTION: "${userPrompt}"
════════════════════════════════════════

Rules:
1. Apply the requested changes. Keep all working sections intact.
2. Only modify what is necessary to fulfil the instruction.
3. Return ONLY the file(s) you changed, using the exact format below.
4. If the change spans multiple files, return all changed files.
5. Do NOT return unchanged files.

OUTPUT FORMAT:
### path/to/changed/file.tsx
\`\`\`tsx
// full updated file content
\`\`\`
`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: [{ text: modificationPrompt }],
  });

  const rawText = response.text ?? '';
  const updatedFiles = parseFileBlocks(rawText);

  if (updatedFiles.length === 0) {
    // Fallback: treat the whole response as a raw page.tsx update
    console.warn('  ⚠️  No file blocks parsed. Attempting fallback: overwriting app/page.tsx');
    const cleanedCode = rawText.replace(/```tsx?|```/g, '').trim();
    const pagePath = path.join(PREVIEW_APP_DIR, 'app', 'page.tsx');
    if (fs.existsSync(pagePath) && cleanedCode.length > 50) {
      fs.writeFileSync(pagePath, cleanedCode, 'utf8');
      console.log('  ✍️  Fallback applied to: app/page.tsx');
    }
    return;
  }

  for (const file of updatedFiles) {
    const fullPath = path.join(PREVIEW_APP_DIR, file.filepath);
    if (!fs.existsSync(fullPath)) {
      // The AI may have returned a new component — create it
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    }
    fs.writeFileSync(fullPath, file.content, 'utf8');
    console.log(`  ✍️  Modified: ${file.filepath}`);
  }
}
```

**Changes from original:**
- Completely rewritten to scan `app/` and `components/` for all `.tsx` files
- Token-capped context at 8,000 characters with file-omission logging
- Skips `layout.tsx` and `globals.css` (scaffold files that must not be overwritten)
- Parses the `### path + \`\`\`tsx` format from the response (same as generator)
- Writes back ONLY changed files, not the entire codebase
- Fallback mechanism if the LLM doesn't use the expected format
- Supports creation of new component files if the LLM adds them

---

### 6.8 `index.ts`

```typescript
import * as readline from 'readline';
import * as path from 'path';
import * as fs from 'fs';
import { scrapeTarget } from './agent/scraper.js';
import { generateFrontend } from './agent/generator.js';
import { validateAndFix } from './agent/validator.js';
import { modifyCode } from './agent/modifier.js';

// ── Wipe components/ between runs to avoid stale files from prior sites ───
function cleanPreviousRun(): void {
  const componentsDir = path.join(process.cwd(), 'preview-app', 'components');
  if (fs.existsSync(componentsDir)) {
    fs.rmSync(componentsDir, { recursive: true, force: true });
    console.log('  🧹 Cleared previous components/');
  }
}

// ── Guard: ensure preview-app is scaffolded ───────────────────────────────
function assertPreviewAppExists(): void {
  const pkgJson = path.join(process.cwd(), 'preview-app', 'package.json');
  if (!fs.existsSync(pkgJson)) {
    console.error('\n❌ preview-app is not set up.');
    console.error('   Run: npm run setup\n');
    process.exit(1);
  }
}

async function main(): Promise<void> {
  assertPreviewAppExists();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  // Ensure readline is always closed
  const closeRl = () => { if (!rl.closed) rl.close(); };

  try {
    await new Promise<void>((resolve, reject) => {
      rl.question('\nEnter public website URL to clone: ', async (url) => {
        try {
          // ── Step 1: Scrape ──────────────────────────────────────────────
          console.log(`\n[1/4] 🌐 Scraping: ${url}`);
          const {
            screenshotBuffer,
            cleanHtml,
            title,
            fontFamily,
            backgroundColor,
            color,
            images,
            cssVars,
          } = await scrapeTarget(url);
          console.log(`  ✅ Scraped: "${title}"`);

          // ── Step 2: Generate ────────────────────────────────────────────
          console.log('\n[2/4] 🤖 Generating Next.js components...');
          cleanPreviousRun();
          await generateFrontend(screenshotBuffer, cleanHtml, {
            title, fontFamily, backgroundColor, color, images, cssVars,
          });

          // ── Step 3: Validate ────────────────────────────────────────────
          console.log('\n[3/4] 🔧 Validating TypeScript build...');
          const isValid = await validateAndFix();
          if (!isValid) {
            console.warn('  ⚠️  Build has remaining errors. Preview may not start cleanly.');
          }

          // ── Step 4: Done ────────────────────────────────────────────────
          console.log('\n[4/4] ✅ Generation complete!');
          console.log('  → cd preview-app && npm run dev');
          console.log('  → Open: http://localhost:3000\n');

          // ── Modification loop ───────────────────────────────────────────
          const promptModify = () => {
            rl.question('Modification instruction (or "exit"): ', async (instruction) => {
              if (instruction.toLowerCase().trim() === 'exit') {
                closeRl();
                resolve();
                return;
              }

              try {
                console.log(`\n🔄 Applying: "${instruction}"...`);
                await modifyCode(instruction);
                await validateAndFix();
                console.log('  ✅ Modification complete!\n');
              } catch (modErr: unknown) {
                const err = modErr as { message: string };
                console.error('  ❌ Modification failed:', err.message);
              }

              promptModify(); // re-prompt
            });
          };

          promptModify();
        } catch (err) {
          reject(err);
        }
      });
    });
  } catch (err: unknown) {
    const error = err as { message: string };
    console.error('\n❌ Fatal error:', error.message);
  } finally {
    closeRl();
  }
}

main().catch((err: unknown) => {
  const error = err as { message: string };
  console.error('\n❌ Unhandled error:', error.message);
  process.exit(1);
});
```

**Changes from original:**
- Added `assertPreviewAppExists()` guard — exits cleanly if setup hasn't been run
- Added `cleanPreviousRun()` — deletes `components/` between generation runs
- Proper `try/finally` with `closeRl()` — readline never leaks
- Top-level `.catch()` on `main()` — no unhandled promise rejections
- Passes `images` and `cssVars` from scraper through to generator
- Explicit TypeScript types throughout

---

## 7. Environment Setup

### First-time setup (run once)

```bash
# 1. Clone the repo and install agent dependencies
git clone <your-repo-url>
cd ai-cloner
npm install

# 2. Run the setup script (scaffolds preview-app, installs Playwright)
npm run setup

# 3. Add your Gemini API key
# Open .env and replace the placeholder:
GEMINI_API_KEY=your_actual_key_here

# 4. Start the agent
npm start
```

### `.gitignore`

```
node_modules/
preview-app/node_modules/
preview-app/.next/
.env
*.png
```

### `.env.example`

```
GEMINI_API_KEY=your_gemini_api_key_here
```

---

## 8. Architectural Constraints (Do Not Violate)

| # | Constraint | Reason |
|---|-----------|--------|
| 1 | Never run Next.js code inside `agent/` or `index.ts` | Agent runtime and sandbox are isolated by design. Cross-contamination crashes both. |
| 2 | Preserve the `### path + \`\`\`tsx` Markdown regex pipeline | JSON schema generation breaks on large TSX files (unescaped chars). Do not switch to JSON. |
| 3 | Validator must only send the single failing file to the LLM | Sending the full codebase wastes tokens and causes the LLM to rewrite working code. |
| 4 | Never overwrite `preview-app/app/layout.tsx` or `globals.css` | These are scaffold files. Overwriting them breaks Next.js App Router structure. |
| 5 | All file operations must use `path.join(process.cwd(), ...)` | Relative paths break when the CLI is invoked from a different working directory. |
| 6 | Wrap every new CLI command in `try/catch` | Unhandled rejections exit Node.js without closing readline. |
| 7 | Keep model abstracted inside `callVisionModel()` | Enables swapping Gemini for Claude or GPT-4o without touching the rest of the pipeline. |

---

## 9. Limitations & Future Work

### Current Limitations

| Limitation | Impact | Potential Fix |
|------------|--------|---------------|
| Modifier context capped at 8,000 chars | Large codebases (10+ components) may have some files omitted | Implement component-level file manifest; rank files by relevance to user instruction |
| Screenshot is viewport-only (1440×900) | Content below the fold may not be captured | Use `fullPage: true` + crop to viewport, or take multiple screenshots at scroll positions |
| Gemini Vision interprets colors from screenshot | Computed colors can differ from design tokens | Extract Tailwind config colors from `tailwind.config.ts` if present |
| HTML cap at 12,000 chars | Very large pages lose bottom content | Implement section-wise chunking; prioritize semantic HTML landmarks |
| `tsc --noEmit` only catches type errors | Runtime errors (missing env vars, wrong API paths) not caught | Add `npm run build` validation step; or run `next build` instead |
| Only `app/page.tsx` path is default fallback in validator | Fails on Next.js pages with route segments | Improve regex to match `app/[route]/page.tsx` patterns |
| Single-pass generation — no refinement | Low quality on complex sites | Add a second "refinement" pass where LLM compares its output to the screenshot |

### Roadmap (if more time)

1. **Refinement loop:** After generation, take a screenshot of `localhost:3000` and send it alongside the original for a diff-based improvement pass.
2. **Section chunking:** Split HTML into semantic sections (`<nav>`, `<main>`, `<footer>`) and generate components independently for better accuracy.
3. **CSS extraction:** Parse `tailwind.config.ts` and any CSS custom property files to get exact brand tokens.
4. **Manifest file:** Write a `ai-cloner-manifest.json` listing all generated files so the modifier can load them by name rather than by directory scan.
5. **Multi-page support:** Follow internal links and generate a multi-route Next.js app.

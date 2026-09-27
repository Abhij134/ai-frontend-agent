import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import { GoogleGenAI } from '@google/genai';
import 'dotenv/config';

const execAsync = promisify(exec);
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

const PREVIEW_APP_DIR = path.join(process.cwd(), 'preview-app');

// ── Run tsc and return the error output (or null if clean) ────────────────
async function runTsc(): Promise<string | null> {
  try {
    await execAsync('npx tsc --noEmit', {
      cwd: PREVIEW_APP_DIR,
      timeout: 60_000,
    });
    return null; // clean build
  } catch (err: unknown) {
    const error = err as { stdout?: string; stderr?: string };
    return (error.stdout ?? '') + (error.stderr ?? '');
  }
}

// ── Extract ALL unique failing file paths from tsc output ─────────────────
function extractFailingFiles(errorLog: string): string[] {
  const seen = new Set<string>();
  const results: string[] = [];
  // Matches: components/Hero.tsx(10,5): error  OR  app\page.tsx(5,3): error
  const fileRegex = /([a-zA-Z0-9_./@\\-]+\.tsx?)(\(\d+,\d+\)):/g;
  let match;
  while ((match = fileRegex.exec(errorLog)) !== null) {
    const rel = match[1].replace(/\\/g, '/').replace(/^\.\//, '');
    if (!seen.has(rel)) {
      seen.add(rel);
      results.push(rel);
    }
  }
  // Fallback if no path found
  if (results.length === 0) results.push('app/page.tsx');
  return results;
}

export async function validateAndFix(maxRetries = 5): Promise<boolean> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const errorLog = await runTsc();

    // ── Clean build ──────────────────────────────────────────────────────
    if (errorLog === null) {
      console.log('  ✅ TypeScript build is valid.');
      return true;
    }

    console.warn(`  ⚠️  Build error (attempt ${attempt}/${maxRetries}). Running AI self-heal...`);

    // ── Extract all failing files and fix each one in this attempt ───────
    const failingFiles = extractFailingFiles(errorLog);

    for (const failingFileRelPath of failingFiles) {
      const targetPath = path.join(PREVIEW_APP_DIR, failingFileRelPath);

      if (!fs.existsSync(targetPath)) {
        console.error(`  ❌ Failing file not found on disk: ${failingFileRelPath}`);
        continue;
      }

      const failingCode = fs.readFileSync(targetPath, 'utf8');

      // Filter the error log to lines relevant to this file
      const relevantErrors = errorLog
        .split('\n')
        .filter((line) => line.includes(failingFileRelPath) || line.includes('error TS'))
        .slice(0, 50)
        .join('\n');

      const fixPrompt = `You are an autonomous TypeScript/React debugging agent. Fix ALL TypeScript errors in the file below.

FILE: ${failingFileRelPath}

COMPILER ERRORS:
${relevantErrors || errorLog.slice(0, 3000)}

CURRENT CODE:
\`\`\`tsx
${failingCode}
\`\`\`

Rules:
- Fix ALL TypeScript/React errors shown above (there may be more than one).
- Common fixes: add missing imports, fix prop types, remove non-existent props, add React import if needed.
- Do not restructure or rewrite working logic.
- Return ONLY the raw corrected TypeScript/TSX code — no markdown fences, no explanations.`;

      try {
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: [{ text: fixPrompt }],
        });

        const fixedCode = (response.text ?? '')
          .replace(/^```(?:tsx?|jsx?)?\n?/m, '')
          .replace(/\n?```$/m, '')
          .trim();

        if (fixedCode.length < 10) {
          console.error(`  ❌ AI returned empty fix for: ${failingFileRelPath}`);
          continue;
        }

        fs.writeFileSync(targetPath, fixedCode, 'utf8');
        console.log(`  🔧 Self-healed: ${failingFileRelPath}`);
      } catch (aiErr: unknown) {
        const e = aiErr as { message: string };
        console.error(`  ❌ AI fix failed for ${failingFileRelPath}: ${e.message}`);
      }
    }
  }

  // ── Final check after all retries ────────────────────────────────────────
  const finalCheck = await runTsc();
  if (finalCheck === null) {
    console.log('  ✅ TypeScript build is valid (fixed on final check).');
    return true;
  }

  console.error('  ❌ Could not fully self-heal after maximum retries.');
  console.error('     Remaining errors (first 500 chars):');
  console.error('    ', finalCheck.slice(0, 500));
  return false;
}
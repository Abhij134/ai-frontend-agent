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
    model: 'gemini-2.5-flash',
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
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

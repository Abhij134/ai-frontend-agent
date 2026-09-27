import * as readline from 'readline';
import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';
import { scrapeTarget } from './agent/scraper.js';
import { generateFrontend } from './agent/generator.js';
import { validateAndFix } from './agent/validator.js';
import { modifyCode } from './agent/modifier.js';

// ── Patch globals.css: remove dark-mode override that blackens the page ───
function patchGlobalsCss(): void {
  const cssPath = path.join(process.cwd(), 'preview-app', 'app', 'globals.css');
  if (!fs.existsSync(cssPath)) return;
  let css = fs.readFileSync(cssPath, 'utf8');
  // Remove the @media (prefers-color-scheme: dark) block entirely
  css = css.replace(/@media\s*\(prefers-color-scheme:\s*dark\)\s*\{[^}]*\}/gs, '');
  // Remove dark: Tailwind variants from class strings (belt-and-suspenders)
  fs.writeFileSync(cssPath, css.trim() + '\n', 'utf8');
  console.log('  🎨 Patched globals.css: removed dark-mode override');
}

// ── Wipe components/ and .next/ between runs to avoid stale files/cache ──
function cleanPreviousRun(): void {
  const componentsDir = path.join(process.cwd(), 'preview-app', 'components');
  if (fs.existsSync(componentsDir)) {
    fs.rmSync(componentsDir, { recursive: true, force: true });
    console.log('  🧹 Cleared previous components/');
  }
  
  const nextCacheDir = path.join(process.cwd(), 'preview-app', '.next');
  if (fs.existsSync(nextCacheDir)) {
    try {
      fs.rmSync(nextCacheDir, { recursive: true, force: true });
      console.log('  🧹 Cleared Next.js build cache/');
    } catch (e) {
      // Ignore EPERM if a ghost process is still holding a lock, it usually recovers
    }
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

// ── Auto-launch Next.js dev server in background ──────────────────────────
let devServerProcess: ReturnType<typeof spawn> | null = null;

function startDevServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    // Kill any previously spawned dev server
    if (devServerProcess) {
      devServerProcess.kill();
      devServerProcess = null;
    }

    const previewPath = path.join(process.cwd(), 'preview-app');
    console.log('\n  🚀 Starting Next.js dev server...');

    try {
      devServerProcess = spawn(
        'npm run dev',   // single string with shell:true avoids DEP0190 warning
        [],
        {
          cwd: previewPath,
          stdio: 'pipe',
          shell: true,   // CRITICAL on Windows — prevents spawn EINVAL
        }
      );
    } catch (spawnErr: unknown) {
      const e = spawnErr as { message: string };
      console.warn(`  ⚠️  Dev server could not auto-start: ${e.message}`);
      console.warn('  → Open a new terminal and run: cd preview-app && npm run dev\n');
      resolve(); // Still resolve so the prompt can appear
      return;
    }

    let isReady = false;

    devServerProcess.stdout?.on('data', (data: Buffer) => {
      const line = data.toString().trim();
      if (!isReady && (line.includes('localhost') || line.includes('ready') || line.includes('Local:'))) {
        isReady = true;
        console.log(`  ✅ Dev server ready → http://localhost:3000`);
        resolve();
      }
    });

    devServerProcess.stderr?.on('data', (data: Buffer) => {
      const line = data.toString().trim();
      // Only show real errors, not Next.js info messages
      if (line.includes('Error') && !line.includes('ReactDOM')) {
        console.warn('  ⚠️  Dev server:', line.slice(0, 120));
      }
    });

    devServerProcess.on('error', (err) => {
      console.error('  ❌ Failed to start dev server:', err.message);
      if (!isReady) resolve();
    });

    // Fallback: resolve after 8 seconds anyway if we didn't catch the ready string
    setTimeout(() => {
      if (!isReady) {
        isReady = true;
        resolve();
      }
    }, 8000);
  });
}

// ── Cleanup on exit ───────────────────────────────────────────────────────
function cleanup(): void {
  if (devServerProcess) {
    devServerProcess.kill();
  }
}
process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(0); });
process.on('SIGTERM', () => { cleanup(); process.exit(0); });

async function main(): Promise<void> {
  assertPreviewAppExists();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  // Ensure readline is always closed — rl.closed doesn't exist in @types/node@20
  let rlClosed = false;
  const closeRl = () => {
    if (!rlClosed) {
      rlClosed = true;
      rl.close();
    }
  };

  try {
    await new Promise<void>((resolve, reject) => {
      rl.question('\nEnter public website URL to clone: ', async (url) => {
        try {
          const trimmedUrl = url.trim();
          if (!trimmedUrl.startsWith('http')) {
            throw new Error(`Invalid URL: "${trimmedUrl}". Must start with http:// or https://`);
          }

          // ── Step 1: Scrape ──────────────────────────────────────────────
          console.log(`\n[1/4] 🌐 Scraping: ${trimmedUrl}`);
          const {
            screenshotBuffer,
            cleanHtml,
            title,
            fontFamily,
            backgroundColor,
            color,
            images,
            cssVars,
          } = await scrapeTarget(trimmedUrl);
          console.log(`  ✅ Scraped: "${title}"`);

          // ── Step 2: Generate ────────────────────────────────────────────
          console.log('\n[2/4] 🤖 Generating Next.js components...');
          cleanPreviousRun();
          await generateFrontend(screenshotBuffer, cleanHtml, {
            title,
            fontFamily,
            backgroundColor,
            color,
            images,
            cssVars,
          });

          // ── Step 3: Validate ────────────────────────────────────────────
          console.log('\n[3/4] 🔧 Validating TypeScript build...');
          const isValid = await validateAndFix();
          if (!isValid) {
            console.warn('  ⚠️  Build has remaining errors. Preview may not start cleanly.');
          }

          // ── Patch: always strip dark-mode override from globals.css ──────
          patchGlobalsCss();

          // ── Step 4: Auto-launch dev server (non-fatal) ────────────────
          console.log('\n[4/4] ✅ Generation complete!');
          try {
            await startDevServer();
          } catch (devErr: unknown) {
            const e = devErr as { message: string };
            console.warn(`  ⚠️  Could not auto-start dev server: ${e.message}`);
            console.warn('  → Run manually in a new terminal: cd preview-app && npm run dev\n');
          }

          // ── Modification loop ───────────────────────────────────────────
          console.log('─────────────────────────────────────────────────────');
          console.log('💡 You can now modify the UI with natural language.');
          console.log('   Examples:');
          console.log('   • "Change the primary color to blue"');
          console.log('   • "Make the navbar sticky"');
          console.log('   • "Add a testimonials section"');
          console.log('   • "Replace the hero with a bakery theme"');
          console.log('   Type "exit" to quit.');
          console.log('─────────────────────────────────────────────────────\n');

          const promptModify = () => {
            rl.question('Modification → ', async (instruction) => {
              if (instruction.toLowerCase().trim() === 'exit') {
                closeRl();
                resolve();
                return;
              }

              // Guard against shell commands typed by accident
              const shellPatterns = /^(cd |npm |npx |node |ls |dir |clear |cls )/i;
              if (shellPatterns.test(instruction.trim())) {
                console.log('  ℹ️  That looks like a shell command. This prompt accepts natural');
                console.log('      language instructions like "make navbar sticky" or "add a contact form".\n');
                promptModify();
                return;
              }

              try {
                console.log(`\n🔄 Applying: "${instruction}"...`);
                await modifyCode(instruction);
                await validateAndFix();
                console.log('  ✅ Modification complete! Refresh http://localhost:3000\n');
              } catch (modErr: unknown) {
                const err = modErr as { message: string };
                console.error('  ❌ Modification failed:', err.message, '\n');
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
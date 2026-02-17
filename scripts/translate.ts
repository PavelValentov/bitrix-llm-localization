import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { Translator } from '../src/translator.js';
import { config } from '../src/config.js';
import { buildSourceTextIndex, fillAllNullOrWhitespaceOnlyKeys, fillGaps, fillUniformValues } from '../src/fill-gaps.js';
import { buildDynamicBatches } from '../src/token-estimator.js';
import { hasValidTranslationValue } from '../src/translation-utils.js';
import cliProgress from 'cli-progress';

// Type definition for localization.json
type LocalizationMap = Record<string, Record<string, Record<string, string | null>>>;

const COPY_PRIORITY = ['en', 'ru'];

/** Empty, null, or whitespace-only — slot can be filled (per §4.6 / DEV-0021). Do not overwrite non-whitespace. */
function isSlotFillable(val: string | null | undefined): boolean {
  if (val == null || val === '') return true;
  return val.length > 0 && val.trim().length === 0;
}

/**
 * For long keys we don't send to LLM; copy an existing value into missing slots.
 * Priority: en first, then ru, then first available.
 */
function getCopySourceForLongKey(existingLangs: Record<string, string>): { value: string; sourceLang: string } | null {
  for (const lang of COPY_PRIORITY) {
    if (hasValidTranslationValue(existingLangs[lang])) return { value: existingLangs[lang], sourceLang: lang };
  }
  const first = Object.entries(existingLangs).find(([, v]) => hasValidTranslationValue(v));
  return first ? { value: first[1], sourceLang: first[0] } : null;
}

// Global error handlers to catch any unhandled errors that might kill the process during save
process.on('uncaughtException', (err) => {
  process.stderr.write(`\n❌ UNCAUGHT EXCEPTION: ${err.message}\n${err.stack}\n`);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  process.stderr.write(`\n❌ UNHANDLED REJECTION: ${reason}\n`);
  process.exit(1);
});

// Export for testing
export async function runTranslation(
  inputFile: string, 
  requiredLangs: string[],
  outputDir: string = 'output'
) {
  console.log(`🚀 Starting translation...`);
  const backendNote =
    config.translationBackend === 'local'
      ? ` (${config.local.url})`
      : config.translationBackend === 'local-server'
        ? ` (${config.localServer.url}, reload every ${config.localServer.reloadEveryBatches} batches)`
        : '';
  console.log(`📡 Backend: ${config.translationBackend}${backendNote}`);
  console.log(`📂 Input: ${inputFile}`);
  console.log(`📁 Output: ${outputDir}`);
  console.log(`🎯 Required: ${requiredLangs.join(', ')}`);
  console.log(`📋 Full logs: logs/translation.log`);
  
  // Show key configuration
  if (config.translationBackend === 'local-server') {
    console.log(`⚙️  Config: max_tokens=${config.maxResponseTokens} (prompt≤${config.maxPromptTokens}), thinking=${config.localServer.enableThinking}, dynamic_batching=enabled`);
  }

    // Graceful shutdown: save progress on Ctrl+C
    let interrupted = false;
    let interruptTimer: NodeJS.Timeout | null = null;
    let savePromise: Promise<void> = Promise.resolve();

  try {
    const rawData = await fs.readFile(inputFile, 'utf-8');
    const localizationData: LocalizationMap = JSON.parse(rawData);

    // Normalize keys that are all null or only whitespace → all " "
    // mapForFill is the same object as localizationData (type cast only); fill-gaps mutations affect the main loop.
    const mapForFill = localizationData as import('../src/utils.js').TranslationMap;
    fillAllNullOrWhitespaceOnlyKeys(mapForFill, () => {});

    const translator = new Translator({
      onAfterReload: async () => {
        console.log('   📋 Running fill-gaps after model reload...');
        const logDir = 'logs';
        if (!fsSync.existsSync(logDir)) fsSync.mkdirSync(logDir, { recursive: true });
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const logFile = path.join(logDir, `translation-fill-gaps-${timestamp}.log`);
        const logFn = (msg: string) => { fsSync.appendFileSync(logFile, msg + '\n'); };
        const index = buildSourceTextIndex(mapForFill, 'en');
        let substitutions = fillGaps(mapForFill, index, logFn).substitutions;
        const uniformRes = fillUniformValues(mapForFill, logFn);
        substitutions += uniformRes.substitutions;
        const normRes = fillAllNullOrWhitespaceOnlyKeys(mapForFill, logFn);
        substitutions += normRes.substitutions;
        console.log(`   📋 Fill-gaps: ${substitutions} substitutions (log: ${logFile})`);
        // mapForFill is the same object as localizationData — mutations are visible to the main loop.
        // Remaining files will see filled slots and will have fewer keys to translate.
        if (substitutions > 0) {
          console.log(`   ✓ In-memory data updated; remaining batches will skip already-filled slots.`);
        }
        await saveResult();
      },
    });
    
    const filePaths = Object.keys(localizationData);

    const saveResult = async () => {
      const previous = savePromise;
      savePromise = (async () => {
        await previous;
        const outputFile = path.join(outputDir, inputFile);
        await fs.mkdir(path.dirname(outputFile), { recursive: true });
        await fs.writeFile(outputFile, JSON.stringify(localizationData, null, 2));
        try {
          const fd = await fs.open(outputFile, 'r');
          try {
            await fd.sync();
          } finally {
            await fd.close();
          }
        } catch {
          // Ignore fsync errors (e.g. in tests or when FS does not support sync)
        }
      })();
      await savePromise;
    };

    // SIGINT handler: Double Ctrl+C to exit. First Ctrl+C warns, second Ctrl+C (within 3s) saves and exits.
    const onInterrupt = () => {
      const log = (msg: string) => {
        process.stdout.write(msg + '\n');
      };
      
      // First Ctrl+C: warn and set timer. Do NOT set interrupted flag yet (let translation continue).
      if (!interrupted && !interruptTimer) {
        log('\n\n⚠️  Ctrl+C pressed! Press Ctrl+C AGAIN within 3 seconds to save and exit.');
        log('   Or wait — translation will continue automatically.\n');
        
        // Timer: if no second Ctrl+C within 3s, just show "continuing" message
        interruptTimer = setTimeout(() => {
          interruptTimer = null;
          log('   ✓ No second Ctrl+C — continuing translation.\n');
        }, 3000);
        
        return;
      }
      
      // Second Ctrl+C within 3s: NOW set interrupted flag and save immediately
      if (interruptTimer) {
        clearTimeout(interruptTimer);
        interruptTimer = null;
      }
      
      if (interrupted) {
        // Already interrupted and saving - ignore further signals
        return;
      }
      
      interrupted = true;
      bar.stop();
      log('\n\n⏸️  Second Ctrl+C! Will exit after saving current progress...');
      log('   (File is autosaved every 10 translations, so exit is fast)\n');
      // Just set flag - main loop will break, do final async save, and exit cleanly
    };

    // Remove any existing listeners (e.g. from dotenv) to ensure our handler runs exclusively
    process.removeAllListeners('SIGINT');
    process.removeAllListeners('SIGTERM');
    process.removeAllListeners('SIGHUP');

    process.on('SIGINT', onInterrupt);
    process.on('SIGTERM', onInterrupt);
    process.on('SIGHUP', onInterrupt);

    // Pre-scan: count files that need translation vs already complete
    // MUST match main loop logic: skip huge keys (>2048 chars) - we never translate them
    const MAX_KEY_LENGTH = 2048;
    let filesNeedWork = 0;
    let totalMissingKeys = 0;
    for (const fp of filePaths) {
      const keys = localizationData[fp];
      for (const [, langs] of Object.entries(keys)) {
        const existingLangs = Object.entries(langs)
          .filter(([_, val]) => hasValidTranslationValue(val))
          .map(([l, v]) => [l, v] as [string, string | null]);
        if (existingLangs.length === 0) continue;
        const hasHuge = existingLangs.some(([, v]) => typeof v === 'string' && v.length > MAX_KEY_LENGTH);
        if (hasHuge) continue; // skip in count - we never translate these
        const existingLangCodes = existingLangs.map(([l]) => l);
        const missing = requiredLangs.filter(l => !existingLangCodes.includes(l));
        if (missing.length > 0) totalMissingKeys++;
      }
      const hasWork = Object.entries(keys).some(([, langs]) => {
        const existing = Object.entries(langs)
          .filter(([_, val]) => hasValidTranslationValue(val))
          .map(([l, v]) => [l, v] as [string, string | null]);
        if (existing.length === 0) return false;
        const hasHuge = existing.some(([, v]) => typeof v === 'string' && v.length > MAX_KEY_LENGTH);
        if (hasHuge) return false; // skip - we never translate these
        const existingLangCodes = existing.map(([l]) => l);
        return requiredLangs.some(l => !existingLangCodes.includes(l));
      });
      if (hasWork) filesNeedWork++;
    }

    const alreadyDone = filePaths.length - filesNeedWork;
    console.log(`Found ${filePaths.length} files total.`);
    if (alreadyDone > 0) {
      console.log(`   ✅ Already complete: ${alreadyDone} files (${Math.round(alreadyDone / filePaths.length * 100)}%)`);
      console.log(`   🔄 Need translation: ${filesNeedWork} files (${totalMissingKeys} keys)`);
    }

    const bar = new cliProgress.SingleBar(
      { format: ' {bar} {percentage}% | ETA: {eta_formatted} | {value}/{total} files | translated: {translated}' },
      cliProgress.Presets.shades_classic
    );
    bar.start(filePaths.length, alreadyDone, { translated: alreadyDone });

    let processedCount = alreadyDone;
    let translatedFiles = 0;
    let failedBatches = 0;
    let totalApplied = 0;
    let totalSkipped = 0;

    for (const filePath of filePaths) {
      if (interrupted) break;

      const keys = localizationData[filePath];
      const itemsToTranslate: Array<{ key: string, fileName: string, context: Record<string, string>, targets: string[] }> = [];
      let fileHadCopies = false;

      // 1. Scan file for missing translations
      for (const [key, langs] of Object.entries(keys)) {
        const existingLangs = Object.entries(langs)
          .filter(([_, val]) => hasValidTranslationValue(val))
          .reduce((acc, [l, v]) => ({ ...acc, [l]: v as string }), {} as Record<string, string>);

        // If no context at all, skip (can't translate from nothing)
        if (Object.keys(existingLangs).length === 0) continue;

        // Long keys: do not send to LLM; copy existing value into missing slots (only when we "refuse" to translate)
        const hasHugeValues = Object.values(existingLangs).some(val => val.length > MAX_KEY_LENGTH);
        if (hasHugeValues) {
          const missingTargets = requiredLangs.filter(l => !existingLangs[l]);
          if (missingTargets.length > 0) {
            const source = getCopySourceForLongKey(existingLangs);
            if (source) {
              for (const lang of missingTargets) {
                localizationData[filePath][key][lang] = source.value;
              }
              fileHadCopies = true;
              console.log(`   ⏭️  Long key (copy, no LLM): ${key} → ${missingTargets.join(', ')} from ${source.sourceLang}`);
            } else {
              console.log(`   ⏭️  Skipping huge key: ${key} (>${MAX_KEY_LENGTH} chars, no source to copy)`);
            }
          }
          continue;
        }

        const missingTargets = requiredLangs.filter(l => !existingLangs[l]);
        
        if (missingTargets.length > 0) {
          itemsToTranslate.push({
            key,
            fileName: filePath,
            context: existingLangs,
            targets: missingTargets
          });
        }
      }

      if (fileHadCopies) await saveResult();

      // Skip files that are already complete
      if (itemsToTranslate.length === 0) {
        bar.increment(0); // don't double-count pre-scanned complete files
        continue;
      }

      // 2. Build dynamic batches based on token limits
      const batches = buildDynamicBatches(
        itemsToTranslate,
        config.maxPromptTokens,
        config.maxResponseTokens
      );
      
      const totalBatches = batches.length;
      
      for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
        if (interrupted) break;
        const batch = batches[batchIdx];
        const keysPreview = batch.map((b) => b.key).slice(0, 3).join(", ");
        const keysMore = batch.length > 3 ? ` +${batch.length - 3}` : "";
        console.log(
          `\n📤 Batch ${batchIdx + 1}/${totalBatches} [${filePath}]: ${batch.length} keys (${keysPreview}${keysMore})`
        );

        const maxRetries = 3;
        const retryDelaysMs = [0, 5000, 15000];
        let batchOk = false;
        for (let attempt = 0; attempt < maxRetries && !batchOk; attempt++) {
          try {
            if (attempt > 0) {
              console.log(`   🔄 Retry ${attempt}/${maxRetries - 1} in ${retryDelaysMs[attempt] / 1000}s...`);
              await new Promise((r) => setTimeout(r, retryDelaysMs[attempt]));
            }
            const results = await translator.translateFileBatch(batch);

            // Apply only valid translations (skip empty/invalid so we retry next run instead of looping)
            let appliedCount = 0;
            let skippedCount = 0;
            const appliedLangs = new Set<string>();
            for (const [key, translations] of Object.entries(results)) {
              if (localizationData[filePath] && localizationData[filePath][key]) {
                for (const [lang, text] of Object.entries(translations)) {
                  if (!hasValidTranslationValue(text)) {
                    skippedCount++;
                    console.warn(`   ⚠️  Skipped invalid value for ${key}/${lang}: ${JSON.stringify(text)}`);
                    continue;
                  }
                  const current = localizationData[filePath][key][lang];
                  if (!isSlotFillable(current)) {
                    skippedCount++;
                    continue;
                  }
                  localizationData[filePath][key][lang] = text;
                  appliedCount++;
                  appliedLangs.add(lang);
                }
              } else {
                // Key from LLM not found in data — should not happen after key-remap fix
                skippedCount += Object.keys(translations).length;
                console.warn(`   ⚠️  Key not found in data: "${key}" (LLM returned unknown key)`);
              }
            }
            totalApplied += appliedCount;
            totalSkipped += skippedCount;
            console.log(`   📥 Applied: ${appliedCount} translations → ${[...appliedLangs].join(", ")}${skippedCount > 0 ? ` (${skippedCount} skipped)` : ''}`);
            await saveResult();
            batchOk = true;
          } catch (err) {
            if (attempt === maxRetries - 1) {
              failedBatches++;
              console.error(`\n❌ Error processing file ${filePath}:`, err instanceof Error ? err.message : String(err));
            } else {
              console.warn(`   ⚠️ Attempt ${attempt + 1} failed: ${err instanceof Error ? err.message : String(err)}`);
            }
          }
        }
      }

      processedCount++;
      translatedFiles++;
      bar.update(processedCount, { translated: alreadyDone + translatedFiles });
      
      // Autosave every 10 files so Ctrl+C doesn't need to do heavy save
      if (translatedFiles % 10 === 0) {
        await saveResult();
      }
    }
    
    // Always do final save (async - fast because we autosave every 10 files)
    bar.stop();
    if (interrupted) {
      console.log('\n💾 Interrupted - doing final save...');
    } else {
      console.log('\n💾 Final save...');
    }
    await saveResult();
    const outputFile = path.join(outputDir, inputFile);
    console.log(`   Saved to ${outputFile}`);
    console.log(`   Total: ${filePaths.length} files, translated ${translatedFiles} this run.`);
    console.log(`   Applied: ${totalApplied} translations${totalSkipped > 0 ? `, skipped: ${totalSkipped} (invalid/empty)` : ''}`);
    if (failedBatches > 0) {
      console.log(`   ⚠️  ${failedBatches} batch(es) failed (fetch/timeout) — those keys were not applied. Run again to retry.`);
    }
    
    if (interrupted) {
      console.log('\n⏸️  Translation interrupted. Run the same command to resume.');
    }

    // Cleanup signal handlers and timer
    if (interruptTimer) {
      clearTimeout(interruptTimer);
    }
    process.removeListener('SIGINT', onInterrupt);
    process.removeListener('SIGTERM', onInterrupt);
    process.removeListener('SIGHUP', onInterrupt);

  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

// Only run if called directly
import { fileURLToPath } from 'url';

const TRANSLATE_USAGE = `
Usage: pnpm translate <input-file> [--required=en,ua] [--output=output]

  input-file       Path to localization.json (required)
  --required=langs Comma-separated language codes to fill (default: en,ua)
  --output=dir     Output directory; result written to <output>/<input-file> (default: output)

Examples:
  pnpm translate output/business50/localization.json --required=en,ru,ua,tr
  pnpm translate output/business50/localization.json --output=.

Tip: Fill missing slots from existing translations before or alongside translate:
  pnpm fill-gaps <input-file> <output-dir>   (writes result to output-dir)
  With local-server backend, fill-gaps also runs automatically after each model reload.
`;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(TRANSLATE_USAGE.trim());
    process.exit(0);
  }
  const requiredLangsStr = args.find(a => a.startsWith('--required='))?.split('=')[1] || 'en,ua';
  const requiredLangs = requiredLangsStr.split(',');
  const outputDir = args.find(a => a.startsWith('--output='))?.split('=')[1] || 'output';
  const inputFile = args.find(a => !a.startsWith('--'));

  if (!inputFile) {
    console.log(TRANSLATE_USAGE.trim());
    process.exit(1);
  }

  runTranslation(inputFile, requiredLangs, outputDir);
}

import fs from 'fs/promises';
import path from 'path';
import { Translator } from '../src/translator.js';
import { config } from '../src/config.js';
import { buildDynamicBatches } from '../src/token-estimator.js';
import cliProgress from 'cli-progress';

// Type definition for localization.json
type LocalizationMap = Record<string, Record<string, Record<string, string | null>>>;

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
  let saving = false;

  try {
    const rawData = await fs.readFile(inputFile, 'utf-8');
    const localizationData: LocalizationMap = JSON.parse(rawData);
    
    const translator = new Translator();
    
    const filePaths = Object.keys(localizationData);

    const saveResult = async () => {
      saving = true;
      const outputFile = path.join(outputDir, inputFile);
      await fs.mkdir(path.dirname(outputFile), { recursive: true });
      await fs.writeFile(outputFile, JSON.stringify(localizationData, null, 2));
      saving = false;
    };

    // SIGINT handler: save current progress before exit
    const onInterrupt = async () => {
      if (interrupted) return; // prevent double-handling
      interrupted = true;
      bar.stop();
      console.log('\n\n⏸️  Interrupted! Saving progress...');
      try {
        await saveResult();
        const outputFile = path.join(outputDir, inputFile);
        console.log(`💾 Progress saved to ${outputFile}`);
        console.log(`   Processed ${processedCount}/${filePaths.length} files, translated ${translatedFiles} files.`);
        console.log(`   Run the same command to resume.`);
      } catch (e) {
        console.error('❌ Failed to save progress:', e);
      }
      process.exit(0);
    };
    process.on('SIGINT', onInterrupt);
    process.on('SIGTERM', onInterrupt);

    // Pre-scan: count files that need translation vs already complete
    let filesNeedWork = 0;
    let totalMissingKeys = 0;
    for (const fp of filePaths) {
      const keys = localizationData[fp];
      for (const [, langs] of Object.entries(keys)) {
        const existingLangs = Object.entries(langs)
          .filter(([_, val]) => val !== null && val !== "")
          .map(([l]) => l);
        if (existingLangs.length === 0) continue;
        const missing = requiredLangs.filter(l => !existingLangs.includes(l));
        if (missing.length > 0) {
          totalMissingKeys++;
        }
      }
      const hasWork = Object.entries(keys).some(([, langs]) => {
        const existing = Object.entries(langs)
          .filter(([_, val]) => val !== null && val !== "")
          .map(([l]) => l);
        if (existing.length === 0) return false;
        return requiredLangs.some(l => !existing.includes(l));
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
    const SAVE_INTERVAL = 1; // Save every 1 file with translations

    for (const filePath of filePaths) {
      if (interrupted) break;

      const keys = localizationData[filePath];
      const itemsToTranslate: Array<{ key: string, fileName: string, context: Record<string, string>, targets: string[] }> = [];

      // 1. Scan file for missing translations
      for (const [key, langs] of Object.entries(keys)) {
        const existingLangs = Object.entries(langs)
          .filter(([_, val]) => val !== null && val !== "" && val.trim() !== "")
          .reduce((acc, [l, v]) => ({ ...acc, [l]: v as string }), {} as Record<string, string>);

        // If no context at all, skip (can't translate from nothing)
        if (Object.keys(existingLangs).length === 0) continue;

        // Skip keys with huge values (>2048 chars) - too expensive to translate
        const hasHugeValues = Object.values(existingLangs).some(val => val.length > 2048);
        if (hasHugeValues) {
          console.log(`   ⏭️  Skipping huge key: ${key} (>${2048} chars)`);
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

        try {
          const results = await translator.translateFileBatch(batch);
          
          // Apply results
          for (const [key, translations] of Object.entries(results)) {
            if (localizationData[filePath] && localizationData[filePath][key]) {
              for (const [lang, text] of Object.entries(translations)) {
                localizationData[filePath][key][lang] = text;
              }
            }
          }
          const langs = [...new Set(Object.values(results).flatMap((r) => Object.keys(r)))];
          console.log(`   📥 OK: ${Object.keys(results).length} keys → ${langs.join(", ")}`);
        } catch (err) {
          console.error(`\n❌ Error processing file ${filePath}:`, err instanceof Error ? err.message : String(err));
        }
      }

      processedCount++;
      translatedFiles++;
      bar.update(processedCount, { translated: alreadyDone + translatedFiles });

      if (translatedFiles % SAVE_INTERVAL === 0) {
        await saveResult();
      }
    }
    
    if (!interrupted) {
      bar.stop();
      // Final save
      await saveResult();
      const outputFile = path.join(outputDir, inputFile);
      console.log(`\n💾 Saved updated translations to ${outputFile}`);
      console.log(`   Total: ${filePaths.length} files, translated ${translatedFiles} this run.`);
    }

    // Cleanup signal handlers
    process.removeListener('SIGINT', onInterrupt);
    process.removeListener('SIGTERM', onInterrupt);

  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

// Only run if called directly
import { fileURLToPath } from 'url';
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const requiredLangsStr = args.find(a => a.startsWith('--required='))?.split('=')[1] || 'en,ua';
  const requiredLangs = requiredLangsStr.split(',');
  const outputDir = args.find(a => a.startsWith('--output='))?.split('=')[1] || 'output';
  
  const inputFile = args.find(a => !a.startsWith('--')) || 'localization.json';
  
  if (!inputFile) {
    console.error('Usage: pnpm translate <input-file> [--required=en,ua] [--output=output]');
    process.exit(1);
  }
  
  runTranslation(inputFile, requiredLangs, outputDir);
}

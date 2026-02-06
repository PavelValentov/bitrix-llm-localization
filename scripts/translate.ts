import fs from 'fs/promises';
import path from 'path';
import { Translator } from '../src/translator.js';
import { config } from '../src/config.js';
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
  console.log(`📂 Input: ${inputFile}`);
  console.log(`📁 Output: ${outputDir}`);
  console.log(`🎯 Required: ${requiredLangs.join(', ')}`);

  try {
    const rawData = await fs.readFile(inputFile, 'utf-8');
    const localizationData: LocalizationMap = JSON.parse(rawData);
    
    const translator = new Translator();
    const batchSize = config.batchSize;
    
    // Calculate total progress (files to process)
    const filePaths = Object.keys(localizationData);
    console.log(`Found ${filePaths.length} files to check.`);
    
    const bar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
    bar.start(filePaths.length, 0);

    const saveResult = async () => {
      const outputFile = path.join(outputDir, inputFile);
      await fs.mkdir(path.dirname(outputFile), { recursive: true });
      await fs.writeFile(outputFile, JSON.stringify(localizationData, null, 2));
    };

    let processedCount = 0;
    const SAVE_INTERVAL = 1; // Save every 1 file

    for (const filePath of filePaths) {
      const keys = localizationData[filePath];
      const itemsToTranslate: Array<{ key: string, fileName: string, context: Record<string, string>, targets: string[] }> = [];

      // 1. Scan file for missing translations
      for (const [key, langs] of Object.entries(keys)) {
        const existingLangs = Object.entries(langs)
          .filter(([_, val]) => val !== null && val !== "")
          .reduce((acc, [l, v]) => ({ ...acc, [l]: v as string }), {} as Record<string, string>);

        // If no context at all, skip (can't translate from nothing)
        if (Object.keys(existingLangs).length === 0) continue;

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

      // 2. Process batches for this file
      if (itemsToTranslate.length > 0) {
        // bar.log(`\nTranslating ${itemsToTranslate.length} keys in ${filePath}...`);
        
        for (let i = 0; i < itemsToTranslate.length; i += batchSize) {
          const batch = itemsToTranslate.slice(i, i + batchSize);
          
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
          } catch (err) {
            console.error(`\n❌ Error processing file ${filePath}:`, err instanceof Error ? err.message : String(err));
          }
        }
      }

      bar.increment();
      processedCount++;

      if (processedCount % SAVE_INTERVAL === 0) {
        await saveResult();
      }
    }
    
    bar.stop();

    // Final save
    await saveResult();
    const outputFile = path.join(outputDir, inputFile);
    console.log(`\n💾 Saved updated translations to ${outputFile}`);

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

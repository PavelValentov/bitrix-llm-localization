import json
import os
import argparse
import time
import gc
import warnings
from pathlib import Path

# Suppress multiprocessing semaphore leak warning from tokenizers/PyTorch
warnings.filterwarnings("ignore", message=".*leaked semaphore.*", category=UserWarning)
from typing import List, Dict, Set
from tqdm import tqdm
from dotenv import load_dotenv

# Load .env from project root (parent of python-translator/) or cwd
_env_paths = [
    Path(__file__).resolve().parent.parent / ".env",
    Path.cwd() / ".env",
]
for _p in _env_paths:
    if _p.exists():
        load_dotenv(_p)
        break
import torch
from transformers import AutoTokenizer, AutoModelForSeq2SeqLM

from nllb_utils import PlaceholderManager, get_missing_translations, clean_translation, select_best_candidate

# --- Constants ---

MODEL_NAME = "facebook/nllb-200-distilled-600M"

# Language codes for NLLB
LANG_CODES = {
    'ru': 'rus_Cyrl',
    'en': 'eng_Latn',
    'tr': 'tur_Latn',
    'ua': 'ukr_Cyrl',
    'de': 'deu_Latn',
    'fr': 'fra_Latn',
    'es': 'spa_Latn',
    'it': 'ita_Latn',
    'pl': 'pol_Latn',
    'br': 'por_Latn',
    'vn': 'vie_Latn',
    'cn': 'zho_Hans', # Simplified Chinese
    'tw': 'zho_Hant', # Traditional Chinese
}

# --- Translator Engine ---

class BitrixTranslator:
    def __init__(self, model_name: str = MODEL_NAME, device: str = None, use_pipeline: bool = False, generation_config: Dict = None, glossary_path: str = None, max_retries: int = 3):
        self.model_name = model_name
        self.device = device or ('cuda' if torch.cuda.is_available() else 'mps' if torch.backends.mps.is_available() else 'cpu')
        self.generation_config = generation_config or {
            'repetition_penalty': 1.3,
            'no_repeat_ngram_size': 2,
            'num_beams': 3,
            'length_penalty': 0.6,
        }
        self.max_retries = max_retries
        
        self.glossary = {}
        if glossary_path and os.path.exists(glossary_path):
            try:
                with open(glossary_path, 'r', encoding='utf-8') as f:
                    self.glossary = json.load(f)
                print(f"📖 Loaded glossary from {glossary_path} ({len(self.glossary)} entries)")
            except Exception as e:
                print(f"⚠️ Failed to load glossary: {e}")
        
        print(f"🔌 Using device: {self.device}")
        print(f"⚙️ Generation config: {self.generation_config}")

        print(f"⏳ Loading model {model_name}...")
        start = time.time()
        self.tokenizer = AutoTokenizer.from_pretrained(model_name)
        self.model = AutoModelForSeq2SeqLM.from_pretrained(model_name).to(self.device)
        print(f"✅ Model loaded in {time.time() - start:.2f}s")

        self.placeholder_manager = PlaceholderManager()

    def translate_batch(self, texts: List[str], src_lang: str, tgt_lang: str) -> List[str]:
        if not texts:
            return []
            
        final_results = [None] * len(texts)
        indices_to_translate = []
        texts_to_translate = []

        # 0. Check glossary
        for i, text in enumerate(texts):
            # Check exact match in glossary
            if text in self.glossary and tgt_lang in self.glossary[text]:
                final_results[i] = self.glossary[text][tgt_lang]
            else:
                indices_to_translate.append(i)
                texts_to_translate.append(text)
                
        if not texts_to_translate:
            return final_results

        # 1. Protect placeholders
        protected_batch = []
        placeholders_maps = []
        for text in texts_to_translate:
            p_text, p_map = self.placeholder_manager.protect(text)
            protected_batch.append(p_text)
            placeholders_maps.append(p_map)

        # Split into short (greedy) and regular batches to optimize accuracy
        short_indices = []
        regular_indices = []
        
        for i, text in enumerate(protected_batch):
            # Heuristic: <= 2 words is "short"
            # We count spaces as a proxy for words
            if text.count(' ') <= 1 and len(text) < 30:
                short_indices.append(i)
            else:
                regular_indices.append(i)

        translated_batch = [None] * len(texts_to_translate)
        
        tgt_code = LANG_CODES.get(tgt_lang, tgt_lang)
        forced_bos_token_id = self.tokenizer.convert_tokens_to_ids(tgt_code)
        self.tokenizer.src_lang = LANG_CODES.get(src_lang, src_lang)

        # Helper for generation
        def _generate(indices, greedy=False, attempt=0):
            if not indices:
                return
            
            sub_batch = [protected_batch[i] for i in indices]
            
            inputs = self.tokenizer(
                sub_batch,
                return_tensors="pt",
                padding=True,
                truncation=True,
                max_length=128,
            ).to(self.device)

            # Adaptive max_length
            input_len = inputs.input_ids.shape[1]
            
            gen_kwargs = self.generation_config.copy()
            adaptive_max_new_tokens = 64

            # Retry strategy
            if attempt > 0:
                # Fallback to sampling
                gen_kwargs['do_sample'] = True
                gen_kwargs['num_beams'] = 1
                # Increase temperature with attempts
                gen_kwargs['temperature'] = 0.6 + (0.2 * attempt) # 0.8, 1.0...
                gen_kwargs.pop('repetition_penalty', None) # Relax constraints
                gen_kwargs.pop('no_repeat_ngram_size', None)
                adaptive_max_new_tokens = 128 # Give more space
                # print(f"🔄 Retry attempt {attempt} for {len(indices)} items (temp={gen_kwargs['temperature']})")
            
            elif greedy:
                gen_kwargs['num_beams'] = 1
                gen_kwargs['do_sample'] = False
                # Stricter for short strings
                gen_kwargs['no_repeat_ngram_size'] = 1  # Block ANY repeated token
                # 3 chars -> ~1-2 tokens. output shouldn't be > 5-6 tokens.
                adaptive_max_new_tokens = max(5, int(input_len * 1.5))
            else:
                adaptive_max_new_tokens = min(64, max(20, int(input_len * 2)))

            with torch.no_grad():
                generated_tokens = self.model.generate(
                    **inputs,
                    forced_bos_token_id=forced_bos_token_id,
                    max_new_tokens=adaptive_max_new_tokens,
                    early_stopping=True,
                    **gen_kwargs
                )
            
            decoded = self.tokenizer.batch_decode(generated_tokens, skip_special_tokens=True)
            for i, res in zip(indices, decoded):
                translated_batch[i] = res

        # Retry loop
        indices_to_process = list(range(len(protected_batch)))
        
        for attempt in range(self.max_retries + 1):
            if not indices_to_process:
                break
                
            # Split into short (greedy) and regular batches to optimize accuracy
            # Only if attempt == 0 (standard strategy). For retries, treat all same (sampling)
            short_indices = []
            regular_indices = []
            
            if attempt == 0:
                for i in indices_to_process:
                    text = protected_batch[i]
                    if text.count(' ') <= 1 and len(text) < 30:
                        short_indices.append(i)
                    else:
                        regular_indices.append(i)
                _generate(short_indices, greedy=True, attempt=0)
                _generate(regular_indices, greedy=False, attempt=0)
            else:
                # Retry all failed with sampling
                _generate(indices_to_process, greedy=False, attempt=attempt)

            # Validate macros
            next_indices_to_process = []
            for i in indices_to_process:
                generated_text = translated_batch[i]
                p_map = placeholders_maps[i]
                
                # Check if all placeholders are present
                missing_macros = False
                for ph in p_map.keys():
                    if ph not in generated_text:
                        missing_macros = True
                        break
                
                if missing_macros:
                    # print(f"⚠️ Macro corruption in item {i}: expected {list(p_map.keys())}, got '{generated_text}'")
                    next_indices_to_process.append(i)
                    # Clear result so we don't return bad translation if all retries fail
                    translated_batch[i] = None 
            
            indices_to_process = next_indices_to_process

        # 4. Restore placeholders, clean and merge back
        for i, text in enumerate(translated_batch):
            if text is None: 
                # Failed all retries -> Skip
                continue
                
            p_map = placeholders_maps[i]
            restored = self.placeholder_manager.restore(text, p_map)
            cleaned = clean_translation(restored)
            
            original_idx = indices_to_translate[i]
            final_results[original_idx] = cleaned

        return final_results
    
    def cleanup(self):
        """Free memory"""
        del self.model
        del self.tokenizer
        if self.device == 'cuda':
            torch.cuda.empty_cache()
        elif self.device == 'mps':
            torch.mps.empty_cache()
        gc.collect()

# --- Main Logic ---

def load_json(path: str) -> Dict:
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)

def save_json(path: str, data: Dict):
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def main():
    parser = argparse.ArgumentParser(description="Bitrix24 Local NLLB Translator")
    parser.add_argument('--input', required=True, help="Path to localization.json")
    parser.add_argument('--output', required=True, help="Path to output directory or file")
    parser.add_argument('--src', default='en', help="Source language code(s), comma-separated (default: en)")
    parser.add_argument('--targets', default='ru,tr', help="Comma-separated target languages")
    parser.add_argument('--batch-size', type=int, default=32, help="Strings per translation batch (default: 32)")
    parser.add_argument('--file-batch-size', type=int, default=0, help="Files per checkpoint (0 = all at once, saves after each batch)")
    parser.add_argument('--reload-after', type=int, default=0, help="Reload model after N batches (0 = disabled)")
    parser.add_argument('--limit', type=int, default=0, help="Max translations to apply (0 = no limit, for QA)")
    parser.add_argument('--cpu', action='store_true', help="Force CPU usage")
    
    # Generation params
    parser.add_argument('--repetition-penalty', type=float, default=1.3, help="Repetition penalty (default: 1.3)")
    parser.add_argument('--no-repeat-ngram', type=int, default=2, help="No repeat ngram size (default: 2)")
    parser.add_argument('--num-beams', type=int, default=3, help="Beam search size (default: 3)")
    parser.add_argument('--length-penalty', type=float, default=0.6, help="Length penalty (default: 0.6)")
    # Default glossary path to same dir as script
    default_glossary = os.path.join(os.path.dirname(__file__), 'glossary.json')
    parser.add_argument('--glossary', default=default_glossary, help="Path to glossary JSON file")
    parser.add_argument('--max-retries', type=int, default=3, help="Max retries for macro validation (default: 3)")

    args = parser.parse_args()
    
    src_langs = args.src.split(',')
    target_langs = args.targets.split(',')
    
    print(f"🚀 Starting translation task")
    print(f"📂 Input: {args.input}")
    print(f"🌍 Sources: {src_langs} (priority order) -> Targets: {target_langs}")
    
    # Load Data
    data = load_json(args.input)
    file_paths = list(data.keys())
    print(f"📊 Loaded {len(file_paths)} files")

    # Determine file batches
    file_batch_size = args.file_batch_size
    if file_batch_size <= 0:
        file_batches = [file_paths]
        print("📁 Processing all files at once")
    else:
        file_batches = [
            file_paths[i : i + file_batch_size]
            for i in range(0, len(file_paths), file_batch_size)
        ]
        print(f"📁 Processing in {len(file_batches)} file batches (batch size: {file_batch_size})")

    # Initialize Translator
    device = 'cpu' if args.cpu else None
    glossary_path = args.glossary if os.path.isabs(args.glossary) else os.path.join(os.path.dirname(__file__), args.glossary)
    
    translator = BitrixTranslator(
        device=device,
        generation_config={
            'repetition_penalty': args.repetition_penalty,
            'no_repeat_ngram_size': args.no_repeat_ngram,
            'num_beams': args.num_beams,
            'length_penalty': args.length_penalty,
        },
        glossary_path=glossary_path,
        max_retries=args.max_retries
    )

    output_path = args.output
    if os.path.isdir(output_path):
        output_path = os.path.join(output_path, os.path.basename(args.input))

    total_applied = 0
    limit = args.limit
    if limit > 0:
        print(f"⚠️ Limit: max {limit} translations (QA mode)")

    for batch_idx, batch_files in enumerate(file_batches):
        if limit > 0 and total_applied >= limit:
            break
        if file_batch_size > 0:
            print(f"\n📦 File batch {batch_idx + 1}/{len(file_batches)} ({len(batch_files)} files)")

        # Analyze work for this batch
        # Phase 1: Collection
        tasks = get_missing_translations(
            data, src_langs, target_langs, file_paths=batch_files
        )
        
        if not tasks:
            if file_batch_size > 0:
                save_json(output_path, data)
            continue

        # Phase 2: Execution Setup
        # Group tasks by (src_lang, tgt_lang) for efficient NLLB batching
        # We need to track which task each translation belongs to.
        batch_queues = {} # (src, tgt) -> List[text]
        task_map = {}     # (src, tgt) -> List[task_index]

        for i, task in enumerate(tasks):
            if limit > 0 and total_applied + i >= limit: # Rough limit check
                break
                
            for src, text in task['available_sources'].items():
                for tgt in task['missing_targets']:
                    key = (src, tgt)
                    if key not in batch_queues:
                        batch_queues[key] = []
                        task_map[key] = []
                    batch_queues[key].append(text)
                    task_map[key].append(i)

        total_ops = sum(len(q) for q in batch_queues.values())
        progress_bar = tqdm(total=total_ops, desc="Translating (Multi-source)")

        # Candidates storage: candidates[task_idx][tgt_lang][src_lang] = translation
        candidates = [{} for _ in range(len(tasks))]
        batches_processed = 0

        # Phase 3: Execution
        for (src_lang, tgt_lang), texts in batch_queues.items():
            if not texts:
                continue
            
            indices = task_map[(src_lang, tgt_lang)]

            for i in range(0, len(texts), args.batch_size):
                batch_texts = texts[i : i + args.batch_size]
                batch_indices = indices[i : i + args.batch_size]

                try:
                    results = translator.translate_batch(batch_texts, src_lang, tgt_lang)

                    for task_idx, trans in zip(batch_indices, results):
                        if tgt_lang not in candidates[task_idx]:
                            candidates[task_idx][tgt_lang] = {}
                        candidates[task_idx][tgt_lang][src_lang] = trans

                    progress_bar.update(len(batch_texts))
                    batches_processed += 1

                    # Reload Logic
                    if args.reload_after > 0 and batches_processed % args.reload_after == 0:
                        print(f"\n♻️ Reloading model to clear memory...")
                        translator.cleanup()
                        translator = BitrixTranslator(
                            device=device,
                            generation_config={
                                'repetition_penalty': args.repetition_penalty,
                                'no_repeat_ngram_size': args.no_repeat_ngram,
                                'num_beams': args.num_beams,
                                'length_penalty': args.length_penalty,
                            },
                            glossary_path=glossary_path,
                            max_retries=args.max_retries
                        )

                except Exception as e:
                    print(f"\n❌ Error in batch ({src_lang}->{tgt_lang}): {e}")

        progress_bar.close()

        # Phase 4: Selection & Apply
        applied_count = 0
        
        for i, task in enumerate(tasks):
            if limit > 0 and total_applied >= limit:
                break
                
            task_candidates = candidates[i] # {tgt: {src: trans}}
            if not task_candidates:
                continue

            filename = task['filename']
            original_key = task['original_key']
            
            if filename not in data or original_key not in data[filename]:
                continue
                
            translations = data[filename][original_key]
            
            for tgt_lang, src_map in task_candidates.items():
                if not src_map:
                    continue
                
                # Consensus & Selection
                best_translation = select_best_candidate(
                    src_map, tgt_lang, primary_src=src_langs[0]
                )
                
                if best_translation:
                    translations[tgt_lang] = best_translation
                    applied_count += 1
        
            if limit > 0 and total_applied + applied_count >= limit:
                break
                
        total_applied += applied_count

        # Save after each file batch (checkpoint)
        save_json(output_path, data)
        if file_batch_size > 0:
            print(f"💾 Checkpoint saved ({applied_count} applied in this batch)")

    print(f"\n✅ Total applied: {total_applied} translations")
    print(f"💾 Saved to {output_path}")

if __name__ == "__main__":
    main()

import time
from bitrix24_translator_complete import BitrixTranslator

def main():
    print("🚀 Simple NLLB Test Script")
    
    # 1. Initialize
    translator = BitrixTranslator()
    
    # 2. Test data
    test_phrases = [
        "Hello world",
        "Settings saved successfully.",
        "Error: User #AUTHOR# not found.",
        "File size: {0} MB",
        "Welcome to Bitrix24!"
    ]
    
    src = "en"
    targets = ["ru", "tr", "ua"]
    
    print(f"\n🧪 Testing translation of {len(test_phrases)} phrases from {src} to {targets}\n")
    
    # 3. Translate
    for tgt in targets:
        print(f"--- Target: {tgt} ---")
        start = time.time()
        results = translator.translate_batch(test_phrases, src, tgt)
        duration = time.time() - start
        
        for original, translated in zip(test_phrases, results):
            print(f"📝 {original} -> {translated}")
            
        print(f"⏱️ Time: {duration:.2f}s\n")
        
    print("✅ Test complete!")

if __name__ == "__main__":
    main()

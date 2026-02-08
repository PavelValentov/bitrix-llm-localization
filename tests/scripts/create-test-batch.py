#!/usr/bin/env python3
"""
Extract first N untranslated keys for testing
"""
import json
import sys

def main():
    # Read input file
    with open('input/business50/localization.json', 'r') as f:
        data = json.load(f)
    
    # Find untranslated keys
    test_data = {}
    count = 0
    target = 15
    
    for file_path, keys in data.items():
        if count >= target:
            break
            
        for key, langs in keys.items():
            if count >= target:
                break
                
            # Check if tr is null (untranslated)
            if langs.get('tr') is None:
                # Check if we have context (en, ru, or ua)
                has_context = False
                for lang in ['en', 'ru', 'ua']:
                    if langs.get(lang) and langs.get(lang) not in [None, '']:
                        has_context = True
                        break
                
                if has_context:
                    if file_path not in test_data:
                        test_data[file_path] = {}
                    test_data[file_path][key] = langs
                    count += 1
    
    # Write test file to tests/fixtures/
    output_path = 'tests/fixtures/test-batch.json'
    with open(output_path, 'w') as f:
        json.dump(test_data, f, indent=2, ensure_ascii=False)
    
    print(f"✅ Created {output_path} with {count} untranslated keys")
    
    # Show sample
    print("\n📋 Sample keys:")
    sample_count = 0
    for file_path, keys in test_data.items():
        for key, langs in keys.items():
            if sample_count < 3:
                print(f"   - {key}: tr={langs.get('tr')}")
                sample_count += 1

if __name__ == '__main__':
    main()

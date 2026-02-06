"""
Pure Python utilities for NLLB translator (no torch/transformers).
Used by bitrix24_translator_complete.py and test_nllb_translator.py.
"""
import re
from typing import Dict, List, Set, Tuple


class PlaceholderManager:
    """
    Protects variables and special tokens from being translated.
    Replaces them with temporary tokens (e.g. __PH_0__) and restores them after translation.
    """

    def __init__(self):
        self.patterns = [
            r'#\w+#',
            r'\{\w+\}',
            r'%\w+',
            r'\$\{\w+\}',
            r'<[^>]+>',
            r'&[a-zA-Z0-9#]+;',
            r'\[url=.*?\]',
            r'\[/url\]',
            r'\[b\]', r'\[/b\]',
        ]
        self.combined_pattern = re.compile('|'.join(self.patterns))

    def protect(self, text: str) -> Tuple[str, Dict[str, str]]:
        if not text:
            return text, {}
        placeholders = {}
        counter = 0

        def replace_match(match):
            nonlocal counter
            token = f"__PH_{counter}__"
            placeholders[token] = match.group(0)
            counter += 1
            return token

        protected_text = self.combined_pattern.sub(replace_match, text)
        return protected_text, placeholders

    def restore(self, text: str, placeholders: Dict[str, str]) -> str:
        if not text or not placeholders:
            return text
        for token, original in placeholders.items():
            text = text.replace(token, original)
        return text


def clean_translation(text: str) -> str:
    """
    Post-process NLLB output: remove duplicate words and normalize whitespace.
    Handles: "word word", "Час - час.", "Ні, ні." (case-insensitive).
    """
    if not text or not isinstance(text, str):
        return text
    # Normalize whitespace
    text = " ".join(text.split())
    # Pattern: "X - Y." where X and Y are same word (case-insensitive)
    def _dedash(m):
        a, b = m.group(1), m.group(2).rstrip(".")
        return (a + " ") if a.lower() == b.lower() else m.group(0)

    text = re.sub(r"\b(\w+)\s*-\s*(\w+\.?)\s*", _dedash, text)
    text = " ".join(text.split())
    # Remove duplicate consecutive words (case-insensitive, ignore trailing punctuation)
    words = text.split()
    deduped = []
    for w in words:
        w_cmp = w.rstrip(".,;:!?").lower()
        prev_cmp = deduped[-1].rstrip(".,;:!?").lower() if deduped else None
        if not deduped or prev_cmp != w_cmp:
            deduped.append(w)
            
    result = " ".join(deduped).strip()
    
    # Strip trailing punctuation for short strings (single word)
    # NLLB often adds "." or "," to "Yes", "No", "Day" -> "Yes,"
    if len(result.split()) == 1 and len(result) < 15:
        result = result.rstrip(".,;:!?")
        
    return result


def validate_translation(text: str, tgt_lang: str) -> bool:
    """
    Validates translation result based on script and heuristics.
    Returns True if valid, False if hallucination detected.
    """
    if not text or not isinstance(text, str):
        return False
        
    # Basic script check
    cyrillic_langs = {'ru', 'ua', 'by', 'bg', 'mk', 'sr', 'kz'}
    latin_langs = {'en', 'tr', 'de', 'fr', 'es', 'it', 'pl', 'br', 'vn'}
    
    cyrillic_pattern = re.compile(r'[а-яА-ЯёЁ]')
    latin_pattern = re.compile(r'[a-zA-Z]')
    
    is_cyrillic = bool(cyrillic_pattern.search(text))
    is_latin = bool(latin_pattern.search(text))
    
    if tgt_lang in cyrillic_langs:
        # Should contain Cyrillic, shouldn't be purely Latin
        if is_latin and not is_cyrillic:
            return False
    elif tgt_lang in latin_langs:
        # Should be Latin (mostly), shouldn't be Cyrillic
        if is_cyrillic:
            return False
            
    return True

def select_best_candidate(
    candidates: Dict[str, str], 
    tgt_lang: str,
    primary_src: str = 'en'
) -> str:
    """
    Selects the best translation from candidates based on validation,
    agreement, and language proximity.
    
    candidates: {src_lang: translation_text}
    """
    # 1. Filter invalid
    valid_candidates = {
        src: txt for src, txt in candidates.items() 
        if validate_translation(txt, tgt_lang)
    }
    
    if not valid_candidates:
        return None
        
    if len(valid_candidates) == 1:
        return list(valid_candidates.values())[0]

    # 2. Check agreement (simple equality or normalization)
    # If all valid candidates are "similar", pick primary
    values = list(valid_candidates.values())
    if all(v == values[0] for v in values):
        # All agree
        return values[0]
        
    # 3. Proximity Heuristics
    # Map target -> preferred source list
    proximity_map = {
        'ua': ['ru', 'en'],
        'by': ['ru', 'en'],
        'kz': ['ru', 'en'],
        'pl': ['en', 'ru'],
        'de': ['en', 'ru'],
        'fr': ['en', 'ru'],
        'es': ['en', 'ru'],
        'tr': ['en', 'ru'], # TR is agglutinative, EN is usually safer base than RU
    }
    
    preferred_sources = proximity_map.get(tgt_lang, [primary_src])
    
    for pref_src in preferred_sources:
        if pref_src in valid_candidates:
            return valid_candidates[pref_src]
            
    # Fallback: pick any valid (e.g. primary or first available)
    if primary_src in valid_candidates:
        return valid_candidates[primary_src]
        
    return list(valid_candidates.values())[0]

def get_missing_translations(
    data: Dict,
    src_langs: List[str],
    target_langs: List[str],
    file_paths: List[str] = None,
) -> List[Dict]:
    """
    Returns a list of translation tasks.
    Each task: {
        'key': unique_key_id (filename + key),
        'available_sources': { lang: text },
        'missing_targets': { lang }
    }
    """
    tasks = []
    files_to_scan = file_paths if file_paths is not None else list(data.keys())

    for filename in files_to_scan:
        if filename not in data:
            continue
        keys = data[filename]
        for key, translations in keys.items():
            # Find ALL available sources
            available_sources = {}
            for lang in src_langs:
                text = translations.get(lang)
                if text and isinstance(text, str) and text.strip():
                    available_sources[lang] = text
            
            if not available_sources:
                continue

            # Check missing targets
            missing_targets = set()
            for tgt in target_langs:
                tgt_text = translations.get(tgt)
                if not tgt_text:
                    missing_targets.add(tgt)
            
            if missing_targets:
                tasks.append({
                    'key': f"{filename}::{key}", # Unique ID
                    'original_key': key,
                    'filename': filename,
                    'available_sources': available_sources,
                    'missing_targets': missing_targets
                })
                
    return tasks

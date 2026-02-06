# NLLB Bitrix24 Translation Guide 📚

This guide covers the linguistic aspects and model specifics.

## Model: NLLB-200
"No Language Left Behind" is a state-of-the-art model by Meta.
We use the `distilled-600M` variant which offers the best balance of speed/quality for desktop use.

## Translation Strategy

### 1. Context
The model translates sentences independently. It does **not** see the file name or previous keys.
This means ambiguous words (e.g., "Home" -> "Dom" or "Glavnaya"?) are translated based on general probability.

### 2. Placeholder Handling
We use a "Mask and Restore" strategy.
- **Original**: `Welcome, #AUTHOR#!`
- **Masked**: `Welcome, __PH_0__!`
- **Translated**: `Добро пожаловать, __PH_0__!`
- **Restored**: `Добро пожаловать, #AUTHOR#!`

### 3. Quality Assurance
The script does not perform semantic QA (checking if meaning is preserved).
It guarantees **structural integrity** (JSON validity, placeholder count).

## Supported Languages (Common)

| Code | NLLB Code | Language |
|------|-----------|----------|
| en | eng_Latn | English |
| ru | rus_Cyrl | Russian |
| tr | tur_Latn | Turkish |
| ua | ukr_Cyrl | Ukrainian |
| de | deu_Latn | German |
| fr | fra_Latn | French |
| es | spa_Latn | Spanish |
| kz | kaz_Cyrl | Kazakh |

## Plural and Gender Limitations

### Slavic Plural Forms (PLURAL_1, PLURAL_2, PLURAL_3)

Russian uses 3 forms: 1 день, 2–4 дня, 5+ дней. NLLB translates each string independently and does **not** see the key name. For the same English "days", it will produce one translation for all slots—so PLURAL_2 and PLURAL_3 will get the same (incorrect) form.

**Recommendation:** Use LLM translation or a lookup table for plural keys.

### Grammatical Gender

Russian/Ukrainian adjectives agree in gender (добавлен/добавлена/добавлено). NLLB has no context about the noun, so it may pick the wrong form.

### Short Words

Words like "day", "hour", "minute" often get expanded into full sentences ("Günün bir parçası" instead of "gün"). Consider glossary or manual review for such keys.

See `output/qa-nllb/QA-PLURAL-GENDER-REPORT.md` for detailed test results.

## Best Practices

1. **Don't translate short codes**: Keys like `Y`, `N`, `ID` might be better left alone, but the model will try to translate them.
2. **Review output**: Machine translation is 90% correct. Humans should spot check UI elements.
3. **Glossary**: This script does not support a custom glossary (yet).
4. **Plural keys**: Prefer LLM or manual translation for `*_PLURAL_1`, `*_PLURAL_2`, `*_PLURAL_3` in Slavic languages.

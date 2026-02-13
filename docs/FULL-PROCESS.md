# Полный процесс: от архивов Bitrix24 до готового перевода

Пошаговая инструкция, чтобы получить готовые архивы локализации (`file-en.tar.gz`, `file-ru.tar.gz` и т.д.) для загрузки в Bitrix24.

---

## Требования

- **Node.js** 18+
- **pnpm** (`npm install -g pnpm`)
- Исходные архивы локализации Bitrix24: `file-en.tar.gz`, `file-ru.tar.gz` (и другие языки при необходимости)

---

## Шаг 1. Распаковка архивов

Создайте папку проекта и распакуйте в неё все архивы. Каждый архив должен дать папку с кодом языка (`en/`, `ru/`, `ua/` и т.д.).

```bash
cd /path/to/localization
mkdir -p input/business50
cd input/business50

# Распаковать архивы (путь укажите к вашим файлам)
tar -xzf /path/to/file-en.tar.gz
tar -xzf /path/to/file-ru.tar.gz
tar -xzf /path/to/file-ua.tar.gz
# при необходимости: file-tr.tar.gz, file-de.tar.gz и т.д.

cd ../..
```

**Проверка:** в `input/business50/` должны быть каталоги `en/`, `ru/`, `ua/` и т.д., внутри — структура модулей с `lang/<код_языка>/`.

```bash
ls input/business50/
# en  ru  ua  ...
```

---

## Шаг 2. Сбор в один JSON (агрегация)

Соберите все языковые файлы из папок в один `localization.json`.

```bash
pnpm aggregate input/business50
```

**Результат:** файл `input/business50/localization.json` с ключами и переводами по языкам. Отсутствующие переводы будут `null`.

---

## Шаг 3. (Опционально) Заполнение пробелов без перевода

Скопировать уже существующие переводы в пустые ячейки (одинаковый текст в других ключах или языках):

```bash
pnpm fill-gaps input/business50/localization.json input/business50
```

Результат запишется в `input/business50/localization.json` (файл обновится). Лог — в `logs/fill-gaps-*.log`.

---

## Шаг 4. Перевод отсутствующих строк

Заполните оставшиеся `null` через LLM или локальную модель.

### Вариант A: Локальная модель (Qwen, MLX, без API)

```bash
./run_translation.sh input/business50/localization.json
```

Перевод идёт in-place; можно прервать (Ctrl+C) и потом запустить снова — продолжит с места остановки.

### Вариант B: OpenAI (или совместимый API)

В корне проекта создайте `.env` (см. `.env.example`):

```ini
OPENAI_API_KEY=sk-proj-...
```

Запуск:

```bash
TRANSLATION_BACKEND=api pnpm translate input/business50/localization.json --required=ru,en,ua
```

**Результат:** в `input/business50/localization.json` заполнены переводы для указанных языков.

---

## Шаг 5. Восстановление в PHP-файлы

Разверните JSON обратно в дерево PHP-файлов по языкам:

```bash
pnpm restore input/business50/localization.json output/business50
```

**Результат:** в `output/business50/` появятся папки `en/`, `ru/`, `ua/` и т.д. с полной структурой модулей и файлами `lang/<код>/...`.

---

## Шаг 6. Создание архивов для Bitrix24

Соберите архивы по одному на язык:

```bash
pnpm create-archives output/business50
```

**Результат:** в `output/business50/` появятся файлы:

- `file-en.tar.gz`
- `file-ru.tar.gz`
- `file-ua.tar.gz`
- и т.д.

Их можно загружать в Bitrix24.

---

## Шаг 7. Загрузка в Bitrix24

1. Откройте в браузере: **Администрирование → Настройки продукта → Языковые файлы** (или страницу сбора переводов, например `translate_collector.php`).
2. Выберите язык (например, English).
3. Загрузите соответствующий архив (например, `file-en.tar.gz`).
4. Дождитесь распаковки и применения.
5. Повторите для остальных языков (`file-ru.tar.gz`, `file-ua.tar.gz` и т.д.).

---

## Сводка команд (копируй и подставляй пути)

```bash
# 1. Распаковка (вручную в input/business50)
# 2. Агрегация
pnpm aggregate input/business50

# 3. Опционально: заполнить пробелы
pnpm fill-gaps input/business50/localization.json input/business50

# 4. Перевод (один из вариантов)
./run_translation.sh input/business50/localization.json
# или: TRANSLATION_BACKEND=api pnpm translate input/business50/localization.json --required=ru,en,ua

# 5. Восстановление
pnpm restore input/business50/localization.json output/business50

# 6. Архивы
pnpm create-archives output/business50

# Готовые архивы: output/business50/file-en.tar.gz, file-ru.tar.gz, ...
```

---

## Альтернатива: слияние с существующим полным JSON

Если у вас уже есть полный дамп локализации (`localization-full.json`) и вы добавили только новые распакованные архивы:

```bash
# Слияние: агрегация из папок + приоритет у существующего JSON
pnpm merge-aggregate input/business50 input/business50/localization-full.json input/business50/localization_pre.json

# Заполнить пробелы
pnpm fill-gaps input/business50/localization_pre.json input/business50

# Дальше используйте input/business50/localization_pre.json вместо localization.json:
# перевод, restore, create-archives (в restore укажите localization_pre.json и нужную output-папку)
```

---

## Возможные проблемы

- **Ошибка «Path is invalid» при загрузке архива в Bitrix24** — обновите ядро/модуль translate (исправления для null-byte и PaxHeader в tar). См. репозиторий Bitrix/патчи.
- **Мало переводов после шага 4** — проверьте `--required` и что в JSON есть ключи с `null` для этих языков; при API проверьте `.env` и квоты.
- **Структура после restore не совпадает с ожидаемой** — убедитесь, что агрегация делалась из той же структуры (те же архивы/папки), что и в Bitrix24.

Подробнее: [USER-WORKFLOW.md](USER-WORKFLOW.md), [TROUBLESHOOTING.md](TROUBLESHOOTING.md).

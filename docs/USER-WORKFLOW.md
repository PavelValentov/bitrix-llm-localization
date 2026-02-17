# Руководство пользователя: полный путь от архивов до готовых архивов

Пошаговое описание процесса от распаковки исходных архивов локализации Bitrix24 до получения обработанных архивов для загрузки обратно в портал.

**Главный документ с готовыми командами:** **[FULL-PROCESS.md](FULL-PROCESS.md)** — откройте его, чтобы повторить процесс по шагам и получить готовый перевод.

Ниже — та же схема с пояснениями и альтернативами.

---

## Структура папок

```
localization/
├── input/                    # Входные данные
│   └── business50/           # Папка проекта (имя любое)
│       ├── en/               # Содержимое file-en.tar.gz
│       ├── ru/               # Содержимое file-ru.tar.gz
│       ├── ua/
│       └── localization.json # Создаётся на шаге 2
│
├── output/                   # Результаты
│   └── business50/
│       ├── en/               # Восстановленные PHP
│       ├── ru/
│       ├── ua/
│       ├── file-en.tar.gz    # Готовые архивы (шаг 6)
│       ├── file-ru.tar.gz
│       └── ...
```

---

## Шаг 1: Подготовка входной папки

Создайте папку проекта и распакуйте архивы Bitrix24 так, чтобы получились каталоги по языкам.

```bash
mkdir -p input/business50
cd input/business50
tar -xzf /path/to/file-en.tar.gz
tar -xzf /path/to/file-ru.tar.gz
tar -xzf /path/to/file-ua.tar.gz
cd ../..
```

Проверка: `ls input/business50/` → видны `en`, `ru`, `ua`, …

---

## Шаг 2: Агрегация (сбор в JSON)

```bash
pnpm aggregate input/business50
```

Создаётся `input/business50/localization.json` со всеми ключами и переводами; отсутствующие значения — `null`.

---

## Шаг 3: Заполнение пробелов (опционально)

Скопировать существующие переводы в пустые ячейки:

```bash
pnpm fill-gaps input/business50/localization.json input/business50
```

Файл `localization.json` обновится; лог — в `logs/`. Ключи без перевода (все null или один пробел) нормализуются в один пробел во всех языках — см. [NORMALIZATION-RULES.md](NORMALIZATION-RULES.md).

---

## Шаг 4: Перевод

Заполнение оставшихся `null`.

**Локальная модель (Qwen/MLX) — рекомендуется:**

```bash
./restart-translation.sh
```

Останавливает старые процессы, проверяет `.env` (в т.ч. `ENABLE_MODEL_THINKING=false`), запускает перевод для `input/business50/localization.json`.

**Локальная модель с другим файлом:**

```bash
./run_translation.sh output/business50/localization.json
```

**API (OpenAI и др.):** настройте `.env` (OPENAI_API_KEY), затем:

```bash
TRANSLATION_BACKEND=api pnpm translate input/business50/localization.json --required=ru,en,ua
```

---

## Шаг 5: Восстановление в файлы

```bash
pnpm restore input/business50/localization.json output/business50
```

В `output/business50/` появятся каталоги `en/`, `ru/`, `ua/` с полной структурой PHP.

---

## Шаг 6: Создание архивов

```bash
pnpm create-archives output/business50
```

В той же папке появятся `file-en.tar.gz`, `file-ru.tar.gz`, `file-ua.tar.gz` и т.д.

---

## Шаг 7: Загрузка в Bitrix24

В интерфейсе Bitrix24 (Языковые файлы / сбор переводов) загрузите каждый `file-<lang>.tar.gz` для нужного языка.

---

## Сводная схема

```
Распаковка (file-*.tar.gz → input/.../en/, ru/, ua/)
    → Агрегация (pnpm aggregate)
    → [опционально] fill-gaps
    → Перевод (restart-translation.sh / run_translation.sh или pnpm translate)
    → Восстановление (pnpm restore)
    → Архивы (pnpm create-archives)
    → Загрузка в Bitrix24
```

---

## Дополнительно

### merge-aggregate (если есть полный JSON)

Если есть готовый `localization-full.json` и вы добавили только новые распакованные архивы:

```bash
pnpm merge-aggregate input/business50 input/business50/localization-full.json input/business50/localization_pre.json
pnpm fill-gaps input/business50/localization_pre.json input/business50
# Дальше используйте localization_pre.json в translate и restore
```

### Валидация JSON

```bash
pnpm exec tsx scripts/validate_json.ts input/business50/localization.json
```

### Языки и backend

- Языки по умолчанию и список: см. `src/utils.ts` (ALLOWED_LANGUAGES).
- Backend перевода: в `.env` задаётся `TRANSLATION_BACKEND=local-server` или `api`.

Подробный пошаговый процесс с командами: **[FULL-PROCESS.md](FULL-PROCESS.md)**.

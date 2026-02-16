# Бизнес-клуб МГУ — мультистраничный сайт (v2)

Это расширение исходного одностраничного лендинга до нескольких страниц:

- `index.html` — главная (точка входа): лендинг + блок **Команда** + блок **Партнёры**.
- `events.html` — **Архив мероприятий** (подтягивается из `assets/data/events.json`).
- `forums.html` — **Бизнес-форумы МГУ по годам** (данные из `assets/data/forum-stats.json`).

## Структура проекта

- `assets/css/styles.css` — общий стиль для всех страниц (адаптив + доступность).
- `assets/js/main.js` — общий JS (меню, формы, язык, фиксы, автопрокрутка команды).
- `assets/js/events-page.js` — JS только для `events.html`.
- `assets/js/forums-page.js` — JS только для `forums.html`.
- `assets/data/events.json` — база мероприятий (JSON).
- `assets/data/forum-stats.json` — данные по форумам (JSON).
- `assets/img/*` — изображения (в этой версии есть **заглушки**; замените на реальные).

## Как запускать локально (важно)

Чтобы `fetch()` мог читать JSON-файлы, открывайте сайт через локальный сервер:

```bash
python -m http.server 8000
```

После этого:
- Главная: `http://localhost:8000/index.html`
- Архив: `http://localhost:8000/events.html`
- Форумы: `http://localhost:8000/forums.html`

## Обновление архива мероприятий из Telegram

В репозитории лежит парсер: `tools/parser.py` (без дополнительных зависимостей сайта).
Он скачивает публичные посты канала и собирает `events.json`.

Перед запуском установите зависимости парсера:

```bash
pip install requests beautifulsoup4
```

Пример запуска:

```bash
python tools/parser.py --channel bcmsu --max-posts 120 --out assets/data/events.json
```

> На хостинге сайт остаётся статическим — вы просто обновляете `assets/data/events.json` по мере надобности.

## Обновление статистики форумов

Файл `assets/data/forum-stats.json` — простая таблица по годам.

Поля на строку:
- `year`
- `participants`
- `applications`
- `speakers`
- `speaker_capital_bln_rub`
- `partners`
- `notes` (опционально)

Замените демонстрационные цифры на реальные — страница обновится автоматически.

## Примечание по Google Translate

Переключатель языка работает через Google Translate. В `styles.css` + `main.js` добавлен фикс,
который пытается скрыть верхнюю панель/баннер перевода, чтобы он не перекрывал меню.

Если у вас всплывает панель не от сайта, а от расширения браузера — её скрыть невозможно.

# Бизнес-клуб МГУ — бережная миграция на Next.js

Проект переведён на **Next.js** без изменения текущего визуала и клиентской логики.
Основные HTML/CSS/JS-файлы сохранены как есть и теперь отдаются как статические страницы через Next.

## Что осталось неизменным

- Весь визуал и разметка в `public/index.html`, `public/events.html`, `public/forums.html`.
- Общие стили и скрипты: `public/assets/css/styles.css`, `public/assets/js/*`.
- Интеграция архива мероприятий из файла: `public/assets/data/events.json` (через `fetch("assets/data/events.json")`).

## Маршруты

Через `next.config.mjs` настроены rewrite-маршруты:

- `/` → `public/index.html`
- `/events` → `public/events.html`
- `/forums` → `public/forums.html`

Также прямые URL `/index.html`, `/events.html`, `/forums.html` продолжают работать.

## Запуск

```bash
npm install
npm run dev
```

Откройте:

- `http://localhost:3000/`
- `http://localhost:3000/events`
- `http://localhost:3000/forums`

## Сборка

```bash
npm run build
npm run start
```

## Обновление архива мероприятий

Парсер сохранён без изменений: `tools/parser.py`.

Пример обновления JSON:

```bash
python tools/parser.py --channel bcmsu --max-posts 120 --out public/assets/data/events.json
```

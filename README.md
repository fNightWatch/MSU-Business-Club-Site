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

## Быстрый запуск (пошагово)

### 1) Проверить версии Node.js и npm

```bash
node -v
npm -v
```

Рекомендуется **Node.js 18+** (лучше 20 LTS).

### 2) Установить зависимости

```bash
npm install
```

### 3) Запустить dev-сервер

```bash
npm run dev
```

Откройте:

- `http://localhost:3000/`
- `http://localhost:3000/events`
- `http://localhost:3000/forums`

---

## Если не запускается (`next: not found`)

Если после `npm run dev` видно ошибку вида `sh: 1: next: not found`, значит пакет `next` не установился локально.

Сделайте в корне проекта:

```bash
rm -rf node_modules package-lock.json
npm install
npm ls next
npm run dev
```

Если всё ещё не запускается, выполните точечную установку:

```bash
npm install next react react-dom
npm run dev
```

Если порт `3000` занят:

```bash
npm run dev -- -p 3001
```

---

## Сборка production

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

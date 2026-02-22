# Бизнес-клуб МГУ — миграция на Next.js

## Что осталось неизменным

- Весь визуал и разметка
- Общие стили и скрипты
- Интеграция архива мероприятий из файла: `public/assets/data/events.json`

## Запуск

```bash
npm install
npm run dev
```

- `http://localhost:3000/`

## Обновление архива мероприятий

Пример обновления JSON:

```bash
python tools/parser.py --channel bcmsu --max-posts 120 --out public/assets/data/events.json
```

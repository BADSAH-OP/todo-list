# Turbo To-Do Full (Enhanced)

Full-stack To-Do app with reminders, SSE, SQLite, and nice UI.

## Run locally
1. unzip, then:
```
cd turbo-todo-full
npm install
npm start
```
2. Open http://localhost:3000

## Notes
- Reminders use Server-Sent Events (SSE). Server polls DB every 20s.
- No external libs on frontend; purely vanilla JS/CSS/HTML.

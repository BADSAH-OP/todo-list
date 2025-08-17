import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDb } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// SSE clients
const clients = new Set();
app.get('/api/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  });
  res.write('retry: 5000\n\n');
  clients.add(res);
  req.on('close', () => clients.delete(res));
});

function broadcast(event, data){
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for(const c of clients){
    try { c.write(payload); } catch {}
  }
}

// API endpoints
app.get('/api/tasks', async (req, res) => {
  const db = await getDb();
  const { search='', status='all', priority='all', sort='created_desc' } = req.query;
  let where=[]; let params=[];
  if(status==='open') where.push('done=0');
  if(status==='completed') where.push('done=1');
  if(['low','medium','high'].includes(priority)) { where.push('priority=?'); params.push(priority); }
  if(search) { where.push('(title LIKE ? OR notes LIKE ? OR tags LIKE ?)'); params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
  let orderBy='created_at DESC';
  if(sort==='due_asc') orderBy="CASE WHEN due_at IS NULL THEN 1 ELSE 0 END, due_at ASC";
  if(sort==='due_desc') orderBy="CASE WHEN due_at IS NULL THEN 1 ELSE 0 END, due_at DESC";
  if(sort==='priority_desc') orderBy="CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END";
  if(sort==='priority_asc') orderBy="CASE priority WHEN 'low' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END";
  const sql = `SELECT * FROM tasks ${where.length ? 'WHERE '+where.join(' AND ') : ''} ORDER BY ${orderBy}`;
  const rows = await db.allAsync(sql, params);
  res.json(rows);
});

app.post('/api/tasks', async (req, res) => {
  const db = await getDb();
  const { title, notes='', priority='medium', tags='', due_date=null, due_time=null, remind_ahead_minutes=0 } = req.body || {};
  if(!title) return res.status(400).json({error:'title required'});
  const due_at = (due_date && due_time) ? `${due_date}T${due_time}:00` : (due_date ? `${due_date}T23:59:00` : null);
  const stmt = await db.runAsync(`INSERT INTO tasks (title,notes,priority,tags,due_date,due_time,due_at,remind_ahead_minutes,notify,done,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,0,0,datetime('now'),datetime('now'))`, [title.trim(), notes.trim(), priority, String(tags), due_date, due_time, due_at, Number(remind_ahead_minutes) || 0]);
  const task = await db.getAsync('SELECT * FROM tasks WHERE id=?', [stmt.lastID]);
  res.status(201).json(task);
  broadcast('task_created', task);
});

app.put('/api/tasks/:id', async (req, res) => {
  const db = await getDb();
  const id = Number(req.params.id);
  const existing = await db.getAsync('SELECT * FROM tasks WHERE id=?', [id]);
  if(!existing) return res.status(404).json({error:'not found'});
  const { title=existing.title, notes=existing.notes, priority=existing.priority, tags=existing.tags, due_date=existing.due_date, due_time=existing.due_time, remind_ahead_minutes=existing.remind_ahead_minutes, done=existing.done } = req.body || {};
  const due_at = (due_date && due_time) ? `${due_date}T${due_time}:00` : (due_date ? `${due_date}T23:59:00` : null);
  await db.runAsync(`UPDATE tasks SET title=?,notes=?,priority=?,tags=?,due_date=?,due_time=?,due_at=?,remind_ahead_minutes=?,done=?,updated_at=datetime('now') WHERE id=?`, [title,notes,priority,String(tags),due_date,due_time,due_at,Number(remind_ahead_minutes)||0, done?1:0, id]);
  const task = await db.getAsync('SELECT * FROM tasks WHERE id=?', [id]);
  res.json(task);
  broadcast('task_updated', task);
});

app.delete('/api/tasks/:id', async (req, res) => {
  const db = await getDb();
  const id = Number(req.params.id);
  await db.runAsync('DELETE FROM tasks WHERE id=?', [id]);
  res.json({ok:true});
  broadcast('task_deleted', {id});
});

app.post('/api/tasks/clear-completed', async (req, res) => {
  const db = await getDb();
  await db.runAsync('DELETE FROM tasks WHERE done=1');
  res.json({ok:true});
  broadcast('cleared_completed', {});
});

// Reminder scheduler: runs every 20s, finds tasks needing notify and broadcasts reminders
setInterval(async () => {
  try {
    const db = await getDb();
    const now = new Date();
    const nowIso = now.toISOString().slice(0,19);
    const rows = await db.allAsync(`
      SELECT id, title, notes, due_at, remind_ahead_minutes FROM tasks
      WHERE done=0 AND due_at IS NOT NULL AND notify=0
        AND ( datetime(due_at, printf('-%d minutes', remind_ahead_minutes)) <= datetime(?) OR datetime(due_at) <= datetime(?) )
      ORDER BY due_at ASC
    `, [nowIso, nowIso]);
    for(const r of rows){
      await db.runAsync('UPDATE tasks SET notify=1 WHERE id=?', [r.id]);
      broadcast('reminder', r);
    }
  } catch(e){ }
}, 20000);

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, ()=> console.log(`Turbo To-Do Full running at http://localhost:${PORT}`));

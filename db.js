import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let dbInstance = null;

export async function getDb() {
  if (dbInstance) return dbInstance;
  const dbPath = path.join(__dirname, 'data.sqlite');
  const db = new sqlite3.Database(dbPath);
  db.runAsync = (sql, params=[]) => new Promise((res, rej) => {
    db.run(sql, params, function(err){ if(err) rej(err); else res(this); });
  });
  db.getAsync = (sql, params=[]) => new Promise((res, rej) => {
    db.get(sql, params, (err, row)=> { if(err) rej(err); else res(row); });
  });
  db.allAsync = (sql, params=[]) => new Promise((res, rej) => {
    db.all(sql, params, (err, rows)=> { if(err) rej(err); else res(rows); });
  });

  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      notes TEXT,
      priority TEXT CHECK(priority IN ('low','medium','high')) DEFAULT 'medium',
      tags TEXT,
      due_date TEXT,
      due_time TEXT,
      due_at TEXT,
      remind_ahead_minutes INTEGER DEFAULT 0,
      notify INTEGER DEFAULT 0,
      done INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT
    )
  `);

  dbInstance = db;
  return db;
}

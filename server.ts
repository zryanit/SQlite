import express from "express";
import { createServer as createViteServer } from "vite";
import multer from "multer";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `db-${Date.now()}.sqlite`);
  },
});

const upload = multer({ storage });

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  let currentDb: any = null;
  let currentDbPath: string | null = null;

  // API Routes
  app.post("/api/upload", upload.single("database"), (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    try {
      if (currentDb) {
        currentDb.close();
      }
      currentDbPath = req.file.path;
      currentDb = new Database(currentDbPath);
      res.json({ message: "Database uploaded successfully", filename: req.file.originalname });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/tables", (req, res) => {
    if (!currentDb) return res.status(400).json({ error: "No database loaded" });
    try {
      const tables = currentDb.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
      res.json(tables.map((t: any) => t.name));
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/data/:table", (req, res) => {
    if (!currentDb) return res.status(400).json({ error: "No database loaded" });
    const { table } = req.params;
    const { filter, column, limit = 100, offset = 0 } = req.query;

    try {
      let query = `SELECT * FROM "${table}"`;
      const params: any[] = [];

      if (filter && column) {
        query += ` WHERE "${column}" LIKE ?`;
        params.push(`%${filter}%`);
      }

      // Ensure stable ordering by rowid or primary key
      query += ` ORDER BY rowid ASC LIMIT ? OFFSET ?`;
      params.push(Number(limit), Number(offset));

      const rows = currentDb.prepare(query).all(...params);
      const columns = currentDb.prepare(`PRAGMA table_info("${table}")`).all();
      const total = currentDb.prepare(`SELECT COUNT(*) as count FROM "${table}" ${filter && column ? `WHERE "${column}" LIKE ?` : ""}`).get(filter && column ? `%${filter}%` : [])?.count || 0;
      
      res.json({ rows, columns, total });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/find-offset/:table", (req, res) => {
    if (!currentDb) return res.status(400).json({ error: "No database loaded" });
    const { table } = req.params;
    const { sura, aya } = req.query;

    try {
      const columns = currentDb.prepare(`PRAGMA table_info("${table}")`).all();
      const suraCol = columns.find((c: any) => c.name.toLowerCase().includes('sura'))?.name;
      const ayaCol = columns.find((c: any) => c.name.toLowerCase().includes('aya'))?.name;

      if (!suraCol || !ayaCol) {
        return res.status(400).json({ error: "Could not identify Surah/Ayat columns" });
      }

      // Calculate the number of rows before the target Surah/Ayat
      const query = `SELECT count(*) as offset FROM "${table}" WHERE CAST("${suraCol}" AS INTEGER) < ? OR (CAST("${suraCol}" AS INTEGER) = ? AND CAST("${ayaCol}" AS INTEGER) < ?)`;
      const result = currentDb.prepare(query).get(Number(sura), Number(sura), Number(aya));
      
      res.json({ offset: result.offset });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/update/:table", (req, res) => {
    if (!currentDb) return res.status(400).json({ error: "No database loaded" });
    const { table } = req.params;
    const { idColumn, idValue, updates } = req.body;

    try {
      const setClause = Object.keys(updates)
        .map((col) => `"${col}" = ?`)
        .join(", ");
      const values = [...Object.values(updates), idValue];

      const query = `UPDATE "${table}" SET ${setClause} WHERE "${idColumn}" = ?`;
      currentDb.prepare(query).run(...values);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/download", (req, res) => {
    if (!currentDbPath) return res.status(400).json({ error: "No database loaded" });
    res.download(currentDbPath, "modified_database.db");
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

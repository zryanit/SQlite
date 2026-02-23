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

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  let currentDb: any = null;
  let currentDbPath: string | null = null;

  // Increase limit for large databases
  const upload = multer({ 
    storage,
    limits: { fileSize: 100 * 1024 * 1024 } // 100MB
  });

  // Try to recover last database on startup
  try {
    const files = fs.readdirSync(uploadDir)
      .filter(f => f.startsWith('db-') && f.endsWith('.sqlite'))
      .sort((a, b) => {
        const timeA = parseInt(a.split('-')[1]);
        const timeB = parseInt(b.split('-')[1]);
        return timeB - timeA;
      });
    
    if (files.length > 0) {
      const latestFile = path.join(uploadDir, files[0]);
      console.log(`Recovering latest database: ${latestFile}`);
      currentDbPath = latestFile;
      currentDb = new Database(currentDbPath);
      currentDb.prepare("SELECT 1").get();
      console.log("Database recovered successfully");
    }
  } catch (err) {
    console.error("Failed to recover database on startup", err);
  }

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ 
      status: "ok", 
      dbLoaded: !!currentDb, 
      dbPath: currentDbPath ? path.basename(currentDbPath) : null,
      uploadDirExists: fs.existsSync(uploadDir)
    });
  });

  app.get("/api/debug", (req, res) => {
    try {
      const files = fs.readdirSync(uploadDir);
      res.json({
        uploadDir,
        files,
        currentDbPath,
        dbLoaded: !!currentDb
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/upload", upload.single("database"), (req, res) => {
    console.log("Upload request received");
    if (!req.file) {
      console.error("Upload failed: No file in request. Check if the field name is 'database'");
      return res.status(400).json({ error: "No file uploaded" });
    }

    try {
      const filePath = req.file.path;
      console.log(`Received file: ${req.file.originalname}, saved to: ${filePath}, size: ${req.file.size}`);
      
      if (!fs.existsSync(filePath)) {
        throw new Error("Uploaded file not found on disk after multer processed it");
      }

      if (currentDb) {
        console.log("Closing existing database connection");
        currentDb.close();
      }
      
      currentDbPath = filePath;
      console.log("Opening new database connection...");
      currentDb = new Database(currentDbPath);
      
      // Test the connection
      const testResult = currentDb.prepare("SELECT 1").get();
      console.log("Database connection test result:", testResult);
      
      res.json({ message: "Database uploaded successfully", filename: req.file.originalname });
    } catch (error: any) {
      console.error("Database initialization failed:", error);
      res.status(500).json({ error: `Database error: ${error.message}` });
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
      let query = `SELECT rowid as _rowid_, * FROM "${table}"`;
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

  // Global error handler
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error("Unhandled error:", err);
    res.status(err.status || 500).json({
      error: err.message || "An internal server error occurred",
      details: process.env.NODE_ENV !== "production" ? err.stack : undefined
    });
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

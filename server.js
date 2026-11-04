require("dotenv").config();

const express = require("express");
const path = require("path");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();
const PORT = process.env.PORT || 3000;

if (
  !process.env.JWT_SECRET ||
  process.env.JWT_SECRET.length < 32 ||
  process.env.JWT_SECRET === "replace_with_a_long_random_secret"
) {
  console.error("Set a secure JWT_SECRET of at least 32 characters in .env");
  process.exit(1);
}

// DATABASE CONNECTION
const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
});

// MIDDLEWARE
app.use(express.json({ limit: "10kb" }));
app.use(express.static(path.join(__dirname, "public")));

// INITIALIZE DATABASE
async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      title VARCHAR(150) NOT NULL,
      completed BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    ALTER TABLE tasks
    ADD COLUMN IF NOT EXISTS user_id INTEGER
    REFERENCES users(id)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_tasks_user_id
    ON tasks(user_id)
  `);

  console.log("PostgreSQL database connected successfully.");
  console.log("Users and tasks tables are ready.");
}

// GENERATE TOKEN
function generateToken(user) {
  return jwt.sign(
    {
      userId: user.id
    },
    process.env.JWT_SECRET,
    {
      expiresIn: "2h",
      algorithm: "HS256"
    }
  );
}

// AUTHENTICATION MIDDLEWARE
function authenticate(req, res, next) {
  const authorization = req.headers.authorization;

  if (!authorization || !authorization.startsWith("Bearer ")) {
    return res.status(401).json({
      message: "Please log in to continue."
    });
  }

  const token = authorization.slice(7);

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ["HS256"]
    });

    if (!Number.isSafeInteger(decoded.userId)) {
      return res.status(401).json({
        message: "Invalid authentication token."
      });
    }

    req.userId = decoded.userId;
    next();
  } catch (error) {
    return res.status(401).json({
      message: "Your session is invalid or has expired. Please log in again."
    });
  }
}

// REGISTER USER
app.post("/api/auth/register", async (req, res, next) => {
  try {
    const { name, email, password } = req.body || {};

    if (
      typeof name !== "string" ||
      !name.trim() ||
      name.trim().length > 100
    ) {
      return res.status(400).json({
        message: "Enter a valid name of up to 100 characters."
      });
    }

    if (
      typeof email !== "string" ||
      email.length > 255 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    ) {
      return res.status(400).json({
        message: "Enter a valid email address."
      });
    }

    if (
      typeof password !== "string" ||
      password.length < 8 ||
      Buffer.byteLength(password, "utf8") > 72
    ) {
      return res.status(400).json({
        message: "Password must be at least 8 characters and no more than 72 bytes."
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const passwordHash = await bcrypt.hash(password, 12);

    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, name, email`,
      [name.trim(), normalizedEmail, passwordHash]
    );

    const user = result.rows[0];

    res.status(201).json({
      message: "Account created successfully.",
      user,
      token: generateToken(user)
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({
        message: "An account with this email already exists."
      });
    }

    next(error);
  }
});

// LOGIN USER
app.post("/api/auth/login", async (req, res, next) => {
  try {
    const { email, password } = req.body || {};

    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      !email.trim() ||
      !password
    ) {
      return res.status(400).json({
        message: "Email and password are required."
      });
    }

    const result = await pool.query(
      `SELECT id, name, email, password_hash
       FROM users
       WHERE email = $1`,
      [email.trim().toLowerCase()]
    );

    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({
        message: "Invalid email or password."
      });
    }

    const passwordMatches = await bcrypt.compare(
      password,
      user.password_hash
    );

    if (!passwordMatches) {
      return res.status(401).json({
        message: "Invalid email or password."
      });
    }

    res.json({
      message: "Login successful.",
      user: {
        id: user.id,
        name: user.name,
        email: user.email
      },
      token: generateToken(user)
    });
  } catch (error) {
    next(error);
  }
});

// GET CURRENT USER
app.get("/api/auth/me", authenticate, async (req, res, next) => {
  try {
    const result = await pool.query(
      "SELECT id, name, email FROM users WHERE id = $1",
      [req.userId]
    );

    if (result.rowCount === 0) {
      return res.status(401).json({
        message: "User account not found."
      });
    }

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// GET USER TASKS
app.get("/api/tasks", authenticate, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, title, completed
       FROM tasks
       WHERE user_id = $1
       ORDER BY id DESC`,
      [req.userId]
    );

    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

// CREATE TASK
app.post("/api/tasks", authenticate, async (req, res, next) => {
  try {
    const { title } = req.body || {};

    if (
      typeof title !== "string" ||
      !title.trim() ||
      title.trim().length > 150
    ) {
      return res.status(400).json({
        message: "Task title must contain between 1 and 150 characters."
      });
    }

    const result = await pool.query(
      `INSERT INTO tasks (title, user_id)
       VALUES ($1, $2)
       RETURNING id, title, completed`,
      [title.trim(), req.userId]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// UPDATE TASK
app.put("/api/tasks/:id", authenticate, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { title, completed } = req.body || {};

    if (!Number.isSafeInteger(id) || id < 1) {
      return res.status(400).json({
        message: "Invalid task ID."
      });
    }

    if (title === undefined && completed === undefined) {
      return res.status(400).json({
        message: "Provide a title or completion status."
      });
    }

    if (
      title !== undefined &&
      (
        typeof title !== "string" ||
        !title.trim() ||
        title.trim().length > 150
      )
    ) {
      return res.status(400).json({
        message: "Task title must contain between 1 and 150 characters."
      });
    }

    if (
      completed !== undefined &&
      typeof completed !== "boolean"
    ) {
      return res.status(400).json({
        message: "Completed must be true or false."
      });
    }

    const result = await pool.query(
      `UPDATE tasks
       SET title = COALESCE($1, title),
           completed = COALESCE($2, completed)
       WHERE id = $3 AND user_id = $4
       RETURNING id, title, completed`,
      [
        title === undefined ? null : title.trim(),
        completed === undefined ? null : completed,
        id,
        req.userId
      ]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        message: "Task not found."
      });
    }

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// DELETE TASK
app.delete("/api/tasks/:id", authenticate, async (req, res, next) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isSafeInteger(id) || id < 1) {
      return res.status(400).json({
        message: "Invalid task ID."
      });
    }

    const result = await pool.query(
      `DELETE FROM tasks
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [id, req.userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        message: "Task not found."
      });
    }

    res.json({
      message: "Task deleted successfully."
    });
  } catch (error) {
    next(error);
  }
});

// UNKNOWN API ROUTES
app.use("/api", (req, res) => {
  res.status(404).json({
    message: "API endpoint not found."
  });
});

// ERROR HANDLING
app.use((error, req, res, next) => {
  console.error("Server error:", error.message);

  res.status(500).json({
    message: "An internal server error occurred."
  });
});

// START SERVER
async function startServer() {
  try {
    await initializeDatabase();

    app.listen(PORT, () => {
      console.log("--------------------------------");
      console.log("TaskFlow Server Started");
      console.log(`http://localhost:${PORT}`);
      console.log("Authentication and PostgreSQL ready");
      console.log("--------------------------------");
    });
  } catch (error) {
    console.error("Database initialization failed:", error.message);
    process.exit(1);
  }
}

startServer();
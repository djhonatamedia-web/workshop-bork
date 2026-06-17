CREATE TABLE IF NOT EXISTS quiz_responses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT,
    path TEXT NOT NULL,
    answers TEXT NOT NULL,
    name TEXT,
    phone TEXT,
    created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_quiz_responses_created ON quiz_responses(created_at);
CREATE INDEX IF NOT EXISTS idx_quiz_responses_path ON quiz_responses(path);

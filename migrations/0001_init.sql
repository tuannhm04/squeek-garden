-- Squeek Garden server. Scores are only ever written by the server from its own copy of each garden.
CREATE TABLE users (
  address    TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);

CREATE TABLE nonces (
  nonce      TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  address    TEXT NOT NULL REFERENCES users(address),
  expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_address ON sessions(address);

CREATE TABLE gardens (
  address    TEXT PRIMARY KEY REFERENCES users(address),
  state      TEXT NOT NULL,
  rev        INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE game_actions (
  address TEXT NOT NULL,
  id      TEXT NOT NULL,
  action  TEXT NOT NULL,
  round   INTEGER NOT NULL,
  at      INTEGER NOT NULL,
  PRIMARY KEY (address, id)
);

CREATE TABLE settlement_rounds (
  round    INTEGER PRIMARY KEY,
  work     INTEGER,
  verified INTEGER NOT NULL,
  batch    TEXT
);

CREATE TABLE weekly_scores (
  board    TEXT NOT NULL CHECK (board IN ('live', 'practice')),
  season   INTEGER NOT NULL,
  address  TEXT NOT NULL,
  score    INTEGER NOT NULL,
  harvests INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (board, season, address)
);
CREATE INDEX weekly_scores_rank ON weekly_scores(board, season, score DESC, updated_at ASC);

CREATE TABLE meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE rate_limits (
  key    TEXT PRIMARY KEY,
  window INTEGER NOT NULL,
  count  INTEGER NOT NULL
);

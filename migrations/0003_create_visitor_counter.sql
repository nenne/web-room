CREATE TABLE visitor_counter (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  count INTEGER NOT NULL DEFAULT 0
);

INSERT INTO visitor_counter (id, count)
VALUES (1, 0);
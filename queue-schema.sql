CREATE TABLE tickets (
 id SERIAL PRIMARY KEY,
 device TEXT UNIQUE,
 kind TEXT NOT NULL CHECK (kind IN ('basic','complex')),
 status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','called','serving','done','missed')),
 created BIGINT NOT NULL,
 called BIGINT,
 started BIGINT,
 finished BIGINT,
 code TEXT UNIQUE
);

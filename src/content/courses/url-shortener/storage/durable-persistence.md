---
title: "Durable Persistence"
order: 2
description: "Hand durable storage to SQLite behind the same Store interface: a parameterised INSERT, a PRIMARY KEY that makes collisions impossible, and a restart that just works — the one dependency this course takes on purpose."
---

## Where We Stop Building

Everything else in this course we build by hand, on purpose — the encoder, the Repository, the cache that's coming next, the rate limiter, the worker pool. We build them because *building them is the lesson*: each one turns out to be a pattern, and you only really learn the pattern by writing it.

Durable storage is the one place we draw the line the other way. Crash-safety, concurrent writers, indexed lookups, a file that doesn't grow forever — those are **commodity problems**, solved better by a battle-tested embedded database than by anything we'd hand-roll in an afternoon. Reinventing them would teach you file plumbing, not design. So here we reach for a dependency, deliberately, and the skill on display is knowing *where that line sits*: build the parts that make you understand the system; buy the parts that are someone else's solved problem.

The tool is **SQLite** — a full relational database that lives in a single file, with no server to run. And we reach for it without disturbing anything upstream, because storage already hides behind the `Store` interface. Swap the implementation, and `Service` and the handlers never notice:

- **Reads** become a `SELECT` against an indexed primary key.
- **Writes** become an `INSERT` the database commits durably.
- **Startup** opens a file SQLite already knows how to recover.

The interface is the whole reason this is a drop-in. Pick the database, satisfy the same three methods, and the decision stays reversible.

## One Dependency, Chosen Deliberately

Go's standard library gives us `database/sql` — the generic interface to *any* SQL database — but not a driver for a specific one. The driver is the dependency, and we choose it on purpose:

```go
import (
	"database/sql"

	_ "modernc.org/sqlite" // registers the "sqlite" driver
)
```

We use **`modernc.org/sqlite`**: a pure-Go SQLite, no cgo. That choice is load-bearing. Because it needs no C compiler, the service still builds with `CGO_ENABLED=0` into a single static binary on a distroless image — the deployment story we keep in the final chapter survives intact. (The classic alternative, `mattn/go-sqlite3`, is faster but uses cgo, which forfeits the static binary.) The blank import runs the driver's `init`, which registers it under the name `"sqlite"`; from then on the code talks only to `database/sql`, and the driver could be swapped for Postgres with a different import and DSN.

## The Schema

One table, and the design hangs on one column:

```sql
CREATE TABLE IF NOT EXISTS links (
	code       TEXT    PRIMARY KEY,
	url        TEXT    NOT NULL,
	created_at INTEGER NOT NULL  -- unix seconds
);
```

`code` is the **PRIMARY KEY**, and that single word does two jobs the in-memory store needed hand-written code for. It builds the index that makes `Find` fast, and it makes "two links can never share a code" a *database invariant* — enforced atomically on every insert, with no application-level lock in sight. Hold that thought; it's about to delete a whole section of the last chapter. `created_at` is stored as a Unix timestamp (a plain integer) rather than a formatted string — smaller, unambiguous, and trivial to convert back to a `time.Time`.

## Opening the Store

Opening means connecting, ensuring the schema exists, and restoring the sequence counter:

```go
package shortener

import (
	"database/sql"
	"sync/atomic"

	_ "modernc.org/sqlite"
)

// SQLiteStore is a durable Repository backed by a single SQLite file.
// *sql.DB is a concurrency-safe connection pool, so no mutex is needed.
type SQLiteStore struct {
	db  *sql.DB
	seq atomic.Uint64
}

var _ Store = (*SQLiteStore)(nil)

// OpenSQLiteStore opens (or creates) the database at path and prepares it.
func OpenSQLiteStore(path string) (*SQLiteStore, error) {
	// WAL lets readers and a writer proceed at once; busy_timeout makes a
	// contended writer wait briefly instead of failing "database is locked".
	dsn := "file:" + path + "?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)"
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, err
	}
	if _, err := db.Exec(`CREATE TABLE IF NOT EXISTS links (
		code       TEXT    PRIMARY KEY,
		url        TEXT    NOT NULL,
		created_at INTEGER NOT NULL
	)`); err != nil {
		db.Close()
		return nil, err
	}
	s := &SQLiteStore{db: db}
	if err := s.loadSeq(); err != nil {
		db.Close()
		return nil, err
	}
	return s, nil
}

// loadSeq restores the counter so codes keep climbing after a restart.
func (s *SQLiteStore) loadSeq() error {
	var count uint64
	if err := s.db.QueryRow(`SELECT COUNT(*) FROM links`).Scan(&count); err != nil {
		return err
	}
	s.seq.Store(count)
	return nil
}

func (s *SQLiteStore) Close() error { return s.db.Close() }
```

Two details separate a toy from a real one — the same kind of details the in-memory store needed, just moved into SQL. The **pragmas** matter: `journal_mode(WAL)` switches SQLite to a write-ahead log so a redirect reading the database isn't blocked by a write, and `busy_timeout(5000)` tells a writer that hits contention to wait up to five seconds rather than immediately return `SQLITE_BUSY`. Skip them and a concurrent shortener will, under load, start failing reads and writes that should simply have waited.

And restoring `seq` matters for the same reason it did before: without it, a restart resets the counter to zero and the [sequential generator](/go/patterns/behavioral/strategy) re-issues codes it already handed out. Counting the rows works because we never delete — the row count equals the high-water sequence number. That's the one constraint worth stating out loud; the day a delete feature lands, this becomes a `MAX(seq)` over a dedicated column instead.

## Saving Without a Race

Here's where the PRIMARY KEY earns its keep. The in-memory store needed a write lock around a check-then-insert, precisely to stop two goroutines from claiming the same code in the gap between "is it free?" and "take it." SQLite makes that gap impossible:

```go
func (s *SQLiteStore) Save(link Link) error {
	res, err := s.db.Exec(
		`INSERT INTO links (code, url, created_at) VALUES (?, ?, ?)
		 ON CONFLICT(code) DO NOTHING`,
		link.Code, link.URL, link.CreatedAt.Unix(),
	)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrCodeExists // the PRIMARY KEY rejected a duplicate code
	}
	return nil
}
```

`ON CONFLICT(code) DO NOTHING` makes the insert atomic: either the row is new and gets written, or the code already exists and nothing happens — and `RowsAffected() == 0` is how we tell which, mapping a collision back to the `ErrCodeExists` the `Service` already knows how to retry on. No mutex, no time-of-check-to-time-of-use window, because the *database* serialises the decision. The whole "claim it under one lock" section from the in-memory chapter is gone, replaced by a constraint the database enforces for us.

The `?` placeholders are not a style choice. They are **parameterised queries**: the values travel to the driver separately from the SQL text, so a URL containing `'); DROP TABLE links;--` is stored as data, never executed as SQL. Building queries with string concatenation is how injection bugs are born; with `database/sql` the safe path is also the easy one.

## Reading

`Find` is a single indexed lookup, and the only subtlety is translating SQL's "no rows" into our sentinel error:

```go
func (s *SQLiteStore) Find(code string) (Link, error) {
	var (
		url     string
		created int64
	)
	err := s.db.
		QueryRow(`SELECT url, created_at FROM links WHERE code = ?`, code).
		Scan(&url, &created)
	if errors.Is(err, sql.ErrNoRows) {
		return Link{}, ErrNotFound // not "an error" to the caller — just a miss
	}
	if err != nil {
		return Link{}, err
	}
	return Link{Code: code, URL: url, CreatedAt: time.Unix(created, 0)}, nil
}

func (s *SQLiteStore) Next() uint64 { return s.seq.Add(1) }
```

`QueryRow(...).Scan(...)` returns `sql.ErrNoRows` when nothing matched; we map it to `ErrNotFound` so callers branch on *our* contract, not the driver's. `Next` stays exactly what it was in memory — a lock-free atomic increment — because handing out sequence numbers never needed the database.

## Proving It Survives

The test that mattered before still matters, and it reads identically — write, close, reopen, find — because the *interface* didn't change. Only now it passes because SQLite persisted the row, not because we replayed a log by hand:

```go
func TestSQLiteStoreSurvivesRestart(t *testing.T) {
	path := filepath.Join(t.TempDir(), "links.db")

	s1, err := OpenSQLiteStore(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := s1.Save(Link{Code: "abc", URL: "https://example.com"}); err != nil {
		t.Fatal(err)
	}
	s1.Close() // simulate shutdown

	s2, err := OpenSQLiteStore(path) // "restart"
	if err != nil {
		t.Fatal(err)
	}
	defer s2.Close()
	got, err := s2.Find("abc")
	if err != nil || got.URL != "https://example.com" {
		t.Fatalf("after restart: got %+v, err %v", got, err)
	}
}
```

`t.TempDir()` gives a directory the test framework cleans up automatically — database file, WAL sidecars, and all.

## What We Bought, and What We Didn't

Reaching for SQLite is a trade, and it's worth naming both sides honestly.

What we **bought**, none of which we'd want to hand-write:

- **Crash recovery.** WAL plus atomic commits mean a power cut mid-write leaves a consistent database — the exact failure the hand-rolled `fsync` dance existed to fight, now handled by code that has been tested by millions of deployments.
- **Concurrency for free.** `*sql.DB` is a connection pool and the PRIMARY KEY is an atomic guard, so the mutex *and* the check-then-insert race from the in-memory store both vanished.
- **No unbounded growth.** SQLite manages its own file and reclaims space with `VACUUM`; the "the log only grows forever, you'll need compaction" caveat from a hand-rolled file is simply not ours to carry.
- **Indexed reads and real queries.** Lookups hit a B-tree, and "most-clicked links this week" is a `SELECT` away when we want analytics — not a full scan of a map.

What it **cost**:

- **One dependency.** It lands in `go.mod`, it's a thing to keep patched — the real price of not reinventing a database. We paid it deliberately, and we chose the pure-Go driver so the static-binary build still holds.
- **Still one node.** SQLite is a file on one disk. It survives a *restart* and you can back it up, but it isn't replicated across machines. When one node genuinely isn't enough, the same `Store` interface accepts a networked database — point a Postgres implementation at it and nothing above storage changes. That's the next rung, reached only when you can name why you need it ([YAGNI](/go/philosophy/yagni)).

This is the build-versus-buy judgment in miniature: we built everything the patterns live inside, and bought the one layer where a dependency is plainly the right answer. [Keep it simple](/go/philosophy/kiss) cuts both ways — sometimes the simple thing is to stop building.

## What's Next

Storage is durable, but the trade has a tail: every `Find` is now a query that crosses into the database, where the in-memory map answered from RAM. For the redirect path — the hottest path in the whole service — that's exactly the moment a small, bounded cache of the *hot* links earns its place out front. That cache is a `Store` that wraps a `Store` — the [Decorator pattern](/go/patterns/structural/decorator) — and it's next.

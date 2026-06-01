---
title: "Durable Persistence"
order: 2
description: "Survive a restart with an append-only log: write each link to disk, replay the file on startup, and keep the fast in-memory index — no database driver required."
---

## No Database, On Purpose

The obvious next move is "add Postgres." We're not going to — and not only because a driver is a third-party dependency we've sworn off. Reaching for a database here would skip the lesson. Durability isn't magic the database sprinkles on; it's a specific, simple technique: **write every change to an append-only log, and replay the log on startup.** That's the core of how databases themselves stay durable, and you can build the essential version in about forty lines of standard library.

The design keeps everything good about `MemoryStore` and adds persistence around it:

- **Reads** stay in memory — a redirect never touches the disk.
- **Writes** append one line to a file, then update the in-memory index.
- **Startup** replays the file to rebuild the index exactly as it was.

The file is the source of truth; the map is a fast in-memory projection of it. (If that phrasing rings a bell, it's the same instinct behind [Event Sourcing](/go/patterns/architectural/event-sourcing) — the log of what happened is canonical, and current state is derived by replaying it.)

## The Record Format: JSON Lines

Each link becomes one JSON object on its own line. JSON Lines is the pragmatic choice: human-readable for debugging, trivially appendable, and `encoding/json` is in the standard library. One link, one line.

```go
package shortener

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"sync"
)

// FileStore is a durable Repository. Links are appended to a JSON-lines
// log for durability and mirrored in an in-memory index for fast reads.
// The log is canonical; the index is rebuilt from it on startup.
type FileStore struct {
	mu  sync.Mutex
	f   *os.File
	mem *MemoryStore // the in-memory projection, reused wholesale
}

var _ Store = (*FileStore)(nil)
```

Notice `FileStore` *embeds the work of* `MemoryStore` by holding one. We don't reimplement the concurrent map — we reuse the Repository we already trust for the read path and the sequence counter, and add only the durability concern on top. Composition over reinvention.

## Opening and Replaying

Opening a `FileStore` means opening the file and replaying every record into a fresh index:

```go
// OpenFileStore opens (or creates) the log at path and rebuilds the index.
func OpenFileStore(path string) (*FileStore, error) {
	f, err := os.OpenFile(path, os.O_RDWR|os.O_CREATE|os.O_APPEND, 0o644)
	if err != nil {
		return nil, err
	}
	s := &FileStore{f: f, mem: NewMemoryStore()}
	if err := s.replay(); err != nil {
		f.Close()
		return nil, fmt.Errorf("replay %s: %w", path, err)
	}
	return s, nil
}

// replay reads the whole log from the top, rebuilding the index and
// restoring the sequence counter so codes keep climbing after a restart.
func (s *FileStore) replay() error {
	if _, err := s.f.Seek(0, io.SeekStart); err != nil {
		return err
	}
	sc := bufio.NewScanner(s.f)
	sc.Buffer(make([]byte, 0, 64*1024), 1024*1024) // allow long URLs
	var count uint64
	for sc.Scan() {
		var link Link
		if err := json.Unmarshal(sc.Bytes(), &link); err != nil {
			return fmt.Errorf("corrupt record: %w", err)
		}
		s.mem.links[link.Code] = link // single-threaded at startup; no lock needed
		count++
	}
	if err := sc.Err(); err != nil {
		return err
	}
	s.mem.seq.Store(count) // resume the sequence where the log left off
	_, err := s.f.Seek(0, io.SeekEnd) // append after the existing records
	return err
}

func (s *FileStore) Close() error { return s.f.Close() }
```

Two details that separate a toy from a real one. The scanner's buffer is raised to 1 MB because the default caps a line at 64 KB and URLs can be long — hit that limit and replay silently stops mid-file. And restoring `seq` matters: without `s.mem.seq.Store(count)`, a restart would reset the counter to zero and the [sequential generator](/go/patterns/behavioral/strategy) would start re-issuing codes it already gave out. (This restore assumes links are never deleted, so the record count equals the high-water sequence number — true for our append-only design, and a constraint worth stating out loud.)

## Writing Durably

`Save` is where durability is actually earned, and the *order of operations* is the whole ballgame:

```go
func (s *FileStore) Save(link Link) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, err := s.mem.Find(link.Code); err == nil {
		return ErrCodeExists // reject duplicates before touching the disk
	}
	if err := s.appendRecord(link); err != nil {
		return err // disk write failed: index stays clean, caller sees the error
	}
	return s.mem.Save(link) // durable on disk first, then visible in memory
}

// appendRecord writes one JSON line and flushes it to the physical disk.
func (s *FileStore) appendRecord(link Link) error {
	line, err := json.Marshal(link)
	if err != nil {
		return err
	}
	if _, err := s.f.Write(append(line, '\n')); err != nil {
		return err
	}
	return s.f.Sync() // fsync: without this, a crash can lose "written" data
}
```

We append to the log **before** updating the index. If the disk write fails, the in-memory map never learns about a link the disk doesn't have — memory and disk can't disagree in the dangerous direction. And `s.f.Sync()` is the line that makes "durable" true: a plain `Write` only hands bytes to the operating system's page cache, which may sit in RAM for seconds before reaching the platter. `Sync` forces them down. Skip it and a power cut between write and flush loses links the user was told were saved — the exact failure durability exists to prevent.

Reads and the counter just delegate to the in-memory projection — no disk access, same speed as `MemoryStore`:

```go
func (s *FileStore) Find(code string) (Link, error) { return s.mem.Find(code) }
func (s *FileStore) Next() uint64                    { return s.mem.Next() }
```

## Proving It Survives

The test that matters writes, closes, reopens, and checks the link is still there — simulating a restart:

```go
func TestFileStoreSurvivesRestart(t *testing.T) {
	path := filepath.Join(t.TempDir(), "links.log")

	s1, err := OpenFileStore(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := s1.Save(Link{Code: "abc", URL: "https://example.com"}); err != nil {
		t.Fatal(err)
	}
	s1.Close() // simulate shutdown

	s2, err := OpenFileStore(path) // "restart"
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

`t.TempDir()` gives a directory the test framework cleans up automatically — no stray files, no manual teardown.

## Tradeoffs: What a Real Database Would Add

This is honest, durable storage — and it has real limits we should name rather than hide:

- **The log only grows.** Every `Save` appends; nothing is reclaimed. A long-running service needs **compaction** — periodically rewriting the log with only the live records. With no deletes, ours grows slowly, but "grows forever" is a property to design away before production, not after.
- **`fsync` on every write is slow.** Forcing a flush per `Save` caps write throughput at the disk's sync rate. Fine for a shortener (writes are rare); fatal for a write-heavy service, which would batch many records per flush and accept a tiny durability window.
- **One file, one process.** No replication, no concurrent writers from another process, no point-in-time recovery. This is single-node durability — it survives a *restart*, not a *disk failure*.

These aren't reasons the approach is wrong; they're the precise list of things a database buys you, now understandable because you've built the layer underneath. [Keep it simple](/go/philosophy/kiss) until one of those limits actually bites — and when one does, you'll know exactly which feature you're paying a dependency for.

## What's Next

Storage is durable, and reads are already fast because they hit the in-memory index. But there's a subtler performance story coming: when we have *millions* of links, holding every one in memory is wasteful, and we'll want a bounded cache of just the hot ones in front of a leaner store. That cache is a `Store` that wraps a `Store` — the [Decorator pattern](/go/patterns/structural/decorator) — and it's next.

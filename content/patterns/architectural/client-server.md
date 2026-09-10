---
title: "Client-Server Multiplayer"
description: "Run the simulation on an authoritative server that validates every @rpc input, replicate state down with MultiplayerSpawner and MultiplayerSynchronizer, and let clients predict and reconcile to hide latency."
---

# Client-Server Multiplayer

**Buys an authoritative simulation clients cannot cheat; pays the distributed-systems tax from day one — latency, prediction, and state that is eventually consistent.**

In a client-server game one peer — the server — owns the truth. Clients do not move their character; they *ask* to move, the server decides what happened, and the result comes back. Every rule that matters (position, health, who hit whom, who picked up what) runs in one place, on a machine the players do not control. Godot's high-level multiplayer gives you the pieces: `@rpc` for requests and results, `MultiplayerSpawner` to replicate scene instantiation, `MultiplayerSynchronizer` to replicate properties, and `set_multiplayer_authority` to say who owns what.

The guarantee is cheat resistance and consistency: there is no client-side state a modified build can lie about, because the server never trusts client state, only client *input*. The price is that every player is now some tens of milliseconds behind the truth, and the code that hides that — prediction, reconciliation, interpolation — is a second game engine you write alongside the first.

## Scenario

A co-op game where each client moves itself and tells everyone where it ended up:

```gdscript:title="res://player/player.gd"
extends CharacterBody2D

@export var speed: float = 200.0

func _physics_process(_delta: float) -> void:
	if is_multiplayer_authority():
		velocity = Input.get_vector("left", "right", "up", "down") * speed
		move_and_slide()
		sync_position.rpc(global_position, health)

@rpc("any_peer", "unreliable")
func sync_position(pos: Vector2, hp: int) -> void:
	global_position = pos
	health = hp
```

It works on the first playtest. Then someone edits the exported `.pck`, sets `speed` to 2000 and `health` to 9999, and there is nothing any other peer can do about it, because the protocol *is* "trust me". Worse, `sync_position` is `any_peer`, so a client can call it on *another* player's node and teleport them into a wall. The design has no authority, so it has no rules.

> **Smell:** an `@rpc("any_peer")` that writes state instead of expressing intent. Any peer can call it, so any peer can set anything.

## Solution

Clients send input. The server simulates. State flows down.

```
      Client A                   Server (authority)                Client B
  ┌──────────────┐   request_input   ┌──────────────────┐             ┌──────────────┐
  │ read Input   │ ────────────────► │ validate + apply │             │              │
  │ predict move │                   │ _physics_process │             │ interpolate  │
  │ reconcile    │ ◄──────────────── │ MultiplayerSync  │ ──────────► │ remote view  │
  └──────────────┘   state (pos,hp)  └──────────────────┘   state     └──────────────┘
```

### Scene setup

```
Main (Node)
├── MultiplayerSpawner        spawn_path = ../Players, auto_spawn_list = [player.tscn]
├── Players (Node2D)
│   └── Player_1 (CharacterBody2D)      ← named by peer id, one per client
│       ├── MultiplayerSynchronizer     ← replicates position, health  (server → all)
│       ├── Sprite2D
│       └── CollisionShape2D
└── World
```

The `MultiplayerSpawner` on the server instantiates a player scene and the same instance appears on every client automatically; its `replication_config` on the synchroniser lists `position` and `health` so the server's values push to everyone. Nothing about that requires code. What requires code is deciding who may change them.

### Connecting

```gdscript:title="res://net/main.gd"
extends Node

const PORT := 7777
const PLAYER_SCENE := preload("res://player/player.tscn")

func host() -> void:
	var peer := ENetMultiplayerPeer.new()
	peer.create_server(PORT)
	multiplayer.multiplayer_peer = peer
	multiplayer.peer_connected.connect(_spawn_player)
	multiplayer.peer_disconnected.connect(_despawn_player)
	if not OS.has_feature("dedicated_server"):
		_spawn_player(1)   # listen-server: the host is also a player

func join(address: String) -> void:
	var peer := ENetMultiplayerPeer.new()
	peer.create_client(address, PORT)
	multiplayer.multiplayer_peer = peer

func _spawn_player(peer_id: int) -> void:
	# Server only; MultiplayerSpawner replicates the add_child to clients.
	var player: Player = PLAYER_SCENE.instantiate()
	player.name = str(peer_id)
	%Players.add_child(player)

func _despawn_player(peer_id: int) -> void:
	var player := %Players.get_node_or_null(str(peer_id))
	if player != null:
		player.queue_free()
```

The player node's *name* is the peer id. That is the convention `MultiplayerSpawner` needs to match instances across peers, and it is what lets the server check that a request came from the peer that owns the node.

### The authoritative player

Authority over the node stays with the server (the default — peer 1). The client does not call `set_multiplayer_authority` on itself; it only sends input.

```gdscript:title="res://player/player.gd"
class_name Player extends CharacterBody2D

const SPEED := 200.0
const MAX_INPUT_LENGTH := 1.0

var health: int = 100                  # replicated by MultiplayerSynchronizer
var _last_input: Vector2 = Vector2.ZERO
var _last_seq: int = 0

func _physics_process(delta: float) -> void:
	if multiplayer.is_server():
		if _is_local_player():
			# Listen-server host: no round trip, read input straight into the sim.
			_last_input = Input.get_vector("left", "right", "up", "down")
		velocity = _last_input * SPEED
		move_and_slide()
		# Tell the owning client which input this state corresponds to.
		acknowledge.rpc_id(name.to_int(), _last_seq, global_position)
	elif _is_local_player():
		_client_tick(delta)

func _is_local_player() -> bool:
	return name.to_int() == multiplayer.get_unique_id()

## Client → server. Intent, not state.
@rpc("any_peer", "call_remote", "unreliable_ordered")
func request_input(dir: Vector2, seq: int) -> void:
	if not multiplayer.is_server():
		return
	if multiplayer.get_remote_sender_id() != name.to_int():
		push_warning("peer %d tried to move player %s" % [multiplayer.get_remote_sender_id(), name])
		return
	if seq <= _last_seq:
		return                                    # stale or replayed packet
	_last_input = dir.limit_length(MAX_INPUT_LENGTH)   # never trust magnitude
	_last_seq = seq
```

Three validations, each one a cheat closed: the sender must own the node, the sequence must advance, and the vector is clamped. The server never reads `speed` or `health` from the wire — it has its own.

### Client prediction and reconciliation

Waiting a round trip before the character moves feels dreadful at anything above LAN latency. So the owning client applies its input locally at once (prediction), remembers what it sent, and when the server's acknowledged position arrives, snaps to it and replays the inputs the server has not yet seen (reconciliation).

```gdscript:title="res://player/player.gd (client section)"
class PendingInput extends RefCounted:
	var seq: int
	var dir: Vector2
	var delta: float

var _seq: int = 0
var _pending: Array[PendingInput] = []

func _client_tick(delta: float) -> void:
	var dir := Input.get_vector("left", "right", "up", "down")
	_seq += 1
	var pending := PendingInput.new()
	pending.seq = _seq
	pending.dir = dir
	pending.delta = delta
	_pending.append(pending)
	request_input.rpc_id(1, dir, _seq)
	_apply(dir)                           # predict: move now, ask forgiveness later

func _apply(dir: Vector2) -> void:
	velocity = dir * SPEED
	move_and_slide()

## Server → owning client. "As of input N, you were here."
@rpc("authority", "call_remote", "unreliable_ordered")
func acknowledge(seq: int, server_position: Vector2) -> void:
	# Drop everything the server has already processed.
	while not _pending.is_empty() and _pending[0].seq <= seq:
		_pending.pop_front()
	if global_position.distance_to(server_position) < 0.5:
		return                            # prediction was right; nothing to do
	# Rewind to the truth and replay what the server hasn't seen yet.
	global_position = server_position
	for p in _pending:
		_apply(p.dir)
```

The sketch cheats in one way: `move_and_slide()` uses the current physics `delta`, so replaying three inputs in one frame is only correct if every tick has the same delta. A real implementation runs the replay through a fixed-step move function, which is one reason a [Simulation / Presentation Split](/patterns/architectural/simulation-presentation) pairs well with networking. It also does not handle the owning client's `MultiplayerSynchronizer` fighting the prediction — exclude the local player's position from the synchroniser's config (or use `set_visibility_for` on the synchroniser) so the server's replicated position reaches other clients but not the predicting one.

### Remote players: interpolate, don't snap

Other players' positions arrive at the server's tick rate with jitter. Rendering them where the last packet said produces stutter. Keep the last two received positions and draw between them, one packet behind:

```gdscript:title="res://player/remote_smoother.gd"
extends Node

@export var body: CharacterBody2D
@export var snap_distance: float = 64.0

var _prev := Vector2.ZERO
var _next := Vector2.ZERO
var _t := 0.0

func on_position_replicated(pos: Vector2) -> void:
	if pos.distance_to(_next) > snap_distance:
		_prev = pos                       # teleport or respawn: don't glide across the map
	else:
		_prev = _next
	_next = pos
	_t = 0.0

func _process(delta: float) -> void:
	_t = minf(_t + delta * Engine.physics_ticks_per_second, 1.0)
	body.global_position = _prev.lerp(_next, _t)
```

Presentation lags the truth by one tick. That is the "eventually consistent" in the one-liner: every client sees a slightly different past, and the design must tolerate it — hit detection happens on the server, in the server's present.

### Server-side hit validation

```gdscript:title="res://player/player.gd (combat)"
@rpc("any_peer", "call_remote", "reliable")
func request_attack(target_name: StringName) -> void:
	if not multiplayer.is_server() or multiplayer.get_remote_sender_id() != name.to_int():
		return
	var target := get_parent().get_node_or_null(String(target_name)) as Player
	if target == null or target == self:
		return
	if global_position.distance_to(target.global_position) > 48.0:
		return                            # out of reach on the server: ignore, don't trust the client
	target.health -= 10                   # replicated by the synchroniser
	if target.health <= 0:
		target.show_death.rpc()           # authority → all, for effects only

@rpc("authority", "call_local", "reliable")
func show_death() -> void:
	%AnimationPlayer.play("die")          # cosmetic; the state already changed on the server
```

The client may *display* the swing immediately. Whether it landed is the server's call.

## Listen-server, P2P, or none at all

A **listen-server** is the code above with one peer both hosting and playing. It is what most co-op indie games ship. The host has zero latency and full authority — they can cheat, but they are usually your friend. The dedicated-server export (`OS.has_feature("dedicated_server")`) is the same project run headless, and if the code already checks `multiplayer.is_server()` rather than "am I peer 1 with a window", it works unchanged.

**Peer-to-peer with per-node authority** — each client calls `set_multiplayer_authority(its_own_id)` on its own player and replicates its own position — is the *scenario* code, done deliberately. It has no validation and cannot have any. That is fine for a two-player couch-adjacent game between people who trust each other, or a casual co-op where the worst cheat is "my friend is invincible". It is not fine for anything with a leaderboard, an economy, or strangers.

**Singleplayer-first** is right more often than it sounds. If multiplayer is "maybe, later", build the simulation as plain classes with a tick and input as data ([Hexagonal](/patterns/architectural/hexagonal)), and do not touch `@rpc`. A deterministic simulation with recorded input is most of a lockstep model and a good start on a server one. What does not survive a later multiplayer port is game logic in `_process` reading `Input` directly — and that is what most singleplayer code is.

## When to Use

- Any competitive game, any game with a persistent economy, any game where strangers play together. If a cheat would ruin someone else's session, the server must own the truth.
- The simulation is small enough to run for all players on one machine at the tick rate you need. Sixteen players and a few hundred entities: fine. A thousand-unit RTS: consider lockstep instead.
- You can afford to host, or your players can — a listen-server needs one player with an open port or a relay.

## When Not to Use

- Co-op between friends where trust is assumed and latency hiding matters more than cheating. A listen-server with per-node authority is a fifth of the code.
- Deterministic games with large state and few inputs — RTS, fighting games — where lockstep (send inputs, everyone simulates) beats replicating thousands of positions.
- The game is singleplayer with a "maybe multiplayer" note. Do the split and the deterministic tick now; add the network when it is real.
- Turn-based games. A reliable RPC per turn and a server that validates the move is the whole pattern; prediction and interpolation are irrelevant.

## The Decision

An authoritative server is the only architecture in which the rules of the game are actually rules. Everything else is a gentlemen's agreement with a `.pck` file. That is a strong guarantee and it is why the pattern exists.

What it costs is the distributed-systems tax, and it is levied from the first playable build, not at scale. The client's screen is a prediction; the server's state is the truth; the two disagree by one round trip plus jitter, permanently, and every feature you add — a dash, a grapple, a door, a pickup — has to answer "what does the client show while it waits, and what happens when the server says no?" Godot gives you the transport and the replication; it does not give you the reconciliation, the lag compensation for hit-scan, the interest management when the map outgrows one synchroniser's bandwidth, or the debugging tools for "it worked on LAN". Those are yours.

Two Godot-specific traps. `@rpc("any_peer")` is a public endpoint on the internet; treat every argument as hostile — check the sender, clamp the values, bound the rate. And `MultiplayerSynchronizer` replicates *whatever you list*, including things the client should not be allowed to write back; set the config so authority-owned properties flow one way. Take on the tax when strangers or stakes demand it, and be honest that it is a tax — that is [tenet #2 — name the trade-off](/philosophy/name-the-trade-off).

## Related Patterns

- **[Simulation / Presentation Split](/patterns/architectural/simulation-presentation)**: the fixed-tick simulation that makes prediction and replay correct. Client-server without it means replaying inputs through a variable `delta`.
- **[Event Sourcing](/patterns/architectural/event-sourcing)**: recording the server's inputs and events is the desync debugger and the replay system in one.
- **[Command](/patterns/behavioral/command)**: `request_input` is a command object on the wire. Making it one in the code (with a sequence number) is what reconciliation needs.
- **[Hexagonal](/patterns/architectural/hexagonal)**: input as a port is what lets the same simulation take input from `Input`, from the network, or from a recording.
- **[Rate Limiting](/patterns/architectural/rate-limiting)**: an `@rpc` with no rate limit is a denial-of-service invitation; bound requests per peer per second on the server.

# pyre-unsafe
from __future__ import annotations

"""
Prashnify Backend - PRODUCTION OPTIMIZED v4
Fixed: Timer sync, real-time updates, state recovery, performance
Added: Redis caching, orjson serialization, uvloop


# ============================================================================
# CHANGELOG — v4
# ============================================================================
# FIXED Bug 1: Removed asyncio.wait_for WS timeout; plain await + uvicorn ping
# FIXED Bug 2: _send_batch always sends messages individually (no batch envelope)
# FIXED Bug 3: MongoDB maxIdleTimeMS=60000, maxPoolSize=100, minPoolSize=5
# FIXED Bug 4: /ping returns instantly; /health still checks DB; railway.toml uses /ping
# FIXED Bug 5: Removed startCommand from railway.toml; Dockerfile CMD is sole source
# FIXED Bug 6: calc_leaderboard uses quiz_cache get/set with 5s TTL
# FIXED Bug 7: join_quiz MongoDB ops wrapped in 3-attempt retry with exp backoff
# FIXED Bug 8: WS_HEARTBEAT_SEC=20, WS_TIMEOUT_SEC=90
#
# ENHANCED 1: Streak milestone broadcasts at 3, 5, 10 consecutive correct
# ENHANCED 2: answer_count now includes percentage and allAnswered
# ENHANCED 3: first_correct broadcast when answer_position == 0 and correct
# ENHANCED 4: time_warning broadcast 5s before question ends
# ENHANCED 5: show_podium includes top-3 winners with stats
# ENHANCED 6: Participant reconnection grace (30s window before purge)
# ENHANCED 7: answer_confirmed WS push to submitter after submit-answer
# ENHANCED 8: kick_player accepts optional reason, sends you_were_kicked
#
# HARDENED: asyncio.shield on submit_answer DB update
# HARDENED: PYTHONOPTIMIZE=1 in Dockerfile
# HARDENED: _cleanup_dead_connections also cleans user_sockets
# HARDENED: Startup log prints resolved CORS origins
# ============================================================================
"""

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, Query, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, ConfigDict
from typing import Any, List, Optional, Dict, Set, Union, TYPE_CHECKING

from datetime import datetime, timezone, timedelta
from contextlib import asynccontextmanager
import os
import logging
import uuid
import random
import string
import asyncio
import time
import hashlib
import hmac
from collections import defaultdict
import pymongo.errors  # FIXED: Bug 7 — retry on PyMongoError
from dotenv import load_dotenv

load_dotenv()
# Password hashing — direct bcrypt (avoids passlib __about__ bug)
try:
    import bcrypt as _bcrypt
    HAS_BCRYPT = True
    def hash_password(password: str) -> str:
        pw: bytes = password.encode("utf-8")[:72]  # bcrypt 72-byte limit
        return _bcrypt.hashpw(pw, _bcrypt.gensalt()).decode("utf-8")

    def verify_password(password: str, hashed: str) -> bool:
        pw: bytes = password.encode("utf-8")[:72]
        return _bcrypt.checkpw(pw, hashed.encode("utf-8"))

    print("✓ bcrypt enabled (direct)")
except ImportError:
    HAS_BCRYPT = False
    print("⚠ bcrypt not installed — falling back to SHA-256 (INSECURE)")

# JWT handling
import jwt as pyjwt

# Fast JSON serialization
try:
    import orjson
    HAS_ORJSON = True
    def fast_dumps(obj):
        return orjson.dumps(obj).decode("utf-8")
    def fast_loads(s):
        return orjson.loads(s)
    print("✓ orjson enabled")
except ImportError:
    import json
    HAS_ORJSON = False
    def fast_dumps(obj):
        return json.dumps(obj, separators=(',', ':'))
    def fast_loads(s):
        return json.loads(s)

import json  # still needed for json.loads in other places

# Redis async client
try:
    import redis.asyncio as aioredis
    HAS_REDIS_LIB = True
except ImportError:
    HAS_REDIS_LIB = False

# Try uvloop for performance (Linux only, silently skipped on Windows)
try:
    import uvloop
    uvloop.install()
    print("✓ uvloop enabled")
except (ImportError, AttributeError):
    try:
        import uvloop
        asyncio.set_event_loop_policy(uvloop.EventLoopPolicy())
        print("✓ uvloop enabled (legacy)")
    except (ImportError, AttributeError):
        pass  # Windows or uvloop not installed

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# ============================================================================
# CONFIGURATION - ULTRA LOW LATENCY
# ============================================================================


class Config:
    MONGO_URL = os.getenv("MONGO_URL", "mongodb://localhost:27017")
    DB_NAME = os.getenv("DB_NAME", "prashnify")
    REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    MAX_PARTICIPANTS = 1000
    WS_HEARTBEAT_SEC = 20   # FIXED: Bug 8 — more forgiving for mobile
    WS_TIMEOUT_SEC = 90     # FIXED: Bug 8 — more forgiving for mobile
    CACHE_TTL_SEC = 30  # Cache quiz/question data
    LEADERBOARD_CACHE_TTL = 5  # Leaderboard cache (seconds)
    ALLOWED_ORIGINS = [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
    ]
    # Admin authentication
    ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "admin")
    ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "prashnify2026")
    JWT_SECRET = os.getenv("JWT_SECRET", "prashnify-secret-key-change-in-production")
    JWT_ALGORITHM = "HS256"
    JWT_EXPIRATION_HOURS = 24


config = Config()
mongo_client: Optional[AsyncIOMotorClient] = None
db: Any = None  # Motor database object
manager: Optional[ConnectionManager] = None
redis_client: Any = None  # redis.asyncio client


# ============================================================================
# IN-MEMORY CACHE FOR QUIZ DATA
# ============================================================================


class QuizCache:
    """Hybrid Redis + in-memory cache for quiz data.
    Uses Redis as primary cache, falls back to in-memory if Redis unavailable.
    MASS-JOIN FIX 5: Stampede-safe loading with asyncio.Event.
    """

    def __init__(self):
        # In-memory fallback
        self._mem_quiz: Dict[str, Dict] = {}
        self._mem_questions: Dict[str, List[Dict]] = {}
        self._mem_timestamps: Dict[str, float] = {}
        # MASS-JOIN FIX 5: Stampede guard — only one DB read per cache miss
        self._loading: Dict[str, asyncio.Event] = {}

    async def get_quiz(self, code: str) -> Optional[Dict]:
        # Try Redis first
        if redis_client:
            try:
                data = await redis_client.get(f"quiz:{code}")
                if data:
                    return fast_loads(data)
            except Exception:
                pass
        # Fallback to in-memory
        if code in self._mem_quiz:
            if time.time() - self._mem_timestamps.get(f"quiz_{code}", 0) < config.CACHE_TTL_SEC:
                return self._mem_quiz[code]
        return None

    async def set_quiz(self, code: str, quiz: Dict):
        self._mem_quiz[code] = quiz
        self._mem_timestamps[f"quiz_{code}"] = time.time()
        if redis_client:
            try:
                await redis_client.setex(f"quiz:{code}", config.CACHE_TTL_SEC, fast_dumps(quiz))
            except Exception:
                pass

    async def get_questions(self, code: str) -> Optional[List[Dict]]:
        if redis_client:
            try:
                data = await redis_client.get(f"questions:{code}")
                if data:
                    return fast_loads(data)
            except Exception:
                pass
        if code in self._mem_questions:
            if time.time() - self._mem_timestamps.get(f"questions_{code}", 0) < config.CACHE_TTL_SEC:
                return self._mem_questions[code]
        return None

    async def set_questions(self, code: str, questions: List[Dict]):
        self._mem_questions[code] = questions
        self._mem_timestamps[f"questions_{code}"] = time.time()
        if redis_client:
            try:
                await redis_client.setex(f"questions:{code}", config.CACHE_TTL_SEC, fast_dumps(questions))
            except Exception:
                pass

    async def invalidate(self, code: str):
        """BUG 1 FIX: Clear in-memory FIRST (synchronous), then Redis with timeout."""
        self._mem_quiz.pop(code, None)
        self._mem_questions.pop(code, None)
        self._mem_timestamps.pop(f"quiz_{code}", None)
        self._mem_timestamps.pop(f"questions_{code}", None)
        if redis_client:
            try:
                await asyncio.wait_for(
                    redis_client.delete(f"quiz:{code}", f"questions:{code}", f"leaderboard:{code}"),
                    timeout=1.0
                )
            except (asyncio.TimeoutError, Exception) as e:
                logger.warning(f"Redis invalidate failed for {code}: {e}")

    async def get_leaderboard(self, code: str) -> Optional[List[Dict]]:
        if redis_client:
            try:
                data = await redis_client.get(f"leaderboard:{code}")
                if data:
                    return fast_loads(data)
            except Exception:
                pass
        return None

    async def set_leaderboard(self, code: str, leaderboard: List[Dict]):
        if redis_client:
            try:
                await redis_client.setex(
                    f"leaderboard:{code}", config.LEADERBOARD_CACHE_TTL, fast_dumps(leaderboard)
                )
            except Exception:
                pass


quiz_cache = QuizCache()


# ============================================================================
# STATE MACHINE
# ============================================================================


class QuizState:
    """Quiz flow states"""

    LOBBY = "lobby"
    QUESTION = "question"
    ANSWER_REVEAL = "answer_reveal"
    LEADERBOARD = "leaderboard"
    FINAL_LEADERBOARD = "final_leaderboard"
    PODIUM = "podium"
    ENDED = "ended"


# ============================================================================
# OPTIMIZED WEBSOCKET CONNECTION MANAGER
# ============================================================================


class ConnectionManager:
    """Ultra-fast WebSocket manager with instant state sync and recovery"""

    def __init__(self):
        self.active_connections: Dict[str, Set[WebSocket]] = {}
        self.user_sockets: Dict[str, WebSocket] = {}
        self.room_state: Dict[str, Dict] = {}
        self._lock = asyncio.Lock()
        self._broadcast_queue: Dict[str, asyncio.Queue] = {}
        self._broadcast_tasks: Dict[str, asyncio.Task] = {}
        self._cleanup_tasks: Dict[str, asyncio.Task] = {}

        # Connection rate limiting
        self._connection_rate: Dict[str, list] = defaultdict(list)
        self._max_connections_per_room = 250

        # Performance tracking
        self._message_count: Dict[str, int] = defaultdict(int)
        self._last_reset: float = time.time()

        # PERF FIX 4: Store purge task refs to prevent GC
        self._purge_tasks: Dict[str, asyncio.Task] = {}

        # PERF FIX 2: Debounce answer_count broadcasts (max 1 per 200ms per room)
        self._answer_count_dirty: Dict[str, bool] = {}
        self._answer_count_task: Dict[str, asyncio.Task] = {}

        # BUG 5 / CHANGE 3: Per-room start guard
        self._starting: Set[str] = set()

        # PERF-5: Room-level heartbeat replaces per-user heartbeat
        self._room_heartbeat_tasks: Dict[str, asyncio.Task] = {}
        self._last_pong: Dict[str, Dict[str, float]] = {}  # FIX 12: per-room pong tracking

        # MASS-JOIN FIX 3: Per-room WS join semaphore
        self._ws_join_semaphore: Dict[str, asyncio.Semaphore] = {}

        # MASS-JOIN FIX 4: Debounced participant_joined broadcasts
        self._pending_joins: Dict[str, list] = {}
        self._join_broadcast_task: Dict[str, asyncio.Task] = {}

        # CHANGE 5: Room state creation timestamps for zombie detection
        self._room_created_at: Dict[str, float] = {}

    async def connect(self, websocket: WebSocket, quiz_code: str, user_id: Optional[str] = None):
        """Connect WebSocket with instant acknowledgment + rate limiting
        PERF-2: accept() is OUTSIDE lock. Lock only protects dict mutations.
        MASS-JOIN FIX 9: Rate limit raised to 50/s with server_busy retry."""
        try:
            await websocket.accept()
        except Exception as e:
            logger.error(f"Failed to accept WebSocket: {e}")
            return False

        async with self._lock:
            # Room capacity check
            if quiz_code in self.active_connections:
                if len(self.active_connections[quiz_code]) >= self._max_connections_per_room:
                    await websocket.close(code=1013, reason="Room at capacity")
                    return False

            # FIX 10: Rate limit 50/sec — close immediately, NO sleep
            now = time.time()
            self._connection_rate[quiz_code] = [
                t for t in self._connection_rate[quiz_code] if now - t < 1.0
            ]
            if len(self._connection_rate[quiz_code]) >= 50:
                try:
                    await websocket.send_json({
                        "type": "server_busy",
                        "retry_in_ms": 1000 + random.randint(0, 1000),
                    })
                except Exception: pass
                await websocket.close(code=1013, reason="Rate limited — retry shortly")
                return False
            self._connection_rate[quiz_code].append(now)

            # Initialize room
            if quiz_code not in self.active_connections:
                self.active_connections[quiz_code] = set()
                self._room_created_at[quiz_code] = time.time()
                self.room_state[quiz_code] = {
                    "quiz_state": QuizState.LOBBY,
                    "current_question": 0,
                    "total_questions": 0,
                    "participants": {},
                    "answered": set(),
                    "admin_socket": None,
                    "show_answers": False,
                    "question_start_time": None,
                    "server_time_offset": 0,
                    "question_answer_stats": {},
                    "current_time_limit": 30,
                }
                # FIX 13: Create bounded broadcast queue
                self._broadcast_queue[quiz_code] = asyncio.Queue(maxsize=500)
                self._broadcast_tasks[quiz_code] = asyncio.create_task(
                    self._broadcast_worker(quiz_code)
                )
                # Start dead connection cleanup
                self._cleanup_tasks[quiz_code] = asyncio.create_task(
                    self._cleanup_dead_connections(quiz_code)
                )
                # PERF-5: Start room-level heartbeat
                self._room_heartbeat_tasks[quiz_code] = asyncio.create_task(
                    self._room_heartbeat(quiz_code)
                )
                self._last_pong[quiz_code] = {}  # FIX 12: per-room pong tracking
                # MASS-JOIN FIX 3: Per-room WS join semaphore
                self._ws_join_semaphore[quiz_code] = asyncio.Semaphore(30)

            self.active_connections[quiz_code].add(websocket)

            if user_id:
                # Close old socket immediately
                if user_id in self.user_sockets:
                    old_socket = self.user_sockets[user_id]
                    try:
                        await old_socket.close(code=1000, reason="New connection")
                    except:
                        pass

                self.user_sockets[user_id] = websocket
                # FIX 12: Track pong time per room
                if quiz_code not in self._last_pong:
                    self._last_pong[quiz_code] = {}
                self._last_pong[quiz_code][user_id] = time.time()

            logger.info(
                f"✓ Connected: {quiz_code} ({len(self.active_connections[quiz_code])} total)"
            )
            return True

    def disconnect(self, websocket: WebSocket, quiz_code: str, user_id: Optional[str] = None):
        """Disconnect with reconnection grace — ENHANCED: Enhancement 6"""
        if quiz_code in self.active_connections:
            self.active_connections[quiz_code].discard(websocket)

            if not self.active_connections[quiz_code]:
                # REL-3: Clean broadcast worker shutdown
                if quiz_code in self._broadcast_queue:
                    # Send shutdown sentinel and let worker drain
                    try:
                        self._broadcast_queue[quiz_code].put_nowait(None)
                    except Exception:
                        pass
                if quiz_code in self._broadcast_tasks:
                    self._broadcast_tasks[quiz_code].cancel()
                    self._broadcast_tasks.pop(quiz_code, None)
                if quiz_code in self._broadcast_queue:
                    self._broadcast_queue.pop(quiz_code, None)
                # Cleanup room
                self.active_connections.pop(quiz_code, None)
                if quiz_code in self.room_state:
                    self.room_state.pop(quiz_code, None)
                if quiz_code in self._cleanup_tasks:
                    self._cleanup_tasks[quiz_code].cancel()
                    self._cleanup_tasks.pop(quiz_code, None)
                # PERF-5: Cancel room heartbeat
                if quiz_code in self._room_heartbeat_tasks:
                    self._room_heartbeat_tasks[quiz_code].cancel()
                    self._room_heartbeat_tasks.pop(quiz_code, None)

                # FIX 17: Clean up all per-room dicts
                self._last_pong.pop(quiz_code, None)
                self._ws_join_semaphore.pop(quiz_code, None)
                self._room_created_at.pop(quiz_code, None)
                self._pending_joins.pop(quiz_code, None)
                t = self._join_broadcast_task.pop(quiz_code, None)
                if t and not t.done(): t.cancel()
                self._answer_count_task.pop(quiz_code, None)
                self._answer_count_dirty.pop(quiz_code, None)

        if user_id:
            if self.user_sockets.get(user_id) == websocket:
                self.user_sockets.pop(user_id, None)

            # FIX 12: Remove from per-room pong tracking
            if quiz_code in self._last_pong:
                self._last_pong[quiz_code].pop(user_id, None)

            if quiz_code in self.room_state:
                # ENHANCED: Enhancement 6 — Don't remove participant immediately;
                # mark with disconnected_at for 30s reconnection grace.
                if self.room_state[quiz_code].get("admin_socket") == websocket:
                    self.room_state[quiz_code]["admin_socket"] = None
                elif user_id in self.room_state[quiz_code]["participants"]:
                    self.room_state[quiz_code]["participants"][user_id]["disconnected_at"] = time.time()
                    # PERF FIX 4: Use create_task + store ref to prevent GC
                    purge_key = f"{quiz_code}:{user_id}"
                    task = asyncio.create_task(
                        self._purge_if_disconnected(quiz_code, user_id, 30)
                    )
                    self._purge_tasks[purge_key] = task
                    task.add_done_callback(
                        lambda t, k=purge_key: self._purge_tasks.pop(k, None)
                    )

                self.room_state[quiz_code]["answered"].discard(user_id)

        logger.info(f"✗ Disconnected: {quiz_code}")

    async def _purge_if_disconnected(self, quiz_code: str, user_id: str, grace_sec: int = 30):
        """ENHANCED: Enhancement 6 — Purge participant only if still disconnected after grace period."""
        # GRACE_WINDOW: 30s enforced here
        await asyncio.sleep(grace_sec)
        if quiz_code in self.room_state:
            p = self.room_state[quiz_code]["participants"].get(user_id)
            if p and "disconnected_at" in p:
                # Still disconnected — purge
                self.room_state[quiz_code]["participants"].pop(user_id, None)
                logger.info(f"Purged disconnected participant {user_id} from {quiz_code} after {grace_sec}s")

    async def _broadcast_worker(self, quiz_code: str):
        """Background worker for instant broadcasts with batching"""
        try:
            queue = self._broadcast_queue[quiz_code]
            batch = []
            last_send = time.time()

            while True:
                try:
                    # Collect messages for up to 10ms or until we have a message
                    message = await asyncio.wait_for(queue.get(), timeout=0.01)

                    if message is None:  # Shutdown signal
                        break

                    batch.append(message)

                    # Send batch if we have messages and enough time has passed
                    # OR if it's a critical message type
                    current_time = time.time()
                    is_critical = message.get("type") in [
                        "quiz_starting",
                        "next_question",
                        "show_answer",
                        "show_leaderboard",
                        "show_podium",
                        "sync_state",
                        "question_time_sync",
                    ]

                    if is_critical or (batch and current_time - last_send > 0.01):
                        await self._send_batch(quiz_code, batch)
                        batch = []
                        last_send = current_time

                except asyncio.TimeoutError:
                    # Send any pending messages
                    if batch:
                        await self._send_batch(quiz_code, batch)
                        batch = []
                        last_send = time.time()

        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error(f"Broadcast worker error: {e}")

    async def _send_batch(self, quiz_code: str, messages: List[Dict]):
        """PERF-1: Chunked broadcasts — send to 50 connections at a time,
        yielding the event loop between chunks so heartbeats/pongs can process."""
        if quiz_code not in self.active_connections or not messages:
            return

        dead_sockets = []
        connections = list(self.active_connections[quiz_code])
        chunk_size = 50

        for message in messages:
            data = fast_dumps(message)  # PERF FIX 3: orjson, 5-10x faster
            for i in range(0, len(connections), chunk_size):
                chunk = connections[i : i + chunk_size]
                tasks = [
                    self._send_message(conn, data, dead_sockets) for conn in chunk
                ]
                if tasks:
                    await asyncio.gather(*tasks, return_exceptions=True)
                if i + chunk_size < len(connections):
                    await asyncio.sleep(0)  # yield to event loop

        # Cleanup dead connections
        for socket in dead_sockets:
            self.active_connections[quiz_code].discard(socket)

    async def _send_message(self, conn: WebSocket, data: str, dead_sockets: list):
        """Send message with error handling"""
        try:
            await conn.send_text(data)
        except Exception:
            dead_sockets.append(conn)

    async def broadcast(self, quiz_code: str, message: dict, priority: bool = False):
        """FIX 13: Overflow-safe broadcast via bounded queue"""
        if quiz_code not in self._broadcast_queue:
            return
        q = self._broadcast_queue[quiz_code]
        try:
            q.put_nowait(message)
        except asyncio.QueueFull:
            if message.get("type") in ("answer_count", "answer_stats", "reaction", "ping"):
                return  # safe to drop
            try: q.get_nowait()  # drop oldest
            except: pass
            try: q.put_nowait(message)
            except: logger.warning(f"Queue full: {quiz_code}/{message.get('type')}")
        self._message_count[quiz_code] += 1

    async def broadcast_answer_count_debounced(self, quiz_code: str):
        """PERF FIX 2 / PERF-6: Debounce answer_count — max 1 broadcast per 200ms.
        FIX: Check task.done() to avoid races where task completed between mark+check."""
        self._answer_count_dirty[quiz_code] = True
        existing = self._answer_count_task.get(quiz_code)
        if existing and not existing.done():
            return  # task already scheduled, it will pick up latest value

        async def _flush():
            await asyncio.sleep(0.2)  # 200ms debounce window
            self._answer_count_task.pop(quiz_code, None)
            if not self._answer_count_dirty.get(quiz_code):
                return
            self._answer_count_dirty[quiz_code] = False
            answered, total = self.get_answer_count(quiz_code)
            pct = round(answered / total * 100) if total > 0 else 0
            await self.broadcast(quiz_code, {
                "type": "answer_count",
                "answeredCount": answered,
                "totalParticipants": total,
                "percentage": pct,
                "allAnswered": answered >= total,
            })

        self._answer_count_task[quiz_code] = asyncio.create_task(_flush())

    async def send_to_user(self, user_id: str, message: dict):
        """Send message to specific user"""
        if user_id in self.user_sockets:
            try:
                await self.user_sockets[user_id].send_json(message)
            except Exception as e:
                logger.error(f"Failed to send to {user_id}: {e}")

    async def _room_heartbeat(self, quiz_code: str):
        """FIX 12: Single heartbeat task per room with per-room pong tracking."""
        try:
            while quiz_code in self.active_connections:
                await asyncio.sleep(config.WS_HEARTBEAT_SEC)
                if quiz_code not in self.active_connections:
                    break
                now = time.time()
                ping_msg = fast_dumps({"type": "ping", "t": int(now * 1000)})
                dead = []
                for ws in list(self.active_connections.get(quiz_code, set())):
                    try:
                        await ws.send_text(ping_msg)
                    except Exception:
                        dead.append(ws)

                # FIX 12: Kick users who haven't ponged in 60s (per-room tracking)
                cutoff = now - 60
                for uid, last in list(self._last_pong.get(quiz_code, {}).items()):
                    if last < cutoff and uid in self.user_sockets:
                        sock = self.user_sockets[uid]
                        if sock in self.active_connections.get(quiz_code, set()):
                            dead.append(sock)
                            self._last_pong.get(quiz_code, {}).pop(uid, None)
                            logger.info(f"Kicking user {uid} from {quiz_code} — no pong in 60s")

                for ws in dead:
                    self.active_connections[quiz_code].discard(ws)
                    try:
                        await ws.close(code=1001, reason="Heartbeat timeout")
                    except Exception:
                        pass
        except asyncio.CancelledError:
            pass

    async def broadcast_participant_joined_debounced(self, quiz_code: str, participant: dict):
        """MASS-JOIN FIX 4: Debounce participant_joined broadcasts.
        Batches joins over 300ms window, sends single participants_batch_joined."""
        if quiz_code not in self._pending_joins:
            self._pending_joins[quiz_code] = []
        self._pending_joins[quiz_code].append(participant)

        existing = self._join_broadcast_task.get(quiz_code)
        if existing and not existing.done():
            return  # task already scheduled

        async def _flush():
            await asyncio.sleep(0.3)  # 300ms batch window
            self._join_broadcast_task.pop(quiz_code, None)
            batch = self._pending_joins.pop(quiz_code, [])
            if not batch:
                return
            if len(batch) == 1:
                await self.broadcast(quiz_code, {
                    "type": "participant_joined",
                    "participant": batch[0],
                })
            else:
                await self.broadcast(quiz_code, {
                    "type": "participants_batch_joined",
                    "participants": batch,
                    "count": len(batch),
                })

        self._join_broadcast_task[quiz_code] = asyncio.create_task(_flush())

    async def close_room(self, quiz_code: str):
        """REL-5: Force-close a zombie room — disconnect all clients."""
        if quiz_code not in self.active_connections:
            return
        for ws in list(self.active_connections.get(quiz_code, set())):
            try:
                await ws.close(code=1001, reason="Room expired")
            except Exception:
                pass
        # Cleanup will happen via disconnect() callbacks

    def get_all_participants(self, quiz_code: str) -> list:
        """MASS-JOIN FIX 8: Return full participant list for sync_state."""
        if quiz_code not in self.room_state:
            return []
        participants = self.room_state[quiz_code].get("participants", {})
        return [
            {"id": pid, "name": p.get("name", ""), "avatarSeed": p.get("avatarSeed", "")}
            for pid, p in participants.items()
            if "disconnected_at" not in p  # exclude disconnected
        ]

    async def _cleanup_dead_connections(self, quiz_code: str):
        """Periodic cleanup of zombie WebSocket connections every 30s
        HARDENED: Also cleans stale user_sockets entries.
        REL-5: Zombie room prevention (4hr max lifetime).
        """
        try:
            while quiz_code in self.active_connections:
                await asyncio.sleep(30)
                if quiz_code not in self.active_connections:
                    break

                # REL-5: Check room age — force close after 4 hours
                room_age = time.time() - self._room_created_at.get(quiz_code, time.time())
                if room_age > 4 * 3600:
                    logger.warning(f"Zombie room detected: {quiz_code} (age={room_age:.0f}s) — force closing")
                    await self.close_room(quiz_code)
                    break

                dead = []
                for ws in list(self.active_connections.get(quiz_code, set())):
                    try:
                        if ws.client_state.value >= 2:  # CLOSING or CLOSED
                            dead.append(ws)
                    except Exception:
                        dead.append(ws)
                for ws in dead:
                    self.active_connections[quiz_code].discard(ws)
                if dead:
                    logger.info(f"Cleaned {len(dead)} dead connections from {quiz_code}")

                # HARDENED: Also clean user_sockets where socket is CLOSED
                stale_users = []
                for uid, sock in list(self.user_sockets.items()):
                    try:
                        if sock.client_state.value >= 2:
                            stale_users.append(uid)
                    except Exception:
                        stale_users.append(uid)
                for uid in stale_users:
                    self.user_sockets.pop(uid, None)
                    self._last_pong.pop(uid, None)
                if stale_users:
                    logger.info(f"Cleaned {len(stale_users)} stale user_sockets entries")
        except asyncio.CancelledError:
            pass

    # State methods - All instant
    def set_state(self, quiz_code: str, state: str):
        """Instant state change. CHANGE 5: Also persists snapshot to Redis."""
        if quiz_code in self.room_state:
            self.room_state[quiz_code]["quiz_state"] = state
            logger.info(f"State: {quiz_code} -> {state}")
            # CHANGE 5: Persist room snapshot to Redis on every state transition
            asyncio.create_task(self._persist_room_snapshot(quiz_code))

    def get_state(self, quiz_code: str) -> str:
        if quiz_code in self.room_state:
            return self.room_state[quiz_code]["quiz_state"]
        return QuizState.LOBBY

    def set_question(self, quiz_code: str, index: int, time_limit: int = 30):
        """Set question with precise timestamp and actual time limit"""
        if quiz_code in self.room_state:
            question_start = int(time.time() * 1000)
            self.room_state[quiz_code]["current_question"] = index
            self.room_state[quiz_code]["current_time_limit"] = time_limit
            self.room_state[quiz_code]["answered"].clear()
            self.room_state[quiz_code]["show_answers"] = False
            self.room_state[quiz_code]["question_start_time"] = question_start
            # Init answer stats for this question
            if "question_answer_stats" not in self.room_state[quiz_code]:
                self.room_state[quiz_code]["question_answer_stats"] = {}
            self.room_state[quiz_code]["question_answer_stats"][index] = {}
            logger.info(f"Question: {quiz_code} -> Q{index} (limit={time_limit}s) @ {question_start}")
            # CHANGE 5: Persist room snapshot to Redis on every question change
            asyncio.create_task(self._persist_room_snapshot(quiz_code))

    def get_question(self, quiz_code: str) -> int:
        if quiz_code in self.room_state:
            return self.room_state[quiz_code]["current_question"]
        return 0

    def get_question_start_time(self, quiz_code: str) -> int:
        if quiz_code in self.room_state:
            return self.room_state[quiz_code].get("question_start_time", 0)
        return 0

    def set_total_questions(self, quiz_code: str, total: int):
        if quiz_code in self.room_state:
            self.room_state[quiz_code]["total_questions"] = total

    def mark_answered(self, quiz_code: str, user_id: str):
        if quiz_code in self.room_state:
            self.room_state[quiz_code]["answered"].add(user_id)

    def has_answered(self, quiz_code: str, user_id: str) -> bool:
        if quiz_code in self.room_state:
            return user_id in self.room_state[quiz_code]["answered"]
        return False

    def clear_answers(self, quiz_code: str):
        if quiz_code in self.room_state:
            self.room_state[quiz_code]["answered"].clear()

    def get_answer_count(self, quiz_code: str) -> tuple:
        if quiz_code in self.room_state:
            state = self.room_state[quiz_code]
            answered = len(state["answered"])
            total = len(state["participants"])
            return answered, total
        return 0, 0

    def set_show_answers(self, quiz_code: str, show: bool):
        if quiz_code in self.room_state:
            self.room_state[quiz_code]["show_answers"] = show

    def should_show_answers(self, quiz_code: str) -> bool:
        if quiz_code in self.room_state:
            return self.room_state[quiz_code].get("show_answers", False)
        return False

    def set_admin(self, quiz_code: str, websocket: WebSocket):
        if quiz_code in self.room_state:
            self.room_state[quiz_code]["admin_socket"] = websocket

    def add_participant(self, quiz_code: str, participant: dict):
        if quiz_code in self.room_state:
            user_id = participant.get("id")
            if user_id:
                self.room_state[quiz_code]["participants"][user_id] = participant

    def get_participants(self, quiz_code: str) -> list:
        if quiz_code in self.room_state:
            return list(self.room_state[quiz_code]["participants"].values())
        return []

    def get_room_state(self, quiz_code: str) -> dict:
        """Get complete room state for sync"""
        if quiz_code in self.room_state:
            state = self.room_state[quiz_code]
            server_time = int(time.time() * 1000)
            question_start = state.get("question_start_time", 0)

            return {
                "quiz_state": state["quiz_state"],
                "current_question": state["current_question"],
                "total_questions": state["total_questions"],
                "show_answers": state.get("show_answers", False),
                "server_time": server_time,
                "question_start_time": question_start,
                "time_limit": state.get("current_time_limit", 30),
                "time_remaining": self._calculate_time_remaining(
                    quiz_code, server_time
                ),
                "answered_count": len(state["answered"]),
                "total_participants": len(state["participants"]),
            }
        return {
            "quiz_state": QuizState.LOBBY,
            "current_question": 0,
            "total_questions": 0,
            "show_answers": False,
            "server_time": int(time.time() * 1000),
            "question_start_time": 0,
            "time_remaining": 0,
            "answered_count": 0,
            "total_participants": 0,
        }

    def _calculate_time_remaining(self, quiz_code: str, current_time: int) -> int:
        """Calculate remaining time for current question using stored time limit"""
        if quiz_code not in self.room_state:
            return 0

        state = self.room_state[quiz_code]
        if state["quiz_state"] != QuizState.QUESTION:
            return 0

        question_start = state.get("question_start_time", 0)
        if not question_start:
            return 0

        # Use the actual stored time limit for the current question
        time_limit = state.get("current_time_limit", 30)
        elapsed = (current_time - question_start) / 1000
        remaining = max(0, time_limit - elapsed)

        return int(remaining)

    async def close_room(self, quiz_code: str):
        if quiz_code in self.active_connections:
            for socket in list(self.active_connections[quiz_code]):
                try:
                    await socket.close()
                except:
                    pass

            self.active_connections.pop(quiz_code, None)
            if quiz_code in self.room_state:
                self.room_state.pop(quiz_code, None)


    # CHANGE 5: Redis room snapshot for crash recovery
    async def _persist_room_snapshot(self, quiz_code: str):
        """Persist minimal state to Redis for crash recovery."""
        if not redis_client or quiz_code not in self.room_state:
            return
        state = self.room_state[quiz_code]
        snapshot = {
            "quiz_state": state.get("quiz_state", QuizState.LOBBY),
            "current_question": state.get("current_question", 0),
            "total_questions": state.get("total_questions", 0),
            "question_start_time": state.get("question_start_time", 0),
            "current_time_limit": state.get("current_time_limit", 30),
            "show_answers": state.get("show_answers", False),
        }
        try:
            await asyncio.wait_for(
                redis_client.setex(f"room_snap:{quiz_code}", 3600, fast_dumps(snapshot)),
                timeout=0.5
            )
        except Exception:
            pass  # Non-fatal

    async def _try_rehydrate_from_redis(self, quiz_code: str):
        """CHANGE 5: Rehydrate room_state from Redis snapshot after process restart."""
        if quiz_code in self.room_state or not redis_client:
            return
        try:
            data = await asyncio.wait_for(redis_client.get(f"room_snap:{quiz_code}"), timeout=1.0)
            if data:
                snap = fast_loads(data)
                self.room_state[quiz_code] = {
                    "quiz_state": snap.get("quiz_state", QuizState.LOBBY),
                    "current_question": snap.get("current_question", 0),
                    "total_questions": snap.get("total_questions", 0),
                    "participants": {},
                    "answered": set(),
                    "admin_socket": None,
                    "show_answers": snap.get("show_answers", False),
                    "question_start_time": snap.get("question_start_time", 0),
                    "server_time_offset": 0,
                    "question_answer_stats": {},
                    "current_time_limit": snap.get("current_time_limit", 30),
                }
                logger.info(f"Rehydrated room {quiz_code} from Redis snapshot: state={snap.get('quiz_state')}")
        except Exception as e:
            logger.warning(f"Redis rehydrate failed for {quiz_code}: {e}")

    def get_performance_stats(self) -> dict:
        """Get performance statistics"""
        current_time = time.time()
        elapsed = current_time - self._last_reset

        stats: Dict[str, Any] = {
            "active_rooms": len(self.active_connections),
            "total_connections": sum(
                len(conns) for conns in self.active_connections.values()
            ),
            "messages_per_second": (
                sum(self._message_count.values()) / elapsed if elapsed > 0 else 0
            ),
        }

        room_details: Dict[str, Any] = {}

        for code in self.active_connections:
            room_details[code] = {
                "connections": len(self.active_connections[code]),
                "participants": len(
                    self.room_state.get(code, {}).get("participants", {})
                ),
                "state": self.room_state.get(code, {}).get("quiz_state", "unknown"),
            }

        stats["room_details"] = room_details

        # Reset counters

        if elapsed > 60:
            self._message_count.clear()
            self._last_reset = current_time

        return stats


# ============================================================================
# LIFESPAN
# ============================================================================


@asynccontextmanager
async def lifespan(app: FastAPI):
    global mongo_client, db, manager

    logger.info("🚀 Starting Prashnify API (PRODUCTION v2)")

    try:
        # FIX 1: JWT_SECRET guard — warn, don't crash
        if config.JWT_SECRET == "prashnify-secret-key-change-in-production":
            logger.warning("⚠ JWT_SECRET is using insecure default — set JWT_SECRET env var in production")

        mongo_client = AsyncIOMotorClient(
            config.MONGO_URL,
            serverSelectionTimeoutMS=3000,   # BUG 2c: faster failure on M0
            connectTimeoutMS=5000,
            socketTimeoutMS=10000,
            maxPoolSize=5,       # BUG 2c: Atlas M0 allows 100 total; keep very low
            minPoolSize=1,       # BUG 2c: minimal idle connections
            maxIdleTimeMS=10000, # BUG 2c: free connections aggressively
            retryWrites=True,
            retryReads=True,
        )
        db = mongo_client[config.DB_NAME]
        await db.command("ping")
        logger.info("✓ MongoDB connected")
    except Exception as e:
        logger.error(f"❌ MongoDB connection failed: {e}")
        raise

    try:
        # Create indexes with background option for production
        await db.quizzes.create_index("code", unique=True)
        await db.quizzes.create_index("status")
        # MASS-JOIN FIX 6: compound index for join status check
        await db.quizzes.create_index([("code", 1), ("status", 1)])
        await db.participants.create_index([("id", 1), ("quizCode", 1)])
        await db.participants.create_index("quizCode")
        await db.participants.create_index(
            [("quizCode", 1), ("score", -1)]
        )  # For leaderboard
        await db.participants.create_index([("quizCode", 1), ("name", 1)])
        # NOTE: NOT unique — allowedAttempts>1 quizzes need duplicate names
        await db.questions.create_index([("quizCode", 1), ("index", 1)])
        await db.admins.create_index("username", unique=True)
        logger.info("✓ Database indexes created")
    except Exception as e:
        logger.error(f"Index creation error: {e}")

    # Seed default admin user
    try:
        existing_admin = await db.admins.find_one({"username": config.ADMIN_USERNAME})
        if HAS_BCRYPT:
            # SECURITY FIX 6: Use bcrypt for password hashing
            if not existing_admin:
                hashed_pw = hash_password(config.ADMIN_PASSWORD)
                await db.admins.insert_one({
                    "username": config.ADMIN_USERNAME,
                    "password": hashed_pw,
                    "role": "admin",
                    "createdAt": datetime.now(timezone.utc).isoformat(),
                })
                logger.info(f"✓ Default admin user '{config.ADMIN_USERNAME}' created (bcrypt)")
            else:
                stored_pw = existing_admin.get("password", "")
                # Auto-migrate SHA-256 hash to bcrypt on first run
                if not stored_pw.startswith("$2"):
                    new_hash = hash_password(config.ADMIN_PASSWORD)
                    await db.admins.update_one(
                        {"username": config.ADMIN_USERNAME},
                        {"$set": {"password": new_hash}}
                    )
                    logger.info(f"✓ Migrated admin password to bcrypt for '{config.ADMIN_USERNAME}'")
                elif not verify_password(config.ADMIN_PASSWORD, stored_pw):
                    # Password env var changed — re-hash
                    new_hash = hash_password(config.ADMIN_PASSWORD)
                    await db.admins.update_one(
                        {"username": config.ADMIN_USERNAME},
                        {"$set": {"password": new_hash}}
                    )
                    logger.info(f"✓ Admin password updated for '{config.ADMIN_USERNAME}'")
                else:
                    logger.info(f"✓ Admin user '{config.ADMIN_USERNAME}' exists (bcrypt)")
        else:
            # Fallback to SHA-256 if passlib not installed
            if not existing_admin:
                hashed_pw = hashlib.sha256(config.ADMIN_PASSWORD.encode()).hexdigest()
                await db.admins.insert_one({
                    "username": config.ADMIN_USERNAME,
                    "password": hashed_pw,
                    "role": "admin",
                    "createdAt": datetime.now(timezone.utc).isoformat(),
                })
                logger.info(f"✓ Default admin user '{config.ADMIN_USERNAME}' created (SHA-256 fallback)")
            else:
                hashed_pw = hashlib.sha256(config.ADMIN_PASSWORD.encode()).hexdigest()
                if existing_admin.get("password") != hashed_pw:
                    await db.admins.update_one(
                        {"username": config.ADMIN_USERNAME},
                        {"$set": {"password": hashed_pw}}
                    )
                    logger.info(f"✓ Admin password updated for '{config.ADMIN_USERNAME}'")
                else:
                    logger.info(f"✓ Admin user '{config.ADMIN_USERNAME}' exists")
    except Exception as e:
        logger.error(f"Admin seeding error: {e}")

    # ── Redis connection ──────────────────────────────────────────────
    global redis_client
    if HAS_REDIS_LIB:
        _redis_url = os.getenv("REDIS_URL", "")
        if _redis_url:
            try:
                redis_client = aioredis.from_url(
                    _redis_url,
                    decode_responses=True,
                    socket_connect_timeout=5,
                    retry_on_timeout=True,
                )
                await redis_client.ping()
                logger.info("✓ Redis connected")
            except Exception as e:
                logger.warning(f"⚠ Redis unavailable (falling back to in-memory): {e}")
                redis_client = None
        else:
            logger.info("⚠ No REDIS_URL set — using in-memory cache only")
    else:
        logger.info("⚠ redis library not installed — using in-memory cache only")

    manager = ConnectionManager()

    # FIX 4: Initialize join semaphore inside lifespan (event loop exists)
    global _join_semaphore
    _join_semaphore = asyncio.Semaphore(20)

    logger.info("✓ Prashnify API ready (PRODUCTION v2)")

    # FIX 19: Keep-warm task to prevent Railway container sleep
    async def _keep_warm():
        await asyncio.sleep(240)
        while True:
            try:
                await asyncio.wait_for(db.command("ping"), timeout=3.0)
            except Exception:
                pass
            await asyncio.sleep(240)
    asyncio.create_task(_keep_warm())

    yield

    logger.info("🛑 Shutting down")
    if mongo_client:
        mongo_client.close()
    logger.info("✓ Shutdown complete")


# ============================================================================
# FASTAPI APP
# ============================================================================

app = FastAPI(
    title="Prashnify API",
    version="4.0.0-PRODUCTION",
    description="Prashnify — Lightning-fast real-time multiplayer quiz platform",
    lifespan=lifespan,
)

# Resolve CORS origins: env var CORS_ORIGINS takes priority over Config defaults
_cors_env = os.getenv("CORS_ORIGINS", "")
if _cors_env == "*":
    _cors_origins = ["*"]
elif _cors_env:
    _cors_origins = [o.strip() for o in _cors_env.split(",") if o.strip()]
else:
    _cors_origins = config.ALLOWED_ORIGINS

# HARDENED: Startup CORS log so Railway logs make env var issues obvious
logger.info(f"CORS origins resolved to: {_cors_origins}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

app.add_middleware(GZipMiddleware, minimum_size=500)

# ============================================================================
# MODELS
# ============================================================================


class Question(BaseModel):
    question: str
    options: List[str]
    correctAnswer: Union[int, List[int]]
    timeLimit: int = 30
    points: Union[int, str] = "standard"
    type: str = "quiz"
    media: Optional[str] = None


class QuizCreate(BaseModel):
    title: str
    description: Optional[str] = ""
    duration: int
    questions: List[Question]
    startTime: Optional[str] = None
    endTime: Optional[str] = None
    allowedAttempts: int = 1
    shuffleQuestions: bool = False
    showCorrectAnswers: bool = True


class Quiz(BaseModel):
    model_config = ConfigDict(extra="ignore")
    code: str
    title: str
    description: Optional[str] = ""
    duration: int
    status: str = "active"
    createdAt: str
    questionsCount: int
    participantCount: int = 0
    startTime: Optional[str] = None
    endTime: Optional[str] = None
    allowedAttempts: int = 1
    shuffleQuestions: bool = False
    showCorrectAnswers: bool = True
    lastPlayed: Optional[str] = None


class ParticipantJoin(BaseModel):
    name: str
    quizCode: str
    avatarSeed: Optional[str] = None


class Participant(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    quizCode: str
    avatarSeed: str
    joinedAt: str
    score: int = 0
    totalTime: float = 0.0
    answers: List[Dict] = []
    currentQuestion: int = 0
    lastActive: str
    attemptNumber: int = 1
    completedAt: Optional[str] = None


class AnswerSubmit(BaseModel):
    participantId: str
    quizCode: str
    questionIndex: int
    selectedOption: int
    timeTaken: float


class LeaderboardEntry(BaseModel):
    name: str
    score: int
    totalTime: float
    rank: int
    avatarSeed: str = ""
    participantId: str = ""
    completedAt: Optional[str] = None


class AdminLogin(BaseModel):
    username: str
    password: str


# ============================================================================
# AUTHENTICATION
# ============================================================================

security = HTTPBearer(auto_error=False)


def create_admin_token(username: str) -> str:
    """Generate a JWT token for admin"""
    payload = {
        "sub": username,
        "role": "admin",
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(hours=config.JWT_EXPIRATION_HOURS),
    }
    return pyjwt.encode(payload, config.JWT_SECRET, algorithm=config.JWT_ALGORITHM)


def verify_token(token: str) -> Optional[Dict]:
    """Verify and decode a JWT token"""
    try:
        payload = pyjwt.decode(token, config.JWT_SECRET, algorithms=[config.JWT_ALGORITHM])
        return payload
    except pyjwt.ExpiredSignatureError:
        return None
    except pyjwt.InvalidTokenError:
        return None


async def verify_admin_token(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> Dict:
    """FastAPI dependency to protect admin routes"""
    if credentials is None:
        raise HTTPException(status_code=401, detail="Not authenticated")

    payload = verify_token(credentials.credentials)
    if payload is None:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    if payload.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    return payload


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================


def generate_code(length: int = 6) -> str:
    chars = string.ascii_uppercase + string.digits
    chars = chars.replace("O", "").replace("0", "").replace("I", "").replace("1", "")
    return "".join(random.choices(chars, k=length))


async def verify_participant(pid: str, code: str) -> Optional[Dict]:
    """PERF FIX 1: Read-only verification — does NOT write lastActive.
       Call update_participant_active() explicitly only when needed (WS connect)."""
    try:
        return await db.participants.find_one(
            {"id": pid, "quizCode": code}, {"_id": 0}
        )
    except Exception as e:
        logger.error(f"Verify participant error: {e}")
        return None


async def update_participant_active(pid: str):
    """PERF FIX 1: Update lastActive only on WS connect, not on every answer."""
    try:
        await db.participants.update_one(
            {"id": pid},
            {"$set": {"lastActive": datetime.now(timezone.utc).isoformat()}}
        )
    except Exception:
        pass  # Non-critical, don't let it crash anything


async def is_avatar_unique(
    quiz_code: str, seed: str, exclude_participant: Optional[str] = None
) -> bool:
    try:
        query: Dict[str, Any] = {"quizCode": quiz_code, "avatarSeed": seed}

        if exclude_participant:
            query["id"] = {"$ne": exclude_participant}
        existing = await db.participants.find_one(query, {"_id": 1})
        return existing is None
    except Exception as e:
        logger.error(f"Avatar uniqueness check error: {e}")
        return True


async def generate_unique_avatar(
    quiz_code: str, exclude_participant: Optional[str] = None
) -> str:

    max_attempts = 50
    for _ in range(max_attempts):
        seed = f"{quiz_code}-{uuid.uuid4().hex[:8]}-{int(time.time() * 1000)}"
        if await is_avatar_unique(quiz_code, seed, exclude_participant):
            return seed
    return f"{quiz_code}-fallback-{uuid.uuid4().hex}"


def calc_points_v2(
    question: Dict, correct: bool, time_taken: float, previous_answers: List[Dict],
    answer_position: int = 0, total_participants: int = 0
) -> tuple:

    """Kahoot-style scoring with quadratic speed bonus and position bonus.
    
    Produces granular scores to naturally minimize ties:
    - Base: half of max points
    - Speed bonus: quadratic decay — fast answers rewarded disproportionately
    - Streak bonus: percentage multiplier on base+speed (2→+5%, 3→+10%, 4→+20%, 5+→+30%)
    - Position bonus: first correct answer gets +5, second +4, etc. (max 5)
    """
    if not correct:
        return 0, 0, 0

    pts_cfg = question.get("points", "standard")
    if pts_cfg == "standard":
        max_base = 1000
    elif pts_cfg == "double":
        max_base = 2000
    elif pts_cfg == "noPoints":
        return 0, 0, 0
    elif isinstance(pts_cfg, int):
        max_base = pts_cfg
    else:
        max_base = 1000

    base_points: int = max_base // 2

    time_limit = question.get("timeLimit", 30)

    if time_limit == 0:
        return max_base, 0, 0

    time_bonus: int
    if time_taken < 0.3:
        time_bonus = max_base // 2

    elif time_taken >= time_limit:
        time_bonus = 0
    else:
        time_ratio = min(1.0, time_taken / time_limit)
        # Quadratic decay: (1 - ratio)^2 gives much more points for fast answers
        time_bonus = int((max_base // 2) * ((1 - time_ratio) ** 2))

    # Streak bonus: percentage multiplier on subtotal
    consecutive_correct = 0
    for ans in reversed(previous_answers):
        if ans.get("isCorrect"):
            consecutive_correct += 1
        else:
            break

    current_streak: int = consecutive_correct + 1  # +1 for current correct answer
    subtotal: int = base_points + time_bonus


    if current_streak >= 5:
        streak_bonus = int(subtotal * 0.30)  # +30%
    elif current_streak >= 4:
        streak_bonus = int(subtotal * 0.20)  # +20%
    elif current_streak >= 3:
        streak_bonus = int(subtotal * 0.10)  # +10%
    elif current_streak >= 2:
        streak_bonus = int(subtotal * 0.05)  # +5%
    else:
        streak_bonus = 0

    # Position bonus: first correct answer gets +5 pts, second +4, etc.
    # This creates natural tiebreakers even when two players answer equally fast
    position_bonus = max(0, 6 - min(answer_position + 1, 6))  # 5,4,3,2,1,0
    time_bonus += position_bonus  # Fold into time_bonus for display simplicity

    return base_points, time_bonus, streak_bonus


async def calc_leaderboard(code: str) -> List[Dict]:
    """Optimized leaderboard calculation with proper tie-breaking.
    FIXED: Bug 6 — uses quiz_cache get/set with 5s TTL.
    
    Ranking rules:
    - Primary sort: score DESC
    - Secondary sort: totalTime ASC (faster = higher rank)
    - Players with identical score AND totalTime get the same rank
    """
    try:
        # FIXED: Bug 6 — check cache first
        cached = await quiz_cache.get_leaderboard(code)
        if cached:
            return cached

        # Use indexed query for better performance
        parts = (
            await db.participants.find({"quizCode": code}, {"_id": 0})
            .sort([("score", -1), ("totalTime", 1)])
            .to_list(config.MAX_PARTICIPANTS)
        )

        result = []
        prev_score = None
        prev_time = None
        prev_rank = 0

        for idx, p in enumerate(parts):
            score = p.get("score", 0)
            total_time = round(p.get("totalTime", 0), 2)

            # Assign same rank if score AND totalTime are identical
            if score == prev_score and total_time == prev_time:
                rank = prev_rank
            else:
                rank = idx + 1

            prev_score = score
            prev_time = total_time
            prev_rank = rank

            result.append(
                {
                    "name": p.get("name", "Unknown"),
                    "score": score,
                    "totalTime": total_time,
                    "rank": rank,
                    "avatarSeed": p.get("avatarSeed", ""),
                    "participantId": p.get("id", ""),
                    "completedAt": p.get("completedAt"),
                }
            )

        # FIXED: Bug 6 — cache the result
        await quiz_cache.set_leaderboard(code, result)
        return result
    except Exception as e:
        logger.error(f"Calculate leaderboard error: {e}")
        return []


async def get_quiz_with_cache(code: str) -> Optional[Dict]:
    """MASS-JOIN FIX 5: Stampede-safe quiz cache.
    Only one DB read per cache miss regardless of concurrency."""
    cached = await quiz_cache.get_quiz(code)
    if cached:
        return cached

    # Check if another coroutine is already loading this quiz
    cache_key = f"quiz_{code}"
    if cache_key in quiz_cache._loading:
        await quiz_cache._loading[cache_key].wait()
        return await quiz_cache.get_quiz(code)

    # We are the first — set the loading flag
    event = asyncio.Event()
    quiz_cache._loading[cache_key] = event
    try:
        quiz = await db.quizzes.find_one({"code": code}, {"_id": 0})
        if quiz:
            await quiz_cache.set_quiz(code, quiz)
        return quiz
    finally:
        event.set()  # wake up all waiters
        quiz_cache._loading.pop(cache_key, None)


async def get_questions_with_cache(code: str) -> List[Dict]:
    """MASS-JOIN FIX 5: Stampede-safe questions cache."""
    cached = await quiz_cache.get_questions(code)
    if cached:
        return cached

    cache_key = f"questions_{code}"
    if cache_key in quiz_cache._loading:
        await quiz_cache._loading[cache_key].wait()
        cached = await quiz_cache.get_questions(code)
        return cached if cached else []

    event = asyncio.Event()
    quiz_cache._loading[cache_key] = event
    try:
        questions = (
            await db.questions.find({"quizCode": code}, {"_id": 0})
            .sort("index", 1)
            .to_list(100)
        )
        if questions:
            await quiz_cache.set_questions(code, questions)
        return questions
    finally:
        event.set()
        quiz_cache._loading.pop(cache_key, None)


# ============================================================================
# API ROUTES
# ============================================================================


@app.get("/")
async def root():
    # FIXED: Bug 4 — instant response, no DB call
    return {"status": "ok"}


@app.get("/ping")
async def ping():
    """FIXED: Bug 4 — Instant health check for Railway (no DB call)."""
    return {"status": "ok"}


@app.get("/health")
async def health():
    status: Dict[str, Any] = {"status": "healthy", "services": {}}
    services: Dict[str, str] = {}
    try:
        await db.command("ping")
        services["mongodb"] = "connected"
    except Exception as e:
        services["mongodb"] = f"error: {str(e)}"
        status["status"] = "degraded"
    status["services"] = services


    if manager:
        status["websocket"] = manager.get_performance_stats()

    return status


@app.get("/api/time-sync")
async def time_sync():
    """High-precision time sync endpoint for client clock synchronization"""
    return {
        "serverTime": int(time.time() * 1000),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.post("/api/admin/login")
async def admin_login(data: AdminLogin):
    """Admin login - validates credentials and returns JWT token.
       SECURITY FIX 6: Uses bcrypt verification when available."""
    try:
        admin = await db.admins.find_one({"username": data.username})
        if not admin:
            raise HTTPException(status_code=401, detail="Invalid username or password")

        stored_pw = admin.get("password", "")
        password_valid = False

        if HAS_BCRYPT and stored_pw.startswith("$2"):
            # bcrypt hash — verify directly
            password_valid = verify_password(data.password, stored_pw)
        else:
            # Legacy SHA-256 fallback
            hashed_pw = hashlib.sha256(data.password.encode()).hexdigest()
            password_valid = (stored_pw == hashed_pw)
            # Auto-migrate to bcrypt on successful legacy login
            if password_valid and HAS_BCRYPT:
                new_hash = hash_password(data.password)
                await db.admins.update_one(
                    {"username": data.username},
                    {"$set": {"password": new_hash}}
                )
                logger.info(f"✓ Auto-migrated admin '{data.username}' password to bcrypt")

        if not password_valid:
            raise HTTPException(status_code=401, detail="Invalid username or password")

        token = create_admin_token(data.username)
        logger.info(f"✓ Admin login: {data.username}")
        return {
            "token": token,
            "username": data.username,
            "role": "admin",
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Login error: {e}")
        raise HTTPException(500, "Login failed")


@app.get("/api/admin/verify-token")
async def verify_admin_token_endpoint(_admin: Dict = Depends(verify_admin_token)):
    """Verify admin JWT token validity — used by frontend route guard"""
    return {"valid": True, "username": _admin.get("sub", "")}


@app.post("/api/admin/quiz", response_model=Quiz)
async def create_quiz(data: QuizCreate, _admin: Dict = Depends(verify_admin_token)):
    try:
        if not data.questions or len(data.questions) > 100:
            raise HTTPException(400, "Must have 1-100 questions")

        code = generate_code()
        for _ in range(10):
            existing = await db.quizzes.find_one({"code": code}, {"_id": 1})
            if not existing:
                break
            code = generate_code()
        else:
            raise HTTPException(500, "Failed to generate unique code")

        quiz_doc = {
            "code": code,
            "title": data.title,
            "description": data.description,
            "duration": data.duration,
            "status": "active",
            "createdAt": datetime.now(timezone.utc).isoformat(),
            "questionsCount": len(data.questions),
            "participantCount": 0,
            "startTime": data.startTime,
            "endTime": data.endTime,
            "allowedAttempts": data.allowedAttempts,
            "shuffleQuestions": data.shuffleQuestions,
            "showCorrectAnswers": data.showCorrectAnswers,
            "lastPlayed": None,
        }

        await db.quizzes.insert_one(quiz_doc)

        questions = []
        for idx, q in enumerate(data.questions):
            questions.append(
                {
                    "quizCode": code,
                    "index": idx,
                    "question": q.question,
                    "options": q.options,
                    "correctAnswer": q.correctAnswer,
                    "timeLimit": q.timeLimit,
                    "points": q.points,
                    "type": q.type,
                    "media": q.media,
                }
            )

        if questions:
            await db.questions.insert_many(questions)

        logger.info(f"✓ Quiz created: {code} - {data.title}")
        return Quiz(**quiz_doc)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Create quiz error: {e}")
        raise HTTPException(500, "Failed to create quiz")


@app.get("/api/admin/quizzes", response_model=List[Quiz])
async def get_quizzes(
    status: Optional[str] = None,
    limit: int = Query(100, le=500),
    skip: int = Query(0, ge=0),
    _admin: Dict = Depends(verify_admin_token),
):
    try:
        query = {}
        if status:
            query["status"] = status

        quizzes = (
            await db.quizzes.find(query, {"_id": 0})
            .sort("createdAt", -1)
            .skip(skip)
            .limit(limit)
            .to_list(limit)
        )
        return [Quiz(**q) for q in quizzes]
    except Exception as e:
        logger.error(f"Get quizzes error: {e}")
        raise HTTPException(500, "Failed to fetch quizzes")


@app.get("/api/admin/quiz/{code}")
async def get_quiz(code: str, _admin: Dict = Depends(verify_admin_token)):
    try:
        quiz = await get_quiz_with_cache(code)
        if not quiz:
            raise HTTPException(404, "Quiz not found")

        questions = await get_questions_with_cache(code)
        quiz["questions"] = questions
        return quiz
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get quiz error: {e}")
        raise HTTPException(500, "Failed to fetch quiz")


@app.patch("/api/admin/quiz/{code}/status")
async def update_quiz_status(code: str, status: str = Query(...), _admin: Dict = Depends(verify_admin_token)):
    try:
        if status not in ["active", "inactive", "ended"]:
            raise HTTPException(400, "Invalid status")

        result = await db.quizzes.update_one(
            {"code": code}, {"$set": {"status": status}}
        )

        if result.matched_count == 0:
            raise HTTPException(404, "Quiz not found")

        # Invalidate cache
        await quiz_cache.invalidate(code)

        if status == "ended" and manager:
            manager.set_state(code, QuizState.ENDED)
            await manager.broadcast(
                code,
                {"type": "quiz_ended", "message": "Quiz terminated by admin"},
                priority=True,
            )
            await manager.close_room(code)

        if manager:
            await manager.broadcast(
                code, {"type": "quiz_status_changed", "status": status}
            )

        logger.info(f"✓ Quiz {code} status changed to {status}")
        return {"success": True, "status": status}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Update status error: {e}")
        raise HTTPException(500, "Failed to update status")


@app.delete("/api/admin/quiz/{code}")
async def delete_quiz(code: str, _admin: Dict = Depends(verify_admin_token)):
    try:
        result = await db.quizzes.delete_one({"code": code})
        if result.deleted_count == 0:
            raise HTTPException(404, "Quiz not found")

        # Clean up in parallel
        await asyncio.gather(
            db.questions.delete_many({"quizCode": code}),
            db.participants.delete_many({"quizCode": code}),
        )

        await quiz_cache.invalidate(code)

        logger.info(f"✓ Quiz deleted: {code}")
        return {"success": True, "message": "Quiz deleted"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Delete error: {e}")
        raise HTTPException(500, "Failed to delete quiz")


@app.get("/api/admin/quiz/{code}/participants")
async def get_quiz_participants(code: str, _admin: Dict = Depends(verify_admin_token)):
    try:
        parts = (
            await db.participants.find({"quizCode": code}, {"_id": 0})
            .sort("score", -1)
            .to_list(config.MAX_PARTICIPANTS)
        )
        return {"participants": parts, "count": len(parts)}
    except Exception as e:
        logger.error(f"Get participants error: {e}")
        raise HTTPException(500, "Failed to fetch participants")


@app.post("/api/avatar/unique")
async def get_unique_avatar(data: dict):
    try:
        seed = await generate_unique_avatar(data["quizCode"], data.get("participantId"))
        dicebear_url = f"https://api.dicebear.com/7.x/fun-emoji/svg?seed={seed}"
        return {"seed": seed, "url": dicebear_url}
    except Exception as e:
        logger.error(f"Generate unique avatar error: {e}")
        raise HTTPException(500, "Failed to generate unique avatar")


@app.post("/api/avatar/reroll")
async def reroll_avatar(data: dict):
    try:
        participant = await verify_participant(data["participantId"], data["quizCode"])
        if not participant:
            raise HTTPException(403, "Unauthorized")

        if manager and manager.get_state(data["quizCode"]) != QuizState.LOBBY:
            raise HTTPException(400, "Cannot change avatar after quiz starts")

        new_seed = await generate_unique_avatar(data["quizCode"], data["participantId"])

        await db.participants.update_one(
            {"id": data["participantId"]}, {"$set": {"avatarSeed": new_seed}}
        )

        if manager:
            await manager.broadcast(
                data["quizCode"],
                {
                    "type": "avatar_updated",
                    "participantId": data["participantId"],
                    "avatarSeed": new_seed,
                },
            )

        dicebear_url = f"https://api.dicebear.com/7.x/fun-emoji/svg?seed={new_seed}"

        logger.info(
            f"✓ Avatar rerolled for {data['participantId']} in {data['quizCode']}"
        )
        return {"seed": new_seed, "url": dicebear_url}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Reroll avatar error: {e}")
        raise HTTPException(500, "Failed to reroll avatar")


# FIX 4: Semaphore declared at module scope, initialized in lifespan
_join_semaphore: Optional[asyncio.Semaphore] = None


@app.post("/api/join", response_model=Participant)
async def join_quiz(data: ParticipantJoin):
    try:
        if not data.name or not data.name.strip():
            raise HTTPException(400, "Name is required")

        if len(data.name) > 50:
            raise HTTPException(400, "Name too long (max 50 characters)")

        # FIX 4: Wrap ALL db ops in semaphore + timeout
        try:
            async with asyncio.timeout(15):
                async with _join_semaphore:
                    quiz = await get_quiz_with_cache(data.quizCode)
                    if not quiz:
                        raise HTTPException(404, "Quiz not found")

                    if quiz.get("status") == "ended":
                        raise HTTPException(400, "Quiz has ended")

                    if quiz.get("status") != "active":
                        raise HTTPException(400, f"Quiz is {quiz.get('status')}")

                    # FIX 5: Branch on allowedAttempts for name check
                    allowed_attempts = quiz.get("allowedAttempts", 1)
                    if allowed_attempts > 1:
                        existing_count = await db.participants.count_documents(
                            {"quizCode": data.quizCode, "name": data.name.strip()}
                        )
                        if existing_count >= allowed_attempts:
                            raise HTTPException(400, "Maximum attempts reached for this name")

                    avatar_seed = data.avatarSeed
                    if not avatar_seed:
                        avatar_seed = await generate_unique_avatar(data.quizCode)
                    else:
                        if not await is_avatar_unique(data.quizCode, avatar_seed):
                            avatar_seed = await generate_unique_avatar(data.quizCode)

                    pid = str(uuid.uuid4())
                    pdoc = {
                        "id": pid,
                        "name": data.name.strip(),
                        "quizCode": data.quizCode,
                        "avatarSeed": avatar_seed,
                        "joinedAt": datetime.now(timezone.utc).isoformat(),
                        "score": 0,
                        "totalTime": 0.0,
                        "answers": [],
                        "currentQuestion": 0,
                        "lastActive": datetime.now(timezone.utc).isoformat(),
                        "attemptNumber": 1,
                        "completedAt": None,
                    }

                    # FIX 6: Sequential insert with retry (idempotent)
                    for attempt in range(3):
                        try:
                            await db.participants.insert_one({**pdoc})
                            break
                        except pymongo.errors.DuplicateKeyError:
                            raise HTTPException(400, "Name already taken — choose a different name")
                        except pymongo.errors.PyMongoError as e:
                            if attempt < 2:
                                await asyncio.sleep(0.1 * (2 ** attempt))
                                logger.warning(f"Join insert retry {attempt+1}/3 for {data.name}: {e}")
                            else:
                                raise HTTPException(503, "Server busy — please retry",
                                                    headers={"Retry-After": "2"})

                    # FIX 6: Increment count (separate, non-fatal)
                    for attempt in range(3):
                        try:
                            await db.quizzes.update_one(
                                {"code": data.quizCode},
                                {"$inc": {"participantCount": 1},
                                 "$set": {"lastPlayed": datetime.now(timezone.utc).isoformat()}}
                            )
                            break
                        except pymongo.errors.PyMongoError:
                            if attempt < 2:
                                await asyncio.sleep(0.1 * (2 ** attempt))
                            else:
                                logger.warning(f"participantCount increment failed — non-critical")
                                break

            logger.info(f"✓ Participant joined: {data.name} -> {data.quizCode}")
            return Participant(**pdoc)

        except TimeoutError:
            raise HTTPException(503, "Server is busy, please try again",
                                headers={"Retry-After": "2"})

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Join error: {e}")
        raise HTTPException(503, "Server is busy, please try again",
                            headers={"Retry-After": "2"})


@app.get("/api/quiz/{code}/questions")
async def get_quiz_questions(code: str, participantId: str):
    try:
        quiz = await get_quiz_with_cache(code)
        if not quiz:
            raise HTTPException(404, "Quiz not found")

        if quiz.get("status") == "ended":
            raise HTTPException(400, "Quiz has ended")

        if participantId != "admin":
            p = await verify_participant(participantId, code)
            if not p:
                raise HTTPException(403, "Unauthorized")

        questions = await get_questions_with_cache(code)

        # Remove correct answers for participants (keep fixed index order for sync)
        if participantId != "admin":
            questions = [
                {k: v for k, v in q.items() if k != "correctAnswer"} for q in questions
            ]
            # NOTE: Do NOT shuffle here - questions must stay in the same index order
            # as the server uses (0, 1, 2...) so admin and participant stay in sync.
            # Shuffle is intentionally disabled to ensure consistent question display.

        return {"questions": questions}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get questions error: {e}")
        raise HTTPException(500, "Failed to fetch questions")


@app.post("/api/submit-answer")
async def submit_answer(ans: AnswerSubmit):
    """ULTRA-OPTIMIZED: Instant answer processing with minimal DB hits"""
    try:
        # Early validation - check manager state first (no DB hit)
        if manager:
            if manager.has_answered(ans.quizCode, ans.participantId):
                logger.warning(
                    f"Duplicate answer blocked: {ans.participantId} Q{ans.questionIndex}"
                )
                raise HTTPException(400, "Already answered this question")

            current_state = manager.get_state(ans.quizCode)
            if current_state in [QuizState.ENDED, QuizState.PODIUM]:
                return {
                    "correct": False,
                    "points": 0,
                    "ignored": True,
                    "reason": "Quiz has ended",
                }

        # PERF-3: Fetch quiz and question from cache (no DB hit if warm).
        # Only participant fetch hits MongoDB cold. Wrap with timeout.
        quiz_task = get_quiz_with_cache(ans.quizCode)
        question_task = db.questions.find_one(
            {"quizCode": ans.quizCode, "index": ans.questionIndex}, {"_id": 0}
        )
        # PERF-3: 5-second timeout on participant fetch to avoid hanging on slow M0
        async def _verify_with_timeout():
            try:
                return await asyncio.wait_for(
                    verify_participant(ans.participantId, ans.quizCode),
                    timeout=5.0
                )
            except asyncio.TimeoutError:
                logger.warning(f"verify_participant timeout for {ans.participantId}")
                return None

        quiz, q, p = await asyncio.gather(quiz_task, question_task, _verify_with_timeout())

        if not quiz:
            raise HTTPException(404, "Quiz not found")

        if quiz.get("status") == "ended":
            raise HTTPException(400, "Quiz has ended")

        if not p:
            raise HTTPException(403, "Unauthorized")

        if not q:
            raise HTTPException(404, f"Question {ans.questionIndex} not found")

        # Validate answer
        is_correct = False
        correct_answer = q.get("correctAnswer")

        if isinstance(correct_answer, list):
            is_correct = ans.selectedOption in correct_answer
        else:
            is_correct = correct_answer == ans.selectedOption

        # Calculate points with position bonus for tiebreaking
        answer_position = 0
        total_participants_count = 0
        if manager and ans.quizCode in manager.room_state:
            answer_position = len(manager.room_state[ans.quizCode].get("answered", set()))
            total_participants_count = len(manager.room_state[ans.quizCode].get("participants", {}))

        base_pts, time_bonus, streak_bonus = calc_points_v2(
            q, is_correct, ans.timeTaken, p.get("answers", []),
            answer_position=answer_position,
            total_participants=total_participants_count
        )
        total_pts = base_pts + time_bonus + streak_bonus

        ans_rec = {
            "questionIndex": ans.questionIndex,
            "selectedOption": ans.selectedOption,
            "isCorrect": is_correct,
            "timeTaken": round(ans.timeTaken, 2),
            "points": total_pts,
            "basePoints": base_pts,
            "timeBonus": time_bonus,
            "streakBonus": streak_bonus,
            "submittedAt": datetime.now(timezone.utc).isoformat(),
        }

        # Get question count from cache
        questions = await get_questions_with_cache(ans.quizCode)
        q_count = len(questions)
        is_completed = len(p.get("answers", [])) + 1 >= q_count

        update_doc: Dict[str, Any] = {
            "$inc": {"score": total_pts, "totalTime": ans.timeTaken},
            "$push": {"answers": ans_rec},
        }


        if is_completed:
            update_doc["$set"] = {"completedAt": datetime.now(timezone.utc).isoformat()}

        # HARDENED: asyncio.shield so in-flight DB write is never lost if WS closes
        await asyncio.shield(
            db.participants.update_one({"id": ans.participantId}, update_doc)
        )

        # Mark as answered IMMEDIATELY and broadcast
        if manager:
            manager.mark_answered(ans.quizCode, ans.participantId)
            answered, total = manager.get_answer_count(ans.quizCode)

            # Track answer stats for distribution chart
            if ans.quizCode in manager.room_state:
                stats = manager.room_state[ans.quizCode].setdefault("question_answer_stats", {})
                if ans.questionIndex not in stats:
                    stats[ans.questionIndex] = {}
                opt_str = str(ans.selectedOption)
                stats[ans.questionIndex][opt_str] = stats[ans.questionIndex].get(opt_str, 0) + 1

            # PERF FIX 2: Debounced answer_count — max 1 broadcast per 200ms per room
            await manager.broadcast_answer_count_debounced(ans.quizCode)

            # ENHANCED: Enhancement 3 — first correct answer announcement
            if is_correct and answer_position == 0:
                await manager.broadcast(
                    ans.quizCode,
                    {
                        "type": "first_correct",
                        "participantId": ans.participantId,
                        "playerName": p.get("name", "Unknown"),
                        "name": p.get("name", "Unknown"),
                        "avatarSeed": p.get("avatarSeed", ""),
                        "questionIndex": ans.questionIndex,
                    },
                )

            # ENHANCED: Enhancement 1 — streak milestone broadcasts
            if is_correct:
                # Compute current streak from previous answers + this one
                consecutive_correct = 0
                for prev_ans in reversed(p.get("answers", [])):
                    if prev_ans.get("isCorrect"):
                        consecutive_correct += 1
                    else:
                        break
                current_streak = consecutive_correct + 1  # +1 for current answer
                if current_streak in (3, 5, 10):
                    badge_map = {3: "hot", 5: "fire", 10: "legendary"}
                    await manager.broadcast(
                        ans.quizCode,
                        {
                            "type": "streak_milestone",
                            "participantId": ans.participantId,
                            "playerName": p.get("name", "Unknown"),
                            "name": p.get("name", "Unknown"),
                            "streak": current_streak,
                            "badge": badge_map[current_streak],
                            "avatarSeed": p.get("avatarSeed", ""),
                        },
                    )

            # Also broadcast answer stats (non-priority, for admin chart)
            if ans.quizCode in manager.room_state:
                current_stats = manager.room_state[ans.quizCode].get("question_answer_stats", {}).get(ans.questionIndex, {})
                await manager.broadcast(
                    ans.quizCode,
                    {
                        "type": "answer_stats",
                        "questionIndex": ans.questionIndex,
                        "stats": current_stats,
                        "answeredCount": answered,
                        "totalParticipants": total,
                    },
                )

            # ENHANCED: Enhancement 7 — answer lock confirmation to submitter via WS
            new_total_score = p.get("score", 0) + total_pts
            await manager.send_to_user(
                ans.participantId,
                {
                    "type": "answer_confirmed",
                    "questionIndex": ans.questionIndex,
                    "correct": is_correct,
                    "points": total_pts,
                    "streakBonus": streak_bonus,
                    "newTotalScore": new_total_score,
                },
            )

        result = {
            "correct": is_correct,
            "points": total_pts,
            "basePoints": base_pts,
            "timeBonus": time_bonus,
            "streakBonus": streak_bonus,
            "isCompleted": is_completed,
        }

        if quiz and quiz.get("showCorrectAnswers"):
            result["correctAnswer"] = correct_answer

        logger.info(
            f"✓ Answer: {ans.participantId} Q{ans.questionIndex} -> {is_correct} ({total_pts}pts)"
        )

        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Submit answer error: {e}")
        raise HTTPException(500, "Failed to submit answer")


@app.get("/api/quiz/{code}/verify")
async def verify_quiz(code: str):
    """Verify a quiz code exists and is joinable"""
    quiz = await get_quiz_with_cache(code)
    if not quiz:
        raise HTTPException(404, "Quiz not found")
    if quiz.get("status") == "ended":
        raise HTTPException(400, "This quiz has ended")
    if quiz.get("status") != "active":
        raise HTTPException(400, "This quiz is not active")
    count = await db.participants.count_documents({"quizCode": code})
    return {"title": quiz["title"], "questionsCount": quiz.get("questionsCount", 0), "participantCount": count}


@app.get("/api/quiz/{code}/info")
async def get_quiz_info(code: str):
    """Public endpoint: get quiz info for lobby (no auth required)"""
    try:
        quiz = await get_quiz_with_cache(code)
        if not quiz:
            raise HTTPException(404, "Quiz not found")

        return {
            "title": quiz.get("title", ""),
            "description": quiz.get("description", ""),
            "questionsCount": quiz.get("questionsCount", 0),
            "duration": quiz.get("duration", 0),
            "status": quiz.get("status", "active"),
            "code": quiz.get("code", code),
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get quiz info error: {e}")
        raise HTTPException(500, "Failed to fetch quiz info")


@app.get("/api/quiz/{code}/participants/public")
async def get_quiz_participants_public(code: str):
    """Public endpoint: get participant list for lobby (no auth required)"""
    try:
        quiz = await get_quiz_with_cache(code)
        if not quiz:
            raise HTTPException(404, "Quiz not found")

        parts = (
            await db.participants.find(
                {"quizCode": code},
                {"_id": 0, "id": 1, "name": 1, "avatarSeed": 1, "joinedAt": 1, "score": 1},
            )
            .sort("joinedAt", 1)
            .to_list(config.MAX_PARTICIPANTS)
        )
        return {"participants": parts, "count": len(parts)}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get public participants error: {e}")
        raise HTTPException(500, "Failed to fetch participants")


@app.get("/api/leaderboard/{code}", response_model=List[LeaderboardEntry])
async def get_leaderboard(code: str):
    try:
        return await calc_leaderboard(code)
    except Exception as e:
        logger.error(f"Leaderboard error: {e}")
        raise HTTPException(500, "Failed to fetch leaderboard")


@app.get("/api/quiz/{code}/question/{index}/stats")
async def get_question_stats(code: str, index: int):
    """Get answer distribution for a specific question"""
    if manager and code in manager.room_state:
        stats = manager.room_state[code].get("question_answer_stats", {}).get(index, {})
        return {"stats": stats}
    return {"stats": {}}


@app.get("/api/quiz/{code}/my-results/{participant_id}")
async def get_my_results(code: str, participant_id: str):
    """Personal performance breakdown for a participant"""
    try:
        p = await db.participants.find_one(
            {"id": participant_id, "quizCode": code}, {"_id": 0}
        )
        if not p:
            raise HTTPException(404, "Participant not found")

        questions = await get_questions_with_cache(code)
        leaderboard = await calc_leaderboard(code)

        my_rank = 0
        for i, entry in enumerate(leaderboard):
            if entry.get("participantId") == participant_id:
                my_rank = i + 1
                break

        total_players = len(leaderboard)
        answers = p.get("answers", [])
        correct_count = sum(1 for a in answers if a.get("isCorrect"))
        total_answered = len(answers)
        accuracy = round((correct_count / total_answered * 100) if total_answered else 0, 1)
        avg_time = round(p.get("totalTime", 0) / max(total_answered, 1), 2)

        return {
            "name": p.get("name"),
            "score": p.get("score", 0),
            "rank": my_rank,
            "totalPlayers": total_players,
            "correctAnswers": correct_count,
            "totalQuestions": len(questions),
            "accuracy": accuracy,
            "averageTimePerQuestion": avg_time,
            "answers": answers,
            "avatarSeed": p.get("avatarSeed", ""),
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"My results error: {e}")
        raise HTTPException(500, "Failed to fetch results")


@app.get("/api/quiz/{code}/final-results")
async def get_final_results(code: str):
    try:
        # Parallel queries
        leaderboard_task = calc_leaderboard(code)
        questions_task = get_questions_with_cache(code)
        parts_task = db.participants.find({"quizCode": code}, {"_id": 0}).to_list(
            config.MAX_PARTICIPANTS
        )

        leaderboard, questions, parts = await asyncio.gather(
            leaderboard_task, questions_task, parts_task
        )

        total_q = len(questions)
        completed = [p for p in parts if p.get("completedAt")]
        avg_score = sum(p.get("score", 0) for p in parts) / len(parts) if parts else 0
        completion_rate = (len(completed) / len(parts) * 100) if parts else 0

        return {
            "winners": leaderboard[:3] if len(leaderboard) >= 3 else leaderboard,
            "stats": {
                "totalParticipants": len(parts),
                "totalQuestions": total_q,
                "averageScore": int(avg_score),
                "completionRate": int(completion_rate),
            },
        }
    except Exception as e:
        logger.error(f"Final results error: {e}")
        raise HTTPException(500, "Failed to fetch final results")


# ============================================================================
# STATE RECOVERY ENDPOINT
# ============================================================================


@app.get("/api/quiz/{code}/state")
async def get_quiz_state(code: str, participantId: Optional[str] = None):
    """Get current quiz state for recovery when app returns from background"""
    try:
        if not manager:
            raise HTTPException(503, "WebSocket manager not available")

        room_state = manager.get_room_state(code)

        # If participant ID provided, include their specific data
        if participantId:
            participant = await db.participants.find_one(
                {"id": participantId, "quizCode": code}, {"_id": 0}
            )
            if participant:
                room_state["participant"] = participant
                room_state["participant_score"] = participant.get("score", 0)

        return room_state

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get quiz state error: {e}")
        raise HTTPException(500, "Failed to get quiz state")


# ============================================================================
# ULTRA-FAST WEBSOCKET WITH STATE RECOVERY
# ============================================================================


async def _time_warning_task(quiz_code: str, question_index: int, time_limit: int, mgr: ConnectionManager):
    """ENHANCED: Enhancement 4 — Broadcast time_warning 5 seconds before question ends."""
    try:
        delay = max(0, time_limit - 5)
        await asyncio.sleep(delay)
        # Only broadcast if still on the same question in QUESTION state
        if (mgr.get_state(quiz_code) == QuizState.QUESTION
                and mgr.get_question(quiz_code) == question_index):
            await mgr.broadcast(quiz_code, {
                "type": "time_warning",
                "quiz_code": quiz_code,
                "question_index": question_index,
                "seconds_remaining": 5,
            })
    except asyncio.CancelledError:
        pass
    except Exception as e:
        logger.error(f"time_warning_task error: {e}")


async def handle_start_quiz(quiz_code: str, mgr: ConnectionManager):
    """Background task: 5-second countdown then send Q1.
    BUG 5 / CHANGE 3: Per-room start guard prevents double-start."""
    # BUG 5: Check start guard — prevent double-click from firing two countdowns
    if quiz_code in mgr._starting:
        logger.warning(f"handle_start_quiz called twice for {quiz_code} — ignoring")
        return
    mgr._starting.add(quiz_code)
    try:
        questions = await get_questions_with_cache(quiz_code)
        if not questions:
            logger.error(f"No questions found for {quiz_code}")
            return

        total = len(questions)
        mgr.set_total_questions(quiz_code, total)

        # Immediately mark state as 'starting' so sync_state tells
        # reconnecting / late-joining players to navigate to quiz page
        mgr.set_state(quiz_code, "starting")

        # Broadcast countdown start
        await mgr.broadcast(quiz_code, {
            "type": "countdown_start",
            "countdown": 5,
            "total_questions": total,
            "server_time": int(time.time() * 1000),
        }, priority=True)

        # Tick 5 → 1
        for i in range(4, 0, -1):
            await asyncio.sleep(1)
            await mgr.broadcast(quiz_code, {
                "type": "countdown_tick",
                "countdown": i,
            })

        await asyncio.sleep(1)  # final second

        # Now start Q1
        first_question = questions[0]
        first_time_limit = int(
            first_question.get("timeLimit", first_question.get("time_limit", 30))
        )

        mgr.set_state(quiz_code, QuizState.QUESTION)
        mgr.set_question(quiz_code, 0, first_time_limit)

        question_start_time = mgr.get_question_start_time(quiz_code)
        server_time = int(time.time() * 1000)

        # Strip correctAnswer for broadcast
        safe_question = {
            k: v for k, v in first_question.items() if k != "correctAnswer"
        }

        await mgr.broadcast(quiz_code, {
            "type": "quiz_starting",
            "quiz_state": QuizState.QUESTION,
            "current_question": 0,
            "question_number": 1,
            "total_questions": total,
            "question": safe_question,
            "time_limit": first_time_limit,
            "server_time": server_time,
            "question_start_time": question_start_time,
        }, priority=True)

        # ENHANCED: Enhancement 4 — spawn time warning task for first question
        asyncio.create_task(_time_warning_task(quiz_code, 0, first_time_limit, mgr))

        logger.info(
            f"✓ Quiz started: {quiz_code} Q0 limit={first_time_limit}s @ {question_start_time}"
        )

    except Exception as e:
        logger.error(f"handle_start_quiz error: {e}", exc_info=True)
    finally:
        # BUG 5: Always remove start guard so quiz can be restarted if needed
        mgr._starting.discard(quiz_code)


@app.websocket("/ws/{quiz_code}")
async def websocket_endpoint(websocket: WebSocket, quiz_code: str):
    user_id = None
    is_admin = False

    # Quick check if quiz ended
    quiz = await get_quiz_with_cache(quiz_code)
    if quiz and quiz.get("status") == "ended":
        await websocket.close(code=1008, reason="Quiz has ended")
        return

    try:
        await manager.connect(websocket, quiz_code)

        # CHANGE 7: 45s receive timeout — if client sends nothing in 45s, close cleanly
        # so client reconnects immediately instead of hanging.
        while True:
            try:
                data = await asyncio.wait_for(websocket.receive_text(), timeout=45.0)
            except asyncio.TimeoutError:
                # No message in 45s — client is silent, close cleanly
                logger.info(f"WS idle timeout: {quiz_code}/{user_id}")
                break
            except (WebSocketDisconnect, RuntimeError):
                break

            try:
                msg = json.loads(data)
            except (json.JSONDecodeError, ValueError):
                continue

            msg_type = msg.get("type")

            if msg_type == "admin_joined":
                is_admin = True
                user_id = f"admin_{quiz_code}"
                manager.set_admin(quiz_code, websocket)

                # Get question count from cache
                questions = await get_questions_with_cache(quiz_code)
                q_count = len(questions)
                manager.set_total_questions(quiz_code, q_count)

                logger.info(f"✓ Admin joined: {quiz_code}")

                # Load participants
                parts = await db.participants.find(
                    {"quizCode": quiz_code}, {"_id": 0}
                ).to_list(config.MAX_PARTICIPANTS)

                for p in parts:
                    manager.add_participant(quiz_code, p)

                room_state = manager.get_room_state(quiz_code)

                await websocket.send_json(
                    {
                        "type": "all_participants",
                        "participants": parts,
                        **room_state,
                    }
                )

            elif msg_type == "participant_joined":
                participant_id = msg.get("participantId")
                if participant_id:
                    user_id = participant_id

                    # CHANGE 5: Try rehydrating room state from Redis if process restarted
                    await manager._try_rehydrate_from_redis(quiz_code)

                    # REL-4: Wrap DB call with connection error handling
                    try:
                        p = await asyncio.wait_for(
                            db.participants.find_one({"id": participant_id}, {"_id": 0}),
                            timeout=5.0
                        )
                    except (pymongo.errors.ConnectionFailure, pymongo.errors.ServerSelectionTimeoutError, asyncio.TimeoutError) as e:
                        logger.warning(f"MongoDB error in participant_joined: {e}")
                        await websocket.send_json({"type": "server_error", "message": "Database busy — please retry"})
                        p = None

                    if p:
                        # ENHANCED: Enhancement 6 — detect reconnection
                        existing = manager.room_state.get(quiz_code, {}).get("participants", {}).get(participant_id)
                        is_reconnect = existing and "disconnected_at" in existing

                        # PERF FIX 4: Cancel pending purge task on reconnect
                        purge_key = f"{quiz_code}:{participant_id}"
                        if purge_key in manager._purge_tasks:
                            manager._purge_tasks[purge_key].cancel()
                            manager._purge_tasks.pop(purge_key, None)

                        manager.add_participant(quiz_code, p)
                        # Clear disconnected_at flag on reconnect
                        if is_reconnect and quiz_code in manager.room_state:
                            manager.room_state[quiz_code]["participants"][participant_id].pop("disconnected_at", None)

                        # PERF FIX 1: Update lastActive only on WS connect
                        await update_participant_active(participant_id)

                        # Send instant state sync with full details
                        room_state = manager.get_room_state(quiz_code)
                        current_idx = room_state["current_question"]

                        # Get current question data if in question or answer_reveal state
                        current_question_data = None
                        if room_state["quiz_state"] in (QuizState.QUESTION, QuizState.ANSWER_REVEAL):
                            questions = await get_questions_with_cache(quiz_code)
                            if current_idx < len(questions):
                                q = questions[current_idx]
                                # Remove correct answer for participants
                                current_question_data = {
                                    k: v
                                    for k, v in q.items()
                                    if k != "correctAnswer"
                                }

                        sync_msg = {
                            "type": "sync_state",
                            **room_state,
                            "question_number": current_idx + 1,
                            "current_question_data": current_question_data,
                            "question": current_question_data,
                            "reconnected": bool(is_reconnect),
                            # MASS-JOIN FIX 8: Send full participant list so new joiner
                            # sees everyone already in lobby, not just subsequent joins
                            "all_participants": manager.get_all_participants(quiz_code),
                        }

                        # If in leaderboard state, tell client to redirect
                        if room_state["quiz_state"] in [QuizState.LEADERBOARD, QuizState.FINAL_LEADERBOARD]:
                            sync_msg["redirect_leaderboard"] = True
                            sync_msg["is_final"] = room_state["quiz_state"] == QuizState.FINAL_LEADERBOARD
                        elif room_state["quiz_state"] == QuizState.PODIUM:
                            sync_msg["redirect_podium"] = True

                        await websocket.send_json(sync_msg)

                        # ENHANCED: Enhancement 6 — broadcast reconnection or join
                        if is_reconnect:
                            await manager.broadcast(
                                quiz_code,
                                {
                                    "type": "participant_reconnected",
                                    "participantId": participant_id,
                                    "name": p.get("name", "Unknown"),
                                },
                            )
                            logger.info(f"✓ Participant {p['name']} reconnected to {quiz_code}")
                        else:
                            # Broadcast to others
                            await manager.broadcast(
                                quiz_code,
                                {
                                    "type": "participant_joined",
                                    "participant": {
                                        "id": p["id"],
                                        "name": p["name"],
                                        "avatarSeed": p.get("avatarSeed", ""),
                                    },
                                },
                            )
                            logger.info(f"✓ Participant {p['name']} joined {quiz_code}")

            elif msg_type == "request_state_sync":
                # Handle explicit state sync request (for app return from background)
                room_state = manager.get_room_state(quiz_code)
                current_idx = room_state["current_question"]

                # Get current question data if needed
                current_question_data = None
                if room_state["quiz_state"] in (QuizState.QUESTION, QuizState.ANSWER_REVEAL):
                    questions = await get_questions_with_cache(quiz_code)
                    if current_idx < len(questions):
                        q = questions[current_idx]
                        if not is_admin:
                            current_question_data = {
                                k: v for k, v in q.items() if k != "correctAnswer"
                            }
                        else:
                            current_question_data = q

                sync_msg = {
                    "type": "sync_state",
                    **room_state,
                    "question_number": current_idx + 1,
                    "current_question_data": current_question_data,
                    "question": current_question_data,
                }

                # If in leaderboard state, tell client to redirect
                if room_state["quiz_state"] in [QuizState.LEADERBOARD, QuizState.FINAL_LEADERBOARD]:
                    sync_msg["redirect_leaderboard"] = True
                    sync_msg["is_final"] = room_state["quiz_state"] == QuizState.FINAL_LEADERBOARD
                elif room_state["quiz_state"] == QuizState.PODIUM:
                    sync_msg["redirect_podium"] = True

                await websocket.send_json(sync_msg)

            elif msg_type == "quiz_starting":
                if is_admin:
                    # Run countdown + first question as a background task
                    # so we don't block the WS handler
                    asyncio.create_task(
                        handle_start_quiz(quiz_code, manager)
                    )

            elif msg_type == "auto_submit":
                participant_id = msg.get("participantId")
                if participant_id:
                    manager.mark_answered(quiz_code, participant_id)
                    # PERF FIX 2: Debounced answer_count broadcast
                    await manager.broadcast_answer_count_debounced(quiz_code)

            elif msg_type == "show_answer":
                if is_admin:
                    manager.set_state(quiz_code, QuizState.ANSWER_REVEAL)
                    manager.set_show_answers(quiz_code, True)

                    await manager.broadcast(
                        quiz_code,
                        {
                            "type": "show_answer",
                            "quiz_state": QuizState.ANSWER_REVEAL,
                            "server_time": int(time.time() * 1000),
                        },
                        priority=True,
                    )
                    logger.info(f"✓ Showing answers: {quiz_code}")

            elif msg_type == "show_leaderboard":
                if is_admin:
                    current_q = manager.get_question(quiz_code)
                    total_q = manager.room_state[quiz_code]["total_questions"]

                    if current_q >= total_q - 1:
                        manager.set_state(quiz_code, QuizState.FINAL_LEADERBOARD)
                    else:
                        manager.set_state(quiz_code, QuizState.LEADERBOARD)

                    is_final = current_q >= total_q - 1
                    await manager.broadcast(
                        quiz_code,
                        {
                            "type": "show_leaderboard",
                            "quiz_state": manager.get_state(quiz_code),
                            "current_question": current_q,
                            "question_number": current_q + 1,  # 1-indexed for display
                            "total_questions": total_q,
                            "is_final": is_final,
                            "server_time": int(time.time() * 1000),
                        },
                        priority=True,
                    )
                    logger.info(f"Show leaderboard: Q{current_q+1}/{total_q}, final={is_final}")

            elif msg_type == "next_question":
                if is_admin:
                    current_q = manager.get_question(quiz_code)
                    total_q = manager.room_state[quiz_code]["total_questions"]
                    next_q = current_q + 1

                    if next_q < total_q:
                        # Get question data FIRST to know time_limit
                        questions = await get_questions_with_cache(quiz_code)
                        next_question = (
                            questions[next_q] if next_q < len(questions) else None
                        )
                        next_time_limit = int(
                            next_question.get("timeLimit", next_question.get("time_limit", 30))
                        ) if next_question else 30

                        # Set question WITH time_limit
                        manager.set_question(quiz_code, next_q, next_time_limit)
                        manager.clear_answers(quiz_code)
                        manager.set_state(quiz_code, QuizState.QUESTION)

                        question_start_time = manager.get_question_start_time(
                            quiz_code
                        )
                        server_time = int(time.time() * 1000)

                        # Strip correctAnswer for the broadcast
                        safe_question = {
                            k: v for k, v in next_question.items()
                            if k != "correctAnswer"
                        } if next_question else None

                        await manager.broadcast(
                            quiz_code,
                            {
                                "type": "next_question",
                                "quiz_state": QuizState.QUESTION,
                                "current_question": next_q,
                                "question_number": next_q + 1,
                                "total_questions": total_q,
                                "question": safe_question,
                                "time_limit": next_time_limit,
                                "server_time": server_time,
                                "question_start_time": question_start_time,
                            },
                            priority=True,
                        )
                        # ENHANCED: Enhancement 4 — spawn time warning task
                        asyncio.create_task(
                            _time_warning_task(quiz_code, next_q, next_time_limit, manager)
                        )
                        logger.info(
                            f"✓ Next question {next_q}: {quiz_code} limit={next_time_limit}s @ {question_start_time}"
                        )
                    else:
                        # ENHANCED: Enhancement 5 — podium with full stats
                        manager.set_state(quiz_code, QuizState.PODIUM)
                        leaderboard = await calc_leaderboard(quiz_code)
                        total_participants = len(leaderboard)
                        winners = []
                        for entry in leaderboard[:3]:
                            # Fetch participant to compute accuracy and longest streak
                            part = await db.participants.find_one(
                                {"id": entry.get("participantId"), "quizCode": quiz_code},
                                {"_id": 0}
                            )
                            answers = part.get("answers", []) if part else []
                            correct_count = sum(1 for a in answers if a.get("isCorrect"))
                            total_answered = len(answers)
                            accuracy = round((correct_count / total_answered * 100) if total_answered else 0, 1)
                            # Compute longest streak of consecutive correct answers
                            longest_streak = 0
                            current_s = 0
                            for a in answers:
                                if a.get("isCorrect"):
                                    current_s += 1
                                    if current_s > longest_streak:
                                        longest_streak = current_s
                                else:
                                    current_s = 0
                            winners.append({
                                **entry,
                                "correctAnswers": correct_count,
                                "accuracy": accuracy,
                                "longestStreak": longest_streak,
                            })
                        await manager.broadcast(
                            quiz_code,
                            {
                                "type": "show_podium",
                                "quiz_state": QuizState.PODIUM,
                                "winners": winners,
                                "totalParticipants": total_participants,
                                "server_time": int(time.time() * 1000),
                            },
                            priority=True,
                        )
                        logger.info(f"✓ Showing podium: {quiz_code} (top {len(winners)} winners)")

            elif msg_type == "ping":
                await websocket.send_json(
                    {
                        "type": "pong",
                        "t": int(time.time() * 1000),
                        "clientTime": msg.get("clientTime") or msg.get("t"),
                        "serverTime": int(time.time() * 1000)
                    }
                )
            elif msg_type == "pong":
                # FIX 12: Per-room pong tracking
                if user_id:
                    if quiz_code not in manager._last_pong:
                        manager._last_pong[quiz_code] = {}
                    manager._last_pong[quiz_code][user_id] = time.time()

            elif msg_type == "reaction":
                allowed = ["🔥", "😱", "👏", "💪", "🤔", "😂", "🎉", "⚡"]
                emoji = msg.get("emoji", "")
                if emoji in allowed and user_id and not is_admin:
                    # Rate limit: max 1 reaction per 2 seconds per user
                    now = time.time()
                    last_reaction = manager.room_state.get(quiz_code, {}).get("last_reaction", {}).get(user_id, 0)
                    if now - last_reaction >= 2.0:
                        if quiz_code in manager.room_state:
                            if "last_reaction" not in manager.room_state[quiz_code]:
                                manager.room_state[quiz_code]["last_reaction"] = {}
                            manager.room_state[quiz_code]["last_reaction"][user_id] = now

                        await manager.broadcast(quiz_code, {
                            "type": "reaction",
                            "emoji": emoji,
                            "userId": user_id[:8],
                        })

            elif msg_type == "kick_player":
                if is_admin:
                    kick_id = msg.get("participantId")
                    kick_reason = msg.get("reason") or "Removed by host"  # ENHANCED: Enhancement 8
                    if kick_id:
                        # Remove from DB
                        kicked = await db.participants.find_one_and_delete(
                            {"id": kick_id, "quizCode": quiz_code},
                            {"_id": 0, "name": 1, "id": 1},
                        )
                        if kicked:
                            # Decrement participant count
                            await db.quizzes.update_one(
                                {"code": quiz_code},
                                {"$inc": {"participantCount": -1}},
                            )
                            # Remove from in-memory participants
                            if quiz_code in manager.room_state:
                                participants = manager.room_state[quiz_code].get("participants", {})
                                participants.pop(kick_id, None)

                            # ENHANCED: Enhancement 8 — send you_were_kicked to player before closing
                            if kick_id in manager.user_sockets:
                                kick_ws = manager.user_sockets[kick_id]
                                try:
                                    await kick_ws.send_json({
                                        "type": "you_were_kicked",
                                        "reason": kick_reason,
                                    })
                                except Exception:
                                    pass

                            # Broadcast kick event to all clients (with reason)
                            await manager.broadcast(
                                quiz_code,
                                {
                                    "type": "participant_kicked",
                                    "participantId": kick_id,
                                    "name": kicked.get("name", "Unknown"),
                                    "reason": kick_reason,  # ENHANCED: Enhancement 8
                                },
                                priority=True,
                            )

                            # Close the kicked player's WebSocket
                            if kick_id in manager.user_sockets:
                                kick_ws = manager.user_sockets[kick_id]
                                try:
                                    await kick_ws.close(
                                        code=4001, reason=kick_reason or "Kicked by admin"
                                    )
                                except Exception:
                                    pass

                            logger.info(
                                f"✓ Kicked player {kicked.get('name')} from {quiz_code} (reason: {kick_reason})"
                            )

    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected: {quiz_code}")
    except RuntimeError:
        logger.info(f"WebSocket runtime error (closed): {quiz_code}")
    except Exception as e:
        logger.error(f"WebSocket error: {e}", exc_info=True)
    finally:
        manager.disconnect(websocket, quiz_code, user_id)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "server:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", 8000)),
        reload=True,
        log_level="info",
        ws_ping_interval=20,
        ws_ping_timeout=45,
    )
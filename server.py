"""
Prashnify Backend - PRODUCTION OPTIMIZED v3
Fixed: Timer sync, real-time updates, state recovery, performance
Added: Redis caching, orjson serialization, uvloop
"""

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, Query, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Dict, Set, Union
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

# JWT handling
import jwt as pyjwt

# Fast JSON serialization
try:
    import orjson
    def fast_dumps(obj):
        return orjson.dumps(obj).decode("utf-8")
    print("✓ orjson enabled")
except ImportError:
    import json
    def fast_dumps(obj):
        return json.dumps(obj, separators=(',', ':'))

import json  # still needed for json.loads

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
    WS_HEARTBEAT_SEC = 15
    WS_TIMEOUT_SEC = 25
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
mongo_client = None
db = None
manager = None
redis_client = None

# ============================================================================
# IN-MEMORY CACHE FOR QUIZ DATA
# ============================================================================


class QuizCache:
    """Hybrid Redis + in-memory cache for quiz data.
    Uses Redis as primary cache, falls back to in-memory if Redis unavailable.
    """

    def __init__(self):
        # In-memory fallback
        self._mem_quiz: Dict[str, Dict] = {}
        self._mem_questions: Dict[str, List[Dict]] = {}
        self._mem_timestamps: Dict[str, float] = {}

    async def get_quiz(self, code: str) -> Optional[Dict]:
        # Try Redis first
        if redis_client:
            try:
                data = await redis_client.get(f"quiz:{code}")
                if data:
                    return orjson.loads(data) if 'orjson' in dir() else json.loads(data)
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
                    return orjson.loads(data) if 'orjson' in dir() else json.loads(data)
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
        self._mem_quiz.pop(code, None)
        self._mem_questions.pop(code, None)
        self._mem_timestamps.pop(f"quiz_{code}", None)
        self._mem_timestamps.pop(f"questions_{code}", None)
        if redis_client:
            try:
                await redis_client.delete(f"quiz:{code}", f"questions:{code}", f"leaderboard:{code}")
            except Exception:
                pass

    async def get_leaderboard(self, code: str) -> Optional[List[Dict]]:
        if redis_client:
            try:
                data = await redis_client.get(f"leaderboard:{code}")
                if data:
                    return orjson.loads(data) if 'orjson' in dir() else json.loads(data)
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
        self.heartbeat_tasks: Dict[str, asyncio.Task] = {}
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

    async def connect(self, websocket: WebSocket, quiz_code: str, user_id: str = None):
        """Connect WebSocket with instant acknowledgment + rate limiting"""
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

            # Rate limiting: max 10 connections per second per room
            now = time.time()
            self._connection_rate[quiz_code] = [
                t for t in self._connection_rate[quiz_code] if now - t < 1.0
            ]
            if len(self._connection_rate[quiz_code]) >= 10:
                await websocket.close(code=1013, reason="Too many connections")
                return False
            self._connection_rate[quiz_code].append(now)

            # Initialize room
            if quiz_code not in self.active_connections:
                self.active_connections[quiz_code] = set()
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
                    "question_answer_stats": {},  # {questionIndex: {optionStr: count}}
                }
                # Create broadcast queue and task
                self._broadcast_queue[quiz_code] = asyncio.Queue()
                self._broadcast_tasks[quiz_code] = asyncio.create_task(
                    self._broadcast_worker(quiz_code)
                )
                # Start dead connection cleanup
                self._cleanup_tasks[quiz_code] = asyncio.create_task(
                    self._cleanup_dead_connections(quiz_code)
                )

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

                # Setup heartbeat
                if user_id in self.heartbeat_tasks:
                    self.heartbeat_tasks[user_id].cancel()

                task = asyncio.create_task(self._heartbeat(websocket, user_id))
                self.heartbeat_tasks[user_id] = task

            logger.info(
                f"✓ Connected: {quiz_code} ({len(self.active_connections[quiz_code])} total)"
            )
            return True

    def disconnect(self, websocket: WebSocket, quiz_code: str, user_id: str = None):
        """Instant disconnect with cleanup"""
        if quiz_code in self.active_connections:
            self.active_connections[quiz_code].discard(websocket)

            if not self.active_connections[quiz_code]:
                # Cleanup room
                del self.active_connections[quiz_code]
                if quiz_code in self.room_state:
                    del self.room_state[quiz_code]
                if quiz_code in self._broadcast_queue:
                    del self._broadcast_queue[quiz_code]
                if quiz_code in self._broadcast_tasks:
                    self._broadcast_tasks[quiz_code].cancel()
                    del self._broadcast_tasks[quiz_code]
                if quiz_code in self._cleanup_tasks:
                    self._cleanup_tasks[quiz_code].cancel()
                    del self._cleanup_tasks[quiz_code]

        if user_id:
            if self.user_sockets.get(user_id) == websocket:
                self.user_sockets.pop(user_id, None)

            if user_id in self.heartbeat_tasks:
                self.heartbeat_tasks[user_id].cancel()
                del self.heartbeat_tasks[user_id]

            if quiz_code in self.room_state:
                self.room_state[quiz_code]["participants"].pop(user_id, None)
                self.room_state[quiz_code]["answered"].discard(user_id)

                if self.room_state[quiz_code].get("admin_socket") == websocket:
                    self.room_state[quiz_code]["admin_socket"] = None

        logger.info(f"✗ Disconnected: {quiz_code}")

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
        """Send batch of messages efficiently"""
        if quiz_code not in self.active_connections or not messages:
            return

        dead_sockets = []
        connections = list(self.active_connections[quiz_code])

        # For single message, send directly
        if len(messages) == 1:
            data = json.dumps(messages[0])
            tasks = [
                self._send_message(conn, data, dead_sockets) for conn in connections
            ]
        else:
            # For multiple messages, send as batch
            data = json.dumps({"type": "batch", "messages": messages})
            tasks = [
                self._send_message(conn, data, dead_sockets) for conn in connections
            ]

        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)

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
        """Instant broadcast via queue with optional priority"""
        if quiz_code in self._broadcast_queue:
            await self._broadcast_queue[quiz_code].put(message)
            self._message_count[quiz_code] += 1

    async def send_to_user(self, user_id: str, message: dict):
        """Send message to specific user"""
        if user_id in self.user_sockets:
            try:
                await self.user_sockets[user_id].send_json(message)
            except Exception as e:
                logger.error(f"Failed to send to {user_id}: {e}")

    async def _heartbeat(self, ws: WebSocket, user_id: str):
        """Optimized heartbeat"""
        try:
            while True:
                await asyncio.sleep(config.WS_HEARTBEAT_SEC)
                try:
                    await ws.send_json({"type": "ping", "t": int(time.time() * 1000)})
                except:
                    break
        except asyncio.CancelledError:
            pass

    async def _cleanup_dead_connections(self, quiz_code: str):
        """Periodic cleanup of zombie WebSocket connections every 30s"""
        try:
            while quiz_code in self.active_connections:
                await asyncio.sleep(30)
                if quiz_code not in self.active_connections:
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
        except asyncio.CancelledError:
            pass

    # State methods - All instant
    def set_state(self, quiz_code: str, state: str):
        """Instant state change"""
        if quiz_code in self.room_state:
            self.room_state[quiz_code]["quiz_state"] = state
            logger.info(f"State: {quiz_code} -> {state}")

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

            del self.active_connections[quiz_code]
            if quiz_code in self.room_state:
                del self.room_state[quiz_code]

    def get_performance_stats(self) -> dict:
        """Get performance statistics"""
        current_time = time.time()
        elapsed = current_time - self._last_reset

        stats = {
            "active_rooms": len(self.active_connections),
            "total_connections": sum(
                len(conns) for conns in self.active_connections.values()
            ),
            "messages_per_second": (
                sum(self._message_count.values()) / elapsed if elapsed > 0 else 0
            ),
            "room_details": {},
        }

        for code in self.active_connections:
            stats["room_details"][code] = {
                "connections": len(self.active_connections[code]),
                "participants": len(
                    self.room_state.get(code, {}).get("participants", {})
                ),
                "state": self.room_state.get(code, {}).get("quiz_state", "unknown"),
            }

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
        mongo_client = AsyncIOMotorClient(
            config.MONGO_URL,
            serverSelectionTimeoutMS=5000,
            connectTimeoutMS=5000,
            socketTimeoutMS=10000,
            maxPoolSize=200,
            minPoolSize=20,
            maxIdleTimeMS=10000,
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
        await db.participants.create_index([("id", 1), ("quizCode", 1)])
        await db.participants.create_index("quizCode")
        await db.participants.create_index(
            [("quizCode", 1), ("score", -1)]
        )  # For leaderboard
        await db.questions.create_index([("quizCode", 1), ("index", 1)])
        await db.admins.create_index("username", unique=True)
        logger.info("✓ Database indexes created")
    except Exception as e:
        logger.error(f"Index creation error: {e}")

    # Seed default admin user
    try:
        existing_admin = await db.admins.find_one({"username": config.ADMIN_USERNAME})
        if not existing_admin:
            hashed_pw = hashlib.sha256(config.ADMIN_PASSWORD.encode()).hexdigest()
            await db.admins.insert_one({
                "username": config.ADMIN_USERNAME,
                "password": hashed_pw,
                "role": "admin",
                "createdAt": datetime.now(timezone.utc).isoformat(),
            })
            logger.info(f"✓ Default admin user '{config.ADMIN_USERNAME}' created")
        else:
            # Update password if env var changed
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

    manager = ConnectionManager()
    logger.info("✓ Prashnify API ready (PRODUCTION v2)")

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

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True if _cors_origins != ["*"] else False,
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
    try:
        p = await db.participants.find_one({"id": pid, "quizCode": code}, {"_id": 0})
        if p:
            # Update last active asynchronously
            await db.participants.update_one(
                {"id": pid},
                {"$set": {"lastActive": datetime.now(timezone.utc).isoformat()}},
            )
        return p
    except Exception as e:
        logger.error(f"Verify participant error: {e}")
        return None


async def is_avatar_unique(
    quiz_code: str, seed: str, exclude_participant: str = None
) -> bool:
    try:
        query = {"quizCode": quiz_code, "avatarSeed": seed}
        if exclude_participant:
            query["id"] = {"$ne": exclude_participant}
        existing = await db.participants.find_one(query, {"_id": 1})
        return existing is None
    except Exception as e:
        logger.error(f"Avatar uniqueness check error: {e}")
        return True


async def generate_unique_avatar(
    quiz_code: str, exclude_participant: str = None
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
) -> tuple[int, int, int]:
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

    base_points = max_base // 2
    time_limit = question.get("timeLimit", 30)

    if time_limit == 0:
        return max_base, 0, 0

    # Quadratic speed bonus — rewards fast answers much more
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

    current_streak = consecutive_correct + 1  # +1 for current correct answer
    subtotal = base_points + time_bonus

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
    
    Ranking rules:
    - Primary sort: score DESC
    - Secondary sort: totalTime ASC (faster = higher rank)
    - Players with identical score AND totalTime get the same rank
    """
    try:
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

        return result
    except Exception as e:
        logger.error(f"Calculate leaderboard error: {e}")
        return []


async def get_quiz_with_cache(code: str) -> Optional[Dict]:
    """Get quiz with caching"""
    cached = await quiz_cache.get_quiz(code)
    if cached:
        return cached

    quiz = await db.quizzes.find_one({"code": code}, {"_id": 0})
    if quiz:
        await quiz_cache.set_quiz(code, quiz)
    return quiz


async def get_questions_with_cache(code: str) -> List[Dict]:
    """Get questions with caching"""
    cached = await quiz_cache.get_questions(code)
    if cached:
        return cached

    questions = (
        await db.questions.find({"quizCode": code}, {"_id": 0})
        .sort("index", 1)
        .to_list(100)
    )
    if questions:
        await quiz_cache.set_questions(code, questions)
    return questions


# ============================================================================
# API ROUTES
# ============================================================================


@app.get("/")
async def root():
    return {
        "name": "Prashnify API",
        "version": "4.0.0-PRODUCTION",
        "status": "active",
        "features": ["time-sync", "state-recovery", "performance-optimized", "admin-auth"],
    }


@app.get("/health")
async def health():
    status = {"status": "healthy", "services": {}}
    try:
        await db.command("ping")
        status["services"]["mongodb"] = "connected"
    except Exception as e:
        status["services"]["mongodb"] = f"error: {str(e)}"
        status["status"] = "degraded"

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
    """Admin login - validates credentials and returns JWT token"""
    try:
        hashed_pw = hashlib.sha256(data.password.encode()).hexdigest()
        admin = await db.admins.find_one({
            "username": data.username,
            "password": hashed_pw,
        })

        if not admin:
            raise HTTPException(status_code=401, detail="Invalid username or password")

        token = create_admin_token(data.username)
        logger.info(f"\u2713 Admin login: {data.username}")
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
        quiz_cache.invalidate(code)

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

        quiz_cache.invalidate(code)

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


@app.post("/api/join", response_model=Participant)
async def join_quiz(data: ParticipantJoin):
    try:
        if not data.name or not data.name.strip():
            raise HTTPException(400, "Name is required")

        if len(data.name) > 50:
            raise HTTPException(400, "Name too long (max 50 characters)")

        quiz = await get_quiz_with_cache(data.quizCode)
        if not quiz:
            raise HTTPException(404, "Quiz not found")

        if quiz.get("status") == "ended":
            raise HTTPException(400, "Quiz has ended")

        if quiz.get("status") != "active":
            raise HTTPException(400, f"Quiz is {quiz.get('status')}")

        existing_count = await db.participants.count_documents(
            {"quizCode": data.quizCode, "name": data.name.strip()}
        )

        if existing_count >= quiz.get("allowedAttempts", 1):
            raise HTTPException(400, "Maximum attempts reached")

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
            "attemptNumber": existing_count + 1,
            "completedAt": None,
        }

        # Insert and update in parallel
        await asyncio.gather(
            db.participants.insert_one(pdoc),
            db.quizzes.update_one(
                {"code": data.quizCode},
                {
                    "$inc": {"participantCount": 1},
                    "$set": {"lastPlayed": datetime.now(timezone.utc).isoformat()},
                },
            ),
        )

        logger.info(f"✓ Participant joined: {data.name} -> {data.quizCode}")
        return Participant(**pdoc)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Join error: {e}")
        raise HTTPException(500, "Failed to join quiz")


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

        # Parallel fetch of quiz, question, and participant
        quiz_task = get_quiz_with_cache(ans.quizCode)
        question_task = db.questions.find_one(
            {"quizCode": ans.quizCode, "index": ans.questionIndex}, {"_id": 0}
        )
        participant_task = verify_participant(ans.participantId, ans.quizCode)

        quiz, q, p = await asyncio.gather(quiz_task, question_task, participant_task)

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

        update_doc = {
            "$inc": {"score": total_pts, "totalTime": ans.timeTaken},
            "$push": {"answers": ans_rec},
            "$set": {
                "lastActive": datetime.now(timezone.utc).isoformat(),
            },
        }

        if is_completed:
            update_doc["$set"]["completedAt"] = datetime.now(timezone.utc).isoformat()

        # Update DB asynchronously
        await db.participants.update_one({"id": ans.participantId}, update_doc)

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

            # Broadcast answer count with priority
            await manager.broadcast(
                ans.quizCode,
                {
                    "type": "answer_count",
                    "answeredCount": answered,
                    "totalParticipants": total,
                },
                priority=True,
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


async def handle_start_quiz(quiz_code: str, mgr: ConnectionManager):
    """Background task: 5-second countdown then send Q1."""
    try:
        questions = await get_questions_with_cache(quiz_code)
        if not questions:
            logger.error(f"No questions found for {quiz_code}")
            return

        total = len(questions)
        mgr.set_total_questions(quiz_code, total)

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

        logger.info(
            f"✓ Quiz started: {quiz_code} Q0 limit={first_time_limit}s @ {question_start_time}"
        )

    except Exception as e:
        logger.error(f"handle_start_quiz error: {e}", exc_info=True)


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

        while True:
            try:
                data = await asyncio.wait_for(
                    websocket.receive_text(), timeout=config.WS_TIMEOUT_SEC
                )
            except RuntimeError:
                # WebSocket disconnected during receive
                break
            except asyncio.TimeoutError:
                try:
                    await websocket.send_json(
                        {"type": "ping", "t": int(time.time() * 1000)}
                    )
                except Exception:
                    break
                continue

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
                    p = await db.participants.find_one(
                        {"id": participant_id}, {"_id": 0}
                    )

                    if p:
                        manager.add_participant(quiz_code, p)

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
                        }

                        # If in leaderboard state, tell client to redirect
                        if room_state["quiz_state"] in [QuizState.LEADERBOARD, QuizState.FINAL_LEADERBOARD]:
                            sync_msg["redirect_leaderboard"] = True
                            sync_msg["is_final"] = room_state["quiz_state"] == QuizState.FINAL_LEADERBOARD
                        elif room_state["quiz_state"] == QuizState.PODIUM:
                            sync_msg["redirect_podium"] = True

                        await websocket.send_json(sync_msg)

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
                    answered, total = manager.get_answer_count(quiz_code)

                    await manager.broadcast(
                        quiz_code,
                        {
                            "type": "answer_count",
                            "answeredCount": answered,
                            "totalParticipants": total,
                        },
                        priority=True,
                    )

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
                        logger.info(
                            f"✓ Next question {next_q}: {quiz_code} limit={next_time_limit}s @ {question_start_time}"
                        )
                    else:
                        manager.set_state(quiz_code, QuizState.PODIUM)
                        await manager.broadcast(
                            quiz_code,
                            {
                                "type": "show_podium",
                                "quiz_state": QuizState.PODIUM,
                                "server_time": int(time.time() * 1000),
                            },
                            priority=True,
                        )
                        logger.info(f"✓ Showing podium: {quiz_code}")

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
                pass

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

                            # Broadcast kick event to all clients
                            await manager.broadcast(
                                quiz_code,
                                {
                                    "type": "participant_kicked",
                                    "participantId": kick_id,
                                    "name": kicked.get("name", "Unknown"),
                                },
                                priority=True,
                            )

                            # Close the kicked player's WebSocket
                            if kick_id in manager.user_sockets:
                                kick_ws = manager.user_sockets[kick_id]
                                try:
                                    await kick_ws.close(
                                        code=4001, reason="Kicked by admin"
                                    )
                                except Exception:
                                    pass

                            logger.info(
                                f"✓ Kicked player {kicked.get('name')} from {quiz_code}"
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
        ws_ping_interval=config.WS_HEARTBEAT_SEC,
        ws_ping_timeout=config.WS_TIMEOUT_SEC,
    )

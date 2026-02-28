import json
import time
import logging
try:
    import redis
except Exception:
    redis = None
from app.core.config import REDIS_URL

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# DISTRIBUTED REDIS TTL CACHE — avoids repeated identical DB queries across instances
# ─────────────────────────────────────────────────────────────────────────────

# Initialize Redis client. If REDIS_URL is not set, we'll fall back to a dummy cache for local dev without Redis.
if REDIS_URL and redis:
    try:
        redis_client = redis.from_url(
            REDIS_URL, 
            decode_responses=True,
            socket_connect_timeout=3,
            socket_timeout=3,
            retry_on_timeout=True
        )
        # Test connection
        redis_client.ping()
        logger.info("Connected to Redis cache successfully.")
    except Exception as e:
        logger.warning(f"Failed to connect to Redis, falling back to local memory: {e}")
        redis_client = None
        _local_fallback_cache = {}
else:
    logger.info("Redis unavailable or REDIS_URL not set. Falling back to simple in-memory cache (Not recommended for Production).")
    redis_client = None
    _local_fallback_cache = {}

def api_ttl_cache(key: str, ttl_seconds: int, fn):
    """Return cached value if fresh, else run fn(), cache in Redis and return result."""
    if redis_client:
        try:
            cached_val = redis_client.get(key)
            if cached_val:
                return json.loads(cached_val)
            
            # Cache miss
            val = fn()
            redis_client.setex(key, ttl_seconds, json.dumps(val))
            return val
        except Exception as e:
            logger.error(f"Redis cache error on {key}: {e}")
            return fn() # Fallback to computing if Redis fails mid-request
    else:
        entry = _local_fallback_cache.get(key)
        if entry and (time.time() - entry['ts']) < ttl_seconds:
            return entry['val']
        val = fn()
        _local_fallback_cache[key] = {'val': val, 'ts': time.time()}
        return val

def clear_student_cache(student_id: str = None):
    """Invalidate student-related cache entries across all Redis instances."""
    patterns = ['students_all*']
    if student_id:
        patterns.append(f'student_data_{student_id}*')
        
    if redis_client:
        try:
            for pattern in patterns:
                # Use scan_iter for safe deletion in production Redis
                for key in redis_client.scan_iter(match=pattern):
                    redis_client.delete(key)
        except Exception as e:
            logger.error(f"Failed to clear Redis cache for patterns {patterns}: {e}")
    else:
        keys_to_del = [
            k for k in list(_local_fallback_cache.keys())
            if k.startswith('students_all') or (student_id and k.startswith(f'student_data_{student_id}'))
        ]
        for k in keys_to_del:
            _local_fallback_cache.pop(k, None)

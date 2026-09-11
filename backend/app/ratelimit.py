"""Limitador de intentos en memoria, por clave (IP) y ventana deslizante.

Complementa el bloqueo por cuenta de `routers.auth`: el bloqueo por cuenta
frena el ataque a un correo concreto; este, el barrido de muchos correos desde
un mismo origen. Vive en el proceso: con varios workers cada uno cuenta aparte,
lo que solo afloja el limite en proporcion al numero de workers.
"""
from __future__ import annotations

import threading
import time
from collections import deque


class SlidingWindowLimiter:
    def __init__(self, max_events: int, window_seconds: float) -> None:
        self.max_events = max_events
        self.window = window_seconds
        self._events: dict[str, deque[float]] = {}
        self._lock = threading.Lock()

    def _prune(self, key: str, now: float) -> deque[float]:
        q = self._events.setdefault(key, deque())
        while q and now - q[0] > self.window:
            q.popleft()
        return q

    def allow(self, key: str) -> bool:
        """Registra el intento y dice si esta dentro del limite."""
        now = time.monotonic()
        with self._lock:
            q = self._prune(key, now)
            if len(q) >= self.max_events:
                return False
            q.append(now)
            if len(self._events) > 10_000:
                # Evita crecimiento sin techo ante barridos de IP.
                for k in [k for k, v in self._events.items() if not v]:
                    self._events.pop(k, None)
            return True

    def retry_after(self, key: str) -> int:
        now = time.monotonic()
        with self._lock:
            q = self._prune(key, now)
            if not q:
                return 0
            return max(1, int(self.window - (now - q[0])) + 1)

    def reset(self) -> None:
        with self._lock:
            self._events.clear()


# 30 intentos de acceso por IP cada 5 minutos.
login_limiter = SlidingWindowLimiter(max_events=30, window_seconds=300)

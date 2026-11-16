"""Una descarga que gotea sin terminar se corta por tiempo total (no cuelga la vigilancia)."""
import gzip
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import httpx
import pytest

from app import scraper
from app.ingest import base


class _Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):  # silencio en pruebas
        pass

    def do_GET(self):
        if self.path == "/goteo":
            self.send_response(200)
            self.send_header("Content-Type", "text/html")
            self.end_headers()
            try:
                for _ in range(600):  # 1 byte cada 0,1 s: nunca supera el timeout de lectura
                    self.wfile.write(b"x")
                    self.wfile.flush()
                    time.sleep(0.1)
            except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
                pass
            return
        body = "<html><body>Pipeline: nuevo anticuerpo en fase III</body></html>".encode()
        if self.path == "/gzip":
            body = gzip.compress(body)
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        if self.path == "/gzip":
            self.send_header("Content-Encoding", "gzip")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


@pytest.fixture()
def server():
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), _Handler)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{httpd.server_address[1]}"
    httpd.shutdown()


def test_normal_and_compressed_pages_still_download(server):
    for path in ("/ok", "/gzip"):
        resp = base.tls_get(server + path, timeout=10.0, headers={})
        assert resp.status_code == 200
        assert "fase III" in resp.text


def test_a_trickling_page_is_cut_by_total_deadline(server, monkeypatch):
    monkeypatch.setattr(base, "total_deadline", lambda timeout: 1.5)
    started = time.monotonic()
    with pytest.raises(httpx.ReadTimeout):
        base.tls_get(server + "/goteo", timeout=5.0, headers={})
    assert time.monotonic() - started < 5


def test_fetch_url_returns_instead_of_hanging(server, monkeypatch):
    monkeypatch.setattr(base, "total_deadline", lambda timeout: 1.0)
    started = time.monotonic()
    status, _ctype, text, _raw = scraper.fetch_url(server + "/goteo", timeout=5.0)
    # Falla como cualquier caida de red (estado 0) en segundos, con sus reintentos.
    assert status == 0 and text == ""
    assert time.monotonic() - started < 15


def test_total_deadline_scales_with_read_timeout():
    assert base.total_deadline(5.0) == 60.0
    assert base.total_deadline(30.0) == 120.0
    assert base.total_deadline(httpx.Timeout(45.0)) == 180.0

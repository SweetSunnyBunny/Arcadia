"""
Arcadia Pages - Static file server for Arcadia website
=======================================================

Serves the Arcadia community website and glossary pages.
Includes /api/tts endpoint using local Kokoro TTS.

Run: python arcadia_pages_server.py
Access: http://localhost:8103 or https://arcadia.aibaile.uk
"""

import hashlib
import io
import json
import os
import re
import threading
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

PORT = 8103
WEBPAGES_DIR = Path(r"C:\AI\AIBaile.uk\Arcadia")

# ── Asset versioning ─────────────────────────────────────────────
_VERSION_PLACEHOLDER = "__ARCADIA_ASSET_VERSION__"
_VERSION_QS_RE = re.compile(r"\?v=[a-f0-9]+|\?v=\d+|\?v=" + re.escape(_VERSION_PLACEHOLDER))


def _compute_asset_version() -> str:
    """Build a version hash from CSS/JS file modification times and sizes."""
    digest = hashlib.sha256()
    for pattern in ("css/*.css", "js/*.js"):
        for p in sorted(WEBPAGES_DIR.glob(pattern)):
            if p.is_file():
                stat = p.stat()
                digest.update(p.name.encode())
                digest.update(str(stat.st_mtime_ns).encode())
                digest.update(str(stat.st_size).encode())
    return digest.hexdigest()[:12]


def _version_html(content: str, version: str) -> str:
    """Replace version placeholders and existing ?v= params with the current version."""
    content = content.replace(_VERSION_PLACEHOLDER, version)
    content = _VERSION_QS_RE.sub(f"?v={version}", content)
    return content

# ── Kokoro TTS ────────────────────────────────────────────────────
IDENTITY_VOICES = {
    "Caelan": "am_onyx",
    "Charlie": "am_puck",
    "Booker": "bm_daniel",
    "Sebastian": "am_liam",
    "Claude": "am_echo",
    "Suki": "bm_fable",
}
DEFAULT_VOICE = "am_onyx"

_pipelines = {}
_kokoro_available = None


def kokoro_available():
    global _kokoro_available
    if _kokoro_available is None:
        try:
            import kokoro  # noqa: F401
            import soundfile  # noqa: F401
            import numpy  # noqa: F401
            _kokoro_available = True
            print("Kokoro TTS available")
        except ImportError:
            _kokoro_available = False
            print("Kokoro TTS not available (pip install kokoro soundfile numpy)")
    return _kokoro_available


def get_pipeline(voice_id):
    from kokoro import KPipeline
    prefix = voice_id[:2] if len(voice_id) >= 2 else "am"
    lang_map = {"af": "a", "am": "a", "bf": "b", "bm": "b"}
    lang = lang_map.get(prefix, "a")
    if lang not in _pipelines:
        print(f"Creating Kokoro pipeline for lang={lang}")
        _pipelines[lang] = KPipeline(lang_code=lang)
    return _pipelines[lang]


def synthesize(text, identity="Caelan"):
    import numpy as np
    import soundfile as sf

    voice = IDENTITY_VOICES.get(identity, DEFAULT_VOICE)
    pipeline = get_pipeline(voice)
    chunks = []
    for _, _, audio in pipeline(text, voice=voice, speed=1.0):
        chunks.append(audio)
    if not chunks:
        return None
    full = np.concatenate(chunks)
    buf = io.BytesIO()
    sf.write(buf, full, 24000, format="WAV")
    buf.seek(0)
    return buf.read()


class ArcadiaHandler(SimpleHTTPRequestHandler):
    """Serve static files + TTS endpoint."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(WEBPAGES_DIR), **kwargs)

    def log_message(self, format, *args):
        pass

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        # Versioned assets get long cache; HTML always revalidates
        path = self.path.split('?')[0]
        if '?v=' in self.path and (path.endswith('.css') or path.endswith('.js')):
            self.send_header('Cache-Control', 'public, max-age=31536000, immutable')
        elif path.endswith('.html') or path == '/' or path.endswith('/'):
            self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

    def do_GET(self):
        """For HTML files, inject the current asset version before serving."""
        # Strip query string to get the real file path
        path = self.path.split('?')[0]
        # Determine if this is an HTML request
        file_path = self.translate_path(path)
        if os.path.isdir(file_path):
            file_path = os.path.join(file_path, 'index.html')
        if file_path.endswith('.html') and os.path.isfile(file_path):
            version = _compute_asset_version()
            content = Path(file_path).read_text(encoding='utf-8')
            content = _version_html(content, version)
            encoded = content.encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', str(len(encoded)))
            self.end_headers()
            self.wfile.write(encoded)
            return
        super().do_GET()

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_POST(self):
        if self.path != '/api/tts':
            self.send_error(404, "Not Found")
            return

        if not kokoro_available():
            self.send_response(503)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": "Kokoro TTS not installed"}).encode())
            return

        try:
            length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(length) if length else b'{}'
            data = json.loads(body)

            text = data.get("text", "").strip()
            identity = data.get("identity", "Caelan")

            if not text:
                self.send_response(400)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"error": "No text provided"}).encode())
                return

            audio = synthesize(text, identity)
            if audio:
                self.send_response(200)
                self.send_header("Content-Type", "audio/wav")
                self.send_header("Content-Length", str(len(audio)))
                self.end_headers()
                self.wfile.write(audio)
            else:
                self.send_response(500)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"error": "TTS generation failed"}).encode())

        except Exception as e:
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode())

    def send_error(self, code, message=None, explain=None):
        if code == 404:
            error_page = WEBPAGES_DIR / "404.html"
            if error_page.exists():
                self.send_response(404)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.end_headers()
                self.wfile.write(error_page.read_bytes())
                return
        super().send_error(code, message, explain)


class ThreadedHTTPServer(HTTPServer):
    """Handle each request in a new thread so TTS doesn't block static file serving."""
    def process_request(self, request, client_address):
        thread = threading.Thread(target=self._handle, args=(request, client_address))
        thread.daemon = True
        thread.start()

    def _handle(self, request, client_address):
        try:
            self.finish_request(request, client_address)
        except Exception:
            self.handle_error(request, client_address)
        finally:
            self.shutdown_request(request)


def main():
    os.chdir(WEBPAGES_DIR)
    server = ThreadedHTTPServer(("0.0.0.0", PORT), ArcadiaHandler)
    print(f"Arcadia Pages running at http://localhost:{PORT}")
    print(f"Serving files from: {WEBPAGES_DIR}")
    print("Also accessible via https://arcadia.aibaile.uk")
    kokoro_available()  # check on startup
    print("Press Ctrl+C to stop")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping...")
        server.shutdown()


if __name__ == "__main__":
    main()

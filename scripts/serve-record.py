"""Serve the built site in record mode and append every Untangle move posted to /__record.

    python3 scripts/serve-record.py dist 4400 solves.jsonl

Open http://localhost:4400/ (always redirected to /?record); each line of solves.jsonl is
{game, id, difficulty, moves, solved, ...}. Store verified solves with build-untangle-solutions add-solves.
"""
import json, sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT, PORT, OUT = sys.argv[1], int(sys.argv[2]), sys.argv[3]

class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        # Always serve the page in record mode, whatever URL the browser opened.
        if self.path.split('#')[0] in ('/', '/index.html'):
            self.send_response(302)
            self.send_header('Location', '/?record')
            self.end_headers()
            return
        return super().do_GET()

    def do_POST(self):
        if self.path != '/__record':
            self.send_error(404)
            return
        body = self.rfile.read(int(self.headers.get('Content-Length', 0)))
        entry = json.loads(body)
        with open(OUT, 'a') as f:
            f.write(json.dumps(entry) + '\n')
        print('recorded', entry.get('id'), len(entry.get('moves', [])), 'moves', 'SOLVED' if entry.get('solved') else entry.get('progress'), flush=True)
        self.send_response(204)
        self.end_headers()

    def log_message(self, fmt, *args):
        if '/games/' in self.path or '__record' in self.path or self.path.startswith('/?') or self.path == '/':
            print(self.address_string(), self.command, self.path, flush=True)

ThreadingHTTPServer(('0.0.0.0', PORT), partial(Handler, directory=ROOT)).serve_forever()

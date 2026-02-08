# MLX Translation Server

Minimal Python server that loads an MLX model and serves translation requests. Supports model reload every N batches to reduce hallucination.

## Setup

```bash
cd mlx-server
pip install -r requirements.txt
```

## Usage

```bash
# Start server (default port 8765)
python mlx_server.py --model /Users/ug/.lmstudio/models/lmstudio-community/Qwen3-VL-8B-Instruct-MLX-8bit

# With auto-reload every 10 requests (server-side)
python mlx_server.py -m /path/to/model --reload-every 10

# Custom port
python mlx_server.py -m /path/to/model -p 9000
```

## API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check, model loaded status |
| `/translate` | POST | Translate batch. Body: `{ "messages": [...], "max_tokens": 2048, "temperature": 0.3 }` |
| `/reload` | POST | Unload and reload model (fresh session) |

## Client integration

The Node.js translator uses `TRANSLATION_BACKEND=local-server` and calls `/reload` every N batches (configurable via `LOCAL_SERVER_RELOAD_EVERY_BATCHES`).

## Models

- **Qwen3-VL-8B-Instruct-MLX-8bit** — vision-language, works for text-only translation
- Any MLX-compatible model from `mlx-community` or local path

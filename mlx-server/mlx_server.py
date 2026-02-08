#!/usr/bin/env python3
"""
Minimal MLX translation server. Loads model, serves /translate, supports /reload.
Run: python mlx_server.py --model /path/to/model --port 8765 --reload-every 10
"""
import argparse
import gc
import json
import sys
from http.server import HTTPServer, BaseHTTPRequestHandler

# Lazy import to avoid loading model at startup
_model = None
_tokenizer = None


def load_model(model_path: str) -> None:
    global _model, _tokenizer
    from mlx_lm import load

    print(f"[mlx-server] Loading model from {model_path}...", file=sys.stderr)
    _model, _tokenizer = load(model_path)
    print("[mlx-server] Model loaded.", file=sys.stderr)


def unload_model() -> None:
    global _model, _tokenizer
    _model = None
    _tokenizer = None
    gc.collect()
    print("[mlx-server] Model unloaded.", file=sys.stderr)


def generate(prompt: str, max_tokens: int = 2048, temperature: float = 0.3) -> str:
    from mlx_lm import generate as mlx_generate
    from mlx_lm.sample_utils import make_sampler

    if _model is None or _tokenizer is None:
        raise RuntimeError("Model not loaded")

    sampler = make_sampler(temp=temperature)
    result = mlx_generate(
        _model,
        _tokenizer,
        prompt=prompt,
        max_tokens=max_tokens,
        sampler=sampler,
        verbose=False,
    )
    return result


def apply_chat_template(messages: list[dict], enable_thinking: bool = False) -> str:
    """Apply chat template to messages. Returns formatted prompt string."""
    if _tokenizer is None:
        raise RuntimeError("Model not loaded")

    # Qwen/ChatML format (used by Qwen3-VL and many others)
    parts = []
    for m in messages:
        role = m.get("role", "user")
        content = m.get("content", "")
        if isinstance(content, list):
            content = " ".join(
                c.get("text", "") if isinstance(c, dict) else str(c) for c in content
            )
        
        # Add thinking instruction to system message
        if role == "system":
            if enable_thinking:
                content += "\n\nYou may use <think>...</think> tags to show your reasoning process before providing the final answer."
            else:
                content += "\n\nIMPORTANT: Output ONLY the JSON response. Do NOT use <think> or </think> tags. Do NOT add any explanations or reasoning text."
        
        if role == "system":
            parts.append(f"<|im_start|>system\n{content}<|im_end|>\n")
        elif role == "user":
            parts.append(f"<|im_start|>user\n{content}<|im_end|>\n")
    
    # For Qwen3: Add /no_think token to disable built-in reasoning mode
    if not enable_thinking:
        # Add /no_think to the last user message
        if parts:
            # Find the last user message and append /no_think
            for i in range(len(parts) - 1, -1, -1):
                if "<|im_start|>user" in parts[i]:
                    # Add /no_think before the closing tag
                    parts[i] = parts[i].replace("<|im_end|>", " /no_think<|im_end|>")
                    break
    
    parts.append("<|im_start|>assistant\n")
    return "".join(parts)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        print(f"[mlx-server] {format % args}", file=sys.stderr)

    def send_json(self, data: dict, status: int = 200):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def send_error_json(self, message: str, status: int = 500):
        self.send_json({"error": message}, status)

    def do_GET(self):
        if self.path == "/health":
            self.send_json({"status": "ok", "model_loaded": _model is not None})
        else:
            self.send_error_json("Not found", 404)

    def do_POST(self):
        if self.path == "/reload":
            self.handle_reload()
        elif self.path == "/translate":
            self.handle_translate()
        else:
            self.send_error_json("Not found", 404)

    def handle_reload(self):
        try:
            model_path = getattr(Handler, "_model_path", None)
            if not model_path:
                self.send_error_json("Model path not configured", 400)
                return
            unload_model()
            load_model(model_path)
            self.send_json({"ok": True})
        except Exception as e:
            self.send_error_json(str(e), 500)

    def handle_translate(self):
        try:
            # Auto-reload every N requests (server-side)
            reload_every = getattr(Handler, "_reload_every", 0)
            if reload_every > 0:
                Handler._request_count = getattr(Handler, "_request_count", 0) + 1
                if Handler._request_count > 1 and Handler._request_count % reload_every == 1:
                    model_path = getattr(Handler, "_model_path", None)
                    if model_path:
                        unload_model()
                        load_model(model_path)

            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length).decode()
            data = json.loads(body)

            messages = data.get("messages", [])
            max_tokens = data.get("max_tokens", 4096)
            temperature = data.get("temperature", 0.3)
            enable_thinking = data.get("enable_thinking", False)

            # DEBUG: Log thinking mode setting
            print(f"[mlx-server] enable_thinking={enable_thinking}, max_tokens={max_tokens}", file=sys.stderr)

            if not messages:
                self.send_error_json("messages required", 400)
                return

            prompt = apply_chat_template(messages, enable_thinking=enable_thinking)
            
            # DEBUG: Log if thinking instructions and /no_think token are in prompt
            has_no_think_token = "/no_think" in prompt
            has_think_instruction = "may use <think>" in prompt
            has_no_think_instruction = "Do NOT use <think>" in prompt
            
            print(f"[mlx-server] Prompt analysis: /no_think={has_no_think_token}, enable_thinking={enable_thinking}", file=sys.stderr)
            
            if has_think_instruction:
                print("[mlx-server] ⚠️  WARNING: Thinking mode ENABLED in prompt!", file=sys.stderr)
            elif has_no_think_instruction:
                if has_no_think_token:
                    print("[mlx-server] ✅ Thinking mode DISABLED (instruction + /no_think token)", file=sys.stderr)
                else:
                    print("[mlx-server] ⚠️  WARNING: NO /no_think token found! Model may still think!", file=sys.stderr)
            else:
                print("[mlx-server] ❓ No thinking instructions found in prompt", file=sys.stderr)
            
            text = generate(prompt, max_tokens=max_tokens, temperature=temperature)

            self.send_json({"content": text})
        except json.JSONDecodeError as e:
            self.send_error_json(f"Invalid JSON: {e}", 400)
        except Exception as e:
            self.send_error_json(str(e), 500)


def main():
    parser = argparse.ArgumentParser(description="MLX translation server")
    parser.add_argument("--model", "-m", required=True, help="Path to MLX model")
    parser.add_argument("--port", "-p", type=int, default=8765)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument(
        "--reload-every",
        type=int,
        default=0,
        help="Auto-reload model every N translate requests (0=disabled)",
    )
    args = parser.parse_args()

    Handler._model_path = args.model
    Handler._reload_every = args.reload_every
    Handler._request_count = 0

    load_model(args.model)

    server = HTTPServer((args.host, args.port), Handler)
    print(f"[mlx-server] Listening on http://{args.host}:{args.port}", file=sys.stderr)
    print("[mlx-server] POST /translate - translate, POST /reload - reload model", file=sys.stderr)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[mlx-server] Shutting down.", file=sys.stderr)


if __name__ == "__main__":
    main()

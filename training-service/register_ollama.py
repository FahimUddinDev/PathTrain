"""Register a PathTrain LoRA adapter as a named Ollama model (Milestone 8).

Modes:
  adapter — Write a Modelfile (FROM + ADAPTER) and run `ollama create`.
            Fast; uses the safetensors adapter directory from train.py.
  gguf    — Merge LoRA into the base with Unsloth, export GGUF, write a
            Modelfile (FROM ./model.gguf), then `ollama create`.
            Heavier; use when the adapter path is rejected by Ollama.

Examples:
  python training-service/register_ollama.py \\
    --adapter data/adapters/<job-id> \\
    --base-model qwen2.5:7b-instruct \\
    --model-name pathtrain-ft

  python training-service/register_ollama.py \\
    --adapter data/adapters/<job-id> \\
    --mode gguf \\
    --model-name pathtrain-ft \\
    --quantization q4_k_m
"""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path

# Hugging Face ids → Ollama tags (inverse of train.py aliases)
_HF_TO_OLLAMA: dict[str, str] = {
    "Qwen/Qwen2.5-7B-Instruct": "qwen2.5:7b-instruct",
    "qwen/qwen2.5-7b-instruct": "qwen2.5:7b-instruct",
}


def resolve_ollama_base(name: str) -> str:
    key = name.strip()
    return _HF_TO_OLLAMA.get(key, _HF_TO_OLLAMA.get(key.lower(), key))


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Merge/load a LoRA adapter into Ollama via a Modelfile",
    )
    parser.add_argument(
        "--adapter",
        required=True,
        help="Directory with LoRA safetensors (train.py --output)",
    )
    parser.add_argument(
        "--base-model",
        default="qwen2.5:7b-instruct",
        help="Ollama base tag or HF id used during training",
    )
    parser.add_argument(
        "--model-name",
        required=True,
        help="New Ollama model name/tag to register (e.g. pathtrain-ft)",
    )
    parser.add_argument(
        "--mode",
        choices=("adapter", "gguf"),
        default="adapter",
        help="adapter = FROM+ADAPTER Modelfile; gguf = Unsloth merge + GGUF",
    )
    parser.add_argument(
        "--quantization",
        default="q4_k_m",
        help="GGUF quantization when --mode gguf (default: q4_k_m)",
    )
    parser.add_argument(
        "--workdir",
        default=None,
        help="Where to write Modelfile / GGUF (default: data/ollama/<model-name>)",
    )
    parser.add_argument(
        "--ollama-bin",
        default=None,
        help="ollama executable (default: OLLAMA_BIN env or 'ollama')",
    )
    parser.add_argument(
        "--skip-create",
        action="store_true",
        help="Only write Modelfile / GGUF; do not run ollama create",
    )
    return parser.parse_args(argv)


def assert_adapter_ready(adapter_dir: Path) -> None:
    if not adapter_dir.is_dir():
        raise FileNotFoundError(f"Adapter directory not found: {adapter_dir}")

    has_weights = any(adapter_dir.glob("*.safetensors")) or (
        adapter_dir / "adapter_model.safetensors"
    ).is_file()
    has_config = (adapter_dir / "adapter_config.json").is_file()
    if not (has_weights or has_config):
        raise FileNotFoundError(
            f"No LoRA adapter files in {adapter_dir} "
            "(expected *.safetensors and/or adapter_config.json)",
        )


def write_adapter_modelfile(path: Path, base_model: str, adapter_dir: Path) -> None:
    # Absolute path so ollama create works regardless of cwd.
    adapter_abs = adapter_dir.resolve().as_posix()
    contents = f"FROM {base_model}\nADAPTER {adapter_abs}\n"
    path.write_text(contents, encoding="utf-8")
    print(f"[modelfile] wrote {path}", flush=True)
    print(f"[modelfile]\n{contents}", flush=True)


def write_gguf_modelfile(path: Path, gguf_file: Path) -> None:
    gguf_abs = gguf_file.resolve().as_posix()
    contents = f"FROM {gguf_abs}\n"
    path.write_text(contents, encoding="utf-8")
    print(f"[modelfile] wrote {path}", flush=True)
    print(f"[modelfile]\n{contents}", flush=True)


def find_gguf(directory: Path) -> Path:
    candidates = sorted(directory.glob("*.gguf"))
    if not candidates:
        raise FileNotFoundError(f"No .gguf file found under {directory}")
    # Prefer q4 / quantized names when multiple exist.
    preferred = [p for p in candidates if "q4" in p.name.lower() or "Q4" in p.name]
    return preferred[0] if preferred else candidates[0]


def merge_to_gguf(
    adapter_dir: Path,
    workdir: Path,
    quantization: str,
    max_seq_length: int = 2048,
) -> Path:
    """Load LoRA with Unsloth, merge, and export GGUF into workdir."""
    from unsloth import FastLanguageModel

    print(f"[merge] loading adapter from {adapter_dir}…", flush=True)
    model, tokenizer = FastLanguageModel.from_pretrained(
        model_name=str(adapter_dir),
        max_seq_length=max_seq_length,
        dtype=None,
        load_in_4bit=True,
    )

    print(f"[merge] exporting GGUF ({quantization}) → {workdir}…", flush=True)
    # Unsloth writes GGUF (+ often a Modelfile) into the given directory name.
    model.save_pretrained_gguf(
        str(workdir),
        tokenizer,
        quantization_method=quantization,
    )

    gguf = find_gguf(workdir)
    print(f"[merge] gguf={gguf}", flush=True)
    return gguf


def ollama_create(ollama_bin: str, model_name: str, modelfile: Path) -> None:
    cmd = [ollama_bin, "create", model_name, "-f", str(modelfile)]
    print(f"[ollama] {' '.join(cmd)}", flush=True)
    result = subprocess.run(
        cmd,
        cwd=str(modelfile.parent),
        capture_output=False,
        check=False,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(
            f"ollama create failed with exit code {result.returncode}",
        )
    print(f"[ollama] registered model={model_name}", flush=True)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)

    adapter_dir = Path(args.adapter).resolve()
    assert_adapter_ready(adapter_dir)

    base_model = resolve_ollama_base(args.base_model)
    model_name = args.model_name.strip()
    if not model_name:
        print("[error] --model-name is required", flush=True)
        return 1

    workdir = (
        Path(args.workdir).resolve()
        if args.workdir
        else Path("data/ollama") / model_name.replace(":", "_")
    )
    workdir.mkdir(parents=True, exist_ok=True)
    modelfile_path = workdir / "Modelfile"

    ollama_bin = (
        args.ollama_bin
        or os.environ.get("OLLAMA_BIN")
        or shutil.which("ollama")
        or "ollama"
    )

    print(f"[start] mode={args.mode} model={model_name}", flush=True)
    print(f"[config] adapter={adapter_dir}", flush=True)
    print(f"[config] base_model={base_model}", flush=True)
    print(f"[config] workdir={workdir}", flush=True)

    if args.mode == "adapter":
        write_adapter_modelfile(modelfile_path, base_model, adapter_dir)
    else:
        gguf = merge_to_gguf(adapter_dir, workdir, args.quantization)
        write_gguf_modelfile(modelfile_path, gguf)

    if args.skip_create:
        print(f"[done] modelfile={modelfile_path} (create skipped)", flush=True)
        return 0

    ollama_create(ollama_bin, model_name, modelfile_path)
    print(f"[done] model_tag={model_name}", flush=True)
    print(f"[done] modelfile={modelfile_path}", flush=True)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        print("[error] interrupted", flush=True)
        raise SystemExit(130)
    except Exception as exc:  # noqa: BLE001 — surface failure to job runner
        print(f"[error] {type(exc).__name__}: {exc}", flush=True)
        raise SystemExit(1)

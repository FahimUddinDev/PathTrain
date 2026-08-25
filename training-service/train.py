"""Unsloth QLoRA fine-tune entrypoint for PathTrain (Milestone 7).

Reads instruction JSONL (`instruction` / `input` / `output`), fine-tunes a
base model with 4-bit QLoRA, and saves the LoRA adapter to --output.

Progress / loss lines are printed to stdout (captured by the job runner).
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Any

# Ollama-style tags used by PathTrain → Hugging Face model ids
_MODEL_ALIASES: dict[str, str] = {
    "qwen2.5:7b-instruct": "Qwen/Qwen2.5-7B-Instruct",
    "qwen2.5:7b": "Qwen/Qwen2.5-7B-Instruct",
    "qwen2.5-7b-instruct": "Qwen/Qwen2.5-7B-Instruct",
}


def resolve_base_model(name: str) -> str:
    key = name.strip()
    return _MODEL_ALIASES.get(key.lower(), key)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="PathTrain Unsloth QLoRA fine-tune")
    parser.add_argument(
        "--dataset",
        "--jsonl",
        dest="dataset",
        required=True,
        help="Path to instruction JSONL (instruction / input / output)",
    )
    parser.add_argument(
        "--base-model",
        default="Qwen/Qwen2.5-7B-Instruct",
        help="Hugging Face model id or Ollama-style alias (default: Qwen/Qwen2.5-7B-Instruct)",
    )
    parser.add_argument(
        "--output",
        default=None,
        help="Directory to save the LoRA adapter (default: data/adapters/<job-id|run>)",
    )
    parser.add_argument("--job-id", default=None, help="Optional PathTrain TrainingJob id")
    parser.add_argument("--max-seq-length", type=int, default=2048)
    parser.add_argument("--lora-r", type=int, default=16)
    parser.add_argument("--lora-alpha", type=int, default=16)
    parser.add_argument("--batch-size", type=int, default=2)
    parser.add_argument("--grad-accum", type=int, default=4)
    parser.add_argument("--learning-rate", type=float, default=2e-4)
    parser.add_argument("--epochs", type=float, default=1.0)
    parser.add_argument(
        "--max-steps",
        type=int,
        default=-1,
        help="If > 0, overrides --epochs (useful for smoke tests)",
    )
    parser.add_argument("--warmup-steps", type=int, default=5)
    parser.add_argument("--logging-steps", type=int, default=1)
    parser.add_argument("--seed", type=int, default=3407)
    return parser.parse_args(argv)


def format_row(example: dict[str, Any], eos_token: str) -> dict[str, str]:
    """Alpaca-style prompt from PathTrain JSONL fields."""
    instruction = (example.get("instruction") or "").strip()
    inp = (example.get("input") or "").strip()
    output = (example.get("output") or "").strip()

    if inp:
        prompt = (
            "Below is an instruction that describes a task, paired with an input "
            "that provides further context. Write a response that appropriately "
            "completes the request.\n\n"
            f"### Instruction:\n{instruction}\n\n"
            f"### Input:\n{inp}\n\n"
            f"### Response:\n{output}"
        )
    else:
        prompt = (
            "Below is an instruction that describes a task. Write a response that "
            "appropriately completes the request.\n\n"
            f"### Instruction:\n{instruction}\n\n"
            f"### Response:\n{output}"
        )

    return {"text": prompt + eos_token}


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)

    dataset_path = Path(args.dataset).resolve()
    if not dataset_path.is_file():
        print(f"[error] Dataset not found: {dataset_path}", flush=True)
        return 1

    base_model = resolve_base_model(args.base_model)
    job_id = args.job_id or "run"
    output_dir = Path(args.output).resolve() if args.output else Path("data/adapters") / job_id
    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"[start] job={job_id}", flush=True)
    print(f"[config] dataset={dataset_path}", flush=True)
    print(f"[config] base_model={base_model}", flush=True)
    print(f"[config] output={output_dir}", flush=True)
    print(
        f"[config] max_seq_length={args.max_seq_length} lora_r={args.lora_r} "
        f"batch={args.batch_size} grad_accum={args.grad_accum} lr={args.learning_rate} "
        f"epochs={args.epochs} max_steps={args.max_steps}",
        flush=True,
    )

    # Heavy imports after arg validation so --help stays fast / CPU-only.
    from datasets import load_dataset
    from transformers import TrainerCallback
    from trl import SFTConfig, SFTTrainer
    from unsloth import FastLanguageModel, is_bfloat16_supported

    class StdoutProgressCallback(TrainerCallback):
        """Mirror HuggingFace trainer logs to stdout for PathTrain job logs."""

        def on_log(self, args_ta, state, control, logs=None, **kwargs):  # noqa: ANN001
            if not logs:
                return
            step = state.global_step
            loss = logs.get("loss")
            lr = logs.get("learning_rate")
            parts = [f"[progress] step={step}"]
            if loss is not None:
                parts.append(f"loss={loss:.4f}")
            if lr is not None:
                parts.append(f"lr={lr:.2e}")
            epoch = logs.get("epoch")
            if epoch is not None:
                parts.append(f"epoch={epoch:.3f}")
            print(" ".join(parts), flush=True)

    print("[load] loading dataset…", flush=True)
    dataset = load_dataset("json", data_files=str(dataset_path), split="train")
    print(f"[load] examples={len(dataset)}", flush=True)

    print(f"[load] loading base model {base_model} (4-bit QLoRA)…", flush=True)
    model, tokenizer = FastLanguageModel.from_pretrained(
        model_name=base_model,
        max_seq_length=args.max_seq_length,
        dtype=None,
        load_in_4bit=True,
    )

    eos = tokenizer.eos_token or ""
    dataset = dataset.map(
        lambda row: format_row(row, eos),
        remove_columns=[c for c in dataset.column_names if c != "text"],
    )

    model = FastLanguageModel.get_peft_model(
        model,
        r=args.lora_r,
        target_modules=[
            "q_proj",
            "k_proj",
            "v_proj",
            "o_proj",
            "gate_proj",
            "up_proj",
            "down_proj",
        ],
        lora_alpha=args.lora_alpha,
        lora_dropout=0,
        bias="none",
        use_gradient_checkpointing="unsloth",
        random_state=args.seed,
    )

    sft_kwargs: dict[str, Any] = {
        "output_dir": str(output_dir / "checkpoints"),
        "per_device_train_batch_size": args.batch_size,
        "gradient_accumulation_steps": args.grad_accum,
        "warmup_steps": args.warmup_steps,
        "learning_rate": args.learning_rate,
        "logging_steps": args.logging_steps,
        "optim": "adamw_8bit",
        "weight_decay": 0.01,
        "lr_scheduler_type": "linear",
        "seed": args.seed,
        "fp16": not is_bfloat16_supported(),
        "bf16": is_bfloat16_supported(),
        "report_to": "none",
        "save_strategy": "no",
    }
    if args.max_steps and args.max_steps > 0:
        sft_kwargs["max_steps"] = args.max_steps
    else:
        sft_kwargs["num_train_epochs"] = args.epochs

    trainer = SFTTrainer(
        model=model,
        tokenizer=tokenizer,
        train_dataset=dataset,
        dataset_text_field="text",
        max_seq_length=args.max_seq_length,
        packing=False,
        args=SFTConfig(**sft_kwargs),
        callbacks=[StdoutProgressCallback()],
    )

    print("[train] starting QLoRA fine-tune…", flush=True)
    # Unsloth / HF often buffer; force line-buffered progress for the job runner.
    try:
        sys.stdout.reconfigure(line_buffering=True)  # type: ignore[attr-defined]
    except Exception:
        pass

    train_result = trainer.train()
    metrics = train_result.metrics or {}
    print(f"[train] finished metrics={metrics}", flush=True)

    print(f"[save] writing LoRA adapter to {output_dir}…", flush=True)
    model.save_pretrained(str(output_dir))
    tokenizer.save_pretrained(str(output_dir))

    # Marker file so job-runner / M8 can confirm a successful save.
    (output_dir / "adapter_ready.txt").write_text(
        f"job_id={job_id}\nbase_model={base_model}\ndataset={dataset_path}\n",
        encoding="utf-8",
    )

    print(f"[done] adapter_path={output_dir}", flush=True)
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

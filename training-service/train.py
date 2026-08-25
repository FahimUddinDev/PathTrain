"""Unsloth QLoRA training entrypoint. Invoked from Next.js job-runner (Milestone 7)."""

from __future__ import annotations

import argparse
import sys


def main() -> int:
    parser = argparse.ArgumentParser(description="PathTrain QLoRA fine-tune")
    parser.add_argument("--dataset", required=True, help="Path to instruction JSONL")
    parser.add_argument("--job-id", required=True, help="TrainingJob id from PathTrain")
    parser.add_argument("--base-model", default="Qwen/Qwen2.5-7B-Instruct")
    args = parser.parse_args()

    print(f"[queued] job={args.job_id} dataset={args.dataset} model={args.base_model}")
    print("Training loop is not implemented yet (Milestone 7).")
    return 0


if __name__ == "__main__":
    sys.exit(main())

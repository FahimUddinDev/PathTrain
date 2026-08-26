# training-service

Unsloth QLoRA fine-tuning for PathTrain. The Next.js app spawns `train.py` as a child
process; nothing here is imported by the web app.

## Hardware prerequisite

**An NVIDIA GPU with CUDA is required.** Unsloth builds on bitsandbytes 4-bit quantisation
and Triton kernels, neither of which supports AMD or Intel graphics on Windows. Without a
CUDA device, `train.py` fails at import time no matter how the Python environment is set up.

> The machine this repository is currently developed on has AMD graphics only, so training
> cannot run locally here. Everything up to and including the JSONL export works; the job
> itself has to run on a CUDA host.

The rest of PathTrain — chunking, embedding, the RAG playground, example review, and dataset
export — runs fine on any machine.

## Python environment

Use Python 3.10 or 3.11. Unsloth does not publish wheels for 3.13, and its dependency
resolution fails there.

```bash
cd training-service
py -3.10 -m venv .venv          # Windows;  python3.10 -m venv .venv  elsewhere
.venv\Scripts\activate          # source .venv/bin/activate on macOS/Linux
python -m pip install --upgrade pip
```

Install PyTorch with the CUDA build that matches your driver **before** the rest, otherwise
pip resolves the CPU-only wheel:

```bash
pip install torch --index-url https://download.pytorch.org/whl/cu121
pip install -r requirements.txt
```

Verify:

```bash
python -c "import torch; print(torch.cuda.is_available(), torch.cuda.get_device_name(0))"
```

`True` plus a device name means training will run. `False` means `train.py` will fail.

## Pointing the app at this environment

The job runner reads `PYTHON_PATH` (falling back to `PYTHON`, then bare `python`). Set it in
the project root `.env` to the interpreter inside this venv:

```
PYTHON_PATH="D:/ai-project-template/PathTrain/training-service/.venv/Scripts/python.exe"
```

Leaving it unset makes the runner use whatever `python` resolves to on `PATH`, which is
usually a system interpreter without the training dependencies — the symptom is
`ModuleNotFoundError: No module named 'datasets'` in the job logs.

## Running manually

```bash
python train.py \
  --dataset ../data/exports/class-6-2026-01-01.jsonl \
  --base-model qwen2.5:7b-instruct \
  --output ../data/adapters/manual-run \
  --max-steps 10
```

`--max-steps 10` is a smoke test. Omit it to train for `--epochs` (default 1).

On success the last stdout line is `[done] adapter_path=<dir>`; the job runner parses that to
fill `TrainingJob.adapterPath`.

## Registering the adapter with Ollama

`register_ollama.py` writes a Modelfile (`FROM` base + `ADAPTER` path) and runs
`ollama create`. The Jobs page calls it via `POST /api/training/jobs/[id]/register` once a job
completes; `OLLAMA_FINETUNED_MODEL` controls the resulting tag.

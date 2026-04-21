# Astronet chatbot API scaffold

This repo now includes a local, open-source embedding store in `store.py` for the RAG layer.

Install:

```bash
pip install -r requirements.txt
```

Default stack:

- ChromaDB as the vector store
- Chroma's local ONNX MiniLM embedding model by default
- Optional repo-local sentence-transformers/all-MiniLM-L6-v2 model override

Model installation:

The store supports two modes:

- Default mode: Chroma's built-in local ONNX MiniLM embedding function
- Optional repo-local model folder: `./models/all-MiniLM-L6-v2`

If you only want the default local embedding model, install the repo requirements and use the store directly. No separate model download script is required.

To download the embedding model into the repo, run:

```bash
py -3 -m pip install sentence-transformers
py -3 download_embedding_model.py
```

After that, `store.py` will automatically use the repo-local folder if it exists. Otherwise it falls back to Chroma's local ONNX model.

Notes:

- The first download requires internet access.
- After the model is saved under `./models/all-MiniLM-L6-v2`, the store can run locally from that folder.
- It is technically possible to commit the downloaded model into the repo, but it is usually not a good default because the model files are fairly large and will bloat git history.
- A better pattern is to keep the downloader script in the repo and decide separately whether you want to version the model with Git LFS.

Example:

```python
from store import create_default_store

store = create_default_store()
store.upsert_articles([
    {
        "title": "Black holes",
        "author": "Astronet",
        "category": "Astronomy",
        "tags": ["space", "physics"],
        "content": "Black holes are regions of spacetime with extremely strong gravity.",
    }
])

results = store.query("What is a black hole?", limit=3)
```

from pathlib import Path

from sentence_transformers import SentenceTransformer

from store import DEFAULT_EMBEDDING_MODEL, DEFAULT_LOCAL_MODEL_DIRECTORY


def main() -> None:
    target_dir = Path(DEFAULT_LOCAL_MODEL_DIRECTORY)
    target_dir.mkdir(parents=True, exist_ok=True)

    model = SentenceTransformer(DEFAULT_EMBEDDING_MODEL)
    model.save(str(target_dir))

    print(f"Saved model to {target_dir.resolve()}")


if __name__ == "__main__":
    main()
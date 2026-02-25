import json, argparse
from sentence_transformers import SentenceTransformer

parser = argparse.ArgumentParser()
parser.add_argument("--input", required=True)
parser.add_argument("--output", required=True)
parser.add_argument("--model", default="BAAI/bge-large-en-v1.5")
args = parser.parse_args()

model = SentenceTransformer(args.model)

with open(args.input) as f:
    chunks = json.load(f)

texts = [c["content"] for c in chunks]
embeddings = model.encode(
    texts,
    batch_size=32,
    show_progress_bar=True,
    normalize_embeddings=True
)

for chunk, emb in zip(chunks, embeddings):
    chunk["embedding"] = emb.tolist()

with open(args.output, "w") as f:
    json.dump(chunks, f)

print(f"Done: {len(chunks)} embeddings written to {args.output}")

#!/bin/bash
#SBATCH --job-name=podcast-embed
#SBATCH --output=embed_%j.log
#SBATCH --ntasks=1
#SBATCH --cpus-per-task=4
#SBATCH --mem=16G
#SBATCH --time=01:00:00
#SBATCH --partition=debug

module load python/3.10
source $HOME/venvs/embed/bin/activate

python hpc/embed_episodes.py \
  --input hpc/episodes_export.json \
  --output hpc/embeddings_output.json \
  --model BAAI/bge-large-en-v1.5

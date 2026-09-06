"""
STATS 401 — Lab 4 Assignment
Clean raw tweets, run RoBERTa sentiment analysis, export tidy data for D3.

Dataset: tweets from the 20 most-followed Twitter accounts.
Raw file: data/Tweet.csv
Columns:  author, content, country, date_time, id, language,
          latitude, longitude, number_of_likes, number_of_shares

Run from inside lab4/:
    python clean_tweets.py

Outputs (../data/):
    lab4_raw_tweets.csv              sampled raw rows, untouched
    lab4_clean_tweets.csv            tidy, visualization-ready
    sentiment_counts.csv
    sentiment_by_author.csv
    sentiment_by_author_month.csv
"""
import html 
import os
import re
import sys
import warnings

import numpy as np
import pandas as pd



warnings.filterwarnings("ignore", category=FutureWarning)

# ----------------------------------------------------------------------------
# CONFIG
# ----------------------------------------------------------------------------

DATA_DIR = "../data"
RAW_FILE = os.path.join(DATA_DIR, "Tweet.csv")

SAMPLE_SIZE = 3000          # assignment needs >= 1000; use 50 while debugging
RANDOM_SEED = 42
ENGLISH_ONLY = True         # the sentiment model is an English Twitter model
MIN_TWEETS_PER_AUTHOR = 30  # drop authors too sparse to plot

MODEL_NAME = "cardiffnlp/twitter-roberta-base-sentiment-latest"
BATCH_SIZE = 32
MAX_LENGTH = 128


# ----------------------------------------------------------------------------
# Load and inspect
# ----------------------------------------------------------------------------

def inspect(df, label):
    print(f"\n{'=' * 70}\n{label}\n{'=' * 70}")
    print("shape:", df.shape)
    print("\ndtypes:\n", df.dtypes)
    print("\nmissing values:\n", df.isna().sum())
    print("\nduplicated rows:", df.duplicated().sum())
    print("\nhead:\n", df.head(3).to_string())


def load_raw():
    if not os.path.exists(RAW_FILE):
        sys.exit(f"Could not find {RAW_FILE}. Run this script from inside lab4/.")

    # `id` is stored in scientific notation (8.19633E+17), so its precision is
    # already destroyed in the file. Read it as text and do not rely on it.
    df = pd.read_csv(RAW_FILE, dtype={"id": "string"}, low_memory=False)
    return df


# ----------------------------------------------------------------------------
# Cleaning
# ----------------------------------------------------------------------------

def clean(df):
    # --- drop columns that are essentially empty ------------------------------
    for col in ["latitude", "longitude", "country"]:
        if col in df.columns and df[col].isna().mean() > 0.95:
            print(f"dropping '{col}' ({df[col].isna().mean():.1%} missing)")
            df = df.drop(columns=[col])

    # --- missing text is fatal for the whole analysis -------------------------
    df = df.dropna(subset=["content", "author", "date_time"])

    # --- duplicates -----------------------------------------------------------
    # The `id` column cannot be trusted (see load_raw), so identify a tweet by
    # its author, timestamp and text instead.
    before = len(df)
    df = df.drop_duplicates(subset=["author", "date_time", "content"], keep="first")
    print(f"removed {before - len(df)} duplicate tweets")

    # --- language -------------------------------------------------------------
    if ENGLISH_ONLY and "language" in df.columns:
        before = len(df)
        df = df[df["language"].astype("string").str.strip().str.lower() == "en"]
        print(f"kept {len(df)} English tweets (dropped {before - len(df)})")

    # --- numeric fields -------------------------------------------------------
    df = df.rename(columns={"number_of_likes": "likes",
                            "number_of_shares": "retweets"})
    for col in ["likes", "retweets"]:
        df[col] = (
            df[col].astype(str).str.replace(",", "", regex=False).str.strip()
        )
        df[col] = pd.to_numeric(df[col], errors="coerce")
        df.loc[df[col] < 0, col] = np.nan        # negative counts are impossible
        df[col] = df[col].fillna(0).astype(int)  # absent engagement reads as zero

    # --- dates: the file uses DD/MM/YYYY HH:MM --------------------------------
    df["created_at"] = pd.to_datetime(
        df["date_time"], format="%d/%m/%Y %H:%M", errors="coerce"
    )
    bad = int(df["created_at"].isna().sum())
    if bad:
        print(f"{bad} rows had unparseable dates and were dropped")
    df = df.dropna(subset=["created_at"])

    df["date"] = df["created_at"].dt.date
    df["month"] = df["created_at"].dt.to_period("M").astype(str)
    df["year"] = df["created_at"].dt.year
    df["hour"] = df["created_at"].dt.hour
    df["weekday"] = df["created_at"].dt.day_name()

    # --- strings --------------------------------------------------------------
    # Collapsing whitespace also removes newlines, which would otherwise break
    # the exported CSV when D3 parses it.
    df["tweet_text_raw"] = (
        df["content"].astype("string")
        .map(lambda t: html.unescape(str(t)))       # ← 新增
        .str.replace(r"\s+", " ", regex=True)
        .str.strip()
    )
    df = df[df["tweet_text_raw"].str.len() > 0]

    df["author"] = (
        df["author"].astype("string")
        .str.strip().str.replace(r"^@", "", regex=True).str.lower()
    )

    # --- keep authors with enough tweets to be worth plotting ------------------
    counts = df["author"].value_counts()
    keep = counts[counts >= MIN_TWEETS_PER_AUTHOR].index
    df = df[df["author"].isin(keep)]
    print(f"{len(keep)} authors kept:", ", ".join(sorted(keep)))

    return df.reset_index(drop=True)


def take_sample(df):
    """Sample after cleaning, before the model: RoBERTa is the slow step."""
    n = min(SAMPLE_SIZE, len(df))
    out = df.sample(n=n, random_state=RANDOM_SEED).reset_index(drop=True)
    # Stable synthetic id, since the original `id` lost precision in the file.
    out["tweet_id"] = [f"t{i:05d}" for i in range(len(out))]
    print(f"\nsampled {n} of {len(df)} cleaned tweets (seed {RANDOM_SEED})")
    return out


# ----------------------------------------------------------------------------
# RoBERTa sentiment
# ----------------------------------------------------------------------------

def prepare_for_roberta(text):
    """Lighter than TF-IDF preprocessing: casing, punctuation and emoji matter."""
    text = str(text)
    text = re.sub(r"@\w+", "@user", text)
    text = re.sub(r"https?://\S+|www\.\S+", "http", text)
    return text.strip()


def run_sentiment(df):
    import torch
    from transformers import pipeline

    device = 0 if torch.cuda.is_available() else -1
    print(f"\nloading {MODEL_NAME} on {'gpu' if device == 0 else 'cpu'} ...")
    classifier = pipeline(
        "sentiment-analysis", model=MODEL_NAME, top_k=None, device=device
    )

    texts = df["tweet_text_raw"].fillna("").apply(prepare_for_roberta).tolist()
    print(f"scoring {len(texts)} tweets ...")
    results = classifier(
        texts, truncation=True, max_length=MAX_LENGTH, batch_size=BATCH_SIZE
    )

    scores = [{d["label"].lower(): d["score"] for d in r} for r in results]

    df["sentiment_negative"] = [s.get("negative", 0.0) for s in scores]
    df["sentiment_neutral"] = [s.get("neutral", 0.0) for s in scores]
    df["sentiment_positive"] = [s.get("positive", 0.0) for s in scores]
    df["sentiment"] = [max(s, key=s.get).capitalize() for s in scores]
    df["sentiment_score"] = df["sentiment_positive"] - df["sentiment_negative"]
    df["sentiment_conf"] = [max(s.values()) for s in scores]  # optional extension

    for col in ["sentiment_negative", "sentiment_neutral", "sentiment_positive",
                "sentiment_score", "sentiment_conf"]:
        df[col] = df[col].round(4)

    return df


# ----------------------------------------------------------------------------
# Export
# ----------------------------------------------------------------------------

def export(df):
    columns = [
        "tweet_id", "created_at", "date", "month", "year", "hour", "weekday",
        "author", "tweet_text_raw", "likes", "retweets",
        "sentiment_negative", "sentiment_neutral", "sentiment_positive",
        "sentiment_score", "sentiment", "sentiment_conf",
    ]
    vis_df = df[[c for c in columns if c in df.columns]].copy()

    inspect(vis_df, "FINAL VISUALIZATION-READY DATA")
    print("\nsentiment distribution:\n", vis_df["sentiment"].value_counts())

    out = os.path.join(DATA_DIR, "lab4_clean_tweets.csv")
    vis_df.to_csv(out, index=False)
    print(f"\nwrote {len(vis_df)} rows -> {out}")

    (vis_df["sentiment"].value_counts()
     .rename_axis("sentiment").reset_index(name="count")
     .to_csv(os.path.join(DATA_DIR, "sentiment_counts.csv"), index=False))

    (vis_df.groupby(["author", "sentiment"]).size().reset_index(name="count")
     .to_csv(os.path.join(DATA_DIR, "sentiment_by_author.csv"), index=False))

    (vis_df.groupby(["author", "month"])
     .agg(mean_sentiment=("sentiment_score", "mean"),
          n_tweets=("tweet_id", "count"))
     .round(4).reset_index()
     .to_csv(os.path.join(DATA_DIR, "sentiment_by_author_month.csv"), index=False))

    print("wrote aggregate tables to", DATA_DIR)
    return vis_df


# ----------------------------------------------------------------------------

def main():
    os.makedirs(DATA_DIR, exist_ok=True)

    raw = load_raw()
    inspect(raw, "RAW DATA")

    df = clean(raw)
    inspect(df, "AFTER CLEANING")

    df = take_sample(df)
    df.to_csv(os.path.join(DATA_DIR, "lab4_raw_tweets.csv"), index=False)

    df = run_sentiment(df)
    export(df)

    print(
        f"\nNote: the sentiment columns are estimates produced by {MODEL_NAME}, "
        "not ground-truth labels."
    )


if __name__ == "__main__":
    main()
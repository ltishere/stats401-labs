import os
os.environ["OMP_NUM_THREADS"] = "1"          # 限制并行线程，避免冲突
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"  # 允许两份 OpenMP 共存

import sys
import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score
from sklearn.feature_extraction.text import TfidfVectorizer, ENGLISH_STOP_WORDS

K = int(sys.argv[1]) if len(sys.argv) > 1 else 12
df = pd.read_csv("../data/lab8_passages.csv")


# ---------- 1. 矩阵的行（基于目录结构） ----------
def p6_sec(s):
    return ("Academic Warning, Probation, and Suspension"
            if s.startswith("Academic Warning") else s)

p6 = df[df["chapter"].str.startswith("Part 6:")]
p6_counts = p6["section"].map(p6_sec).value_counts()
BIG6 = set(p6_counts[p6_counts >= 5].index)

def matrix_row(r):
    num, name = r["chapter"].split(": ", 1)
    num = num.replace("Part ", "P")
    if num == "P6":
        s = p6_sec(r["section"])
        return f"P6 · {s}" if s in BIG6 else "P6 · Other procedures"
    if num == "P10":
        return ("P10 · Course Descriptions" if r["section"] == "Course Descriptions"
                else "P10 · Majors")
    return f"{num} · {name}"

df["matrix_row"] = df.apply(matrix_row, axis=1)
row_order = df.groupby("matrix_row")["page"].min().sort_values().index.tolist()
df["matrix_order"] = df["matrix_row"].map({r: i for i, r in enumerate(row_order)})
df.to_csv("../data/lab8_passages.csv", index=False)

print("=== Matrix rows ===")
print(df["matrix_row"].value_counts().reindex(row_order).to_string())


# ---------- 2. Embeddings（算一次后缓存） ----------
EMB_PATH = "../data/lab8_embeddings.npy"
if os.path.exists(EMB_PATH):
    emb = np.load(EMB_PATH)
    assert len(emb) == len(df), "passages 变了，删掉 lab8_embeddings.npy 重跑"

else:
    from sentence_transformers import SentenceTransformer   # 只在需要时才加载 PyTorch
    model = SentenceTransformer("all-MiniLM-L6-v2")
    emb = model.encode(df["text"].tolist(),
                       normalize_embeddings=True, show_progress_bar=True)
    np.save(EMB_PATH, emb)


# ---------- 3. 不同 K 的 silhouette 分数 ----------
print("\n=== Silhouette by K (higher = better separated) ===")
for k in range(6, 17):
    labels = KMeans(n_clusters=k, random_state=401, n_init=10).fit_predict(emb)
    print(f"K={k:2d}  silhouette={silhouette_score(emb, labels, metric='cosine'):.4f}")


# ---------- 4. 用选定的 K 聚类 ----------
km = KMeans(n_clusters=K, random_state=401, n_init=10)
df["cluster"] = km.fit_predict(emb)


# ---------- 5. 每个 cluster 的 TF-IDF 关键词 ----------
extra_stops = {"students", "student", "course", "courses", "duke", "kunshan",
               "university", "dku", "credit", "credits", "will", "may"}
docs = df.groupby("cluster")["text"].apply(" ".join)
vec = TfidfVectorizer(
    stop_words=list(ENGLISH_STOP_WORDS | extra_stops),
    token_pattern=r"(?u)\b[a-zA-Z][a-zA-Z]+\b",
    ngram_range=(1, 2), sublinear_tf=True,
)
X = vec.fit_transform(docs)
terms = np.array(vec.get_feature_names_out())


# ---------- 6. 打印每个 cluster 的概况 ----------
print(f"\n\n========== K = {K} clusters ==========")
for c in range(K):
    sub = df[df["cluster"] == c]
    top_terms = terms[X[c].toarray().ravel().argsort()[::-1][:12]]

    # 离中心最近的 = 最有代表性的段落
    centroid = km.cluster_centers_[c]
    sims = emb[sub.index] @ centroid / np.linalg.norm(centroid)
    reps = sub.iloc[np.argsort(-sims)[:4]]

    print(f"\n---------- Cluster {c}  ({len(sub)} passages) ----------")
    print("Terms:", ", ".join(top_terms))
    print("Top rows:", "; ".join(f"{r} ({n})"
          for r, n in sub["matrix_row"].value_counts().head(3).items()))
    for _, r in reps.iterrows():
        print(f"  • [{r['matrix_row']}] {r['text'][:180]}")
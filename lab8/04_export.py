import os
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"

import json
import numpy as np
import pandas as pd
import umap
from sklearn.cluster import KMeans
from sklearn.feature_extraction.text import (
    TfidfVectorizer, CountVectorizer, ENGLISH_STOP_WORDS)

K = 15
LABELS = {
    0: "Physical Education & Sports",
    1: "Fees, Aid & Student Services",
    2: "Biology & Chemistry",
    3: "Language Learning",
    4: "Math, Computer Science & Data Science",
    5: "Grading & Placement Credit",
    6: "Society, Culture & Global Humanities",
    7: "Degree Credits, Matriculation & Transfer",
    8: "Registration, Leave & Academic Calendar",
    9: "Politics, Economics & Behavior",
    10: "Major Requirement Lists & Electives",
    11: "Environment & Global Health",
    12: "Interdisciplinary Seminars & Advising",
    13: "Media & Arts",
    14: "Asia Studies",
}

df = pd.read_csv("../data/lab8_passages.csv")
emb = np.load("../data/lab8_embeddings.npy")
assert len(df) == len(emb)
df["heading"] = df["heading"].fillna("")
df["subsection"] = df["subsection"].fillna("")


# ---------- 1. 聚类（与 03 完全相同的参数，结果一致） ----------
km = KMeans(n_clusters=K, random_state=401, n_init=10)
df["cluster"] = km.fit_predict(emb)
df["cluster_name"] = df["cluster"].map(LABELS)


# ---------- 2. UMAP 降到 2 维 ----------
reducer = umap.UMAP(n_components=2, n_neighbors=15, min_dist=0.15,
                    metric="cosine", random_state=401)
xy = reducer.fit_transform(emb)
df["x"] = xy[:, 0].round(4)
df["y"] = xy[:, 1].round(4)


# ---------- 3. 每段的 5 个语义近邻（在原始 384 维上算） ----------
sim = emb @ emb.T                      # 向量已归一化，点积 = 余弦相似度
np.fill_diagonal(sim, -1)
nn = np.argsort(-sim, axis=1)[:, :5]
ids = df["passage_id"].to_numpy()
df["neighbors"] = ["|".join(ids[row]) for row in nn]
df["neighbor_sims"] = ["|".join(f"{sim[i, j]:.3f}" for j in row)
                       for i, row in enumerate(nn)]


# ---------- 4. 每段在其所属 section 里的"典型程度" ----------
typ = np.zeros(len(df))
for row, g in df.groupby("matrix_row"):
    c = emb[g.index].mean(axis=0)
    c /= np.linalg.norm(c)
    typ[g.index] = emb[g.index] @ c
df["section_typicality"] = typ.round(3)   # 越低 = 越不像同 section 的其他段落


# ---------- 5. 导出散点图数据 ----------
cols = ["passage_id", "chapter", "section", "subsection", "heading", "page",
        "matrix_row", "matrix_order", "text", "word_count", "cluster",
        "cluster_name", "x", "y", "neighbors", "neighbor_sims", "section_typicality"]
df[cols].to_csv("../data/lab8_embedding_map.csv", index=False)


# ---------- 6. 导出矩阵数据（包含 0 的格子） ----------
rows = df[["matrix_row", "matrix_order"]].drop_duplicates().sort_values("matrix_order")
counts = df.groupby(["matrix_row", "cluster"]).size()
records = []
for _, r in rows.iterrows():
    total = int((df["matrix_row"] == r["matrix_row"]).sum())
    for c in range(K):
        n = int(counts.get((r["matrix_row"], c), 0))
        records.append({
            "matrix_row": r["matrix_row"], "matrix_order": int(r["matrix_order"]),
            "cluster": c, "cluster_name": LABELS[c],
            "count": n, "row_total": total, "proportion": round(n / total, 4),
        })
pd.DataFrame(records).to_csv("../data/lab8_topic_section_matrix.csv", index=False)


# ---------- 7. 每个主题的 TF-IDF 关键词 ----------
extra_stops = {"students", "student", "course", "courses", "duke", "kunshan",
               "university", "dku", "credit", "credits", "will", "may"}
stops = list(ENGLISH_STOP_WORDS | extra_stops)
docs = df.groupby("cluster")["text"].apply(" ".join)
tfidf = TfidfVectorizer(stop_words=stops, token_pattern=r"(?u)\b[a-zA-Z][a-zA-Z]+\b",
                        ngram_range=(1, 2), sublinear_tf=True)
X = tfidf.fit_transform(docs)
terms = np.array(tfidf.get_feature_names_out())
clusters_info = [{
    "cluster": c, "name": LABELS[c], "size": int((df["cluster"] == c).sum()),
    "terms": terms[X[c].toarray().ravel().argsort()[::-1][:10]].tolist(),
} for c in range(K)]


# ---------- 8. Part B 的语料概览 ----------
cv = CountVectorizer(stop_words=stops, token_pattern=r"(?u)\b[a-zA-Z][a-zA-Z]+\b")
freq = np.asarray(cv.fit_transform(df["text"]).sum(axis=0)).ravel()
vocab = cv.get_feature_names_out()
top_terms = [{"term": vocab[i], "count": int(freq[i])} for i in freq.argsort()[::-1][:20]]

chapters = (df.groupby("chapter", sort=False)
              .agg(passages=("passage_id", "count"), avg_words=("word_count", "mean"),
                   first_page=("page", "min"))
              .sort_values("first_page").reset_index())
chapters["short"] = chapters["chapter"].str.replace("Part ", "P").str.split(":").str[0] \
                    + " · " + chapters["chapter"].str.split(": ", n=1).str[1]
chapters["avg_words"] = chapters["avg_words"].round(1)

with open("../data/lab8_corpus_stats.json") as f:
    stats = json.load(f)
stats["n_clusters"] = K

overview = {
    "stats": stats,
    "chapters": chapters[["short", "passages", "avg_words"]].to_dict("records"),
    "top_terms": top_terms,
    "clusters": clusters_info,
}
with open("../data/lab8_overview.json", "w") as f:
    json.dump(overview, f, indent=2)

print("Exported: lab8_embedding_map.csv, lab8_topic_section_matrix.csv, lab8_overview.json")


# ================= Part G 分析素材 =================
print("\n=== Q3: Semantic diversity by formal section (rows with >= 5 passages) ===")
div = []
for row, g in df.groupby("matrix_row"):
    if len(g) < 5:
        continue
    p = g["cluster"].value_counts(normalize=True).to_numpy()
    entropy = float(-(p * np.log(p)).sum() / np.log(K))
    div.append((row, len(g), g["cluster"].nunique(), round(entropy, 3),
                round(g["section_typicality"].mean(), 3)))
div_df = pd.DataFrame(div, columns=["row", "n", "n_topics", "norm_entropy", "mean_typicality"])
print(div_df.sort_values("norm_entropy", ascending=False).to_string(index=False))

print("\n=== Q5: Most unusual passages relative to their section ===")
for _, r in df.nsmallest(8, "section_typicality").iterrows():
    print(f"  [{r.passage_id}] typ={r.section_typicality} | {r.matrix_row} | topic: {r.cluster_name}")
    print(f"      {r.text[:160]}")

print("\n=== Q4: Similar passages from DIFFERENT sections (excluding near-duplicates) ===")
iu = np.triu_indices(len(df), k=1)
pair_sims = sim[iu]
order = np.argsort(-pair_sims)
shown = 0
for k in order:
    i, j, s = iu[0][k], iu[1][k], pair_sims[k]
    if s > 0.95:
        continue
    if df.at[i, "matrix_row"] == df.at[j, "matrix_row"]:
        continue
    print(f"\n  sim={s:.3f}")
    print(f"  A [{df.at[i, 'passage_id']}] {df.at[i, 'matrix_row']}: {df.at[i, 'text'][:130]}")
    print(f"  B [{df.at[j, 'passage_id']}] {df.at[j, 'matrix_row']}: {df.at[j, 'text'][:130]}")
    shown += 1
    if shown >= 6:
        break

print("\n=== Q6: Keyword spread across topics and sections ===")
for kw in ["credit", "graduation", "registration", "academic integrity"]:
    m = df[df["text"].str.lower().str.contains(kw)]
    print(f"\n  '{kw}': {len(m)} passages, {m['cluster'].nunique()} topics, "
          f"{m['matrix_row'].nunique()} sections")
    print("    top topics:  ", "; ".join(f"{k} ({v})" for k, v in
                                        m["cluster_name"].value_counts().head(4).items()))
    print("    top sections:", "; ".join(f"{k} ({v})" for k, v in
                                        m["matrix_row"].value_counts().head(4).items()))
import pymupdf
import re
import json
import pandas as pd

PDF = "../data/dku_bulletin_2021_22.pdf"
doc = pymupdf.open(PDF)
toc = doc.get_toc()


def norm(s):
    s = re.sub(r"(\w)-\n([a-z])", r"\1\2", s)   # 修复行末连字符断词
    return re.sub(r"\s+", " ", s).strip()


# ---------- 1. 定位每个书签标题在页面上的位置 ----------
headings = []
for level, title, page in toc:
    pidx = page - 1
    y = 0
    if 0 <= pidx < doc.page_count:
        hits = doc[pidx].search_for(title.strip()[:60])
        if hits:
            y = hits[0].y0
    headings.append({"level": level, "title": norm(title), "pidx": pidx, "y": y})

heading_titles = {h["title"].lower() for h in headings}
start_page = headings[0]["pidx"]           # 第一个书签所在页 = 正文开始


# ---------- 2. 逐页读文字块，给每块打上当前所属的章节 ----------
raw_blocks = []
h_i = -1
current = {1: "", 2: "", 3: "", 4: "", 5: ""}

for pidx in range(start_page, doc.page_count):
    for x0, y0, x1, y1, text, bno, btype in doc[pidx].get_text("blocks", sort=True):
        if btype != 0:                     # 跳过图片块
            continue

        # 所有位于这个块之前的标题都"生效"
        while (h_i + 1 < len(headings) and
               (headings[h_i + 1]["pidx"], headings[h_i + 1]["y"]) <= (pidx, y0 + 1)):
            h_i += 1
            h = headings[h_i]
            current[h["level"]] = h["title"]
            for deeper in range(h["level"] + 1, 6):
                current[deeper] = ""

        t = norm(text)
        if not t:
            continue
        if re.fullmatch(r"\d{1,3}", t):     # 单独的页码
            continue
        if t.lower() in heading_titles:     # 标题本身不算正文
            continue

        raw_blocks.append({
            "chapter": current[1],
            "section": current[2] or current[1],
            "subsection": current[3],
            "heading": current[5] or current[4],
            "page": pidx + 1,
            "text": t,
        })

print("Raw text blocks:", len(raw_blocks))


# ---------- 3. 把跨页/跨块断开的段落接回去 ----------
merged = []
for b in raw_blocks:
    if merged:
        prev = merged[-1]
        same_place = (prev["chapter"], prev["section"], prev["subsection"]) == \
                     (b["chapter"], b["section"], b["subsection"])
        unfinished = not re.search(r'[.!?:;)"”]$', prev["text"])
        continues = re.match(r"^[a-z(]", b["text"])
        if same_place and unfinished and continues:
            prev["text"] += " " + b["text"]
            continue
    merged.append(dict(b))


# ---------- 4. 太长的段落按句子切成约 150 词的块 ----------
def split_long(text, max_words=220, target=150):
    if len(text.split()) <= max_words:
        return [text]
    sents = re.split(r"(?<=[.!?])\s+", text)
    chunks, cur = [], []
    for s in sents:
        cur.append(s)
        if len(" ".join(cur).split()) >= target:
            chunks.append(" ".join(cur))
            cur = []
    if cur:
        rest = " ".join(cur)
        if chunks and len(rest.split()) < 40:
            chunks[-1] += " " + rest
        else:
            chunks.append(rest)
    return chunks


passages = []
for b in merged:
    for chunk in split_long(b["text"]):
        passages.append({**b, "text": chunk})

df = pd.DataFrame(passages)
n_raw = len(df)


# ---------- 5. 清洗 ----------
df["word_count"] = df["text"].str.split().str.len()
df = df[df["word_count"] >= 12]            # 太短的多半是表格碎片、小标题
df = df.drop_duplicates(subset=["text"])
df = df[df["chapter"] != ""]
df = df.reset_index(drop=True)
df.insert(0, "passage_id", [f"p{i+1:04d}" for i in range(len(df))])

df.to_csv("../data/lab8_passages.csv", index=False)


# ---------- 6. Part A 要报告的数字 ----------
stats = {
    "raw_passages": int(n_raw),
    "clean_passages": int(len(df)),
    "avg_words": round(float(df["word_count"].mean()), 1),
    "n_chapters": int(df["chapter"].nunique()),
    "n_sections": int(df["section"].nunique()),
}
with open("../data/lab8_corpus_stats.json", "w") as f:
    json.dump(stats, f, indent=2)

print("\n=== Corpus stats ===")
for k, v in stats.items():
    print(f"{k}: {v}")

print("\n=== Passages per chapter ===")
summary = df.groupby("chapter", sort=False).agg(
    passages=("passage_id", "count"),
    first_page=("page", "min"),
    last_page=("page", "max"),
    avg_words=("word_count", "mean"),
).round(1)
print(summary.to_string())

print("\n=== Word count distribution ===")
print(df["word_count"].describe().round(1).to_string())

print("\n=== 5 random samples ===")
for _, r in df.sample(5, random_state=401).iterrows():
    print(f"\n[{r.passage_id}] {r.chapter} > {r.section} > {r.subsection} (p.{r.page})")
    print(r.text[:300])
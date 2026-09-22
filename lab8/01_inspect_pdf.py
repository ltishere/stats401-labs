import fitz  # 这就是 pymupdf
from collections import Counter

doc = fitz.open("../data/dku_bulletin_2021_22.pdf")
print("Total pages:", doc.page_count)

# 1. PDF 自带的书签目录：[层级, 标题, 页码]
toc = doc.get_toc()
print("\nTOC entries:", len(toc))
print("Entries per level:", Counter(level for level, _, _ in toc))

print("\n--- First 60 TOC entries ---")
for level, title, page in toc[:60]:
    print("  " * (level - 1) + f"[L{level}] {title}  (p.{page})")

# 2. 随便看一页正文，观察页眉页脚长什么样
print("\n--- Sample page 40 raw text ---")
print(doc[39].get_text()[:1500])
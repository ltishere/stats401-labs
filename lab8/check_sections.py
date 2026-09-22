import pandas as pd

df = pd.read_csv("../data/lab8_passages.csv")

for part in ["Part 6:", "Part 10:"]:
    sub = df[df["chapter"].str.startswith(part)]
    print(f"\n=== {part} sections ({len(sub)} passages) ===")
    print(sub["section"].value_counts().to_string())

# Part 10 里 Majors 那个 section 下面，每个专业有多少段
majors = df[df["section"].str.startswith("Majors", na=False)]
print(f"\n=== Majors subsections ({len(majors)} passages) ===")
print(majors["subsection"].value_counts().to_string())
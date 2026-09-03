import requests
import time
import pandas as pd
from bs4 import BeautifulSoup

BASE_URL = "https://books.toscrape.com/catalogue/page-{}.html"
HEADERS = {"User-Agent": "STATS401-Class-Exercise/1.0"}
RATING_MAP = {"One": 1, "Two": 2, "Three": 3, "Four": 4, "Five": 5}

records = []

for page in range(1, 51):            # 要求4：自动翻页
    url = BASE_URL.format(page)

    try:                             # 要求6：错误处理
        response = requests.get(url, headers=HEADERS, timeout=10)
        response.raise_for_status()
    except requests.RequestException as error:
        print(f"Page {page} failed: {error}")
        continue

    response.encoding = "utf-8"      # 防止 £ 变成乱码 "Â£"
    soup = BeautifulSoup(response.text, "html.parser")

    for book in soup.select("article.product_pod"):
        title = book.select_one("h3 a")["title"]
        price = float(
            book.select_one(".price_color").get_text(strip=True).replace("£", "")
        )
        # <p class="star-rating Three"> → class 列表第二项是 "Three"
        rating = RATING_MAP[book.select_one(".star-rating")["class"][1]]
        availability = book.select_one(".availability").get_text(strip=True)

        records.append({
            "id": len(records) + 1,
            "title": title,
            "price_gbp": price,
            "rating": rating,
            "availability": availability,
            "page": page,
        })

    print(f"Page {page} done, total records: {len(records)}")
    time.sleep(1)                    # 要求5：限速

df = pd.DataFrame(records)
df.to_csv("../data/lab3_data.csv", index=False)   # 要求7：保存
print("Saved", len(df), "records")
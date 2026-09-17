import pandas as pd
import json

df = pd.read_csv("../data/lab6_assignment_gdp.csv")

world = {"name": "World", "children": []}

for continent, g_cont in df.groupby("continent"):
    cont_node = {"name": continent, "children": []}

    for area, g_area in g_cont.groupby("area"):
        area_node = {"name": area, "children": []}

        for _, row in g_area.iterrows():
            area_node["children"].append({
                "name": row["country"],
                "gdp": float(row["gdp_billion_usd"]),   # 转成 Python float
                "status": row["gdp_status"]
            })

        cont_node["children"].append(area_node)

    world["children"].append(cont_node)

with open("../data/lab6_assignment_gdp.json", "w", encoding="utf-8") as f:
    json.dump(world, f, indent=2, ensure_ascii=False)

print("done")
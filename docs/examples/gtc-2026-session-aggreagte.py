import json
import os
import re
from datetime import datetime

import pandas as pd

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
PROJECT_DIR = os.path.dirname(os.path.abspath(__file__))
SESSIONS_CSV = os.path.join(PROJECT_DIR, "sponsors.csv")
INPUT_DIR = os.path.join(PROJECT_DIR, "bu_sponsor_recommendations")
OUTPUT_CSV = os.path.join(PROJECT_DIR, "gtc-2026-sponsors-with-bu-tags.csv")
# 输出的 Excel 文件名
OUTPUT_EXCEL = os.path.join(PROJECT_DIR, "gtc-2026-sponsors-match.xlsx")

MASTER_COLUMN = "sponsor_name"  # 主表中用于匹配的列


def aggregate_bu_results():
    # --- 1. 数据准备与主表加载 ---
    if not os.path.exists(SESSIONS_CSV):
        print(f"Error: Master file {SESSIONS_CSV} not found.")
        return

    print("Loading master session list...")
    master_df = pd.read_csv(SESSIONS_CSV)
    master_df[MASTER_COLUMN] = master_df[MASTER_COLUMN].astype(str)

    bu_rankings = {}
    bu_reasons = {}

    # --- 2. 遍历 BU 目录读取推荐结果 ---
    if not os.path.exists(INPUT_DIR):
        print(f"Error: Input directory {INPUT_DIR} does not exist.")
        return

    csv_files = [f for f in os.listdir(INPUT_DIR) if f.endswith(".csv")]
    bu_names = []
    # 用于存储每个 BU 的 DataFrame，方便后续写入 Excel Tab
    bu_dfs = {}

    for filename in csv_files:
        bu_label = filename.replace("_top20.csv", "").replace("_", " ")
        bu_names.append(bu_label)

        file_path = os.path.join(INPUT_DIR, filename)
        print(f"Processing {bu_label}...")

        # 读取并存入字典供 Excel 使用
        df = pd.read_csv(file_path)
        df[MASTER_COLUMN] = df[MASTER_COLUMN].astype(str)
        bu_dfs[bu_label] = df

        # 为主表聚合提取数据
        for _, row in df.iterrows():
            sid = row[MASTER_COLUMN]
            rank = row["rank"]
            reason = str(row.get("recommendation_reason", "")).strip()

            if sid not in bu_rankings:
                bu_rankings[sid] = {}
            bu_rankings[sid][bu_label] = rank

            if reason and reason != "nan":
                if sid not in bu_reasons:
                    bu_reasons[sid] = []
                bu_reasons[sid].append(f"[{bu_label}]: {reason}")

    # --- 3. 映射聚合结果回主表 ---
    print("\nMerging results into master table...")
    for bu in bu_names:
        master_df[bu] = master_df[MASTER_COLUMN].map(
            lambda x: bu_rankings.get(x, {}).get(bu, "")
        )

    def combine_reasons(sid):
        reasons_list = bu_reasons.get(sid, [])
        return " ; ".join(reasons_list) if reasons_list else ""

    master_df["Combined_BU_Recommendations"] = master_df[MASTER_COLUMN].apply(
        combine_reasons
    )

    # --- 4. 导出 CSV (保持原逻辑) ---
    master_df.to_csv(OUTPUT_CSV, index=False, encoding="utf-8-sig")
    print(f"Aggregated CSV saved: {OUTPUT_CSV}")

    # --- 5. 导出 Excel (新增逻辑：多 Tab 合并) ---
    print("\nCreating Multi-tab Excel file...")
    try:
        # 需要安装 openpyxl: pip install openpyxl
        with pd.ExcelWriter(OUTPUT_EXCEL, engine="openpyxl") as writer:
            # Tab 1: 聚合后的主表
            master_df.to_excel(writer, sheet_name="Master_Aggregated", index=False)
            print("  - Added Sheet: Master_Aggregated")

            # 随后的 Tabs: 每个 BU 的原始 CSV
            for bu_label, df in bu_dfs.items():
                # Excel 工作表名称限制为 31 字符
                safe_sheet_name = bu_label[:31]
                df.to_excel(writer, sheet_name=safe_sheet_name, index=False)
                print(f"  - Added Sheet: {safe_sheet_name}")

        print(f"\nSuccess! Excel workbook saved to: {OUTPUT_EXCEL}")

    except Exception as e:
        print(f"Error creating Excel: {e}")
        print("Tip: Make sure to 'pip install openpyxl'")


if __name__ == "__main__":
    aggregate_bu_results()

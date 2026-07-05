---
type: moc
title: Palace Map
description: closet pointer 式壓縮索引，LLM 掃描用。
date: 2026-07-05
---

# Palace Map

> 格式：每行一指標 `- 主題短語 | 實體;實體 | YYYY-MM-DD | →[標題](相對路徑.md)`。
> 行 ≤120 字元；本檔分片 ≤1500 字元。
> 由 /digest 追加；miss 時 fallback 全文 grep。
> 指標指向 raw 檔或 wiki 頁的錨點。

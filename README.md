![genmem banner](https://sobuj.top/media/genmem.png)


<div align="center">
<h1 style="font-family: poppins">🧠 GenMem</h1>

**Local-first markdown memory for AI assistants.**



[![MIT License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](https://claude.ai/chat/LICENSE) [![npm](https://img.shields.io/npm/v/genmem-mcp?style=flat-square&color=brightgreen)](https://www.npmjs.com/package/genmem-mcp) [![Node 16+](https://img.shields.io/badge/Node-16%2B-blue?style=flat-square)](https://nodejs.org/) [![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?style=flat-square)](https://www.typescriptlang.org/) [![MCP](https://img.shields.io/badge/MCP-Protocol-blueviolet?style=flat-square)](https://modelcontextprotocol.io/) [![Tests](https://img.shields.io/badge/Tests-144%20Passing-success?style=flat-square)](https://claude.ai/chat/15b2fc3f-bbdd-49cd-8afb-27e375d4faf5#) [![Active](https://img.shields.io/badge/Status-Active-brightgreen?style=flat-square)](https://claude.ai/chat/15b2fc3f-bbdd-49cd-8afb-27e375d4faf5#) [![Languages](https://img.shields.io/badge/Languages-3-blueviolet?style=flat-square)](https://claude.ai/chat/15b2fc3f-bbdd-49cd-8afb-27e375d4faf5#-bangla) 



[English](#-english) | [বাংলা](#-bangla) | [中文](#-chinese)
</div>


## English

### What is genmem?

genmem is an **MCP (Model Context Protocol) server** that gives Claude Desktop, Cursor, VS Code (Cline), Continue, and Windsurf **long-term memory**. Your AI assistant can save, search, and recall notes across every chat — the memory lives on your machine, in plain Markdown files you can read, edit, and version-control.

![genmem banner](https://sobuj.top/media/genmemdiagram.png)



### ⚡ Quick Start (Windows)

```powershell
# 1️⃣  Initialize scope (creates ~/.genmem)
npx -y genmem-mcp init

# 2️⃣  Auto-register in all AI clients
npx -y genmem-mcp install

# 3️⃣  Restart your AI client and start using memory tools!
```

**Try it right now:**

```
You: "Save a note: my favorite editor is Zed and I prefer dark mode."
[Later, in a new chat]
You: "What editor do I prefer?"
→ Claude will search memory and find your note instantly
```

### ✨ Core Features

|Feature|Benefit|
|---|---|
|🔍 **FTS5 Full-Text Search**|Fast, ranked results with highlighted snippets|
|📝 **Plain Markdown Storage**|Human-readable `.md` files you can edit anywhere|
|🚀 **Zero-Config Install**|Auto-detects Claude Desktop, Cursor, VS Code, Continue, Windsurf|
|💾 **Atomic Writes**|Crash-safe with SQLite WAL mode|
|📦 **Portable Backups**|Export/import entire scopes as `.zip`|
|🔗 **Linked Notes**|Create typed relationships between notes|
|🏷️ **Topic Organization**|Organize memory by topic hierarchy|
|♻️ **Idempotent Operations**|Safe to re-run install, import, save operations|

### 8️⃣ MCP Tools Available

```
memory_save       → Create/update notes (idempotent)
memory_search     → FTS5 search with snippets
memory_get        → Fetch note by ID
memory_recent     → List recent notes
memory_topics     → List all topics
memory_delete     → Soft or hard delete
memory_link       → Link notes together
memory_reflect    → AI reflection summaries
```

### 📋 CLI Commands

```bash
genmem init                         # Setup new scope
genmem doctor [--rebuild]           # Diagnostics & fix issues
genmem list [--topic X] [--limit N] # List notes
genmem search "query"               # Search notes
genmem install [--client X]         # Register in AI clients
genmem export --out backup.zip      # Backup scope
genmem import --in backup.zip       # Restore scope
genmem config get|set|path          # Manage config
genmem serve                        # Start MCP server
```

### 📁 File Format (Markdown + YAML)

Every note is organized with frontmatter:

```markdown
---
id: 01JABCDEF1234567890ABCDE
title: "How I configured SSH tunnels"
topic: infra/ssh
tags: [ssh, windows, tunnel]
links:
  - 01JABCDEF0000000000000000A
created_at: 2026-01-15T14:32:11.045Z
updated_at: 2026-01-15T14:32:11.045Z
source: chat
schema_version: 1
---

# Body Content

Plain CommonMark + GitHub Flavored Markdown. Edit in any text editor!
```

### 📂 Storage Structure

```
~/.genmem/
├── config.json          # Scope metadata
├── memory/              # Notes without topic
├── topics/              # Organized by topic
│   └── <topic>/<file>.md
├── attachments/         # Future feature
├── .trash/              # Soft-deleted (7-day window)
└── index/
    └── index.sqlite     # FTS5 search index
```

### 🛠️ Developer Setup

```bash
git clone https://github.com/<repo>/genmem-mcp
cd genmem-mcp
npm install
npm run build
npm test              # 144 tests (~5s)
npm run typecheck     # TypeScript check
npm run lint
```

### 📄 License

MIT License — See [LICENSE](https://claude.ai/chat/LICENSE)

---

<div class="bangla-section">

## বাংলা

### genmem কী?

genmem একটি **MCP সার্ভার** যা Claude, Cursor, VS Code এবং অন্যান্য AI টুলগুলিকে **দীর্ঘমেয়াদী মেমোরি** দেয়। আপনার নোটগুলি সাধারণ Markdown ফাইলে সংরক্ষিত থাকে যা আপনি যেকোনো জায়গা থেকে সম্পাদনা করতে পারেন।

![genmem banner](https://sobuj.top/media/genmemdiagram.png)

### ⚡ দ্রুত শুরু (Windows)

```powershell
# প্রথম: স্কোপ শুরু করুন
npx -y genmem-mcp init

# দ্বিতীয়: সব AI ক্লায়েন্টে নিবন্ধন করুন
npx -y genmem-mcp install

# তৃতীয়: আপনার AI টুল রিস্টার্ট করুন
```

**এখনই চেষ্টা করুন:**

```
আপনি: "নোট সেভ করুন: আমার প্রিয় এডিটর Zed এবং আমি ডার্ক মোড পছন্দ করি"
[পরে নতুন চ্যাটে]
আপনি: "আমি কোন এডিটর পছন্দ করি?"
→ Claude আপনার মেমোরি থেকে নোট খুঁজে পাবে
```

### ✨ মূল বৈশিষ্ট্য

|বৈশিষ্ট্য|সুবিধা|
|---|---|
|🔍 **FTS5 সার্চ**|দ্রুত, র‍্যাঙ্ক করা ফলাফল|
|📝 **মার্কডাউন স্টোরেজ**|সহজে পড়া যায় এমন ফাইল|
|🚀 **শূন্য কনফিগ**|স্বয়ংক্রিয় সেটআপ|
|💾 **নিরাপদ লেখা**|ক্র্যাশ-প্রুফ স্টোরেজ|
|📦 **ব্যাকআপ**|জিপ হিসাবে এক্সপোর্ট করুন|
|🔗 **লিঙ্ক করা নোট**|নোট সংযুক্ত করুন|

### 8️⃣ উপলব্ধ টুলস

```
memory_save       → নোট তৈরি/আপডেট করুন
memory_search     → সার্চ করুন
memory_get        → নোট ফেচ করুন
memory_recent     → সম্প্রতি আপডেট করা নোট
memory_topics     → সব টপিক দেখুন
memory_delete     → নোট ডিলিট করুন
memory_link       → নোট লিঙ্ক করুন
memory_reflect    → AI রিফ্লেকশন
```

### 📋 CLI কমান্ড

```bash
genmem init                         # নতুন স্কোপ সেটআপ
genmem doctor [--rebuild]           # সমস্যা নির্ণয় ও সমাধান
genmem list [--topic X]             # নোট তালিকা
genmem search "query"               # সার্চ করুন
genmem install                      # AI ক্লায়েন্টে নিবন্ধন
genmem export --out backup.zip      # ব্যাকআপ তৈরি করুন
genmem import --in backup.zip       # রিস্টোর করুন
```

### 📁 স্টোরেজ কাঠামো

```
~/.genmem/
├── config.json          # কনফিগ
├── memory/              # নোট
├── topics/              # টপিক দ্বারা সংগঠিত
├── attachments/         # ভবিষ্যতের জন্য
├── .trash/              # মুছে ফেলা নোট
└── index/index.sqlite   # সার্চ ইন্ডেক্স
```

### 📄 লাইসেন্স

MIT — [LICENSE](https://claude.ai/chat/LICENSE) দেখুন

</div>

---

## 中文

### genmem 是什么？

genmem 是一个 **MCP 服务器**，为 Claude、Cursor、VS Code 等 AI 助手提供**长期记忆**。您的笔记存储在易于编辑和版本控制的 Markdown 文件中。
![genmem banner](https://sobuj.top/media/genmemdiagram.png)

### ⚡ 快速开始 (Windows)

```powershell
# 1️⃣  初始化范围
npx -y genmem-mcp init

# 2️⃣  自动在所有 AI 客户端中注册
npx -y genmem-mcp install

# 3️⃣  重启您的 AI 工具即可开始使用
```

**立即尝试：**

```
你: "保存笔记：我最喜欢的编辑器是 Zed，我喜欢深色模式"
[在新对话中]
你: "我喜欢哪个编辑器？"
→ Claude 将从记忆中找到您的笔记
```

### ✨ 核心功能

|功能|优势|
|---|---|
|🔍 **FTS5 全文搜索**|快速、排序结果、摘要突出|
|📝 **Markdown 存储**|易于阅读的文件格式|
|🚀 **零配置安装**|自动检测 AI 客户端|
|💾 **原子写入**|崩溃安全的 SQLite WAL 模式|
|📦 **便携式备份**|导出/导入为 zip 格式|
|🔗 **链接笔记**|笔记之间的关联|
|🏷️ **主题组织**|按层级组织笔记|

### 8️⃣ 可用工具

```
memory_save       → 创建/更新笔记
memory_search     → 搜索笔记
memory_get        → 获取笔记
memory_recent     → 最近更新的笔记
memory_topics     → 查看所有主题
memory_delete     → 删除笔记
memory_link       → 链接笔记
memory_reflect    → AI 反思总结
```

### 📋 CLI 命令

```bash
genmem init                         # 设置新范围
genmem doctor [--rebuild]           # 诊断和修复
genmem list [--topic X]             # 列出笔记
genmem search "query"               # 搜索
genmem install                      # 在 AI 客户端中注册
genmem export --out backup.zip      # 备份
genmem import --in backup.zip       # 恢复
```

### 📁 存储结构

```
~/.genmem/
├── config.json          # 配置信息
├── memory/              # 笔记
├── topics/              # 按主题组织
├── attachments/         # 未来功能
├── .trash/              # 已删除笔记
└── index/index.sqlite   # 搜索索引
```

### 📄 许可证

MIT 许可证 — 见 [LICENSE](https://claude.ai/chat/LICENSE)

---

## 📚 完整文档

- **[MCP Tools Reference](https://claude.ai/chat/docs/mcp.md)** — 所有工具的完整模式
- **[File Format Spec](https://claude.ai/chat/docs/format.md)** — Markdown 文件格式
- **[CLI Reference](https://claude.ai/chat/docs/cli.md)** — 完整命令行参考

## 🚀 开发者指南

```bash
git clone https://github.com/<repo>/genmem-mcp
cd genmem-mcp
npm install && npm run build
npm test              # 144 个测试 (~5秒)
npm run typecheck     # TypeScript 检查
```

---

**Star ⭐ this project if you find it useful!**

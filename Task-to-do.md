# Task-to-do.md — genmem: প্রকাশনা ও ব্যবহার গাইড / Publication & Usage Guide

> **লক্ষ্য / Goal:** আপনার AI client-এ (Claude Desktop, Cursor, Cline, Continue, Windsurf) genmem memory tool ব্যবহার শুরু করা।
> Start using genmem memory in your AI client.

---

## 🇧🇩 বাংলায় ধাপে ধাপে (Step-by-step in Bangla)

### ধাপ ০: যা যা লাগবে (Prerequisites)
- [ ] Windows 10/11 computer
- [ ] Node.js 22.12.0+ installed → চেক করুন: `node --version`
- [ ] Git installed → চেক করুন: `git --version`
- [ ] একটা GitHub account (ফ্রি) → https://github.com
- [ ] একটা npm account (ফ্রি) → https://npmjs.com → Sign Up
- [ ] আপনার পছন্দের AI client installed (যেমন Claude Desktop)

---

### ধাপ ১: GitHub-এ Repository তৈরি করুন (5 মিনিট)

কেন? npm-এ publish করতে হলে GitHub repo থাকা ভালো — users দেখতে পাবে source code, issues report করতে পারবে।

1. https://github.com → **New repository** বাটনে ক্লিক করুন
2. Repository name: `genmem-mcp` (বা আপনার পছন্দের নাম)
3. Description: `Local-first markdown memory for AI assistants`
4. **Public** সিলেক্ট করুন (ফ্রি host করতে চাইলে)
5. ❌ "Add README" চেক করবেন না — আমাদের কাছে আগে থেকেই আছে
6. **Create repository** ক্লিক করুন

GitHub আপনাকে একটা URL দেবে — সেটা কপি করে রাখুন। যেমন:
```
https://github.com/YOUR-USERNAME/genmem-mcp.git
```

---

### ধাপ ২: Local Code GitHub-এ Push করুন (3 মিনিট)

PowerShell বা Command Prompt খুলুন, `genmem` ফোল্ডারে যান:

```powershell
cd "D:\0Lab\comand code\genmem"

git init
git add .
git commit -m "Initial release: genmem v0.1.0

- 8 MCP tools (save, search, get, recent, topics, delete, link, reflect)
- Auto-install for Claude Desktop, Cursor, VS Code (Cline), Continue, Windsurf
- Export/import scope as portable zip
- 144 tests, full Windows CI

Co-authored-by: CommandCodeBot <noreply@commandcode.ai>"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/genmem-mcp.git
git push -u origin main
```

✅ এখন আপনার কোড GitHub-এ আছে!

---

### ধাপ ৩: npm-এ Publish করুন (5 মিনিট)

কেন? `npx -y genmem-mcp install` কাজ করতে হলে package npm registry-তে থাকতে হবে।

```powershell
cd "D:\0Lab\comand code\genmem"

# Login (একবারই)
npm login
# → আপনার npm username, password, email দিন
# → যদি 2FA থাকে, OTP দিন

# Publish
npm publish
```

যদি "package name taken" error আসে, তাহলে `package.json`-এ name পরিবর্তন করুন:
```json
"@your-npm-username/genmem-mcp"
```
তারপর `npm publish --access public` (scoped packages-এর জন্য দরকার)।

✅ সফল হলে এই URL-এ দেখবেন:
```
https://www.npmjs.com/package/genmem-mcp
```

**এটাই npm-এ publish হওয়া — এরপর বিশ্বের যেকোনো মানুষ `npx -y genmem-mcp install` চালাতে পারবে।**

---

### ধাপ ৪: Tag ও Release তৈরি করুন GitHub-এ (2 মিনিট)

1. GitHub-এ আপনার repo খুলুন
2. **Releases** → **Create a new release** ক্লিক করুন
3. Tag: `v0.1.0`
4. Title: `genmem v0.1.0 — Initial Release`
5. Description-এ paste করুন:

```markdown
## 🎉 First stable release of genmem!

**Local-first markdown memory for AI assistants** — your AI gets long-term memory across every chat, stored as plain Markdown files you can read and edit.

### Features
- 🧠 **8 MCP tools**: save, search, get, recent, topics, delete, link, reflect
- 🔍 **FTS5 full-text search** with BM25 ranking and highlighted snippets
- 📁 **Human-readable Markdown** — every note is a .md file on disk
- 🚀 **One-command install** for Claude Desktop, Cursor, VS Code (Cline), Continue, and Windsurf
- 💾 **Portable export/import** as zip with built-in CRC32 verification
- 🔒 **Local-only, zero network**, MIT licensed

### Install
```bash
npx -y genmem-mcp install
```

### Stats
- 144 tests, all green
- 21 test files
- TypeScript strict mode
- Full Windows CI on Node 22
```

6. **Publish release** ক্লিক করুন ✅

---

### ধাপ ৫: নিজেই ব্যবহার শুরু করুন (5 মিনিট)

#### ৫.১ Claude Desktop-এ ইনস্টল করুন

PowerShell-এ:
```powershell
# এটা আপনার নিজের computer-এই install করার জন্য
npx -y genmem-mcp install
```

আউটপুট দেখাবে কোন কোন AI client পাওয়া গেছে:
```
detected clients:
  ✓ Claude Desktop    C:\Users\YOU\AppData\Roaming\Claude\claude_desktop_config.json
  ✓ Cursor             C:\Users\YOU\.cursor\mcp.json
  ✗ Continue           not installed
  ✓ VS Code (Cline)    C:\Users\YOU\AppData\Roaming\Code\User\settings.json
  ✗ Windsurf           not installed

results:
  installed    Claude Desktop    ...claude_desktop_config.json
  installed    Cursor            ...\.cursor\mcp.json
  installed    VS Code (Cline)   ...\settings.json
```

#### ৫.২ Claude Desktop Restart করুন

1. Claude Desktop সম্পূর্ণ বন্ধ করুন (system tray-তে right-click → Quit)
2. আবার খুলুন
3. একটা নতুন chat শুরু করুন

#### ৫.৩ টেস্ট করুন!

Claude-কে বলুন:
> "Save a note: my favorite programming language is TypeScript, and I prefer dark mode editors."

Claude-এর response-এ আপনি দেখবেন `memory_save` tool call হচ্ছে।

তারপর নতুন chat-এ:
> "What programming language do I prefer?"

Claude `memory_search` call করে আপনার saved note খুঁজে বের করবে!

#### ৫.৪ Command Line থেকে Check করুন

```powershell
# আপনার সব notes দেখুন
npx -y genmem-mcp list

# Health check
npx -y genmem-mcp doctor

# Backup নিন
npx -y genmem-mcp export --out my-memories.zip
```

---

### ধাপ ৬: বন্ধুদের শেয়ার করুন 🎉

আপনার GitHub repo-র URL বন্ধুদের পাঠান:
```
https://github.com/YOUR-USERNAME/genmem-mcp
```

তারা পড়তে পারবে, fork করতে পারবে, contribute করতে পারবে।

---

## 🇬🇧 Step-by-step in English

### Step 0: Prerequisites
- [ ] Windows 10/11 computer
- [ ] Node.js 22.12.0+ → verify: `node --version`
- [ ] Git installed → verify: `git --version`
- [ ] GitHub account (free) → https://github.com
- [ ] npm account (free) → https://npmjs.com → Sign Up
- [ ] Your favorite AI client installed (e.g. Claude Desktop)

---

### Step 1: Create a GitHub Repository (5 min)

Why? Publishing to npm without a public source repo looks suspicious. Users want to see the code.

1. Go to https://github.com → click **New repository**
2. Repository name: `genmem-mcp` (or your preferred name)
3. Description: `Local-first markdown memory for AI assistants`
4. Select **Public** (free hosting)
5. ❌ Don't check "Add README" — we already have one
6. Click **Create repository**

Copy the URL GitHub gives you. Example:
```
https://github.com/YOUR-USERNAME/genmem-mcp.git
```

---

### Step 2: Push Local Code to GitHub (3 min)

Open PowerShell or Command Prompt, navigate to the `genmem` folder:

```powershell
cd "D:\0Lab\comand code\genmem"

git init
git add .
git commit -m "Initial release: genmem v0.1.0

- 8 MCP tools (save, search, get, recent, topics, delete, link, reflect)
- Auto-install for Claude Desktop, Cursor, VS Code (Cline), Continue, Windsurf
- Export/import scope as portable zip
- 144 tests, full Windows CI

Co-authored-by: CommandCodeBot <noreply@commandcode.ai>"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/genmem-mcp.git
git push -u origin main
```

✅ Your code is now on GitHub!

---

### Step 3: Publish to npm (5 min)

Why? `npx -y genmem-mcp install` only works if the package is on the npm registry.

```powershell
cd "D:\0Lab\comand code\genmem"

# Login (once)
npm login
# → Enter your npm username, password, email
# → If 2FA is enabled, enter your OTP

# Publish
npm publish
```

If you get a "package name taken" error, edit `package.json`:
```json
"@your-npm-username/genmem-mcp"
```
Then publish with `npm publish --access public` (required for scoped packages).

✅ On success, your package is live at:
```
https://www.npmjs.com/package/genmem-mcp
```

**This is what makes `npx` work for anyone in the world.**

---

### Step 4: Create a Tag & Release on GitHub (2 min)

1. Open your repo on GitHub
2. Click **Releases** → **Create a new release**
3. Tag: `v0.1.0`
4. Title: `genmem v0.1.0 — Initial Release`
5. Paste this into the description:

```markdown
## 🎉 First stable release of genmem!

**Local-first markdown memory for AI assistants** — your AI gets long-term memory across every chat, stored as plain Markdown files you can read and edit.

### Features
- 🧠 **8 MCP tools**: save, search, get, recent, topics, delete, link, reflect
- 🔍 **FTS5 full-text search** with BM25 ranking and highlighted snippets
- 📁 **Human-readable Markdown** — every note is a .md file on disk
- 🚀 **One-command install** for Claude Desktop, Cursor, VS Code (Cline), Continue, and Windsurf
- 💾 **Portable export/import** as zip with built-in CRC32 verification
- 🔒 **Local-only, zero network**, MIT licensed

### Install
```bash
npx -y genmem-mcp install
```

### Stats
- 144 tests, all green
- 21 test files
- TypeScript strict mode
- Full Windows CI on Node 22
```

6. Click **Publish release** ✅

---

### Step 5: Start Using It Yourself (5 min)

#### 5.1 Install in Claude Desktop

In PowerShell:
```powershell
# Install on your own machine
npx -y genmem-mcp install
```

Output will show which AI clients were found:
```
detected clients:
  ✓ Claude Desktop    C:\Users\YOU\AppData\Roaming\Claude\claude_desktop_config.json
  ✓ Cursor             C:\Users\YOU\.cursor\mcp.json
  ✗ Continue           not installed
  ✓ VS Code (Cline)    C:\Users\YOU\AppData\Roaming\Code\User\settings.json
  ✗ Windsurf           not installed

results:
  installed    Claude Desktop    ...claude_desktop_config.json
  installed    Cursor            ...\.cursor\mcp.json
  installed    VS Code (Cline)   ...\settings.json
```

#### 5.2 Restart Claude Desktop

1. Fully quit Claude Desktop (right-click system tray icon → Quit)
2. Reopen it
3. Start a new chat

#### 5.3 Test It!

Tell Claude:
> "Save a note: my favorite programming language is TypeScript, and I prefer dark mode editors."

You'll see Claude make a `memory_save` tool call in its response.

Then in a new chat:
> "What programming language do I prefer?"

Claude will call `memory_search` and find your saved note!

#### 5.4 Check from Command Line

```powershell
# See all your notes
npx -y genmem-mcp list

# Health check
npx -y genmem-mcp doctor

# Take a backup
npx -y genmem-mcp export --out my-memories.zip
```

---

### Step 6: Share with Friends 🎉

Send your GitHub repo URL to friends:
```
https://github.com/YOUR-USERNAME/genmem-mcp
```

They can read, fork, and contribute.

---

## ✅ Quick Checklist (প্রিন্ট করে টিক দিন)

- [ ] Node.js 22+ installed
- [ ] Git installed
- [ ] GitHub account ready
- [ ] npm account ready
- [ ] Step 1: GitHub repo created
- [ ] Step 2: Code pushed to GitHub
- [ ] Step 3: Package published to npm
- [ ] Step 4: GitHub release v0.1.0 created
- [ ] Step 5.1: `npx -y genmem-mcp install` run
- [ ] Step 5.2: Claude Desktop restarted
- [ ] Step 5.3: First note saved via Claude
- [ ] Step 5.4: Note found in new chat
- [ ] Step 5.4: `genmem list` shows the note
- [ ] Step 6: Shared with a friend

---

## 🆘 সমস্যা হলে / Troubleshooting

### "node is not recognized"
→ Node.js install করা নেই। https://nodejs.org থেকে download করুন।

### "git is not recognized"
→ Git install করা নেই। https://git-scm.com থেকে download করুন।

### "npm login" fails
→ Terminal-টি reopen করুন (যাতে PATH update হয়)। তারপর আবার try করুন।

### "package name taken"
→ `package.json`-এ name পরিবর্তন করুন:
```json
"name": "@YOUR-NPM-USERNAME/genmem-mcp"
```
তারপর `npm publish --access public`

### Claude Desktop-এ memory tools দেখা যাচ্ছে না
1. Claude Desktop সম্পূর্ণ বন্ধ করুন (system tray থেকে)
2. PowerShell-এ check করুন: `type "$env:APPDATA\Claude\claude_desktop_config.json"` 
3. `"genmem"` key আছে কিনা দেখুন
4. Claude আবার খুলুন
5. Settings → Developer → MCP Servers-এ genmem enabled আছে কিনা দেখুন

### "npx -y genmem-mcp install" fails
1. Internet connection check করুন
2. `npm config get registry` → `https://registry.npmjs.org/` দেখাচ্ছে কিনা
3. Node version check করুন: `node --version` → 22+ হতে হবে

### "doctor" reports OneDrive warning
→ এটা শুধু সতর্কতা, error না। আপনার scope OneDrive folder-এ আছে।
→ সমাধান: scope অন্য জায়গায় move করুন বা ignore করুন (low risk for Markdown files).

---

## 📞 সাহায্য দরকার? / Need help?

1. **GitHub Issues**: https://github.com/YOUR-USERNAME/genmem-mcp/issues
2. **Documentation**: আপনার `genmem/docs/` folder-এ আছে
3. **README**: `genmem/README.md` পড়ুন
4. **Test results locally**: `npm test` চালান

---

**শুভকামনা! আপনার AI এখন সব কথা মনে রাখবে। 🎉**
**Best of luck! Your AI will now remember everything. 🎉**

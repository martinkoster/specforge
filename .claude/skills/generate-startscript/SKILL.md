---
name: generate-startscript
description: Gather project and environment information and create a friendly, working startup script (scripts/start.ps1 and/or scripts/start.sh) plus run instructions in scripts/README.md. Use when the user asks how to start or run the application, wants a start script, or runs /generate-startscript.
---

You are a DevOps engineer helping the user get their application running. Your goal is to create a clear, working startup script for their environment — even if they are not very technical.

---

## Step 1: Gather Project Information from Spec

Read the following documents:
- `spec/01_intent/intent.md` — project type, purpose, stakeholders
- `spec/03_design/technical_design/technical_decisions.md` — technology stack, deployment approach
- `spec/03_design/technical_design/service_design.md` — services and their roles

Also scan the project root for existing build/config files to detect the actual stack:
- `package.json` → Node.js project (check `scripts.start` or `scripts.dev`)
- `pom.xml` / `build.gradle` → Java/Maven/Gradle (Spring Boot, Quarkus, etc.)
- `*.csproj` / `*.sln` → .NET project
- `requirements.txt` / `pyproject.toml` → Python project
- `go.mod` → Go project
- `Cargo.toml` → Rust project
- `docker-compose.yml` → Docker Compose setup
- `Dockerfile` → single-container Docker setup

---

## Step 2: Ask Only What You Don't Know

From what you've gathered, identify what is still unclear. Then ask the user **only the unanswered questions** from this list — do not ask about things you already know:

1. **Operating system**: "Are you running on Windows, Linux, or macOS?" *(ask if not obvious from the project or context)*
2. **Application type** *(ask if not in the design)*:
   - Web application (browser-based frontend + backend)
   - REST API / backend service only
   - Command-line tool
   - Desktop application
   - Other (please describe)
3. **Technology stack** *(ask if not identified from files or design)*: "What technology are you using? Examples: Java Spring Boot, Node.js/Express, Python FastAPI, ASP.NET Core, other"
4. **Database** *(ask if not in the design)*: "Does your app use a database? If so, which one — e.g., PostgreSQL, MySQL, SQLite, MongoDB, H2 (in-memory for dev)?"
5. **Port** *(ask if not obvious)*: "What port should the app run on? Common defaults: 8080 (Spring Boot), 3000 (Node.js), 5000 (Python), 5001 (.NET)"
6. **Environment variables**: "Are there required environment variables such as database connection strings or API keys? List them if you know them — I'll add them as placeholders."

Be friendly and explain in plain language why each question matters. For non-technical users, offer common concrete examples.

---

## Step 3: Create the Startup Script

Based on all gathered information, create the appropriate script(s) in `scripts/`.

### Windows — `scripts/start.ps1`

```powershell
# start.ps1 — Start [Project Name]
# Usage: Right-click > Run with PowerShell, or: powershell -ExecutionPolicy Bypass -File scripts/start.ps1

# --- Prerequisites check ---
# (Check that required runtimes are installed and print a friendly error if not)

# --- Environment variables ---
# Set these before running, or export them in your shell profile:
# $env:DATABASE_URL = "..."      # <-- replace with your database connection string
# $env:SECRET_KEY = "..."        # <-- replace with your secret key

# --- Build (if needed) ---
# e.g., mvn package -DskipTests

# --- Start ---
# e.g., java -jar target/myapp.jar

Write-Host "Application started. Open http://localhost:[PORT] in your browser."
```

### Linux / macOS — `scripts/start.sh`

```bash
#!/usr/bin/env bash
# start.sh — Start [Project Name]
# Usage: chmod +x scripts/start.sh && ./scripts/start.sh

set -e

# --- Prerequisites check ---

# --- Environment variables ---
# export DATABASE_URL="..."
# export SECRET_KEY="..."

# --- Build (if needed) ---

# --- Start ---

echo "Application started. Open http://localhost:[PORT] in your browser."
```

Fill in all placeholders with real commands based on the detected stack. Include friendly comments explaining what each section does. Make the script self-documenting for a non-technical user.

For **cross-platform projects** or when the user wants to support both environments, create both `start.ps1` and `start.sh`.

### Special cases:

- **Docker Compose**: create a script that runs `docker compose up --build` and opens the browser URL.
- **Spring Boot**: build with `mvn package -DskipTests` (or `./gradlew bootJar`) then run the jar.
- **Node.js**: run `npm install` then `npm start` (or `npm run dev`).
- **Python**: activate a virtual environment (or create one if missing), install requirements, then start the app.
- **.NET**: run `dotnet run --project [path]`.

---

## Step 4: Create Supporting Documentation

Update `scripts/README.md` with:
- Prerequisites to install before running (with download links or install commands)
- How to run the startup script (exact command, step by step)
- Environment variables that must be configured (name, purpose, example value)
- How to stop the application
- The URL where the app will be accessible
- Basic troubleshooting for the 2–3 most likely issues (port in use, missing runtime, missing env var)

Write this in plain English, suitable for someone who has never run a developer tool before. Avoid jargon; where jargon is unavoidable, explain it in parentheses.

---

## Step 5: Report

After creating the script(s), report:
- Which file(s) were created
- The exact command to run the startup script
- Any prerequisites the user still needs to install
- Environment variables that need real values before the app will start
- The URL where the app will be accessible once it is implemented
- Any assumptions you made (so the user can correct them)

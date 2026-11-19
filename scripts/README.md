# Starting SpecForge

SpecForge is a desktop application: starting it opens a window. It doesn't run a web server, so there's no URL to open in a browser.

These scripts build SpecForge from the source code and start it.

## What you need first

| Tool | Version | Where to get it |
|---|---|---|
| Node.js (runs the build tools) | 24 or newer | https://nodejs.org (the "LTS" download) |
| Git (version control; SpecForge uses it for every project) | 2.30 or newer, 2.38+ recommended | https://git-scm.com/downloads |

You don't need to install pnpm (the package manager): it comes with Node.js through `corepack`.

To use real AI agents in the app, you also need:
- **Claude Code**, installed on your computer.
- **A provider:** an Anthropic API key, or access to Amazon Bedrock, Google Vertex or Microsoft Foundry.

The setup wizard asks for both. You don't need either of them in demo mode (see below).

## How to start

Open a terminal in the project folder (`C:\Projects\specforge`).

On **Windows** (PowerShell):

```powershell
powershell -ExecutionPolicy Bypass -File scripts\start.ps1
```

On **macOS / Linux**:

```bash
chmod +x scripts/start.sh   # only once
./scripts/start.sh
```

The first start installs the dependencies, which takes a few minutes. Every start then rebuilds the app, so you always see the current code, and opens the SpecForge window.

### Options

| Windows | macOS / Linux | What it does |
|---|---|---|
| `-Demo` | `--demo` | Runs use a **scripted test agent** instead of Claude Code: you can try project → story → run → review without Claude Code and without API credit. Uses a separate throwaway profile. |
| `-Fresh` | `--fresh` | Starts with an **empty throwaway profile** (deleted first), so the setup wizard appears again. Can be combined with `-Demo`. |
| `-Packaged` | – | Builds and starts the **packaged app** (`release\win-unpacked\SpecForge.exe`), the same as what the installer contains. Slower to build. |
| `-SkipBuild` | `--skip-build` | Starts the last build without rebuilding (faster). |

Without `-Demo` or `-Fresh`, SpecForge uses your normal profile: settings, projects list and the stored provider secret. The throwaway profile is in your temp folder (`%TEMP%\specforge-try`, or `$TMPDIR/specforge-try` on macOS/Linux).

**Note:** demo and fresh starts run SpecForge in *test mode*. That's what allows the separate profile, and it also enables a few test-only commands. Use a normal start for real work.

## Environment variables

You don't need to set any: the scripts set them for that one start only.

| Name | Purpose | Example |
|---|---|---|
| `SPECFORGE_TEST` | Test mode. Needed for the two variables below. | `1` |
| `SPECFORGE_USER_DATA` | Profile folder (test mode only) | `C:\Users\you\AppData\Local\Temp\specforge-try` |
| `SPECFORGE_MOCK_AGENT` | Scripted test agent instead of Claude Code (test mode only) | `1` |

You never put API keys in environment variables or files. You enter them in the setup wizard, and SpecForge stores them in the operating system's credential store.

## How to stop

Close the SpecForge window. Pressing **Ctrl+C** in the terminal also works.

## Troubleshooting

- **"Node.js is not installed" / "too old":**
  1. Install Node.js 24+ from https://nodejs.org.
  2. Close the terminal and open a new one, so it finds the new version.
  3. Run the script again.
- **"running scripts is disabled on this system" (Windows):** start the script exactly as shown above, with `powershell -ExecutionPolicy Bypass -File ...`. Double-clicking doesn't work.
- **The build fails after pulling new code:** delete the `node_modules` folder and run the script again. It then reinstalls everything.
- **Linux: the window doesn't open over SSH / without a desktop:** start it with `xvfb-run -a ./scripts/start.sh` (needs the `xvfb` package).
- **`-Packaged` fails on this Windows machine:** AppLocker blocks the full installer step, which is why the script only builds the unpacked app (`--dir`). If even that fails, use the normal start.

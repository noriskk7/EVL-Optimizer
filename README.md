# ⚡ EVL Optimizer

🌐 **English** · [Português](LEIA-ME.md)

Everything your Windows 10/11 PC needs, in one place. Free up memory that stays free, clean junk, uninstall apps for real, drop the bloat and measure what you got. 🚀
Portable, one `.exe`, in English, Português and Español.

> 💸 **100% free.** If you paid for it, you were scammed. Official site: [evlcorp.lol](https://evlcorp.lol)
> 🔓 **Open and auditable code.** Own license: free for personal use and small businesses. No telemetry, no network calls.

## ✨ What it does
- 🧠 **Memory**: frees RAM from idle apps only (never the one in focus, games, audio or VMs) and measures the result again 8 seconds later.
- 🧹 **Cleaner**: 30 categories of temp files, caches and Windows leftovers. Cookies, passwords and personal files are left alone.
- 🗑️ **Uninstaller**: removes the app and hunts down its leftovers, with a `.reg` backup of every key it deletes.
- 🎈 **Debloat**: removes useless Windows apps, never the Store or Windows Security.
- 📊 **Benchmark**: CPU, RAM, disk and GPU, with a score and a verdict.
- 🎮 **Game Mode**: notices when a game opens, tunes the PC, and undoes everything when it closes.
- ⚙️ **Tweaks, startup and processes**: reversible tweaks, startup manager and a live process list.
- 🔑 **Windows license check**: shows only the last 5 characters of the key.
- 📝 **Activity log**: every action is logged with proof (it measures again after acting).
- 🎨 **Custom look**: pick your accent color and background.

## 🔒 Why the source is open
Transparency. The app asks for **administrator rights**, edits the registry, removes apps and deletes files, so you should be able to read exactly what it does. It has **no telemetry and makes no network calls**. The only link is a button that opens evlcorp.lol in your browser.

## 🗂️ Layout
| Path | What it is |
| --- | --- |
| `src/main.js` | Main process: window, tray, monitor, Game Mode and IPC handlers (every action is logged). |
| `src/core/` | Everything that talks to Windows (koffi bindings, registry, cleaner, uninstaller, tweaks...). |
| `src/renderer/` | The interface (plain JavaScript, no framework or bundler). |

## 👩‍💻 Development
```powershell
npm install
npm start
```
npm 11 blocks install scripts by default. If `node_modules\electron\dist` is missing after `npm install`, run `node node_modules\electron\install.js` once.
Without administrator rights, the screens that need elevation are disabled.

## 📦 Building
```powershell
npm run dist   # portable exe in dist\
```
If the build cannot clean `dist\` because another program holds `app.asar`, build into a folder outside the project:
`npx electron-builder --win portable --x64 "-c.directories.output=<other folder>"`.

🛡️ The exe is not code-signed, so SmartScreen and some antivirus products may warn about it. Compare the SHA-256 of what you downloaded with the one published in the release.

## 🤝 Contributing
Pull requests are welcome! Bug fixes, translations and improvements are all appreciated. By submitting a contribution you agree to the contribution terms in section 4 of the [license](LICENSE): you grant EvlCorp a license to use it in the Software.

## 📄 License
[EVL Software License 1.0](LICENSE): free for personal use and small businesses (up to 100 people). Third-party: Electron (MIT), koffi (MIT) and the Inter font (OFL-1.1).

💼 **Large companies and white-label:** get a commercial license at support@evlcorp.lol.

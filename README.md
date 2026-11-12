# ⚡ EVL Optimizer

🌐 **English** · [Português](LEIA-ME.md)

Everything your Windows 10/11 PC needs, in one place. 🚀
Free up memory that stays free, clean junk, uninstall apps for real, drop the bloat and measure what you got.

Portable, one `.exe`, in English, Português and Español.

> 💸 **100% free.** If you paid for it, you were scammed. Official site: [evlcorp.lol](https://evlcorp.lol)
>
> 🔓 **Open and auditable code.** Own license: free for personal use and small businesses.
>
> 🔒 No telemetry. The only network request is an optional update check, once a day (see [Updates](#-updates)).

---

## ✨ What it does

### 🧹 Cleaner (35 categories)

- 💻 **Windows:** temp files, thumbnails, Store and WebView2 cache, crash reports, Windows Update leftovers, shader caches
- 🎵 **DAWs:** Ableton, FL Studio, Cubase, Pro Tools, Studio One, REAPER, Bitwig, Reason and more. Cache, logs and **VST plugin scan cache**
- 🔌 **Plugins:** Native Instruments, Waves, iZotope, Arturia, Splice and other plugin managers
- 🎨 **Creative and streaming:** Adobe (all apps), DaVinci Resolve, Blender, Unity, OBS, Streamlabs, Elgato
- 🌐 **Browsers and apps:** Chrome, Edge, Firefox, Discord, Signal, Zoom, Notion, Figma, Spotify, Deezer, TIDAL and many more
- 🎮 **Games:** Steam, Epic, Battle.net, Riot, FiveM, Minecraft
- 🖱️ **Hardware apps:** NVIDIA, Razer, Logitech, Corsair, SteelSeries, ASUS, MSI, Overwolf
- 🔒 **Never touched:** projects, backups, session recovery, libraries, samples, presets, licenses, cookies and passwords
- ⏸️ **Safe by design:** an app that is open is skipped

### 🗑️ Uninstaller

- 🔍 Removes the app and hunts down its leftovers: folders, registry, shortcuts, services, tasks
- 🎹 Also finds VST, VST3, CLAP and AAX plugins, ASIO drivers and Windows Firewall rules
- ⚠️ Warns if the app is still open (it never closes it for you)
- 🛡️ Nothing inside your Documents is pre-selected
- 💾 Every registry key gets a `.reg` backup, and folders go to the Recycle Bin

### 🎈 Debloat

- 🧼 Removes useless Windows apps, never the Store or Windows Security
- 🔑 Deletes the registry keys Windows uses to bring them back (with a `.reg` backup)
- ⚙️ Turns off the services only those apps use (reversible)

### 🧠 More tools

- 🧠 **Memory:** frees RAM from idle apps only (never the one in focus, games, audio or VMs) and measures the result again 8 seconds later
- 🎮 **Game Mode:** notices when a game opens, tunes the PC, and undoes everything when it closes
- 📊 **Benchmark:** CPU, RAM, disk and GPU, with a score and a verdict
- ⚙️ **Tweaks, startup and processes:** reversible tweaks, startup manager and a live process list
- 🔑 **Windows license check:** shows only the last 5 characters of the key
- 📝 **Activity log:** every action is logged with proof (it measures again after acting)
- 🎨 **Custom look:** pick your accent color and background

---

## 🔒 Why the source is open

Transparency. The app asks for **administrator rights**, edits the registry, removes apps and deletes files, so you should be able to read exactly what it does.

It has **no telemetry**. The only network request is the optional update check, and links open [evlcorp.lol](https://evlcorp.lol) in your browser.

## 🔄 Updates

- 📅 Once a day, the app asks GitHub for the latest version number and shows a banner on the Home screen if there is a new one
- 🔒 No data is sent, and **nothing is downloaded or installed by itself**: the banner opens the download page on [evlcorp.lol](https://evlcorp.lol)
- ⚙️ Turn it off in **Settings → Notify about new versions**

## 🗂️ Layout

| Path | What it is |
| --- | --- |
| `src/main.js` | Main process: window, tray, monitor, Game Mode and IPC handlers (every action is logged) |
| `src/core/` | Everything that talks to Windows (koffi bindings, registry, cleaner, uninstaller, tweaks...) |
| `src/renderer/` | The interface (plain JavaScript, no framework or bundler) |

## 👩‍💻 Development

```powershell
npm install
npm start
```

- npm 11 blocks install scripts by default. If `node_modules\electron\dist` is missing after `npm install`, run `node node_modules\electron\install.js` once
- Without administrator rights, the screens that need elevation are disabled

## 📦 Building

```powershell
npm run dist   # portable exe in dist\
```

If the build cannot clean `dist\` because another program holds `app.asar`, build into a folder outside the project:
`npx electron-builder --win portable --x64 "-c.directories.output=<other folder>"`.

🛡️ The exe is not code-signed, so SmartScreen and some antivirus products may warn about it. Compare the SHA-256 of what you downloaded with the one published in the release.

## 🤝 Contributing

Pull requests are welcome! Bug fixes, translations and improvements are all appreciated.

By submitting a contribution you agree to the contribution terms in section 4 of the [license](LICENSE): you grant EvlCorp a license to use it in the Software.

## 📄 License

[EVL Software License 1.0](LICENSE): free for personal use and small businesses (up to 100 people).

Third-party: Electron (MIT), koffi (MIT) and the Inter font (OFL-1.1).

💼 **Large companies and white-label:** get a commercial license at support@evlcorp.lol.

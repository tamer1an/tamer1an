# Dev cache relocation map (C: → another drive)

Set these once with `setx NAME "W:\..."`, restart shells/apps. Create the target
dirs first. Values shown target `W:\caches\...`.

| Tool | Env var / setting | Default under C: |
|------|-------------------|------------------|
| Windows user temp | `TEMP`, `TMP` | `%LOCALAPPDATA%\Temp` |
| npm | `NPM_CONFIG_CACHE` | `%LOCALAPPDATA%\npm-cache` |
| yarn | `YARN_CACHE_FOLDER` | `%LOCALAPPDATA%\Yarn\Cache` |
| pnpm | `PNPM_HOME` / store via `pnpm config set store-dir` | `%LOCALAPPDATA%\pnpm` |
| pip | `PIP_CACHE_DIR` | `%LOCALAPPDATA%\pip\Cache` |
| cargo (Rust) | `CARGO_HOME` | `%USERPROFILE%\.cargo` |
| Go | `GOPATH`, `GOMODCACHE` | `%USERPROFILE%\go` |
| Gradle | `GRADLE_USER_HOME` | `%USERPROFILE%\.gradle` |
| Maven | `MAVEN_OPTS` + `settings.xml localRepository` | `%USERPROFILE%\.m2` |
| NuGet | `NUGET_PACKAGES` | `%USERPROFILE%\.nuget\packages` |
| HuggingFace | `HF_HOME` | `%USERPROFILE%\.cache\huggingface` |
| Ollama | `OLLAMA_MODELS` | `%USERPROFILE%\.ollama` |
| Docker Desktop | Settings → Resources → *Disk image location* (UI, not env) | `%LOCALAPPDATA%\Docker` |
| VS Code exts | move `%USERPROFILE%\.vscode\extensions` + junction | — |
| Electron/Chromium | `--user-data-dir` per app | varies |

## One-shot PowerShell to set the common ones

```powershell
$dst = "W:\caches"
foreach ($d in "npm","pip","cargo","go","gradle","hf") {
  New-Item -ItemType Directory -Force -Path "$dst\$d" | Out-Null }
setx TEMP "W:\Temp"; setx TMP "W:\Temp"
setx NPM_CONFIG_CACHE "$dst\npm"
setx PIP_CACHE_DIR    "$dst\pip"
setx CARGO_HOME       "$dst\cargo"
setx GOPATH           "$dst\go"
setx GRADLE_USER_HOME "$dst\gradle"
setx HF_HOME          "$dst\hf"
Write-Host "Set. Restart all shells/apps to apply."
```

## Move an existing cache without breaking a hardcoded path

```powershell
robocopy "C:\Users\me\.gradle" "W:\caches\gradle" /E /MOVE
mklink /J "C:\Users\me\.gradle" "W:\caches\gradle"
```

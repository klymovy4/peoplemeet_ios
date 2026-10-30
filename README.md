# PeopleMeet

Mobile app (iOS + Android) built with [Expo](https://expo.dev) (SDK 54), React Native and [Expo Router](https://docs.expo.dev/router/introduction).

- iOS map: Apple Maps (no key needed)
- Android map: Google Maps (needs `GOOGLE_MAPS_API_KEY`, see [Environment variables](#environment-variables))
- Bundle ID / package: `ua.com.peoplemeet`
- EAS project: [@kuiiuiii/peoplemeet](https://expo.dev/accounts/kuiiuiii/projects/peoplemeet)

---

## Daily workflow (iPhone + simulator)

Everyday development runs on a **development build** of the app (not Expo Go). The real iPhone and the simulator both connect to the same dev server on the Mac, and every saved file shows up on both instantly (Fast Refresh).

1. **Start the dev server** (keep this terminal open):

   ```bash
   cd ~/Documents/peoplemeet_ios/peoplemeet_ios
   npx expo start --dev-client
   ```

2. **iPhone**: make sure the iPhone and the Mac are on the **same Wi-Fi network**, then tap the **PeopleMeet** icon on the iPhone. It connects to the dev server automatically.

3. **Simulator**: press **`i`** in the dev server terminal. The simulator opens and launches the app.
   - `Shift + i` lets you pick a specific simulator model.
   - For your own marker to appear on the map, set a location in the simulator menu: **Features → Location → Custom Location…** (or **Apple**).

### `expo start` + `i` vs `expo run:ios`

These two do different things — don't use `run:ios` every day:

| Command | What it does | How long |
|---|---|---|
| `npx expo start --dev-client`, then `i` | Starts the dev server; `i` **opens the already installed** app in the simulator | Seconds |
| `npx expo run:ios` | **Builds** the app with Xcode, installs it in the simulator, launches it and starts the dev server | Slow: 10–20 min the first time on an Intel Mac, faster afterwards |

- **Every day**: `npx expo start --dev-client`, then `i` for the simulator and the PeopleMeet icon on the iPhone.
- **Only when a rebuild is needed** (see [below](#when-a-rebuild-is-needed)): `npx expo run:ios` (simulator) / `npx expo run:ios --device` (iPhone). Afterwards go back to `start` + `i`.
- `i` only works if the app is already installed in the simulator — otherwise it says *"No development build … is installed"* and you need `npx expo run:ios` once.
- Keep the simulator open between sessions: a cold boot of the iOS 26 simulator takes 30–60 s on an Intel Mac.

> Why it used to be faster: earlier the simulator ran **Expo Go**, a prebuilt app that only downloads the JS code. Now the simulator runs **our own development build**, which Xcode has to compile from source (React Native, maps, Reanimated, …) — but only when a rebuild is needed.

Useful keys in the dev server terminal:

| Key | Action |
|---|---|
| `i` | Open in the iOS simulator |
| `r` | Reload the app on all connected devices |
| `j` | Open the debugger |
| `m` | Toggle the developer menu |
| `s` | Switch between development build and Expo Go mode |
| `Ctrl + C` | Stop the server |

---

## When a rebuild is needed

JS/TS changes never need a rebuild. Rebuild the app only when:

- **7 days have passed** since the last iPhone install (the free Apple ID signing expires — the app stops opening on the iPhone);
- **`app.json` / `app.config.js` changed** (name, permissions, theme, plugins, …);
- **a library with native code was added or removed** (`npm install` of something like `react-native-*` / `expo-*`).

```bash
npx expo run:ios --device   # build and install on the iPhone (connect it with a cable)
npx expo run:ios            # build and install in the simulator
```

- With `--device`, pick the iPhone marked with 🔌 from the list.
- The first build takes 5–15 minutes, later ones are faster.
- If the command reports that port 8081 is in use, answer **No** — the app will connect to the dev server that is already running.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| iPhone can't connect to the dev server | Check that both are on the same Wi-Fi. If it still fails: `npx expo start --dev-client --tunnel` |
| Strange errors after changes / stale code | Restart with a cleared cache: `npx expo start --dev-client -c` |
| `Port 8081 is being used` | A server is already running somewhere — close that terminal, or `kill $(lsof -t -i:8081)` |
| Pressing `i` says *"No development build (ua.com.peoplemeet) for this project is installed"* | The simulator doesn't have the app yet — run `npx expo run:ios` once |
| The app on the iPhone doesn't open / closes immediately | The 7-day signing expired — run `npx expo run:ios --device` |
| *"Unable to launch … profile has not been explicitly trusted"* | On the iPhone: **Settings → General → VPN & Device Management** → your Apple ID → **Trust** |
| *"No code signing certificates are available"* | See [Xcode signing](#4-xcode-signing-free-apple-id) |
| `pod: command not found` / Expo tries to install CocoaPods with Homebrew | Run `source ~/.zshrc` or open a new terminal (see [CocoaPods](#3-cocoapods-intel-mac)) |
| *"Project is incompatible with this version of Expo Go"* on the iPhone | Expected: App Store Expo Go only supports the latest SDK. Use the development build instead (this README's workflow) |

---

## First-time setup (new Mac)

### 1. Requirements

- Node.js and npm
- Xcode (from the App Store) with iOS simulators
- An Apple ID (the one you use on your iPhone is fine — no paid developer account needed for development)

### 2. Install dependencies and env file

```bash
cd ~/Documents/peoplemeet_ios/peoplemeet_ios
npm install
cp .env.example .env
```

Then fill in `GOOGLE_MAPS_API_KEY` in `.env` (see [Environment variables](#environment-variables)).

### 3. CocoaPods (Intel Mac)

iOS builds need [CocoaPods](https://cocoapods.org). On an Intel Mac, `brew install cocoapods` is very slow (Homebrew compiles `llvm` and `rust` from source) and `gem install cocoapods` fails on the system Ruby 2.6. What works is installing an older CocoaPods for the system Ruby into the home folder, pinning dependency versions that still support Ruby 2.6:

```bash
# --conservative keeps the pinned versions below instead of pulling newer ones
g() { gem install --user-install --no-document --conservative "$@"; }
g zeitwerk -v 2.6.18
g ffi -v 1.16.3
g minitest -v 5.15.0
g public_suffix -v 4.0.7
g i18n -v 1.14.7
g concurrent-ruby -v 1.3.4   # newer versions break activesupport 6.1
g activesupport -v 6.1.7.10
g cocoapods -v 1.15.2
gem list concurrent-ruby     # must show only 1.3.4; otherwise:
                             # gem uninstall concurrent-ruby --user-install -v <newer version>

echo 'export PATH="$HOME/.gem/ruby/2.6.0/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
pod --version   # → 1.15.2
```

On an Apple Silicon Mac `brew install cocoapods` works fine instead.

### 4. Xcode signing (free Apple ID)

1. **Xcode → Settings… → Accounts → +** → **Apple ID** → sign in.
2. Select the account → **Manage Certificates… → + → Apple Development** → **Done**.
3. Generate the native project once, then set the team:

   ```bash
   npx expo prebuild -p ios     # or just run `npx expo run:ios --device` once
   open ios/PeopleMeet.xcworkspace
   ```

   In Xcode: **PeopleMeet** (project) → **TARGETS → PeopleMeet** → **Signing & Capabilities** → check **Automatically manage signing** → **Team**: *Your Name (Personal Team)*.

> The `ios/` folder is generated and git-ignored. If it is deleted, repeat step 3.

### 5. iPhone setup

1. Connect the iPhone with a cable and tap **Trust This Computer**.
2. Enable **Developer Mode**: **Settings → Privacy & Security → Developer Mode** → on (the iPhone restarts). It can stay on — it doesn't affect anything else.
3. Install the app: `npx expo run:ios --device`.
4. On first launch: **Settings → General → VPN & Device Management** → your Apple ID → **Trust**.

Limits of the free Apple ID: the install expires after **7 days** (rebuild with `npx expo run:ios --device`), and push notifications are not available. A paid Apple Developer account ($99/year) removes these limits and is required for TestFlight and the App Store.

### 6. Simulator

```bash
npx expo run:ios
```

After that, pressing `i` in the dev server is enough.

---

## Android

- **Live development**: install **Expo Go** from Google Play, start the server, press **`s`** to switch to Expo Go mode, then in Expo Go tap **Scan QR code** and scan the QR code from the terminal.
- **Test build (APK)** — a standalone app, does *not* update from code changes:

  ```bash
  eas build -p android --profile preview
  ```

  Open the link / QR code from the build output on the phone and install the `.apk`.

> Known issue: the user's own avatar marker is not visible on the Android map yet.

---

## Environment variables

Local values live in `.env` (git-ignored, template: `.env.example`):

| Variable | Purpose |
|---|---|
| `EXPO_PUBLIC_API_URL` | Backend API URL (default `https://peoplemeet.com.ua`) |
| `GOOGLE_MAPS_API_KEY` | Google Maps SDK for Android key, read by `app.config.js`. Without it the map is blank in Android builds |

EAS cloud builds don't see `.env`; there the key is stored as an EAS environment variable (already set for `development`, `preview` and `production`):

```bash
eas env:list --environment preview
```

**Google Maps key** — Google Cloud project `people-meet-f4c72`:

- Only **Maps SDK for Android** is enabled; the mobile Maps SDK is free (a billing account is still required to issue the key). A $1 budget alert is set up.
- The billing account is on a **Free Trial that ends on 2027-01-28**. Before that date open **Billing** and click **Activate full account**, otherwise Google stops the services and the Android map turns gray.
- TODO: restrict the key to **Android apps** with package `ua.com.peoplemeet` and the SHA-1 fingerprints from `eas credentials` (and from **Play Console → App integrity → App signing** once published).

---

## EAS builds and store release

Requires `npm install -g eas-cli` and `eas login`. Build profiles are in `eas.json`:

| Profile | Use |
|---|---|
| `development` | Development client, internal distribution |
| `preview` | Internal test builds (Android builds an `.apk`) |
| `production` | Store builds, build number auto-increments |

```bash
eas build -p android --profile preview      # test APK
eas build -p android --profile production   # Google Play (.aab)
eas build -p ios --profile production       # App Store / TestFlight (needs a paid Apple Developer account)
eas submit -p ios                           # upload to App Store Connect
eas submit -p android                       # upload to Google Play
```

Build status: https://expo.dev/accounts/kuiiuiii/projects/peoplemeet/builds

---

## Project structure

| Path | Contents |
|---|---|
| `app/` | Screens (file-based routing): login (`index.tsx`), `signup`, `recover-password`, `profile`, `map` |
| `components/` | Shared components: chat (`MessagesModal`), avatar cropping (`ImageCropModal`) |
| `services/` | API client, auth storage, polling, location tracking, sounds |
| `utils/`, `styles/`, `types/` | Helpers, map styles and shared types (kept outside `app/`: every file in `app/` is treated as a route) |
| `app.json`, `app.config.js` | Expo config (`app.config.js` adds the Google Maps key from env) |
| `eas.json` | EAS build profiles |

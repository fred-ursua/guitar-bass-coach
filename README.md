# Guitar & Bass Practice Lab

An offline-capable guitar and bass practice tool with a Tempo Builder, metronome, visual TAB composer, progress history, personal-best tracking, song slowdown, looping, and waveform selection.

## Use it locally

Open `index.html`. For install and offline support, serve the folder with a local web server.

## Publish with GitHub Pages

1. Create a public GitHub repository named `guitar-bass-coach`.
2. Upload every file in this folder to the root of the repository.
3. Open the repository's **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Select the `main` branch and `/ (root)`, then select **Save**.
6. GitHub will publish the app at `https://YOUR-USERNAME.github.io/guitar-bass-coach/`.

After updates, replace the repository files with the new release. The app's saved data remains in that browser as long as the repository name and Pages address stay unchanged.

Practice data is stored only in the current browser. Use **Progress → Export backup** regularly. Song audio remains on your device; the app stores song metadata, loop points and speed, then asks you to choose the audio file again after reopening.

Waveform controls: load an audio file, then drag across the waveform to set an A/B loop. Click to seek. The loop and playback speed are saved automatically.

The Practice screen includes a remembered metronome volume control. The default click is deliberately bright and prominent so it remains audible over an instrument or backing track.

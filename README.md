# 🧙‍♂️ Merlin Notes

> A fast, clean, and fully offline-capable AI-assisted note-taking application.

Merlin Notes is a focused thinking tool designed to help you capture ideas, journal, organize thoughts, and create. By blending a distraction-free UI with powerful AI integrations and freehand drawing, it adapts to how you think.

## ✨ Features

* **AI-Augmented Thinking:** Built-in AI tools (powered by OpenAI) to summarize, expand, brainstorm, translate, and extract tasks. Features dedicated AI Prompts and an AI Chat side-panel. Supports inline generation right within your text.
* **Rich Modalities:** * 📝 **Writing Mode:** Clean, block-based text editor with rich formatting (bold, strikethrough, highlight).
    * 🎨 **Drawing Mode:** Infinite canvas with ball pen, marker, laser pointer, and eraser tools.
    * 📅 **Global Calendar:** Organize and visualize your notes by date.
* **Local-First & PWA:** Built with Service Workers to work 100% offline. Install it as a Progressive Web App (PWA) on your desktop or mobile device.
* **Seamless Sync & Collaboration:** Secure cloud sync using custom Sync IDs/Keys. Share notes collaboratively or read-only via share codes.
* **Robust Organization:** Infinite folder nesting, custom sorting (by A-Z, creation date, modification date), and a built-in Trash system (auto-deletes after 7 days).
* **Highly Customizable:** * Automatic Dark/Light mode detection with a custom theme color picker.
    * Adjustable editor fonts, sizes, and toolbar positioning (Left, Right, Top, Bottom).
* **Security & History:** Note-locking via passwords and a robust Undo/Redo history manager.

## 🚀 Getting Started

Merlin Notes runs entirely in the browser using vanilla web technologies. 

1. **Host or Run Locally:** Serve the root directory using any basic HTTP server (e.g., Live Server, Python's `http.server`, or standard web hosting).
2. **Configure AI:** Open the **Settings** (gear icon) in the app and enter your OpenAI API Key. You can also configure your preferred model (default is `gpt-5-mini`) and reasoning effort.
3. **Set Up Sync (Optional):** Your data is saved locally by default. To sync across devices, generate or enter a Cloud Sync Credential (`<id>#<key>`) in the settings.

## 🛠️ Tech Stack

* **Frontend:** Vanilla HTML5, CSS3, and JavaScript.
* **Storage:** LocalStorage & IndexedDB (via custom `FileManager`/`DataController`), with optional secure server-side syncing.
* **APIs:** Integrates directly with OpenAI's API for chat and text generation.

## 🔒 Privacy & Security

Your data is yours. Merlin Notes is designed to be local-first. Notes are stored on your device, and cloud synchronization uses your unique, randomized Sync ID and Key. API calls to AI providers are made directly from your browser using the API key you provide.

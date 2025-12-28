# Local PDF Editor

A simple local PDF editor for macOS built with Electron and React.

## Features
- **Open** local PDF files securely (files stay on your device).
- **Edit Text:** Click on any existing text to modify it. The editor will automatically:
  - Create a text box with the existing content.
  - Cover the original text (Whiteout mode).
  - Match the approximate font size.
- **Add New Text:** Click on any empty space to add a new text box.
- **Save** the modified PDF to your computer.

## Installation

1. Install dependencies:
   ```bash
   npm install
   ```

## Running

1. Start the application:
   ```bash
   npm start
   ```

## How it works
- The editor uses a "patching" approach. It doesn't modify the underlying PDF content stream directly (which is complex and error-prone).
- Instead, when you "edit" text, it draws a white rectangle over the old text and places your new text on top.
- This ensures the original layout is preserved while allowing you to change names, dates, and other details effectively.

## Building for macOS

To create a standalone application:
```bash
npm run build
# You may need to add electron-builder for a proper .app bundle
```

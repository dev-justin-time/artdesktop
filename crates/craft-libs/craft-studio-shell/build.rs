fn main() {
    tauri_build::build();
}
```

**`crates/craft-studio-shell/tauri.conf.json`**
```json
{
  "productName": "ArtCraft Studio",
  "version": "0.1.0",
  "identifier": "com.storytold.artcraft",
  "build": {
    "beforeDevCommand": "npm run dev",
    "beforeBuildCommand": "npm run build",
    "frontendDist": "ui/dist",
    "devUrl": "http://localhost:1420"
  },
  "app": {
    "windows": [
      {
        "title": "ArtCraft Studio",
        "width": 1400,
        "height": 900,
        "resizable": true,
        "fullscreen": false
      }
    ],
    "security": {
      "csp": null
    }
  }
}

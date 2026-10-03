// Electron desktop entry point; GitHub Pages uses the HTML/CSS/browser scripts directly.
const { app, BrowserWindow, session } = require('electron');
const path = require('node:path');
const http = require('node:http');
const fs = require('node:fs');
let localServer, playerURL;
// A loopback-only page supplies the genuine HTTP origin/referrer required by YouTube embeds.
function startLocalPage() {
  const allowed = new Set(['index.html', 'model.js', 'media.js', 'renderer.js', 'styles.css', 'pipasentopng.png', 'odoplayerlogo_small.png', 'OdoPlayer_v15_Offline.html']);
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png' };
  localServer = http.createServer((request, response) => {
    const name = new URL(request.url, 'http://localhost').pathname.slice(1) || 'index.html';
    if (!allowed.has(name)) { response.writeHead(404).end(); return; }
    fs.readFile(path.join(__dirname, name), (error, data) => {
      if (error) { response.writeHead(404).end(); return; }
      response.setHeader('Content-Type', types[path.extname(name)]);
      response.setHeader('Cache-Control', 'no-store'); response.end(data);
    });
  });
  return new Promise((resolve, reject) => {
    localServer.once('error', reject);
    localServer.listen(0, '127.0.0.1', () => { playerURL = 'http://127.0.0.1:' + localServer.address().port; resolve(); });
  });
}
app.setName('OdoPlayer');

// Create the native window with a sandboxed renderer and load the local player interface.
function createWindow() {
  const win = new BrowserWindow({
    width: 1120, height: 820, minWidth: 660, minHeight: 580,
    title: 'OdoPlayer', backgroundColor: '#080a0e', autoHideMenuBar: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true }
  });
  // Keep playback in this window and prevent navigation to other pages.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
  win.loadURL(playerURL);
}
// Initialize the desktop session, deny unused permission requests, and support macOS app reactivation.
app.whenReady().then(async () => {
  await startLocalPage();
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(_permission === 'fullscreen'));
  createWindow();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on('will-quit', () => localServer?.close());
// Exit on Windows/Linux when all windows close; retain the usual macOS app lifecycle.
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

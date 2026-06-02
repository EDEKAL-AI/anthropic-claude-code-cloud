import { app, BrowserWindow, session } from 'electron'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { getDb } from './db/connection'
import { Repositories } from './db/repositories'
import { getMasterKey } from './security/secrets'
import { Supervisor } from './accounts/supervisor'
import { CampaignService } from './scheduler/campaign-service'
import { Scheduler } from './scheduler/scheduler'
import { AutoReplyEngine } from './autoreply/engine'
import { registerIpc } from './ipc'

const __dirname = dirname(fileURLToPath(import.meta.url))

let mainWindow: BrowserWindow | null = null
let supervisor: Supervisor | null = null
let scheduler: Scheduler | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      // contextIsolation + nodeIntegration:false are the load-bearing renderer-hardening
      // controls. sandbox is left off because the preload is bundled as ESM; to enable
      // sandbox, compile the preload to CommonJS and flip this to true.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function applyCsp(): void {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': ["default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'"]
      }
    })
  })
}

function bootstrap(): void {
  const db = getDb()
  const repos = new Repositories(db)
  const masterKey = getMasterKey(repos.settings)

  supervisor = new Supervisor(repos, masterKey)
  const campaigns = new CampaignService(repos)
  const autoReply = new AutoReplyEngine(repos, (accountId, jid, content) =>
    supervisor!.sendMessage(accountId, jid, content)
  )
  scheduler = new Scheduler(repos, supervisor)

  // Push live worker events to the renderer.
  supervisor.setPushHandler((event) => {
    mainWindow?.webContents.send('worker:event', event)
  })
  // Route incoming messages to the auto-reply engine.
  supervisor.setIncomingHandler((msg) => {
    void autoReply.handle(msg)
  })

  registerIpc({ repos, supervisor, campaigns })

  // Restore sessions for previously-linked accounts, then start the send loop.
  supervisor.startAll()
  scheduler.start()
}

app.whenReady().then(() => {
  applyCsp()
  bootstrap()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', async (e) => {
  if (supervisor) {
    e.preventDefault()
    scheduler?.stop()
    await supervisor.stopAll()
    supervisor = null
    app.quit()
  }
})

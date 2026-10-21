const {app,BrowserWindow}=require("electron");
const path=require("node:path");
const {pathToFileURL}=require("node:url");
app.whenReady().then(async()=>{
 process.env.NODE_ENV="production";
 await import(pathToFileURL(path.join(app.getAppPath(),"apps/server/dist/index.js")).href);
 setTimeout(()=>{const win=new BrowserWindow({fullscreen:true,autoHideMenuBar:true,webPreferences:{nodeIntegration:false,contextIsolation:true}});
 win.loadURL("http://localhost:3001/host");},1000);
});
app.on("window-all-closed",()=>app.quit());

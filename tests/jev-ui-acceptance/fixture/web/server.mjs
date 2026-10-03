#!/usr/bin/env node
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';

export function createFixtureServer({host='127.0.0.1', port=0}={}) {
  const root=dirname(fileURLToPath(import.meta.url));
  const server=createServer(async (request,response)=>{
    if (request.url !== '/' && request.url !== '/index.html') { response.writeHead(404); response.end('Not found'); return; }
    try { const html=await readFile(join(root,'index.html')); response.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}); response.end(html); }
    catch (error) { response.writeHead(500); response.end(String(error)); }
  });
  return {server, async start(){await new Promise((resolve,reject)=>{server.once('error',reject); server.listen(port,host,resolve);}); const address=server.address(); return `http://${host}:${address.port}/`;}, async stop(){if(server.listening) await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}};
}

if (process.argv[1]===fileURLToPath(import.meta.url)) {
  const fixture=createFixtureServer({port:Number(process.env.PORT)||0});
  const url=await fixture.start(); console.log(JSON.stringify({url}));
  const stop=()=>fixture.stop().finally(()=>process.exit(0)); process.once('SIGINT',stop); process.once('SIGTERM',stop);
}

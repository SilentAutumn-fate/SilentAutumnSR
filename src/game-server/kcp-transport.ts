import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';

/** The client's 4.7.51 game transport is UDP/KCP. Keep TCP for existing
 * handlers/tools; the adapter forwards complete, unchanged game frames.
 */
export function startKcpTransport(host: string, port: number): ChildProcess {
 const target = host === '0.0.0.0' ? '127.0.0.1' : host === '::' ? '::1' : host;
 const child = spawn(process.env.SASR_PYTHON || 'python', [
  path.resolve('runtime/kcp/bridge.py'), '--host',host,'--port',String(port),
  '--target',target,'--parent-pipe',
 ], {cwd:process.cwd(),stdio:['pipe','inherit','inherit'],windowsHide:true});
 let stopping=false;
 process.once('exit',()=>{stopping=true;child.stdin?.end();child.kill();});
 child.once('error',err=>{console.error(`[kcp] cannot start Python adapter: ${err.message}`);process.exit(1);});
 child.once('exit',(code,signal)=>{
  if(!stopping){console.error(`[kcp] adapter exited unexpectedly (${code ?? signal})`);process.exit(1);}
 });
 return child;
}

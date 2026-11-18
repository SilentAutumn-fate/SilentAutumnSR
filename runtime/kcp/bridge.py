"""4.7.51 UDP/KCP transport adapter to SASR's existing framed TCP handlers.
KCP implementation/handshake reference: lcxs1/hsr-local; licenses beside source.
"""
import argparse, asyncio, contextlib, time, sys
from kcp import KCP
import handshake
MAX_FRAME=255*(1200-28) # KCP message limit: 255 fragments at the selected MTU.
MAX_PENDING_BYTES=1024*1024
MAX_PENDING_SEGMENTS=256
class Session:
 def __init__(self,gateway,addr):
  self.gateway,self.addr=gateway,addr
  _,_,self.blob,conv=handshake.new_session_ids('u32_le_token')
  self.kcp=KCP(conv);self.kcp.setmtu(1200);self.kcp.wndsize(256,256);self.kcp.nodelay(1,10,2,1)
  self.kcp.output=lambda data:gateway.transport.sendto(data,addr)
  self.queue=asyncio.Queue(maxsize=256);self.pending_bytes=0;self.writer=None;self.last=time.monotonic();self.closed=False
  self.task=asyncio.create_task(self.relay())
 def feed(self,data):
  self.last=time.monotonic();self.kcp.input(data)
  while True:
   size=self.kcp.peeksize()
   if size<0:break
   if self.queue.full() or self.pending_bytes+size>MAX_PENDING_BYTES:
    print('[kcp] closing overloaded input session',self.addr,flush=True)
    asyncio.create_task(self.close());return
   frame=self.kcp.recv()
   if not frame:break
   if len(frame)>MAX_FRAME:raise ValueError('oversized KCP frame')
   self.queue.put_nowait(frame);self.pending_bytes+=len(frame)
 async def output_capacity(self,frame_size):
  needed=(frame_size+1171)//1172
  while self.kcp.waitsnd()+needed>MAX_PENDING_SEGMENTS:await asyncio.sleep(.01)
 def tick(self):self.kcp.update(int(time.monotonic()*1000)&0xffffffff)
 async def relay(self):
  try:
   reader,self.writer=await asyncio.open_connection(self.gateway.target,self.gateway.port)
   async def upstream():
    while True:
     frame=await self.queue.get();self.pending_bytes-=len(frame)
     self.writer.write(frame);await self.writer.drain()
   upstream_task=asyncio.create_task(upstream())
   try:
    while True:
     head=await reader.readexactly(12)
     if head[:4]!=bytes.fromhex('9d74c714'):raise ValueError('invalid TCP frame magic')
     size=int.from_bytes(head[6:8],'big')+int.from_bytes(head[8:12],'big')+4
     if size+12>MAX_FRAME:raise ValueError('frame exceeds KCP fragmentation limit')
     tail=await reader.readexactly(size)
     if tail[-4:]!=bytes.fromhex('d7a152c8'):raise ValueError('invalid frame tail')
     await asyncio.wait_for(self.output_capacity(len(head)+len(tail)),30)
     self.kcp.send(head+tail);self.tick()
   finally:
    upstream_task.cancel()
    with contextlib.suppress(asyncio.CancelledError):await upstream_task
  except (asyncio.IncompleteReadError,ConnectionError):pass
  except asyncio.CancelledError:raise
  except Exception as exc:print('[kcp] relay error:',exc,flush=True)
  finally:
   self.closed=True
   if self.writer:self.writer.close()
   if self.gateway.sessions.get(self.addr) is self:self.gateway.sessions.pop(self.addr,None)
 async def close(self):
  self.closed=True;self.task.cancel()
  with contextlib.suppress(asyncio.CancelledError):await self.task
class Gateway(asyncio.DatagramProtocol):
 def __init__(self,target,port):self.target,self.port=target,port;self.sessions={};self.transport=None;self.ticker=None
 def connection_made(self,transport):self.transport=transport;self.ticker=asyncio.create_task(self.tick())
 def datagram_received(self,data,addr):
  try:
   if handshake.looks_like_request(data):
    packet=handshake.parse(data)
    if packet.code==handshake.DISCONNECT:
     if addr in self.sessions:asyncio.create_task(self.sessions[addr].close())
     return
    session=self.sessions.get(addr)
    if not session or session.closed:
     if len(self.sessions)>=64:return
     session=self.sessions[addr]=Session(self,addr)
     print('[kcp] handshake from',addr,flush=True)
    self.transport.sendto(handshake.build_response(session.blob),addr)
   elif addr in self.sessions:self.sessions[addr].feed(data)
  except Exception as exc:print('[kcp] invalid datagram:',exc,flush=True)
 async def tick(self):
  while True:
   for session in list(self.sessions.values()):
    if time.monotonic()-session.last>120:await session.close()
    else:session.tick()
   await asyncio.sleep(.01)
 async def close(self):
  if self.ticker:
   self.ticker.cancel()
   with contextlib.suppress(asyncio.CancelledError):await self.ticker
  for session in list(self.sessions.values()):await session.close()
async def main():
 parser=argparse.ArgumentParser();parser.add_argument('--host',default='127.0.0.1');parser.add_argument('--port',type=int,default=23301);parser.add_argument('--target',default='127.0.0.1');parser.add_argument('--parent-pipe',action='store_true');args=parser.parse_args()
 loop=asyncio.get_running_loop();gateway=Gateway(args.target,args.port)
 transport,_=await loop.create_datagram_endpoint(lambda:gateway,local_addr=(args.host,args.port))
 print(f'[kcp] UDP listening on {args.host}:{args.port}',flush=True)
 try:
  if args.parent_pipe:await asyncio.to_thread(sys.stdin.buffer.read)
  else:await asyncio.Future()
 finally:await gateway.close();transport.close()
if __name__=='__main__':asyncio.run(main())

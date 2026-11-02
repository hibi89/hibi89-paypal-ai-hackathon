"""Strict test-only CONNECT byte tunnel: Chromium -> 127.0.0.1 TLS.
No public bind, DNS, external dial, TLS termination, auth, payment or provider.
This module runs ONLY inside the offline Chromium test, not the Worker.
"""
import select
import socket
import socketserver
import threading

TARGET=b"CONNECT proofline.example.com:443 HTTP/1.1"
MAX_HEADER_BYTES=4096
IDLE_TIMEOUT_SECONDS=20

class _Handler(socketserver.BaseRequestHandler):
 def handle(self):
  downstream=self.request
  if self.client_address[0]!="127.0.0.1":
   downstream.close()
   return
  try:
   downstream.settimeout(8)
   packet=bytearray()
   while b"\r\n\r\n" not in packet:
    data=downstream.recv(2048)
    if not data or len(packet)+len(data)>MAX_HEADER_BYTES:return
    packet.extend(data)
   header,tail=bytes(packet).split(b"\r\n\r\n",1)
   if header.split(b"\r\n",1)[0]!=TARGET:
    downstream.sendall(b"HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n")
    return
   # The only network destination is an explicitly pre-opened Node TLS server
   # on loopback, with an OS-assigned port. Never trust browser CONNECT targets.
   with socket.create_connection(("127.0.0.1",self.server.tls_port),timeout=8) as upstream:
    downstream.sendall(b"HTTP/1.1 200 Connection Established\r\n\r\n")
    downstream.settimeout(None)
    upstream.settimeout(None)
    if tail:upstream.sendall(tail)
    while True:
     ready,_,_=select.select([downstream,upstream],[],[],IDLE_TIMEOUT_SECONDS)
     if not ready:return
     for source in ready:
      data=source.recv(65536)
      if not data:return
      (upstream if source is downstream else downstream).sendall(data)
  except (ConnectionError,OSError,ValueError):
   # Browser cancellation is only a closed individual tunnel; listener stays
   # healthy. Never retry authentication, OAuth callbacks, POSTs or payments.
   return

class _BoundServer(socketserver.ThreadingMixIn,socketserver.TCPServer):
 daemon_threads=True
 block_on_close=False
 allow_reuse_address=False
 request_queue_size=24

class LocalLoopbackConnectProxy:
 def __init__(self,tls_port):
  if not isinstance(tls_port,int) or not (1024<=tls_port<=65535):
   raise ValueError("LOCAL_TLS_PORT_REQUIRED")
  self._server=_BoundServer(("127.0.0.1",0),_Handler)
  self._server.tls_port=tls_port
  self._thread=None
  self.port=self._server.server_address[1]
 def start(self):
  if self._thread is not None:raise RuntimeError("PROXY_ALREADY_STARTED")
  self._thread=threading.Thread(target=self._server.serve_forever,
   daemon=True,name="offline-loopback-connect-proxy")
  self._thread.start()
  return self
 def close(self):
  if self._thread is not None:
   self._server.shutdown()
   self._thread.join(timeout=3)
   self._thread=None
  self._server.server_close()

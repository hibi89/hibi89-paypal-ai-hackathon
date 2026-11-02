"""No external HTTP/IdP: strict loopback-only proxy contract tests."""
import socket
import socketserver
import threading
import unittest
from local_loopback_connect_proxy import LocalLoopbackConnectProxy

def headers(sock):
 data=b""
 while b"\r\n\r\n" not in data:
  part=sock.recv(2048)
  if not part:break
  data+=part
  if len(data)>4096:raise AssertionError("TOO_MANY_PROXY_HEADER_BYTES")
 return data

class _Echo(socketserver.BaseRequestHandler):
 def handle(self):
  try:
   data=self.request.recv(100)
   if data:self.request.sendall(data)
  except OSError:pass

class LoopbackProxyTests(unittest.TestCase):
 def setUp(self):
  self.backend=socketserver.TCPServer(("127.0.0.1",0),_Echo)
  self.worker=threading.Thread(target=self.backend.serve_forever,daemon=True)
  self.worker.start()
  self.proxy=LocalLoopbackConnectProxy(self.backend.server_address[1]).start()
 def tearDown(self):
  self.proxy.close()
  self.backend.shutdown()
  self.backend.server_close()
  self.worker.join(timeout=2)
 def dial(self):
  s=socket.create_connection(("127.0.0.1",self.proxy.port),timeout=3)
  s.settimeout(3)
  return s
 def test_unapproved_host_and_ordinary_http_are_denied(self):
  for request in [
   b"CONNECT evil.example.com:443 HTTP/1.1\r\n\r\n",
   b"CONNECT proofline.example.com:80 HTTP/1.1\r\n\r\n",
   b"GET http://proofline.example.com/ HTTP/1.1\r\n\r\n"
  ]:
   with self.dial() as client:
    client.sendall(request)
    self.assertTrue(headers(client).startswith(b"HTTP/1.1 403 Forbidden"))
 def test_approved_host_forwards_exact_bytes_without_terminating_tls(self):
  with self.dial() as client:
   client.sendall(b"CONNECT proofline.example.com:443 HTTP/1.1\r\nHost: proofline.example.com:443\r\n\r\n")
   self.assertTrue(headers(client).startswith(b"HTTP/1.1 200 Connection Established"))
   client.sendall(b"ORIGINAL_TLS_PAYLOAD")
   self.assertEqual(client.recv(100),b"ORIGINAL_TLS_PAYLOAD")
 def test_early_unparsed_disconnect_does_not_kill_proxy(self):
  with self.dial():pass # Not a CONNECT; no TLS tunnel is opened.
  with self.dial() as client:
   client.sendall(b"CONNECT wrong.example:443 HTTP/1.1\r\n\r\n")
   self.assertTrue(headers(client).startswith(b"HTTP/1.1 403 Forbidden"))

if __name__=="__main__":unittest.main()

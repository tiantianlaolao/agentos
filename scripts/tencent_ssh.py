#!/usr/bin/env python3
"""Helper: execute commands on Tencent Cloud server via SOCKS5 proxy."""
import sys
import paramiko
import socks

PROXY_HOST = '129.211.168.244'
PROXY_PORT = 1080
PROXY_USER = 'wangsisi'
PROXY_PASS = 'Myu4wubS8b'

SSH_HOST = '129.211.168.244'
SSH_PORT = 22
SSH_USER = 'skingway'
SSH_PASS = '1q2w#E$R%T'

def run(cmd, timeout=120):
    sock = socks.socksocket()
    sock.set_proxy(socks.SOCKS5, PROXY_HOST, PROXY_PORT, username=PROXY_USER, password=PROXY_PASS)
    sock.settimeout(30)
    sock.connect((SSH_HOST, SSH_PORT))

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(SSH_HOST, port=SSH_PORT, username=SSH_USER, password=SSH_PASS, sock=sock, timeout=30)

    stdin, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode()
    err = stderr.read().decode()
    code = stdout.channel.recv_exit_status()
    client.close()
    return out, err, code

if __name__ == '__main__':
    cmd = ' '.join(sys.argv[1:]) if len(sys.argv) > 1 else 'echo hello'
    out, err, code = run(cmd)
    if out:
        print(out, end='')
    if err:
        print(err, end='', file=sys.stderr)
    sys.exit(code)

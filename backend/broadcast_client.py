"""Small helper to POST a broadcast message to the server.

Usage:
    python broadcast_client.py http://<server_ip>:8000 "Hello everyone"
"""
import sys
import requests


def main():
    if len(sys.argv) < 3:
        print("Usage: python broadcast_client.py http://<server_ip>:8000 \"message\"")
        return
    base = sys.argv[1].rstrip("/")
    msg = sys.argv[2]
    url = f"{base}/broadcast"
    try:
        r = requests.post(url, json={"message": msg}, timeout=5)
        print(r.text)
    except Exception as e:
        print("Error sending broadcast:", e)


if __name__ == "__main__":
    main()

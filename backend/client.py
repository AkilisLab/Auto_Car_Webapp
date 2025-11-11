"""Async WebSocket client for connecting to the FastAPI server.

Usage:
    python client.py ws://<server_ip>:8000/ws

Type messages and press ENTER to send. Type `exit` or `quit` to close.
"""
import asyncio
import sys
import websockets


async def client(uri: str):
    async with websockets.connect(uri) as ws:
        print(f"Connected to {uri}")

        async def receiver():
            try:
                async for message in ws:
                    print(f"< {message}")
            except Exception:
                pass

        recv_task = asyncio.create_task(receiver())

        try:
            loop = asyncio.get_event_loop()
            while True:
                # read from stdin without blocking the event loop
                msg = await loop.run_in_executor(None, sys.stdin.readline)
                if not msg:
                    break
                msg = msg.strip()
                if msg.lower() in ("exit", "quit"):
                    break
                await ws.send(msg)
        except KeyboardInterrupt:
            pass
        finally:
            recv_task.cancel()


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python client.py ws://<server_ip>:8000/ws")
        sys.exit(1)
    uri = sys.argv[1]
    asyncio.run(client(uri))

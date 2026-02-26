from fastapi import FastAPI
from backend import app

for route in app.routes:
    if hasattr(route, "path"):
        if "login" in route.path:
            print(f"{route.methods} {route.path}")

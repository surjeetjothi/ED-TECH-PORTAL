import re

with open("app/routers/auth.py", "r") as f:
    content = f.read()

# Replace @app.post("/api/auth/...") with @router.post("/...")
content = re.sub(r'@app\.(post|get|put|delete)\("/api/auth(.*?)"', r'@router.\1("\2"', content)

# If the result was @router.post(""), it means the endpoint was exactly /api/auth.
# In FastAPI, router prefix + "" = /api/auth, but typically people use "/" if it's the root.
content = re.sub(r'@router\.(post|get|put|delete)\(""\)', r'@router.\1("/")', content)

with open("app/routers/auth.py", "w") as f:
    f.write(content)

import re

with open("app/routers/auth.py", "r") as f:
    content = f.read()

# Make the router have no prefix. This way, any URLs inside this file are verbatim.
content = content.replace('router = APIRouter(prefix="/api/auth", tags=["Authentication"])',
                          'router = APIRouter(tags=["Authentication"])')

# The previous script replaced @app.post("/api/auth/login") with @router.post("/login").
# Let's revert it back to the full explicit paths.
content = re.sub(r'@router\.([a-z]+)\("/([^a].*?)"\)', r'@router.\1("/api/auth/\2")', content)

# But what if something was just @router.post("")? That meant /api/auth.
content = re.sub(r'@router\.([a-z]+)\(""\)', r'@router.\1("/api/auth")', content)

# Some routes left over in the extraction block like @app.post("/api/admin...")
# need to become @router.post("/api/admin...")
content = re.sub(r'@app\.', r'@router.', content)

with open("app/routers/auth.py", "w") as f:
    f.write(content)

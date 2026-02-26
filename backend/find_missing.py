import ast
import builtins

with open("app/routers/auth.py") as f:
    code = f.read()

tree = ast.parse(code)
defined = set(dir(builtins))
used = set()

# simplistic pass
for node in ast.walk(tree):
    if isinstance(node, ast.Import):
        for n in node.names: defined.add(n.name.split('.')[0])
    elif isinstance(node, ast.ImportFrom):
        if node.module:
            for n in node.names: defined.add(n.name)
    elif isinstance(node, ast.FunctionDef) or isinstance(node, ast.ClassDef) or isinstance(node, ast.AsyncFunctionDef):
        defined.add(node.name)
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            for arg in node.args.args:
                defined.add(arg.arg)
            if node.args.kwarg: defined.add(node.args.kwarg.arg)
            if node.args.vararg: defined.add(node.args.vararg.arg)
    elif isinstance(node, ast.Name):
        if isinstance(node.ctx, ast.Store):
            defined.add(node.id)
        elif isinstance(node.ctx, ast.Load):
            used.add(node.id)

missing = used - defined

# filter out common false positives simply
missing = {m for m in missing if not m.startswith('__') and m not in ('self', 'cls')}
print("POTENTIALLY MISSING:")
for m in sorted(missing):
    print(m)
